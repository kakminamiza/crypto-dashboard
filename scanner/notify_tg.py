#!/usr/bin/env python3
"""
notify_tg.py — ส่งแจ้งเตือน Telegram เมื่อเจอสัญญาณใหม่ (diff vs state file).

Usage:
  python notify_tg.py --signals <json> --state <json> --source <trendrider|radar>

Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  (GitHub Actions secrets)
หากไม่มี token/chat -> ข้าม silently (ไม่พัง pipeline)
รันครั้งแรก (state ไม่มี) -> prime state โดยไม่แจ้ง (กัน burst)
"""
import os
import sys
import json
import argparse
import urllib.request


def send(token, chat, text):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({"chat_id": chat, "text": text, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=15)
        return True
    except Exception as e:
        print("[ERR] ส่ง TG ไม่ได้:", e)
        return False


def fmt(x):
    try:
        return f"{float(x):.4g}"
    except Exception:
        return str(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--signals", required=True)
    ap.add_argument("--state", required=True)
    ap.add_argument("--source", required=True)
    args = ap.parse_args()

    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("[WARN] ไม่พบ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID — ข้ามการแจ้งเตือน")
        return

    with open(args.signals, encoding="utf-8") as f:
        sigs = json.load(f)

    # รันครั้งแรก -> prime state ไม่แจ้ง
    if not os.path.exists(args.state):
        keys = [f"{args.source}:{s.get('symbol') or s.get('sym')}:{_dir(s)}" for s in sigs]
        with open(args.state, "w", encoding="utf-8") as f:
            json.dump(keys, f, ensure_ascii=False)
        print(f"[TG] prime state ({args.source}) {len(keys)} keys — ไม่แจ้งครั้งแรก")
        return

    with open(args.state, encoding="utf-8") as f:
        state = json.load(f)
    state_set = set(state)

    new = []
    cur_keys = []
    for s in sigs:
        sym = s.get("symbol") or s.get("sym")
        direction, entry, sl, tp1, tp2, reason, stars, conf, extra = _fields(s)
        if not sym or not direction:
            continue
        key = f"{args.source}:{sym}:{direction}"
        cur_keys.append(key)
        if key in state_set:
            continue
        new.append((sym, direction, s.get("price") or entry, entry, sl, tp1, tp2, reason, stars, conf, extra))

    for (sym, direction, price, entry, sl, tp1, tp2, reason, stars, conf, extra) in new:
        is_long = direction in ("LONG", "long")
        emoji = "🟢 LONG" if is_long else "🔴 SHORT"
        base = sym.replace("USDT", "")
        line = (f"🔔 <b>{emoji} · {base}</b>\n"
                f"💰 ราคา {fmt(price)}\n"
                f"🛑 SL: {fmt(sl)}\n"
                f"🎯 TP1: {fmt(tp1)} (1.5R)\n"
                f"🎯 TP2: {fmt(tp2)} (3R)\n")
        meta = f"⭐ {stars}★ | conf {conf:.0f}%" if stars else f"conf {conf:.0f}%"
        if extra:
            meta += f" | {extra}"
        line += f"{meta}\n📝 {reason}"
        send(token, chat, line)

    with open(args.state, "w", encoding="utf-8") as f:
        json.dump(cur_keys, f, ensure_ascii=False)
    print(f"[TG] แจ้งเตือน {len(new)} สัญญาณใหม่ ({args.source})")


def _dir(s):
    if "signal" in s and isinstance(s["signal"], dict):
        return s["signal"].get("signal")
    return s.get("dir")


def _fields(s):
    if "signal" in s and isinstance(s["signal"], dict):
        sg = s["signal"]
        extra = f"RSI {s.get('rsi'):.0f}" if isinstance(s.get("rsi"), (int, float)) else ""
        return (sg.get("signal"), sg.get("entry"), sg.get("sl"),
                sg.get("tp1"), sg.get("tp2"), sg.get("reason", ""),
                sg.get("stars", 0), sg.get("confidence", 0), extra)
    return (s.get("dir"), s.get("price") or s.get("entry"), s.get("sl"),
            s.get("tp1"), s.get("tp2"), "", 0, 0,
            f"ADX {s.get('adx'):.0f}" if isinstance(s.get("adx"), (int, float)) else "")


if __name__ == "__main__":
    main()
