#!/usr/bin/env python3
"""Inject the shared top nav bar + tooltip/manual system into every dashboard page.
Idempotent: skips a file that already has id="xnav-css".
Run after cron regenerates accum.html / index.html."""
import re, os

REPO = os.path.dirname(os.path.abspath(__file__))
LINKS = [("index.html", "Accumulation"), ("dipbuy.html", "Dip-Buy"),
         ("entry.html", "Entry Planner"), ("scan.html", "Market Scan"),
         ("trend.html", "Trend Rider"), ("top100.html", "Top 100"),
         ("fav.html", "39 เหรียญโปรด"), ("liqwatch.html", "Liquidation Watch"),
         ("accum.html", "Accum (live)")]

BRAND = "◈ CRYPTO TERMINAL"
MARK = BRAND          # present in both injected and hand-authored navs

NAV_CSS = """<style id="xnav-css">
.xnav{display:flex;align-items:center;gap:6px;padding:10px 18px;background:#0a0e15;
 border-bottom:1px solid #26303f;flex-wrap:wrap;position:sticky;top:0;z-index:9999;
 font-family:"Segoe UI",Tahoma,"Leelawadee UI",sans-serif;font-size:13px}
.xnav .b{font-weight:800;letter-spacing:.5px;color:#38bdf8;margin-right:12px;font-size:15px}
.xnav a{padding:6px 12px;border-radius:8px;color:#93a1b5;text-decoration:none;border:1px solid transparent}
.xnav a:hover{background:#1a2130;color:#e8eef7}
.xnav a.cur{background:#3b82f6;color:#04101f;font-weight:700}
</style>"""

TOOL_CSS = '<link rel="stylesheet" href="./tooltip.css">'
TOOL_JS = '<script src="./tooltip.js"></script>'
MANUAL_BTN = '<button class="manual" title="คู่มือเครื่องมือ">ℹ️ คู่มือ</button>'


def nav_for(fname):
    links = "".join('<a href="./%s" class="%s">%s</a>' %
                    (u, "cur" if u == fname else "", n) for u, n in LINKS)
    return ('<nav class="xnav"><span class="b">' + BRAND + '</span>' +
            links + MANUAL_BTN + '</nav>')


def inject(path, fname):
    if not os.path.exists(path):
        return "missing"
    s = open(path, encoding="utf-8").read()
    if MARK in s:                      # already has a nav (injected or hand-authored)
        return "already"
    if "</head>" not in s:
        return "no-head"
    head_extra = NAV_CSS + "\n" + TOOL_CSS + "\n"
    s = s.replace("</head>", head_extra + "</head>", 1)
    # inject tooltip.js before </body>
    if "</body>" in s:
        s = s.replace("</body>", TOOL_JS + "\n</body>", 1)
    m = re.search(r"<body[^>]*>", s)
    if not m:
        return "no-body"
    s = s[:m.end()] + "\n" + nav_for(fname) + s[m.end():]
    open(path, "w", encoding="utf-8").write(s)
    return "injected"



def augment(path):
    """For pages that already have a hand-authored nav: add tooltip css/js link + manual button."""
    if not os.path.exists(path): return "missing"
    s = open(path, encoding="utf-8").read()
    changed = False
    if "./tooltip.css" not in s and "tooltip.css" not in s:
        s = s.replace("</head>", TOOL_CSS + "\n</head>", 1); changed = True
    if "./tooltip.js" not in s and "tooltip.js" not in s:
        if "</body>" in s:
            s = s.replace("</body>", TOOL_JS + "\n</body>", 1); changed = True
    # add manual button if nav lacks it
    if 'class="manual"' not in s and 'class="xnav"' in s:
        s = s.replace('</nav>', MANUAL_BTN + '</nav>', 1); changed = True
    if changed:
        open(path, "w", encoding="utf-8").write(s); return "augmented"
    return "already-tooltip"

if __name__ == "__main__":
    for fname, _ in LINKS:
        for base in (REPO, os.path.join(REPO, "docs")):
            p = os.path.join(base, fname)
            r = inject(p, fname)
            if r == "already":
                r = augment(p)
            if r != "missing":
                print("%-10s %s" % (r, p))
