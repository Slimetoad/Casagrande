import {aiText} from './providers.js';

const model='claude-haiku-5-5';
const safeIntents=new Set(['programa','inversion','cita','requisitos','solicitar_asesor']);
const explanations={
  ficha:'La señal identifica un programa; contrastar su ficha oficial.',
  consulta:'La intención detectada permite preparar orientación para revisión.',
  revision:'La información disponible requiere revisión del equipo.',
  identificar:'Falta identificar un programa antes de concretar la orientación.'
};

/** An optional non-decisional annotation. No transcript, quotes, identity or contact data leaves the service. */
export async function reasonConversation(env,facts) {
  if(!env.ANTHROPIC_API_KEY || env.ANTHROPIC_MODEL!==model || !safeIntents.has(facts?.intent))return null;
  const program=typeof facts.program==='string' && /^[a-z0-9-]{1,120}$/.test(facts.program)?facts.program:null;
  const options=['revision',program?'ficha':'identificar'];
  if(facts.confidence==='alta' && facts.needsReview===false)options.push('consulta');
  const signal={intencion:facts.intent,programa:program,revision:!!facts.needsReview,opciones:options};
  const input=JSON.stringify(signal);
  let timer;
  try {
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Tiempo de razonamiento agotado')),3000)});
    const output=await Promise.race([aiText({LLM_PROVIDER:'anthropic',ANTHROPIC_API_KEY:env.ANTHROPIC_API_KEY,ANTHROPIC_MODEL:model},
      'Elige un único código de opciones para explicar el siguiente paso informativo. Devuelve solo JSON con la clave opcion. No infieras datos ni decisiones.',input,100),timeout]);
    const parsed=JSON.parse(output);
    if(!parsed || Object.keys(parsed).length!==1 || !options.includes(parsed.opcion))return null;
    return {provider:'anthropic',model,reason:explanations[parsed.opcion]};
  } catch {return null;} finally {clearTimeout(timer);}
}
