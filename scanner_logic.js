// scanner_logic.js - client-side indicators, scan, LLM thesis, filters, stars, sound, position watch, score
const UA='Mozilla/5.0'; const DELAY=900; let auto=false, timer=null;
const FUT='https://fapi.binance.com/fapi/v1';

// ---- sound alert for DIP-BUY ----
let audioCtx=null;
function beep(){
  try{
    audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type='triangle'; o.frequency.value=880;
    g.gain.setValueAtTime(0.001,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3,audioCtx.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.35);
    o.start(); o.stop(audioCtx.currentTime+0.36);
  }catch(e){}
}

function stars(n){n=Math.max(0,Math.min(5,n|0));return '⭐'.repeat(n)+'☆'.repeat(5-n);}
function passFilter(sig){
  const f=document.getElementById('fSignal').value;
  if(f==='DIP-BUY'&&sig!=='DIP-BUY')return false;
  if(f==='WATCH'&&sig!=='WATCH')return false;
  if(f==='NONO'&&sig==='NO-SIGNAL')return false;
  const min=+document.getElementById('fMin2').value;
  return sig!=='NO-SIGNAL'||true; // score filter applied after compute
}

async function klines(sym,tf,limit=600){
  const r=await fetch(`${FUT}/klines?symbol=${sym}&interval=${tf}&limit=${limit}`,{headers:{'User-Agent':UA}});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const raw=await r.json(); return raw.map(x=>[+x[1],+x[2],+x[3],+x[4]]);
}
function ema(v,p){const k=2/(p+1);let out=[],prev=null;
  for(let i=0;i<v.length;i++){if(i<p-1){out.push(NaN);continue;}
    if(i===p-1){let s=0;for(let j=0;j<p;j++)s+=v[j];out.push(s/p);prev=out[i];continue;}
    prev=v[i]*k+prev*(1-k);out.push(prev);}return out;}
function rsi(v,p=14){let g=[],l=[];for(let i=1;i<v.length;i++){const d=v[i]-v[i-1];g.push(d>0?d:0);l.push(d<0?-d:0);}
  let ag=0,al=0;for(let i=0;i<p;i++){ag+=g[i];al+=l[i];}ag/=p;al/=p;
  let rs=[];for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;rs.push(100-100/(1+(al===0?1e9:ag/al)));}return rs;}
function tr(h,l,c){const pc0=[];for(let i=0;i<c.length;i++)pc0.push(i===0?c[i]:c[i-1]);
  let o=[];for(let i=0;i<h.length;i++)o.push(Math.max(h[i]-l[i],Math.abs(h[i]-pc0[i]),Math.abs(l[i]-pc0[i])));return o;}
function atr(h,l,c,p=14){return ema(tr(h,l,c),p);}
function adx(h,l,c,p=14){const TR=tr(h,l,c);let pdm=[],mdm=[];
  for(let i=0;i<h.length;i++){const up=h[i]-(i===0?h[i]:h[i-1]);const dn=(i===0?l[i]:l[i-1])-l[i];
    pdm.push((up>dn&&up>0)?up:0);mdm.push((dn>up&&dn>0)?dn:0);}
  const ae=atr(h,l,c,p);const pdi=ema(pdm,p).map((x,i)=>ae[i]?x/ae[i]*100:0);
  const mdi=ema(mdm,p).map((x,i)=>ae[i]?x/ae[i]*100:0);
  const dx=pdi.map((x,i)=>(pdi[i]+mdi[i])?Math.abs(x-mdi[i])/(x+mdi[i])*100:0);
  return ema(dx,p);}
function supertrend(h,l,c,p=10,m=3){const ae=atr(h,l,c,p);const hl2=h.map((x,i)=>(x+l[i])/2);
  let up=hl2.map((x,i)=>x+m*ae[i]);let lo=hl2.map((x,i)=>x-m*ae[i]);let st=[],dir=[];
  let lastST=NaN, lastDir=1;
  for(let i=0;i<h.length;i++){
    if(ae[i]===undefined||ae[i]===null||isNaN(ae[i])){st.push(lastST);dir.push(lastDir);continue;}
    if(i===0){st.push(lo[0]);dir.push(1);lastST=lo[0];lastDir=1;continue;}
    if(c[i]>up[i-1])dir.push(1);else if(c[i]<lo[i-1])dir.push(-1);else dir.push(dir[i-1]);
    if(dir[i]===1){const cand=Math.max(lo[i],(isNaN(lo[i-1])?-Infinity:lo[i-1]));st.push(cand);lo[i]=cand;}
    else{const cand=Math.min(up[i],(isNaN(up[i-1])?Infinity:up[i-1]));st.push(cand);up[i]=cand;}
    lastST=st[i];lastDir=dir[i];}
  return {st,dir};}

