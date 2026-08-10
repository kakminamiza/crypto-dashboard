/* ====== Indicator math (ported from analyze_coin.js — verified against live Binance) ====== */
const FAPI="https://fapi.binance.com";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const EMA_FAST=20,EMA_SLOW=50,EMA_TREND=200,ADX_LEN=14,ADX_THRESH=25,SL_ATR=2,TP1R=1.5,TP2R=3;
const RSI_LEN=14,ST_LEN=10,ST_MULT=3,MACD_F=12,MACD_S=26,MACD_SIG=9;
const MTF=["5m","15m","1h","4h","1d"];
function ema(v,n){let k=2/(n+1),e=v[0],o=[e];for(let i=1;i<v.length;i++){e=v[i]*k+e*(1-k);o.push(e)}return o}
function rma(v,n){let a=1/n,e=v[0],o=[e];for(let i=1;i<v.length;i++){e=v[i]*a+e*(1-a);o.push(e)}return o}
function atr(h,l,c,n=14){let tr=[h[0]-l[0]];for(let i=1;i<c.length;i++)tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])));return rma(tr,n)}
function adx(h,l,c,n=14){let pdm=[],mdm=[],tr=[];for(let i=1;i<c.length;i++){let up=h[i]-h[i-1],dn=l[i-1]-l[i];pdm.push(up>dn&&up>0?up:0);mdm.push(dn>up&&dn>0?dn:0);tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])))}if(tr.length<n+1)return[0];let ar=rma(tr,n),pdi=rma(pdm,n).map((p,i)=>ar[i]?100*p/ar[i]:0),mdi=rma(mdm,n).map((m,i)=>ar[i]?100*m/ar[i]:0),dx=pdi.map((p,i)=>(p+mdi[i])?100*Math.abs(p-mdi[i])/(p+mdi[i]):0);return rma(dx,n)}
function rsi(c,n=14){let gains=[0],losses=[0];for(let i=1;i<c.length;i++){let d=c[i]-c[i-1];gains.push(d>0?d:0);losses.push(d<0?-d:0)}if(gains.length-1<n)return[50];let ag=rma(gains.slice(1),n),al=rma(losses.slice(1),n);let out=[];for(let i=0;i<c.length;i++){if(i<n){out.push(50);continue}let gi=i-1;let g=ag[gi],l=al[gi];if(!l||l===0)out.push(100);else{let rs=g/l;out.push(100-100/(1+rs))}}return out}
function supertrend(h,l,c,len=10,mult=3){let up=[],dn=[],st=[],dir=1,atrS=rma(h.map((x,i)=>Math.max(x-l[i],Math.abs(x-c[i-1]),Math.abs(l[i]-c[i-1]))),len);for(let i=0;i<c.length;i++){let mid=(h[i]+l[i])/2,ub=mid+mult*atrS[i],lb=mid-mult*atrS[i];if(i===0){up.push(ub);dn.push(lb);st.push(ub);continue}up.push(Math.max(ub,up[i-1]));dn.push(Math.min(lb,dn[i-1]));if(c[i]>up[i-1])dir=1;else if(c[i]<dn[i-1])dir=-1;st.push(dir===1?dn[i]:up[i])}return{st,lastDir:st.map((_,i)=>i===0?1:(c[i]>up[i-1]?1:c[i]<dn[i-1]?-1:st[i-1]>=up[i-1]?1:-1))}}
function macd(c,f=12,s=26,sg=9){let ef=ema(c,f),es=ema(c,s),line=ef.map((x,i)=>x-es[i]),sig=rma(line,sg),hist=line.map((x,i)=>x-sig[i]);return{line,sig,hist}}
function stateOf(k){if(!k||k.c.length<210)return"NEUTRAL";let ef=ema(k.c,EMA_FAST),es=ema(k.c,EMA_SLOW),et=ema(k.c,EMA_TREND),p=k.c.at(-1);if(ef.at(-1)>es.at(-1)&&p>et.at(-1))return"BULL";if(ef.at(-1)<es.at(-1)&&p<et.at(-1))return"BEAR";return"NEUTRAL"}

