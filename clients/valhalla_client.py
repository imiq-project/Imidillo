"""
Valhalla routing client — a SECOND source of route path geometry for the map.

The IMIQ router gives distance/duration but no shape, and OpenRouteService
(the original shape provider) has bad days: 15-30 s per call or timeouts, which
leaves the map with a dashed straight line. The routing server asks ORS and
Valhalla in parallel and keeps whichever answers first (see
routing_server._route_geometry), so a slow provider costs nothing.

Default endpoint: the public FOSSGIS Valhalla instance
(https://valhalla1.openstreetmap.de) — no key, fair use (light, non-commercial,
descriptive User-Agent), bounded here to Magdeburg and behind a TTL cache. Point
VALHALLA_URL at a self-hosted instance for anything heavier; empty disables it.

The shape comes back as a precision-5 encoded polyline — the same compact form
the ORS client returns (Valhalla's native shape is precision 6; it is decoded
and re-encoded here) — so everything downstream stays provider-agnostic:
api.py decodes it at card-build time, and it never bloats the agent's context.

COORDINATE ORDER: callers pass `lat, lon` (Coordinates); Valhalla's JSON uses
named lat/lon fields, no GeoJSON ordering pitfalls.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, Optional

import httpx

from clients.ors_client import _decode_polyline
from models import Coordinates

try:
    from services.thresholds import CACHE_TTL_SECONDS as _DEFAULT_CACHE_TTL
except Exception:  # pragma: no cover
    _DEFAULT_CACHE_TTL = 1800

_USER_AGENT = "Dashbot-Magdeburg-Assistant/1.0 (OVGU IMIQ project)"

# Dashbot mode -> Valhalla costing model.
_PROFILES = {"walking": "pedestrian", "cycling": "bicycle", "driving": "auto"}

_MAG_LAT_MIN, _MAG_LAT_MAX = 52.05, 52.20
_MAG_LON_MIN, _MAG_LON_MAX = 11.55, 11.75


def _in_magdeburg(lat: float, lon: float) -> bool:
    try:
        return (_MAG_LAT_MIN <= float(lat) <= _MAG_LAT_MAX
                and _MAG_LON_MIN <= float(lon) <= _MAG_LON_MAX)
    except (TypeError, ValueError):
        return False


def _encode_polyline(coords, precision: int = 5) -> str:
    """Encode [[lat, lon], ...] as a Google/ORS-style polyline (default
    precision 5) — the inverse of ors_client._decode_polyline."""
    factor = 10 ** precision
    out = []
    prev_lat = prev_lng = 0
    for lat, lng in coords:
        ilat, ilng = int(round(lat * factor)), int(round(lng * factor))
        for delta in (ilat - prev_lat, ilng - prev_lng):
            v = ~(delta << 1) if delta < 0 else (delta << 1)
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        prev_lat, prev_lng = ilat, ilng
    return "".join(out)


class _TTLCache:
    def __init__(self, ttl_seconds: float) -> None:
        self.ttl = ttl_seconds
        self._store: Dict[tuple, tuple] = {}
        self._lock = threading.Lock()

    def get(self, key):
        now = time.monotonic()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expiry, value = entry
            if expiry < now:
                self._store.pop(key, None)
                return None
            return value

    def put(self, key, value):
        with self._lock:
            self._store[key] = (time.monotonic() + self.ttl, value)


class ValhallaClient:
    """Sync client for a Valhalla `/route` endpoint, bounded to Magdeburg.
    Every method returns a dict and never raises."""

    _shared_client: Optional[httpx.Client] = None
    _shared_lock = threading.Lock()

    def __init__(self, base_url: str, timeout_s: float = 6.0):
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self._cache = _TTLCache(_DEFAULT_CACHE_TTL or 1800)

    @classmethod
    def _client(cls, timeout_s: float) -> httpx.Client:
        with cls._shared_lock:
            if cls._shared_client is None or cls._shared_client.is_closed:
                cls._shared_client = httpx.Client(
                    headers={"User-Agent": _USER_AGENT, "Accept-Encoding": "gzip"},
                    timeout=httpx.Timeout(connect=3.0, read=timeout_s, write=3.0, pool=3.0),
                    limits=httpx.Limits(max_keepalive_connections=6, max_connections=12),
                )
            return cls._shared_client

    def get_route(self, start: Coordinates, end: Coordinates,
                  profile: str = "walking") -> Dict[str, Any]:
        """Route shape (+ Valhalla's own distance/duration, informational) for
        one mode. ``{"success": True, "geometry": <polyline5>, ...}`` or
        ``{"success": False, "error": ...}``."""
        costing = _PROFILES.get(profile)
        if costing is None:
            return {"success": False, "error": f"unknown profile {profile!r}"}
        if not (_in_magdeburg(start.lat, start.lon) and _in_magdeburg(end.lat, end.lon)):
            return {"success": False, "error": "coordinates outside Magdeburg bounds"}

        key = (costing, round(start.lat, 6), round(start.lon, 6), round(end.lat, 6), round(end.lon, 6))
        cached = self._cache.get(key)
        if cached is not None:
            return cached

        try:
            resp = self._client(self.timeout_s).post(
                f"{self.base_url}/route",
                json={
                    "locations": [{"lat": start.lat, "lon": start.lon},
                                  {"lat": end.lat, "lon": end.lon}],
                    "costing": costing,
                    "units": "kilometers",
                },
            )
        except httpx.TimeoutException:
            return {"success": False, "error": "Valhalla request timed out"}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "error": f"Valhalla request failed: {exc}"}
        if resp.status_code != 200:
            return {"success": False, "error": f"Valhalla HTTP {resp.status_code}"}
        try:
            trip = resp.json().get("trip") or {}
            legs = trip.get("legs") or []
            shape = legs[0].get("shape") if legs and isinstance(legs[0], dict) else None
            summary = trip.get("summary") or {}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "error": f"Valhalla returned unexpected JSON: {exc}"}
        if not shape:
            return {"success": False, "error": "Valhalla returned no shape"}

        points = _decode_polyline(shape, 6)
        if len(points) < 2 or not _in_magdeburg(points[0][0], points[0][1]):
            return {"success": False, "error": "Valhalla shape unusable"}

        result = {
            "success": True,
            "profile": profile,
            "geometry": _encode_polyline(points, 5),
            "distance_meters": round(float(summary.get("length", 0) or 0) * 1000),
            "duration_seconds": round(float(summary.get("time", 0) or 0)),
            "source": "valhalla",
        }
        self._cache.put(key, result)
        return result

    def close(self) -> None:
        pass  # shared client lives for the process lifetime


if __name__ == "__main__":
    import sys
    from config import VALHALLA_URL
    from clients.ors_client import decode_geometry

    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    c = ValhallaClient(VALHALLA_URL or "https://valhalla1.openstreetmap.de")
    a = Coordinates(lat=52.141220, lon=11.654976)   # IMIQ office
    b = Coordinates(lat=52.139529, lon=11.647572)   # Mensa Uni
    for mode in ("walking", "cycling", "driving"):
        t0 = time.time()
        res = c.get_route(a, b, mode)
        pts = decode_geometry(res.get("geometry")) if res.get("success") else None
        print(f"{mode}: {'OK' if res.get('success') else res.get('error')} in {time.time() - t0:.1f}s, "
              f"points={len(pts) if pts else 0}, first={pts[0] if pts else None}")
