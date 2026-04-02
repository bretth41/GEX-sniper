// ── core/utils.js ────────────────────────────────────────────────
// Pure utility functions. No state. No DOM. No imports.
// Safe to run in browser OR Cloudflare Worker.
// ─────────────────────────────────────────────────────────────────

export const f     = (n,d=2) => (n==null||isNaN(n)) ? '---' : Number(n).toFixed(d);
export const clamp = (n,lo,hi) => Math.max(lo, Math.min(hi, n));

export function etNow() {
  const n=new Date(), jan=new Date(n.getFullYear(),0,1).getTimezoneOffset(),
        jul=new Date(n.getFullYear(),6,1).getTimezoneOffset(),
        off=Math.min(jan,jul)!==jan?-4:-5;
  return new Date(n.getTime()+off*3600000+n.getTimezoneOffset()*60000);
}

export function etDateStr() {
  const e=etNow(), p=x=>String(x).padStart(2,'0');
  return `${e.getFullYear()}-${p(e.getMonth()+1)}-${p(e.getDate())}`;
}

export function etHour() {
  const e=etNow(); return e.getHours()+e.getMinutes()/60;
}

export function isReg(unix) {
  const d=new Date(unix*1000), jan=new Date(d.getFullYear(),0,1).getTimezoneOffset(),
        jul=new Date(d.getFullYear(),6,1).getTimezoneOffset(),
        off=Math.min(jan,jul)!==jan?-4:-5,
        e=new Date(d.getTime()+off*3600000+d.getTimezoneOffset()*60000),
        hm=e.getHours()*60+e.getMinutes();
  return hm>=570&&hm<960;
}

export function aggBars(b,m) {
  if(m<=1) return b;
  const out=[];
  for(let i=0;i<b.length;i+=m){
    const sl=b.slice(i,i+m); if(!sl.length) continue;
    out.push({t:sl[0].t,o:sl[0].o,h:Math.max(...sl.map(x=>x.h)),
      l:Math.min(...sl.map(x=>x.l)),c:sl[sl.length-1].c,
      v:sl.reduce((s,x)=>s+x.v,0)});
  }
  return out;
}

export function calcEMA(bs,p) {
  if(!bs||bs.length<p) return [];
  const k=2/(p+1); let e=0; const out=[];
  for(let i=0;i<p;i++) e+=bs[i].c; e/=p;
  out.push({time:bs[p-1].t,value:e});
  for(let i=p;i<bs.length;i++){e=bs[i].c*k+e*(1-k);out.push({time:bs[i].t,value:e});}
  return out;
}

export function calcVWAP(bs) {
  const reg=bs.filter(b=>isReg(b.t)); if(!reg.length) return [];
  let cpv=0,cv=0;
  return reg.map(b=>{const tp=(b.h+b.l+b.c)/3;cpv+=tp*b.v;cv+=b.v;
    return{time:b.t,value:cv>0?cpv/cv:b.c};});
}

// DOM helpers — only called from render modules
export function setDot(id,ok) {
  const el=document.getElementById(id); if(el) el.className='sdot '+(ok?'sg':'sr');
}
export function setStale(v) {
  const el=document.getElementById('stale-tag');
  if(el) el.style.display=v?'block':'none';
}
