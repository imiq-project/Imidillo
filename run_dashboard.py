"""
One-command local test rig: the Dashbot API + the IMIQ dashboard gateway.

Starts `python api.py` (port 8000) here, waits until it answers /status
(the 4 MCP servers + Neo4j schema take ~20-60 s to come up), then starts
`../imiq-dashboard-local/gateway.py` (port 1000), which serves the full
digital-twin dashboard and proxies /api/dashbot/* to the local Dashbot.
Opens http://localhost:1000 in the browser. Ctrl+C stops both.

    python run_dashboard.py          # start (stops a leftover previous run first)
    python run_dashboard.py --stop   # just stop a running instance

A previous run that is still alive (closed terminal, crashed launcher) is
detected by its ports and stopped automatically — including api.py's four
MCP subprocesses. A port held by some OTHER program aborts with a message.

Needs a filled-in `.env` next to api.py (copy .env.example) and the same
Python for both projects (the gateway only needs fastapi/uvicorn/httpx).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
DASHBOARD_DIR = os.path.normpath(os.path.join(HERE, "..", "imiq-dashboard-local"))
API_PORT, GATEWAY_PORT = 8000, 1000
API_URL = f"http://127.0.0.1:{API_PORT}"
DASHBOARD_URL = f"http://localhost:{GATEWAY_PORT}"
API_STARTUP_TIMEOUT_S = 180
_WIN = os.name == "nt"


# ---------------------------------------------------------------------------
# Process helpers (Windows: netstat / PowerShell / taskkill; elsewhere: best effort)
# ---------------------------------------------------------------------------
def _port_owner_pid(port: int) -> int | None:
    """PID listening on 127.0.0.1:<port> (or 0.0.0.0), else None."""
    if not _WIN:
        return None
    try:
        out = subprocess.run(["netstat", "-ano", "-p", "tcp"], capture_output=True,
                             text=True, timeout=15).stdout
    except Exception:
        return None
    for line in out.splitlines():
        parts = line.split()
        if (len(parts) >= 5 and parts[0].upper() == "TCP"
                and parts[1].endswith(f":{port}") and parts[3].upper() == "LISTENING"):
            try:
                return int(parts[4])
            except ValueError:
                pass
    return None


def _proc_info(pid: int) -> tuple[int | None, str]:
    """(parent_pid, command_line) for a PID, or (None, '') if it is gone."""
    if not _WIN:
        return None, ""
    ps = (f"$p = Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}'; "
          f"if ($p) {{ Write-Output ($p.ParentProcessId.ToString() + '|' + $p.CommandLine) }}")
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                             capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:
        return None, ""
    if "|" in out:
        ppid, cmd = out.split("|", 1)
        try:
            return int(ppid), cmd.strip()
        except ValueError:
            return None, cmd.strip()
    return None, ""


def _children(pid: int) -> list[int]:
    if not _WIN:
        return []
    ps = (f"Get-CimInstance Win32_Process -Filter 'ParentProcessId = {pid}' | "
          f"ForEach-Object {{ $_.ProcessId }}")
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                             capture_output=True, text=True, timeout=30).stdout
    except Exception:
        return []
    return [int(x) for x in out.split() if x.isdigit()]


def _kill_tree(pid: int) -> None:
    """Force-stop a process and everything under it (api.py + its MCP servers)."""
    if _WIN:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"],
                       capture_output=True, text=True, timeout=30)
    else:
        try:
            os.kill(pid, 9)
        except Exception:
            pass


def _free_port(port: int, ours: str) -> bool:
    """Make sure nothing listens on `port`. A leftover of a previous run of THIS
    rig (command line contains `ours`) is stopped, whole tree; anything else
    aborts. Returns True when the port is free."""
    pid = _port_owner_pid(port)
    if pid is None:
        return True
    ppid, cmd = _proc_info(pid)
    if ours in cmd:
        target = pid
        if ppid:
            _, pcmd = _proc_info(ppid)
            if "run_dashboard.py" in pcmd:
                target = ppid   # take the old launcher down with everything under it
        print(f"-> port {port} is still held by a previous run (pid {pid}, {ours}); stopping it ...")
        _kill_tree(target)
        for _ in range(30):
            if _port_owner_pid(port) is None:
                return True
            time.sleep(0.5)
        print(f"!! port {port} is still busy after stopping pid {target}.")
        return False
    print(f"!! port {port} is in use by another program (pid {pid}: {cmd[:120] or 'unknown'}). "
          f"Stop it first.")
    return False


def _pump(proc: subprocess.Popen, tag: str) -> None:
    """Relay a child's stdout/stderr to our terminal with a prefix."""
    for line in iter(proc.stdout.readline, b""):
        sys.stdout.write(f"[{tag}] {line.decode('utf-8', 'replace')}")
        sys.stdout.flush()