/* ====== safeFetch: pace + retry 429 + hard-stop 418 (avoids IP ban) ====== */
const MIN_GAP_MS=60,MAX_GAP_MS=2500,WEIGHT_BUDGET=2000;
let lastReq=0,wUsed=0,wWin=Date.now(),banned=false,curGap=MIN_GAP_MS;
async function safeFetch(url,w=1){
  if(banned) throw new Error("banned");
  let now=Date.now();
  if(now-wWin>60000){ wUsed=0; wWin=now; }
  if(wUsed+w>WEIGHT_BUDGET){ await sleep(60000-(now-wWin)+200); wUsed=0; wWin=Date.now(); }
  let frac=Math.min(wUsed/WEIGHT_BUDGET,1);
  let gap=MIN_GAP_MS+(MAX_GAP_MS-MIN_GAP_MS)*Math.pow(frac,2);
  curGap=Math.round(gap);
  let el=Date.now()-lastReq; if(el<gap) await sleep(gap-el);
  lastReq=Date.now();
  let r=await fetch(url);
  let hw=+(r.headers.get("X-MBX-USED-WEIGHT-1M")||w); wUsed=hw;
  if(r.status===418){ banned=true; showBanner("⛔ IP ถูกบล็อกชั่วคราวจาก Binance (418) — หยุดอัปเดตอัตโนมัติ จะกลับมาเองใน ~5 นาที"); setTimeout(()=>{banned=false;hideBanner();},300000); throw new Error("IP BANNED (418)"); }
  if(r.status===429){ let ra=+(r.headers.get("Retry-After")||5); await sleep(ra*1000); return safeFetch(url,w); }
  if(!r.ok) throw new Error("HTTP "+r.status);
  return r;
}
let kcache={};
function kcacheKey(sym,tf,limit){return sym+"|"+tf+"|"+limit}
async function klines(sym,tf,limit){
  let key=kcacheKey(sym,tf,limit);
  if(kcache[key])return kcache[key];
  let r=await safeFetch(`${FAPI}/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=${limit}`);
  let d=await r.json();
  if(!Array.isArray(d)||!d.length) throw new Error("no data "+sym);
  let o={h:d.map(k=>+k[2]),l:d.map(k=>+k[3]),c:d.map(k=>+k[4]),o:d.map(k=>+k[1]),v:d.map(k=>+k[5]),t:d.map(k=>+k[0])};
  kcache[key]=o;return o;
}