function analyze(sym,tf){
  return klines(sym,tf).then(d=>{
    const o=d.map(x=>x[0]),h=d.map(x=>x[1]),l=d.map(x=>x[2]),c=d.map(x=>x[3]);
    const close=c[c.length-1],lo=l[l.length-1];
    const e20=ema(c,20)[c.length-1],e50=ema(c,50)[c.length-1],e200=ema(c,200)[c.length-1];
    const r=rsi(c)[rsi(c).length-1];const a=adx(h,l,c)[adx(h,l,c).length-1];
    const st=supertrend(h,l,c);const sv=st.st[st.st.length-1];const sup=st.dir[st.dir.length-1]===1;
    const trend_ok=a>25,rsi_ok=(r>30&&r<70),above=e50&&close>e50,stu=sup;
    const dip=(lo<=e20*1.005&&close>=e20*0.997)||(close>=sv*0.985&&close<=sv*1.02);
    const score=[trend_ok,rsi_ok,above,stu,dip].filter(Boolean).length;
    let sig=(trend_ok&&rsi_ok&&above&&stu&&dip)?'DIP-BUY':(score>=3?'WATCH':'NO-SIGNAL');
    return {sym,tf,close,e20,e50,e200,r,a,sv,score,sig,stu};
  });
}

async function llmThesis(sig,model){
  const prompt=`You are a crypto dip-buy analyst. Write SHORT thesis (max 4 lines) for ${sig.sig} signal.
${sig.sym}@${sig.tf} Close ${sig.close} RSI ${sig.r?.toFixed(1)} ADX ${sig.a?.toFixed(1)} EMA50 ${sig.e50?.toFixed(4)} ST ${sig.sv?.toFixed(4)}.
Explain WHY valid dip-buy and plan (entry, SL, target). Concise.`;
  try{
    const r=await fetch('http://localhost:11434/api/generate',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:model,prompt:prompt,stream:false})});
    const j=await r.json(); return `[${model}] `+ (j.response||'').trim();
  }catch(e){ return '[LLM off/err] '+e.message; }
}

function cardHTML(d, thesisTxt){
  const cls=d.sig==='DIP-BUY'?'b-buy':d.sig==='WATCH'?'b-watch':'b-no';
  return `<div class="sym">${d.sym} <span class="badge ${cls}">${d.sig} ${d.score}/5</span></div>
    <div class="row"><span>คะแนน</span><span class="stars">${stars(d.score)}</span></div>
    <div class="row"><span>Close</span><span>${d.close}</span></div>
    <div class="row"><span>EMA20/50</span><span>${d.e20?.toFixed(4)} / ${d.e50?.toFixed(4)}</span></div>
    <div class="row"><span>RSI(14)</span><span style="color:${d.rsi_ok?'var(--ok)':'var(--bad)'}">${d.r?.toFixed(1)}</span></div>
    <div class="row"><span>ADX(14)</span><span style="color:${d.trend_ok?'var(--ok)':'var(--muted)'}">${d.a?.toFixed(1)}</span></div>
    <div class="row"><span>SuperTrend</span><span>${d.sv?.toFixed(4)} ${d.stu?'UP':'DOWN'}</span></div>
    <div class="thesis">${thesisTxt}</div>`;
}
function thesisTemplate(d){
  const distE20=d.close-d.e20, distSV=d.close-d.sv;
  const near=(Math.abs(distE20)/d.e20<0.01)||(Math.abs(distSV)/d.sv<0.01);
  const where = near ? 'ลูลเข้าใกล้ EMA20/ST (dip zone)' :
    (distE20>0&&distSV>0 ? 'อยู่เหนือ EMA20/ST ยังไม่มี pullback' : 'อยู่ใต้ support แล้ว');
  const risk = near ? 'รอเด้งยืนยันแล้วเข้าไม่ไล่ราคา (no chasing)' :
    'ยังไม่เข้าเงื่อนไข dip — รอราคาลูล back หา EMA20/ST';
  return `[THESIS] ${d.sym}@${d.tf}\n  Trend ADX ${d.a?.toFixed(1)} ${d.trend_ok?'OK':'side'} | EMA50 ${d.e50?.toFixed(4)} ${d.close>d.e50?'>':'<'}\n  RSI ${d.r?.toFixed(1)} ${d.rsi_ok?'(30-70) OK':'CUT'} | ST ${d.sv?.toFixed(4)} ${d.stu?'UP':'DOWN'}\n  Setup ${where}\n  Plan ${risk}; SL < ${Math.min(d.e20,d.sv)?.toFixed(4)}; target EMA200 ${d.e200?.toFixed(4)}`;
}

