#!/usr/bin/env python3
"""Inject the shared top nav bar + tooltip/manual system into every dashboard page.

GOAL: every page gets the SAME clickable, spaced nav as index.html (the one that
works). The previous version injected a separate <style id="xnav-css"> block and
concatenated <a> links with no whitespace, which collapsed the flex layout and
made the links run together / unclickable on 7 pages.

New behaviour:
  - nav CSS lives inside the page's MAIN <style> block (same as index.html)
  - links are spaced (newline + indentation, like index.html)
  - labels are uniform across pages
  - idempotent: skips pages that already carry the new nav markup
  - if a page already has an old hand-authored nav (no id=xnav-css, links
    spaced, working), it is left alone
Run after cron regenerates accum.html / index.html.
"""
import re, os

REPO = os.path.dirname(os.path.abspath(__file__))
LINKS = [("index.html", "🏠 หน้าแรก"), ("dipbuy.html", "Dip-Buy"),
         ("entry.html", "Entry Planner"), ("scan.html", "Market Scan"),
         ("trend.html", "Trend Rider"), ("top100.html", "Top 100"),
         ("fav.html", "⭐ โปรด"), ("liqwatch.html", "Liquidation"),
         ("radar.html", "Radar"),
         ("accum.html", "Accum")]

# Identical to the working nav CSS in index.html
NAV_CSS = """
/* ═══ SHARED NAV (injected) ═══ */
.xnav{display:flex;gap:6px;align-items:center;padding:10px 16px;background:#0f141d;border-bottom:1px solid #30363d;flex-wrap:wrap}
.xnav .b{font-weight:800;font-size:15px;background:linear-gradient(90deg,#3fb950,#58a6ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-right:8px}
.xnav a{color:#8b949e;text-decoration:none;font-size:13px;padding:6px 12px;border-radius:8px;transition:.15s;font-weight:600}
.xnav a:hover{background:#1b2230;color:#e6edf3}
.xnav a.cur{color:#3fb950;background:rgba(63,185,80,.1)}
.xnav .manual{margin-left:auto;background:#1b2230;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer}
.xnav .manual:hover{color:#e6edf3}
"""

TOOL_CSS = '<link rel="stylesheet" href="./tooltip.css">'
TOOL_JS = '<script src="./tooltip.js"></script>'
MANUAL_BTN = '<button class="manual" title="คู่มือ">ℹ️ คู่มือ</button>'


def nav_for(fname):
    links = "\n".join('  <a href="./%s"%s>%s</a>' % (
        u, ' class="cur"' if u == fname else '', n) for u, n in LINKS)
    return ('<nav class="xnav">\n  <span class="b">◈ CRYPTO TERMINAL</span>\n' +
            links + '\n  ' + MANUAL_BTN + '\n</nav>')


def has_new_nav(s):
    """A page already has the correct, working nav."""
    return 'class="xnav"' in s and '◈ CRYPTO TERMINAL' in s and 'xnav-css' not in s


def strip_old_nav(s):
    """Remove any previously-injected nav + its separate css block so we can
    re-inject cleanly."""
    s = re.sub(r'<style id="xnav-css">.*?</style>', '', s, flags=re.S)
    s = re.sub(r'<nav class="xnav">.*?</nav>', '', s, flags=re.S)
    return s


def inject(path, fname):
    if not os.path.exists(path):
        return "missing"
    s = open(path, encoding="utf-8").read()
    if has_new_nav(s):
        return "already-ok"
    if "</head>" not in s:
        return "no-head"
    s = strip_old_nav(s)
    # 1) inject nav CSS into the MAIN style block (append before </style>)
    s = re.sub(r'(</style>)', NAV_CSS + r'\1', s, count=1)
    # 2) inject tooltip css link
    if "tooltip.css" not in s:
        s = s.replace("</head>", TOOL_CSS + "\n</head>", 1)
    # 3) inject tooltip js before </body>
    if "tooltip.js" not in s and "</body>" in s:
        s = s.replace("</body>", TOOL_JS + "\n</body>", 1)
    # 4) inject nav right after <body ...>
    m = re.search(r"<body[^>]*>", s)
    if not m:
        return "no-body"
    s = s[:m.end()] + "\n" + nav_for(fname) + "\n" + s[m.end():]
    open(path, "w", encoding="utf-8").write(s)
    return "injected"


if __name__ == "__main__":
    for fname, _ in LINKS:
        for base in (REPO, os.path.join(REPO, "docs")):
            p = os.path.join(base, fname)
            r = inject(p, fname)
            if r != "missing":
                print("%-12s %s" % (r, p))
