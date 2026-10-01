"""
Single-agent factory for the Magdeburg Campus Assistant.

One GPT-5.4 ReAct agent owns the full tool surface (Neo4j + FIWARE +
Routing + Context). The model's native tool-calling loop handles routing,
parallel fan-out, and answer composition in a single conversation —
replacing what used to be a supervisor + 4 specialist agents + synthesis.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

try:
    from zoneinfo import ZoneInfo
    _MAGDEBURG_TZ = ZoneInfo("Europe/Berlin")
except Exception:  # no IANA tz data (bare Windows without tzdata) — fall back to server-local time
    _MAGDEBURG_TZ = None

from langchain_core.messages import AIMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from config import (
    AGENT_TIMEOUT,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    SINGLE_AGENT_MODEL,
)
from graph.system_prompt import get_system_prompt

logger = logging.getLogger(__name__)


# Spoken-output rules for the VOICE agent. Appended to the shared system prompt
# (so it carries system-level weight — a per-turn note in the user message was
# not enough to make gpt-5.4 drop the report style). The tag vocabulary is
# ElevenLabs v3's; tags are stripped from the visible chat and stored history.
VOICE_PROMPT_SECTION = """# SPOKEN OUTPUT (this agent's answers are HEARD, never read)

Every answer in this session is spoken aloud by a text-to-speech voice (ElevenLabs v3) to a person talking to you by voice. Where this section conflicts with OUTPUT FORMAT above, THIS section wins.

**Sound like a person, not a system.** You are a friendly local who knows the city, talking to a friend. Everyday spoken language, contractions, short sentences, warmth, a bit of personality.

**Every answer opens with a natural spoken reaction** — one or two words that show you heard them — before the substance: "Okay so,", "Hmm, yeah,", "Oh nice,", "Alright,", "Ah,", "Well,". In German: "Also,", "Hmm, ja,", "Ach so,", "Na gut,", "Tja,". Add one more natural filler somewhere in the middle when it fits ("you know", "honestly", "let's see", "I mean" / "ehrlich gesagt", "mal sehen", "sozusagen"). One or two per answer, never in every sentence.

**Audio tags — use them.** The voice engine performs bracketed tags. Put ONE or TWO in every answer where a real person would react, chosen from exactly these: [laughs], [chuckles], [sighs], [excited], [pause], [whispers]. [laughs]/[chuckles] when something is funny or ironic; [sighs] before bad news (rain, no parking, a long walk, a transfer); [excited] for good news (close by, dry weather, free parking); [pause] right before the key fact. A tag stands on its own between words — never inside a name or a number, never as the very last thing in the answer.

**Numbers and names for the ear.** Write numbers as words in the answer's language ("Tram two", "five stops", "about twenty minutes", "twenty-one degrees" / "Tram zwei", "fünf Haltestellen"). No digits, no unit symbols — say "degrees", "micrograms", "kilometres" / "Grad", "Mikrogramm", "Kilometer".

**Shape.** Lead with the answer in one or two spoken sentences, then at most a couple of useful details, then optionally ONE short, concrete follow-up question. Keep it SHORT: about forty to seventy words, never more than roughly a hundred unless the user asks for details — every extra sentence is ten more seconds of listening. For routes that means ONLY the best option and one half-sentence offer of the alternatives; never narrate the other modes. NO lists, NO markdown, NO URLs, NO coordinates, NO headings, NO emojis. Never start with "let me check" or "sure": a short reaction line may already have been spoken while you worked, so start with the substance.

**Small talk** (hello, thanks, bye, a joke): answer like a friend, one line, warm, maybe a [chuckles]. No capability list.

Examples of the target style:

User: how do I get to the mensa from the main station?
You: Okay so, honestly, the tram's your best bet. [pause] Take Tram eight from Hauptbahnhof toward Neustädter See, five stops to Opernhaus, then Tram two toward Alte Neustadt, two more stops, and you're basically at the Mensa. [sighs] Walking would be a good twenty-five minutes, and it's drizzling, so… tram. Want the walking option anyway, just in case?

User: is it raining right now?
You: Hmm, yeah, a little. [sighs] It's about thirteen degrees and drizzling on campus right now, so grab a jacket. You heading out?

User: wie ist die Luft heute?
You: Also, ehrlich gesagt, richtig gut. [excited] Feinstaub liegt bei neun Mikrogramm, Stickstoffdioxid bei elf — perfekt für eine Runde am Elbufer. Soll ich dir eine Route raussuchen?

