(() => {
  "use strict";
  const endpoint = "/api/editorial/insights";
  const mounted = new WeakSet();
  const formatter = new Intl.NumberFormat("es-EC", {maximumFractionDigits: 2});
  const usd = new Intl.NumberFormat("es-EC", {style:"currency",currency:"USD"});
  const measured = value => typeof value === "number" && Number.isFinite(value);
  const fold = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const counted = (n, singular, plural) => formatter.format(n) + " " + (n === 1 ? singular : plural);
  const typeName = row => row.kind === "guia" ? "Guía" : "Ficha de maestría";
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(label, className, action) {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  function options(select, pairs, value) {
    select.replaceChildren(...pairs.map(([v, label]) => new Option(label, v)));
    select.value = value;
  }
  function pageLink(row) {
    if (typeof row.url !== "string" || !/^\/(?:programas|guias)\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(row.url)) return null;
    const link = element("a","si-page-link","Abrir página");
    link.href = row.url;
    return link;
  }
  const groups = [
    ["Actividad en el portal", [["views","Vistas"],["ctaClicks","Clics en admisiones"],["leads","Consultas atribuidas"],["appointments","Citas atribuidas"],["enrollments","Matrículas atribuidas"]]],
    ["Búsqueda orgánica · Search Console", [["clicks","Clics desde Google"],["impressions","Impresiones"],["ctr","CTR"],["position","Posición media"]]],
    ["Estimaciones de OpenSEO · Ecuador", [["searchVolume","Búsquedas al mes"],["keywordDifficulty","Dificultad SEO"],["cpc","Costo por clic"],["competition","Competencia publicitaria (0–1)"]]]
  ];
  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "") : new Intl.DateTimeFormat("es-EC",{dateStyle:"medium",timeZone:"UTC"}).format(date);
  }
  function amount(key, value) {
    if (!measured(value)) return "Sin dato";
    if (key === "cpc") return usd.format(value);
    if (key === "ctr") return formatter.format(value * 100) + " %";
    return formatter.format(value);
  }
  function mount(root) {
    if (mounted.has(root)) return;
    mounted.add(root);
    root.classList.add("seo-investigation");
    const staff = root.dataset.seoInsights === "staff";
    root.innerHTML = `<header class="si-head"><div><h2>Hallazgos SEO</h2><p>${staff ? "Compara la demanda de búsqueda en Ecuador con la actividad registrada en cada guía y ficha de maestría." : "Investiga qué se busca en Ecuador y qué guías y maestrías se relacionan con esas consultas. El rendimiento del portal está disponible en el espacio del equipo."}</p><button type="button" class="si-shortcut" data-jump disabled>Preguntar a la IA</button></div><label class="si-period" ${staff ? "" : "hidden"}>Actividad del portal<select data-period><option value="7">Últimos 7 días</option><option value="30" selected>Últimos 30 días</option><option value="90">Últimos 90 días</option></select></label></header>
      <div class="si-status" data-load role="status"></div><div data-dashboard hidden>
      <div class="si-summary" data-summary></div><div class="si-body">
      <section class="si-explorer"><h3>Explorar páginas</h3>
        <div class="si-filters"><label>Buscar por título o consulta<input data-search type="search" placeholder="Ej. inteligencia artificial"></label>
        <label>Programa<select data-program></select></label><label>Tipo de página<select data-kind><option value="">Todos los tipos</option><option value="programa">Ficha de maestría</option><option value="guia">Guía</option></select></label>
        <label>Ordenar por<select data-sort><option value="searchVolume">Mayor demanda de búsqueda</option>${staff ? '<option value="views">Más vistas en el portal</option>' : ""}<option value="title">Título</option></select></label></div>
        <p class="si-count" data-count role="status"></p>
        <div data-list class="si-list"></div><div data-pager class="si-pager"></div></section>
      <section data-detail class="si-detail" hidden></section>
      <section class="si-analysis"><div class="si-analysis-head"><h3>Interpretar los hallazgos</h3><p data-scope></p></div>
        <form data-ask><label>Pregunta sobre estos datos<textarea data-question rows="2" maxlength="350" placeholder="¿Qué página debería revisar primero y qué cifras justifican esa elección?"></textarea></label>
        <button type="submit" class="si-primary">Analizar con IA</button></form>
        <div data-answer role="status" aria-live="polite"></div></section></div></div>`;
    const get = name => root.querySelector("[data-" + name + "]");
    const period = get("period"), search = get("search"), kind = get("kind"), program = get("program"), sort = get("sort");
    const detail = get("detail"), answer = get("answer"), submit = get("ask").querySelector("button");
    let rows = [], visible = [], current = null, compared = null, page = 0, loadSeq = 0, querySeq = 0, pending;
    const pageSize = 6;
    const scope = () => current ? [current,compared].filter(Boolean) : visible;
    function invalidate() {
      querySeq++;
      pending?.abort();
      answer.replaceChildren();
      submit.textContent = "Analizar con IA";
      submit.disabled = !visible.length;
      get("scope").textContent = current ? (compared ? "Comparación de las dos páginas seleccionadas." : "Página seleccionada · " + current.title) : "Alcance · " + visible.length + (visible.length === 1 ? " página filtrada." : " páginas filtradas.");
    }
    function summary() {
      const measuredViews = rows.filter(row => measured(row.metrics.views));
      const keywords = new Set(rows.flatMap(row => (row.keywords?.length ? row.keywords : [{keyword:row.keyword,searchVolume:row.metrics.searchVolume}]).filter(k=>k.keyword && measured(k.searchVolume)).map(k=>fold(k.keyword))));
      const top = rows.reduce((best,row) => row.keyword && measured(row.metrics.searchVolume) && (!best || row.metrics.searchVolume > best.metrics.searchVolume) ? row : best, null);
      const entries = [
        [rows.length, rows.length === 1 ? "Página para investigar" : "Páginas para investigar", counted(rows.filter(r=>r.kind==="guia").length, "guía", "guías") + " · " + counted(rows.filter(r=>r.kind==="programa").length, "ficha", "fichas")],
        staff ? [measuredViews.length ? formatter.format(measuredViews.reduce((n,r)=>n+r.metrics.views,0)) : "Sin dato", "Vistas registradas", counted(measuredViews.length,"página con medición","páginas con medición") + " · " + period.value + " días"] : [top ? formatter.format(top.metrics.searchVolume) : "Sin dato","Mayor demanda mensual",top ? "Consulta · "+top.keyword : "Sin estimaciones de volumen"],
        [keywords.size, keywords.size === 1 ? "Consulta con volumen" : "Consultas con volumen", "Términos distintos vinculados a las páginas"]
      ];
      get("summary").replaceChildren(...entries.map(([value,label,hint])=>{
        const box = element("div");box.append(element("span","si-stat-label",label),element("strong",null,value),element("small",null,hint));return box;
      }));
    }
    function selectRow(row, focus = false) {
      current = row; compared = null;
      invalidate(); list(); details();
      if (focus) detail.querySelector("h3")?.focus();
    }
    function filter() {
      const term = fold(search.value.trim());
      visible = rows.filter(r => (!program.value || r.program === program.value) && (!kind.value || r.kind === kind.value) && (!term || fold([r.title,r.keyword,r.program,...(r.keywords||[]).map(k=>k.keyword)].join(" ")).includes(term)));
      visible.sort((a,b) => {
        if (sort.value !== "title") {
          const left = a.metrics[sort.value], right = b.metrics[sort.value];
          if (measured(left) !== measured(right)) return measured(left) ? -1 : 1;
          if (measured(left) && left !== right) return right-left;
        }
        return a.title.localeCompare(b.title,"es");
      });
      page = 0;
      if (!visible.includes(current)) current = null;
      if (!current || !visible.includes(compared)) compared = null;
      invalidate();list();details();
    }
    function list() {
      const start = page*pageSize;
      get("count").textContent = !visible.length ? "No hay páginas que coincidan con los filtros." : start+1===visible.length ? `Página ${start+1} de ${visible.length}.` : `Páginas ${start+1}–${Math.min(start+pageSize,visible.length)} de ${visible.length}.`;
      get("list").replaceChildren(...visible.slice(start,start+pageSize).map(row=>{
        const item = button("", "si-row", ()=>selectRow(row,true));
        item.setAttribute("aria-pressed", String(row === current));
        const copy = element("span","si-row-title");
        copy.append(element("small",null,typeName(row)),element("strong",null,row.title));
        const key = sort.value === "views" ? "views" : "searchVolume";
        const data = element("span","si-row-value");
        data.append(element("strong",null,amount(key,row.metrics[key])),element("small",null,key === "views" ? "vistas" : "búsq./mes"));
        item.append(copy,data);return item;
      }));
      const pager = get("pager");pager.replaceChildren();
      if (visible.length > pageSize) {
        const prev = button("Anterior","si-secondary",()=>{page--;list();get("pager").querySelector("button:not(:disabled)")?.focus()});
        const next = button("Siguiente","si-secondary",()=>{page++;list();get("pager").querySelector("button:not(:disabled)")?.focus()});
        prev.disabled = page === 0;next.disabled = start+pageSize >= visible.length;pager.append(prev,next);
      }
    }
    function details() {
      detail.replaceChildren();detail.hidden = !current;
      if (!current) return;
      const head = element("div","si-detail-head"), title = element("h3",null,"Evidencia de la página"); title.tabIndex=-1;
      head.append(title,button("Quitar selección","si-secondary",()=>{selectRow(null);search.focus()}));
      detail.append(head);
      const selected = [current,compared].filter(Boolean);
      const compareLabel = element("label","si-compare","Comparar con otra página");
      const compareSelect = element("select");
      options(compareSelect,[["","Elegir otra página"],...visible.filter(r=>r!==current).map(r=>[r.id,r.title])],compared?.id || "");
      compareSelect.addEventListener("change",()=>{compared=visible.find(r=>r.id===compareSelect.value)||null;invalidate();details();detail.querySelector("select")?.focus()});
      compareLabel.append(compareSelect);detail.append(compareLabel);
      const grid = element("div","si-pair");grid.dataset.count=String(selected.length);
      for (const row of selected) {
        const article = element("article","si-page");
        article.append(element("small","si-type",typeName(row)),element("h4",null,row.title));
        const link=pageLink(row);if (link) article.append(link);
        for (let i=0;i<groups.length;i++) {
          if (!staff && i < 2) continue;
          const [label,metrics] = groups[i];
          const group=element("div","si-metric-group");
          group.append(element("h5",null,label));
          if (i===2 && row.keyword) group.append(element("p","si-hint","Consulta de referencia · “"+row.keyword+"”"));
          const present=metrics.some(([key])=>measured(row.metrics[key]));
          if (present) {
            const dl=element("dl","si-metrics");
            for (const [key,caption] of metrics) {
              const pair=element("div");pair.append(element("dt",null,caption),element("dd",null,amount(key,row.metrics[key])));dl.append(pair);
            }
            group.append(dl);
            if (i===2) {
              group.append(element("p","si-hint","La demanda mensual corresponde a la consulta en Ecuador. "+
                [row.source,row.observedAt && dateLabel(row.observedAt)].filter(Boolean).join(" · ")));
            }
          } else {
            group.append(element("p","si-hint",["Medición del portal sin datos disponibles para esta página y periodo.","Sin medición de Google para esta URL y periodo.","Sin estimación disponible para esta página."][i]));
          }
          if (i===0 && row.previous) {
            const previous=row.previous;
            const changes=[["views","Vistas"],["ctaClicks","Clics en admisiones"]].filter(([key])=>measured(row.metrics[key]) && measured(previous[key]));
            if (changes.length) {
              const note=element("div","si-observation");
              note.append(element("strong",null,"Cambio frente al periodo anterior"),element("p","si-hint",[previous.start,previous.end].filter(Boolean).map(dateLabel).join(" – ")));
              for (const [key,label] of changes) {
                const delta=row.metrics[key]-previous[key];
                note.append(element("p",null,label+" · "+formatter.format(previous[key])+" antes, "+formatter.format(row.metrics[key])+" ahora ("+(delta>0?"+":"")+formatter.format(delta)+")"));
              }
              group.append(note);
            }
          }
          if (i===1 && row.searchObservation) {
            const observation=row.searchObservation;
            const obs=element("div","si-observation");
            obs.append(element("strong",null,"Consulta observada · "+observation.keyword),
              element("p","si-hint",observation.url),element("p","si-hint",[observation.periodStart,observation.periodEnd].filter(Boolean).map(dateLabel).join(" – ")),
              element("p",null,metrics.filter(([key])=>measured(observation[key])).map(([key,label])=>label+" "+amount(key,observation[key])).join(" · ")));
            group.append(obs);
          }
          if (i===2 && row.keywords?.length) {
            const more=element("details","si-keywords");
            more.append(element("summary",null,row.keywords.length===1 ? "Ver consulta y fuente (1)" : "Ver consultas y fuentes ("+row.keywords.length+")"));
            for (const k of row.keywords) {
              const record=element("div","si-observation");
              record.append(element("strong",null,k.keyword),
                element("p",null,metrics.map(([key,name])=>name+" · "+amount(key,k[key])).join(" | ")),
                element("small","si-hint",[k.source,k.observedAt && dateLabel(k.observedAt)].filter(Boolean).join(" · ")));
              more.append(record);
            }
            group.append(more);
          }
          article.append(group);
        }
        grid.append(article);
      }
      detail.append(grid);
    }
    async function readData(body, signal) {
      if (staff) {
        if (typeof window.ucgSeoStaffRequest !== "function") throw new Error("La sesión del equipo no está disponible.");
        return window.ucgSeoStaffRequest(Number(period.value), body);
      }
      const url = body ? endpoint : endpoint + "?days=" + encodeURIComponent(period.value);
      const response = await fetch(url, body
        ? {method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(body),signal}
        : {credentials:"same-origin",signal});
      if (!response.ok) throw new Error(response.status === 429 ? "Has alcanzado el límite de análisis. Intenta de nuevo más tarde." : "No se pudo consultar el motor editorial.");
      return response.json();
    }
    function showAnalysis(result) {
      const findings = Array.isArray(result?.findings) ? result.findings : [];
      const generated = result?.mode === "modelo";
      const heading = element("h4",null,generated ? "Interpretación de IA" : "Lectura descriptiva");
      answer.replaceChildren(heading);
      if (!generated) {
        const reason = result.reason === "sin_datos" ? "Faltan datos observados para interpretar esta selección." : "La interpretación del modelo no está disponible. La lectura descriptiva se basa en las cifras registradas.";
        answer.append(element("p","si-hint",reason));
      }
      for (const finding of findings) {
        const card=element("article","si-finding");card.append(element("h5",null,finding.title),element("p",null,finding.interpretation));
        if (finding.nextStep) card.append(element("h6",null,"Siguiente paso"),element("p",null,finding.nextStep));
        const references = Array.isArray(finding.references)
          ? finding.references.filter(ref => typeof ref?.id === "string" && typeof ref.statement === "string" && ref.statement.trim())
          : [];
        const ids=new Set(references.length ? references.map(ref=>ref.id) : (Array.isArray(finding.evidenceIds)?finding.evidenceIds:[]));
        const sources=scope().filter(r=>ids.has(r.id));
        if (sources.length) {
          const cites=element("div","si-cites");cites.append(element("strong",null,"Revisar evidencia"));
          for (const row of sources) {
            const citation=element("details","si-keywords");
            citation.append(element("summary","si-citation",row.title));
            if (references.length) {
              const statements = new Set(references.filter(ref=>ref.id===row.id).map(ref=>ref.statement));
              for (const text of statements) citation.append(element("p",null,text));
            } else {
              for (let i=0;i<groups.length;i++) {
                if (!staff && i<2) continue;
                const [name,fields]=groups[i];
                const values=fields.filter(([key])=>measured(row.metrics[key])).map(([key,label])=>label+" · "+amount(key,row.metrics[key]));
                if (values.length) citation.append(element("strong","si-type",name),element("p",null,values.join(" | ")));
              }
              if (row.keyword) citation.append(element("p","si-hint","Consulta de referencia · "+row.keyword));
            }
            const link=pageLink(row);if(link)citation.append(link);
            citation.append(button("Investigar esta página","si-secondary",()=>selectRow(row,true)));
            cites.append(citation);
          }
          card.append(cites);
        }
        answer.append(card);
      }
      if (!findings.length && generated) answer.append(element("p",null,"No hay hallazgos para esta selección."));
    }
    async function analyze(event) {
      event.preventDefault();
      const selected=scope();
      if (!selected.length || submit.disabled) return;
      const ids = selected.length===rows.length && !current ? [] : selected.map(r=>r.id);
      if (ids.length>100) {answer.textContent="Acota la búsqueda a 100 páginas o menos para analizar esta selección.";return;}
      const question = get("question").value.trim() || (compared ? "¿Qué diferencias tienen estas dos páginas y qué debería investigar a continuación?" : "¿Qué hallazgos justifican las cifras disponibles y qué debería investigar a continuación?");
      const seq=++querySeq;
      pending?.abort();pending=new AbortController();
      submit.disabled=true;submit.textContent="Analizando…";answer.textContent="Consultando los datos de esta selección…";
      try {
        const result=await readData({days:Number(period.value),question,ids},pending.signal);
        if (seq===querySeq && root.isConnected) showAnalysis(result);
      } catch(error) {
        if (seq===querySeq && root.isConnected) answer.textContent=error.message || "No se pudo completar el análisis. Intenta de nuevo.";
      } finally {
        if (seq===querySeq) {submit.disabled=false;submit.textContent="Analizar con IA";}
      }
    }
    async function loadRows() {
      const seq=++loadSeq;
      invalidate();get("jump").disabled=true;get("dashboard").hidden=true;get("load").textContent="Consultando las fuentes editoriales…";
      try {
        const response=await readData();
        if (seq!==loadSeq || !root.isConnected) return;
        if (!Array.isArray(response?.rows)) throw new Error("La respuesta del motor editorial está incompleta.");
        rows=response.rows.filter(r=>r && typeof r.id==="string" && typeof r.title==="string" && r.metrics && ["guia","programa"].includes(r.kind));
        const programs=new Map();
        for (const r of rows) if (r.program && (r.kind==="programa" || !programs.has(r.program))) programs.set(r.program,r.kind==="programa"?r.title:r.program.replaceAll("-"," "));
        const prev=program.value;
        options(program,[["","Todos los programas"],...Array.from(programs).sort((a,b)=>a[1].localeCompare(b[1],"es"))],programs.has(prev)?prev:"");
        const currentId=current?.id, comparedId=compared?.id;
        current=rows.find(r=>r.id===currentId)||null;compared=rows.find(r=>r.id===comparedId)||null;
        summary();filter();get("load").replaceChildren();get("dashboard").hidden=false;get("jump").disabled=!rows.length;
      } catch(error) {
        if (seq!==loadSeq || !root.isConnected) return;
        get("load").replaceChildren(element("p",null,error.message || "No se pudieron cargar las observaciones."),button("Volver a intentar","si-secondary",loadRows));
      }
    }
    get("jump").addEventListener("click",()=>get("question").focus());
    period.addEventListener("change",loadRows);
    search.addEventListener("input",filter);
    for (const field of [kind,sort,program]) field.addEventListener("change",filter);
    get("ask").addEventListener("submit",analyze);
    loadRows();
  }
  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches("[data-seo-insights]")) mount(node);
    node.querySelectorAll("[data-seo-insights]").forEach(mount);
  }
  scan(document.documentElement);
  const observer = new MutationObserver(records=>{
    for (const record of records) for (const added of record.addedNodes) scan(added);
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();
