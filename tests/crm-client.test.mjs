import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../public/crm-client.js', import.meta.url), 'utf8')
function harness(fetcher = async () => { throw Error('unexpected request') }, {pathname='',runApp=false} = {}) {
  const listeners = {}
  const nodes = new Map()
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {textContent:'',innerHTML:'',dataset:{initialMode:'test'},open:false,isConnected:true,querySelectorAll:()=>[],classList:{contains:()=>false,toggle:()=>false},setAttribute(){},removeAttribute(){},addEventListener(){},showModal(){this.open=true},close(){this.open=false},focus(){}})
    return nodes.get(selector)
  }
  const document = {querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>{listeners[name]=fn},activeElement:null}
  class FormDataMock {constructor(form){this.values=form.values||{}} get(key){return this.values[key]??null} has(key){return Object.hasOwn(this.values,key)}}
  const context = vm.createContext({document,window:{addEventListener(){},scrollTo(){}},location:{pathname,hash:'',search:'',origin:'https://ucg.test'},URLSearchParams,URL,Intl,Date,Number,String,Object,Array,Set,Math,JSON,Boolean,Error,Promise,FormData:FormDataMock,fetch:fetcher,crypto:{randomUUID:()=> 'new-id'},setTimeout:()=>0,clearTimeout(){},navigator:{}})
  const script = runApp?source:source.replace("if(publicDemo||$('.app').dataset.initialMode==='demo'||new URLSearchParams(location.search).get('demo')==='1')enableDemo()\nelse load()", "render=()=>{}; showPanel=(title,body)=>{document.querySelector('#panel').open=true; document.querySelector('#panel-content').innerHTML=title+body}; globalThis.hooks={state,openLead,leadChanges,changeAppointment,campaignChange,enableDemo,loadQueue,caseSection,campaignLink,campaignInfo,growth,changeArticle,showConversationResult,inbox,conversationPanel,editorialDesk,openEditorial,loadEditorial,teamEditorialContent,editorialPerformanceContent,loadEditorialPerformance};")
  vm.runInContext(script, context)
  return {hooks:context.hooks,listeners,node}
}
const response = data => ({ok:true,json:async()=>data})

test('opening leads quickly retains the most recently selected detail', async () => {
  const pending = new Map()
  const h = harness(path => new Promise(resolve => pending.set(path,resolve)))
  h.hooks.state.mode='live'
  const first=h.hooks.openLead('first'), second=h.hooks.openLead('second')
  pending.get('/api/staff/leads/second')(response({lead:{id:'second',name:'Second'},events:[],jobs:[],tasks:[]}))
  await new Promise(resolve=>setImmediate(resolve))
  pending.get('/api/staff/workspace/second')(response({case:{id:'second',stage:'Nuevo'},student:{},checklist:[],blockers:[],availableActions:[]}))
  await second
  pending.get('/api/staff/leads/first')(response({lead:{id:'first',name:'First'}}))
  await first
  assert.equal(h.hooks.state.currentDetail.lead.id,'second')
  assert.match(h.node('#panel-content').innerHTML,/Second/)
})

test('slot form uses Guayaquil time and demo rejects overlapping advisor slots', async () => {
  const h=harness();h.hooks.enableDemo()
  const error={textContent:''}, button={disabled:false}
  const form={classList:{contains:()=>false},id:'slot-form',values:{startAt:'2030-01-02T10:00',minutes:'30',advisor:'Ana'},querySelector:s=>s==='[type=submit]'?button:error}
  await h.listeners.submit({target:form,preventDefault(){}})
  const slot=h.hooks.state.citas.slots.find(x=>x.advisor==='Ana')
  assert.equal(slot.startAt,'2030-01-02T15:00:00.000Z')
  await h.listeners.submit({target:form,preventDefault(){}})
  assert.match(error.textContent,/ya tiene un horario/)
  assert.equal(h.hooks.state.citas.slots.filter(x=>x.advisor==='Ana').length,1)
})

