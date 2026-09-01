import pandas as pd
import numpy as np

def ema(series, span):
    return series.ewm(span=span, adjust=False).mean()

def rsi(series, period=16):
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

def macd(series, fast=12, slow=26, signal=9):
    macd_line = ema(series, fast) - ema(series, slow)
    signal_line = ema(macd_line, signal)
    hist = macd_line - signal_line
    return macd_line, signal_line, hist

class SpotScanner:
    def __init__(self, client, cfg):
        self.client = client
        self.cfg = cfg

    def scan_symbol(self, symbol):
        df = self.client.get_klines(symbol, interval="4h", limit=self.cfg["strategy"]["min_history"])
        close = df["close"]
        vol = df["volume"]

        df["ema_fast"] = ema(close, self.cfg["strategy"]["ema_fast"])
        df["ema_slow"] = ema(close, self.cfg["strategy"]["ema_slow"])
        df["rsi"] = rsi(close, self.cfg["strategy"]["rsi_period"])
        df["macd"], df["macd_signal"], df["macd_hist"] = macd(
            close,
            self.cfg["strategy"]["macd_fast"],
            self.cfg["strategy"]["macd_slow"],
            self.cfg["strategy"]["macd_signal"],
        )
        df["vol_ma"] = vol.rolling(self.cfg["strategy"]["volume_ma"]).mean()

        last = df.iloc[-1]
        prev = df.iloc[-2]

        trend_up = last["close"] > last["ema_fast"] > last["ema_slow"]
        rsi_ok = 45 <= last["rsi"] <= 72 and last["rsi"] >= prev["rsi"]
        macd_ok = last["macd"] > last["macd_signal"] and last["macd_hist"] > prev["macd_hist"]
        vol_ok = last["volume"] >= last["vol_ma"]

        score = 0
        score += 30 if trend_up else 0
        score += 25 if rsi_ok else 0
        score += 25 if macd_ok else 0
        score += 20 if vol_ok else 0

        if score >= self.cfg["signals"]["a_plus_min_score"]:
            level = "A+"
        elif score >= self.cfg["signals"]["watch_min_score"]:
            level = "Watch"
        else:
            level = "Reject"

        return {
            "symbol": symbol,
            "time": str(last["open_time"]),
            "close": float(last["close"]),
            "rsi": float(last["rsi"]),
            "ema_fast": float(last["ema_fast"]),
            "ema_slow": float(last["ema_slow"]),
            "macd": float(last["macd"]),
            "macd_signal": float(last["macd_signal"]),
            "volume": float(last["volume"]),
            "vol_ma": float(last["vol_ma"]) if pd.notna(last["vol_ma"]) else None,
            "score": int(score),
            "level": level,
            "trend_up": bool(trend_up),
            "rsi_ok": bool(rsi_ok),
            "macd_ok": bool(macd_ok),
            "vol_ok": bool(vol_ok),
        }

    def scan_top(self, symbols):
        results = []
        for s in symbols:
            try:
                results.append(self.scan_symbol(s))
            except Exception as e:
                results.append({"symbol": s, "error": str(e), "level": "Reject", "score": 0})
        return sorted(results, key=lambda x: x.get("score", 0), reverse=True)
