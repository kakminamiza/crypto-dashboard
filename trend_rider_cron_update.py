#!/usr/bin/env python3
"""
Cron job: scan Binance -> build static Trend Rider snapshot -> git push.
Runs every 1h. Updates trend_rider_live_cron.html in the crypto-dashboard repo.
"""
import os, subprocess, sys, datetime

REPO = r"C:\Users\Hello\crypto_dash_repo"
SCAN = r"C:\Users\Hello\scan\trend_rider_cron.py"
HTML_OUT = os.path.join(REPO, "trend_rider_live_cron.html")

def run(cmd):
    print("$ " + cmd)
    r = subprocess.run(cmd, shell=True, cwd=REPO,
                       capture_output=True, text=True)
    print(r.stdout[-1500:] if r.stdout else "", end="")
    if r.stderr: print("STDERR:", r.stderr[-800:], end="")
    return r.returncode == 0

if __name__ == "__main__":
    print("=== Trend Rider cron @", datetime.datetime.now().isoformat(), "===")
    ok = run(f'uv run --with requests python "{SCAN}"')
    if not ok:
        print("SCAN FAILED - abort")
        sys.exit(1)
    run('git add -A')
    run('git commit -q -m "auto: trend rider update ' + datetime.datetime.now().strftime("%Y-%m-%d %H:%M") + '"')
    run('git push origin main')
    print("=== done ===")
