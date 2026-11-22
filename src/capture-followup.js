import {runDueJobs} from './integrations.js';
import {enabled, mailReady, select, whatsappReady, whatsappTemplate} from './providers.js';

const kind='seguimiento_captura';
const slot='ultimo';
const minInterval=15000;
const abandonedAfter=60000;
const maxBatchSize=3;

async function drainQueue(env,programs) {
  const db=env.DB,started=Date.now(),start=new Date(started).toISOString();
  const before=ms=>new Date(started-ms).toISOString();
  const claim=await select(db,`INSERT INTO background_runs(kind,slot,state,started_at) VALUES(?,?,'en_curso',?)
    ON CONFLICT(kind,slot) DO UPDATE SET state='en_curso',started_at=excluded.started_at,finished_at=NULL,result=NULL
    WHERE background_runs.started_at<=? AND (background_runs.state<>'en_curso' OR background_runs.started_at<=?)
    RETURNING started_at`,kind,slot,start,before(minInterval),before(abandonedAfter)).first();
  if(!claim)return;
  let state='error',result=null;
  try {
    const batchSize=Math.max(1,Math.min(maxBatchSize,Number.parseInt(env.OUTREACH_BATCH_SIZE,10)||maxBatchSize));
    const scoped=Object.create(env,{OUTREACH_BATCH_SIZE:{value:batchSize}});
    const {status,accepted,skipped,retry,review}=await runDueJobs(scoped,programs);
    state=status;
    result=JSON.stringify({accepted,skipped,retry,review});
  } finally {
    await select(db,`UPDATE background_runs SET state=?,finished_at=?,result=?
      WHERE kind=? AND slot=? AND state='en_curso' AND started_at=?`,state,new Date().toISOString(),result,kind,slot,start).run();
  }
}
export function followupOnCapture(env,ctx,programs) {
  if(!env.DB || !enabled(env.OUTREACH_ENABLED) || typeof ctx?.waitUntil!=='function')return;
  const email=mailReady(env);
  const whatsapp=enabled(env.OUTREACH_WHATSAPP_ENABLED) && whatsappReady(env) && Boolean(whatsappTemplate(env,'welcome'));
  if(!email && !whatsapp)return;
  return channels=>{
    if(!(email && channels.includes('email')) && !(whatsapp && channels.includes('whatsapp')))return;
    ctx.waitUntil(drainQueue(env,programs).catch(error=>{
      console.error('admisiones: seguimiento de captura pendiente',error?.name || 'Error');
    }));
  };
}