User: thank you!
You: [chuckles] Anytime! Give me a shout if you need anything else.
"""


def _build_agent(tools: Any, prompt: str, label: str):
    all_tools = list(tools)
    tool_names = [getattr(t, "name", "?") for t in all_tools]
    print(f"[{label}] Using {len(all_tools)} MCP tools: {tool_names}")

    llm = ChatOpenAI(
        base_url=OPENAI_BASE_URL,
        api_key=OPENAI_API_KEY,
        model=SINGLE_AGENT_MODEL,
        temperature=0.0,
        streaming=True,
    )
    print(f"[{label}] System prompt ready ({len(prompt)} chars)")
    agent = create_react_agent(llm, all_tools, prompt=prompt)
    return agent, tool_names


def build_single_agent(tools: Any):
    """Build the single gpt-5.4 ReAct agent on the given MCP tools.

    Tools come from the MCP servers (graph/mcp_client.py). This is the ONLY
    tool path — there is no in-process fallback.

    Returns (agent, tool_names). tool_names is for startup diagnostics.
    """
    return _build_agent(tools, get_system_prompt(), "SINGLE AGENT")


def build_voice_agent(tools: Any):
    """The same agent, same tools and knowledge, with the SPOKEN OUTPUT section
    in its system prompt. api.py streams voice turns through this one."""
    return _build_agent(tools, get_system_prompt() + "\n\n" + VOICE_PROMPT_SECTION, "VOICE AGENT")


def _format_history(history: list[dict]) -> str:
    if not history:
        return ""
    lines: list[str] = []
    for turn in history[-6:]:
        role = (turn.get("role") or "user").upper()
        content = turn.get("content") or ""
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _format_now() -> str:
    """Current date + time in Magdeburg, injected into every agent turn so the
    model can answer time-dependent questions (opening hours, day-of-week,
    "is the Mensa serving lunch right now?")."""
    now = datetime.now(_MAGDEBURG_TZ) if _MAGDEBURG_TZ else datetime.now()
    return f"Current date and time in Magdeburg: {now.strftime('%A, %d %B %Y, %H:%M')}"


# The address in the location line is a LABEL, not a resolvable place name:
# tools must get the coordinates for anything anchored on the user's position.
_USE_COORDS_HINT = (
    "For anything anchored on their position (a route from here, the nearest X, "
    "what's nearby) hand the tools these coordinates — get_all_routes, "
    "get_routes_for_places and find_transit_route with origin_lat/origin_lon, "
    "find_nearest, query_by_location, get_nearby_context with location \"<lat>, <lon>\" — "
    "never this address text as a place name."
)


def _format_location_status(user_location: Any, location_status: Any = None) -> str:
    """One line telling the agent the user's location-sharing state.

    When coordinates are present, the agent anchors "near me / nearest / from
    here" answers on them. When they're absent, the line says WHY (off / denied
    / unavailable) so the agent can ask the user to enable location (the 📍
    button by the message box) or state where they are, instead of silently
    guessing a position. See the LOCATION AWARENESS prompt section.
    """
    lat = lon = address = None
    if isinstance(user_location, dict):
        lat = user_location.get("lat") or user_location.get("latitude")
        lon = user_location.get("lon") or user_location.get("longitude")
        address = user_location.get("address")
    if lat is not None and lon is not None:
        if address:
            # Reverse-geocoded by api.py: "where am I" answers use THIS, never
            # a transit stop ("you're near stop X" reads as a system quirk).
            return (f"User's current location: {address} "
                    f"(GPS latitude={lat}, longitude={lon}; location sharing is ON). "
                    'For "where am I" questions answer with this address/area — '
                    "never with the nearest transit stop. " + _USE_COORDS_HINT)
        return (f"User's current location: latitude={lat}, longitude={lon} "
                "(location sharing is ON). " + _USE_COORDS_HINT)
    reason = {
        "denied": "permission denied",
        "unavailable": "position unavailable",
        "timeout": "request timed out",
        "unsupported": "not supported by their browser",
        "error": "could not be determined",
        "off": "not shared",
    }.get(str(location_status or "off").lower(), "not shared")
    return (
        f"User's location is unavailable ({reason}). If the question needs their current "
        'position ("near me", "from here", "nearest", "how do I get home"), ask them to tap '
        "the 📍 Share location button above the message box, or to tell you where they are — "
        "don't guess a location. If it doesn't need their position, just answer."
    )


# The widget's EN/DE switch. When the client sends a language the answer is
# pinned to it regardless of the question's language; older clients that send
# none keep the old behaviour (the agent mirrors the user's language).
_ANSWER_LANGUAGE = {
    "en": ("ANSWER LANGUAGE: English. The user set the interface to English — reply in "
           "English even if the question is written in German (keep place names as they are)."),
    "de": ("ANSWER LANGUAGE: German (Deutsch). The user set the interface to German — reply in "
           "natural, idiomatic German even if the question is written in English (keep place "
           "names as they are)."),
}


def _format_answer_language(language) -> str:
    """One line pinning the reply language to the interface language, or "" when
    the client didn't send one."""
    return _ANSWER_LANGUAGE.get((language or "").strip().lower()[:2], "")


