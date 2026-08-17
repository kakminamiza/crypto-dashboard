// Local scanner: ดึง Binance Futures → คำนวณสัญญาณ → push ลง Cloudflare KV
// รันบนเครื่องพี่กั๊ก (ไม่ใช่ Worker) เพราะ Binance บล็อก Cloudflare IP
// ใช้: node local_scanner_to_kv.mjs  (รันทุก 1 นาที ผ่าน task scheduler)

import { execSync } from 'child_process';

const FAPI = "https://fapi.binance.com";
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_KV_NAMESPACE = "daa5f58e90f04dd4b01e528eb1a7cbab"; // SIGNAL_KV id
const CF_API_TOKEN = process.env.CF_API_TOKEN; // ค่าเท่ากับ wrangler OAuth token หรือ API token ที่มีสิทธิ์ KV

if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error("❌ ต้องตั้ง CF_ACCOUNT_ID และ CF_API_TOKEN (env)");
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { if (i === retries - 1) throw e; await sleep(1000); }
  }
}

function ema(v, n) { const k = 2 / (n + 1); let e = v[0], o = [e]; for (let i = 1; i < v.length; i++) { e = v[i] * k + e * (1 - k); o.push(e); } return o; }
function rma(v, n) { const a = 1 / n; let e = v[0], o = [e]; for (let i = 1; i < v.length; i++) { e = v[i] * a + e * (1 - a); o.push(e); } return o; }
function atr(h, l, c, n = 14) { const tr = [h[0] - l[0]]; for (let i = 1; i < c.length; i++) tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))); return rma(tr, n); }
function rsi(c, n = 14) { if (c.length < n + 1) return 50; let g = 0, lo = 0; for (let i = c.length - n; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else lo -= d; } const ag = g / n, al = lo / n; if (!al) return 100; return 100 - 100 / (1 + ag / al); }
function macd(c) { const e12 = ema(c, 12), e26 = ema(c, 26); const line = c.map((_, i) => e12[i] - e26[i]); const sig = ema(line.slice(-Math.min(line.length, 60)), 9); return { hist: line[line.length - 1] - sig[sig.length - 1] }; }
function bollinger(c, n = 20, m = 2) { const s = c.slice(-n); const mid = s.reduce((a, b) => a + b, 0) / n; const v = s.reduce((a, b) => a + (b - mid) ** 2, 0) / n; const sd = Math.sqrt(v); return { upper: mid + m * sd, mid, lower: mid - m * sd }; }
function swing4h(closes) { if (closes.length < 50) return "flat"; const e50 = ema(closes, 50), e200 = ema(closes, Math.min(200, Math.floor(closes.length / 1.2))); const p = closes[closes.length - 1]; if (p > e50[e50.length - 1] && e50[e50.length - 1] > e200[e200.length - 1]) return "up"; if (p < e50[e50.length - 1] && e50[e50.length - 1] < e200[e200.length - 1]) return "down"; return "flat"; }

function computeScore(d) {
  let s = (d.rsi - 50) * 1.3 + Math.max(-25, Math.min(25, d.macdHist * 4000));
  const bp = (d.price - d.bb.lower) / (d.bb.upper - d.bb.lower);
  s += (bp - 0.5) * 40;
  if (d.vRatio > 1.4) s *= Math.min(1.4, 1 + (d.vRatio - 1.4) * 0.2);
  return Math.max(-100, Math.min(100, Math.round(s)));
}

function computeSignal(price, rsiV, macdV, bb, vR, atrV, trend, score) {
  const dir = score >= 50 ? "LONG" : score <= -50 ? "SHORT" : score >= 35 ? "LONG" : score <= -35 ? "SHORT" : "WAIT";
  if (dir === "WAIT") return { signal: "WAIT", stars: Math.min(5, Math.max(1, Math.floor(Math.abs(score) / 20) + 1)), confidence: Math.abs(score), reason: "ไซด์เวย์" };
  const risk = atrV * 2;
  if (!risk) return { signal: "WAIT", stars: 0, confidence: 0, reason: "ATR=0" };
  let sl, tp1, tp2;
  if (dir === "LONG") { sl = price - risk; tp1 = price + risk * 1.5; tp2 = price + risk * 3; }
  else { sl = price + risk; tp1 = price - risk * 1.5; tp2 = price - risk * 3; }
  let conf = Math.min(100, Math.abs(score));
  if ((dir === "LONG" && trend === "up") || (dir === "SHORT" && trend === "down")) conf = Math.min(100, conf + 10);
  if (vR < 1.0) conf -= 10;
  if (dir === "LONG" && rsiV < 35) conf += 5;
  if (dir === "SHORT" && rsiV > 65) conf += 5;
  conf = Math.max(0, Math.min(100, conf));
  const reasons = [];
  if (dir === "LONG") { if (rsiV < 35) reasons.push("RSI oversold"); else if (rsiV < 50) reasons.push("RSI ต่ำ"); if (macdV > 0) reasons.push("MACD +"); if (trend === "up") reasons.push("4H ขาขึ้น"); }
  else { if (rsiV > 65) reasons.push("RSI overbought"); else if (rsiV > 50) reasons.push("RSI สูง"); if (macdV < 0) reasons.push("MACD -"); if (trend === "down") reasons.push("4H ขาลง"); }
  if (vR > 1.4) reasons.push("Vol เพิ่ม");
  const stars = Math.min(5, Math.max(1, Math.floor(Math.abs(score) / 16) + 1));
  return { signal: dir, stars, confidence: conf, entry: price, sl, tp1, tp2, reason: reasons.length ? reasons.join(" · ") : "โมเมนตัมรวม" };
}

