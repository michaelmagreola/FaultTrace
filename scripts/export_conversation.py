"""Export FaultTrace Cursor transcript to a Claude-uploadable text file."""

from __future__ import annotations

import json
from pathlib import Path

SRC = Path(
    r"C:\Users\micha\.cursor\projects\c-Users-micha-FaultTrace"
    r"\agent-transcripts\1da7a225-96c8-43d6-bc23-d41d40d203fc"
    r"\1da7a225-96c8-43d6-bc23-d41d40d203fc.jsonl"
)
OUT = Path(r"C:\Users\micha\FaultTrace\docs\FaultTrace_Build_Conversation_Export.txt")
OUT_DOWNLOADS = Path(r"C:\Users\micha\Downloads\FaultTrace_Build_Conversation_Export.txt")
# FaultTrace-only slice (skips earlier RouteIQ work in the same chat)
OUT_FT = Path(r"C:\Users\micha\FaultTrace\docs\FaultTrace_Only_Conversation_Export.txt")
OUT_FT_DOWNLOADS = Path(r"C:\Users\micha\Downloads\FaultTrace_Only_Conversation_Export.txt")
FAULTTRACE_START_MARKER = "is this buildable with what I have"


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


def build_export(*, faulttrace_only: bool) -> tuple[str, int, int]:
    header = [
        "FaultTrace — Cursor conversation export",
        "Title: FaultTrace application showcase",
        "Conversation ID: 1da7a225-96c8-43d6-bc23-d41d40d203fc",
        "Purpose: Context for Claude on how FaultTrace was planned and built",
        "Note: Tool calls are summarized as Actions; full file contents are in the repo.",
    ]
    if faulttrace_only:
        header.append(
            "Scope: FaultTrace-only (starts at Part 1/2 buildability question; RouteIQ omitted)."
        )
    else:
        header.append(
            "Scope: Full chat thread (includes earlier RouteIQ / video work before FaultTrace)."
        )
    header.extend(["=" * 72, ""])

    lines: list[str] = list(header)
    n_user = 0
    n_asst = 0
    started = not faulttrace_only

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
                if not started and FAULTTRACE_START_MARKER.lower() in text.lower():
                    started = True
                if not started:
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
                if not started:
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
    return "\n".join(lines), n_user, n_asst


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Transcript not found: {SRC}")

    OUT.parent.mkdir(parents=True, exist_ok=True)

    full, u1, a1 = build_export(faulttrace_only=False)
    OUT.write_text(full, encoding="utf-8")
    OUT_DOWNLOADS.write_text(full, encoding="utf-8")

    ft_only, u2, a2 = build_export(faulttrace_only=True)
    OUT_FT.write_text(ft_only, encoding="utf-8")
    OUT_FT_DOWNLOADS.write_text(ft_only, encoding="utf-8")

    print(f"FULL  -> {OUT_DOWNLOADS} ({OUT.stat().st_size:,} bytes) users={u1} asst={a1}")
    print(f"FTONLY-> {OUT_FT_DOWNLOADS} ({OUT_FT.stat().st_size:,} bytes) users={u2} asst={a2}")


if __name__ == "__main__":
    main()
