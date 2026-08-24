"""
Futures Radar Scanner — Python port of the Cloudflare Worker (cloudflare-worker/src/index.js).
Replaces the Worker so GitHub Actions can produce ./radar_scan.json directly,
removing the Cloudflare Worker single point of failure.

Output shape (must match what radar.html expects):
  [ { symbol, price, changePct, rsi, volRatio, score, trend, atr14,
      signal: { signal, stars, confidence, entry, sl, tp1, tp2, invalidation, reason } }, ... ]

Data source: Bybit V5 (primary, CORS/geo safe) with Binance USD-M futures fallback.
"""
import os
import json
import math
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

BYBIT = "https://api.bybit.com"
HOSTS_BINANCE = [
    "https://fapi.binance.com",
    "https://fapi1.binance.com",
    "https://fapi2.binance.com",
    "https://fapi3.binance.com",
    "https://fapi4.binance.com",
]
BYBIT_TF = {"15m": "15", "4h": "240"}
BINANCE_TF = {"15m": "15m", "4h": "4h"}
MAX_SYMBOLS = int(os.environ.get("MAX_SYMBOLS", "400"))


def get_json(url, params=None, timeout=12):
    try:
        r = requests.get(url, params=params, timeout=timeout)
        if r.status_code == 200:
            return r.json()
    except Exception:
        return None
    return None


def bybit_klines(sym, tf, limit):
    iv = BYBIT_TF.get(tf, "60")
    j = get_json(f"{BYBIT}/v5/market/kline",
                 {"category": "linear", "symbol": sym, "interval": iv, "limit": limit})
    if not j or j.get("retCode") != 0:
        return None
    rows = j["result"]["list"]
    rows.reverse()  # Bybit newest-first -> ascending
    closes = [float(k[4]) for k in rows]
    highs = [float(k[2]) for k in rows]
    lows = [float(k[3]) for k in rows]
    vols = [float(k[5]) for k in rows]
    return closes, highs, lows, vols


def binance_klines(sym, tf, limit):
    iv = BINANCE_TF.get(tf, tf)
    for host in HOSTS_BINANCE:
        j = get_json(f"{host}/fapi/v1/klines",
                     {"symbol": sym, "interval": iv, "limit": limit})
        if j:
            closes = [float(k[4]) for k in j]
            highs = [float(k[2]) for k in j]
            lows = [float(k[3]) for k in j]
            vols = [float(k[5]) for k in j]
            return closes, highs, lows, vols
    return None


def klines(sym, tf, limit):
    r = bybit_klines(sym, tf, limit)
    if r:
        return r
    return binance_klines(sym, tf, limit)


# ---- indicator math (mirrors worker index.js exactly) ----
def ema(v, n):
    k = 2 / (n + 1)
    e = v[0]
    o = [e]
    for x in v[1:]:
        e = x * k + e * (1 - k)
        o.append(e)
    return o


def rsi(c, n=14):
    if len(c) < n + 1:
        return 50.0
    g = 0.0
    l = 0.0
    for i in range(len(c) - n, len(c)):
        d = c[i] - c[i - 1]
        if d >= 0:
            g += d
        else:
            l -= d
    ag = g / n
    al = l / n
    if al == 0:
        return 100.0
    return 100 - (100 / (1 + ag / al))


def macd(c):
    e12 = ema(c, 12)
    e26 = ema(c, 26)
    line = [e12[i] - e26[i] for i in range(len(c))]
    tail = line[-min(len(line), 60):]
    sig = ema(tail, 9)
    return line[-1] - sig[-1]


def bollinger(c, n=20, m=2):
    s = c[-n:]
    mid = sum(s) / n
    var = sum((x - mid) ** 2 for x in s) / n
    sd = math.sqrt(var)
    return {"upper": mid + m * sd, "mid": mid, "lower": mid - m * sd}


def volRatio(v, n=20):
    s = v[-(n + 1):-1]
    if not s:
        return 1.0
    avg = sum(s) / len(s)
    cur = v[-1]
    return cur / avg if avg > 0 else 1.0


def atr14(h, l, c):
    if len(c) < 15:
        return 0.0
    tr = [h[0] - l[0]]
    for i in range(1, len(c)):
        tr.append(max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])))
    e = sum(tr[:14]) / 14
    for i in range(14, len(tr)):
        e = (tr[i] / 14) + e * (13 / 14)
    return e


