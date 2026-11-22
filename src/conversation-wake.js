import {runNurtureJobs} from './conversation-nurture.js'
import {enabled,mailReady} from './providers.js'

// The caller schedules this callback only after committing the authenticated signal.
export function withConversationWake(env,ctx,programs) {
  if(!enabled(env.OUTREACH_ENABLED)||!mailReady(env)||!ctx?.waitUntil)return env
  let scheduled=false
  return Object.create(env,{onConversationRecorded:{value(){
    if(scheduled)return
    scheduled=true
    const batchSize=Math.min(3,Math.max(1,parseInt(env.OUTREACH_BATCH_SIZE,10)||3))
    const bounded=Object.create(env,{OUTREACH_BATCH_SIZE:{value:batchSize}})
    ctx.waitUntil(runNurtureJobs(bounded,programs).catch(()=>console.error('No se pudo completar el seguimiento inmediato de la conversación.')))
  }}})
}
