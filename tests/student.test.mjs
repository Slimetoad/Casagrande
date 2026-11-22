import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { programs } from "../src/catalog.js";
import { renderStudent } from "../src/student.js";

const clientSource = await readFile(new URL("../public/student-client.js", import.meta.url), "utf8");

test("every published maestría links to its source, financing and appointment", () => {
  assert.equal(programs.length, 34);
  for (const p of programs) {
    const html = renderStudent("/programas/" + p.slug, programs);
    assert.ok(html.includes('data-program-hub="' + p.slug + '"'), p.slug);
    assert.ok(html.includes('href="/cita?programa=' + p.slug + '"'), p.slug);
    assert.ok(html.includes('href="/financiamiento?programa=' + p.slug + '"'), p.slug);
    assert.ok(html.includes("comparar=" + p.slug), p.slug);
    assert.ok(html.includes(p.url.replaceAll("&", "&amp;")), p.slug);
    assert.match(html, /id="malla-list"/);
    assert.equal([...html.matchAll(/data-hub-inquiry/g)].length, p.admissionsStatus === "Inscripciones cerradas" ? 0 : 1);
  }
});

test("home areas link to a catalog filtered on the server", () => {
  const home = renderStudent("/", programs);
  assert.match(home, /href="\/programas\?area=Tecnolog%C3%ADa" data-home-area="Tecnología"/);
  const html = renderStudent("/programas?area=Tecnolog%C3%ADa", programs);
  assert.match(html, /value="Tecnología" selected/);
  assert.match(html, /id="result-count" role="status">2 programas/);
  assert.equal([...html.matchAll(/<article hidden class="p-card/g)].length, 32);
});

test("official sources and outbound privacy links do not send the campaign", () => {
  for (const path of ["/programas/" + programs[2].slug, "/solicitar"]) {
    const html = renderStudent(path + "?utm_campaign=solo_interno&utm_source=ucg", programs);
    const outgoing = [...html.matchAll(/<a\b[^>]*href="https:\/\/[^"]+"[^>]*>/g)];
    assert.ok(outgoing.length > 0);
    for (const [link] of outgoing) {
      assert.doesNotMatch(link, /solo_interno|utm_source/);
      assert.match(link, /\bnoreferrer\b/);
    }
  }
});

test("pilot disclosure and optional channel permissions are visible near submission", () => {
  const form = renderStudent("/solicitar", programs);
  assert.match(form, /name="consentWhatsapp"/);
  assert.match(form, /name="consentVoice"/);
  assert.doesNotMatch(form, /name="consent(?:Whatsapp|Voice|Email)"[^>]* required/);
  assert.match(form, /Tus datos se enviarán al equipo que opera este portal/);
  assert.doesNotMatch(renderStudent("/solicitar", programs, {institutionalLive:true}), /Portal piloto de orientación/);
});

test("appointment pages can use the public navigation and disclosure", () => {
  const html = renderStudent("/cita", programs, {appointmentHtml:"<h1>Agendar una cita</h1>"});
  assert.match(html, /<title>Agendar una cita de posgrados/);
  assert.match(html, /<main[^>]+><h1>Agendar una cita<\/h1><\/main>/);
  assert.match(html, /class="pilot-footer"/);
});

test("platform overview connects the live public spaces and separates staff access", async () => {
  const { serve } = await import("../src/portal.js");
  const origin = "https://posgrados.example.invalid";
  const visit = path => serve(new Request(origin + path), {PUBLIC_BASE_URL:origin}, () => "");
  const overview = await visit("/plataforma");
  assert.equal(overview.status, 200);
  const page = await overview.text();
  assert.match(page, /Plataforma de <em>Posgrados\.<\/em>/);
  assert.equal([...page.matchAll(/>Demostración pública<\/div>/g)].length, 2);
  for (const path of ["/","/crm","/motor-de-contenidos"]) {
    assert.ok(page.includes('href="' + path + '"'));
    const response = await visit(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /href="\/plataforma"/);
    if (path !== "/") assert.match(html, /data-initial-mode="demo"/);
    else assert.match(html, /<footer\b[\s\S]+href="\/plataforma">Ver la plataforma<\/a>/);
  }
  assert.match(page, /href="\/equipo">Acceso interno/);
  assert.equal((await visit("/equipo")).status, 403);
});

function testElement(initial = {}) {
  const listeners = new Map();
  return {
    hidden:false,
    children:[],
    attributes:new Map(),
    classList:{add(){}},
    ...initial,
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children.length = 0; },
    getAttribute(name) { return this.attributes.get(name); },
    setAttribute(name,value) { this.attributes.set(name,value); },
    addEventListener(name, handler) { listeners.set(name, handler); },
    fire(name) { return listeners.get(name)?.({preventDefault() {}}); },
    focus() {},
    closest() { return null; },
  };
}

function runStudent({elements, choices={}, search="", navigator={}, storage=new Map(), local=new Map(), fetch}) {
  const window = testElement();
  const document = testElement({
    getElementById: id => elements.get(id),
    dispatchEvent:event=>document.fire(event.type),
    querySelector: selector => choices[selector]?.[0] || null,
    querySelectorAll: selector => choices[selector] || [],
    createElement: tag => testElement({tagName:tag.toUpperCase()}),
  });
  elements.set("catalog-data",{textContent:JSON.stringify(programs)});
  runInNewContext(clientSource, {
    document,
    window,
    location:{search,origin:"https://posgrados.example.invalid"},
    navigator,
    localStorage:{getItem:key=>local.get(key),setItem:(key,value)=>local.set(key,value)},
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    URL,
    URLSearchParams,
    Event,
    CustomEvent:Event,
    fetch,
  });
}

async function submitLead({whatsapp=false, voice=false, privacy=false, mainCTA=true, marked=true, programChange=false,
  dnt, privacyAfterOpen=false, utm="", storedCampaign} = {}) {
  const program = programs[0].slug;
  const controls = {
    name: {value:"Consulta de prueba"},
    email: {value:"persona@example.invalid"},
    phone: testElement({value:whatsapp || voice ? "+593990000000" : "", setCustomValidity(value) { this.validationMessage = value; }}),
    program: {value:""},
    consentEmail: {checked:false},
    consentVoice: testElement({checked:voice}),
    consentWhatsapp: testElement({checked:whatsapp}),
  };
  const submit = {};
  const lead = testElement({
    elements: {namedItem: key => controls[key]},
    querySelector: () => submit,
    reportValidity: () => !controls.phone.validationMessage,
  });
  const elements = new Map([["catalog-data",{textContent:JSON.stringify(programs)}],["lead-form",lead],
    ["context-preview",{}],["lead-error",{}],
    ["lead-success",testElement({querySelector:()=>({after(){}})})]]);
  const storage = new Map([["ucg-hub-experiment-" + program,"B"]]);
  if (marked) storage.set("ucg-last-hub-click", program);
  if (storedCampaign) storage.set("ucg-campaign", JSON.stringify(storedCampaign));
  let sent;
  const navigator = {globalPrivacyControl:privacy,doNotTrack:dnt};
  runStudent({
    elements,
    search:"?origen=programa&programa=" + program + (mainCTA ? "&cta=principal" : "") + utm,
    navigator,
    storage,
    fetch:async (_url,{body})=>{sent=JSON.parse(body);return {ok:true,json:async()=>({ok:true})};},
  });
  if (programChange) controls.program.value = programs[1].slug;
  if (privacyAfterOpen) navigator.globalPrivacyControl = true;
  await lead.fire("submit");
  assert.equal(lead.hidden, true);
  return {sent, phone:controls.phone, storedCampaign:storage.get("ucg-campaign")};
}

test("lead submits without phone or permissions and keeps voice and WhatsApp independent", async () => {
  const {sent,phone} = await submitLead();
  assert.equal(phone.required, false);
  assert.equal(sent.phone, "");
  assert.equal(sent.consentWhatsapp, false);
  assert.equal(sent.consentVoice, false);
  const whatsapp = await submitLead({whatsapp:true});
  assert.equal(whatsapp.phone.required, true);
  assert.equal(whatsapp.sent.consentWhatsapp, true);
  assert.equal(whatsapp.sent.consentVoice, false);
  const voice = await submitLead({voice:true});
  assert.equal(voice.sent.consentWhatsapp, false);
  assert.equal(voice.sent.consentVoice, true);
});

test("experiment attribution requires the hero link, matching selection and privacy setting", async () => {
  assert.equal((await submitLead()).sent.context.hubVariant, "B");
  for (const options of [{privacy:true},{mainCTA:false},{marked:false},{programChange:true}]) {
    assert.equal((await submitLead(options)).sent.context.hubVariant, undefined);
  }
});

test("conventional inquiry does not capture or retain UTM under DNT or GPC", async () => {
  const storedCampaign = {utm_campaign:"anterior",unexpected:"omitido"};
  assert.equal((await submitLead({storedCampaign})).sent.context.utm_campaign,"anterior");
  const fresh = await submitLead({storedCampaign,utm:"&utm_campaign=nueva"});
  assert.deepEqual(fresh.sent.context,{utm_campaign:"nueva",hubVariant:"B"});
  for (const privacy of [{privacy:true},{dnt:"1"},{privacyAfterOpen:true}]) {
    const result = await submitLead({storedCampaign,utm:"&utm_source=ucg",...privacy});
    assert.deepEqual(result.sent.context,{});
    assert.equal(result.storedCampaign,undefined);
  }
});

test("program search normalizes accents and the self-service plan persists per program", () => {
  const [program, other] = programs;
  const local = new Map([["ucg-plan-" + program.slug, '["requirements"]']]);
  function openPlan(p) {
    const steps = ["curriculum","requirements"].map(planStep=>testElement({dataset:{planStep}}));
    const hub = {dataset:{programHub:p.slug},querySelectorAll:()=>steps};
    const search = testElement();
    const rows = [testElement({textContent:"Liderazgo ejecutivo"}),testElement({textContent:"Gestión de operaciones"})];
    const count = testElement(), progress = testElement();
    const elements = new Map([["malla-search",search],["malla-list",{children:rows}],["malla-count",count],["malla-empty",{}],["plan-progress",progress]]);
    runStudent({elements,choices:{"[data-program-hub]":[hub]},local});
    return {search,rows,count,steps,progress};
  }
  const opened = openPlan(program);
  opened.search.value = "gestion";
  opened.search.fire("input");
  assert.equal(opened.rows[0].hidden, true);
  assert.equal(opened.rows[1].hidden, false);
  assert.equal(opened.count.textContent, "1 asignatura");
  assert.equal(opened.steps[1].checked, true);
  opened.steps[0].checked = true;
  opened.steps[0].fire("change");
  assert.equal(opened.progress.textContent, "2 de 2 pasos marcados");
  assert.ok(openPlan(program).steps.every(input=>input.checked));
  assert.ok(!openPlan(other).steps.some(input=>input.checked));
});

test("the comparator reopens a share link and bookmarks survive navigation", async () => {
  const [first,second,third,fourth] = programs;
  const items = [first,second,third,fourth].map(p=>testElement({value:p.slug}));
  const saveButtons = [first,second].map(p=>testElement({dataset:{save:p.slug,name:p.title},querySelector(){return null;}}));
  const local = new Map();
  let share, opened = false;
  const dialog = testElement({showModal(){opened=true;}});
  const compareBody = testElement(), tray = testElement(), compare = testElement();
  const elements = new Map([["program-search",testElement({value:""})],["area-filter",testElement({value:""})],
    ["saved-filter",testElement()],["result-count",{}],["no-results",{}],["empty-catalog-copy",{}],
    ["reset-filters",testElement()],["compare-tray",tray],["compare-open",compare],["compare-status",{}],
    ["compare-dialog",dialog],["compare-clear",testElement()],["compare-close",testElement()],["compare-body",compareBody],
    ["compare-link",testElement()],["compare-link-label",{}],["share-status",{}],["compare-share",testElement()]]);
  const related = "?comparar=" + [first,second].map(p=>p.slug).join(",");
  runStudent({elements,choices:{"[data-compare]":items,"[data-save]":saveButtons},search:related,local,
    navigator:{clipboard:{writeText:async value=>{share=value;}}}});
  assert.equal(tray.hidden,false);
  assert.equal(compare.disabled,false);
  assert.equal(opened,true);
  assert.ok(items[0].checked && items[1].checked);
  assert.ok(compareBody.children.some(node=>node.tagName==="TABLE"));

  items[2].checked = true;
  items[2].fire("change");
  items[3].checked = true;
  items[3].fire("change");
  assert.equal(items[3].checked,false);
  await elements.get("compare-share").fire("click");
  assert.equal(new URL(share).searchParams.get("comparar"), [first,second,third].map(p=>p.slug).join(","));

  saveButtons[0].fire("click");
  assert.equal(saveButtons[0].getAttribute("aria-pressed"),"true");
  const bookmark = testElement({dataset:{save:first.slug,name:first.title},querySelector(){return null;}});
  runStudent({elements:new Map(),choices:{"[data-save]":[bookmark]},local});
  assert.equal(bookmark.getAttribute("aria-pressed"),"true");
});

test("a booking includes stored or direct UTM only when the browser permits it", async () => {
  const code = await readFile(new URL("../public/citas.js", import.meta.url), "utf8");
  async function book(search, navigator = {}) {
    const submit = testElement();
    const form = testElement({querySelector:()=>submit,reportValidity:()=>true});
    const elements = new Map([["booking-form",form],["booking-main",testElement()],["booking-confirm",testElement()],
      ["slot-list",testElement()],["booking-status",testElement()],["booking-preference",testElement()]]);
    let request;
    runInNewContext(code, {
      document:{getElementById:id=>elements.get(id),createElement:()=>testElement(),dispatchEvent(){}},
      window:{},
      location:{search,hash:"",origin:"https://posgrados.example.invalid"},
      navigator,
      sessionStorage:{getItem:()=>JSON.stringify({utm_source:"ucg",utm_campaign:"previa",fakeIdentity:"x"})},
      URLSearchParams,
      FormData:class extends Map { constructor(){super([["consentCita","on"]]);} },
      crypto,
      fetch:async (url,init)=>{
        if(url==="/api/citas")return {ok:true,json:async()=>({slots:[]})};
        request=JSON.parse(init.body);
        return {ok:false,status:422,json:async()=>({error:"Fin de la prueba"})};
      },
    });
    await form.fire("submit");
    return request.campaign;
  }
  assert.deepEqual(await book(""),{utm_source:"ucg",utm_campaign:"previa"});
  assert.deepEqual(await book("?utm_campaign=nueva&otro=x"),{utm_campaign:"nueva"});
  assert.deepEqual(await book("?utm_campaign=nueva",{globalPrivacyControl:true}),{});
  assert.deepEqual(await book("",{doNotTrack:"1"}),{});
});