def _spawn(cmd: list[str], cwd: str, tag: str) -> subprocess.Popen:
    # Same console, same process group: a Ctrl+C in this terminal reaches the
    # children directly, so uvicorn shuts down gracefully (api.py's lifespan
    # then closes its 4 MCP subprocesses).
    env = dict(os.environ, PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8")
    proc = subprocess.Popen(
        cmd, cwd=cwd, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    threading.Thread(target=_pump, args=(proc, tag), daemon=True).start()
    return proc


def _wait_for_api(proc: subprocess.Popen) -> bool:
    deadline = time.time() + API_STARTUP_TIMEOUT_S
    while time.time() < deadline:
        if proc.poll() is not None:
            return False  # api.py exited (bad .env? an MCP server failed to boot?)
        try:
            with urllib.request.urlopen(f"{API_URL}/status", timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(1.5)
    return False


def _check_health() -> None:
    """Warn loudly if Neo4j is not connected: the app still boots with wrong
    NEO4J_* credentials and only fails per question."""
    try:
        with urllib.request.urlopen(f"{API_URL}/health", timeout=20) as r:
            body = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"!! could not read {API_URL}/health: {e}")
        return
    if body.get("neo4j") == "connected":
        print("-> Neo4j connected.")
    else:
        print("!! WARNING: Neo4j is NOT connected. Check NEO4J_URI / NEO4J_USERNAME / "
              "NEO4J_PASSWORD in .env (or the Aura instance is paused). Building, transit "
              "and place lookups will fail. Fix .env, then restart this script.")


def _stop(proc: subprocess.Popen | None, interrupted: bool) -> None:
    """After Ctrl+C the children already received it: give them a moment to
    shut down cleanly, then reap whatever is left (api.py's MCP subprocesses
    survive a hard exit of their parent, so they are killed explicitly)."""
    if proc is None:
        return
    kids = _children(proc.pid) if proc.poll() is None else []
    if proc.poll() is None:
        try:
            if interrupted:
                proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            pass
    if proc.poll() is None:
        _kill_tree(proc.pid)
        try:
            proc.wait(timeout=5)
        except Exception:
            pass
    for kid in kids:
        if _proc_info(kid)[1]:
            _kill_tree(kid)


def main() -> int:
    if "--stop" in sys.argv[1:]:
        ok = _free_port(API_PORT, "api.py") & _free_port(GATEWAY_PORT, "gateway.py")
        print("-> stopped." if ok else "!! something is still running, see above.")
        return 0 if ok else 1

    if not os.path.isfile(os.path.join(HERE, ".env")):
        print("!! No .env next to api.py. Copy .env.example to .env and fill in the keys "
              "(FIWARE_API_KEY, OPENAI_API_KEY, NEO4J_*, ORS_API_KEY; ELEVENLABS_API_KEY for voice).")
        return 2
    gateway = os.path.join(DASHBOARD_DIR, "gateway.py")
    if not os.path.isfile(gateway):
        print(f"!! Dashboard gateway not found at {gateway}")
        return 2
    # A previous run still alive (closed terminal, crashed launcher) would make
    # the readiness check pass on the OLD api and the gateway fail to bind.
    if not (_free_port(API_PORT, "api.py") and _free_port(GATEWAY_PORT, "gateway.py")):
        return 1

    api = gw = None
    interrupted = False
    try:
        print(f"-> starting Dashbot API ({API_URL}) ...")
        api = _spawn([sys.executable, "api.py"], HERE, "api")
        if not _wait_for_api(api):
            print("!! Dashbot API did not come up. Read the [api] lines above "
                  "(typical causes: bad .env keys, Neo4j Aura paused, an MCP server crashed).")
            return 1
        _check_health()
        print(f"-> Dashbot API ready. starting dashboard gateway ({DASHBOARD_URL}) ...")
        gw = _spawn([sys.executable, "gateway.py"], DASHBOARD_DIR, "dashboard")
        time.sleep(2.0)
        if gw.poll() is not None:
            print("!! Gateway exited - see the [dashboard] lines above.")
            return 1
        print(f"-> open {DASHBOARD_URL}  (Ctrl+C here stops both servers)")
        webbrowser.open(DASHBOARD_URL)
        while True:
            time.sleep(1.0)
            if api.poll() is not None:
                print("!! Dashbot API exited.")
                return 1
            if gw.poll() is not None:
                print("!! Gateway exited.")
                return 1
    except KeyboardInterrupt:
        interrupted = True
        print("\n-> stopping ...")
        return 0
    finally:
        _stop(gw, interrupted)
        _stop(api, interrupted)


if __name__ == "__main__":
    sys.exit(main())
