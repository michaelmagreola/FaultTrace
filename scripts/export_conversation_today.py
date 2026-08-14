"""Export today's FaultTrace Cursor turns to a Claude-uploadable text file."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

SRC = Path(
    r"C:\Users\micha\.cursor\projects\c-Users-micha-FaultTrace"
    r"\agent-transcripts\1da7a225-96c8-43d6-bc23-d41d40d203fc"
    r"\1da7a225-96c8-43d6-bc23-d41d40d203fc.jsonl"
)

TODAY = date.today()  # 2026-08-09 locally
# Match both "Aug 9, 2026" and ISO-ish dates in message stamps
DATE_PATTERNS = [
    TODAY.strftime("%b %d, %Y").replace(" 0", " "),  # Aug 9, 2026
    TODAY.strftime("%B %d, %Y").replace(" 0", " "),  # August 9, 2026
    TODAY.isoformat(),  # 2026-08-09
]

OUT = Path(r"C:\Users\micha\FaultTrace\docs\FaultTrace_Today_Conversation_Export.txt")
OUT_DOWNLOADS = Path(r"C:\Users\micha\Downloads\FaultTrace_Today_Conversation_Export.txt")

TS_RE = re.compile(r"<timestamp>(.*?)</timestamp>", re.I | re.S)


def extract_text(content: object) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if not isinstance(content, list):
        return str(content).strip()

    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        kind = block.get("type")
        if kind == "text":
            parts.append(block.get("text") or "")
        elif kind == "tool_use":
            name = block.get("name") or "tool"
            inp = block.get("input") or {}
            if name == "Write" and "path" in inp:
                parts.append(f"[Tool: Write -> {inp.get('path')}]")
            elif name == "StrReplace" and "path" in inp:
                parts.append(f"[Tool: Edit -> {inp.get('path')}]")
            elif name == "Shell":
                cmd = str(inp.get("command") or "")[:140]
                parts.append(f"[Tool: Shell] {cmd}")
            elif name == "Delete" and "path" in inp:
                parts.append(f"[Tool: Delete -> {inp.get('path')}]")
            else:
                parts.append(f"[Tool: {name}]")
    return "\n".join(p for p in parts if p).strip()


def is_today(text: str) -> bool:
    lowered = text.lower()
    for pat in DATE_PATTERNS:
        if pat.lower() in lowered:
            return True
    # Also accept "Sunday, Aug 9, 2026" style without leading zero issues
    if "aug 9, 2026" in lowered or "august 9, 2026" in lowered:
        return True
    if "2026-08-09" in lowered:
        return True
    return False


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Transcript not found: {SRC}")

    lines: list[str] = [
        "FaultTrace — Cursor conversation export (TODAY)",
        f"Local date filter: {TODAY.isoformat()}",
        "Title: FaultTrace application showcase",
        "Conversation ID: 1da7a225-96c8-43d6-bc23-d41d40d203fc",
        "Purpose: Upload to Claude — today's Q&A that advanced FaultTrace",
        "Note: Tool calls summarized as Actions; full code is in the repo.",
        "=" * 72,
        "",
    ]

    n_user = 0
    n_asst = 0
    # Once we see a today user message, keep following assistant turns until next non-today user
    in_today = False

    with SRC.open(encoding="utf-8", errors="replace") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue

            role = obj.get("role") or "unknown"
            msg = obj.get("message") or obj
            content = msg.get("content") if isinstance(msg, dict) else obj.get("content")
            text = extract_text(content)
            if not text:
                continue

            if role == "user":
                in_today = is_today(text)
                if not in_today:
                    continue
                n_user += 1
                lines.extend(
                    [
                        "-" * 72,
                        f"USER ({n_user})",
                        "-" * 72,
                        text,
                        "",
                    ]
                )
            elif role == "assistant":
                if not in_today:
                    continue
                meaningful = [ln for ln in text.splitlines() if not ln.startswith("[Tool:")]
                tool_lines = [ln for ln in text.splitlines() if ln.startswith("[Tool:")]
                body = "\n".join(meaningful).strip()
                uniq_tools: list[str] = []
                for t in tool_lines:
                    if t not in uniq_tools:
                        uniq_tools.append(t)
                if not body and not uniq_tools:
                    continue
                n_asst += 1
                lines.extend(["-" * 72, f"ASSISTANT ({n_asst})", "-" * 72])
                if body:
                    lines.append(body)
                if uniq_tools:
                    lines.append("")
                    lines.append("Actions taken:")
                    lines.extend(uniq_tools[:50])
                lines.append("")

    lines.extend(
        [
            "=" * 72,
            f"Export complete. User turns: {n_user} | Assistant turns: {n_asst}",
        ]
    )
    payload = "\n".join(lines)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload, encoding="utf-8")
    OUT_DOWNLOADS.write_text(payload, encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"Wrote {OUT_DOWNLOADS}")
    print(f"Size: {OUT.stat().st_size:,} bytes")
    print(f"User turns: {n_user} | Assistant turns: {n_asst}")


if __name__ == "__main__":
    main()
