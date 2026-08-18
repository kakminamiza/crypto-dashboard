# แก้บั๊ก dipbuy.html + radar.html Implementation Plan

**Goal:** แก้ 2 error ที่พี่กั๊กเจอใน console — (1) `TOOL_DATA has already been declared` และ (2) CORS / 404 จาก Binance Futures data endpoints

**Architecture:** แก้จุดเกิดบั๊กโดยตรง — แยก base URL สำหรับ data endpoints + ลบ inline TOOL_DATA ซ้ำใน radar.html

**Tech Stack:** HTML + vanilla JS + Binance public REST API (client-side, CORS-enabled endpoints only)

---

## สรุปการสำรวจ (read-only แล้ว)

**บั๊ก 1 — TOOL_DATA ซ้ำ:**
- `dipbuy.html` → ปกติ (inline=0, tooltip.js src=1) ไม่ใช่ต้นเหตุ
- `radar.html` (หน้าเก่า ไม่อยู่ใน nav) → มี `const TOOL_DATA` inline ที่บรรทัด 613 **+ โหลด `./tooltip.js` ที่มี TOOL_DATA อีก** (บรรทัด 1448) = ประกาศ 2 รอบ → error
- `radar - Copy.html` เหมือนกัน

**บั๊ก 2 — CORS / URL ผิดรูป ใน dipbuy.html:**
- `FAPI = "https://fapi.binance.com/fapi/v1/"` (บรรทัด 189)
- บรรทัด 244, 261, 298 ใช้ `FAPI+`futures/data/...`` → ได้ `.../fapi/v1/futures/data/...` **ผิด path** (ถูกต้องคือ `.../futures/data/...` ไม่มี `/fapi/v1/`)
- บรรทัด 272 ใช้ `FAPI+`fapi/v1/trades?...`` → ได้ `.../fapi/v1/fapi/v1/trades` **ซ้ำ fapi/v1**
- เทสต์จริง: endpoint เหล่านี้ **เปิด CORS (ACAO=*)** ที่ path ถูกต้อง:
  - `https://fapi.binance.com/futures/data/openInterestHist` ✅ OPEN
  - `https://fapi.binance.com/futures/data/topLongShortPositionRatio` ✅ OPEN
  - `https://fapi.binance.com/fapi/v1/trades` ✅ OPEN
  - `https://fapi.binance.com/futures/data/openInterest` ❌ 404 (endpoint นี้ไม่มี หรือ path เปลี่ยน)
  - `https://fapi.binance.com/fapi/v1/klines` ✅ OPEN

---

## Task 1: แก้ radar.html ไม่ให้ประกาศ TOOL_DATA ซ้ำ

**Objective:** ลบ inline `const TOOL_DATA` / `tipInit()` / `manualInit()` ใน radar.html ออก เพราะโหลดจาก tooltip.js แล้ว

**Files:** Modify `radar.html` (บรรทัด 613–~1380) และ `radar - Copy.html`

**Step 1:** ลบบล็อก `const TOOL_DATA = {...}` (บรรทัด 613 ถึงก่อน `function tipInit`)
**Step 2:** ลบ `function tipInit(){...}` และ `function manualInit(){...}` ที่ฝังใน radar.html (ใช้ของ tooltip.js แทน)
**Step 3:** เช็คบรรทัด 1437 `tipInit(); manualInit();` ยังอยู่ (tooltip.js เรียกเองตอน DOMContentLoaded แล้ว — ถ้ามีซ้ำให้ลบออกจาก radar)
**Step 4:** ยืนยันว่า `<script src="./tooltip.js"></script>` (บรรทัด 1448) คงอยู่ตัวเดียว

**Verification:** เปิด radar.html ใน browser → console ไม่มี `TOOL_DATA has already been declared`

---

## Task 2: เพิ่ม FDATA base + แก้ path ใน dipbuy.html

**Objective:** แยก base URL สำหรับ futures/data endpoints ให้ path ถูกต้อง ไม่ซ้ำ fapi/v1

**Files:** Modify `dipbuy.html:189` (เพิ่ม const) และ `dipbuy.html:242-298`

**Step 1:** หลังบรรทัด 189 เพิ่ม:
```js
const FDATA="https://fapi.binance.com/futures/data/";
```

**Step 2:** แก้บรรทัด 244:
```js
const r=await fetch(FDATA+`openInterestHist?symbol=${sym}&period=5m&limit=60`);
```

**Step 3:** แก้บรรทัด 261:
```js
const r=await fetch(FDATA+`topLongShortPositionRatio?symbol=${sym}&period=5m&limit=48`);
```

**Step 4:** แก้บรรทัด 272 (trades ใช้ FAPI ไม่เติม fapi/v1 ซ้ำ):
```js
const tr=await fetch(FAPI+`trades?symbol=${sym}&limit=500`);
```

**Step 5:** แก้/แทนที่ `oiVal` (บรรทัด 298) — endpoint `openInterest` 404 ให้เปลี่ยนเป็น `globalLongShortAccountRatio` หรือดึง OI จาก `openInterestHist` แทน:
```js
async function oiVal(sym){ try{ const r=await fetch(FDATA+`openInterestHist?symbol=${sym}&period=5m&limit=2`); const j=await r.json(); return j&&j.length?+j[j.length-1].sumOpenInterest:null; }catch(e){ return null; } }
```

**Step 6:** ตรวจหา `FAPI+`futures/data` หรือ `FAPI+`fapi/v1` ผิดรูปอื่นในไฟล์ → แก้ให้หมด

**Verification:** เปิด dipbuy.html → console ไม่มี CORS error → แท็บ Multi-TF โชว์ OI/LS ratio ได้

---

## Task 3: ทดสอบ live + commit

**Step 1:** รัน `python -m http.server` แล้วเปิด dipbuy.html ดู console
**Step 2:** ยืนยันไม่มี error ทั้ง 2 ตัว
**Step 3:** `git add dipbuy.html radar.html "radar - Copy.html" && git commit -m "fix: CORS path + duplicate TOOL_DATA"`

---

## Risks / Open questions
- `radar.html` เป็นหน้าเก่า ไม่อยู่ nav — อาจพิจารณาลบทิ้งแทนแก้ (ถามพี่กั๊ก)
- ถ้า Binance เปลี่ยน CORS policy ภายหลัง ต้องใช้ proxy — แต่ตอนนี้ endpoint เปิด CORS ปกติ
- `openInterest` แบบไม่มี period ไม่มีจริง → ใช้ `openInterestHist` แทน (Task 2 Step 5)
