#!/usr/bin/env python3
"""Build characters.html from template.html, each set's art and its per-mood poses. The SVG is checked first, because it came from a model."""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
BAD = re.compile(r"<\s*(script|image|foreignObject|iframe|use|a|style)\b|\son\w+\s*=|https?:|javascript:|@import|expression\(|\bfilter\s*[=:]|</style", re.I)
IDS = ("wizard", "duck", "cat", "pup")
POSES = ("think", "work", "wait", "happy", "alert", "sad", "sleep", "busy", "boop")
MAX = 7 * 1024


def scan(where, text, errs):
    for m in BAD.finditer(str(text)):
        errs.append(f"{where}: {m.group(0)!r}")


def check(s):
    errs = []
    for i in IDS:
        a = s.get(i)
        if not isinstance(a, dict) or not re.fullmatch(r"[Mm][-\d\s,.A-Za-z]+[Zz]\s*", str(a.get("ball", ""))):
            errs.append(f"{i}: no closed ball path")
            continue
        for k in ("defs", "back", "front", "css", "defs2", "css2"):
            scan(f"{i}.{k}", a.get(k, ""), errs)
        new = 0
        for mood, layers in (a.get("poses") or {}).items():
            if mood not in POSES:
                errs.append(f"{i}: unknown mood {mood}")
            for k, v in layers.items():
                scan(f"{i}.{mood}.{k}", v, errs)
                new += len(str(v))
        if new > MAX * 1.3:      # a brief's limit, with some room: past this it would weigh on the real page
            errs.append(f"{i}: {new} bytes of poses")
    return errs


def merge(base, poses):
    for i in IDS:
        p = poses.get(i) or {}
        base[i]["poses"] = p.get("poses") or {}
        base[i]["defs2"] = p.get("defs", "")
        base[i]["css2"] = p.get("css", "")
    if poses.get("notes"):
        base["notes"] = poses["notes"]
    return base


sets = {}
for name in ("claude", "codex", "agy"):
    f, g = HERE / f"{name}-art.json", HERE / f"{name}-poses.json"
    s = json.loads(f.read_text())
    if g.exists():
        s = merge(s, json.loads(g.read_text()))
    errs = check(s)
    moods = {i: sorted((s[i].get("poses") or {})) for i in IDS}
    print(f"{name}: {'ok' if not errs else errs}; moods per character {[len(v) for v in moods.values()]}")
    sets[name] = None if errs else s

data = json.dumps(sets, separators=(",", ":")).replace("</", "<\\/")
page = (HERE / "template.html").read_text().replace("/*ART_JSON*/null", data)
(HERE / "characters.html").write_text(page)
print(f"characters.html {len(page)} bytes")
