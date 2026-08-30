#!/usr/bin/env python3
# omarchy:summary=Regenerate the helper's offline FAQ from the local manual (uses the default agent once, at build time)
"""Build faq.json: beginner Q&A pairs distilled from the official manual.

Run by the maintainer whenever the manual changes; the result ships with the
repo so end users get curated offline answers with NO runtime AI calls.
"""
import glob
import json
import os
import subprocess
import sys

DATA = os.path.expanduser(os.environ.get("OMARCHY_HELP_DATA", "~/.local/share/omarchy-help"))
MANUAL = os.path.join(DATA, "manual")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(DATA, "faq.json")

PROMPT = """You are distilling the official Omarchy manual into an offline FAQ
for beginners. For EACH page below, write 3-8 entries. Each entry:
- "q": a list of 2-4 phrasings a beginner would actually type (short, natural:
  "how do I switch workspaces", "change wallpaper", "what is the scratchpad")
- "a": ONE self-contained answer, 30-90 words, plain language, exact keys
  (e.g. SUPER+SPACE), no markdown headings, no links.
Only include what the page actually says. Answer ONLY a JSON array of
{"q": [...], "a": "..."} objects (entries from all pages merged). PAGES:

%s"""


def batches(files, size=9):
    for i in range(0, len(files), size):
        yield files[i:i + size]


def main():
    files = sorted(glob.glob(os.path.join(MANUAL, "*.md")))
    if not files:
        sys.exit(f"no manual pages in {MANUAL} — run omarchy-help-update-manual")
    faq = []
    for group in batches(files):
        material = "\n\n".join(
            f"=== {os.path.basename(f)} ===\n{open(f).read()[:6000]}" for f in group)
        out = subprocess.run(
            ["claude", "-p", PROMPT % material, "--model", "sonnet"],
            capture_output=True, text=True, timeout=600)
        if out.returncode != 0:
            print("batch failed:", out.stderr[-200:], file=sys.stderr)
            continue
        text = out.stdout
        try:
            chunk = json.loads(text[text.index("["):text.rindex("]") + 1])
            faq.extend(e for e in chunk
                       if isinstance(e, dict) and e.get("q") and e.get("a"))
            print(f"  {os.path.basename(group[0])}… +{len(chunk)} entries")
        except Exception as e:
            print("batch parse failed:", e, file=sys.stderr)
    with open(OUT, "w") as f:
        json.dump(faq, f, ensure_ascii=False, indent=1)
    print(f"wrote {len(faq)} FAQ entries -> {OUT}")


if __name__ == "__main__":
    main()
