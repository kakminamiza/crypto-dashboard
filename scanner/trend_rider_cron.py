"""
Trend Rider Cron Scanner - headless version for the GitHub Pages auto-update.
Scans Binance USD-M perps on a fixed TF, writes a static self-contained HTML
snapshot (trend_rider_live_cron.html) that the GitHub Action pushes to the repo.

Runs on GitHub Actions (Linux, US IP) -> Binance futures API is geo-filtered,
so we try several regional futures hosts and fall back on failure.
"""
import os
import time
import json
import datetime
import requests

# Binance USD-M Futures regional hosts (failover order).
# GitHub runners sit on US IPs where fapi.binance.com may 451 -> rotate.
HOSTS = [
    "https://fapi.binance.com",
    "https://fapi1.binance.com",
    "https://fapi2.binance.com",
    "https://fapi3.binance.com",
    "https://fapi4.binance.com",
]

EMA_FAST, EMA_SLOW, EMA_TREND = 20, 50, 200
ADX_LEN = 14
ADX_THRESH = 25.0
SL_ATR_MULT = 2.0
TP1_R, TP2_R = 1.5, 3.0
MIN_VOL_USD = 5e6
SIGNAL_TF = "1h"
MTF = ["5m", "15m", "1h", "4h", "1d"]


def get(path, params=None):
    """GET a Binance futures path, rotating through regional hosts on failure."""
    for host in HOSTS:
        try:
            r = requests.get(host + path, params=params, timeout=15)
            if r.status_code == 200:
                return r.json()
        except Exception:
            continue
    return None


BYBIT = "https://api.bybit.com"
BYBIT_INTERVAL = {"5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D"}

def klines_bybit(sym, tf, limit=350):
    """Fallback klines from Bybit V5 (global, not geo-blocked like Binance US)."""
    iv = BYBIT_INTERVAL.get(tf, "60")
    try:
        r = requests.get(f"{BYBIT}/v5/market/kline",
                         params={"category": "linear", "symbol": sym,
                                 "interval": iv, "limit": limit}, timeout=15)
        j = r.json()
        if j.get("retCode") != 0:
            return None
        rows = j["result"]["list"]
        rows.reverse()  # Bybit returns newest-first -> ascending to match Binance
        return ([float(k[1]) for k in rows], [float(k[2]) for k in rows],
                [float(k[3]) for k in rows], [float(k[4]) for k in rows],
                [float(k[5]) for k in rows])
    except Exception:
        return None

def klines(sym, tf, limit=350):
    data = get("/fapi/v1/klines", {"symbol": sym, "interval": tf, "limit": limit})
    if data:
        return ([float(k[1]) for k in data], [float(k[2]) for k in data],
                [float(k[3]) for k in data], [float(k[4]) for k in data],
                [float(k[5]) for k in data])
    # Binance geo-blocked (e.g. US GitHub runner) -> fall back to Bybit V5
    return klines_bybit(sym, tf, limit)


def ema(vals, n):
    k = 2/(n+1); e = vals[0]; out = [e]
    for x in vals[1:]:
        e = x*k + e*(1-k); out.append(e)
    return out


def rma(vals, n):
    a = 1/n; e = vals[0]; out = [e]
    for x in vals[1:]:
        e = x*a + e*(1-a); out.append(e)
    return out


def atr(h, l, c, n=14):
    tr = [h[0]-l[0]]
    for i in range(1, len(c)):
        tr.append(max(h[i]-l[i], abs(h[i]-c[i-1]), abs(l[i]-c[i-1])))
    return rma(tr, n)


def adx(h, l, c, n=14):
    plus_dm, minus_dm, tr = [], [], []
    for i in range(1, len(c)):
        up = h[i]-h[i-1]; dn = l[i-1]-l[i]
        plus_dm.append(up if (up > dn and up > 0) else 0.0)
        minus_dm.append(dn if (dn > up and dn > 0) else 0.0)
        tr.append(max(h[i]-l[i], abs(h[i]-c[i-1]), abs(l[i]-c[i-1])))
    if len(tr) < n+1:
        return [0.0]
    atr_r = rma(tr, n)
    pdi = [100*p/a if a else 0 for p, a in zip(rma(plus_dm, n), atr_r)]
    mdi = [100*m/a if a else 0 for m, a in zip(rma(minus_dm, n), atr_r)]
    dx = [100*abs(p-m)/(p+m) if (p+m) else 0 for p, m in zip(pdi, mdi)]
    return rma(dx, n)


