// ── render/log.js ────────────────────────────────────────────────
import * as S from '../core/state.js';
import { ULOG_KEY, ULOG_MAX } from '../core/config.js';
import { etNow, etDateStr } from '../core/utils.js';

export function logUnified() {
  try {
    const et=etNow();
    const hm=et.getHours()+et.getMinutes()/60;
    if(hm<9.5||hm>16) return;
    if(!S.spyPrice) return;
    const p=x=>String(x).padStart(2,'0');
    const row={
      ts:    Date.now(),
      date:  et.getFullYear()+'-'+p(et.getMonth()+1)+'-'+p(et.getDate()),
      time:  p(et.getHours())+':'+p(et.getMinutes()),
      sig:   S.sigState,
      comp:  +S.liveComp.toFixed(2),
      g1:    isNaN(S.g1Score)?0:+S.g1Score.toFixed(2),
      f1:    isNaN(S.f1Score)?0:+S.f1Score.toFixed(2),
      f1Dte: S.f1DteTier,
      wx:    S.wxState||'—',
      wxComp:+S.wxCompScore.toFixed(2),
      rq:    S.rqState,
      rqDir: S.rqDir,
      absorp: S.absorpState||'—',
      micro:  S.microState||'—',
      trap:   S.trapMicroState||'NEUTRAL',
      wxSc:  +S.wxScore.toFixed(1),
      wxCl:  S.wxClusterPrice!==null?+S.wxClusterPrice.toFixed(2):null,
      drift:  S.driftState||'—',
      driftD: +S.driftDelta.toFixed(2),
      hec:   S.hecState||'—',
      hecSl: +S.hecSlope.toFixed(3),
      gia:   S.giaState||'—',
      giaAc: +S.giaAccel.toFixed(3),
      dsc:   S.dscPhase||'—',
      dscSc: +S.dscScore.toFixed(3),
      dscV:  +S.dscVelocity.toFixed(3),
      gx:    S.gxState||'—',
      gxDom: S.gxDominantStrike,
      gxEm:  S.gxEmergingStrike,
      price: +S.spyPrice.toFixed(2),
      vix:   S.vixPrice?+S.vixPrice.toFixed(2):null,
      p2:null, p5:null, p10:null, p15:null
    };
    let log=[];
    try{log=JSON.parse(localStorage.getItem(ULOG_KEY)||'[]');}catch(e2){}
    const cutoff=Date.now()-10*24*60*60*1000;
    log=log.filter(r=>r.ts>cutoff);
    log.push(row);
    if(log.length>ULOG_MAX) log=log.slice(-ULOG_MAX);
    localStorage.setItem(ULOG_KEY,JSON.stringify(log));
  } catch(e){}
}

export function logSignalFire() { try{logUnified();}catch(e){} }
export function logCosmicFire()  { try{logUnified();}catch(e){} }

export function fillForwardPrices() {
  if(!S.spyPrice) return;
  try {
    const raw=localStorage.getItem(ULOG_KEY);
    if(!raw) return;
    const log=JSON.parse(raw);
    const now=Date.now();
    let changed=false;
    const targets=[{k:'p2',ms:120000},{k:'p5',ms:300000},{k:'p10',ms:600000},{k:'p15',ms:900000}];
    for(let i=log.length-1;i>=0;i--){
      const row=log[i];
      const age=now-row.ts;
      if(age>960000) break;
      let rowChanged=false;
      targets.forEach(t=>{
        if(row[t.k]===null&&age>=t.ms){ row[t.k]=+(S.spyPrice-row.price).toFixed(2); rowChanged=true; }
      });
      if(rowChanged) changed=true;
    }
    if(changed) localStorage.setItem(ULOG_KEY,JSON.stringify(log));
  } catch(e){}
}