async function scan(){
  const syms=document.getElementById('sym').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const tf=document.getElementById('tf').value;
  const useLLM=document.getElementById('usellm').checked, model=document.getElementById('model').value;
  const minS=+document.getElementById('fMin2').value, fS=document.getElementById('fSignal').value;
  const grid=document.getElementById('grid'); grid.innerHTML='';
  document.getElementById('foot').textContent='Scanning '+syms.length+'...';
  for(const s of syms){
    const el=document.createElement('div');el.className='card';
    el.innerHTML='<div class="sym">'+s+' <span class="badge b-watch">…</span></div>';grid.appendChild(el);
    try{ await new Promise(r=>setTimeout(r,DELAY));
      const d=await analyze(s,tf);
      if(fS!=='ALL'&&d.sig!==fS&&!(fS==='NONO'&&d.sig==='NO-SIGNAL')){el.remove();continue;}
      if(d.score<minS&&d.sig!=='DIP-BUY'){el.remove();continue;}
      let th=thesisTemplate(d); if(useLLM)th=await llmThesis(d,model);
      if(d.sig==='DIP-BUY')beep();
      el.innerHTML=cardHTML(d,th); el.onclick=()=>el.classList.toggle('open');
    }catch(e){ el.innerHTML='<div class="sym">'+s+' <span class="badge b-no">ERR</span></div><div class="err">'+e.message+'</div>'; }
  }
  document.getElementById('foot').textContent='Done '+new Date().toLocaleTimeString();
  if(auto) timer=setTimeout(scan,60000);
}

async function exchangeSymbols(){
  try{const r=await fetch(`${FUT}/exchangeInfo`,{headers:{'User-Agent':UA}});
    const j=await r.json();
    return j.symbols.filter(s=>s.quoteAsset==='USDT'&&s.contractType==='PERPETUAL'&&s.status==='TRADING').map(s=>s.symbol);
  }catch(e){return null;}
}
async function scanAll(){
  const tf=document.getElementById('tf').value;
  const useLLM=document.getElementById('usellm').checked, model=document.getElementById('model').value;
  const minS=+document.getElementById('fMin2').value, fS=document.getElementById('fSignal').value;
  const grid=document.getElementById('grid'); grid.innerHTML='';
  let syms=await exchangeSymbols();
  if(!syms){syms=document.getElementById('sym').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
    document.getElementById('foot').textContent='exchangeInfo ไม่ได้ ใช้รายชื่อเดิม';}
  else document.getElementById('foot').textContent='Scan ทุกเหรียญ USDT ('+syms.length+') real-time...';
  let shown=0;
  for(const s of syms){
    const el=document.createElement('div');el.className='card';
    el.innerHTML='<div class="sym">'+s+' <span class="badge b-watch">…</span></div>';grid.appendChild(el);
    try{ await new Promise(r=>setTimeout(r,DELAY));
      const d=await analyze(s,tf);
      if(fS!=='ALL'&&d.sig!==fS&&!(fS==='NONO'&&d.sig==='NO-SIGNAL')){el.remove();continue;}
      if(d.score<minS&&d.sig!=='DIP-BUY'){el.remove();continue;}
      let th=thesisTemplate(d); if(useLLM)th=await llmThesis(d,model);
      if(d.sig==='DIP-BUY')beep();
      el.innerHTML=cardHTML(d,th); el.onclick=()=>el.classList.toggle('open'); shown++;
    }catch(e){ el.remove(); }
  }
  document.getElementById('foot').textContent=`Done. แสดง ${shown} รายการ จาก ${syms.length} (${new Date().toLocaleTimeString()})`;
  if(auto) timer=setTimeout(scanAll,120000);
}
function toggleAuto(){auto=!auto;document.getElementById('autoBtn').textContent=auto?'⏸ Auto':'▶ Auto';if(auto)scanAll();}

