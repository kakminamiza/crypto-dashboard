#!/usr/bin/env python3
# signal_bot.py - ส่งสัญญาณ Dip-Buy เข้า Telegram อัตโนมัติ
# รัน: python signal_bot.py  (ทิ้งไว้เครื่องรันตลอดเวลา)
# ต้องตั้ง env: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
import os, time, json, urllib.request, urllib.error

FAPI = "https://fapi.binance.com"
EMA_FAST, EMA_SLOW, EMA_TREND = 20, 50, 200
ADX_LEN, ADX_THRESH = 14, 20
RSI_LEN = 14
MTF = ["5m", "15m", "1h", "4h", "1d"]
SIGNAL_TF = "1h"
TOP_N = 50
SLEEP_SEC = 300  # สแกนทุก 5 นาที

def fetch_json(url, retries=3):
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode())
        except Exception:
            time.sleep(2)
    return None

def ema(v, n):
    k = 2 / (n + 1); e = v[0]; o = [e]
    for i in range(1, len(v)):
        e = v[i] * k + e * (1 - k); o.append(e)
    return o

def rma(v, n):
    s = sum(v[:n]) / n if len(v) >= n else v[0]; o = [s]
    for i in range(1, len(v)):
        s = v[i] / n + s * (1 - 1 / n); o.append(s)
    return o

def atr(h, l, c, n=14):
    tr = [h[0] - l[0]]
    for i in range(1, len(c)):
        tr.append(max(h[i] - l[i], abs(h[i] - c[i-1]), abs(l[i] - c[i-1])))
    return rma(tr, n)

def adx(h, l, c, n=14):
    pdm = [0]; mdm = [0]
    tr = [max(h[0]-l[0], abs(h[0]-c[0]), abs(l[0]-c[0]))]
    for i in range(1, len(c)):
        up = h[i]-h[i-1]; dn = l[i-1]-l[i]
        pdm.append(up > dn and up > 0 and up or 0)
        mdm.append(dn > up and dn > 0 and dn or 0)
        tr.append(max(h[i]-l[i], abs(h[i]-c[i-1]), abs(l[i]-c[i-1])))
    ar = rma(tr, n)
    pdi = [ar[i] and 100*pdm[i]/ar[i] or 0 for i in range(len(pdm))]
    mdi = [ar[i] and 100*mdm[i]/ar[i] or 0 for i in range(len(mdm))]
    dx = [0]
    for i in range(1, len(pdi)):
        dx.append((pdi[i]+mdi[i]) and 100*abs(pdi[i]-mdi[i])/(pdi[i]+mdi[i]) or 0)
    return rma(dx, n)

def rsi(c, n=14):
    g = [0]; ls = [0]
    for i in range(1, len(c)):
        d = c[i]-c[i-1]; g.append(d > 0 and d or 0); ls.append(d < 0 and -d or 0)
    if len(g)-1 < n: return [50]*len(c)
    ag = rma(g[1:], n); al = rma(ls[1:], n); out = []
    for i in range(len(c)):
        if i < n: out.append(50); continue
        gg = ag[i-1]; ll = al[i-1]
        out.append(100 if not ll else 100-100/(1+gg/ll))
    return out

def klines(sym, tf, limit=300):
    d = fetch_json(f"{FAPI}/fapi/v1/klines?symbol={sym}&interval={tf}&limit={limit}")
    if not d: return None
    return {"h": [float(k[2]) for k in d], "l": [float(k[3]) for k in d], "c": [float(k[4]) for k in d]}

def state_of(k):
    if not k or len(k["c"]) < 210: return "NEUTRAL"
    ef, es, et = ema(k["c"], EMA_FAST), ema(k["c"], EMA_SLOW), ema(k["c"], EMA_TREND)
    p = k["c"][-1]
    if ef[-1] > es[-1] and p > et[-1]: return "BULL"
    if ef[-1] < es[-1] and p < et[-1]: return "BEAR"
    return "NEUTRAL"

