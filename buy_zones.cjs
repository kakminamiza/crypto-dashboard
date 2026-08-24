const https=require("https");
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)));}).on("error",rej);});}
function ema(v,p){const k=2/(p+1);let out=[],prev=null;for(let i=0;i<v.length;i++){if(i<p-1){out.push(NaN);continue;}if(i===p-1){let s=0;for(let j=0;j<p;j++)s+=v[j];out.push(s/p);prev=out[i];continue;}prev=v[i]*k+prev*(1-k);out.push(prev);}return out;}
// swing low ล่าสุด n แท่ง (เอา low ต่ำสุดช่วงหลัง)
function lastSwingLow(l,n){return Math.min(...l.slice(-n));}
(async()=>{
  const syms=["1000PEPEUSDT","TRXUSDT","HBARUSDT","LDOUSDT","MONUSDT"];
  console.log("=== โซนรับ (limit) + เผื่อทุบ สำหรับ 5 ตัว 'กำลังจะพุ่ง' (tf 1h) ===\n");
  for(const sym of syms){
    try{
      const kl=await get(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1h&limit=200`);
      const c=kl.map(x=>+x[4]),h=kl.map(x=>+x[2]),l=kl.map(x=>+x[3]);
      const close=c[c.length-1];
      const e20=ema(c,20)[c.length-1],e50=ema(c,50)[c.length-1],e100=ema(c,100)[c.length-1];
      const swingLow20=lastSwingLow(l,20), swingLow50=lastSwingLow(l,50);
      // โซนรับ = แตะ EMA20 (ดิปกลับ) หรือ swing low 20 อย่างใดอย่างหนึ่งที่ใกล้กว่า แต่ต้อง < ราคาปัจจุบัน
      const recvCandidates=[e20, swingLow20].filter(x=>x<close).sort((a,b)=>b-a); // ตัวที่สูงสุดแต่ยัง<close = รับใกล้สุด
      const recv = recvCandidates.length? recvCandidates[0] : e20;
      // เผื่อทุบ = EMA50 หรือ swing low 50 (ลึกกว่า)
      const safeCandidates=[e50, swingLow50].filter(x=>x<recv);
      const safe = safeCandidates.length? Math.min(...safeCandidates) : e50;
      const dec = close<0.01?6 : close<1?4 : 2;
      console.log(`【${sym}】 ราคาปัจจุบัน ${close.toFixed(dec)}`);
      console.log(`  EMA20 ${e20.toFixed(dec)} | EMA50 ${e50.toFixed(dec)} | EMA100 ${e100.toFixed(dec)}`);
      console.log(`  🟢 รับ (limit)      : ${recv.toFixed(dec)}  (~${((recv/close-1)*100).toFixed(1)}% จากปัจจุบัน)`);
      console.log(`  🔵 เผื่อทุบ (deep)  : ${safe.toFixed(dec)}  (~${((safe/close-1)*100).toFixed(1)}% จากปัจจุบัน)`);
      console.log(`  SL เสนอ (หลุด ${safe.toFixed(dec)}) : ${(safe*0.97).toFixed(dec)}`);
      console.log("");
    }catch(e){console.log(sym,"ERR",e.message);}
  }
})();
