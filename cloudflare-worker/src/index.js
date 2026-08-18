// Cloudflare Worker: Futures Radar — proxy Bybit (CORS-safe) + full-board scan
// รันบน edge ไม่โดน CORS บล็อกเหมือนเรียก Bybit จากเบราว์เซอร์โดยตรง
const BYBIT = "https://api.bybit.com";

async function bybitJSON(path, retries = 3) {
  const url = BYBIT + path;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (!r.ok) { await new Promise(s => setTimeout(s, 800 * (i + 1))); continue; }
      const j = await r.json();
      if (j.retCode !== 0) throw new Error("retCode " + j.retCode);
      return j.result;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(s => setTimeout(s, 600 * (i + 1)));
    }
  }
  throw new Error("bybit fetch failed");
}

// ---- indicator math (mirror radar.html) ----
function ema(v, n) { const k = 2 / (n + 1); let e = v[0], o = [e]; for (let i = 1; i < v.length; i++) { e = v[i] * k + e * (1 - k); o.push(e); } return o; }
function rsi(c, n = 14) { if (c.length < n + 1) return 50; let g = 0, l = 0; for (let i = c.length - n; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; } const ag = g / n, al = l / n; if (al === 0) return 100; return 100 - (100 / (1 + ag / al)); }
function macd(c) { const e12 = ema(c, 12), e26 = ema(c, 26); const line = c.map((_, i) => e12[i] - e26[i]); const sig = ema(line.slice(-Math.min(line.length, 60)), 9); return line[line.length - 1] - sig[sig.length - 1]; }
function bollinger(c, n = 20, m = 2) { const s = c.slice(-n); const mid = s.reduce((a, b) => a + b, 0) / n; const v = s.reduce((a, b) => a + (b - mid) ** 2, 0) / n; const sd = Math.sqrt(v); return { upper: mid + m * sd, mid, lower: mid - m * sd }; }
function volRatio(v, n = 20) { const s = v.slice(-n - 1, -1); if (!s.length) return 1; const avg = s.reduce((a, b) => a + b, 0) / s.length; const cur = v[v.length - 1]; return avg > 0 ? cur / avg : 1; }
function atr14(h, l, c) { if (c.length < 15) return 0; const tr = [h[0] - l[0]]; for (let i = 1; i < c.length; i++) tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))); let e = tr.slice(0, 14).reduce((a, b) => a + b, 0) / 14; for (let i = 14; i < tr.length; i++) e = (tr[i] / 14) + e * (13 / 14); return e; }
function swingTrend(c4h) { if (c4h.length < 50) return 'flat'; const e50 = ema(c4h, 50); const e200 = ema(c4h, Math.min(200, Math.floor(c4h.length / 1.2))); const p = c4h[c4h.length - 1]; if (p > e50[e50.length - 1] && e50[e50.length - 1] > e200[e200.length - 1]) return 'up'; if (p < e50[e50.length - 1] && e50[e50.length - 1] < e200[e200.length - 1]) return 'down'; return 'flat'; }

function computeScore(rsiV, mh, price, bb, vr) {
  if (rsiV === undefined || !isFinite(rsiV)) return 0;
  let s = 0;
  s += (rsiV - 50) * 1.3;
  s += Math.max(-25, Math.min(25, mh * 4000));
  const br = (bb.upper - bb.lower);
  const bp = br > 0 ? (price - bb.lower) / br : 0.5;
  s += (bp - 0.5) * 40;
  if (vr > 1.4) s *= Math.min(1.4, 1 + (vr - 1.4) * 0.2);
  return Math.max(-100, Math.min(100, Math.round(s)));
}
function scoreToStars(sc) { const a = Math.abs(sc); return a >= 80 ? 5 : a >= 65 ? 4 : a >= 50 ? 3 : a >= 35 ? 2 : a >= 20 ? 1 : 0; }

function computeSignal(d) {
  if (d.rsi >= 70 || d.rsi <= 30) return { signal: 'WAIT', stars: 0, confidence: 0, reason: d.rsi >= 70 ? 'RSI overbought (≥70)' : 'RSI oversold (≤30)' };
  const dir = d.score >= 50 ? 'LONG' : d.score <= -50 ? 'SHORT' : d.score >= 25 ? 'LONG' : d.score <= -25 ? 'SHORT' : 'WAIT';
  if (dir === 'WAIT') return { signal: 'WAIT', stars: scoreToStars(d.score), confidence: Math.abs(d.score), reason: 'ไซด์เวย์' };
  const risk = d.atr * 2;
  if (!risk) return { signal: 'WAIT', stars: 0, confidence: 0, reason: 'ATR=0' };
  let entry, sl, tp1, tp2, inv;
  if (dir === 'LONG') { entry = d.price; sl = entry - risk; tp1 = entry + risk * 1.5; tp2 = entry + risk * 3; inv = entry - risk * 1.25; }
  else { entry = d.price; sl = entry + risk; tp1 = entry - risk * 1.5; tp2 = entry - risk * 3; inv = entry + risk * 1.25; }
  let conf = Math.min(100, Math.abs(d.score));
  if ((dir === 'LONG' && d.trend === 'up') || (dir === 'SHORT' && d.trend === 'down')) conf = Math.min(100, conf + 10);
  if (d.vr < 1.0) conf -= 10;
  if (dir === 'LONG' && d.rsi < 35) conf += 5;
  if (dir === 'SHORT' && d.rsi > 65) conf += 5;
  conf = Math.max(0, Math.min(100, conf));
  const reasons = [];
  if (dir === 'LONG') { if (d.rsi < 35) reasons.push('RSI oversold'); else if (d.rsi < 50) reasons.push('RSI ต่ำ'); if (d.mh > 0) reasons.push('MACD +'); const bp = (d.price - d.bb.lower) / (d.bb.upper - d.bb.lower); if (bp < 0.25) reasons.push('BB ล่าง'); if (d.trend === 'up') reasons.push('4H ขาขึ้น'); if (d.vr > 1.4) reasons.push('Vol เพิ่ม'); }
  else { if (d.rsi > 65) reasons.push('RSI overbought'); else if (d.rsi > 50) reasons.push('RSI สูง'); if (d.mh < 0) reasons.push('MACD -'); const bp = (d.price - d.bb.lower) / (d.bb.upper - d.bb.lower); if (bp > 0.75) reasons.push('BB บน'); if (d.trend === 'down') reasons.push('4H ขาลง'); if (d.vr > 1.4) reasons.push('Vol เพิ่ม'); }
  return { signal: dir, stars: scoreToStars(d.score), confidence: conf, entry, sl, tp1, tp2, invalidation: inv, reason: reasons.length ? reasons.join(' · ') : 'โมเมนตัมรวม' };
}

