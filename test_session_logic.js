// Harness: run session.html's analysis logic against the REAL Binance API
// using python urllib as the fetch transport (node fetch is unreliable here).
const fs = require('fs');
const { execFileSync } = require('child_process');

let html = fs.readFileSync('session.html', 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// --- strip the wiring/DOM parts we don't want to run ---
// Remove the control-wiring block + initial render() call at the end.
code = code.replace(/\/\/ ---------- Wire controls ----------[\s\S]*$/m, '');

// Remove DOM-dependent bits: replace $() and render() with no-ops
code = code.replace(/function \$\(id\)\{ return document\.getElementById\(id\); \}/,
                    'function $(id){ return {textContent:"",innerHTML:"",addEventListener(){},classList:{add(){},remove(){}},dataset:{},disabled:false,value:""}; }');
code = code.replace(/document\.querySelectorAll\([^)]*\)/g, '[]');
code = code.replace(/new Date\(\)\.toLocaleTimeString\([^)]*\)/g, "'x'");

// Replace fetch with python-urllib transport
const shim = `
async function fetchJson(url, timeoutMs){
  const out = execFileSync('python', ['fetch_helper.py', url], {maxBuffer: 64*1024*1024}).toString();
  return JSON.parse(out);
}
`;

// swap the real fetchJson for the shim
code = code.replace(/async function fetchJson\(url, timeoutMs\)\{[\s\S]*?\n\}/, shim.trim());

// expose what we need
code += `
module.exports = { state, getTickers, getKlines, getFundingOi, analyzeKlines,
                   currentSessions, nextOpen, WINDOWS, ORDER, ema, rsi, atr, fmtPrice, fmtOi };
`;

const mod = { exports: {} };
new Function('module', 'exports', 'execFileSync', code + '\nreturn module.exports;')(mod, mod.exports, execFileSync);
const M = mod.exports;

(async () => {
  console.log('=== 1) getTickers (Binance -> Bybit fallback) ===');
  const tick = await M.getTickers();
  console.log('  source:', M.state.src, '| symbols:', tick.length);
  tick.sort((a, b) => b.qv - a.qv);
  console.log('  top5:', tick.slice(0, 5).map(t => t.symbol + '@' + t.price).join(', '));

  console.log('\n=== 2) session windows sanity ===');
  for (const wm of ['overlap', 'split']) {
    console.log('  ' + wm + ':', JSON.stringify(M.WINDOWS[wm]));
    console.log('    current sessions now:', M.currentSessions(wm).join('+') || 'OFF-HOURS');
    const nx = M.nextOpen(wm);
    console.log('    next open:', nx.n, 'in', nx.mins.toFixed(0), 'min');
  }

  console.log('\n=== 3) analyzeKlines on real data (BTC 15m, 3 symbols) ===');
  const syms = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  for (const s of syms) {
    const kl = await M.getKlines(s, '15m');
    if (!kl) { console.log('  ' + s + ': NO KLINES'); continue; }
    const fo = await M.getFundingOi(s);
    const r = M.analyzeKlines(s, kl, 'overlap', fo.funding, fo.oi);
    if (!r) { console.log('  ' + s + ': analyze returned null (bars=' + kl.length + ')'); continue; }
    const tot = M.ORDER.reduce((a, n) => a + (r.sessions[n] ? r.sessions[n].vol_share : 0), 0);
    console.log('  ' + s + ': bars=' + kl.length + ' price=' + M.fmtPrice(r.price)
      + ' trend=' + r.trend + ' rsi=' + r.rsi.toFixed(1)
      + ' funding=' + (r.funding == null ? 'null' : (r.funding * 100).toFixed(4) + '%')
      + ' oi=' + M.fmtOi(r.oi));
    console.log('      vol_share sum=' + (tot * 100).toFixed(1) + '%'
      + ' sessions=' + M.ORDER.map(n => n + ':' + (r.sessions[n] ? (r.sessions[n].vol_share * 100).toFixed(1) + '%' : '-')).join(' '));
  }

  console.log('\n=== 4) split mode check (should sum ~100%) ===');
  const kl2 = await M.getKlines('BTCUSDT', '15m');
  const r2 = M.analyzeKlines('BTCUSDT', kl2, 'split', null, null);
  const tot2 = M.ORDER.reduce((a, n) => a + (r2.sessions[n] ? r2.sessions[n].vol_share : 0), 0);
  console.log('  BTC split vol_share sum = ' + (tot2 * 100).toFixed(1) + '%');
  console.log('  (overlap should be >100%, split should be <=100%)');

  console.log('\n=== 5) 5m + 1h TF ===');
  for (const tf of ['5m', '1h']) {
    const k = await M.getKlines('BTCUSDT', tf);
    console.log('  ' + tf + ': bars=' + (k ? k.length : 'null') + ' src=' + M.state.src);
  }
})();
