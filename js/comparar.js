/* =====================================================================
   BI Paraná — Comparar candidatos no mapa, com os votos REAIS da apuração (TSE)

   Fonte: mesmos arquivos oficiais da página de Apuração (resultados.tse.jus.br, CORS liberado):
     estado:    <cd>/dados/<uf>/<uf>-c<cargo>-e<cd 6d>-u.jws           (lista de candidatos + total)
     município: <cd>/dados/pr/pr<cód TSE>-c<cargo>-e<cd 6d>-u.jws      (votos naquele município)
     andamento: <cd>/dados/pr/pr-e<cd 6d>-ab.jws                       (seções totalizadas dos 399 municípios, ~12 KB)
   Pra não baixar 399 arquivos a cada 30 s, só rebaixa o arquivo de um município quando o número de
   seções totalizadas dele (abr[].s.st) mudou desde a última vez.
   ===================================================================== */
(() => {
  const BASE = "https://resultados.tse.jus.br/oficial/ele2026";
  const CARGOS = {
    presidente:  { codigo: "1", nome: "Presidente",        cd: "6257", cd2: "6258", uf: "br" },
    governador:  { codigo: "3", nome: "Governador",        cd: "6259", cd2: "6260", uf: "pr" },
    senador:     { codigo: "5", nome: "Senador",           cd: "6259", cd2: null,   uf: "pr" },
    depfederal:  { codigo: "6", nome: "Deputado Federal",  cd: "6259", cd2: null,   uf: "pr" },
    depestadual: { codigo: "7", nome: "Deputado Estadual", cd: "6259", cd2: null,   uf: "pr" }
  };
  const TURNO2 = window.APURACAO_TURNO2 || {};
  const cdAtual = k => (TURNO2[k] && CARGOS[k].cd2) ? CARGOS[k].cd2 : CARGOS[k].cd;

  const ESCALA_A = ["#1e2740", "#1e3a8a", "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa"];
  const ESCALA_B = ["#1e2740", "#7c2d12", "#9a3412", "#c2410c", "#ea580c", "#f97316"];
  const COR_EMPATE = "#4b5563", COR_SEM_DADO = "#1e2740";

  const $ = s => document.querySelector(s);
  const fmtN = n => new Intl.NumberFormat("pt-BR").format(Math.round(n || 0));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const numInt = v => Number(String(v ?? "").replace(/\D/g, "")) || 0;
  const fmtPct = n => (Number(n) || 0).toFixed(2).replace(".", ",") + "%";
  const numBR = v => { const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : 0; };

  /* ---------- Acesso ao TSE ---------- */
  function decodeJWS(texto) {
    const t = texto.trim();
    if (t.startsWith("{")) return JSON.parse(t);
    let p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (p.length % 4) p += "=";
    return JSON.parse(new TextDecoder("utf-8").decode(Uint8Array.from(atob(p), c => c.charCodeAt(0))));
  }
  async function buscar(url) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(url + "?nocache=" + Date.now(), { signal: ctrl.signal });
      if (!r.ok) return { json: null, erro: r.status === 404 ? "ainda não publicado pelo TSE" : "TSE respondeu HTTP " + r.status };
      return { json: decodeJWS(await r.text()), erro: null };
    } catch (e) {
      return { json: null, erro: e.name === "AbortError" ? "o TSE demorou demais" : "falha de conexão com o TSE" };
    } finally { clearTimeout(timer); }
  }
  const cd6 = k => cdAtual(k).padStart(6, "0");
  const c4 = k => CARGOS[k].codigo.padStart(4, "0");
  const urlEstado = k => `${BASE}/${cdAtual(k)}/dados/${CARGOS[k].uf}/${CARGOS[k].uf}-c${c4(k)}-e${cd6(k)}-u.jws`;
  const urlAb = k => `${BASE}/${cdAtual(k)}/dados/pr/pr-e${cd6(k)}-ab.jws`;
  const urlMun = (k, cod) => `${BASE}/${cdAtual(k)}/dados/pr/pr${cod}-c${c4(k)}-e${cd6(k)}-u.jws`;

  function candidatosDe(json) {
    const out = [];
    const carg = json && json.carg && json.carg[0];
    ((carg && carg.agr) || []).forEach(agr => (agr.par || []).forEach(par => (par.cand || []).forEach(c => {
      out.push({ numero: String(c.n), nome: c.nmu || c.nm || "?", partido: par.sg || "", votos: numInt(c.vap), pct: numBR(c.pvap) });
    })));
    return out;
  }

  /* ---------- Estado ---------- */
  const TSE_POR_IBGE = {};
  Object.entries(window.TSE_MUN_PR || {}).forEach(([tse, ibge]) => { TSE_POR_IBGE[ibge] = tse; });
  const IBGE_POR_TSE = window.TSE_MUN_PR || {};

  let cargoKey = "governador", numA = "", numB = "";
  const porCargo = {};      // porCargo[k] = { cands, estado, ab:{cod:{st,pst}}, mun:{cod:{st,votos:{numero:n}}}, carregandoMun:0 }
  let geo = null, mapa = null, camada = null, legenda = null;
  const layerPorIbge = {};
  let gen = 0, timer = null, ocupado = false;

  const cand = n => ((porCargo[cargoKey] || {}).cands || []).find(c => c.numero === n);
  const rotulo = c => `${c.nome} — ${c.partido} (${c.numero})`;

  /* ---------- Mapa ---------- */
  async function carregarGeo() {
    if (geo) return geo;
    try { const c = localStorage.getItem("geo_pr_v1"); if (c) { geo = JSON.parse(c); return geo; } } catch (e) {}
    const r = await fetch("https://servicodados.ibge.gov.br/api/v3/malhas/estados/41?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio");
    geo = await r.json();
    try { localStorage.setItem("geo_pr_v1", JSON.stringify(geo)); } catch (e) {}
    return geo;
  }
  function votosMun(ibge) {
    const d = (porCargo[cargoKey] || {}).mun || {};
    const m = d[TSE_POR_IBGE[ibge]];
    if (!m) return null;
    return { a: m.votos[numA] || 0, b: m.votos[numB] || 0, pa: (m.pcts && m.pcts[numA]) || 0, pb: (m.pcts && m.pcts[numB]) || 0 };
  }
  function corMargem(escala, margem) {
    return margem >= .6 ? escala[5] : margem >= .4 ? escala[4] : margem >= .25 ? escala[3] : margem >= .1 ? escala[2] : escala[1];
  }
  function corDe(ibge) {
    const v = votosMun(ibge);
    if (!v || !numA || !numB || (v.a === 0 && v.b === 0)) return COR_SEM_DADO;
    if (v.a === v.b) return COR_EMPATE;
    const margem = Math.abs(v.a - v.b) / (v.a + v.b);
    return v.a > v.b ? corMargem(ESCALA_A, margem) : corMargem(ESCALA_B, margem);
  }
  function tooltip(ibge) {
    const nome = (MUNI_BY_ID[ibge] || {}).nome || ibge;
    const ab = ((porCargo[cargoKey] || {}).ab || {})[TSE_POR_IBGE[ibge]];
    const pct = ab ? `<br><span style="opacity:.7">${ab.pst.toFixed(1).replace(".", ",")}% das seções apuradas</span>` : "";
    const a = cand(numA), b = cand(numB), v = votosMun(ibge);
    if (!a || !b) return `<b>${esc(nome)}</b>${pct}`;
    const tem = v && (v.a || v.b);
    return `<b>${esc(nome)}</b><br>${esc(a.nome)}: ${fmtN(v ? v.a : 0)}${tem ? " (" + fmtPct(v.pa) + ")" : ""}<br>${esc(b.nome)}: ${fmtN(v ? v.b : 0)}${tem ? " (" + fmtPct(v.pb) + ")" : ""}${pct}`;
  }
  async function iniciarMapa() {
    const g = await carregarGeo();
    mapa = L.map("mapa", { zoomControl: true, attributionControl: false, zoomSnap: .25 }).setView([-24.6, -51.5], 7);
    camada = L.geoJSON(g, {
      style: f => ({ fillColor: corDe(Number(f.properties.codarea)), weight: .6, color: "#0d1220", fillOpacity: .92 }),
      onEachFeature: (f, layer) => {
        const ibge = Number(f.properties.codarea);
        layerPorIbge[ibge] = layer;
        layer.bindTooltip(() => tooltip(ibge), { sticky: true });
        layer.on("mouseover", () => layer.setStyle({ weight: 2, color: "#fff" }));
        layer.on("mouseout", () => camada.resetStyle(layer));
      }
    }).addTo(mapa);
    mapa.fitBounds(camada.getBounds());
  }
  function desenharLegenda() {
    if (legenda) legenda.remove();
    const a = cand(numA), b = cand(numB);
    legenda = L.control({ position: "bottomright" });
    legenda.onAdd = () => {
      const d = L.DomUtil.create("div", "mapa-legenda");
      if (!a || !b) { d.innerHTML = "<b>Escolha os dois candidatos</b>"; return d; }
      const faixas = ["<10%", "10–25%", "25–40%", "40–60%", "≥60%"];
      d.innerHTML = `<b>${esc(a.nome)}</b> na frente<br>` + [5, 4, 3, 2, 1].map(i => `<i style="background:${ESCALA_A[i]}"></i>margem ${faixas[i - 1]}`).join("<br>")
        + `<br><br><b>${esc(b.nome)}</b> na frente<br>` + [1, 2, 3, 4, 5].map(i => `<i style="background:${ESCALA_B[i]}"></i>margem ${faixas[i - 1]}`).join("<br>")
        + `<br><br><i style="background:${COR_SEM_DADO}"></i>sem votos ainda`;
      return d;
    };
    legenda.addTo(mapa);
  }

  /* ---------- Resumo e rankings ---------- */
  function renderResumo() {
    const dc = porCargo[cargoKey] || {};
    const a = cand(numA), b = cand(numB);
    const totA = a ? a.votos : 0, totB = b ? b.votos : 0;
    let ganhaA = 0, ganhaB = 0, empate = 0;
    const linhasA = [], linhasB = [];
    Object.entries(dc.mun || {}).forEach(([cod, m]) => {
      if (!a || !b) return;
      const va = m.votos[numA] || 0, vb = m.votos[numB] || 0;
      if (!va && !vb) return;
      const pa = (m.pcts && m.pcts[numA]) || 0, pb = (m.pcts && m.pcts[numB]) || 0;
      const nome = (MUNI_BY_ID[IBGE_POR_TSE[cod]] || {}).nome || cod;
      if (va > vb) { ganhaA++; linhasA.push({ nome, va, vb, pa, pb }); } else if (vb > va) { ganhaB++; linhasB.push({ nome, va, vb, pa, pb }); } else empate++;
    });
    const codsMun = Object.keys(dc.ab || {}).filter(c => IBGE_POR_TSE[c]);
    const comDados = codsMun.filter(c => dc.ab[c].st > 0).length;
    const pctEstado = dc.estado && dc.estado.s ? numBR(dc.estado.s.pst) : 0;
    $("#cmp-cards").innerHTML = `
      <div class="card-kpi destaque"><div class="rotulo">${a ? esc(a.nome) : "Candidato A"}</div><div class="valor" style="color:#60a5fa">${fmtN(totA)}</div><div class="extra">${a ? esc(a.partido) + (totA ? " · " + fmtPct(a.pct) + " dos válidos" : "") : "—"} · votos no estado</div></div>
      <div class="card-kpi destaque" style="border-color:#f97316"><div class="rotulo">${b ? esc(b.nome) : "Candidato B"}</div><div class="valor" style="color:#f97316">${fmtN(totB)}</div><div class="extra">${b ? esc(b.partido) + (totB ? " · " + fmtPct(b.pct) + " dos válidos" : "") : "—"} · votos no estado</div></div>
      <div class="card-kpi"><div class="rotulo">Municípios na frente</div><div class="valor"><span style="color:#60a5fa">${ganhaA}</span> <span style="color:var(--tx3);font-size:14px">×</span> <span style="color:#f97316">${ganhaB}</span></div><div class="extra">${empate ? empate + " empate(s) · " : ""}A × B</div></div>
      <div class="card-kpi"><div class="rotulo">Apuração</div><div class="valor">${pctEstado.toFixed(1).replace(".", ",")}%</div><div class="extra">${comDados} de ${codsMun.length || 399} municípios com seções totalizadas</div></div>`;
    const tab = (lista, chave, cor) => lista.length
      ? `<table class="tab"><thead><tr><th>#</th><th>Município</th><th class="num">${esc(a ? a.nome : "A")}</th><th class="num">${esc(b ? b.nome : "B")}</th></tr></thead><tbody>${
        lista.sort((x, y) => (y[chave] - y[chave === "va" ? "vb" : "va"]) - (x[chave] - x[chave === "va" ? "vb" : "va"])).slice(0, 10)
          .map((l, i) => `<tr><td data-label="#">${i + 1}º</td><td data-label="Município"><b>${esc(l.nome)}</b></td><td class="num" data-label="${esc(a ? a.nome : "A")}" style="${chave === "va" ? "color:" + cor + ";font-weight:700" : ""}">${fmtN(l.va)} <small style="opacity:.7">${fmtPct(l.pa)}</small></td><td class="num" data-label="${esc(b ? b.nome : "B")}" style="${chave === "vb" ? "color:" + cor + ";font-weight:700" : ""}">${fmtN(l.vb)} <small style="opacity:.7">${fmtPct(l.pb)}</small></td></tr>`).join("")}</tbody></table>`
      : '<div class="vazio">Nenhum município ainda.</div>';
    $("#cmp-top-a").innerHTML = tab(linhasA, "va", "#60a5fa");
    $("#cmp-top-b").innerHTML = tab(linhasB, "vb", "#f97316");
    $("#cmp-top-a-titulo").textContent = a ? `Onde ${a.nome} abre mais vantagem` : "Onde A abre mais vantagem";
    $("#cmp-top-b-titulo").textContent = b ? `Onde ${b.nome} abre mais vantagem` : "Onde B abre mais vantagem";
  }
  function pintar() {
    if (!camada) return;
    camada.eachLayer(l => camada.resetStyle(l));
    desenharLegenda();
    renderResumo();
    $("#cmp-titulo-mapa").textContent = (cand(numA) && cand(numB)) ? `${cand(numA).nome} × ${cand(numB).nome} — ${CARGOS[cargoKey].nome}` : "Escolha os dois candidatos acima";
    const link = new URLSearchParams({ cargo: cargoKey, ...(numA ? { a: numA } : {}), ...(numB ? { b: numB } : {}) });
    try { history.replaceState(null, "", "?" + link.toString()); } catch (e) {}
  }

  /* ---------- Carregamento ---------- */
  async function pool(itens, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < itens.length) { await fn(itens[i++]); } }));
  }
  function status(txt) { $("#cmp-status").innerHTML = txt; }

  async function atualizar() {
    if (ocupado) return;
    ocupado = true;
    const minha = gen, k = cargoKey;
    $("#btn-cmp-atualizar").disabled = true;
    try {
      const dc = porCargo[k] || (porCargo[k] = { cands: [], estado: null, ab: {}, mun: {} });
      const [est, ab] = await Promise.all([buscar(urlEstado(k)), buscar(urlAb(k))]);
      if (est.json) { dc.estado = est.json; dc.cands = candidatosDe(est.json); }
      if (ab.json) {
        (ab.json.abr || []).forEach(x => { dc.ab[x.cdabr] = { st: numInt(x.s && x.s.st), pst: numBR(x.s && x.s.pst) }; });
      }
      if (minha !== gen) return;
      if (!est.json && !dc.cands.length) { status(`⚠️ Não foi possível carregar os candidatos (${esc(est.erro)}). Tentando de novo sozinho.`); return; }
      preencherLista();
      // só rebaixa os municípios cujas seções totalizadas mudaram
      const fila = Object.keys(dc.ab).filter(cod => IBGE_POR_TSE[cod] && dc.ab[cod].st > 0 && (!dc.mun[cod] || dc.mun[cod].st !== dc.ab[cod].st));
      let feitos = 0, falhas = 0, ultimaPintura = 0;
      if (fila.length) status(`Carregando votos dos municípios… 0/${fila.length}`);
      await pool(fila, 14, async cod => {
        const r = await buscar(urlMun(k, cod));
        if (r.json) {
          const votos = {}, pcts = {};
          candidatosDe(r.json).forEach(c => { votos[c.numero] = c.votos; pcts[c.numero] = c.pct; });
          dc.mun[cod] = { st: dc.ab[cod].st, votos, pcts };
        } else falhas++;
        feitos++;
        if (minha === gen && (feitos - ultimaPintura >= 25 || feitos === fila.length)) { ultimaPintura = feitos; status(`Carregando votos dos municípios… ${feitos}/${fila.length}`); pintar(); }
      });
      if (minha !== gen) return;
      pintar();
      const agora = new Date().toLocaleTimeString("pt-BR");
      const pct = dc.estado && dc.estado.s ? numBR(dc.estado.s.pst) : 0;
      status(pct > 0
        ? `Atualizado às ${agora} · ${pct.toFixed(1).replace(".", ",")}% das seções totalizadas${falhas ? ` · ${falhas} município(s) falharam, tentando de novo` : ""}`
        : `Conectado ao TSE (${agora}) — a apuração ainda não começou. O TSE só libera os votos depois que a votação termina em todo o país; o mapa se colore sozinho conforme os municípios forem totalizados.`);
      // município que falhou fica sem registro e é tentado de novo no próximo ciclo
    } finally {
      ocupado = false;
      $("#btn-cmp-atualizar").disabled = false;
    }
  }

  /* ---------- Seleção de candidatos ---------- */
  const textoParaNumero = {};
  function preencherLista() {
    const dc = porCargo[cargoKey];
    const html = [...dc.cands].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")).map(c => `<option value="${esc(rotulo(c))}"></option>`).join("");
    if ($("#dl-cands").dataset.k === cargoKey + dc.cands.length) return;
    $("#dl-cands").dataset.k = cargoKey + dc.cands.length;
    $("#dl-cands").innerHTML = html;
    Object.keys(textoParaNumero).forEach(t => delete textoParaNumero[t]);
    dc.cands.forEach(c => { textoParaNumero[rotulo(c)] = c.numero; });
    if (numA && !cand(numA)) numA = "";
    if (numB && !cand(numB)) numB = "";
    $("#cmp-a").value = cand(numA) ? rotulo(cand(numA)) : "";
    $("#cmp-b").value = cand(numB) ? rotulo(cand(numB)) : "";
  }
  function resolver(texto) {
    if (textoParaNumero[texto]) return textoParaNumero[texto];
    const m = /\((\d+)\)\s*$/.exec(texto);
    return m && cand(m[1]) ? m[1] : "";
  }
  function trocarCargo(k) {
    if (k === cargoKey && porCargo[k]) return;
    cargoKey = k; numA = ""; numB = ""; gen++;
    document.querySelectorAll("#cmp-cargo-abas .chip-filtro").forEach(b => b.classList.toggle("ativo", b.dataset.cargo === k));
    $("#cmp-a").value = ""; $("#cmp-b").value = "";
    if (porCargo[k]) preencherLista();
    pintar();
    ocupado = false;
    atualizar();
  }

  async function iniciar() {
    const p = new URLSearchParams(location.search);
    if (CARGOS[p.get("cargo")]) cargoKey = p.get("cargo");
    numA = p.get("a") || ""; numB = p.get("b") || "";
    document.querySelectorAll("#cmp-cargo-abas .chip-filtro").forEach(b => {
      b.classList.toggle("ativo", b.dataset.cargo === cargoKey);
      b.onclick = () => trocarCargo(b.dataset.cargo);
    });
    $("#cmp-a").onchange = e => { numA = resolver(e.target.value); if (!numA) e.target.value = ""; pintar(); };
    $("#cmp-b").onchange = e => { numB = resolver(e.target.value); if (!numB) e.target.value = ""; pintar(); };
    $("#btn-cmp-trocar").onclick = () => { [numA, numB] = [numB, numA]; $("#cmp-a").value = cand(numA) ? rotulo(cand(numA)) : ""; $("#cmp-b").value = cand(numB) ? rotulo(cand(numB)) : ""; pintar(); };
    $("#btn-cmp-atualizar").onclick = () => atualizar();
    await iniciarMapa();
    pintar();
    await atualizar();
    timer = setInterval(() => { if (!document.hidden) atualizar(); }, 30000);
  }
  window.addEventListener("load", iniciar);
})();