// ---- position watch ----
function loadPos(){return JSON.parse(localStorage.getItem('poswatch')||'[]');}
function savePos(p){localStorage.setItem('poswatch',JSON.stringify(p));}
function addPos(){
  const sym=document.getElementById('psym').value.toUpperCase();
  const tf=document.getElementById('ptf').value;
  const sup=+document.getElementById('psup').value, sl=+document.getElementById('psl').value;
  if(!sym||!sup||!sl){alert('fill all');return;}
  const p=loadPos();p.push({sym,tf,support:sup,sl,added:Date.now()});savePos(p);renderPos();
}
async function checkPos(){
  const p=loadPos();const list=document.getElementById('poslist');
  for(const pos of p){
    try{ await new Promise(r=>setTimeout(r,DELAY));
      const d=await klines(pos.sym,pos.tf);const c=d.map(x=>x[3]),l=d.map(x=>x[2]);
      const price=c[c.length-1],lo=l[l.length-1]; const rs=rsi(c);const r=rs[rs.length-1];
      let msg=`${pos.sym}@${pos.tf} price ${price.toFixed(4)} RSI ${r.toFixed(1)}`;
      if(lo<=pos.support)msg+=' ⚠️ หลุด support '+pos.support;
      if(lo<=pos.sl)msg+=' 🛑 หลุด SL '+pos.sl;
      if(r>=70)msg+=' 🔥 RSI overbought';
      if(!(lo<=pos.support||lo<=pos.sl||r>=70))msg+=' ✅ OK';
      const div=document.createElement('div');div.className='row';div.innerHTML=`<span>${pos.sym}</span><span>${msg}</span>`;
      list.prepend(div);
    }catch(e){console.log(e);}
  }
}
function renderPos(){
  const p=loadPos();const list=document.getElementById('poslist');
  list.innerHTML='<h3 style="font-size:13px">Watched ('+p.length+')</h3>'+
    p.map(x=>`<div class="row"><span>${x.sym}@${x.tf}</span><span>sup ${x.support} / sl ${x.sl}</span></div>`).join('');
}

// ---- score sheet ----
const FACTORS=['novelty','pnl_impact','regime_consistency','thesis_accuracy','execution_quality','risk_management'];
const FLABEL={novelty:'ความใหม่',pnl_impact:'ผลต่อ PnL',regime_consistency:'สอดคล้องสภาวะตลาด',
  thesis_accuracy:'คาดการณ์ถูก',execution_quality:'คุณภาพการเข้า',risk_management:'บริหารความเสี่ยง'};
function renderScore(){
  const f=document.getElementById('factors');
  f.innerHTML=FACTORS.map(k=>`<div class="row"><span>${FLABEL[k]}</span>
    <select id="f_${k}"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select></div>`).join('');
  renderScoreHist();
}
function saveScore(){
  const sym=document.getElementById('ssym').value.toUpperCase();
  const tf=document.getElementById('stf').value; const pnl=parseFloat(document.getElementById('spnl').value)||0;
  if(!sym){alert('ใส่ symbol');return;}
  const scores={};FACTORS.forEach(k=>scores[k]=+document.getElementById('f_'+k).value);
  const base=FACTORS.reduce((s,k)=>s+scores[k],0);
  const bonus=pnl<0?0.5:0;const weighted=base*(1+bonus);
  const rec={sym,tf,pnl,scores,base,bonus,weighted,ts:Date.now()};
  const mem=JSON.parse(localStorage.getItem('tradescore')||'[]');mem.push(rec);
  localStorage.setItem('tradescore',JSON.stringify(mem));
  document.getElementById('scoreresult').textContent=
    `บันทึก ${sym} PnL ${pnl}% | ฐาน ${base}/30 | โบนัสขาดทุน ${bonus*100}% | น้ำหนัก ${weighted.toFixed(1)}`;
  renderScoreHist();
}
function renderScoreHist(){
  const mem=JSON.parse(localStorage.getItem('tradescore')||'[]');
  const h=document.getElementById('scorehistory');
  if(!mem.length){h.innerHTML='';return;}
  const wins=mem.filter(m=>m.pnl>0).length; const avg=mem.reduce((s,m)=>s+m.weighted,0)/mem.length;
  h.innerHTML=`<div style="font-size:12px;margin-bottom:6px">รวม ${mem.length} เทรด | ชนะ ${wins} | น้ำหนักเฉลี่ย ${avg.toFixed(1)}</div>`+
    mem.slice().reverse().map(m=>`<div class="row"><span>${m.sym}@${m.tf}</span><span>PNL ${m.pnl}% · ${m.weighted.toFixed(1)}${m.bonus?' (ขาดทุน+)':''}</span></div>`).join('');
}

function switchTab(t){
  ['scan','pos','score','help'].forEach(x=>{
    document.getElementById('tab-'+x).classList.toggle('on',x===t);
    document.getElementById(x+'-pane').style.display=x===t?'block':'none';
  });
  if(t==='pos')renderPos(); if(t==='score')renderScore();
}
scan();