/* ====== compute signal for ONE coin (single TF + MTF) ====== */
async function analyze(sym,signalTf){
  let k=await klines(sym,signalTf,300);
  if(!k||k.c.length<210) return {error:"แท่งไม่พอ (ต้อง >=210)"};
  let ef=ema(k.c,EMA_FAST),es=ema(k.c,EMA_SLOW),et=ema(k.c,EMA_TREND),a=adx(k.h,k.l,k.c,ADX_LEN),at=atr(k.h,k.l,k.c,14);
  let price=k.c.at(-1),adxNow=a.at(-1),atrNow=at.at(-1);
  let states={};for(let tf of MTF)states[tf]=stateOf(await klines(sym,tf,260));
  let bull=Object.values(states).filter(s=>s==="BULL").length;
  let bear=Object.values(states).filter(s=>s==="BEAR").length;
  let fUp=[-3,-2,-1].some(i=>ef[i-1]<=es[i-1]&&ef[i]>es[i]);
  let fDn=[-3,-2,-1].some(i=>ef[i-1]>=es[i-1]&&ef[i]<es[i]);
  let dir=null;
  if(ef.at(-1)>es.at(-1)&&price>et.at(-1)&&adxNow>ADX_THRESH&&bull>=3)dir="long";
  else if(ef.at(-1)<es.at(-1)&&price<et.at(-1)&&adxNow>ADX_THRESH&&bear>=3)dir="short";
  let entry=price,sl,tp1,tp2,risk;
  if(dir==="long"){sl=entry-SL_ATR*atrNow;risk=entry-sl;tp1=entry+TP1R*risk;tp2=entry+TP2R*risk}
  else if(dir==="short"){sl=entry+SL_ATR*atrNow;risk=sl-entry;tp1=entry-TP1R*risk;tp2=entry-TP2R*risk}
  let fresh=dir==="long"?fUp:dir==="short"?fDn:false;
  let align=dir==="long"?bull:dir==="short"?bear:Math.max(bull,bear);
  let score=dir?align*20+adxNow+(fresh?15:0):-1;
  let rsiArr=rsi(k.c,RSI_LEN),rsiNow=rsiArr.at(-1);
  let st=supertrend(k.h,k.l,k.c,ST_LEN,ST_MULT),stDir=st.lastDir.at(-1);
  let m=macd(k.c,MACD_F,MACD_S,MACD_SIG),mLine=m.line.at(-1),mSig=m.sig.at(-1),mHist=m.hist.at(-1);
  let macdCross=mLine>mSig?"bull":mLine<mSig?"bear":"neu";
  let rr1=risk>0?(tp1-entry)/risk:0, rr2=risk>0?(tp2-entry)/risk:0;
  return {sym,signalTf,k,price,ef:ef.at(-1),es:es.at(-1),et:et.at(-1),adxNow,atrNow,rsiNow,stDir,macdCross,mHist,states,bull,bear,dir,fresh,score,entry,sl,tp1,tp2,risk,rr1,rr2};
}

/* ====== scanner: lighter MTF (signalTf + 4h + 1d) to keep calls safe ====== */
async function scanCoin(sym,signalTf){
  let k=await klines(sym,signalTf,300);
  if(!k||k.c.length<210) return null;
  let ef=ema(k.c,EMA_FAST),es=ema(k.c,EMA_SLOW),et=ema(k.c,EMA_TREND),a=adx(k.h,k.l,k.c,ADX_LEN),at=atr(k.h,k.l,k.c,14);
  let price=k.c.at(-1),adxNow=a.at(-1),atrNow=at.at(-1);
  // 3-TF alignment (keep call count low): signalTf, 4h, 1d
  let states={}; states[signalTf]=stateOf(k);
  for(let tf of ["4h","1d"]) states[tf]=stateOf(await klines(sym,tf,260));
  let bull=Object.values(states).filter(s=>s==="BULL").length;
  let bear=Object.values(states).filter(s=>s==="BEAR").length;
  let fUp=[-3,-2,-1].some(i=>ef[i-1]<=es[i-1]&&ef[i]>es[i]);
  let fDn=[-3,-2,-1].some(i=>ef[i-1]>=es[i-1]&&ef[i]<es[i]);
  let dir=null;
  if(ef.at(-1)>es.at(-1)&&price>et.at(-1)&&adxNow>ADX_THRESH&&bull>=2)dir="long";
  else if(ef.at(-1)<es.at(-1)&&price<et.at(-1)&&adxNow>ADX_THRESH&&bear>=2)dir="short";
  let fresh=dir==="long"?fUp:dir==="short"?fDn:false;
  let align=dir==="long"?bull:dir==="short"?bear:Math.max(bull,bear);
  let score=dir?Math.min(100,align*22+adxNow+(fresh?12:0)):-1;
  let rsiArr=rsi(k.c,RSI_LEN),rsiNow=rsiArr.at(-1);
  let mom=null; if(price>et.at(-1))mom="up"; else if(price<et.at(-1))mom="down"; else mom="side";
  // Entry/SL/TP (same formula as analyze: SL=ATRx2, TP1=1.5R, TP2=3R)
  let entry=price,sl,tp1,tp2,risk=0;
  if(dir==="long"){sl=entry-SL_ATR*atrNow;risk=entry-sl;tp1=entry+TP1R*risk;tp2=entry+TP2R*risk;}
  else if(dir==="short"){sl=entry+SL_ATR*atrNow;risk=sl-entry;tp1=entry-TP1R*risk;tp2=entry-TP2R*risk;}
  // OI + Funding
  let oi=null,fund=null;
  try{
    let oj=await (await safeFetch(`${FAPI}/futures/data/openInterest?symbol=${sym}`)).json();
    oi=+oj.openInterest;
    let pj=await (await safeFetch(`${FAPI}/fapi/v1/premiumIndex?symbol=${sym}`)).json();
    fund=+pj.lastFundingRate;
  }catch(e){ /* optional */ }
  return {sym,price,entry,sl,tp1,tp2,adxNow,rsiNow,dir,score,fresh,mom,bull,bear,oi,fund,
          chg:((price-k.c[0])/k.c[0]*100)};
}