def state(kl):
    o, h, l, c, v = kl
    ef, es, et = ema(c, EMA_FAST)[-1], ema(c, EMA_SLOW)[-1], ema(c, EMA_TREND)[-1]
    p = c[-1]
    if ef > es and p > et: return "BULL"
    if ef < es and p < et: return "BEAR"
    return "NEUTRAL"


def analyze(sym):
    kl = klines(sym, SIGNAL_TF)
    if not kl or len(kl[3]) < 210:
        return None
    o, h, l, c, v = kl
    ef = ema(c, EMA_FAST); es = ema(c, EMA_SLOW); et = ema(c, EMA_TREND)
    a = adx(h, l, c, ADX_LEN); at = atr(h, l, c, 14)
    price = c[-1]; adx_now = a[-1]; atr_now = at[-1]
    states = {}
    for tf in MTF:
        k = klines(sym, tf, 260)
        states[tf] = state(k) if k else "NEUTRAL"
    bull_n = sum(1 for s in states.values() if s == "BULL")
    bear_n = sum(1 for s in states.values() if s == "BEAR")
    direction = None
    if ef[-1] > es[-1] and price > et[-1] and adx_now > ADX_THRESH and bull_n >= 3:
        direction = "long"
    elif ef[-1] < es[-1] and price < et[-1] and adx_now > ADX_THRESH and bear_n >= 3:
        direction = "short"
    if not direction:
        return None
    entry = price
    if direction == "long":
        sl = entry - SL_ATR_MULT*atr_now; risk = entry - sl
        tp1 = entry + TP1_R*risk; tp2 = entry + TP2_R*risk
    else:
        sl = entry + SL_ATR_MULT*atr_now; risk = sl - entry
        tp1 = entry - TP1_R*risk; tp2 = entry - TP2_R*risk
    return dict(sym=sym, dir=direction, price=entry, sl=sl, tp1=tp1, tp2=tp2,
                adx=adx_now, bull=bull_n, bear=bear_n, states=states)


def fmt(x):
    return f"{x:.6g}"
def fmtVol(v):
    return v>=1e9 and f"{v/1e9:.2f}B" or v>=1e6 and f"{v/1e6:.1f}M" or f"{v/1e3:.0f}K"

def build_html(results, uni_vol):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = ""
    for i, r in enumerate(results[:10], 1):
        is_long = r["dir"] == "long"
        badge = ("<span class='b long'>🟢 LONG</span>" if is_long
                 else "<span class='b short'>🔴 SHORT</span>")
        dots = ""
        for tf in MTF:
            s = r["states"][tf]
            cls = "d-bull" if s == "BULL" else "d-bear" if s == "BEAR" else "d-neu"
            dots += f"<span class='dot {cls}' title='{tf}:{s}'>{tf}</span>"
        rows += f"""
        <tr class='{'r-long' if is_long else 'r-short'}'>
          <td class='rank'>{i}</td><td>{badge}</td>
          <td class='sym'>{r['sym'].replace('USDT','')}<span class='q'>USDT</span></td>
          <td class='num'>{fmt(r['price'])}</td><td class='num sl'>{fmt(r['sl'])}</td>
          <td class='num tp'>{fmt(r['tp1'])}<span class='rr'>1.5R</span></td>
          <td class='num tp'>{fmt(r['tp2'])}<span class='rr'>3R</span></td>
          <td class='num adx'>{r['adx']:.1f}</td>
          <td class='vol'>{fmtVol(uni_vol.get(r['sym'],0))}</td>
          <td class='mtf'><div class='dots'>{dots}</div><div class='ms'>{r['bull']}B / {r['bear']}S</div></td>
        </tr>"""
    if not results:
        rows = "<tr><td colspan='10' class='empty'>ไม่มีสัญญาณผ่านเกณฑ์ตอนนี้</td></tr>"
    return f"""<!DOCTYPE html><html lang='th'><head><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Trend Rider Live (cron)</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'Segoe UI',Roboto,sans-serif;background:#0b0e14;color:#e6e6e6;padding:20px}}
.wrap{{max-width:1200px;margin:0 auto}}
h1{{font-size:22px;background:linear-gradient(90deg,#22c55e,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}}
.sub{{color:#8b93a7;font-size:12px;margin-top:4px}}
table{{width:100%;border-collapse:collapse;background:#111620;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.4);margin-top:14px}}
th{{background:#0f141d;color:#8b93a7;font-size:11px;text-transform:uppercase;letter-spacing:.5px;padding:11px 9px;text-align:left}}
td{{padding:11px 9px;border-top:1px solid #1b2230;font-size:13px;vertical-align:middle}}
tr:hover td{{background:#161d2b}}
.rank{{color:#5b6478;font-weight:700;width:26px}}
.sym{{font-weight:700;font-size:14px}} .q{{color:#5b6478;font-size:9px;margin-left:2px}}
.num{{font-variant-numeric:tabular-nums;text-align:right;font-weight:600}}
.sl{{color:#f87171}} .tp{{color:#34d399}}
.rr{{display:block;font-size:9px;color:#5b6478;font-weight:400}}
.adx{{color:#fbbf24;text-align:center}} .vol{{color:#8b93a7;text-align:right;font-size:12px}}
.b{{padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700}}
.b.long{{background:rgba(34,197,94,.15);color:#22c55e}} .b.short{{background:rgba(239,68,68,.15);color:#ef4444}}
.r-long{{border-left:3px solid #22c55e}} .r-short{{border-left:3px solid #ef4444}}
.dots{{display:flex;gap:3px}} .dot{{font-size:8px;padding:2px 4px;border-radius:4px;color:#0b0e14;font-weight:700}}
.d-bull{{background:#22c55e}} .d-bear{{background:#ef4444}} .d-neu{{background:#3b4354;color:#8b93a7}}
.ms{{font-size:10px;color:#8b93a7;margin-top:3px}} .mtf{{min-width:130px}}
.empty{{text-align:center;color:#5b6478;padding:30px}}
.foot{{color:#5b6478;font-size:11px;margin-top:14px;text-align:center}}
</style></head><body><div class='wrap'>
<h1>🟢 Trend Rider Live — Snapshot</h1>
<div class='sub'>อัปเดตอัตโนมัติทุก 1 ชม. · EMA 20/50/200 · ADX(14)&gt;25 · MTF 5m/15m/1h/4h/1D · SL=ATR×2 · TF={SIGNAL_TF}</div>
<table><thead><tr><th>#</th><th>Signal</th><th>เหรียญ</th><th>Price</th><th>SL</th><th>TP1</th><th>TP2</th><th>ADX</th><th>Vol 24h</th><th>MTF</th></tr></thead>
<tbody>{rows}</tbody></table>
<div class='foot'>สร้างโดย GitHub Actions cron @ {ts} · ข้อมูลจาก Binance USD-M Futures</div>
</div></body></html>"""


