"""
Configuration module for the Magdeburg Campus Assistant.
Loads environment variables and exposes constants for all external
services (FIWARE, OpenAI, Neo4j, ORS) and the LangGraph agent.
"""

import os
import threading
from pathlib import Path
from typing import Any, Optional
from dotenv import load_dotenv

env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)


def _env(name: str, default: str = "") -> str:
    """os.getenv with the value trimmed: keys are usually pasted into .env by
    hand, and a stray leading/trailing space (or a quoted value) must not turn
    into an authentication failure."""
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1].strip()
    return value


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in ("true", "1", "yes")


def _parse_int(value: str, default: int) -> int:
    try:
        return int(value)
    except (ValueError, TypeError):
        print(f"WARNING: Invalid integer value '{value}', using default {default}")
        return default


def _parse_float(value: str, default: float) -> float:
    try:
        return float(value)
    except (ValueError, TypeError):
        print(f"WARNING: Invalid float value '{value}', using default {default}")
        return default


# ---------------------------------------------------------------------------
# External services
# ---------------------------------------------------------------------------
FIWARE_BASE_URL = _env("FIWARE_BASE_URL", "https://imiq-public.et.uni-magdeburg.de/api/orion")
FIWARE_API_KEY = _env("FIWARE_API_KEY", "")

OPENAI_API_KEY = _env("OPENAI_API_KEY", "")
OPENAI_BASE_URL = _env("OPENAI_BASE_URL", "https://api.openai.com/v1")