/* ====== formatting (no scientific notation) ====== */
function fmt(x){
  if(x==null||isNaN(x)) return "–";
  let n=+x, abs=Math.abs(n); if(n===0) return "0";
  let dec = abs>=1000?2 : abs>=1?4 : abs>=0.01?5 : abs>=0.0001?7 : 9;
  return n.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function pct(x){ return (x>=0?"+":"")+x.toFixed(2)+"%"; }
function stars(s){ if(s<0)return "–"; if(s>=85)return "★★★★★"; if(s>=70)return "★★★★☆"; if(s>=55)return "★★★☆☆"; if(s>=45)return "★★☆☆☆"; return "★☆☆☆☆"; }
function dirTag(d){ return d==="long"?'<span class="tag long">LONG</span>':d==="short"?'<span class="tag short">SHORT</span>':'<span class="tag neu">รอ</span>'; }
function momTxt(m){ return m==="up"?'<span class="mom pos">▲ ขึ้น</span>':m==="down"?'<span class="mom neg">▼ ลง</span>':'<span class="mom neu">• Sideways</span>'; }

/* ====== chart ====== */
function drawChart(k,ef,es,et){
  let W=1000,H=240,pad=8;
  let lo=Math.min(...k.c,...ef,...es,...et), hi=Math.max(...k.c,...ef,...es,...et);
  let rng=(hi-lo)||1; lo-=rng*0.05; hi+=rng*0.05; rng=hi-lo;
  let n=k.c.length;
  let X=i=>pad+(W-2*pad)*i/(n-1);
  let Y=v=>pad+(H-2*pad)*(1-(v-lo)/rng);
  let path=arr=>arr.map((v,i)=>(i?"L":"M")+X(i).toFixed(1)+" "+Y(v).toFixed(1)).join(" ");
  let pricePath=path(k.c);
  let e20=path(ef), e50=path(es), e200=path(et);
  let lastX=X(n-1), lastY=Y(k.c.at(-1));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${pricePath}" fill="none" stroke="#4aa8ff" stroke-width="1.5"/>
    <path d="${e20}" fill="none" stroke="#ffce4a" stroke-width="1"/>
    <path d="${e50}" fill="none" stroke="#26d07c" stroke-width="1"/>
    <path d="${e200}" fill="none" stroke="#ff5b5b" stroke-width="1" stroke-dasharray="3 3"/>
    <circle cx="${lastX}" cy="${lastY}" r="3.5" fill="#fff"/>
  </svg>
  <div class="leg">
    <span><i style="background:#4aa8ff"></i>ราคา</span>
    <span><i style="background:#ffce4a"></i>EMA20</span>
    <span><i style="background:#26d07c"></i>EMA50</span>
    <span><i style="background:#ff5b5b"></i>EMA200</span>
  </div>`;
}

