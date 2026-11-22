import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../public/crm-client.js', import.meta.url), 'utf8')
function harness(fetcher = async () => { throw Error('unexpected request') }) {
  const listeners = {}
  const nodes = new Map()
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {textContent:'',innerHTML:'',dataset:{initialMode:'test'},open:false,isConnected:true,classList:{contains:()=>false,toggle:()=>false},setAttribute(){},removeAttribute(){},addEventListener(){},showModal(){this.open=true},close(){this.open=false},focus(){}})
    return nodes.get(selector)
  }
  const document = {querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>{listeners[name]=fn},activeElement:null}
  class FormDataMock {constructor(form){this.values=form.values||{}} get(key){return this.values[key]??null} has(key){return Object.hasOwn(this.values,key)}}
  const context = vm.createContext({document,window:{addEventListener(){},scrollTo(){}},location:{hash:'',search:'',origin:'https://ucg.test'},URLSearchParams,URL,Intl,Date,Number,String,Object,Array,Set,Math,JSON,Boolean,Error,Promise,FormData:FormDataMock,fetch:fetcher,crypto:{randomUUID:()=> 'new-id'},setTimeout:()=>0,clearTimeout(){},navigator:{}})
  const script = source.replace("if($('.app').dataset.initialMode==='demo'||new URLSearchParams(location.search).get('demo')==='1')enableDemo()\nelse load()", "render=()=>{}; showPanel=(title,body)=>{document.querySelector('#panel').open=true; document.querySelector('#panel-content').innerHTML=title+body}; globalThis.hooks={state,openLead,leadChanges,changeAppointment,campaignChange,enableDemo,loadQueue,caseSection,campaignLink,campaignInfo};")
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
