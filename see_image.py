import sys, json, urllib.request

IMG = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Hello\AppData\Local\hermes\cache\images\img_c6b959dd14ad.png"
PROMPT = sys.argv[2] if len(sys.argv) > 2 else "อธิบายสิ่งที่เห็นในภาพนี้โดยละเอียด เป็นภาษาไทย อะไรคือปัญหา หรือสิ่งผิดปกติ"

with open(IMG, "rb") as f:
    b64 = __import__("base64").b64encode(f.read()).decode()

payload = {
    "model": "qwen2.5vl:7b",
    "prompt": PROMPT,
    "images": [b64],
    "stream": False,
}
req = urllib.request.Request(
    "http://localhost:11434/api/generate",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=180) as r:
    out = json.loads(r.read().decode())
print(out.get("response", "(ไม่มีคำตอบ)"))
