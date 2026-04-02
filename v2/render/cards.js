// ── render/cards.js ──────────────────────────────────────────────
// Renders signal panel: main signal state, G1 card, F1 card, WX card
// ─────────────────────────────────────────────────────────────────
import * as S from '../core/state.js';
import { f } from '../core/utils.js';

export function renderCards(comp) {
  const scoreCol=v=>v>0.4?'var(--green)':v<-0.4?'var(--red)':'var(--amber)';
  const dc=d=>d>0?'call':d<0?'put':'';
  const setScore=(id,txt,col)=>{const el=document.getElementById(id);if(el){el.textContent=txt;el.style.color=col;}};

  // ── Main signal ───────────────────────────────────────────────
  const locked=Date.now()<S.sigLock;
  const rem=locked?Math.ceil((S.sigLock-Date.now())/1000):0;
  let col,lbl,sub;
  switch(S.sigState){
    case 'STRONG_CALL': col='#00ff7f'; lbl='STRONG CALL'; sub='All aligned'+(locked?' · '+rem+'s':''); break;
    case 'CALL':        col='var(--green)'; lbl='CALL'; sub='G1+F1+WX'+(locked?' · '+rem+'s':''); break;
    case 'STRONG_PUT':  col='#ff2050'; lbl='STRONG PUT'; sub='All aligned'+(locked?' · '+rem+'s':''); break;
    case 'PUT':         col='var(--red)'; lbl='PUT'; sub='G1+F1+WX'+(locked?' · '+rem+'s':''); break;
    default:{
      col='var(--dim2)'; lbl='NEUTRAL';
      const miss=[];
      if(!S.g1Dir) miss.push('G1');
      else if(!S.f1Dir) miss.push('F1');
      const rfActive=S.sigLastFireDir!==0&&(Date.now()-S.sigLastFireTs)<8*60*1000;
      sub=miss.length?'Waiting: '+miss.join(' ')+(rfActive?' · REFIRE GUARD':''):
          S.g1Status!=='—'?'Setup building'+(rfActive?' · REFIRE GUARD':''):
          'Awaiting data';
    }
  }
  const ss=document.getElementById('sig-state');
  ss.textContent=lbl; ss.style.color=col;
  const sc=document.getElementById('sig-comp');
  if(sc){sc.textContent=(comp>=0?'+':'')+comp.toFixed(1);sc.style.color=scoreCol(comp);}
  const sb=document.getElementById('sig-sub');
  sb.textContent=sub; sb.style.color=col==='var(--dim2)'?'var(--dim)':col;

  // ── G1 card ───────────────────────────────────────────────────
  document.getElementById('ld-g1').className='sc-dot'+(S.g1Dir?` ${dc(S.g1Dir)}`:S.g1Coil>0&&S.g1Coil<0.25?' warn':'');
  setScore('sc-g1',S.g1Dir!==0?(S.g1Score>=0?'+':'')+S.g1Score.toFixed(1):'—',S.g1Dir!==0?scoreCol(S.g1Score):'var(--dim2)');
  document.getElementById('lv-g1').textContent=S.g1Status;

  // ── F1 card ───────────────────────────────────────────────────
  document.getElementById('ld-f1').className='sc-dot'+(S.f1Dir&&S.f1Strength>=1?` ${dc(S.f1Dir)}`:S.f1Strength===0.5?' warn':'');
  setScore('sc-f1',S.f1Dir!==0?(S.f1Score>=0?'+':'')+S.f1Score.toFixed(1):'—',S.f1Dir!==0?scoreCol(S.f1Score):'var(--dim2)');
  document.getElementById('lv-f1').textContent=S.f1Status;

  // ── WX card ───────────────────────────────────────────────────
  const wxDotClass=S.wxCompScore>=0.5?' call':S.wxCompScore<=-0.5?' put':S.wxCompScore!==0?' warn':'';
  document.getElementById('ld-wx').className='sc-dot'+wxDotClass;
  const wxCardLbl=S.wxState==='GO! CALL'?'GO! CALL':S.wxState==='GO! PUT'?'GO! PUT':
    S.wxState==='STRONG CALL'?'STR CALL':S.wxState==='STRONG PUT'?'STR PUT':
    S.wxState==='CALL SETUP'?'CALL SETUP':S.wxState==='PUT SETUP'?'PUT SETUP':
    S.wxState==='EXTENDED'?'EXTENDED':S.wxState==='WATCH'?'WATCH':'—';
  const wxCardCol=S.wxCompScore>=0.50?'var(--green)':S.wxCompScore<=-0.50?'var(--red)':
    S.wxState==='EXTENDED'?'var(--dim2)':S.wxState==='WATCH'?'var(--amber)':'var(--dim2)';
  setScore('sc-wx',wxCardLbl,wxCardCol);
  const wxSub=S.wxClusterPrice?'$'+S.wxClusterPrice.toFixed(2)+(S.wxRejectCount?' ×'+S.wxRejectCount:''):
              S.wxRejectCount?'×'+S.wxRejectCount+' rejections':'—';
  document.getElementById('lv-wx').textContent=wxSub;
}
