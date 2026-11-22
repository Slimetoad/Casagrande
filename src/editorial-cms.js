import {institutionalUrl} from './editorial-draft.js';

const stmt = (db,sql,...values) => values.length ? db.prepare(sql).bind(...values) : db.prepare(sql);
const record = /^[a-zA-Z0-9._:-]{1,180}$/;
const maxAttempts = 4;
const minute = 60000;

export function cmsConfig(env) {
  const rawEndpoint=env.SEO_INSTITUTIONAL_CMS_URL;
  const endpoint=institutionalUrl(rawEndpoint);
  const token=typeof env.SEO_INSTITUTIONAL_CMS_TOKEN==='string' ? env.SEO_INSTITUTIONAL_CMS_TOKEN.trim() : '';
  if (!rawEndpoint && !token) return {status:'unconfigured'};
  if (!endpoint || new URL(endpoint).hash || !/^[\w.~+/=-]{8,600}$/.test(token)) return {status:'invalid'};
  return {status:'configured',endpoint,token};
}

async function readReceipt(response) {
  const reader=response.body?.getReader();
  if (!reader || Number(response.headers.get('content-length'))>16384) return null;
  let size=0;
  const chunks=[];
  for (;;) {
    const result=await reader.read();
    if (result.done) break;
    size+=result.value.byteLength;
    if (size>16384) { await reader.cancel(); return null; }
    chunks.push(result.value);
  }
  try { return JSON.parse(await new Blob(chunks).text()); } catch { return null; }
}

async function sendCms(config,job) {
  try {
    const response=await fetch(config.endpoint,{
      method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),
      headers:{authorization:'Bearer '+config.token,'content-type':'application/json',accept:'application/json','idempotency-key':job.id},
      body:job.payload
    });
    if (!response.ok) {
      if (response.status===429 || response.headers.get('idempotency-status')==='not-applied') {
        return {status:'retry',message:'El CMS indicó que la publicación no se procesó. Se puede reintentar.'};
      }
      if (response.status===408 || response.status>=500) return {status:'uncertain',message:'El CMS no confirmó si aplicó esta versión. Se requiere conciliación.'};
      return {status:'failed',message:'El CMS rechazó la solicitud ('+response.status+').'};
    }
    const data=await readReceipt(response);
    const url=institutionalUrl(data?.url);
    if (data?.status!=='published' || data.idempotencyKey!==job.id || data.version!==job.version ||
      typeof data.receiptId!=='string' || !record.test(data.receiptId) || !url ||
      [...new URL(url).searchParams.keys()].some(key=>/token|secret|password|auth|signature|key/i.test(key))) {
      return {status:'uncertain',message:'El CMS no devolvió un recibo institucional verificable para esta versión.'};
    }
    return {status:'published',receipt:data.receiptId,url};
  } catch {
    return {status:'uncertain',message:'La conexión se interrumpió y no se pudo comprobar si se aplicó esta versión.'};
  }
}

export async function mirrorEditorial(env,current) {
  const config=cmsConfig(env);
  if (config.status!=='configured') return {status:config.status,confirmed:0};
  const db=env.DB;
  const date=current.toISOString(), lease=crypto.randomUUID();
  const expired=new Date(current.valueOf()-25*minute).toISOString();
  await stmt(db,`UPDATE seo_editorial_cms SET status='uncertain',
    last_error='La confirmación del CMS venció.',lease_token=NULL,updated_at=?
    WHERE status='processing' AND updated_at<?`,date,expired).run();
  const job=await stmt(db,`UPDATE seo_editorial_cms SET status='processing',attempts=attempts+1,lease_token=?,updated_at=?
    WHERE id=(SELECT j.id FROM seo_editorial_cms j JOIN seo_editorial_plan p ON p.id=j.plan_id
      JOIN seo_editorial_settings s ON s.id=1
      WHERE s.paused=0 AND p.status='published' AND j.version=p.published_revision
      AND j.status IN ('pending','retry') AND j.attempts<? AND j.due_at<=?
      AND NOT EXISTS(SELECT 1 FROM seo_editorial_cms other WHERE other.plan_id=j.plan_id AND other.status='processing')
      ORDER BY j.due_at,j.id LIMIT 1)
    RETURNING id,plan_id,version,payload,attempts`,lease,date,maxAttempts,date).first();
  if (!job) return {status:'configured',confirmed:0};
  const stillCurrent=await stmt(db,`SELECT 1 current FROM seo_editorial_cms j JOIN seo_editorial_plan p ON p.id=j.plan_id
    JOIN seo_editorial_settings s ON s.id=1 WHERE j.id=? AND j.lease_token=?
    AND p.published_revision=j.version AND p.status='published' AND s.paused=0`,job.id,lease).first();
  if (!stillCurrent) {
    await stmt(db,"UPDATE seo_editorial_cms SET status='pending',attempts=MAX(0,attempts-1),lease_token=NULL WHERE id=? AND lease_token=?",job.id,lease).run();
    return {status:'configured',confirmed:0};
  }
  const result=await sendCms(config,job);
  const status=result.status==='retry' && job.attempts>=maxAttempts?'uncertain':result.status;
  const due=new Date(current.valueOf()+Math.min(24*60,20*2**job.attempts)*minute).toISOString();
  const [update]=await db.batch([
    stmt(db,`UPDATE seo_editorial_cms SET status=?,receipt_id=?,official_url=?,last_error=?,lease_token=NULL,due_at=?,updated_at=?
      WHERE id=? AND lease_token=?`,status,result.receipt || null,result.url || null,result.message || null,due,date,job.id,lease),
    stmt(db,`INSERT INTO seo_editorial_history(id,plan_id,action,actor,detail,occurred_at)
      SELECT ?,plan_id,?,'CMS institucional',?,? FROM seo_editorial_cms WHERE id=? AND changes()=1`,
    crypto.randomUUID(),'cms_'+status,result.message || 'El CMS confirmó la versión '+job.version+'.',date,job.id)
  ]);
  return {status,confirmed:status==='published' && update.meta.changes===1?1:0};
}
