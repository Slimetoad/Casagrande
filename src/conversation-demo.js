import {extractConversationFacts} from './conversation-intake.js'
import {previewNurturePlan} from './conversation-nurture.js'
import {json} from './observability.js'

export async function demoConversation(request,programs,origin) {
  if(request.method!=='POST')return json({error:'Utiliza el simulador para analizar un ejemplo.'},405)
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return json({error:'Envía un ejemplo en formato JSON.'},415)
  const reader=request.body?.getReader()
  if(!reader)return json({error:'Escribe un correo o un extracto de llamada de ejemplo.'},422)
  const parts=[]
  let bytes=0
  for(;;){
    const {done,value}=await reader.read()
    if(done)break
    bytes+=value.byteLength
    if(bytes>10000){await reader.cancel();return json({error:'El ejemplo es demasiado largo.'},413)}
    parts.push(value)
  }
  let payload
  try{payload=JSON.parse(await new Blob(parts).text())}catch{return json({error:'Revisa el formato del ejemplo.'},400)}
  const message=typeof payload?.text==='string'?payload.text.trim():''
  const channel=payload?.channel
  if(!['email','call'].includes(channel)||!message||message.length>2000)return json({error:'Elige correo o llamada y escribe un ejemplo de hasta 2000 caracteres.'},422)
  const facts=extractConversationFacts({subject:'',text:message},programs)
  const plan=previewNurturePlan(facts,{channel,programs,base:origin,program:facts.program||'',consentEmail:channel==='email',stage:'En orientación'})
  return json({facts,plan,demo:true})
}
