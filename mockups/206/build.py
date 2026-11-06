#!/usr/bin/env python3
"""Build characters.html from template.html, Nixi's real art and eye code, and each direction's reactions. Art is checked first, because it came from a model."""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
BAD = re.compile(r"<\s*(script|image|foreignObject|iframe|use|a|style)\b|\son\w+\s*=|https?:|javascript:|@import|expression\(|\bfilter\s*[=:]|</style", re.I)
REACTIONS = "load memory error soon meeting notice message email coding ask approved denied done open music watch news rain snow sun wind workout water".split()
CHARS = "snowflake terminal robot devil me".split()


def unstack(svg):
    """A CSS animation's transform replaces a transform attribute on the same element, so the art jumps. Put the attribute on a wrapper."""
    out, i = [], 0
    tag = re.compile(r'<(\w+)((?:\s+[\w:-]+=(?:"[^"]*"|\'[^\']*\'))*)\s*(/?)>')
    pending = []                                   # depth at which each wrapper closes
    depth = 0
    for m in re.finditer(r'<(/?)(\w+)((?:\s+[\w:-]+=(?:"[^"]*"|\'[^\']*\'))*)\s*(/?)>', svg):
        out.append(svg[i:m.start()])
        i = m.end()
        closing, name, attrs, selfc = m.groups()
        if closing:
            depth -= 1
            out.append(m.group(0))
            while pending and pending[-1] == depth:
                pending.pop()
                out.append("</g>")
            continue
        cl = re.search(r'\sclass=', attrs)
        tr = re.search(r'\stransform=("[^"]*"|\'[^\']*\')', attrs)
        if cl and tr:
            out.append(f"<g transform={tr.group(1)}>")
            out.append(f"<{name}{attrs.replace(tr.group(0), '')}{' /' if selfc else ''}>")
            if selfc:
                out.append("</g>")
            else:
                pending.append(depth)
                depth += 1
            continue
        out.append(m.group(0))
        if not selfc:
            depth += 1
    out.append(svg[i:])
    return "".join(out)


def repair(node):
    if isinstance(node, dict):
        return {k: (unstack(v) if k in ("sky", "back", "front", "lashes") and isinstance(v, str) else repair(v)) for k, v in node.items()}
    return node


def check(s):
    errs = []
    for m in BAD.finditer(json.dumps(s)):
        errs.append(repr(m.group(0)))
    if not re.fullmatch(r"\s*[Mm][-\d\s,.A-Za-z]+[Zz]\s*", str(s.get("me", {}).get("ball", ""))):
        errs.append("me: no closed ball path")
    missing = [r for r in REACTIONS if r not in s.get("props", {})]
    if missing:
        errs.append(f"missing props {missing}")
    return errs


sets = {}
for name in ("claude",):                       # the user chose this set (2026-11-06)
    f = HERE / f"{name}-react.json"
    s = repair(json.loads(f.read_text()))
    # email and message are today's: the page draws the envelope and caption row; the chat bubble is copied from index.html
    s["props"]["email"] = {"sky": "", "back": "", "front": "", "css": ""}
    s["props"]["message"] = {"sky": "", "back": "", "front": '<g class="cBub"><path d="M-88 -73H-60Q-56 -73 -56 -69V-55Q-56 -51 -60 -51H-72L-80 -43L-79 -51H-88Q-92 -51 -92 -55V-69Q-92 -73 -88 -73Z" fill="#fff" stroke="#2f8f66" stroke-width="3"/><circle class="cD" cx="-82" cy="-62" r="2.9" fill="#2f8f66"/><circle class="cD" style="animation-delay:.12s" cx="-74" cy="-62" r="2.9" fill="#2f8f66"/><circle class="cD" style="animation-delay:.24s" cx="-66" cy="-62" r="2.9" fill="#2f8f66"/></g>', "css": ".r-message .whole{transform-origin:0 84px;animation:fxMsgW 3s ease-in-out infinite}@keyframes fxMsgW{15%,85%{transform:rotate(-5deg)}}.r-message .cD{animation:fxMsgD .7s ease-in-out infinite}@keyframes fxMsgD{50%{transform:translateY(-3px)}}"}
    errs = check(s)
    sizes = {k: len(json.dumps(s.get(k, ""))) for k in ("me", "props", "touch")}
    print(f"{name}: {'ok' if not errs else errs[:6]}; bytes {sizes}; touches {[len((s.get('touch') or {}).get(c, {})) for c in CHARS]}")
    sets[name] = None if errs else s

page = (HERE / "template.html").read_text()
page = page.replace("/*NIXI_FACE*/", (HERE / "nixi-face.js").read_text())
page = page.replace("/*BASE_JSON*/null", json.dumps(json.loads((HERE / "existing-base.json").read_text()), separators=(",", ":")).replace("</", "<\\/"))
page = page.replace("/*ART_JSON*/null", json.dumps(sets, separators=(",", ":")).replace("</", "<\\/"))
(HERE / "characters.html").write_text(page)
print(f"characters.html {len(page)} bytes")