async function kvPut(key, value) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE}/values/${key}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: typeof value === "string" ? value : JSON.stringify(value)
  });
  if (!r.ok) throw new Error("KV PUT failed: " + r.status + " " + await r.text());
}

async function scanAll() {
  const tickers = await fetchJSON(`${FAPI}/fapi/v1/ticker/24hr`);
  if (!Array.isArray(tickers)) throw new Error("no tickers");

  const filtered = tickers
    .filter(t => t.symbol.endsWith("USDT") && !/_/.test(t.symbol) && parseFloat(t.quoteVolume) > 3e7)
    .map(t => ({ sym: t.symbol, chg: parseFloat(t.priceChangePercent), vol: parseFloat(t.quoteVolume) }));

  if (!filtered.length) throw new Error("no filtered coins");
  const maxVol = Math.max(...filtered.map(t => t.vol));
  filtered.forEach(t => { t.score = Math.abs(t.chg) * 0.6 + (t.vol / maxVol) * 40; });
  filtered.sort((a, b) => b.score - a.score);

  const top10 = filtered.slice(0, 10);
  const results = [];
  for (const coin of top10) {
    try {
      const [m15, h4] = await Promise.all([
        fetchJSON(`${FAPI}/fapi/v1/klines?symbol=${coin.sym}&interval=15m&limit=100`),
        fetchJSON(`${FAPI}/fapi/v1/klines?symbol=${coin.sym}&interval=4h&limit=210`),
      ]);
      if (!Array.isArray(m15) || !Array.isArray(h4)) continue;
      const closes = m15.map(k => parseFloat(k[4]));
      const highs = m15.map(k => parseFloat(k[2]));
      const lows = m15.map(k => parseFloat(k[3]));
      const vols = m15.map(k => parseFloat(k[5]));
      const price = closes[closes.length - 1];
      const v20 = vols.slice(-21, -1);
      const avgV = v20.reduce((a, b) => a + b, 0) / v20.length;
      const vRatio = avgV > 0 ? vols[vols.length - 1] / avgV : 1;
      const rsiV = rsi(closes), macdV = macd(closes).hist, bb = bollinger(closes), atrV = atr(highs, lows, closes), trend = swing4h(h4.map(k => parseFloat(k[4])));
      const score = computeScore({ rsi: rsiV, macdHist: macdV, price, bb, vRatio });
      const sig = computeSignal(price, rsiV, macdV, bb, vRatio, atrV, trend, score);
      results.push({ symbol: coin.sym, price, change24h: coin.chg, volume24h: coin.vol, signal: sig.signal, stars: sig.stars, confidence: sig.confidence, entry: sig.entry, sl: sig.sl, tp1: sig.tp1, tp2: sig.tp2, reason: sig.reason, timestamp: new Date().toISOString() });
    } catch (e) { console.log("skip", coin.sym, e.message); }
  }

  // Load existing log
  let log = [];
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE}/values/signal_log`, { headers: { "Authorization": `Bearer ${CF_API_TOKEN}` } });
    if (r.ok) log = await r.json();
  } catch (e) {}
  const open = log.filter(e => e.outcome === "PENDING");
  const stillOpen = [];
  for (const sig of open) {
    try {
      const t = await fetchJSON(`${FAPI}/fapi/v1/ticker/price?symbol=${sig.symbol}`);
      const p = parseFloat(t.price);
      let outcome = null;
      if (sig.signal === "LONG" && sig.tp1 && p >= sig.tp1) outcome = "WIN";
      else if (sig.signal === "LONG" && sig.sl && p <= sig.sl) outcome = "LOSS";
      else if (sig.signal === "SHORT" && sig.tp1 && p <= sig.tp1) outcome = "WIN";
      else if (sig.signal === "SHORT" && sig.sl && p >= sig.sl) outcome = "LOSS";
      if (outcome) { sig.outcome = outcome; sig.outcomePrice = p; const risk = Math.abs(sig.entry - sig.sl); sig.rMultiple = outcome === "WIN" ? Math.round((Math.abs(p - sig.entry) / risk) * 100) / 100 : -1; }
      else stillOpen.push(sig);
    } catch (e) { stillOpen.push(sig); }
  }
  for (const r of results) {
    if (r.signal === "WAIT") continue;
    if (!log.find(e => e.symbol === r.symbol && e.outcome === "PENDING" && e.signal === r.signal)) {
      log.push({ symbol: r.symbol, signal: r.signal, entry: r.price, sl: r.sl, tp1: r.tp1, tp2: r.tp2, timestamp: new Date().toISOString(), outcome: "PENDING", confidence: r.confidence, rMultiple: null });
    }
  }
  const trimmed = log.slice(-500);
  await kvPut("signal_log", trimmed);
  await kvPut("last_scan", { timestamp: new Date().toISOString(), top10: results, openCount: stillOpen.length });
  console.log(`✅ Scan done: ${results.length} coins, ${open.length - stillOpen.length} closed, ${stillOpen.length} open`);
}

scanAll().catch(e => { console.error("❌ Scan failed:", e.message); process.exit(1); });