test('verified enrollment is read-only and conflicts offer reload of the case', async () => {
  const h=harness(async()=>({ok:false,status:409,json:async()=>({error:'Versión desactualizada'})}))
  h.hooks.state.mode='live';h.hooks.state.caseDetail={case:{id:'one',revision:1},checklist:[{key:'enrollmentVerified',label:'Matrícula verificada',done:true}]}
  assert.match(h.hooks.caseSection({case:{id:'one',stage:'Admitido'},checklist:h.hooks.state.caseDetail.checklist,blockers:[],availableActions:[]}),/name="enrollmentVerified" checked disabled/)
  const error={textContent:'',insertAdjacentHTML(_where,html){this.html=html}},button={disabled:false}
  const form={classList:{contains:()=>false},id:'case-form',dataset:{id:'one'},values:{stage:'Admitido'},querySelector:s=>s==='[type=submit]'?button:error}
  await h.listeners.submit({target:form,preventDefault(){}})
  assert.match(error.textContent,/Versión desactualizada/)
  assert.match(error.html,/reload-lead/)
})

test('demo appointment completion and cancellation stay in memory', async () => {
  const h=harness();h.hooks.enableDemo();const a=h.hooks.state.citas.appointments[0]
  await h.hooks.changeAppointment(a.id,'cancel')
  assert.equal(a.status,'cancelled')
})

test('campaign transition carries the current revision to the server', async () => {
  const requests=[]
  const h=harness(async (path,opts)=>{requests.push({path,opts});return response(path==='/api/staff/intelligence'?{campaigns:[],candidates:[],sources:[]}: {message:'ok'})})
  h.hooks.state.mode='live';h.hooks.state.intelligence={campaigns:[{id:'campaign-1',revision:7}],candidates:[]}
  await h.hooks.campaignChange('campaign-1','aprobar')
  assert.equal(requests[0].path,'/api/staff/intelligence/campaigns/campaign-1')
  assert.deepEqual(JSON.parse(requests[0].opts.body),{action:'aprobar',revision:7})
  assert.equal(requests[1].path,'/api/staff/intelligence')
})

test('late workspace response cannot replace the newer case', async () => {
  const pending=new Map()
  const h=harness(path=>new Promise(resolve=>pending.set(path,resolve)));h.hooks.state.mode='live'
  const first=h.hooks.openLead('one')
  pending.get('/api/staff/leads/one')(response({lead:{id:'one',name:'One'}}))
  await new Promise(resolve=>setImmediate(resolve))
  const second=h.hooks.openLead('two')
  pending.get('/api/staff/leads/two')(response({lead:{id:'two',name:'Two'}}))
  await new Promise(resolve=>setImmediate(resolve))
  pending.get('/api/staff/workspace/two')(response({case:{id:'two',stage:'Nuevo'},student:{},checklist:[],blockers:[],availableActions:[]}));await second
  pending.get('/api/staff/workspace/one')(response({case:{id:'one',stage:'Nuevo'},student:{},checklist:[],blockers:[],availableActions:[]}));await first
  assert.equal(h.hooks.state.currentDetail.lead.id,'two')
  assert.equal(h.hooks.state.caseDetail.case.id,'two')
})

test('campaign links are absolute and confined to same-origin program pages', () => {
  const h=harness()
  assert.equal(h.hooks.campaignLink('/programas/mba?utm_campaign=abc'),'https://ucg.test/programas/mba?utm_campaign=abc')
  assert.equal(h.hooks.campaignLink('https://evil.test/programas/mba'),'')
  assert.equal(h.hooks.campaignLink('/equipo/conversion'),'')
  const html=h.hooks.campaignInfo({id:'x',launchUrl:'/programas/mba?utm_campaign=abc',measurement:{measuredAt:'2030-01-02T15:00:00Z',baselineProgramLeads:7,start:'2030-01-01T12:00:00Z',end:'2030-01-03T12:00:00Z'}})
  assert.match(html,/https:\/\/ucg.test\/programas\/mba/)
  assert.match(html,/Base del programa: 7/)
  assert.match(html,/Ventana:/)
  assert.match(html,/copy-campaign/)
})

