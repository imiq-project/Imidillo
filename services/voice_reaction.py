"""
Spoken reaction for voice turns — the replacement for the old rule-based
acknowledgment phrases.

The agent's first answer token arrives only after its tool calls (6-10 s for
a route or a weather lookup); silence that long sounds broken. The old fix
picked a canned phrase by keyword ("checking the sensors…"), which had no idea
what the user MEANT — "thank you for the weather" got a sensor check and then
a "you're welcome". This module makes the reaction itself a tiny, fast LLM
call that runs IN PARALLEL with the agent: it hears the question and produces
the one-liner a person would say before looking something up ("Ooh, the
Mensa, let me see what's on"), plus an optional "still on it" line, or
NOTHING for small talk the agent answers instantly anyway.

Cost: one small chat completion per spoken turn (reasoning at minimum).
Latency: typically well under a second; the widget only plays the reaction
if the real answer hasn't started talking yet. Never raises.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

from config import (
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    VOICE_REACTION_MODEL,
    VOICE_REACTION_REASONING,
    VOICE_REACTION_TIMEOUT,
)

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are the spoken voice of Dashbot, a friendly local assistant for Magdeburg "
    "and the OVGU campus, in a live voice conversation. The user just SAID something. "
    "The main assistant is already working on the real answer, which takes several "
    "seconds when it has to look things up (routes, trams, weather, parking, air "
    "quality, buildings, events, the Mensa menu). Your only job is the instant, natural "
    "spoken reaction a person gives when they have heard the question and are about to "
    "look it up. Reply with JSON: {\"reaction\": string}.\n"
    "- reaction: ONE natural spoken sentence, at most 12 words, reacting to the CONTENT "
    "('Ooh, the Mensa, let me see what's on today', 'Trams to the station, okay, one "
    "sec', 'Parking, hmm, let me have a look'). A light interjection is welcome (oh, "
    "ooh, hmm, alright, okay so). Never generic ('processing', 'checking the sensors'), "
    "never an answer, never a question.\n"
    "- Return '' when NO lookup is needed: greetings, thanks, goodbyes, small "
    "talk, yes/no, a compliment, a joke, or a follow-up the assistant can answer from "
    "what was just said. The assistant answers those instantly itself, and a reaction "
    "there would sound wrong.\n"
    "- Write in the given language, in plain words: no emojis, no markdown, no "
    "bracketed audio tags."
)

_client: Any = None
_client_lock = asyncio.Lock()


async def _get_client():
    global _client
    if _client is None:
        async with _client_lock:
            if _client is None:
                from openai import AsyncOpenAI
                _client = AsyncOpenAI(
                    api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL,
                    timeout=VOICE_REACTION_TIMEOUT, max_retries=0,
                )
    return _client


def _last_assistant_turn(history: Optional[list]) -> str:
    for turn in reversed(history or []):
        if isinstance(turn, dict) and turn.get("role") == "assistant" and turn.get("content"):
            return str(turn["content"])[:400]
    return ""


async def voice_reaction(question: str, history: Optional[list] = None,
                         language: Optional[str] = None) -> Optional[dict]:
    """``{"text": reaction, "filler": first, "fillers": [...]}`` or None (nothing to say, disabled,
    timed out, or failed). Best-effort: never raises."""
    if not VOICE_REACTION_MODEL or not OPENAI_API_KEY or not (question or "").strip():
        return None
    lang_name = "German" if (language or "").strip().lower().startswith("de") else "English"
    user = f"Language for the reaction: {lang_name}.\n"
    last = _last_assistant_turn(history)
    if last:
        user += f"Previous assistant turn (context only): {last}\n"
    user += f"User just said: {question.strip()[:600]}"

    kwargs: dict = {
        "model": VOICE_REACTION_MODEL,
        "messages": [{"role": "system", "content": _SYSTEM},
                     {"role": "user", "content": user}],
        "max_completion_tokens": 120,
        "response_format": {"type": "json_object"},
    }
    if VOICE_REACTION_REASONING:
        kwargs["reasoning_effort"] = VOICE_REACTION_REASONING
    try:
        client = await _get_client()
        resp = await asyncio.wait_for(client.chat.completions.create(**kwargs),
                                      timeout=VOICE_REACTION_TIMEOUT)
        raw = resp.choices[0].message.content or ""
        data = json.loads(raw)
    except Exception as e:  # noqa: BLE001 — the agent answer must never wait on this
        logger.info("[REACTION] skipped (%s: %s)", type(e).__name__, str(e)[:160])
        return None
    if not isinstance(data, dict):
        return None
    text = " ".join(str(data.get("reaction") or "").split())[:120]
    raw_fillers = data.get("fillers")
    if isinstance(raw_fillers, str):
        raw_fillers = [raw_fillers]
    if not isinstance(raw_fillers, list) and data.get("filler"):
        raw_fillers = [data.get("filler")]
    fillers = []
    for f in (raw_fillers or []):
        f = " ".join(str(f or "").split())[:80]
        if f and f not in fillers:
            fillers.append(f)
    fillers = fillers[:3]
    if not text and not fillers:
        return None
    return {"text": text, "filler": (fillers[0] if fillers else ""), "fillers": fillers}


if __name__ == "__main__":
    import sys
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    async def _demo() -> None:
        cases = [
            ("thank you so much for the weather", "en"),
            ("how do I get to the mensa from the main station?", "en"),
            ("hello!", "en"),
            ("wie komme ich zum hauptbahnhof?", "de"),
        ]
        for q, lang in cases:
            t0 = asyncio.get_event_loop().time()
            r = await voice_reaction(q, [], lang)
            dt = asyncio.get_event_loop().time() - t0
            print(f"{dt:5.2f}s  {q!r} -> {r}")

    asyncio.run(_demo())