export function renderUnifiedLog() {
  try {
    const log=JSON.parse(localStorage.getItem(ULOG_KEY)||'[]');
    const today=etDateStr();
    const rows=log.filter(r=>r.date===today).reverse().slice(0,10);
    const strong=rows.filter(r=>r.sig==='STRONG_CALL'||r.sig==='STRONG_PUT').length;
    document.getElementById('log-meta').textContent=rows.length+' rows today · '+strong+' strong';
    const tbody=document.getElementById('log-body');
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="19" style="text-align:center;color:var(--dim);padding:12px">No data yet — log captures every minute during market hours</td></tr>';
      return;
    }
    const fv=(v,d=2)=>v!==null&&v!==undefined?v.toFixed(d):'';
    tbody.innerHTML=rows.map(row=>{
      const sc=row.sig==='STRONG_CALL'?'var(--green)':row.sig==='STRONG_PUT'?'var(--red)':row.sig==='CALL'?'#3a8':row.sig==='PUT'?'#b44':'var(--dim2)';
      const sl=row.sig==='STRONG_CALL'?'★CALL':row.sig==='STRONG_PUT'?'★PUT':row.sig.replace('_',' ');
      const dir=row.sig==='STRONG_CALL'||row.sig==='CALL'?1:row.sig==='STRONG_PUT'||row.sig==='PUT'?-1:0;
      const fc=v=>{
        if(v===null||v===undefined) return '<td style="color:var(--dim)">—</td>';
        const good=dir!==0&&((dir>0&&v>0.05)||(dir<0&&v<-0.05));
        const bad =dir!==0&&((dir>0&&v<-0.05)||(dir<0&&v>0.05));
        const col=good?'var(--green)':bad?'var(--red)':'var(--dim2)';
        const wt=good||bad?'600':'400';
        return `<td style="color:${col};font-weight:${wt}">${v>=0?'+':''}${v.toFixed(2)}</td>`;
      };
      const ac=row.absorp==='CONFIRMING'?'var(--green)':row.absorp==='ABSORBING'?'var(--red)':row.absorp==='CONVERGING'?'var(--amber)':'var(--dim)';
      const tc=row.trap==='DANGER'?'var(--red)':row.trap==='WARNING'?'var(--amber)':row.trap==='CLEAR'?'var(--green)':'var(--dim)';
      const wxc=row.wx.includes('GO!')?'var(--amber)':row.wx.includes('STRONG')?'#c85':row.wx.includes('SETUP')?'var(--dim2)':'var(--dim)';
      const gxc=row.gx==='TRANSFERRING'||row.gx==='BREAK'?'#ff9500':row.gx==='MAGNET'?'var(--amber)':'var(--dim2)';
      const dtec=row.f1Dte===2?'var(--amber)':row.f1Dte===1?'var(--dim2)':'var(--dim)';
      const dteLabel=row.f1Dte===2?'2D':row.f1Dte===1?'1D':'0D';
      const driftc=row.drift&&row.drift.includes('CALL')?'var(--green)':row.drift&&row.drift.includes('PUT')?'var(--red)':row.drift==='EXHAUSTED'?'var(--amber)':'var(--dim)';
      const driftLbl=row.drift&&row.drift!=='—'?row.drift.replace('STRONG ','S.').replace('SUPER ','SU.').replace(' COIL','⊛').replace(' RELEASE','▶'):'—';
      const hecc=row.hec&&row.hec.includes('COLLAPSE')?(row.hec.includes('CALL')?'#00ff7f':'#ff2050'):row.hec&&row.hec.includes('WEAK')?'var(--amber)':'var(--dim)';
      const hecLblR=row.hec&&row.hec!=='—'&&row.hec!=='STABLE'?row.hec.replace(' COLLAPSE','⬇').replace(' WEAK','~'):(row.hec==='STABLE'?'OK':'—');
      const giac=row.gia&&row.gia.includes('STRONG')?(row.gia.includes('CALL')?'var(--green)':'var(--red)'):row.gia&&row.gia.includes('CALL')?'#3a8':row.gia&&row.gia.includes('PUT')?'#b44':'var(--dim)';
      const giaLblR=row.gia&&row.gia!=='—'&&row.gia!=='BALANCED'?row.gia.replace('STRONG CALL ACCEL','SC↑').replace('CALL ACCEL','C↑').replace('STRONG PUT ACCEL','SP↓').replace('PUT ACCEL','P↓'):(row.gia==='BALANCED'?'BAL':'—');
      const dscc=row.dsc==='FAILURE'?'var(--red)':row.dsc==='EXPANSION'?'var(--amber)':row.dsc==='STRAIN'?'var(--amber)':row.dsc==='BUILD'?'var(--dim2)':'var(--dim)';
      const dscLblR=row.dsc&&row.dsc!=='—'?row.dsc.slice(0,4)+(row.dscSc>0?' '+row.dscSc.toFixed(2):''):'—';
      return `<tr>
        <td>${row.time}</td>
        <td style="color:${sc};font-weight:600">${sl}</td>
        <td style="color:${row.comp<-0.3?'var(--red)':row.comp>0.3?'var(--green)':'var(--dim2)'}">${fv(row.comp)}</td>
        <td style="color:${row.g1<-0.5?'var(--red)':row.g1>0.5?'var(--green)':'var(--dim2)'}">${fv(row.g1)}</td>
        <td style="color:${row.f1<-0.5?'var(--red)':row.f1>0.5?'var(--green)':'var(--dim2)'}">${fv(row.f1)}</td>
        <td style="color:${dtec};font-size:8px">${dteLabel}</td>
        <td style="color:${wxc};font-size:8px">${(row.wx||'—').replace(' CALL','↑').replace(' PUT','↓').replace('GO!','GO')}${row.wxSc>0?' '+row.wxSc:''}</td>
        <td style="color:${driftc};font-size:8px">${driftLbl}${row.driftD&&row.driftD!==0?' '+row.driftD:''}</td>
        <td style="color:${hecc};font-size:8px">${hecLblR}</td>
        <td style="color:${giac};font-size:8px">${giaLblR}</td>
        <td style="color:${dscc};font-size:8px">${dscLblR}</td>
        <td style="color:${ac};font-size:8px">${row.absorp}</td>
        <td style="color:${gxc};font-size:8px">${row.gx}</td>
        <td>${fv(row.price)}</td>
        <td style="color:var(--dim2)">${fv(row.vix)}</td>
        ${fc(row.p2)}${fc(row.p5)}${fc(row.p10)}${fc(row.p15)}
      </tr>`;
    }).join('');
  } catch(e){}
}