test('demo conversation invokes only the stateless demo endpoint and displays the extraction', async () => {
  const requests=[]
  const h=harness(async(path,opts)=>{requests.push({path,opts});return response({facts:{intent:'Solicitar información',obstacle:'Financiamiento',evidence:[{field:'obstáculo',quote:'necesito financiamiento'}]},plan:{title:'Revisar financiación',reason:'Consulta específica',action:'Revisar opciones',channel:'email',draft:{subject:'Información',text:'Ejemplo'}}})})
  h.hooks.enableDemo()
  const button={disabled:false},error={textContent:''}
  const form={classList:{contains:()=>false},id:'conversation-form',values:{channel:'email',text:'necesito financiamiento'},querySelector:s=>s==='[type=submit]'?button:error}
  await h.listeners.submit({target:form,preventDefault(){}})
  assert.equal(requests.length,1);assert.equal(requests[0].path,'/api/demo/conversacion')
  assert.deepEqual(JSON.parse(requests[0].opts.body),{channel:'email',text:'necesito financiamiento'})
  assert.match(h.node('#conversation-result').innerHTML,/Financiamiento/)
  assert.match(h.node('#conversation-result').innerHTML,/no enviado/)
})

test('content demo creates and publishes preview only in memory', async () => {
  const h=harness();h.hooks.enableDemo()
  await h.hooks.growth('draft','op-ej')
  assert.equal(h.hooks.state.data.articles.length,1)
  await h.hooks.changeArticle('ar-ej','publish',{title:'Guía revisada'})
  assert.equal(h.hooks.state.data.articles[0].title,'Guía revisada')
  assert.equal(h.hooks.state.data.articles[0].status,'published')
})

test('the initial email example identifies the MBA and localizes evidence and follow-up', async () => {
  const {demoConversation}=await import('../src/conversation-demo.js')
  const {programs}=await import('../src/catalog.js')
  const requests=[]
  const h=harness(async(path,opts)=>{
    requests.push(path)
    return demoConversation(new Request('https://ucg.test'+path,{method:'POST',headers:{'content-type':'application/json'},body:opts.body}),programs)
  })
  h.hooks.enableDemo()
  const page=h.hooks.inbox()
  const text=page.match(/<textarea[^>]*>([^<]*)<\/textarea>/)[1]
  assert.match(text,/^Me interesa el MBA\./)
  assert.match(page,/permiso ficticio ya registrado/)
  assert.match(page,/Consultar la inversión/)
  const button={disabled:false},error={textContent:''}
  const form={classList:{contains:()=>false},id:'conversation-form',values:{channel:'email',text},querySelector:s=>s==='[type=submit]'?button:error}
  await h.listeners.submit({target:form,preventDefault(){}})
  assert.deepEqual(requests,['/api/demo/conversacion'])
  const html=h.node('#conversation-result').innerHTML
  assert.match(html,/Maestría en Administración de Empresas/)
  assert.match(html,/Programa de interés/)
  assert.match(html,/Intención de la consulta/)
  assert.match(html,/Consultar la inversión/)
  assert.match(html,/Presupuesto o financiamiento/)
  assert.match(html,/Preparar respuesta sobre inversión/)
  assert.match(html,/Borrador ilustrativo/)
  assert.doesNotMatch(html,/>[^<]*\b(intent|program|obstacle|contactPreference|revision_humana)\b[^<]*</)
})

test('the staff conversation panel uses Spanish labels for provider metadata', () => {
  const h=harness()
  h.hooks.state.mode='live'
  h.hooks.conversationPanel({provider:'resend',reviewStatus:'linked',contentStatus:'partial',extraction:{
    intent:'inversion',obstacle:'financing',contactPreference:'email',evidence:[{field:'obstacle',quote:'Me preocupa el costo.'}]
  }})
  const html=h.node('#panel-content').innerHTML
  assert.match(html,/Correo/)
  assert.match(html,/Con expediente/)
  assert.match(html,/Contenido pendiente de verificación/)
  assert.match(html,/Me preocupa el costo.*Obstáculo/)
  assert.doesNotMatch(html,/>[^<]*\b(resend|linked|partial|financing|obstacle)\b[^<]*</)
})

