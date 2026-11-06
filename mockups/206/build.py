#!/usr/bin/env python3
"""Build characters.html from template.html and each set's art. A set's SVG is checked first, because it came from a model."""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
BAD = re.compile(r"<\s*(script|image|foreignObject|iframe|use|a)\b|\son\w+\s*=|https?:|javascript:|@import|expression\(|\bfilter\s*[=:]|</style", re.I)
IDS = ("wizard", "duck", "cat", "pup")
MAX = 6 * 1024


def check(name, s):
    if not isinstance(s, dict):
        return ["not an object"]
    errs = []
    for i in IDS:
        a = s.get(i)
        if not isinstance(a, dict) or not re.fullmatch(r"[Mm][-\d\s,.A-Za-z]+[Zz]\s*", str(a.get("ball", ""))):
            errs.append(f"{i}: no closed ball path")
            continue
        for k in ("defs", "back", "front", "css"):
            for m in BAD.finditer(str(a.get(k, ""))):
                errs.append(f"{i}.{k}: {m.group(0)!r}")
        size = sum(len(str(a.get(k, ""))) for k in ("defs", "back", "ball", "front"))
        if size > MAX:
            errs.append(f"{i}: {size} bytes of SVG")
    return errs


sets = {}
for name in ("claude", "codex", "agy"):
    f = HERE / f"{name}-art.json"
    if not f.exists():
        print(f"{name}: no file")
        sets[name] = None
        continue
    s = json.loads(f.read_text())
    errs = check(name, s)
    print(f"{name}: {'ok' if not errs else errs}")
    sets[name] = None if errs else s

data = json.dumps(sets, separators=(",", ":")).replace("</", "<\\/")
page = (HERE / "template.html").read_text().replace("/*ART_JSON*/null", data)
(HERE / "characters.html").write_text(page)
print(f"characters.html {len(page)} bytes")
sys.exit(0 if sets["claude"] else 1)
