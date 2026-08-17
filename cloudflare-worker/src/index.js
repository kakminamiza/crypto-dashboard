// Cloudflare Worker: Futures Radar
// รันทุก 1 นาที → สแกน Binance Futures → หา Top 10 โมเมนตัม+วอลุ่ม → คำนวณสัญญาณ → เช็คผล → เก็บ KV
const FAPI = "https://fapi.binance.com";

async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cf: { cacheTtl: 0 } });
      if (r.status === 429) { await sleep(2000 * (i + 1)); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { if (i === retries - 1) throw e; await sleep(1000); }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Indicator math
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

function computeSignal(sym, price, rsiV, macdV, bb, vR, atrV, trend, scores) {
  const score = Math.round((scores.m5 || 0) * 0.25 + scores.m15 * 0.5 + (scores.m30 || 0) * 0.25);
  const dir = score >= 50 ? "LONG" : score <= -50 ? "SHORT" : score >= 35 ? "LONG" : score <= -35 ? "SHORT" : "WAIT";
  if (dir === "WAIT") return { signal: "WAIT", stars: Math.min(5, Math.max(1, Math.floor(Math.abs(score) / 20) + 1)), confidence: Math.abs(score), reason: "ไซด์เวย์" };
  const risk = atrV * 2;
  if (!risk) return { signal: "WAIT", stars: 0, confidence: 0, reason: "ATR=0" };
  let sl, tp1, tp2;
  if (dir === "LONG") { sl = price - risk; tp1 = price + risk * 1.5; tp2 = price + risk * 3; }
  else { sl = price + risk; tp1 = price - risk * 1.5; tp2 = price - risk * 3; }
  let conf = Math.min(100, Math.abs(score));
  if ((dir === "LONG" && trend === "up") || (dir === "SHORT" && trend === "down")) conf = Math.min(100, conf + 10);
  const reasons = [];
  if (dir === "LONG") { if (rsiV < 35) reasons.push("RSI oversold"); else if (rsiV < 50) reasons.push("RSI ต่ำ"); }
  else { if (rsiV > 65) reasons.push("RSI overbought"); else if (rsiV > 50) reasons.push("RSI สูง"); }
  if (vR > 1.4) reasons.push("Vol เพิ่ม");
  if (trend === "up" && dir === "LONG") reasons.push("4H ขาขึ้น");
  if (trend === "down" && dir === "SHORT") reasons.push("4H ขาลง");
  const stars = Math.min(5, Math.max(1, Math.floor(Math.abs(score) / 16) + 1));
  return { signal: dir, stars, confidence: conf, entry: price, sl, tp1, tp2, reason: reasons.length ? reasons.join(" · ") : "โมเมนตัมรวม" };
}

// Main scan
async function scanAll(env) {
  const tickers = await fetchJSON(`${FAPI}/fapi/v1/ticker/24hr`);
  if (!Array.isArray(tickers)) return { error: "no tickers" };

  // Filter USDT perp + momentum + volume > $30M
  const filtered = tickers
    .filter(t => t.symbol.endsWith("USDT") && !/_/.test(t.symbol) && parseFloat(t.quoteVolume) > 3e7)
    .map(t => ({ sym: t.symbol, chg: parseFloat(t.priceChangePercent), vol: parseFloat(t.quoteVolume), last: parseFloat(t.lastPrice) }));

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

      const h4closes = h4.map(k => parseFloat(k[4]));
      const v20 = vols.slice(-21, -1);
      const avgV = v20.reduce((a, b) => a + b, 0) / v20.length;
      const vRatio = avgV > 0 ? vols[vols.length - 1] / avgV : 1;

      const sig = computeSignal(coin.sym, price, rsi(closes), macd(closes).hist, bollinger(closes), vRatio, atr(highs, lows, closes), swing4h(h4closes), { m15: computeScore({ rsi: rsi(closes), macdHist: macd(closes).hist, price, bb: bollinger(closes), vRatio }) });
      results.push({ symbol: coin.sym, price, change24h: coin.chg, volume24h: coin.vol, signal: sig.signal, stars: sig.stars, confidence: sig.confidence, entry: sig.entry, sl: sig.sl, tp1: sig.tp1, tp2: sig.tp2, reason: sig.reason, timestamp: new Date().toISOString() });
    } catch (e) { console.log("skip", coin.sym, e.message); }
  }

  // Check open signals from KV
  const logRaw = await env.SIGNAL_KV.get("signal_log");
  const log = logRaw ? JSON.parse(logRaw) : [];
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
      if (outcome) {
        sig.outcome = outcome;
        sig.outcomePrice = p;
        sig.outcomeTime = new Date().toISOString();
        const risk = Math.abs(sig.entry - sig.sl);
        sig.rMultiple = outcome === "WIN" ? Math.round((Math.abs(p - sig.entry) / risk) * 100) / 100 : -1;
        console.log("closed", sig.symbol, outcome, sig.rMultiple + "R");
      } else {
        stillOpen.push(sig);
      }
    } catch (e) { stillOpen.push(sig); }
  }

  // Log new signals
  const now = new Date().toISOString();
  for (const r of results) {
    if (r.signal === "WAIT") continue;
    const exists = log.find(e => e.symbol === r.symbol && e.outcome === "PENDING" && e.signal === r.signal);
    if (!exists) {
      log.push({ symbol: r.symbol, signal: r.signal, entry: r.price, sl: r.sl, tp1: r.tp1, tp2: r.tp2, timestamp: now, outcome: "PENDING", confidence: r.confidence, rMultiple: null });
    }
  }

  // Save log (keep last 500)
  const trimmed = log.slice(-500);
  await env.SIGNAL_KV.put("signal_log", JSON.stringify(trimmed));
  await env.SIGNAL_KV.put("last_scan", JSON.stringify({ timestamp: now, top10: results, openCount: stillOpen.length }));

  return { ok: true, timestamp: now, top10: results, closed: open.length - stillOpen.length, open: stillOpen.length };
}

