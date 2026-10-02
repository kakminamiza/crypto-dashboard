#!/usr/bin/env python3
"""Force-rewrite the shared xnav in EVERY page so it matches inject_nav.LINKS.

Why this exists: inject_nav.inject() skips a page whenever has_new_nav() returns
True, and has_new_nav() only checks that *a* nav exists (plus a few shape rules) --
it never verifies the link LIST is current. So after adding a page to LINKS, every
already-naved page keeps its stale nav forever. This script replaces the whole
<nav class="xnav">...</nav> block with nav_for(fname, prefix) for every page.
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inject_nav import LINKS, nav_for, NAV_CSS, TOOL_CSS, TOOL_JS, EXCLUDE

REPO = os.path.dirname(os.path.abspath(__file__))
NAV_RE = re.compile(r'<nav class="(?:xnav|nav)">.*?</nav>', re.DOTALL)
CSS_RE = re.compile(r'<style id="xnav-css">.*?</style>', re.DOTALL)
NAV_MARK = "/* ═══ SHARED NAV (injected) ═══ */"


def force(path, fname, prefix):
    if not os.path.exists(path):
        return "missing"
    s = open(path, encoding="utf-8").read()
    if '<nav class="xnav">' not in s and '<nav class="nav">' not in s:
        return "no-nav"
    orig = s
    # replace the nav block with the canonical one for this location
    s = NAV_RE.sub(lambda m: nav_for(fname, prefix), s, count=1)
    # make sure the nav css block exists exactly once
    if NAV_MARK not in s:
        s = re.sub(r'(</style>)', NAV_CSS + r'\1', s, count=1)
    # tooltip assets
    if "tooltip.css" not in s and "</head>" in s:
        s = s.replace("</head>", TOOL_CSS + "\n</head>", 1)
    if "tooltip.js" not in s and "</body>" in s:
        s = s.replace("</body>", TOOL_JS + "\n</body>", 1)
    if s != orig:
        open(path, "w", encoding="utf-8").write(s)
        return "forced"
    return "unchanged"


if __name__ == "__main__":
    n = 0
    for f in sorted(os.listdir(REPO)):
        if f.endswith(".html") and " - Copy" not in f and f not in EXCLUDE:
            r = force(os.path.join(REPO, f), f, "./")
            if r == "forced":
                print("%-8s %s" % (r, f)); n += 1
    docs = os.path.join(REPO, "docs")
    if os.path.isdir(docs):
        for f in sorted(os.listdir(docs)):
            if f.endswith(".html") and " - Copy" not in f:
                r = force(os.path.join(docs, f), f, "../")
                if r == "forced":
                    print("%-8s docs/%s" % (r, f)); n += 1
    print("total forced:", n)