export function copyUnifiedLog() {
  try {
    const log=JSON.parse(localStorage.getItem(ULOG_KEY)||'[]');
    const today=etDateStr();
    const rows=log.filter(r=>r.date===today).reverse();
    if(!rows.length){alert('No log data for today.');return;}
    const hdr=['DATE','TIME','SIG','COMP','G1','F1','F1_DTE','WX','WX_COMP',
               'DRIFT','DRIFT_Δ','HEC','HEC_SL','GIA','GIA_AC',
               'DSC','DSC_SC','DSC_V',
               'RQ','RQ_DIR','ABSORP',
               'WX_SCORE','WX_CLUSTER',
               'GX','GX_DOM','GX_EM','PRICE','VIX',
               '+2m','+5m','+10m','+15m'].join('\t');
    const body=rows.map(r=>{
      const fwd=v=>v!==null&&v!==undefined?(v>=0?'+':'')+v.toFixed(2):'';
      const d=v=>v!==null&&v!==undefined?v:'';
      return [r.date,r.time,r.sig,d(r.comp),d(r.g1),d(r.f1),d(r.f1Dte),
              r.wx||'—',d(r.wxComp),r.drift||'—',d(r.driftD),
              r.hec||'—',d(r.hecSl),r.gia||'—',d(r.giaAc),
              r.dsc||'—',d(r.dscSc),d(r.dscV),
              r.rq,r.rqDir,r.absorp,d(r.wxSc),d(r.wxCl),
              r.gx,d(r.gxDom),d(r.gxEm),d(r.price),d(r.vix),
              fwd(r.p2),fwd(r.p5),fwd(r.p10),fwd(r.p15)].join('\t');
    }).join('\n');
    const txt=`SPY SNIPER UNIFIED LOG\u2014${today}\nRows: ${rows.length}\n\n${hdr}\n${body}`;
    navigator.clipboard.writeText(txt).then(()=>{
      const btn=document.querySelector('#log-hdr .log-btn');
      const orig=btn.textContent; btn.textContent='COPIED!';
      btn.style.color='var(--green)';
      setTimeout(()=>{btn.textContent=orig;btn.style.color='';},2000);
    }).catch(()=>{
      const ta=document.createElement('textarea');
      ta.value=txt;
      ta.style.cssText='position:fixed;top:0;left:0;width:100%;height:200px;z-index:9999;background:#0d1117;color:#a8bcc4;font-size:10px;border:1px solid #f5a623;padding:8px;';
      document.body.appendChild(ta);ta.select();
      alert('Clipboard blocked. Copy manually (Cmd+C).');
      setTimeout(()=>ta.remove(),10000);
    });
  } catch(e){}
}

export function clearUnifiedLog() {
  if(!confirm('Clear the unified log? This cannot be undone.')) return;
  localStorage.removeItem(ULOG_KEY);
  renderUnifiedLog();
}
