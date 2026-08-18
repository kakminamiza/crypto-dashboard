#!/usr/bin/env python3
"""Inject the SAME clickable, correctly-spaced shared nav into every standalone page.

GOAL: every page gets the identical nav as index.html, so clicking between pages
never breaks. Fixes:
  - OLD broken nav: links mashed together (</a><a, no whitespace) -> unclickable
  - OLD broken nav: wrong labels ("Accumulation", "39 เหรียมโปรด", "Futures Radar")
  - docs/ pages whose nav pointed to ./scan.html (file lives in repo root, not docs/)
    -> now use ../ prefix so links resolve correctly
  - single source of truth LINKS list, uniform labels across ALL pages

Idempotent: skips pages that already carry the correct nav for their location.
Run after cron regenerates accum.html / index.html, and before deploying.
"""
import re, os

REPO = os.path.dirname(os.path.abspath(__file__))

# Uniform labels — MUST match index.html exactly across every page.
LINKS = [("index.html", "🏠 หน้าแรก"), ("dipbuy.html", "Dip-Buy"),
         ("entry.html", "Entry Planner"), ("scan.html", "Market Scan"),
         ("trend.html", "Trend Rider"), ("top100.html", "Top 100"),
         ("fav.html", "⭐ โปรด"), ("liqwatch.html", "Liquidation"),
         ("radar.html", "Radar"), ("accum.html", "Accum")]

# Pages that are hubs / standalone shells with their OWN nav (iframe tabs,
# experiment pages) and must NOT receive the shared xnav.
EXCLUDE = {"dashboard.html", "scanner_v2_dashboard.html", "crypto-dash.html",
           "index_trend.html", "trend_rider_dashboard.html", "trend_rider_live.html",
           "trend_rider_live_cron.html", "trider_unified.html", "v2.html"}

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


def nav_for(fname, prefix):
    links = "\n".join('  <a href="%s%s"%s>%s</a>' % (
        prefix, u, ' class="cur"' if u == fname else '', n) for u, n in LINKS)
    return ('<nav class="xnav">\n  <span class="b">◈ CRYPTO TERMINAL</span>\n' +
            links + '\n  ' + MANUAL_BTN + '\n</nav>')


def has_new_nav(s, prefix, fname):
    if 'class="xnav"' not in s or '◈ CRYPTO TERMINAL' not in s:
        return False
    if 'xnav-css' in s:
        return False
    # broken nav: <a> tags concatenated with no whitespace -> unclickable
    if re.search(r'</a><a ', s):
        return False
    # .cur is required ONLY when this page is itself a nav target;
    # standalone tool pages (validator, accum_scan, ...) legitimately have none.
    if fname in {u for u, _ in LINKS} and 'class="cur"' not in s:
        return False
    # must carry the correct per-page prefix for its location
    if prefix == "./":
        if "../" in s:
            return False
    else:
        if "./scan.html" in s or "./index.html" in s:
            return False
    return True


def strip_old_nav(s):
    s = re.sub(r'<style id="xnav-css">.*?</style>', '', s, flags=re.S)
    s = re.sub(r'<nav class="xnav">.*?</nav>', '', s, flags=re.S)
    s = re.sub(r'<nav class="nav">.*?</nav>', '', s, flags=re.S)
    return s


def inject(path, fname, prefix):
    if not os.path.exists(path):
        return "missing"
    s = open(path, encoding="utf-8").read()
    if has_new_nav(s, prefix, fname):
        return "already-ok"
    if "</head>" not in s:
        return "no-head"
    s = strip_old_nav(s)
    s = re.sub(r'(</style>)', NAV_CSS + r'\1', s, count=1)
    if "tooltip.css" not in s:
        s = s.replace("</head>", TOOL_CSS + "\n</head>", 1)
    if "tooltip.js" not in s and "</body>" in s:
        s = s.replace("</body>", TOOL_JS + "\n</body>", 1)
    m = re.search(r"<body[^>]*>", s)
    if not m:
        return "no-body"
    s = s[:m.end()] + "\n" + nav_for(fname, prefix) + "\n" + s[m.end():]
    open(path, "w", encoding="utf-8").write(s)
    return "injected"


if __name__ == "__main__":
    targets = []  # (path, fname, prefix)
    # root pages
    for f in os.listdir(REPO):
        if f.endswith(".html") and " - Copy" not in f and f not in EXCLUDE:
            targets.append((os.path.join(REPO, f), f, "./"))
    # docs/ pages (need ../ prefix to reach repo-root siblings)
    docs = os.path.join(REPO, "docs")
    if os.path.isdir(docs):
        for f in os.listdir(docs):
            if f.endswith(".html") and " - Copy" not in f:
                targets.append((os.path.join(docs, f), f, "../"))
    for path, fname, prefix in targets:
        r = inject(path, fname, prefix)
        if r != "missing":
            print("%-12s %s" % (r, path))