def swingTrend(c4h):
    if len(c4h) < 50:
        return "flat"
    e50 = ema(c4h, 50)
    e200 = ema(c4h, min(200, int(len(c4h) / 1.2)))
    p = c4h[-1]
    if p > e50[-1] and e50[-1] > e200[-1]:
        return "up"
    if p < e50[-1] and e50[-1] < e200[-1]:
        return "down"
    return "flat"


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def computeScore(rsiV, mh, price, bb, vr):
    if rsiV is None or not math.isfinite(rsiV):
        return 0
    s = 0.0
    s += (rsiV - 50) * 1.3
    s += clamp(mh * 4000, -25, 25)
    br = bb["upper"] - bb["lower"]
    bp = (price - bb["lower"]) / br if br > 0 else 0.5
    s += (bp - 0.5) * 40
    if vr > 1.4:
        s *= min(1.4, 1 + (vr - 1.4) * 0.2)
    return round(clamp(s, -100, 100))


def scoreToStars(sc):
    a = abs(sc)
    return 5 if a >= 80 else 4 if a >= 65 else 3 if a >= 50 else 2 if a >= 35 else 1 if a >= 20 else 0


def computeSignal(d):
    if d["rsi"] >= 70 or d["rsi"] <= 30:
        return {"signal": "WAIT", "stars": 0, "confidence": 0,
                "reason": "RSI overbought (≥70)" if d["rsi"] >= 70 else "RSI oversold (≤30)"}
    score = d["score"]
    if score >= 50:
        direction = "LONG"
    elif score <= -50:
        direction = "SHORT"
    elif score >= 25:
        direction = "LONG"
    elif score <= -25:
        direction = "SHORT"
    else:
        direction = "WAIT"
    if direction == "WAIT":
        return {"signal": "WAIT", "stars": scoreToStars(score),
                "confidence": abs(score), "reason": "ไซด์เวย์"}
    risk = d["atr"] * 2
    if not risk:
        return {"signal": "WAIT", "stars": 0, "confidence": 0, "reason": "ATR=0"}
    price = d["price"]
    if direction == "LONG":
        entry = price
        sl = entry - risk
        tp1 = entry + risk * 1.5
        tp2 = entry + risk * 3
        inv = entry - risk * 1.25
    else:
        entry = price
        sl = entry + risk
        tp1 = entry - risk * 1.5
        tp2 = entry - risk * 3
        inv = entry + risk * 1.25
    conf = min(100, abs(score))
    if (direction == "LONG" and d["trend"] == "up") or (direction == "SHORT" and d["trend"] == "down"):
        conf = min(100, conf + 10)
    if d["vr"] < 1.0:
        conf -= 10
    if direction == "LONG" and d["rsi"] < 35:
        conf += 5
    if direction == "SHORT" and d["rsi"] > 65:
        conf += 5
    conf = max(0, min(100, conf))
    reasons = []
    br = d["bb"]["upper"] - d["bb"]["lower"]
    bp = (price - d["bb"]["lower"]) / br if br > 0 else 0.5
    if direction == "LONG":
        if d["rsi"] < 35:
            reasons.append("RSI oversold")
        elif d["rsi"] < 50:
            reasons.append("RSI ต่ำ")
        if d["mh"] > 0:
            reasons.append("MACD +")
        if bp < 0.25:
            reasons.append("BB ล่าง")
        if d["trend"] == "up":
            reasons.append("4H ขาขึ้น")
        if d["vr"] > 1.4:
            reasons.append("Vol เพิ่ม")
    else:
        if d["rsi"] > 65:
            reasons.append("RSI overbought")
        elif d["rsi"] > 50:
            reasons.append("RSI สูง")
        if d["mh"] < 0:
            reasons.append("MACD -")
        if bp > 0.75:
            reasons.append("BB บน")
        if d["trend"] == "down":
            reasons.append("4H ขาลง")
        if d["vr"] > 1.4:
            reasons.append("Vol เพิ่ม")
    return {"signal": direction, "stars": scoreToStars(score), "confidence": conf,
            "entry": entry, "sl": sl, "tp1": tp1, "tp2": tp2, "invalidation": inv,
            "reason": " · ".join(reasons) if reasons else "โมเมนตัมรวม"}


