const https=require("https");
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)));}).on("error",rej);});}
function ema(v,p){const k=2/(p+1);let out=[],prev=null;for(let i=0;i<v.length;i++){if(i<p-1){out.push(NaN);continue;}if(i===p-1){let s=0;for(let j=0;j<p;j++)s+=v[j];out.push(s/p);prev=out[i];continue;}prev=v[i]*k+prev*(1-k);out.push(prev);}return out;}
function lastSwingLow(l,n){return Math.min(...l.slice(-n));}
(async()=>{
  const syms=["1000PEPEUSDT","TRXUSDT","HBARUSDT","LDOUSDT","MONUSDT"];
  const marginPerWood=6, woods=10, lev=5; // 3-5x -> ใช้ 5x
  const totalMargin=marginPerWood*woods; // 60 USDT
  const perCoinMargin=totalMargin/syms.length; // 12 USDT/coin
  const totalNotional=perCoinMargin*lev*syms.length; // 300 USDT รวม notional
  console.log(`ทุน: ไม้ละ ${marginPerWood} USDT × ${woods} ไม้ = ${totalMargin} USDT (margin)`);
  console.log(`เลฟ ${lev}x → notional รวม ~${totalNotional} USDT | หักน้อยตัวละ ${perCoinMargin} USDT margin (=${perCoinMargin*lev} notional)\n`);
  console.log("SYM          ENTRY(รับ)   SL           RISK%   NOTIONAL  MARGIN  TP1(+1.5R)  TP2(+3R)");
  for(const sym of syms){
    try{
      const kl=await get(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1h&limit=200`);
      const c=kl.map(x=>+x[4]),l=kl.map(x=>+x[3]);
      const close=c[c.length-1];
      const e20=ema(c,20)[c.length-1],e50=ema(c,50)[c.length-1];
      const recv=e20<close?e20:close;
      const safe=Math.min(e50,lastSwingLow(l,50));
      const sl=safe*0.97;
      const notional=perCoinMargin*lev;
      const distPct=(recv-sl)/recv;
      const riskUSD=notional*distPct;
      const riskPctOfTotal=riskUSD/totalMargin*100;
      const tp1=recv+ (recv-sl)*1.5, tp2=recv+(recv-sl)*3;
      const dec=close<0.01?6:close<1?4:2;
      console.log(
        sym.padEnd(12),
        recv.toFixed(dec).padEnd(11),
        sl.toFixed(dec).padEnd(11),
        (riskPctOfTotal).toFixed(1)+'%',
        (' '+notional.toFixed(0)).padEnd(10),
        (' '+perCoinMargin.toFixed(0)).padEnd(7),
        tp1.toFixed(dec).padEnd(11),
        tp2.toFixed(dec));
    }catch(e){console.log(sym,"ERR",e.message);}
  }
  console.log("\n* RISK% = เสี่ยงต่อไม้ เทียบทุนรวม 60 USDT (เป้าหมาย 1-2%)");
})();
