#!/usr/bin/env python3
"""One-shot: force-rewrite the shared nav in EVERY page so it matches LINKS.

inject_nav.py's `inject()` skips pages that already contain the brand mark, and
`augment()` only adds the tooltip assets / manual button -- neither refreshes the
link list. This script replaces the whole <nav ...>...</nav> block (handles both
class="xnav" and class="nav") with the canonical nav from inject_nav.LINKS.
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inject_nav import LINKS, nav_for, NAV_CSS, TOOL_CSS, TOOL_JS, MANUAL_BTN, BRAND

REPO = os.path.dirname(os.path.abspath(__file__))
NAV_RE = re.compile(r'<nav\b[^>]*>.*?</nav>', re.DOTALL)


def fix(path, fname):
    if not os.path.exists(path):
        return "missing"
    s = open(path, encoding="utf-8").read()
    orig = s

    # 1. replace any existing nav block with the canonical one
    if NAV_RE.search(s):
        s = NAV_RE.sub(lambda m: nav_for(fname), s, count=1)
    else:
        return "no-nav"

    # 2. ensure nav CSS present
    if 'id="xnav-css"' not in s:
        if "</head>" in s:
            s = s.replace("</head>", NAV_CSS + "\n" + TOOL_CSS + "\n</head>", 1)
    # 3. ensure tooltip assets present
    if "./tooltip.css" not in s and "</head>" in s:
        s = s.replace("</head>", TOOL_CSS + "\n</head>", 1)
    if "./tooltip.js" not in s and "</body>" in s:
        s = s.replace("</body>", TOOL_JS + "\n</body>", 1)

    if s != orig:
        open(path, "w", encoding="utf-8").write(s)
        return "rewritten"
    return "unchanged"


if __name__ == "__main__":
    seen = set()
    for fname, _ in LINKS:
        if fname in seen:
            continue
        seen.add(fname)
        for base in (REPO, os.path.join(REPO, "docs")):
            p = os.path.join(base, fname)
            r = fix(p, fname)
            if r != "missing":
                print("%-12s %s" % (r, os.path.relpath(p, REPO)))
    # also catch any other html at root that has a nav but isn't in LINKS
    for fn in sorted(os.listdir(REPO)):
        if fn.endswith(".html") and fn not in seen:
            p = os.path.join(REPO, fn)
            r = fix(p, fn)
            if r not in ("missing", "no-nav"):
                print("%-12s %s" % (r, fn))
