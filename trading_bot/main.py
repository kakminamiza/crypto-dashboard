import yaml
from binance_client import BinanceClient
from spot_scanner import SpotScanner
from signal_scorer import classify
from margin_planner import build_margin_plan
from report_generator import make_report

def load_cfg():
    with open("config.yaml", "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

def main():
    cfg = load_cfg()
    client = BinanceClient(base_url="https://api.binance.com")

    symbols = client.get_spot_symbols(cfg["app"]["quote_asset"])[:cfg["app"]["top_n_symbols"]]
    scanner = SpotScanner(client, cfg)
    results = scanner.scan_top(symbols)

    for r in results:
        r["decision"] = classify(r, cfg)

    plans = [build_margin_plan(r, cfg) for r in results]
    plans = [p for p in plans if p]

    report = make_report(results, plans, cfg)
    print(report)

if __name__ == "__main__":
    main()
