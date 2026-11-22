(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const node = (tag, text) => { const result = document.createElement(tag); if (text != null) result.textContent = text; return result; };
  const money = value => new Intl.NumberFormat("es-EC", {style:"currency",currency:"USD"}).format(value);
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es").trim();
  const params = new URLSearchParams(location.search);
  const programs = JSON.parse(el("catalog-data")?.textContent || "[]");
  const lookup = new Map(programs.map(p => [p.slug,p]));
  const read = key => { try { return JSON.parse(sessionStorage.getItem("ucg-" + key) || "null"); } catch { return null; } };
  const save = (key,value) => { try { sessionStorage.setItem("ucg-" + key,JSON.stringify(value)); } catch {} };
  const remove = key => { try { sessionStorage.removeItem("ucg-" + key); } catch {} };
  const readLocal = key => { try { return JSON.parse(localStorage.getItem("ucg-" + key) || "null"); } catch { return null; } };
  const saveLocal = (key, value) => { try { localStorage.setItem("ucg-" + key, JSON.stringify(value)); } catch {} };
  const validSlugs = values => Array.isArray(values) ? [...new Set(values)].filter(slug => lookup.has(slug)) : [];
  const conversion = event => document.dispatchEvent(new CustomEvent("ucg:conversion",{detail:{event}}));
  const urlFor = p => "/programas/" + encodeURIComponent(p.slug);
  const leadUrl = (source,slug) => "/solicitar?" + new URLSearchParams({origen:source,...(slug?{programa:slug}:{})}).toString();
  const choice = (parent,text,href) => { const a = node("a",text); a.className="btn btn-primary"; a.href=href; parent.append(a); return a; };
  const campaignKeys = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
  const attributionAllowed = () => !navigator.globalPrivacyControl &&
    !["1", "yes"].includes(navigator.doNotTrack) && !["1", "yes"].includes(window.doNotTrack);
  const campaignData = data => Object.fromEntries(campaignKeys
    .filter(key => typeof data?.[key] === "string" && data[key].trim())
    .map(key => [key, data[key].trim().slice(0,100)]));
  if (attributionAllowed()) {
    if (campaignKeys.some(key => params.has(key))) {
      const utm = campaignData(Object.fromEntries(campaignKeys.map(key => [key, params.get(key)])));
      save("campaign",utm);
    }
  } else {
    remove("campaign");
  }
  window.addEventListener("pageshow", () => {
    if (!attributionAllowed()) remove("campaign");
  });

  const menu = el("menu-toggle");
  const setMenu = open => { const nav=el("site-nav"); if(open)nav.setAttribute("data-open","");else nav.removeAttribute("data-open"); menu.setAttribute("aria-expanded",String(open)); menu.setAttribute("aria-label",open?"Cerrar menú":"Abrir menú"); };
  menu?.addEventListener("click",()=>setMenu(menu.getAttribute("aria-expanded")!=="true"));
  document.addEventListener("keydown",e=>{if(e.key==="Escape" && menu?.getAttribute("aria-expanded")==="true"){setMenu(false);menu.focus();}});

  const areaChoices = [...document.querySelectorAll("[data-home-area]")];
  for (const choice of areaChoices) {
    choice.addEventListener("click", event => {
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      const area = choice.dataset.homeArea;
      for (const link of areaChoices) {
        if (link === choice) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
      const panels = [...document.querySelectorAll("[data-home-list]")];
      for (const panel of panels) panel.hidden = panel.dataset.homeList !== area;
      const link = el("area-catalog-link");
      link.href = choice.href;
      link.firstChild.textContent = area ? "Ver programas de " + area + " " : "Ver todos los programas ";
      el("home-area-status").textContent = area ? "Mostrando maestrías de " + area + "." : "Mostrando una selección de todas las áreas.";
    });
  }

  let saved = new Set(validSlugs(readLocal("shortlist")));
  const bookmarks = [...document.querySelectorAll("[data-save]")];
  const updateSaved = () => {
    for (const button of bookmarks) {
      const active = saved.has(button.dataset.save);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", (active ? "Quitar de guardadas: " : "Guardar ") + button.dataset.name);
      const label = button.querySelector("[data-save-label]");
      if (label) label.textContent = active ? "Programa guardado" : "Guardar programa";
    }
    if (el("saved-count")) el("saved-count").textContent = "(" + saved.size + ")";
    document.dispatchEvent(new Event("ucg:shortlist"));
  };
  for (const button of bookmarks) {
    button.addEventListener("click", () => {
      const slug = button.dataset.save;
      if (saved.has(slug)) saved.delete(slug);
      else saved.add(slug);
      saveLocal("shortlist", [...saved]);
      updateSaved();
      if (button.closest("[data-card]")?.hidden) el("saved-filter")?.focus();
    });
  }
  window.addEventListener("storage", event => {
    if (event.key !== "ucg-shortlist") return;
    saved = new Set(validSlugs(readLocal("shortlist")));
    updateSaved();
  });
  window.addEventListener("pageshow", event => {
    if (!event.persisted) return;
    const persisted = readLocal("shortlist");
    if (!Array.isArray(persisted)) return;
    saved = new Set(validSlugs(persisted));
    updateSaved();
  });
  updateSaved();

  if (el("program-search")) {
    const search = el("program-search"), area = el("area-filter"), family = el("family-filter");
    const savedFilter = el("saved-filter");
    const cards = [...document.querySelectorAll("[data-card]")];
    const filter = () => {
      const q = normalize(search.value);
      const onlySaved = savedFilter.getAttribute("aria-pressed") === "true";
      let count = 0;
      for (const card of cards) {
        const searchable = normalize([card.dataset.title, card.dataset.area, card.querySelector("h3")?.textContent].join(" "));
        const matches = (!area.value || card.dataset.area === area.value) &&
          (!family?.value || card.dataset.family === family.value) &&
          (!onlySaved || saved.has(card.dataset.slug)) && searchable.includes(q);
        card.hidden = !matches;
        if (matches) count++;
      }
      el("result-count").textContent = count === 1 ? "1 programa" : count + " programas";
      el("no-results").hidden = count > 0;
      el("empty-catalog-copy").textContent = onlySaved && !saved.size
        ? "Usa el marcador de cada programa para guardar las maestrías que te interesan."
        : "Prueba otra búsqueda o consulta todas las áreas.";
    };
    search.addEventListener("input", filter);
    area.addEventListener("change", filter);
    family?.addEventListener("change", filter);
    document.addEventListener("ucg:shortlist", filter);
    savedFilter.addEventListener("click", () => {
      const enable = savedFilter.getAttribute("aria-pressed") !== "true";
      savedFilter.setAttribute("aria-pressed", String(enable));
      if (enable) {
        search.value = "";
        area.value = "";
        if (family) family.value = "";
      }
      filter();
    });
    el("reset-filters").addEventListener("click", () => {
      search.value = "";
      area.value = "";
      if (family) family.value = "";
      savedFilter.setAttribute("aria-pressed", "false");
      filter();
      search.focus();
    });
    filter();

    const shared = validSlugs(params.get("comparar")?.split(",")).slice(0, 3);
    const stored = validSlugs(read("compare-selection"));
    const toCompare = new Set(shared.length === 1 ? [...new Set([...shared,...stored])].slice(0,3) : shared.length ? shared : stored.slice(0,3));
    const tray = el("compare-tray"), compare = el("compare-open"), status = el("compare-status"), dialog = el("compare-dialog");
    const compareItems = [...document.querySelectorAll("[data-compare]")];
    const updateCompare = () => {
      for (const item of compareItems) item.checked = toCompare.has(item.value);
      compare.textContent = "Comparar (" + toCompare.size + "/3)";
      compare.disabled = toCompare.size < 2;
      tray.hidden = !toCompare.size;
      status.textContent = toCompare.size === 1 ? "Elige otra maestría para comparar." : [...toCompare].map(slug=>lookup.get(slug).title).join(" · ");
      save("compare-selection", [...toCompare]);
    };
    for (const item of compareItems) {
      item.addEventListener("change", () => {
        if (!item.checked) toCompare.delete(item.value);
        else if (toCompare.size < 3) toCompare.add(item.value);
        else {
          item.checked = false;
          status.textContent = "Puedes comparar hasta tres programas. Desmarca uno para cambiarlo.";
          return;
        }
        updateCompare();
      });
    }
    el("compare-clear").addEventListener("click", () => {
      toCompare.clear();
      updateCompare();
      search.focus();
    });
    const shareInput = el("compare-link"), shareLabel = el("compare-link-label"), shareStatus = el("share-status");
    const renderComparison = () => {
      const selection = [...toCompare].map(slug=>lookup.get(slug));
      if (selection.length < 2) return;
      const content = el("compare-body");
      content.replaceChildren();
      shareLabel.hidden = true;
      shareStatus.textContent = "";
      const table = node("table"), head = node("thead"), row = node("tr"), firstColumn = node("th", "Programa");
      firstColumn.scope = "col";
      row.append(firstColumn);
      for (const p of selection) {
        const th = node("th"), a = node("a", p.title);
        th.scope = "col";
        a.href = urlFor(p);
        th.append(a);
        row.append(th);
      }
      head.append(row);
      table.append(head);
      const body = node("tbody");
      for (const [label,key] of [["Área","area"],["Formato","family"],["Modalidad","mode"],["Duración","duration"],["Convocatoria publicada","admissionsStatus"],["Inversión publicada","price"]]) {
        const tr = node("tr"), th = node("th", label);
        th.scope = "row";
        tr.append(th);
        for (const p of selection) tr.append(node("td", key === "price" && typeof p.price === "number" && p.price > 0 ? money(p.price) : p[key] || "Consultar a admisiones"));
        body.append(tr);
      }
      table.append(body);
      content.append(table);
      const cta = choice(content, "Conversar sobre estas opciones", leadUrl("comparador", ""));
      cta.classList.add("compare-contact");
      cta.addEventListener("click", () => save("compare", selection.map(p=>p.slug)));
      dialog.showModal();
    };
    el("compare-share").addEventListener("click", async () => {
      const url = new URL("/programas", location.origin);
      url.searchParams.set("comparar", [...toCompare].join(","));
      try {
        await navigator.clipboard.writeText(url.href);
        shareStatus.textContent = "Enlace copiado.";
      } catch {
        shareInput.value = url.href;
        shareLabel.hidden = false;
        shareInput.focus();
        shareInput.select();
        shareStatus.textContent = "Copia el enlace seleccionado.";
      }
    });
    compare.addEventListener("click", renderComparison);
    el("compare-close").addEventListener("click", () => dialog.close());
    updateCompare();
    if (shared.length > 1) renderComparison();
  }

  const hub = document.querySelector("[data-program-hub]");
  if (hub) {
    const malla = el("malla-search");
    if (malla) {
      const modules = [...el("malla-list").children];
      malla.addEventListener("input", () => {
        const q = normalize(malla.value);
        for (const row of modules) row.hidden = !normalize(row.textContent).includes(q);
        const count = modules.filter(row=>!row.hidden).length;
        el("malla-count").textContent = count === 1 ? "1 asignatura" : count + " asignaturas";
        el("malla-empty").hidden = count > 0;
      });
    }
    const checklist = [...hub.querySelectorAll("[data-plan-step]")];
    const planKey = "plan-" + hub.dataset.programHub;
    const progress = el("plan-progress");
    const renderPlan = () => {
      const done = checklist.filter(input=>input.checked).map(input=>input.dataset.planStep);
      progress.textContent = done.length + " de " + checklist.length + " pasos marcados";
      return done;
    };
    const loadPlan = () => {
      const done = readLocal(planKey);
      for (const step of checklist) step.checked = Array.isArray(done) && done.includes(step.dataset.planStep);
      renderPlan();
    };
    for (const input of checklist) input.addEventListener("change", () => saveLocal(planKey, renderPlan()));
    window.addEventListener("storage", event => { if (event.key === "ucg-" + planKey) loadPlan(); });
    window.addEventListener("pageshow", event => { if (event.persisted && Array.isArray(readLocal(planKey))) loadPlan(); });
    loadPlan();
  }

  for (const element of document.querySelectorAll("[data-enhanced]")) element.hidden = false;

  if (el("quiz-panel")) {
    const mount=el("quiz-mount");
    const areas=[...new Set(programs.map(p=>p.area).filter(Boolean))];
    const families=[...new Set(programs.map(p=>p.family).filter(Boolean))];
    const questions=[
      {key:"quizArea",title:"¿Qué área te gustaría profundizar?",choices:areas},
      {key:"quizFamily",title:"¿Qué formato de maestría te interesa?",choices:[...families,"Quiero explorar ambos"]},
      {key:"timeframe",title:"¿Cuándo te gustaría empezar?",choices:["Próxima convocatoria","En seis a doce meses","Estoy explorando"]}
    ];
    const answers={};let step=0;
    const draw=()=>{
      mount.replaceChildren();const q=questions[step];
      el("quiz-progress").textContent=q?"Pregunta "+(step+1)+" de 3":"Tu orientación";
      el("quiz-bar").style.width=String(Math.min(100,(step+1)/3*100))+"%";
      if(q){
        const field=node("fieldset"),legend=node("legend");const title=node("h2",q.title);legend.append(title);field.append(legend);
        const grid=node("div");grid.className="quiz-options";const btn=node("button",step===2?"Ver mis resultados":"Continuar");btn.type="button";btn.className="btn btn-primary";btn.disabled=!answers[q.key];
        q.choices.forEach(text=>{const lab=node("label"),input=node("input");input.type="radio";input.name=q.key;input.value=text;input.checked=answers[q.key]===text;input.addEventListener("change",()=>{answers[q.key]=text;btn.disabled=false;});lab.append(input,node("span",text));grid.append(lab);});
        field.append(grid);mount.append(field);const actions=node("div");actions.className="quiz-actions";actions.append(btn);
        btn.addEventListener("click",()=>{if(!answers[q.key])return;step++;if(step===questions.length)conversion("quiz_complete");draw();mount.querySelector("h2")?.focus({preventScroll:true});});
        if(step>0){const back=node("button","Volver");back.type="button";back.className="btn btn-quiet";back.addEventListener("click",()=>{step--;draw();});actions.append(back);}
        mount.append(actions);title.tabIndex=-1;return;
      }
      const byArea=programs.filter(p=>p.area===answers.quizArea);
      const exact=byArea.filter(p=>answers.quizFamily==="Quiero explorar ambos"||p.family===answers.quizFamily);
      const pool=[...(exact.length?exact:byArea)];
      if(answers.timeframe==="Próxima convocatoria"){const order={"Inscripción disponible":0,"Consultar convocatoria":1,"Inscripciones cerradas":2};pool.sort((a,b)=>(order[a.admissionsStatus]??1)-(order[b.admissionsStatus]??1));}
      const results=pool.slice(0,3);
      const title=node("h2",results.length?"Tu selección de maestrías":"Explora las maestrías");title.tabIndex=-1;mount.append(title);
      const explanation=exact.length?"Estas opciones coinciden con el área y el formato que elegiste.":byArea.length?"Estas opciones coinciden con tu área. Consulta con admisiones si hay una convocatoria en el formato que prefieres.":"El catálogo disponible no contiene programas con esa combinación.";
      mount.append(node("p",explanation));
      const grid=node("div");grid.className="quiz-results";
      results.forEach(p=>{const a=node("a");a.href=urlFor(p);a.append(node("span",p.area),node("strong",p.title),node("span",[p.family,p.mode,p.duration,p.admissionsStatus].filter(Boolean).join(" · ")));grid.append(a);});mount.append(grid);
      const cta=choice(mount,"Conversar sobre mis resultados",leadUrl("orientacion",results[0]?.slug));cta.addEventListener("click",()=>save("quiz",{...answers,quizResult:results[0]?.slug||""}));
      const actions=node("div");actions.className="quiz-actions";const restart=node("button","Repetir el test");restart.className="btn btn-quiet";restart.type="button";restart.addEventListener("click",()=>{step=0;for(const k of Object.keys(answers))delete answers[k];draw();});actions.append(restart);mount.append(actions);
    };draw();
  }

  const finance=el("finance-form");
  if(finance){
    const prog=el("finance-program"),price=el("investment"),down=el("initial"),months=el("months"),rate=el("rate"),cta=el("finance-cta"),share=el("share-finance");
    let scenario=null,recorded=false;
    if(lookup.has(params.get("programa")))prog.value=params.get("programa");
    const calculate=()=>{
      const total=price.valueAsNumber,initial=down.valueAsNumber,n=months.valueAsNumber,apr=rate.valueAsNumber;
      down.setCustomValidity(Number.isFinite(total)&&initial>total?"El aporte inicial no puede superar la inversión total.":"");
      const valid=[price,down,months,rate].every(i=>i.validity.valid);
      const r=apr/1200,principal=total-initial;
      const out=valid?(r===0?principal/n:principal*r/-Math.expm1(-n*Math.log1p(r))):NaN;
      el("monthly").textContent=Number.isFinite(out)?money(out):"—";
      el("financial-note").textContent=Number.isFinite(out)?"Capital financiado: "+money(principal)+" · Interés total estimado: "+money(Math.max(0,out*n-principal)):(down.validationMessage||"Ingresa un monto y revisa el plazo y la tasa.");
      cta.href=leadUrl("simulador",prog.value);
      scenario=Number.isFinite(out)?{investment:total,initial,months:n,annualRate:apr}:null;
    };
    const pick=()=>{const p=lookup.get(prog.value);price.value=typeof p?.price==="number"?String(p.price):"";el("price-hint").textContent=typeof p?.price==="number"?"Valor publicado en la ficha del programa. Puedes ajustarlo a tu cotización.":"Utiliza una cotización vigente de admisiones.";calculate();};
    const track=()=>{if(scenario&&!recorded){conversion("calculator_use");recorded=true;}};
    prog.addEventListener("change",()=>{pick();track();});[price,down,months,rate].forEach(i=>i.addEventListener("input",()=>{calculate();track();}));
    cta.addEventListener("click",()=>{if(share.checked && scenario)save("finance",scenario);else remove("finance");});
    finance.addEventListener("submit",e=>e.preventDefault());pick();
  }

  const lead=el("lead-form");
  if(lead){
    const input=lead.elements,phone=input.namedItem("phone"),voice=input.namedItem("consentVoice"),whatsapp=input.namedItem("consentWhatsapp"),program=input.namedItem("program");
    const knownSources=["programa","navegacion","acceso-rapido","pie","preguntas","guia","asistente","simulador","orientacion","comparador","directo"];
    const proposed=params.get("origen");const source=knownSources.includes(proposed)?proposed:"directo";
    const chosen=params.get("programa");if(lookup.has(chosen))program.value=chosen;
    const context={};
    const preview=el("context-preview");
    if(source==="orientacion"){const quiz=read("quiz");if(quiz){Object.assign(context,quiz);preview.textContent="Tu consulta incluirá el área, el formato, el plazo y la recomendación de tu test.";preview.hidden=false;}}
    if(source==="simulador"){const calc=read("finance");if(calc){Object.assign(context,calc);preview.textContent="Tu consulta incluirá el escenario de inversión que elegiste compartir.";preview.hidden=false;}}
    if(source==="comparador"){const list=read("compare");if(Array.isArray(list)){context.comparedPrograms=list.filter(x=>lookup.has(x)).slice(0,3);preview.textContent="Tu consulta incluirá las maestrías que comparaste.";preview.hidden=false;}}
    const phoneValidation = () => {
      phone.required = voice.checked || whatsapp.checked;
      const need = el("phone-requirement");
      if (need) need.textContent = phone.required ? "(para las preferencias que marcaste)" : "(opcional)";
      const raw = phone.value.trim();
      phone.setCustomValidity((phone.required || raw) && !/^\+?[\d\s().-]{7,23}$/.test(raw)
        ? "Ingresa un teléfono válido con código de país." : "");
    };
    phone.addEventListener("input",phoneValidation);voice.addEventListener("change",phoneValidation);whatsapp.addEventListener("change",phoneValidation);
    let idempotency=null,signature="",pending=false;
    lead.addEventListener("submit",async e=>{
      e.preventDefault();phoneValidation();if(!lead.reportValidity()||pending)return;
      const allowAttribution = attributionAllowed();
      if (!allowAttribution) remove("campaign");
      const submittedContext = {...context, ...(allowAttribution ? campaignData(read("campaign")) : {})};
      if (allowAttribution && source === "programa" && params.get("cta") === "principal" && lookup.has(program.value)) {
        try {
          const variant = sessionStorage.getItem("ucg-hub-experiment-" + program.value);
          if (sessionStorage.getItem("ucg-last-hub-click") === program.value && (variant === "A" || variant === "B")) submittedContext.hubVariant = variant;
        } catch {}
      }
      const body={name:input.namedItem("name").value.trim(),email:input.namedItem("email").value.trim(),phone:phone.value.trim(),program:program.value,source,consentEmail:input.namedItem("consentEmail").checked,consentVoice:voice.checked,consentWhatsapp:whatsapp.checked,context:submittedContext};
      const json=JSON.stringify(body);if(json!==signature){idempotency=globalThis.crypto?.randomUUID?.() || null;signature=json;}
      const error=el("lead-error"),submit=lead.querySelector("[type=submit]");error.hidden=true;pending=true;submit.disabled=true;submit.textContent="Enviando…";
      try{
        const response=await fetch("/api/leads",{method:"POST",headers:{"Content-Type":"application/json",...(idempotency?{"Idempotency-Key":idempotency}:{})},body:json});
        const data=await response.json();
        if(!response.ok||data.ok===false)throw new Error(data.error||"No pudimos registrar tu consulta.");
        lead.hidden=true;const success=el("lead-success");success.hidden=false;const selected=lookup.get(body.program);
        if(selected){const next=success.querySelector("a");next.href=urlFor(selected);next.textContent="Revisar mi programa";const text=success.querySelector("p");const follow=node("p",selected.admissionsStatus==="Inscripciones cerradas"?"Mientras preparas la próxima convocatoria, revisa la malla y anota las asignaturas que te interesan.":"Mientras tanto, revisa las asignaturas y prepara tus preguntas sobre "+selected.title+".");text.after(follow);}
        success.tabIndex=-1;success.focus();conversion("lead_created");
      }catch(err){error.textContent=(err instanceof TypeError||err instanceof SyntaxError)?"No pudimos conectar con admisiones. Tus datos siguen aquí. Intenta nuevamente.":err.message;error.hidden=false;}
      finally{pending=false;submit.disabled=false;submit.textContent="Enviar mi consulta";}
    });
  }

  const launch=el("chat-launch"),panel=el("chat-panel"),chat=el("chat-form"),log=el("chat-log"),msg=el("chat-msg");
  let chatUsed=false,sending=false,chatProgram="",previousQuestion="";
  const toggleChat=open=>{panel.hidden=!open;launch.hidden=open;launch.setAttribute("aria-expanded",String(open));if(open){msg.focus();if(!chatUsed){conversion("chat_open");chatUsed=true;}}else launch.focus();};
  launch?.addEventListener("click",()=>toggleChat(true));el("chat-close")?.addEventListener("click",()=>toggleChat(false));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&panel&&!panel.hidden)toggleChat(false);});
  const say=(text,mine)=>{const p=node("p",text);p.className=mine?"chat-question":"chat-answer";log.append(p);log.scrollTop=log.scrollHeight;return p;};
  chat?.addEventListener("submit",async e=>{
    e.preventDefault();
    const text=msg.value.trim();if(!text||sending)return;msg.value="";el("chat-options").hidden=true;say(text,true);
    const answer=say("Consultando el catálogo…",false);sending=true;chat.querySelector("button").disabled=true;
    try {
      const segment=location.pathname.split("/");const slug=segment[1]==="programas"?segment[2]:params.get("programa");
      const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,program:chatProgram || (lookup.has(slug)?slug:""),previousQuestion})});
      const data=await response.json();answer.textContent=response.ok&&typeof data.answer==="string"?data.answer:data.error||"No pude responder ahora. Puedes consultar al equipo de admisiones.";
      if(response.ok){
        previousQuestion=text;chatProgram=lookup.has(data.contextProgram)?data.contextProgram:"";
        const links=Array.isArray(data.links)?data.links:[];
        links.slice(0,3).forEach(item=>{if(typeof item?.url!=="string"||!item.url.startsWith("/programas/")||!lookup.has(item.url.slice("/programas/".length)))return;const a=node("a",item.title);a.href=item.url;a.className="chat-program";answer.append(a);});
      }
    } catch {answer.textContent="No pude conectar con el asistente. Puedes volver a intentarlo o hablar con admisiones.";}
    finally{sending=false;chat.querySelector("button").disabled=false;log.scrollTop=log.scrollHeight;}
  });
  el("chat-options")?.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{if(!sending){msg.value=b.textContent;chat.requestSubmit();}}));
})();
