const STOP = /^(?:(?:por favor|gracias)[, ]+)?(?:stop|baja|cancelar|unsubscribe|salir)[.!\s]*$/;
const INTENTS = [
  ['baja', /\b(?:quiero (?:darme|que me den) de baja|denme de baja|retir[eo] mi (?:consentimiento|autorizacion)|(?:no|ya no) (?:quiero|deseo) (?:recibir|que me envien) (?:mas )?(?:correos|emails|mensajes|llamadas|comunicaciones|whatsapps?)|(?:no|ya no) (?:(?:quiero|deseo) que )?me (?:llamen|escriban|contacten)|no me (?:envien|manden) (?:mas )?(?:correos|emails|mensajes|comunicaciones)|dejen de (?:escribirme|llamarme|contactarme))\b/],
  ['postergar', /\b(?:prefiero esperar|quiero (?:postergar|posponer)|pospongamos|(?:lo |me )?retomo mas adelante|(?:mi decision|la postulacion) (?:puede esperar|sera mas adelante)|por ahora no (?:puedo|quiero) (?:estudiar|postular|matricularme))\b/],
  ['cita', /\b(?:(?:agendar|reservar|coordinar|programar|reprogramar|concertar) (?:una?|la|mi|otra?) (?:cita|asesoria|reunion|llamada)|(?:quiero|quisiera|necesito|solicito|deseo) (?:una|la|mi) (?:cita|asesoria|reunion)|(?:hay|tienen|que) (?:disponibilidad|horarios?) (?:para una|de) (?:cita|asesoria))\b/],
  ['solicitar_asesor', /\b(?:(?:quiero|quisiera|necesito|puedo|podria) (?:hablar|conversar) con (?:un[ao]?|el|la|mi) (?:asesor[a]?|persona)|(?:me pueden|podrian|podria|que me) (?:llamar|contactar)|(?:por favor |solicito )?(?:llamenme|llameme))\b/],
  ['inversion', /\b(?:cuanto (?:cuesta|vale|sale|es la inversion|debo pagar)|(?:costo|precio|valor|inversion|financiamiento|becas?|cuotas?|mensualidad|arancel|formas? de pago)|(?:puedo|quisiera) pagar)\b/],
  ['requisitos', /\b(?:requisitos?|documentos?|documentacion|(?:como|donde) (?:postulo|postularme|aplico|inscribirme|matricularme)|certificado|titulo de tercer nivel|(?:necesito|quisiera) postularme)\b/],
  ['programa', /\b(?:malla(?: curricular)?|plan de estudios|modalidad|compare? (?:los )?programas|(?:elegi(?:r)?|interes(?:a|ado|ada)?|informacion|asesoria|detalles) .{0,55}(?:maestria|posgrado|programa|especializacion)|duracion|asignaturas?|maestrias? (?:disponibles|abiertas))\b/]
];

