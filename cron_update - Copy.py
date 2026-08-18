#!/usr/bin/env python3
"""
Cron job: scan Binance -> build static Accumulation Scanner dashboard -> git push.
Runs every 2h. Updates docs/accum.html (NOT index.html — root is now the live
Trend Rider real-time dashboard, which must NOT be overwritten by this cron).
"""
import os, subprocess, sys, datetime

REPO = r"C:\Users\Hello\crypto_dash_repo"
SCAN = r"C:\Users\Hello\scan\trend_rider.py"
HTML_OUT = os.path.join(REPO, "accum.html")   # ROOT: Pages source = repo root
HTML_OUT2 = os.path.join(REPO, "docs", "accum.html")

def run(cmd):
    print("$ " + cmd)
    r = subprocess.run(cmd, shell=True, cwd=REPO,
                       capture_output=True, text=True)
    print(r.stdout[-1500:] if r.stdout else "", end="")
    if r.stderr: print("STDERR:", r.stderr[-800:], end="")
    return r.returncode == 0

if __name__ == "__main__":
    print("=== Cron scan @", datetime.datetime.now().isoformat(), "===")
    # 1. run scanner (writes HTML to C:\Users\Hello\trend_rider_dashboard.html)
    ok = run(f'python "{SCAN}"')
    if not ok:
        print("SCAN FAILED - abort")
        sys.exit(1)
    # 2. copy fresh HTML into repo
    run(f'copy /Y "C:\\Users\\Hello\\trend_rider_dashboard.html" "{HTML_OUT}"')
    run(f'copy /Y "C:\\Users\\Hello\\trend_rider_dashboard.html" "{HTML_OUT2}"')
    # 2b. re-inject the shared top nav (cron overwrites these files each run)
    run('python inject_nav.py')
    # 3. git commit + push
    run('git add -A')
    run('git commit -q -m "auto: dashboard update ' + datetime.datetime.now().strftime("%Y-%m-%d %H:%M") + '"')
    run('git push origin main')
    print("=== done ===")
