import json
from pathlib import Path

def make_report(results, plans, cfg):
    lines = []
    lines.append("DAILY TRADING REPORT")
    lines.append("")

    for r in results[:10]:
        score = r.get("score", 0)
        if score >= cfg["signals"]["a_plus_min_score"]:
            status = "เข้าได้"
        elif score >= cfg["signals"]["watch_min_score"]:
            status = "รอ"
        else:
            status = "ไม่เข้า"

        lines.append(
            f"{r.get('symbol')} | {status} | score={r.get('score')} | "
            f"close={r.get('close')} | rsi={round(r.get('rsi', 0), 2)}"
        )

    lines.append("")
    lines.append("MARGIN PLANS")
    for p in plans:
        lines.append(json.dumps(p, ensure_ascii=False))

    text = "\n".join(lines)

    out_txt = Path(cfg["report"]["output_path"])
    out_txt.parent.mkdir(parents=True, exist_ok=True)
    out_txt.write_text(text, encoding="utf-8")

    out_json = Path(cfg["report"]["json_path"])
    out_json.write_text(
        json.dumps({"results": results, "plans": plans}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return text
