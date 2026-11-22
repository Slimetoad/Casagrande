import {brand} from './catalog.js';
import {editorialSeeds} from './editorial-seeds.js';

const labels = {programa:'Elegir el programa',requisitos:'Preparar requisitos',inversion:'Planificar la inversión',comparacion:'Comparar alternativas',aplicacion:'Aplicar lo aprendido'};
export const planIntents = new Set(Object.keys(labels));

export function institutionalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol==='https:' && !url.username && !url.password && !url.port &&
      (url.hostname==='casagrande.edu.ec' || url.hostname.endsWith('.casagrande.edu.ec')) &&
      /^[a-z0-9.-]+$/.test(url.hostname)) return url.href;
  } catch { /* The catalog may omit a link. */ }
  return '';
}
const text = (value,max) => typeof value==='string' ? value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max) : '';

export function editorialProposal(program,search=null) {
  const slug = program.slug;
  const seed = editorialSeeds[slug] || {
    title:'Cómo evaluar '+program.title,
    cluster:program.area || 'Orientación académica',
    intent:'programa',
    searchQuestion:program.title,
    angle:'Una guía práctica para contrastar el contenido y las condiciones de estudio con tu objetivo profesional.',
    points:[]
  };
  const aiDemand = slug==='maestria-en-ia-y-ciencia-de-datos' && search?.source?.startsWith('OpenSEO')
    && /maestr[ií]a en inteligencia artificial/i.test(search.keyword || '') && search.volume>0;
  return {
    id:'guia-'+slug,program:slug,
    title:text(aiDemand?'Cómo elegir una maestría en inteligencia artificial en Ecuador':seed.title,180),
    cluster:text(seed.cluster,120),intent:aiDemand?'programa':planIntents.has(seed.intent)?seed.intent:'programa',
    searchQuestion:text(aiDemand?search.keyword:seed.searchQuestion,240),
    angle:text(aiDemand?'Si comparas maestrías de inteligencia artificial en Ecuador, revisa qué problemas aprenderás a formular, qué fundamentos de datos ofrece cada plan y cómo podrías evaluar un proyecto aplicado.':seed.angle,460),
    points:seed.points || [],
    sourceUrl:institutionalUrl(program.url),
    sourceVerifiedAt:program.sourceVerifiedAt || brand.verifiedAt || null
  };
}

function topicAdvice(intent) {
  switch (intent) {
    case 'requisitos':
      return 'Prepara una lista con la documentación que ya tienes, la que depende de otra institución y el tiempo que podría tomar conseguirla. Comparte con Admisiones las dudas sobre equivalencias, formatos y convocatoria vigente. Consulta el canal institucional por el que debes enviar cada documento antes de compartir datos personales.';
    case 'inversion':
      return 'Separa el valor de la maestría de otros gastos como conectividad, traslados y tiempo de trabajo. Si solicitas una cotización, confirma la entrada, los plazos y cualquier cargo con Admisiones. Puedes comparar escenarios en el simulador del portal usando tus propios valores.';
    case 'comparacion':
      return 'Usa una tabla con las mismas preguntas para cada alternativa. Incluye el tema que quieres resolver, una asignatura relevante y una condición logística que podría afectar tu decisión. Si una respuesta no aparece en la ficha, anótala como una pregunta para la orientación.';
    case 'aplicacion':
      return 'Lleva a la conversación con Admisiones un reto real de tu trabajo. Describe a quién afecta, qué información tienes y qué resultado podrías observar. Después pregunta qué asignaturas se relacionan con ese reto y cómo podrías practicar lo aprendido mediante un proyecto o ejercicio académico.';
    default:
      return 'Para elegir, compara qué preguntas te gustaría poder responder al terminar, qué asignaturas ayudan a desarrollarlas y qué tiempo puedes dedicar cada semana. Pide ejemplos de la experiencia académica y confirma cómo se organizan las tutorías, los proyectos o las evaluaciones de la próxima cohorte.';
  }
}