def get_universe():
    """Return list of (symbol, turnover, changePct_fraction)."""
    j = get_json(f"{BYBIT}/v5/market/tickers", {"category": "linear"})
    if j and j.get("retCode") == 0:
        lst = j["result"]["list"]
        usdt = [t for t in lst
                if t["symbol"].endswith("USDT") and "_" not in t["symbol"]
                and (float(t.get("turnover24h", 0)) or 0) >= 500000]
        usdt.sort(key=lambda t: float(t.get("turnover24h", 0)), reverse=True)
        out = [(t["symbol"], float(t.get("turnover24h", 0)),
                float(t.get("price24hPcnt", 0))) for t in usdt[:MAX_SYMBOLS]]
        if out:
            return out
    # Bybit down -> Binance fallback
    print("Bybit tickers unavailable, using Binance for universe...")
    info = None
    for host in HOSTS_BINANCE:
        info = get_json(f"{host}/fapi/v1/ticker/24hr")
        if info:
            break
    if not info:
        return []
    cands = [t for t in info if t["symbol"].endswith("USDT")
             and float(t.get("quoteVolume", 0)) >= 500000]
    cands.sort(key=lambda t: float(t.get("quoteVolume", 0)), reverse=True)
    return [(t["symbol"], float(t.get("quoteVolume", 0)),
             float(t.get("priceChangePercent", 0)) / 100) for t in cands[:MAX_SYMBOLS]]


def scan_symbol(x):
    sym, turnover, chg = x
    try:
        k15 = klines(sym, "15m", 200)
        h4 = klines(sym, "4h", 210)
        if not k15 or not h4:
            return None
        c15, h15, l15, v15 = k15
        c4 = h4[0]
        if len(c15) < 100:
            return None
        c = c15
        v = v15
        s5 = computeScore(rsi(c[-20:], 14), macd(c[-20:]), c[-1],
                          bollinger(c[-20:], 20, 2), volRatio(v[-20:], 20))
        s15 = computeScore(rsi(c, 14), macd(c), c[-1],
                           bollinger(c, 20, 2), volRatio(v, 20))
        c30 = c[:-1]
        v30 = v[:-1]
        s30 = computeScore(rsi(c30, 14), macd(c30), c[-1],
                           bollinger(c30, 20, 2), volRatio(v30, 20))
        score = round(s5 * 0.25 + s15 * 0.5 + s30 * 0.25)
        stars = scoreToStars(score)
        rsiV = rsi(c, 14)
        mh = macd(c)
        bb = bollinger(c, 20, 2)
        vr = volRatio(v, 20)
        atr = atr14(h15, l15, c15)
        trend = swingTrend(c4)
        d = {"rsi": rsiV, "mh": mh, "bb": bb, "vr": vr, "score": score,
             "trend": trend, "atr": atr, "price": c[-1]}
        sig = computeSignal(d)
        if sig["signal"] == "WAIT" or sig["stars"] < 3:
            return None
        if vr < 0.5:
            return None
        return {
            "symbol": sym,
            "price": d["price"],
            "changePct": chg * 100,
            "rsi": rsiV,
            "volRatio": vr,
            "score": score,
            "trend": trend,
            "atr14": atr,
            "signal": {
                "signal": sig["signal"],
                "stars": sig["stars"],
                "confidence": sig["confidence"],
                "entry": sig["entry"],
                "sl": sig["sl"],
                "tp1": sig["tp1"],
                "tp2": sig["tp2"],
                "invalidation": sig["invalidation"],
                "reason": sig["reason"],
            },
        }
    except Exception:
        return None


def main():
    universe = get_universe()
    if not universe:
        print("empty universe (both Bybit + Binance failed)")
        return
    print(f"Radar scanning {len(universe)} symbols (concurrent)...")
    out = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(scan_symbol, x) for x in universe]
        for fu in as_completed(futs):
            r = fu.result()
            if r:
                out.append(r)
    out.sort(key=lambda r: (-r["signal"]["stars"], -r["signal"]["confidence"]))
    default = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "radar_scan.json")
    out_path = os.environ.get("OUT_JSON", default)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"Wrote {out_path} with {len(out)} signals")


if __name__ == "__main__":
    main()