function wilsonCI(wins, n) {
  if (n === 0) return { rate: 0, low: 0, high: 0 };
  const z = 1.96, p = wins / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denom;
  return { rate: Math.round(p * 100), low: Math.round(Math.max(0, center - spread) * 100), high: Math.round(Math.min(1, center + spread) * 100) };
}

async function getWinRate(groupBy) {
  const raw = await this.SIGNAL_KV.get("signal_log");
  const log = raw ? JSON.parse(raw) : [];
  const closed = log.filter(e => e.outcome === "WIN" || e.outcome === "LOSS");
  if (!closed.length) return { overall: { n: 0, wins: 0, losses: 0, ratePct: 0, lowPct: 0, highPct: 0 }, openCount: log.filter(e => e.outcome === "PENDING").length, rows: [] };

  const overall = wilsonCI(closed.filter(e => e.outcome === "WIN").length, closed.length);
  overall.wins = closed.filter(e => e.outcome === "WIN").length;
  overall.losses = closed.filter(e => e.outcome === "LOSS").length;
  overall.n = closed.length;

  const groups = {};
  for (const e of closed) {
    const key = groupBy === "symbol" ? e.symbol : e.signal;
    if (!groups[key]) groups[key] = { n: 0, wins: 0, losses: 0 };
    groups[key].n++;
    if (e.outcome === "WIN") groups[key].wins++;
    else groups[key].losses++;
  }

  const rows = Object.entries(groups).map(([label, d]) => {
    const ci = wilsonCI(d.wins, d.n);
    return { label, n: d.n, wins: d.wins, losses: d.losses, ratePct: ci.rate, lowPct: ci.low, highPct: ci.high };
  }).sort((a, b) => b.n - a.n);

  return { overall, openCount: log.filter(e => e.outcome === "PENDING").length, rows };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/top10") {
      const raw = await env.SIGNAL_KV.get("last_scan");
      return new Response(raw || JSON.stringify({ error: "no data yet" }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/api/winrate") {
      const group = url.searchParams.get("group") || "symbol";
      const data = await getWinRate.call(env, group);
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("Futures Radar Worker OK");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(scanAll(env));
  }
};