export function draftEditorialArticle(plan,program,evidence={}) {
  const proposal = plan.kind==='signal' ? continuationProposal(program,plan.signal_key,plan.search_question) : editorialProposal(program,evidence.search);
  if (!proposal?.sourceUrl || proposal.sourceUrl!==plan.source_url || proposal.sourceVerifiedAt!==plan.source_verified_at) return null;
  const programTitle = text(program.title,250);
  const academic = [
    program.mode && 'modalidad '+text(program.mode,100).toLowerCase(),
    program.duration && 'duración de '+text(program.duration,90)
  ].filter(Boolean);
  const subjects = (Array.isArray(program.curriculum)?program.curriculum:[]).slice(0,3).map(item=>text(item,150)).filter(Boolean);
  const facts = academic.length ? 'La ficha institucional describe una '+academic.join(' y una ')+'.' : 'La ficha institucional reúne el perfil y el plan de estudios.';
  const list = subjects.length ? ' Entre los temas publicados figuran '+new Intl.ListFormat('es').format(subjects)+'.' : '';
  const intro = proposal.angle + ' Usa la guía para contrastar el contenido de '+programTitle+' con una decisión concreta de estudio.';
  const steps = proposal.points.map(point=>text(point,620)).filter(Boolean);
  const example = 'Antes de tomar una decisión, escribe un ejemplo en el que aplicarías lo aprendido. Describe el problema en una frase, el resultado que esperas y el tiempo que puedes dedicar. Anota qué necesitas verificar con el equipo de Admisiones y qué puedes comparar con otras fichas del catálogo.';
  const closing = 'Abre la ficha oficial para comprobar los datos académicos y confirma con Admisiones la disponibilidad, el plan de la cohorte y las condiciones vigentes. Si te queda una pregunta, lleva el nombre del programa y tu objetivo a una cita de orientación. Así podrás decidir qué paso seguir con información institucional.';
  const search = evidence.search;
  const observation=typeof search?.observedAt==='string' && /^\d{4}-\d{2}-\d{2}/.test(search.observedAt) ? ' La observación se registró el '+search.observedAt.slice(0,10)+'.' : '';
  const reference = search?.shareable===true && search.volume!==null && search.keyword
    ? 'Tema de búsqueda de esta guía. '+text(search.source,100)+' observó «'+text(search.keyword,150)+'» para Ecuador en español con un volumen estimado de '+new Intl.NumberFormat('es-EC').format(search.volume)+' búsquedas mensuales.'+observation+' La estimación corresponde al mercado de búsqueda. Las visitas a este portal se miden por separado.'
    : '';
  const blocks = [`Qué publica Universidad Casa Grande\n${facts}${list}`,...steps,topicAdvice(plan.intent),example];
  return {
    title:text(plan.title,180),summary:text(intro,340),
    intro,blocks,closing,reference,
    sourceUrl:proposal.sourceUrl,searchQuestion:plan.search_question,intentLabel:labels[plan.intent]
  };
}

export async function checkEditorialSource(env,url) {
  if (!institutionalUrl(url)) return false;
  if (env.SEO_EDITORIAL_LIVE_SOURCE_CHECK!=='true') return true;
  try {
    const request = {redirect:'manual',signal:AbortSignal.timeout(6500)};
    let result = await fetch(url,{...request,method:'HEAD'});
    if (result.status===405 || result.status===501) {
      result = await fetch(url,{...request,method:'GET'});
      await result.body?.cancel();
    }
    return result.ok && (!result.url || !!institutionalUrl(result.url));
  } catch { return false; }
}

