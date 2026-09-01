def classify(result, cfg):
    score = result.get("score", 0)
    if score >= cfg["signals"]["a_plus_min_score"]:
        return "เข้าได้"
    if score >= cfg["signals"]["watch_min_score"]:
        return "รอ"
    return "ไม่เข้า"