const OBSTACLES = [
  ['Presupuesto o financiamiento', /\b(?:no (?:puedo|podria) (?:pagar|cubrir)|no (?:me )?alcanza|fuera de (?:mi|nuestro) presupuesto|presupuesto (?:limitado|ajustado)|necesito (?:una? )?(?:beca|financiamiento)|(?:me preocupa|dificulta) (?:el |la |mi )?(?:costo|inversion|pago|precio|presupuesto)|tendria que pagar en cuotas)\b/],
  ['Compatibilidad de horarios', /\b(?:no puedo (?:en ese horario|los fines de semana)|por (?:mi |el )?trabajo no|trabajo (?:en turnos|de noche|los sabados)|(?:mi|el) horario (?:no (?:me )?lo permite|laboral)|solo puedo (?:por las?|en las?|los|las|despues)|dificil combinar (?:con |mi )?trabajo|(?:tengo dudas por|me preocupa) (?:el|mi) horario)\b/],
  ['Documentación pendiente', /\b(?:no tengo (?:el|mi|los) (?:titulo|certificado|documentos)|(?:me falta|me faltan|pendiente) (?:el |la |los |las )?(?:documentos|documentacion|titulo|certificado)|titulo en tramite)\b/],
  ['Decisión pendiente', /\b(?:necesito (?:pensarlo|comparar|consultarlo|hablarlo)|aun no (?:he decidido|estoy seguro|se cual)|todavia no (?:he decidido|se cual)|depende de (?:una|la|mi) aprobacion)\b/]
];
const TIME = /\b(?:hoy|pasado manana|manana|esta semana|la proxima semana|este mes|el proximo mes|(?:el |este |proximo )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: (?:por las? |en las? )?(?:mananas?|tardes?|noches?))?|(?:en |dentro de )(?:\d{1,2}|una?|dos|tres|cuatro) (?:dias?|semanas?|meses?)|(?:antes de |para |en )(?:el |de )?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: (?:de )?20\d{2})?|(?:por las? |en las? )(?:mananas?|tardes?|noches?)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/;
const SPEAKER = /^\s*(?:\[\s*)?(user|usuario|caller|customer|cliente|aspirante|persona|interlocutor|student|assistant|agent|agente|asesor[a]?|system|sistema|bot)\s*(?:\])?\s*[:：-]\s*/i;
const APPLICANT = /^(?:user|usuario|caller|customer|cliente|aspirante|persona|interlocutor|student)$/i;
const CREDENTIAL = /\b(?:pass(?:word|code)|contrase[nñ]a|credencial|bearer|api[-_ ]?key|p[ií]n|c[oó]digo (?:de acceso|de verificaci[oó]n)|iban|cvv|c[eé]dula\s*(?:n[uú]mero|:)|tarjeta\s*(?:n[uú]mero|:)|historia cl[ií]nica|diagn[oó]stico m[eé]dico)\b/i;
const THIRD_PARTY = /\b(?:mi|su|nuestro|nuestra) (?:hij[oa]|espos[oa]|pareja|herman[oa]|amig[oa]|familiar|compa[nñ]er[oa]|padre|madre)\b.{0,55}(?:se llama|llamad[oa]|su nombre es|vive en|correo|tel[eé]fono|c[eé]dula)/i;

const normalize = (value) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'');
const words = (value) => normalize(value).replace(/[^a-z0-9]+/g,' ').trim();
const noAsk = /\b(?:no (?:necesito|quiero|deseo|me interesa)|ya (?:tengo|conozco)|solo (?:para|me)|no (?:pregunte|consulte) por)\b/;

