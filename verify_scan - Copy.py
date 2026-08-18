import urllib.request, json

FAPI = "https://fapi.binance.com"

def get_klines(sym, tf, limit=300):
    url = f"{FAPI}/fapi/v1/klines?symbol={sym}&interval={tf}&limit={limit}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.load(r)
    return {"h":[float(k[2]) for k in d], "l":[float(k[3]) for k in d], "c":[float(k[4]) for k in d]}

def ema(v,n):
    k=2/(n+1); e=v[0]; o=[e]
    for i in range(1,len(v)):
        e=v[i]*k+e*(1-k); o.append(e)
    return o

def rma(v,n):
    a=1/n; e=v[0]; o=[e]
    for i in range(1,len(v)):
        e=v[i]*a+e*(1-a); o.append(e)
    return o

# BUGGY RSI (mimics JS: al/ag length = len(c)-1, last index hits :99 fallback)
def rsi_buggy(c,n=14):
    g=[]; l=[]
    for i in range(1,len(c)):
        d=c[i]-c[i-1]; g.append(d>0 and d or 0); l.append(d<0 and -d or 0)
    ag=rma(g,n); al=rma(l,n)
    out=[]
    for i in range(len(c)):
        if i<n: out.append(50); continue
        # JS: al[i]?ag[i]/al[i]:99  -> al is length len(c)-1, so al[len(c)-1] is undefined -> 99
        if i < len(al):
            rs = ag[i]/al[i] if al[i] else 99
        else:
            rs = 99
        out.append(100-100/(1+rs))
    return out

# FIXED RSI
def rsi_fixed(c,n=14):
    g=[]; l=[]
    for i in range(1,len(c)):
        d=c[i]-c[i-1]; g.append(max(d,0)); l.append(max(-d,0))
    ag=rma(g,n); al=rma(l,n)
    out=[]
    for i in range(len(c)):
        if i<n: out.append(50); continue
        j=i-1
        rs = ag[j]/al[j] if al[j] else 99
        out.append(100-100/(1+rs))
    return out

# BUGGY supertrend (TR at i==0 uses c[i-1] = c[-1] -> NaN)
def st_buggy(h,l,c,len_=10,mult=3):
    atrS=rma([ (h[i]-l[i] if i==0 else max(h[i]-l[i], abs(h[i]-c[i-1]), abs(l[i]-c[i-1]))) for i in range(len(c)) ], len_)
    up=[]; dn=[]; st=[]; dir_=1
    for i in range(len(c)):
        mid=(h[i]+l[i])/2; ub=mid+mult*atrS[i]; lb=mid-mult*atrS[i]
        if i==0:
            up.append(ub); dn.append(lb); st.append(ub); continue
        up.append(max(ub,up[i-1])); dn.append(min(lb,dn[i-1]))
        if c[i]>up[i-1]: dir_=1
        elif c[i]<dn[i-1]: dir_=-1
        st.append(dn[i] if dir_==1 else up[i])
    lastDir=[]
    for i in range(len(c)):
        if i==0: lastDir.append(1); continue
        if c[i]>up[i-1]: lastDir.append(1)
        elif c[i]<dn[i-1]: lastDir.append(-1)
        else: lastDir.append(1 if st[i-1]>=up[i-1] else -1)
    return lastDir[-1]

# FIXED supertrend (TR at i==0 = h[0]-l[0])
def st_fixed(h,l,c,len_=10,mult=3):
    tr=[ h[0]-l[0] ]
    for i in range(1,len(c)):
        tr.append(max(h[i]-l[i], abs(h[i]-c[i-1]), abs(l[i]-c[i-1])))
    atrS=rma(tr, len_)
    up=[]; dn=[]; st=[]; dir_=1
    for i in range(len(c)):
        mid=(h[i]+l[i])/2; ub=mid+mult*atrS[i]; lb=mid-mult*atrS[i]
        if i==0:
            up.append(ub); dn.append(lb); st.append(ub); continue
        up.append(max(ub,up[i-1])); dn.append(min(lb,dn[i-1]))
        if c[i]>up[i-1]: dir_=1
        elif c[i]<dn[i-1]: dir_=-1
        st.append(dn[i] if dir_==1 else up[i])
    lastDir=[]
    for i in range(len(c)):
        if i==0: lastDir.append(1); continue
        if c[i]>up[i-1]: lastDir.append(1)
        elif c[i]<dn[i-1]: lastDir.append(-1)
        else: lastDir.append(1 if st[i-1]>=up[i-1] else -1)
    return lastDir[-1]

print("=== REAL BINANCE DATA: RSI/ST bug vs fix ===")
for sym in ["BTCUSDT","ETHUSDT","XAUUSDT"]:
    k=get_klines(sym,"1h",300)
    rb=rsi_buggy(k["c"]); rf=rsi_fixed(k["c"])
    sb=st_buggy(k["h"],k["l"],k["c"]); sf=st_fixed(k["h"],k["l"],k["c"])
    print(f"\n{sym}  close={k['c'][-1]:.2f}")
    print(f"  RSI  buggy={rb[-1]:.1f}   fixed={rf[-1]:.1f}")
    print(f"  ST   buggy={'BULL ▲' if sb==1 else 'BEAR ▼'}   fixed={'BULL ▲' if sf==1 else 'BEAR ▼'}")