const IMAP = { '15m': '15', '30m': '30', '4h': '240', '5m': '5', '1h': '60' };
async function kline(sym, iv, lim) {
  const r = await bybitJSON(`/v5/market/kline?category=linear&symbol=${sym}&interval=${IMAP[iv] || iv}&limit=${lim}`);
  const raw = r.list.slice().reverse();
  return { closes: raw.map(k => parseFloat(k[4])), highs: raw.map(k => parseFloat(k[2])), lows: raw.map(k => parseFloat(k[3])), volumes: raw.map(k => parseFloat(k[5])) };
}

// สแกนทั้งกระดาน (จำกัดตาม turnover เรียงวอลุ่ม)
async function scanBoard(env) {
  const t = await bybitJSON('/v5/market/tickers?category=linear&limit=1000');
  const usdt = t.list.filter(x => x.symbol.endsWith('USDT') && !x.symbol.includes('_') && (parseFloat(x.turnover24h) || 0) >= 500000)
    .sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
    .slice(0, 400);

  const out = [];
  // batched concurrent scan
  const B = 12;
  for (let i = 0; i < usdt.length; i += B) {
    const batch = usdt.slice(i, i + B);
    const res = await Promise.allSettled(batch.map(async x => {
      try {
        const sym = x.symbol;
        const [k15, h4] = await Promise.all([kline(sym, '15m', 200), kline(sym, '4h', 210)]);
        const c = k15.closes, v = k15.volumes;
        if (c.length < 100) return null;
        const s5 = computeScore(rsi(c.slice(-20), 14), macd(c.slice(-20)), c[c.length - 1], bollinger(c.slice(-20), 20, 2), volRatio(v.slice(-20), 20));
        const s15 = computeScore(rsi(c, 14), macd(c), c[c.length - 1], bollinger(c, 20, 2), volRatio(v, 20));
        const c30 = c.slice(0, -1), v30 = v.slice(0, -1);
        const s30 = computeScore(rsi(c30, 14), macd(c30), c[c.length - 1], bollinger(c30, 20, 2), volRatio(v30, 20));
        const score = Math.round(s5 * 0.25 + s15 * 0.5 + s30 * 0.25);
        const stars = scoreToStars(score);
        const rsiV = rsi(c, 14), mh = macd(c), bb = bollinger(c, 20, 2), vr = volRatio(v, 20), atr = atr14(k15.highs, k15.lows, k15.closes), trend = swingTrend(h4.closes);
        const d = { rsi: rsiV, macdHist: mh, bb, vr, score, trend, atr, price: c[c.length - 1] };
        const sig = computeSignal(d);
        if (sig.signal === 'WAIT' || sig.stars < 3) return null;
        if (vr < 0.5) return null;
        return {
          symbol: sym, price: d.price, changePct: parseFloat(x.price24hPcnt) * 100,
          rsi: rsiV, volRatio: vr, score, trend, atr14: atr,
          signal: { signal: sig.signal, stars: sig.stars, confidence: sig.confidence, entry: sig.entry, sl: sig.sl, tp1: sig.tp1, tp2: sig.tp2, invalidation: sig.invalidation, reason: sig.reason }
        };
      } catch (e) { return null; }
    }));
    res.forEach(r => { if (r.status === 'fulfilled' && r.value) out.push(r.value); });
  }
  out.sort((a, b) => b.signal.stars - a.signal.stars || b.signal.confidence - a.signal.confidence);
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/radar') {
        const cached = await env.SIGNAL_KV.get('radar_cache');
        if (cached) {
          const obj = JSON.parse(cached);
          if (Date.now() - obj.ts < 120000) return json(obj.data); // cache 2 นาที
        }
        const data = await scanBoard(env);
        await env.SIGNAL_KV.put('radar_cache', JSON.stringify({ ts: Date.now(), data }));
        return json(data);
      }
      if (url.pathname === '/api/radar/refresh') {
        const data = await scanBoard(env);
        await env.SIGNAL_KV.put('radar_cache', JSON.stringify({ ts: Date.now(), data }));
        return json(data);
      }
      return json({ status: 'ok', endpoints: ['/api/radar', '/api/radar/refresh'] });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try { const data = await scanBoard(env); await env.SIGNAL_KV.put('radar_cache', JSON.stringify({ ts: Date.now(), data })); } catch (e) {}
    })());
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
  });
}