export function redactConversationLine(value,max=400) {
  if (typeof value!=='string' || CREDENTIAL.test(value.slice(0,600)) || THIRD_PARTY.test(value.slice(0,600))) return '';
  return value.slice(0,1000).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,' ')
    .replace(/<[^>]{0,300}>/g,' ')
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi,'[enlace omitido]')
    .replace(/[\p{L}\p{N}.+_'%-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,'[correo omitido]')
    .replace(/(?<!\w)\+?\d(?:[ \t().-]*\d){7,18}(?!\d)/g,'[número omitido]')
    .replace(/\s+/g,' ').trim().slice(0,max);
}

function applicantSegments(text,direction) {
  if (typeof text!=='string') return [];
  const original = text.slice(0,24000).replace(/<(script|style|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').split(/\r?\n/).slice(0,200);
  const lines = [];
  let include = direction!=='outbound';
  const tagged = original.some(line=>SPEAKER.test(line));
  if (tagged) include = false;
  for (const line of original) {
    if (/^\s*(?:>|(?:-{2,}\s*)?(?:mensaje (?:original|reenviado)|begin forwarded message|original message|forwarded message)|on .{1,400} wrote:|el .{1,400} escribi[oó]:|sent from my|enviado desde mi|--\s*$)/i.test(line)) break;
    const turn = line.match(SPEAKER);
    if (turn) include = APPLICANT.test(turn[1]);
    if (include) lines.push(turn ? line.slice(turn[0].length) : line);
  }
  return lines.flatMap(line=>line.split(/(?<=[.!?;])\s+(?=[¿¡\p{L}])/u))
    .map(line=>redactConversationLine(line,300)).filter(Boolean).slice(0,40);
}

function programAliases(program) {
  const labels = [program.title?.split(':')[0],program.shortTitle,program.degree].filter(Boolean);
  if (program.slug==='maestria-en-administracion-de-empresas') labels.push('mba','administración de empresas');
  if (program.slug==='maestria-en-ia-y-ciencia-de-datos') labels.push('inteligencia artificial','ciencia de datos','analítica de datos','ia');
  return [...new Set(labels.map(label=>words(label).replace(/^(?:maestria|magister) en /,'')))].filter(label=>label.length>=5 || ['mba','ia'].includes(label));
}

function contactChannel(text) {
  const choices = [['email',/\b(?:correos?(?: electronicos?)?|e-?mails?|mail)\b/],['voice',/\b(?:llam(?:ada|adas|ar|en|arme)|telefonos?|telefonicas?|telefonicos?)\b/],['whatsapp',/\bwhatsapps?\b/]];
  const found = choices.filter(([,rule])=>rule.test(text));
  return found.length===1?found[0][0]:null;
}
const quote = (line) => line?.slice(0,145) || '';

export function extractConversationFacts({subject='',text='',direction='inbound'}={},programs=[]) {
  const applicant = applicantSegments(text,direction);
  const safeSubject = direction==='outbound'?'':redactConversationLine(subject,200);
  const lines = [...applicant,...(safeSubject?[safeSubject]:[])];
  const programMatches = programs.flatMap(program=>{
    const names=programAliases(program);
    const line=lines.find(line=>!noAsk.test(normalize(line)) && names.some(name=>(' '+words(line)+' ').includes(' '+name+' ')));
    return line?[{program,line}]:[];
  });
  const foundProgram = programMatches.length===1 ? programMatches[0] : null;
  const strong = /[¿?]|\b(?:quiero|quisiera|necesito|deseo|interes(?:a|ado|ada)|solicito|puedo|cuanto|como|cuando|por favor|me gustaria)\b/;
  const intents = INTENTS.flatMap(([key,rule])=>{
    const line=applicant.find(line=>{
      const test=normalize(line);
      if (key==='baja') return STOP.test(test) || rule.test(test) && !/^\s*[¿?]|\b(?:como (?:puedo|hago)|si quisiera|que pasa si)\b/.test(test);
      return rule.test(test) && (key==='postergar' || !noAsk.test(test));
    });
    if (line) return [{key,line,strong:key==='baja'||key==='postergar'||key==='cita'||key==='solicitar_asesor'||strong.test(normalize(line))}];
    if (safeSubject && !['baja','postergar'].includes(key) && !noAsk.test(normalize(safeSubject)) && rule.test(normalize(safeSubject))) return [{key,line:safeSubject,strong:false}];
    return [];
  });
  const active = intents.find(i=>i.key==='baja'||i.key==='postergar') || intents.find(i=>i.strong) || intents[0]
    || (foundProgram ? {key:'programa',line:foundProgram.line,strong:strong.test(normalize(foundProgram.line))&&!noAsk.test(normalize(foundProgram.line))} : null);
  const obstacle = OBSTACLES.flatMap(([label,rule])=>{
    const line=applicant.find(line=>rule.test(normalize(line)));
    return line?[{label,line}]:[];
  })[0];
  const timing = applicant.map(line=>({line,match:normalize(line).match(TIME)})).find(entry=>entry.match);
  const preference = applicant.map(line=>{
    const clear=normalize(line).match(/\b(?:prefiero|mejor|solo|unicamente|podemos hablar|por favor (?:escrib[ae]nme|contactenme)) (?:por |mediante |via |una? )?(.{3,60})/);
    return {line,channel:clear ? contactChannel(clear[1]) : null};
  }).find(entry=>entry.channel && !/\b(?:no prefiero|no puedo|sin acceso)\b/.test(normalize(entry.line)));
  let optOutChannel=null;
  if (active?.key==='baja') {
    const normalized=normalize(active.line);
    optOutChannel=contactChannel(normalized) || (/\b(?:ningun canal|por ningun medio|no me contacten|no quiero que me contacten|toda(?:s las)? comunicaciones)\b/.test(normalized)?'all':null);
  }
  const evidence = [
    ['program',foundProgram?.line],
    ['intent',active?.line],
    ['obstacle',obstacle?.line],
    ['timeframe',timing?.line],
    ['contactPreference',preference?.line]
  ].filter(([,line])=>line).map(([field,line])=>({field,quote:quote(line)}));
  const competing = intents.filter(intent=>intent.strong && !['baja','postergar','programa'].includes(intent.key)).length>1;
  const confidence = active?.strong && programMatches.length<2 && (!competing || ['baja','postergar'].includes(active.key)) ? 'alta' : active ? 'media' : 'baja';
  return {
    program:foundProgram?.program.slug || null,programTitle:foundProgram?.program.title || null,
    intent:active?.key || 'desconocido',obstacle:obstacle?.label || null,
    timeframe:timing ? timing.line.slice(timing.match.index,timing.match.index+timing.match[0].length) : null,
    contactPreference:preference?.channel || null,optOutChannel,evidence,confidence,
    needsReview:confidence!=='alta',
    excerpt:[...new Set(evidence.map(e=>e.quote))].join(' … ').slice(0,600)
  };
}