def main():
    info = get("/fapi/v1/ticker/24hr")
    if info:
        cands = [t for t in info if t["symbol"].endswith("USDT")
                 and float(t["quoteVolume"]) > MIN_VOL_USD*20]
        cands.sort(key=lambda t: float(t["quoteVolume"]), reverse=True)
        universe = [t["symbol"] for t in cands[:120]]
        vmap = {t["symbol"]: float(t["quoteVolume"]) for t in cands}
    else:
        # Binance blocked -> build universe from Bybit tickers (turnover24h = quote vol)
        print("Binance unavailable, using Bybit tickers for universe...")
        try:
            r = requests.get(f"{BYBIT}/v5/market/tickers",
                             params={"category": "linear"}, timeout=20)
            j = r.json()
            lst = j.get("result", {}).get("list", [])
            cands = [t for t in lst if t["symbol"].endswith("USDT")
                     and float(t.get("turnover24h", 0)) > MIN_VOL_USD*20]
            cands.sort(key=lambda t: float(t.get("turnover24h", 0)), reverse=True)
            universe = [t["symbol"] for t in cands[:120]]
            vmap = {t["symbol"]: float(t.get("turnover24h", 0)) for t in cands}
        except Exception as e:
            print("cannot fetch universe (Binance + Bybit failed):", e); return
    if not universe:
        print("empty universe"); return
    print(f"Scanning {len(universe)} symbols...")
    results = []
    for i, sym in enumerate(universe):
        r = analyze(sym)
        if r: results.append(r)
    results.sort(key=lambda x: (x["bull"] if x["dir"]=="long" else x["bear"])*20 + x["adx"], reverse=True)
    # Output path: env override, else repo root trend_rider_live_cron.html
    default = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "trend_rider_live_cron.html")
    out = os.environ.get("OUT_HTML", default)
    with open(out, "w", encoding="utf-8") as f:
        f.write(build_html(results, vmap))
    print(f"Wrote {out} with {len(results)} signals")
    # Signals JSON for Telegram notify (shape: sym, dir, price, sl, tp1, tp2, adx)
    js = [{"sym": r["sym"], "dir": r["dir"], "price": r["price"], "sl": r["sl"],
           "tp1": r["tp1"], "tp2": r["tp2"], "adx": r["adx"]} for r in results]
    js_path = os.environ.get("OUT_JSON", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "trend_rider_live_cron_signals.json"))
    with open(js_path, "w", encoding="utf-8") as f:
        json.dump(js, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
