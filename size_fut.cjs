const https=require("https");
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)));}).on("error",rej);});}
function ema(v,p){const k=2/(p+1);let out=[],prev=null;for(let i=0;i<v.length;i++){if(i<p-1){out.push(NaN);continue;}if(i===p-1){let s=0;for(let j=0;j<p;j++)s+=v[j];out.push(s/p);prev=out[i];continue;}prev=v[i]*k+prev*(1-k);out.push(prev);}return out;}
function lastSwingLow(l,n){return Math.min(...l.slice(-n));}
// ลิกวิดราคา (approx isolated long): entry*(1 - 1/lev + mmr)
function liqPrice(entry,lev,mmr=0.005){return entry*(1 - 1/lev + mmr);}
(async()=>{
  const syms=["1000PEPEUSDT","TRXUSDT","HBARUSDT","LDOUSDT","MONUSDT"];
  const marginPerWood=6, lev=5, woods=10, totalMargin=marginPerWood*woods; // 60
  const woodsPerCoin=woods/syms.length; // 2
  const marginPerCoin=marginPerWood*woodsPerCoin; // 12
  console.log(`ฟิวเจอร์ส: ไม้ละ ${marginPerWood} USDT margin × ${lev}x = notional ${marginPerWood*lev}/ไม้`);
  console.log(`รวม ${woods} ไม้ = ${totalMargin} USDT margin | หักตัวละ ${marginPerCoin} USDT (=${marginPerCoin*lev} notional)\n`);
  console.log("SYM          ENTRY     SL        LIQ(5x)   SLในbuf?  $RISK/ไม้  TP1(+1.5R)  TP2(+3R)");
  for(const sym of syms){
    try{
      const kl=await get(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1h&limit=200`);
      const c=kl.map(x=>+x[4]),l=kl.map(x=>+x[3]);
      const close=c[c.length-1];
      const e20=ema(c,20)[c.length-1],e50=ema(c,50)[c.length-1];
      const recv=e20<close?e20:close;
      const safe=Math.min(e50,lastSwingLow(l,50));
      const sl=safe*0.97;
      const liq=liqPrice(recv,lev);
      const inBuf = sl > liq; // SL ต้องอยู่เหนือ liq (ไม่ถูกลิกก่อนโดน SL)
      const notionalPerWood=marginPerWood*lev;
      const riskPerWood=notionalPerWood*((recv-sl)/recv);
      const tp1=recv+(recv-sl)*1.5, tp2=recv+(recv-sl)*3;
      const dec=close<0.01?6:close<1?4:2;
      console.log(
        sym.padEnd(12),
        recv.toFixed(dec).padEnd(9),
        sl.toFixed(dec).padEnd(9),
        liq.toFixed(dec).padEnd(9),
        (inBuf?'✅':'🔴').padEnd(7),
        ('$'+riskPerWood.toFixed(2)).padEnd(9),
        tp1.toFixed(dec).padEnd(10),
        tp2.toFixed(dec));
    }catch(e){console.log(sym,"ERR",e.message);}
  }
  console.log("\n* $RISK/ไม้ = notional(30) × ห่าง SL — นี่คือเงินจริงที่เสี่ยงต่อไม้ (จาก margin 6)");
  console.log("* LIQ(5x) ≈ รับ -19.5% — ถ้า SL ต่ำกว่าเส้นนี้ = โดนลิกก่อนโดน SL (🔴)");
})();