test('public editorial plan fetches safe content without calling the CRM or rendering staff data', async () => {
  const requests=[];
  const {publicKeywordObservations}=await import('../src/openseo-observations.js');
  const h=harness(async(path,options)=>{
    requests.push({path,options});
    return response({
      week:'2026-11-23',programCount:34,
      plan:[
        {program:'maestria-en-ia-y-ciencia-de-datos',programTitle:'Inteligencia Artificial',title:'Cómo elegir una maestría en IA',cluster:'IA aplicada',status:'planned',articleSlug:'borrador-no-publicado',
          reason:'PRIVADO: razon interna',officialUrl:'https://otro-sitio.invalid/ia',
          evidence:{search:{keyword:'maestría en inteligencia artificial',volume:70,source:'OpenSEO · Keyword Generator',observedAt:'2026-11-23T15:00:00Z'},conversion:{email:'private@example.invalid'}}},
        {program:'maestria-en-derecho-digital',title:'Plan de estudios de Derecho Digital',status:'published',articleSlug:'derecho-digital',evidence:{search:{keyword:'consulta privada',source:'OpenSEO · Search Console'}}}
      ],
      guides:[{slug:'derecho-digital',title:'Guía sobre Derecho Digital',summary:'Revisa las asignaturas',stats:{views:7,leads:12347}}],
      marketResearch:[...publicKeywordObservations,{market:'Ecuador',source:'OpenSEO · Search Console',keyword:'palabra privada',volume:892}],
      sources:[{label:'OpenSEO · Keyword Generator',status:'disponible',detail:'detalles internos'},{label:'OpenSEO · Search Console',status:'disponible'}]
    });
  },{pathname:'/motor-de-contenidos',runApp:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(requests.map(r=>[r.path,r.options.method,r.options.credentials]),[['/api/editorial/publico','GET','omit']]);
  const html=h.node('#editorial-public-data').innerHTML;
  assert.match(html,/Plan editorial/);
  assert.match(html,/Maestrías incluidas<\/dt><dd>34/);
  assert.match(html,/70 búsquedas mensuales estimadas/);
  assert.match(html,/href="\/guias\/derecho-digital"/);
  assert.match(html,/7 lecturas registradas/);
  assert.match(html,/Investigación pública en Ecuador · 17 consultas/);
  assert.equal([...html.matchAll(/<th scope="row">/g)].length,17);
  assert.match(html,/El guion indica un dato no disponible/);
  assert.match(html,/<td>General<\/td>/);
  assert.match(html,/<td>720<\/td><td>0<\/td>/);
  assert.match(html,/<td>10<\/td><td>—<\/td>/);
  assert.match(html,/href="https:\/\/openseo\.so\/keyword-generator"/);
  assert.doesNotMatch(html,/Search Console|palabra privada|consulta privada/);
  assert.doesNotMatch(html,/data-act|publicar|borrador-no-publicado|otro-sitio\.invalid|12347|PRIVADO|private@example\.invalid|detalles internos/);
});

test('staff editorial saves with a revision and publishes only after explicit review', async () => {
  const plan={week:'2026-11-23',enabled:true,config:{paused:false,autoPublish:true},metrics:{planned:34,publishedPortal:1,publishedCms:0,awaitingCms:1},cms:{status:'unconfigured'},
    plan:[{id:'prueba',program:'maestria-en-ia-y-ciencia-de-datos',programTitle:'Inteligencia Artificial',title:'Cómo estudiar IA',status:'draft',revision:7,
      officialUrl:'https://www.casagrande.edu.ec/posgrados',sourceStatus:'verified',
      article:{title:'Cómo estudiar IA',summary:'Texto para revisión',body:'Cuerpo de la propuesta'}},
    {id:'publicada',program:'otra',title:'Guía publicada',status:'published',articleSlug:'guia',cms:{status:'pending'}}]};
  const requests=[];
  const h=harness(async(path,options)=>{
    requests.push({path,method:options.method,body:options.body?JSON.parse(options.body):undefined});
    if(path.startsWith('/api/staff/openseo'))return response({sources:[{label:'OpenSEO',state:'sin_datos'}],programs:[]});
    if(options.method==='POST'){
      const sent=JSON.parse(options.body);
      const row=plan.plan.find(x=>x.id===sent.id);
      assert.equal(sent.revision,row.revision);
      row.revision++;
      if(sent.action==='save')row.article={title:sent.title,summary:sent.summary,body:sent.body};
      return response({...plan,message:'Cambios guardados'});
    }
    return response(plan);
  });
  h.hooks.state.mode='live';
  await h.hooks.loadEditorial('2026-11-23');
  const board=h.hooks.teamEditorialContent();
  assert.match(board,/Publicadas en sitio oficial/);
  assert.match(board,/Pendiente en el sitio oficial/);
  h.hooks.openEditorial('prueba');
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(h.node('#panel-content').innerHTML,/Publicar en el portal/);
  assert.match(h.node('#panel-content').innerHTML,/name="autoPublish">Revisé el borrador/);
  assert.match(h.node('#editorial-keywords').innerHTML,/Sin datos/);
  const error={textContent:''};
  const form={classList:{contains:()=>false},id:'editorial-copy-form',dataset:{id:'prueba'},
    values:{title:'Guía de IA revisada',summary:'Descripción revisada',body:'Texto revisado'},
    querySelector:()=>error};
  const publish={dataset:{value:'publish'},disabled:false};
  await h.listeners.submit({target:form,submitter:publish,preventDefault(){}});
  assert.match(error.textContent,/Confirma que revisaste/);
  assert.equal(requests.filter(r=>r.method==='POST').length,0);
  const save={dataset:{value:'save'},disabled:false};
  await h.listeners.submit({target:form,submitter:save,preventDefault(){}});
  assert.deepEqual(requests.find(r=>r.method==='POST')?.body,{action:'save',id:'prueba',revision:7,...form.values});
  form.values.title='Guía de IA lista para publicar';
  form.values.reviewed='on';
  await h.listeners.submit({target:form,submitter:publish,preventDefault(){}});
  const changes=requests.filter(r=>r.method==='POST').map(r=>r.body);
  assert.equal(changes[1].action,'save');
  assert.equal(requests.filter(r=>r.method==='POST').at(-1).path,'/api/staff/editorial?week=2026-11-23');
  assert.equal(changes[1].title,form.values.title);
  assert.deepEqual(changes[2],{action:'publish',id:'prueba',revision:9});
  const schedule={...form,id:'editorial-date-form',values:{scheduledAt:'2026-11-24T10:00'}};
  await h.listeners.submit({target:schedule,submitter:save,preventDefault(){}});
  assert.deepEqual(requests.filter(r=>r.method==='POST').at(-1).body,{action:'schedule',id:'prueba',revision:10,scheduledAt:'2026-11-24T15:00:00.000Z'});
  schedule.values.autoPublish='on';
  await h.listeners.submit({target:schedule,submitter:save,preventDefault(){}});
  assert.equal(requests.filter(r=>r.method==='POST').at(-1).body.autoPublish,true);
});

test('staff performance renders observed zero separately from unavailable measurements', async () => {
  const h=harness(async(path)=> {
    assert.equal(path,'/api/staff/editorial/rendimiento');
    return response({days:30,rows:[{slug:'guia-ia',title:'Guía de IA',views:12,ctaClicks:3,leads:0,appointments:null,enrollments:2}]});
  });
  h.hooks.state.mode='live';
  await h.hooks.loadEditorialPerformance();
  const html=h.hooks.editorialPerformanceContent();
  assert.match(html,/href="\/guias\/guia-ia"/);
  assert.match(html,/<td>12<\/td><td>3<\/td><td>0<\/td><td>—<\/td><td>2<\/td>/);
});

test('the model annotation appears in private conversation detail only', () => {
  const h=harness();
  const conversation={provider:'email',extraction:{intent:'inversion',
    modelAnalysis:{status:'completed',provider:'anthropic',model:'claude-haiku-5-5',reason:'La consulta identifica un programa.'}}};
  h.hooks.state.mode='live';
  h.hooks.conversationPanel(conversation);
  assert.match(h.node('#panel-content').innerHTML,/La consulta identifica un programa\./);
  assert.match(h.node('#panel-content').innerHTML,/Anthropic · claude-haiku-5-5/);
  h.hooks.state.mode='demo';
  h.hooks.conversationPanel(conversation);
  assert.doesNotMatch(h.node('#panel-content').innerHTML,/Anthropic|La consulta identifica un programa/);
});
