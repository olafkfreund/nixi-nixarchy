#!/usr/bin/env python3
"""Build characters.html from template.html and each direction's art. The SVG is checked first, because it came from a model."""
import base64
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
BAD = re.compile(r"<\s*(script|image|foreignObject|iframe|use|a|style)\b|\son\w+\s*=|https?:|javascript:|@import|expression\(|\bfilter\s*[=:]|</style", re.I)
NEW = ("laptop", "girl", "man")
OLD = ("snowflake", "terminal", "robot", "devil")
MOODS = ("think", "work", "wait", "happy", "alert", "sad", "sleep", "busy", "boop", "talk")


def scan(where, text, errs):
    for m in BAD.finditer(text if isinstance(text, str) else json.dumps(text)):
        errs.append(f"{where}: {m.group(0)!r}")


def check(chars, errs):
    for i, a in chars.items():
        if not re.fullmatch(r"\s*[Mm][-\d\s,.A-Za-z]+[Zz]\s*", str(a.get("ball", ""))):
            errs.append(f"{i}: no closed ball path")
        for k in ("defs", "back", "front", "css", "defs2", "eye"):
            scan(f"{i}.{k}", a.get(k, ""), errs)
        for mood, layers in (a.get("poses") or {}).items():
            if mood not in MOODS:
                errs.append(f"{i}: unknown mood {mood}")
            scan(f"{i}.{mood}", layers, errs)


base = json.loads((HERE / "existing-base.json").read_text())
sets = {}
for name in ("agy", "codex", "claude"):
    s, errs = {}, []
    f, g = HERE / f"{name}-anime.json", HERE / f"{name}-existing.json"
    if f.exists():
        d = json.loads(f.read_text())
        s = {i: {**d[i], "eyesOnTop": name in ("agy", "codex")} for i in NEW if i in d}      # their front art paints over the eyes
        s["notes"] = d.get("notes", "")
    if g.exists():
        d = json.loads(g.read_text())
        for i in OLD:
            if i in d:
                s[i] = {**base[i], "defs2": d[i].get("defs", ""), "css": d[i].get("css", ""), "poses": d[i].get("poses") or {}}
        s["notesE"] = d.get("notes", "")
    else:
        for i in OLD:
            s[i] = dict(base[i])
    check({k: v for k, v in s.items() if k in NEW + OLD}, errs)
    size = {i: sum(len(str(s[i].get(k, ""))) for k in ("defs", "back", "ball", "front")) for i in NEW if i in s}
    print(f"{name}: {'ok' if not errs else errs}; new art bytes {size}; moods {[len(s[i].get('poses') or {}) for i in NEW + OLD if i in s]}")
    sets[name] = None if errs else s

data = json.dumps(sets, separators=(",", ":")).replace("</", "<\\/")
page = (HERE / "template.html").read_text().replace("/*ART_JSON*/null", data)
for who in ("girl", "man"):
    img = base64.b64encode((HERE / f"painted-{who}.webp").read_bytes()).decode()
    page = page.replace(f"PAINTED_{who.upper()}", f"data:image/webp;base64,{img}")
(HERE / "characters.html").write_text(page)
print(f"characters.html {len(page)} bytes")
