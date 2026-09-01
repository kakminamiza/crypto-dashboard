import os
import requests
import pandas as pd

class BinanceClient:
    def __init__(self, api_key=None, api_secret=None, base_url=None):
        self.api_key = api_key or os.getenv("BINANCE_API_KEY", "")
        self.api_secret = api_secret or os.getenv("BINANCE_API_SECRET", "")
        self.base_url = base_url or os.getenv("BINANCE_BASE_URL", "https://api.binance.com")
        self.session = requests.Session()
        if self.api_key:
            self.session.headers.update({"X-MBX-APIKEY": self.api_key})

    def get_klines(self, symbol, interval="4h", limit=200):
        url = f"{self.base_url}/api/v3/klines"
        params = {"symbol": symbol, "interval": interval, "limit": limit}
        r = self.session.get(url, params=params, timeout=20)
        r.raise_for_status()
        data = r.json()
        cols = [
            "open_time","open","high","low","close","volume","close_time",
            "quote_asset_volume","trades","taker_buy_base","taker_buy_quote","ignore"
        ]
        df = pd.DataFrame(data, columns=cols)
        for c in ["open", "high", "low", "close", "volume"]:
            df[c] = df[c].astype(float)
        df["open_time"] = pd.to_datetime(df["open_time"], unit="ms")
        return df[["open_time", "open", "high", "low", "close", "volume"]]

    def get_exchange_info(self):
        url = f"{self.base_url}/api/v3/exchangeInfo"
        r = self.session.get(url, timeout=20)
        r.raise_for_status()
        return r.json()

    def get_spot_symbols(self, quote_asset="USDT"):
        info = self.get_exchange_info()
        syms = []
        for s in info.get("symbols", []):
            if s.get("status") == "TRADING" and s.get("quoteAsset") == quote_asset:
                syms.append(s["symbol"])
        return syms
