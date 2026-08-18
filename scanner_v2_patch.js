const fs=require('fs');
const p="scanner_v2_dashboard.html";
let s=fs.readFileSync(p,encoding="utf-8");
const start=s.indexOf("<script>\nconst FAPI");
const end=s.indexOf("</script>\n</body>");
const new_script=`const FAPI = "https://fapi.binance.com";
// กันแบน IP: นับ requests ต่อรอบ + หยุดนุ่มๆ ถ้าเจอ 418/429
let reqCount = 0;
let ipBanned = false;

function ema(v,n){const k=2/(n+1);let e=v[0],o=[e];for(let i=1;i<v.length;i++){e=v[i]*k+e*(1-k);o.push(e);}return o;}
function rma(v,n){const a=1/n;let e=v[0],o=[e];for(let i=1;i<v.length;i++){e=v[i]*a+e*(1-a);o.push(e);}return o;}
function atr(h,l,c,n=14){const tr=[h[0]-l[0]];for(let i=1;i<c.length;i++)tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])));return rma(tr,n);}
function rsi(c,n=16){if(c.length<n+1)return 50;let g=0,lo=0;for(let i=c.length-n;i<c.length;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else lo-=d;}const ag=g/n,al=lo/n;if(!al)return 100;return 100-100/(1+ag/al);}
function macd(c){const e12=ema(c,12),e26=ema(c,26);const line=c.map((_,i)=>e12[i]-e26[i]);const sig=ema(line.slice(-Math.min(line.length,60)),9);return {hist:line[line.length-1]-sig[sig.length-1], line:line[line.length-1], signal:sig[sig.length-1]};}
function bollinger(c,n=20,m=2){const s=c.slice(-n);const mid=s.reduce((a,b)=>a+b,0)/n;const v=s.reduce((a,b)=>a+(b-mid)**2,0)/n;const sd=Math.sqrt(v);return {upper:mid+m*sd,mid,lower:mid-m*sd};}
function cmf(h,l,c,v,n=20){let mf=0,vm=0;for(let i=c.length-n;i<c.length;i++){const cl=c[i],hl=h[i]-l[i];const flow=hl===0?0:((cl-l[i])-(h[i]-cl))/hl*v[i];mf+=flow;vm+=v[i];}return vm===0?0:mf/vm;}
function obvTrend(c,v){let o=c[0],vals=[0];for(let i=1;i<v.length;i++){if(c[i]>c[i-1])o+=v[i];else if(c[i]<c[i-1])o-=v[i];vals.push(o);}const e=ema(vals,20);return e[e.length-1]>e[e.length-6]?'up':'down';}
function trendOf(closes){if(closes.length<50)return"flat";const e50=ema(closes,50),e200=ema(closes,Math.min(200,Math.floor(closes.length/1.2)));const p=closes[closes.length-1];if(p>e50[e50.length-1]&&e50[e50.length-1]>e200[e200.length-1])return"up";if(p<e50[e50.length-1]&&e50[e50.length-1]<e200[e200.length-1])return"down";return"flat";}
function emaStack(closes){const p=closes[closes.length-1];const e20=ema(closes,20),e50=ema(closes,50),e100=ema(closes,100),e200=ema(closes,Math.min(200,Math.floor(closes.length/1.2)));return {p,e20:e20[e20.length-1],e50:e50[e50.length-1],e100:e100[e100.length-1],e200:e200[e200.length-1]};}
function supertrend(h,l,c,n=10,m=3){let atrV=atr(h,l,c,n);let up=l[n-1]-(m*atrV),dn=h[n-1]+(m*atrV),trend=1,ts=up;for(let i=n;i<c.length;i++){const at=atr(h.slice(0,i+1),l.slice(0,i+1),c.slice(0,i+1),n);up=l[i]-(m*at);dn=h[i]+(m*at);if(c[i]>dn&&trend===1)ts=Math.max(up,ts);else if(c[i]<up&&trend===-1)ts=Math.min(dn,ts);else if(c[i]>dn){trend=1;ts=up;}else if(c[i]<up){trend=-1;ts=dn;}}return trend===1?'bull':'bear';}
function volSpike(v,period=20){const s=v.slice(-period-1,-1);const avg=s.reduce((a,b)=>a+b,0)/s.length;const cur=v[v.length-1];return avg>0?cur/avg:1;}
function rr(e,sl,tp){const risk=Math.abs(e-sl);const rew=Math.abs(tp-e);return risk===0?0:+(rew/risk).toFixed(2);}
async function getKlines(sym,tf,limit=210){
  if(ipBanned) throw new Error("IP banned");
  reqCount++;
  const r = await fetch(\`\${FAPI}/fapi/v1/klines?symbol=\${sym}&interval=\${tf}&limit=\${limit}\`);
  if(r.status===418||r.status===429){ ipBanned=true; throw new Error("HTTP "+r.status+" แบนชั่วคราว"); }
  if(!r.ok) throw new Error("HTTP "+r.status);
  return r.json();
}
async function getFuturesData(sym){
  // OI + Funding จาก Futures จริง
  if(ipBanned) throw new Error("IP banned");
  reqCount+=2;
  const [oiRes,fundRes] = await Promise.all([
    fetch(\`\${FAPI}/futures/data/openInterestHist?symbol=\${sym}&period=5m&limit=1\`),
    fetch(\`\${FAPI}/fapi/v1/premiumIndex?symbol=\${sym}\`)
  ]);
  let oi=null, fund=null, oiChange=null;
  if(oiRes.ok){ const oiData=await oiRes.json(); if(Array.isArray(oiData)&&oiData.length) oi=parseFloat(oiData[0].sumOpenInterest); }
  if(fundRes.ok){ const f=await fundRes.json(); fund=parseFloat(f.lastFundingRate); }
  return {oi,fund};
}

const PAIRS = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT","DOGEUSDT","ADAUSDT","LINKUSDT","NEARUSDT","UNIUSDT","SUIUSDT","TAOUSDT","HYPEUSDT","ZECUSDT","BOMEUSDT","PAXGUSDT","TUTUSDT","BMTUSDT","BEATUSDT","WLDUSDT","GUAUSDT","HOMEUSDT","1000PEPEUSDT","KAITOUSDT","NILUSDT","EPICUSDT","CAPUSDT","ENAUSDT","XANUSDT","BTWUSDT","GWEIUSDT","BLESSUSDT","PUMPUSDT","CYSUSDT","BICOUSDT","MUBARAKUSDT","TSTUSDT","BLUAIUSDT"];

async function analyze(sym){
  const [k5,k15,k1h,k4h] = await Promise.all([
    getKlines(sym,"5m",50), getKlines(sym,"15m",100),
    getKlines(sym,"1h",200), getKlines(sym,"4h",210)
  ]);
  const closes = tf => tf.map(k=>parseFloat(k[4]));
  const highs  = tf => tf.map(k=>parseFloat(k[2]));
  const lows   = tf => tf.map(k=>parseFloat(k[3]));
  const vols   = tf => tf.map(k=>parseFloat(k[5]));
  const c15=closes(k15), h15=highs(k15), l15=lows(k15), v15=vols(k15);
  const c1h=closes(k1h), h1h=highs(k1h), l1h=lows(k1h);
  const c4=closes(k4h), h4h=highs(k4h), l4h=lows(k4h), v4=vols(k4h);
  const c5=closes(k5);
  const price=c15[c15.length-1];
  const t4=trendOf(c4), t1h=trendOf(c1h), t15=trendOf(c15), t5=trendOf(c5);
  // EMA stack 20/50/100/200 บน 4h
  const st4=emaStack(c4);
  const emaBull = st4.p>st4.e20 && st4.e20>st4.e50 && st4.e50>st4.e100 && st4.e100>st4.e200;
  // MACD + BB + VolSpike บน 15m
  const macd15=macd(c15);
  const bb15=bollinger(c15,20,2);
  const bbPos = (bb15.upper-bb15.lower)>0 ? (price-bb15.lower)/(bb15.upper-bb15.lower) : 0.5;
  const vs=volSpike(v15,20);
  // OI / Funding
  let oi=null,fund=null;
  try{ const fd=await getFuturesData(sym); oi=fd.oi; fund=fd.fund; }catch(e){}
  const rng=((Math.max(...c4.slice(-30))-Math.min(...c4.slice(-30)))/price*100);
  const obv=obvTrend(c4,v4), cmfV=cmf(h4h,l4h,c4,v4);
  const hl4=c4.slice(-20).every((v,i,a)=>i===0||v>=a[i-1]);
  // BASE score (สะสมเงียบ multi-TF + EMA stack + MACD/BB/Vol)
  let bs=0;
  if(rng<12)bs++;
  if(obv==='up')bs++;
  if(cmfV>0)bs++;
  if(hl4)bs++;
  if(t4!=='down'&&t1h!=='down')bs++;
  if(emaBull)bs++;
  if(macd15.hist>=0)bs++;
  if(bbPos>0.3&&bbPos<0.7)bs++; // กลางแบนด์ = สะสม
  if(vs<1.5)bs++; // วอลุ่มไม่พุ่ง = เงียบ
  const basePass = bs>=5 && (t4==='up'||t4==='flat') && t1h!=='down' && emaBull;
  // DIP (pullback ใน uptrend + RSI16 อบอุ่น + ST bull + MACD เริ่มวกกลับ)
  const r=rsi(c15,16), st=supertrend(h15,l15,c15);
  const e50=ema(c15,50)[ema(c15,50).length-1];
  const dipPass = (t4==='up'||t4==='flat') && t1h!=='down' && st==='bull' && r>=28 && r<=60 && price<=e50*1.04 && macd15.hist>=-0.5;
  const a=atr(h15,l15,c15);
  const sl=price-a*1.5, tp1=price+a*2, tp2=price+a*4;
  return {sym,price,r:r.toFixed(0),st,obv,cmf:cmfV.toFixed(3),range:rng.toFixed(1),score:bs,
    macd:macd15.hist.toFixed(3),bb:bbPos.toFixed(2),vs:vs.toFixed(2),oi:oi?oi.toFixed(0):'-',fund:fund!==null?fund.toFixed(4):'-',
    tf:\`5m:\${t5} 15m:\${t15} 1h:\${t1h} 4h:\${t4}\`,
    sl,tp1,tp2,rr1:rr(price,sl,tp1),rr2:rr(price,sl,tp2),basePass,dipPass};
}

async function load(){
  try{
    reqCount=0; ipBanned=false;
    const out=[]; let ok=0,fail=0;
    for(let i=0;i<PAIRS.length;i+=2){
      const batch=PAIRS.slice(i,i+2);
      const res=await Promise.all(batch.map(s=>analyze(s).catch(e=>{fail++;return null;})));
      out.push(...res.filter(Boolean));
      ok+=res.filter(Boolean).length;
      await new Promise(r=>setTimeout(r,180));
    }
    const base=out.filter(r=>r.basePass).map(r=>({sym:r.sym,entry:r.price,score:r.score,obv:r.obv,cmf:r.cmf,macd:r.macd,bb:r.bb,vs:r.vs,oi:r.oi,fund:r.fund,sl:r.sl,tp1:r.tp1,tp2:r.tp2,rr1:r.rr1,rr2:r.rr2}));
    const dip=out.filter(r=>r.dipPass).map(r=>({sym:r.sym,entry:r.price,score:r.score,rsi:r.r,st:r.st,macd:r.macd,vs:r.vs,oi:r.oi,fund:r.fund,sl:r.sl,tp1:r.tp1,tp2:r.tp2,rr1:r.rr1,rr2:r.rr2,tf:r.tf}));
    document.getElementById('baseCount').textContent=base.length;
    document.getElementById('dipCount').textContent=dip.length;
    document.getElementById('openCount').textContent='0';
    document.getElementById('baseN').textContent=base.length;
    document.getElementById('dipN').textContent=dip.length;
    document.getElementById('baseBody').innerHTML=base.length?base.map(r=>{
      const cmfC=parseFloat(r.cmf)>=0?'#22c55e':'#ef4444';
      const macdC=parseFloat(r.macd)>=0?'#22c55e':'#ef4444';
      const vsC=parseFloat(r.vs)>1.8?'#ef4444':'#8b93a7';
      return \`<tr><td class="sym">\${r.sym.replace('USDT','')}<span class="q">USDT</span></td><td class="num">\${r.entry.toFixed(r.entry<1?6:2)}</td><td class="num adx">\${r.score}</td><td class="num" style="color:\${r.obv==='up'?'#22c55e':'#ef4444'}">\${r.obv}</td><td class="num" style="color:\${cmfC}">\${r.cmf}</td><td class="num" style="color:\${macdC}">\${r.macd}</td><td class="num" style="color:\${vsC}">\${r.vs}x</td><td class="num">\${r.bb}</td><td class="num" style="color:#8b93a7">\${r.oi}</td><td class="num" style="color:#8b93a7">\${r.fund}</td><td class="num sl">\${r.sl.toFixed(r.sl<1?6:2)}</td><td class="num tp">\${r.tp1.toFixed(r.tp1<1?6:2)}<span class="rr">+\${((r.tp1-r.entry)/r.entry*100).toFixed(1)}%</span></td><td class="num tp">\${r.tp2.toFixed(r.tp2<1?6:2)}<span class="rr">+\${((r.tp2-r.entry)/r.entry*100).toFixed(1)}%</span></td><td class="num" style="text-align:center">\${r.rr1}/\${r.rr2}</td></tr>\`;
    }).join(''):'<tr><td colspan="14" style="text-align:center;color:#8b93a7;padding:20px">ไม่มี BASE setup ผ่านเกณฑ์</td></tr>';
    document.getElementById('dipBody').innerHTML=dip.length?dip.map(r=>{
      const rsiC=parseFloat(r.rsi)>=50?'#22c55e':'#ef4444';const stC=r.st==='bull'?'#22c55e':'#ef4444';const macdC=parseFloat(r.macd)>=0?'#22c55e':'#ef4444';
      return \`<tr><td class="sym">\${r.sym.replace('USDT','')}<span class="q">USDT</span></td><td class="num">\${r.entry.toFixed(r.entry<1?6:2)}</td><td class="num adx">\${r.score}</td><td class="num" style="color:\${rsiC}">RSI \${r.rsi}</td><td class="num" style="color:\${stC}">\${r.st}</td><td class="num" style="color:\${macdC}">\${r.macd}</td><td class="num" style="color:#8b93a7">\${r.vs}x</td><td class="num" style="color:#8b93a7">\${r.oi}</td><td class="num" style="color:#8b93a7">\${r.fund}</td><td class="num sl">\${r.sl.toFixed(r.sl<1?6:2)}</td><td class="num tp">\${r.tp1.toFixed(r.tp1<1?6:2)}<span class="rr">+\${((r.tp1-r.entry)/r.entry*100).toFixed(1)}%</span></td><td class="num tp">\${r.tp2.toFixed(r.tp2<1?6:2)}<span class="rr">+\${((r.tp2-r.entry)/r.entry*100).toFixed(1)}%</span></td><td class="num" style="text-align:center">\${r.rr1}/\${r.rr2}</td><td class="num" style="text-align:center;color:#8b93a7;font-size:9px">\${r.tf}</td></tr>\`;
    }).join(''):'<tr><td colspan="13" style="text-align:center;color:#8b93a7;padding:20px">ไม่มี DIP setup ผ่านเกณฑ์</td></tr>';
    const ban = ipBanned ? ' ⚠️ โดนแบนชั่วคราว หยุดสแกน' : '';
    document.getElementById('footer').textContent='✓ อัปเดต '+new Date().toLocaleString('th-TH',{hour12:false})+' · 4 TF + MACD/BB/Vol/OI/Funding · RSI16/EMA20-200 · สแกน '+ok+' สำเร็จ / '+fail+' ล้มเหลว · '+reqCount+' req'+ban;
  }catch(e){
    document.getElementById('footer').textContent='❌ โหลดไม่ได้: '+e.message;
  }
}
load();
setInterval(load,60000);
`;
fs.writeFileSync(p, s.slice(0,start)+new_script+s.slice(end), encoding="utf-8");
console.log("patched, new size", s.slice(0,start).length+new_script.length+s.slice(end).length);
