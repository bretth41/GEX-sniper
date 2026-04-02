// ── fetch/alerts.js ──────────────────────────────────────────────
import * as S from '../core/state.js';
import { cfg, ALERT_CD } from '../core/config.js';
import { f } from '../core/utils.js';

export async function pushAlert(msg, title) {
  if(!cfg.pushoverToken||!cfg.pushoverUser) return;
  if(Date.now()-S.lastAlertTs<ALERT_CD) return;
  S.lastAlertTs=Date.now();
  try {
    await fetch('https://api.pushover.net/1/messages.json',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:cfg.pushoverToken,user:cfg.pushoverUser,title,message:msg}),
    });
  } catch(e){}
}

export async function pushCosmicAlert(dir, target, score) {
  if(!cfg.pushoverToken||!cfg.pushoverUser) return;
  try {
    await fetch('https://api.pushover.net/1/messages.json',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        token:cfg.pushoverToken, user:cfg.pushoverUser,
        title:'☄️ COSMIC '+dir+' ☄️',
        message:'SPY: '+f(S.spyPrice)+' '+target+'\n'+score+'\n'+S.g1Status+'\n'+S.f1Status,
        priority:1, sound:'cosmic'
      }),
    });
  } catch(e){}
}