const continuationTopics = [
  ['inversion',/\b(?:precio|precios|costo|costos|beca|becas|pago|cuotas|arancel|financiamiento|inversion|presupuesto)\b/,'inversion','Cómo preparar el presupuesto para estudiar ',
    'Arma un presupuesto con tus valores y verifica las condiciones que solo Admisiones puede confirmar.',
    ['Separa la inversión académica de los gastos de conectividad, materiales y transporte. Si debes reorganizar tu jornada laboral, estima ese efecto aparte antes de consultar una cotización.', 'Haz dos escenarios con la misma base. Compara pago inicial, desembolso mensual, margen para imprevistos y tiempo de recuperación, sin extrapolar precios de otras cohortes.', 'Pregunta cómo se emite una cotización oficial y cuál es el proceso para confirmar alternativas de pago. El simulador sirve para comparar escenarios con valores ingresados por ti.']],
  ['documentacion',/\b(?:requisitos|documentos|documentacion|homologacion|titulo previo|postular|postulacion|admision|inscripcion)\b/,'requisitos','Cómo preparar tu consulta de postulación para ',
    'Identifica la documentación que puedes verificar con tiempo y registra las dudas para la convocatoria correcta.',
    ['Arma un inventario con los documentos que ya puedes localizar y los que debe emitir otra institución. Anota el nombre del documento y el plazo que te confirme la entidad responsable.', 'Distingue una copia de referencia de un documento que requiere validación. Pregunta a Admisiones cómo se verifica cada archivo antes de compartir datos personales o información académica.', 'Pide que te indiquen el canal oficial de la convocatoria a la que quieres aplicar y registra el siguiente paso que el equipo confirme para tu caso.']],
  ['horarios',/\b(?:en linea|virtual|en vivo|online|presencial|hibrida|modalidad|horarios?)\b/,'comparacion','Cómo comparar horarios y modalidad para estudiar ',
    'Compara las exigencias de estudio con tu jornada antes de elegir una modalidad.',
    ['Traza una semana típica con bloques de trabajo, familia y estudio. Anota qué bloques puedes mover y cuáles se superponen con actividades que podrían requerir conexión en vivo.', 'No des por sentado que la modalidad publicada define cada horario. Pregunta a Admisiones cómo se combinan clases, tutorías, entregas y trabajo autónomo en la cohorte.', 'Pide un ejemplo de semana académica y contrástalo con otra alternativa usando los mismos criterios. Verifica conectividad, interacción docente y condiciones para preparar los trabajos colaborativos.']],
  ['duracion',/\b(?:cuanto dura|duracion|tiempo de estudio|semestres|linea de tiempo|planificar tiempo)\b/,'comparacion','Cómo planificar el tiempo para estudiar ',
    'Organiza una línea de tiempo personal y comprueba cómo se distribuyen las actividades académicas.',
    ['Pon primero tus compromisos que tienen fecha fija y el tiempo que realmente puedes dedicar. Reserva una franja adicional para semanas con evaluaciones o avances de un proyecto.', 'Anota qué parte del tiempo esperas dedicar a preparación, actividades con otras personas y trabajo independiente. Pide una referencia al equipo para ajustar ese cálculo con la cohorte vigente.', 'Fija un momento para revisar tu disponibilidad y decidir si puedes sostener el ritmo. Consulta el calendario oficial antes de comprometer viajes, permisos o cambios de jornada.']],
  ['malla',/\b(?:malla|temario|materias|asignaturas|plan de estudios|curriculo)\b/,'programa','Cómo leer el plan de estudios de ',
    'Contrasta las asignaturas publicadas con las preguntas que quieres aprender a responder.',
    ['Escribe un objetivo de aprendizaje que puedas explicar sin mencionar una herramienta. Identifica cuál de las asignaturas publicadas se relaciona con ese objetivo y cuál fortalecería una habilidad complementaria.', 'Pregunta cómo se conectan los contenidos a lo largo del programa y qué evidencias de aprendizaje podrías construir. Prepara una pregunta específica por tema, evitando asumir que el temario funciona como una lista de certificaciones.', 'Compara el enfoque del plan con un caso de tu trabajo o de tu trayectoria académica. Pide al equipo confirmar la malla de la cohorte al revisar cualquier cambio de nombre o contenido.']],
  ['trayectoria',/\b(?:campo laboral|perfil profesional|salidas profesionales|perfil de egreso|roles profesionales|para que sirve)\b/,'aplicacion','Cómo relacionar tu trayectoria profesional con ',
    'Reconoce dónde podrías aplicar los aprendizajes y qué evidencia necesitarías para evaluar su pertinencia.',
    ['Elige un reto profesional con el que tengas contacto hoy y un reto que te interesa asumir después. Compara qué herramientas académicas serían útiles para cada uno.', 'Busca en la ficha los temas que respaldan esa conexión. Distingue lo que puede aportar la formación de los requisitos de un puesto o sector, que requieren una comprobación independiente.', 'Prepara preguntas sobre ejemplos de proyectos, discusión de casos y formas de evaluar el trabajo. Usa las respuestas para comparar trayectorias sin presuponer oportunidades laborales.']]
];

export function continuationTopic(keyword) {
  const phrase=String(keyword || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'');
  return continuationTopics.find(([,test])=>test.test(phrase))?.[0] || null;
}

export function continuationProposal(program,topic,keyword) {
  const definition=continuationTopics.find(([key])=>key===topic);
  if (!definition) return null;
  const base=editorialProposal(program);
  const [key,,intent,prefix,angle,points]=definition;
  const subject=text(program.shortTitle || program.title,115);
  return {...base,id:base.id+'-'+key,kind:'signal',signalKey:key,intent,
    title:text(prefix+subject,180),searchQuestion:text(keyword,240),angle,points};
}
