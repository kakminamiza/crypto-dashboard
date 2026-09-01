def build_margin_plan(signal, cfg):
    if signal.get("level") != "A+":
        return None

    close = signal["close"]
    leverage = min(cfg["risk"]["default_leverage"], cfg["risk"]["max_leverage"])
    collateral = 100.0
    notional = collateral * leverage

    sl = close * 0.98
    tp1 = close * 1.03
    tp2 = close * 1.06
    rr = (tp1 - close) / (close - sl) if close > sl else None

    if rr is not None and rr < cfg["risk"]["min_rr"]:
        return None

    return {
        "symbol": signal["symbol"],
        "mode": "isolated_margin",
        "leverage": leverage,
        "collateral": round(collateral, 2),
        "notional": round(notional, 2),
        "entry": round(close, 6),
        "sl": round(sl, 6),
        "tp1": round(tp1, 6),
        "tp2": round(tp2, 6),
        "rr": round(rr, 2) if rr is not None else None,
    }