NEO4J_URI = _env("NEO4J_URI", "neo4j://127.0.0.1:7687")
NEO4J_USERNAME = _env("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = _env("NEO4J_PASSWORD", "")
NEO4J_DATABASE = _env("NEO4J_DATABASE", "neo4j")

ORS_API_KEY = _env("ORS_API_KEY", "")
ORS_BASE_URL = _env("ORS_BASE_URL", "https://api.openrouteservice.org")

# Second route-SHAPE provider for the map (raced against ORS; first answer
# wins). Default: the public FOSSGIS Valhalla instance (no key, fair use).
# Empty disables it.
VALHALLA_URL = _env("VALHALLA_URL", "https://valhalla1.openstreetmap.de")

# IMIQ ranked-routes API (GraphHopper-backed) — walking/cycling/driving routes.
IMIQ_ROUTING_URL = _env(
    "IMIQ_ROUTING_URL", "https://imiq-app.et.uni-magdeburg.de/api/routing"
)

# Geocoder fallback chain for off-graph place names: the in-house IMIQ
# geocoder first, then Nominatim (OSM) as the backup tier.
IMIQ_GEOCODE_URL = _env(
    "IMIQ_GEOCODE_URL", "https://imiq-public.et.uni-magdeburg.de/api/geocode"
)
NOMINATIM_URL = _env("NOMINATIM_URL", "https://nominatim.openstreetmap.org")

# City events feed (Magdeburg event calendar scraped into the IMIQ platform).
IMIQ_EVENTS_URL = _env(
    "IMIQ_EVENTS_URL", "https://imiq-public.et.uni-magdeburg.de/api/events"
)


# ---------------------------------------------------------------------------
# Application settings
# ---------------------------------------------------------------------------
EMBEDDING_MODEL = _env("EMBEDDING_MODEL", "BAAI/bge-base-en-v1.5")
MAX_CONVERSATION_HISTORY = _parse_int(_env("MAX_CONVERSATION_HISTORY", "6"), 6)
HTTP_TIMEOUT = _parse_int(_env("HTTP_TIMEOUT", "10"), 10)

MAGDEBURG_LAT = _parse_float(_env("MAGDEBURG_LAT", "52.1205"), 52.1205)
MAGDEBURG_LON = _parse_float(_env("MAGDEBURG_LON", "11.6276"), 11.6276)


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
SINGLE_AGENT_MODEL = _env("SINGLE_AGENT_MODEL", "gpt-5.4-thinking")
AGENT_TIMEOUT = _parse_int(_env("AGENT_TIMEOUT", "90"), 90)  # wall-clock seconds
AGENT_VERBOSE_LOGGING = _parse_bool(_env("AGENT_VERBOSE_LOGGING", "false"))


# ---------------------------------------------------------------------------
# Semantic cache
# ---------------------------------------------------------------------------
SEMANTIC_CACHE_ENABLED = _parse_bool(_env("SEMANTIC_CACHE_ENABLED", "true"))
SEMANTIC_CACHE_THRESHOLD = _parse_float(_env("SEMANTIC_CACHE_THRESHOLD", "0.88"), 0.88)
SEMANTIC_CACHE_TTL = _parse_int(_env("SEMANTIC_CACHE_TTL", "3600"), 3600)
SEMANTIC_CACHE_MAX_SIZE = _parse_int(_env("SEMANTIC_CACHE_MAX_SIZE", "500"), 500)


# ---------------------------------------------------------------------------
# Voice (ElevenLabs) — optional. When ELEVENLABS_API_KEY is empty the /voice/*
# endpoints return 503 and spoken replies are simply SILENT (no backup voice —
# the browser speechSynthesis fallback was removed by design; STT still works
# via the browser). The key lives server-side ONLY; the browser never talks
# to ElevenLabs directly (api.py proxies it).
# ---------------------------------------------------------------------------
ELEVENLABS_API_KEY = _env("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = _env("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")  # "Adam" (premade, multilingual)
# eleven_v3: the expressive tier — supports inline audio tags ([sighs],
# [laughs], [pause]) that the voice-mode prompt asks the agent to sprinkle in.
# Higher first-sound latency than flash_v2_5 (~1.5-3s vs sub-second), masked
# by the ack clips. Swap back to eleven_flash_v2_5 for the lowest latency
# (tags are then stripped from display but read aloud — keep them together).
# NOTE: v3 does not accept previous_text (the client omits it automatically).
ELEVENLABS_TTS_MODEL = _env("ELEVENLABS_TTS_MODEL", "eleven_v3")
ELEVENLABS_STT_MODEL = _env("ELEVENLABS_STT_MODEL", "scribe_v2")
# v3 stability: 0.0 "Creative" (most expressive, most variable) · 0.5 "Natural"
# · 1.0 "Robust" (most consistent tone across generations, least responsive to
# audio tags). Raise toward 1.0 if the voice's mood jumps between sentences.
ELEVENLABS_TTS_STABILITY = _parse_float(_env("ELEVENLABS_TTS_STABILITY", "0.5"), 0.5)
# Fast model for the spoken REACTIONS ("Ooh, the Mensa, one sec") so they are
# heard almost instantly; answers keep the expressive ELEVENLABS_TTS_MODEL.
ELEVENLABS_TTS_FAST_MODEL = _env("ELEVENLABS_TTS_FAST_MODEL", "eleven_flash_v2_5")

# Spoken-reaction side call (voice turns only, services/voice_reaction.py): a
# tiny LLM call that reacts to what the user SAID while the agent looks things
# up. Defaults to the agent model with minimal reasoning; empty model disables.
VOICE_REACTION_MODEL = _env("VOICE_REACTION_MODEL", SINGLE_AGENT_MODEL)
VOICE_REACTION_REASONING = _env("VOICE_REACTION_REASONING", "none")  # gpt-5.4: none|low|medium|high; "" = don't send
VOICE_REACTION_TIMEOUT = _parse_float(_env("VOICE_REACTION_TIMEOUT", "4"), 4.0)


# ---------------------------------------------------------------------------
# Study mode — a fixed "you are here" (optional)
# ---------------------------------------------------------------------------
# For user studies run indoors at one known place (GPS is useless inside, and
# a shared study laptop has no sensible position): when STUDY_LOCATION_LAT and
# STUDY_LOCATION_LON are set, every chat turn is anchored on that point,
# whatever the browser sent. The agent treats it as the user's shared
# location, so a route question with no stated origin starts THERE (no "from
# where?" round-trip) and "near me" means near there; the widget's
# Share-location button reports it as the position without touching the
# browser's geolocation. Leave both empty for real GPS. Restart api.py after
# changing them.
def _parse_optional_float(value: str):
    try:
        return float(value) if value and value.strip() else None
    except (ValueError, TypeError):
        print(f"WARNING: Invalid float value '{value}', ignoring")
        return None


STUDY_LOCATION_LAT = _parse_optional_float(_env("STUDY_LOCATION_LAT", ""))
STUDY_LOCATION_LON = _parse_optional_float(_env("STUDY_LOCATION_LON", ""))
STUDY_LOCATION_NAME = _env("STUDY_LOCATION_NAME", "")
STUDY_LOCATION = None
if STUDY_LOCATION_LAT is not None and STUDY_LOCATION_LON is not None:
    if 52.05 <= STUDY_LOCATION_LAT <= 52.20 and 11.55 <= STUDY_LOCATION_LON <= 11.75:
        STUDY_LOCATION = (STUDY_LOCATION_LAT, STUDY_LOCATION_LON)
    else:
        print("WARNING: STUDY_LOCATION_LAT/LON are outside Magdeburg (lat 52.05-52.20, "
              "lon 11.55-11.75) - study mode ignored.")


# ---------------------------------------------------------------------------
# Optional infrastructure
# ---------------------------------------------------------------------------
# Distributed rate limiter backend (optional; falls back to in-memory if empty)
REDIS_URL = _env("REDIS_URL", "")


# ---------------------------------------------------------------------------
# Embedding encoder singleton (L10)
# ---------------------------------------------------------------------------
# SentenceTransformer models are expensive to load (150+ MB, 2-5 s init).
# A process-wide lazy singleton with double-checked locking guarantees we
# load the model exactly once across every service that needs embeddings
# (currently the semantic cache).
_encoder: Optional[Any] = None
_encoder_lock = threading.Lock()


def get_encoder() -> Any:
    """Return the process-wide SentenceTransformer instance.

    Loads the model on first call under a lock; subsequent calls are
    lock-free. Safe to call from worker threads and async contexts.
    Callers should treat the returned object as read-only.
    """
    global _encoder
    if _encoder is None:
        with _encoder_lock:
            if _encoder is None:
                print(f"Loading embedding model ({EMBEDDING_MODEL})...")
                from sentence_transformers import SentenceTransformer
                _encoder = SentenceTransformer(EMBEDDING_MODEL)
    return _encoder


def validate_config() -> bool:
    required_vars = {
        "FIWARE_API_KEY": FIWARE_API_KEY,
        "OPENAI_API_KEY": OPENAI_API_KEY,
        "NEO4J_PASSWORD": NEO4J_PASSWORD,
        "ORS_API_KEY": ORS_API_KEY,
    }

    missing = [key for key, value in required_vars.items() if not value]

    if missing:
        print("WARNING: Missing required environment variables:")
        for var in missing:
            print(f"   - {var}")
        print("\nCreate a .env file with these variables or set them in your environment.")
        print("   See .env.example for a template.\n")
        return False

    return True


if __name__ != "__main__":
    validate_config()


if __name__ == "__main__":
    print("=" * 60)
    print("Configuration Settings")
    print("=" * 60)

    print("\nFIWARE:")
    print(f"   Base URL: {FIWARE_BASE_URL}")
    print(f"   API Key: {'Set' if FIWARE_API_KEY else 'Missing'}")

    print("\nOpenAI:")
    print(f"   Base URL: {OPENAI_BASE_URL}")
    print(f"   API Key: {'Set' if OPENAI_API_KEY else 'Missing'}")

    print("\nNeo4j:")
    print(f"   URI: {NEO4J_URI}")
    print(f"   Username: {NEO4J_USERNAME}")
    print(f"   Password: {'Set' if NEO4J_PASSWORD else 'Missing'}")
    print(f"   Database: {NEO4J_DATABASE}")

    print("\nOpenRouteService:")
    print(f"   Base URL: {ORS_BASE_URL}")
    print(f"   API Key: {'Set' if ORS_API_KEY else 'Missing'}")

    print("\nApplication:")
    print(f"   Max History: {MAX_CONVERSATION_HISTORY}")
    print(f"   HTTP Timeout: {HTTP_TIMEOUT}s")

    print("\nMagdeburg:")
    print(f"   Latitude: {MAGDEBURG_LAT}")
    print(f"   Longitude: {MAGDEBURG_LON}")

    print("\nAgent:")
    print(f"   Model: {SINGLE_AGENT_MODEL}")
    print(f"   Timeout: {AGENT_TIMEOUT}s")
    print(f"   Verbose Logging: {'Yes' if AGENT_VERBOSE_LOGGING else 'No'}")

    print("\nStudy mode:")
    if STUDY_LOCATION:
        print(f"   Fixed location: {STUDY_LOCATION_NAME or '(unnamed)'} at {STUDY_LOCATION[0]}, {STUDY_LOCATION[1]}")
    else:
        print("   Off (real GPS)")

    print("\n" + "=" * 60)

    print("\nValidation:")
    if validate_config():
        print("All required environment variables are set!")
    else:
        print("Some required environment variables are missing.")