def _count_tool_calls(messages: list) -> int:
    n = 0
    for m in messages:
        tc = getattr(m, "tool_calls", None)
        if tc:
            n += len(tc)
    return n


def create_single_agent_node(agent):
    """Create a LangGraph node that invokes the single agent.

    Reads query / conversation_history / user_location from state; runs
    the agent with a wall-clock timeout; writes response and
    final_response back. The legacy `agent_results` field is left empty
    — downstream code (api.py card extractor) degrades gracefully.
    """

    async def single_agent_node(state: dict) -> dict:
        query = (state.get("query") or "").strip()
        conversation_history = state.get("conversation_history") or []
        user_location = state.get("user_location")

        parts: list[str] = []
        history_text = _format_history(conversation_history)
        if history_text:
            parts.append(f"Recent conversation:\n{history_text}")
        parts.append(_format_now())
        location_text = _format_location_status(user_location, state.get("location_status"))
        if location_text:
            parts.append(location_text)
        pinned_context = (state.get("pinned_context") or "").strip()
        if pinned_context:
            parts.append(pinned_context)
        proactive_context = (state.get("proactive_context") or "").strip()
        if proactive_context:
            parts.append(proactive_context)
        language_text = _format_answer_language(state.get("language"))
        if language_text:
            parts.append(language_text)
        parts.append(f"Question: {query}")
        user_msg = "\n\n".join(parts)

        print(f"[SINGLE AGENT] Processing: {query!r}")

        try:
            result = await asyncio.wait_for(
                agent.ainvoke({"messages": [HumanMessage(content=user_msg)]}),
                timeout=AGENT_TIMEOUT,
            )
        except asyncio.TimeoutError:
            print(f"[SINGLE AGENT] Timeout after {AGENT_TIMEOUT}s")
            msg = "Sorry, that took longer than expected to look up. Please try again."
            return {"response": msg, "final_response": msg}
        except Exception as e:
            logger.error(f"Single agent failed: {e}", exc_info=True)
            print(f"[SINGLE AGENT] Error: {e}")
            msg = "Sorry, I ran into an internal error answering that. Please try again."
            return {"response": msg, "final_response": msg}

        msgs = result.get("messages") or []

        # Diagnostic: print every tool call (with args) and every tool
        # result (truncated). Helps catch cases where the LLM misreads a
        # successful tool result as a failure, or calls the wrong tool.
        for i, m in enumerate(msgs):
            cls = type(m).__name__
            tcs = getattr(m, "tool_calls", None)
            if tcs:
                for tc in tcs:
                    args_preview = str(tc.get("args", {}))[:300]
                    print(f"[SINGLE AGENT]   step {i} {cls} -> {tc.get('name')}({args_preview})")
            elif cls == "ToolMessage":
                content = getattr(m, "content", "") or ""
                preview = (content[:400] + "...") if len(content) > 400 else content
                print(f"[SINGLE AGENT]   step {i} ToolMessage <- {preview}")

        final = ""
        for m in reversed(msgs):
            if isinstance(m, AIMessage):
                content = (m.content or "").strip()
                if content:
                    final = content
                    break

        if not final:
            final = "Sorry, I couldn't put together an answer for that one."

        n_tool_calls = _count_tool_calls(msgs)
        print(
            f"[SINGLE AGENT] Done — {n_tool_calls} tool call(s), "
            f"{len(final)} char answer"
        )

        return {
            "response": final,
            "final_response": final,
            "messages": msgs,
        }

    return single_agent_node