def analyze(sym, vol):
    k = klines(sym, SIGNAL_TF, 300)
    if not k or len(k["c"]) < 210: return None
    ef, es, et = ema(k["c"], EMA_FAST), ema(k["c"], EMA_SLOW), ema(k["c"], EMA_TREND)
    a = adx(k["h"], k["l"], k["c"], ADX_LEN); at = atr(k["h"], k["l"], k["c"], 14)
    price = k["c"][-1]; adxNow = a[-1]; atrNow = at[-1]
    states = {tf: state_of(klines(sym, tf, 260)) for tf in MTF}
    bullBias = states["4h"] == "BULL" and states["1d"] != "BEAR"
    bearBias = states["4h"] == "BEAR" and states["1d"] != "BULL"
    bull = list(states.values()).count("BULL"); bear = list(states.values()).count("BEAR")
    rc = rsi(k["c"], RSI_LEN); rsiNow = rc[-1]
    # simplified pullback via recent low
    low = min(k["l"][-20:]); high = max(k["h"][-20:])
    dipped = (high - price) / price >= 1.2 * atrNow / price
    rised = (price - low) / price >= 1.2 * atrNow / price
    longOK = bullBias and adxNow > ADX_THRESH and price > et[-1] and dipped and rsiNow >= 45 and rsiNow <= 70
    shortOK = bearBias and adxNow > ADX_THRESH and price < et[-1] and rised and rsiNow <= 55 and rsiNow >= 30
    if not longOK and not shortOK: return None
    if vol < 5e6: return None
    dir = "long" if longOK else "short"
    sl = price - 2*atrNow if dir == "long" else price + 2*atrNow
    return {"sym": sym, "dir": dir, "price": price, "sl": sl,
            "tp1": price + 1.5*(price-sl) if dir == "long" else price - 1.5*(sl-price),
            "tp2": price + 3*(price-sl) if dir == "long" else price - 3*(sl-price),
            "adx": adxNow, "rsi": rsiNow, "bull": bull, "bear": bear, "vol": vol}

def send_telegram(text):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("[WARN] ไม่พบ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID ใน env")
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({"chat_id": chat, "text": text, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=15)
    except Exception as e:
        print("[ERR] ส่ง TG ไม่ได้:", e)

def main():
    print("=== Signal Bot เริ่มทำงาน ===")
    print(f"สแกน {TOP_N} เหรียญ TF={SIGNAL_TF} ทุก {SLEEP_SEC} วิ")
    seen = set()
    while True:
        try:
            info = fetch_json(f"{FAPI}/fapi/v1/ticker/24hr")
            if not info:
                time.sleep(30); continue
            perps = {t["symbol"] for t in info if t["symbol"].endswith("USDT")}
            cands = sorted([t for t in info if t["symbol"] in perps and float(t["quoteVolume"]) > 1e7],
                           key=lambda t: -float(t["quoteVolume"]))[:TOP_N]
            signals = []
            for t in cands:
                r = analyze(t["symbol"], float(t["quoteVolume"]))
                if r: signals.append(r)
            for r in signals:
                key = r["sym"] + "|" + r["dir"]
                if key not in seen:
                    seen.add(key)
                    sym = r["sym"].replace("USDT", "")
                    emoji = "🟢 LONG" if r["dir"] == "long" else "🔴 SHORT"
                    msg = (f"🔔 <b>สัญญาณ Dip-Buy {emoji}</b>\n"
                           f"เหรียญ: <b>{sym}</b>\n"
                           f"ราคา: {r['price']:.4f}\n"
                           f"SL: {r['sl']:.4f}\n"
                           f"TP1: {r['tp1']:.4f} (1.5R)\n"
                           f"TP2: {r['tp2']:.4f} (3R)\n"
                           f"ADX: {r['adx']:.1f} | RSI: {r['rsi']:.1f}\n"
                           f"MTF: {r['bull']}B / {r['bear']}S")
                    send_telegram(msg)
                    print(f"[SIGNAL] {sym} {r['dir']}")
            print(f"[OK] สแกนรอบนี้ {len(signals)} สัญญาณ | รอ {SLEEP_SEC} วิ")
        except Exception as e:
            print("[ERR] loop:", e)
        time.sleep(SLEEP_SEC)

if __name__ == "__main__":
    main()
