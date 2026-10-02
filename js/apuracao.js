/* =====================================================================
   BI Paraná — Apuração ao vivo (Eleições 2026, Deputado Estadual/PR)

   Fonte: feed público oficial do TSE (resultados.tse.jus.br). Esse feed
   não libera CORS para navegador, então passamos por um proxy público
   (ver PROXIES abaixo). Como o app é 100% estático (GitHub Pages), não
   dá pra rodar um coletor próprio — essa é a opção mais rápida dentro
   do que foi combinado.

   O que está CONFIRMADO (direto da config oficial do TSE, 02/10/2026):
     - cd_eleicao da "Eleição Ordinária Estadual - 2026 1º Turno" = 6259
     - cargo Deputado Estadual = 7
     - UF Paraná = "pr"
   O que NÃO dá pra confirmar antes de domingo (arquivo só existe depois
   que a apuração começa): o nome exato do arquivo de resultado. Por
   isso FILENAME_VARIANTES tenta várias combinações plausíveis — na
   primeira que funcionar, o código já fixa essa combinação e usa só
   ela dali pra frente (ver cache em `combinacaoQueFunciona`).
   ===================================================================== */

(() => {
  const CD_ELEICAO = "6259";
  const CARGO = "7";
  const UF = "pr";
  const AMBIENTE_BASE = "https://resultados.tse.jus.br/oficial/ele2026";

  const PROXIES = [
    url => "https://proxy.corsfix.com/?" + url,
    url => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
    url => "https://corsproxy.io/?url=" + encodeURIComponent(url)
  ];

  function candidatosFilenames() {
    const dir = `${AMBIENTE_BASE}/${CD_ELEICAO}/dados/${UF}`;
    const nomes = [
      `${UF}-c0007-e000006259-u.json`,
      `${UF}-c7-e6259-u.json`,
      `${UF}-c0007-e000006259-u.jws`
    ];
    return nomes.map(n => `${dir}/${n}`);
  }
  function municipioFilenames(codTse) {
    const dir = `${AMBIENTE_BASE}/${CD_ELEICAO}/dados/${UF}`;
    const nomes = [
      `${UF}${codTse}-c0007-e000006259-u.json`,
      `${UF}${codTse}-c0007-e6259-u.json`,
      `${UF}${codTse}-c7-e6259-u.json`
    ];
    return nomes.map(n => `${dir}/${n}`);
  }

  let proxyPreferido = 0;       // índice do proxy que funcionou da última vez — tenta ele primeiro
  let urlEstadoQueFunciona = null; // fixa a URL certa assim que acha, pra não ficar testando toda hora

  function decodeJWS(texto) {
    // Config files vêm assinados (JOSE/JWS compacto: header.payload.sig) — já os
    // dados "-u.json" podem vir em JSON puro. Detecta e decodifica os dois casos.
    const t = texto.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      return JSON.parse(t);
    }
    const partes = t.split(".");
    if (partes.length >= 2) {
      let payload = partes[1].replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      const decoded = atob(payload);
      return JSON.parse(decoded);
    }
    throw new Error("formato de resposta não reconhecido");
  }

  async function fetchComTimeout(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { cache: "no-store", signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function tentarUrl(url) {
    const ordemProxies = [proxyPreferido, ...PROXIES.map((_, i) => i).filter(i => i !== proxyPreferido)];
    for (const i of ordemProxies) {
      try {
        const resp = await fetchComTimeout(PROXIES[i](url), 7000);
        if (!resp.ok) continue;
        const texto = await resp.text();
        const json = decodeJWS(texto);
        proxyPreferido = i;
        return json;
      } catch (e) { /* tenta o próximo proxy */ }
    }
    return null;
  }

  async function buscarResultadoEstado() {
    if (urlEstadoQueFunciona) {
      const json = await tentarUrl(urlEstadoQueFunciona);
      if (json) return json;
      urlEstadoQueFunciona = null; // parou de funcionar — tenta descobrir de novo
    }
    for (const url of candidatosFilenames()) {
      const json = await tentarUrl(url);
      if (json) { urlEstadoQueFunciona = url; return json; }
    }
    return null;
  }

  async function buscarResultadoMunicipio(codTse) {
    const urls = municipioFilenames(codTse);
    for (const url of urls) {
      const r = await tentarUrl(url);
      if (r) return r.json;
    }
    return null;
  }

  /* ---------- Extração defensiva (nomes de campo do TSE podem variar) ---------- */
  function extrairCandidatos(json) {
    if (!json) return [];
    const lista = json.cand || json.candidatos || (json.agr && json.agr.flatMap(a => a.cand || [])) || [];
    return lista.map(c => ({
      numero: c.n ?? c.nr ?? c.numero ?? "",
      nome: c.nm ?? c.nmu ?? c.nome ?? "(sem nome)",
      partido: c.sg ?? c.partido ?? (c.ele && c.ele.sg) ?? "",
      votos: Number(c.vap ?? c.votos ?? c.v ?? 0),
      situacao: c.st ?? c.situacao ?? c.sit ?? ""
    })).filter(c => c.votos >= 0);
  }
  function extrairPercentualApurado(json) {
    if (!json) return 0;
    const v = json.pst ?? json.pvap ?? json.pe ?? json.percentual ?? json.pap;
    return v != null ? Number(v) : 0;
  }
  function extrairTotalVotos(json) {
    if (!json) return 0;
    if (json.tvv != null) return Number(json.tvv);
    const cands = extrairCandidatos(json);
    return cands.reduce((a, c) => a + c.votos, 0);
  }

  /* ---------- Projeção de vagas (quociente partidário + sobras — mesmo método do Simulador de Chapa) ---------- */
  function calcularProjecaoVagas(candidatos, vagas) {
    const porPartido = {};
    candidatos.forEach(c => {
      const p = c.partido || "(sem partido)";
      if (!porPartido[p]) porPartido[p] = { partido: p, total: 0, candidatos: [] };
      porPartido[p].total += c.votos;
      porPartido[p].candidatos.push(c);
    });
    const totalGeral = Object.values(porPartido).reduce((a, p) => a + p.total, 0);
    const qe = vagas > 0 ? Math.max(1, Math.floor(totalGeral / vagas)) : 1;
    const lista = Object.values(porPartido);
    lista.forEach(p => { p.vagasQP = Math.floor(p.total / qe); });
    let sobras = Math.max(0, vagas - lista.reduce((a, p) => a + p.vagasQP, 0));
    for (let i = 0; i < sobras && lista.length; i++) {
      let melhor = null, melhorMedia = -1;
      lista.forEach(p => {
        const media = p.total / ((p.vagasQP || 0) + (p.vagasSobra || 0) + 1);
        if (media > melhorMedia) { melhorMedia = media; melhor = p; }
      });
      if (melhor) melhor.vagasSobra = (melhor.vagasSobra || 0) + 1;
    }
    lista.forEach(p => { p.vagasTotal = p.vagasQP + (p.vagasSobra || 0); });
    lista.sort((a, b) => b.total - a.total);
    return { lista, qe, totalGeral };
  }

  const CORES_FALLBACK = ["#3b82f6", "#22c55e", "#f59e0b", "#a78bfa", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b"];
  function corDoPartido(sigla, idx) {
    if (window.corPartido) { const c = corPartido(sigla); if (c && c !== "#64748b") return c; }
    return CORES_FALLBACK[idx % CORES_FALLBACK.length];
  }

  /* ---------- Estado ---------- */
  let ultimoResultado = null;
  let timerAtualizacao = null;
  let buscando = false;
  let tseMunByIbge = null;

  function getMunByIbge() {
    if (tseMunByIbge) return tseMunByIbge;
    tseMunByIbge = {};
    const mapa = window.TSE_MUN_PR || {};
    Object.entries(mapa).forEach(([codTse, codIbge]) => { tseMunByIbge[codIbge] = codTse; });
    return tseMunByIbge;
  }

  /* ---------- Render ---------- */
  function renderStatus(json, erro) {
    const pct = json ? extrairPercentualApurado(json) : 0;
    $("#ap-pct-fill").style.width = Math.min(100, pct) + "%";
    $("#ap-pct-valor").textContent = pct.toFixed(1).replace(".", ",") + "%";
    const agora = new Date().toLocaleTimeString("pt-BR");
    $("#ap-ultima-att").textContent = erro ? `Última tentativa: ${agora} (sem sucesso)` : `Atualizado às ${agora}`;

    const aviso = $("#ap-aviso-config");
    if (erro) {
      aviso.style.display = "block";
      $("#ap-aviso-config-texto").innerHTML = `<b>⚠️ Ainda não consegui buscar os dados.</b> Normal antes do início oficial da apuração (domingo, a partir das 17h). Se já passou desse horário e continuar assim, me avise — é só ajustar o nome do arquivo no código.<br><span style="color:var(--tx3);font-size:11px">${esc(erro)}</span>`;
    } else if (!pct) {
      aviso.style.display = "block";
      $("#ap-aviso-config-texto").innerHTML = `<b>Conectado ao TSE, mas a apuração ainda não começou</b> (0% das seções totalizadas). Essa página atualiza sozinha.`;
    } else {
      aviso.style.display = "none";
    }
    $("#ap-status-texto").innerHTML = erro
      ? `Sem dados no momento.`
      : `<b>${pct.toFixed(1).replace(".", ",")}%</b> das seções apuradas — Deputado Estadual/PR`;
  }

  function renderKpis(candidatos, totalGeral, vagas) {
    const eleitos = candidatos.filter(c => /ELEITO/.test(c.situacao || "")).length;
    const liderA = [...candidatos].sort((a, b) => b.votos - a.votos)[0];
    $("#ap-kpis").innerHTML = `
      <div class="card-kpi destaque"><div class="rotulo">Votos apurados (Dep. Estadual)</div><div class="valor">${fmtN(totalGeral)}</div></div>
      <div class="card-kpi"><div class="rotulo">Candidatos no pleito</div><div class="valor">${candidatos.length}</div></div>
      <div class="card-kpi"><div class="rotulo">Eleitos confirmados</div><div class="valor">${eleitos} <span style="font-size:13px;color:var(--tx3)">/ ${vagas}</span></div></div>
      <div class="card-kpi"><div class="rotulo">Mais votado no momento</div><div class="valor" style="font-size:16px">${liderA ? esc(liderA.nome) : "—"}</div>
        <div class="extra">${liderA ? fmtN(liderA.votos) + " votos (" + esc(liderA.partido) + ")" : ""}</div></div>`;
  }

  function renderPartidos(projecao) {
    const max = projecao.lista[0] ? projecao.lista[0].total : 1;
    $("#ap-partidos").innerHTML = projecao.lista.length ? projecao.lista.map((p, i) => {
      const cor = corDoPartido(p.partido, i);
      const pct = max ? (p.total / max * 100) : 0;
      return `<div class="ap-partido-row">
        <div class="ap-partido-sigla" style="color:${cor}">${esc(p.partido)}</div>
        <div class="ap-partido-bar"><div style="width:${pct}%;background:${cor}"></div></div>
        <div class="ap-partido-vagas"><b>${p.vagasTotal}</b> vaga(s)<br>${fmtN(p.total)} votos</div>
      </div>`;
    }).join("") : '<div class="vazio">Aguardando votos apurados.</div>';
  }

  function renderCandidatos(candidatos) {
    const top = [...candidatos].sort((a, b) => b.votos - a.votos).slice(0, 20);
    $("#ap-candidatos").innerHTML = top.length ? top.map((c, i) => `
      <div class="ap-cand-row">
        <div class="ap-cand-rank">${i + 1}º</div>
        <div class="ap-cand-nome"><b>${esc(c.nome)}</b><span>${esc(c.partido)}${c.situacao ? " · " + esc(c.situacao) : ""}</span></div>
        <div class="ap-cand-votos"><b>${fmtN(c.votos)}</b></div>
      </div>`).join("") : '<div class="vazio">Aguardando votos apurados.</div>';
  }

  async function atualizar() {
    if (buscando) return;
    buscando = true;
    $("#ap-status-texto").innerHTML = `<b>Buscando...</b>`;
    $("#btn-ap-atualizar").disabled = true;
    try {
      const json = await buscarResultadoEstado();
      if (!json) { renderStatus(null, "não encontrei o arquivo de resultado ainda"); }
      else {
        ultimoResultado = json;
        const candidatos = extrairCandidatos(json);
        const totalGeral = extrairTotalVotos(json);
        const projecao = calcularProjecaoVagas(candidatos, 54);
        renderStatus(json, null);
        renderKpis(candidatos, totalGeral, 54);
        renderPartidos(projecao);
        renderCandidatos(candidatos);
      }
    } catch (e) {
      renderStatus(null, e.message);
    }
    buscando = false;
    $("#btn-ap-atualizar").disabled = false;
  }

  /* ---------- Busca por município ---------- */
  function popularBuscaMunicipio() {
    const input = $("#ap-mun-busca");
    const painel = $("#ap-mun-resultados");
    input.addEventListener("input", () => {
      const termo = input.value.trim().toLowerCase();
      if (termo.length < 2) { painel.classList.remove("aberto"); return; }
      const encontrados = MUNI.filter(m => m.nome.toLowerCase().includes(termo)).slice(0, 8);
      painel.innerHTML = encontrados.map(m => `<div class="item" onclick="window.__apSelecionarMun(${m.id})">${esc(m.nome)} <span style="color:var(--tx3)">— ${esc(m.meso)}</span></div>`).join("")
        || '<div class="item" style="color:var(--tx3)">Nenhum município encontrado.</div>';
      painel.classList.add("aberto");
    });
    document.addEventListener("click", e => { if (!e.target.closest(".ap-mun-busca-wrap")) painel.classList.remove("aberto"); });
  }

  window.__apSelecionarMun = async id => {
    const m = MUNI_BY_ID[id];
    $("#ap-mun-resultados").classList.remove("aberto");
    $("#ap-mun-busca").value = m.nome;
    const det = $("#ap-mun-detalhe");
    det.innerHTML = '<div class="vazio">Buscando apuração de ' + esc(m.nome) + '...</div>';
    const codTse = getMunByIbge()[id];
    if (!codTse) { det.innerHTML = '<div class="vazio">Não encontrei o código TSE deste município.</div>'; return; }
    const json = await buscarResultadoMunicipio(codTse);
    if (!json) { det.innerHTML = '<div class="vazio">Apuração de ' + esc(m.nome) + ' ainda não disponível.</div>'; return; }
    const candidatos = extrairCandidatos(json).sort((a, b) => b.votos - a.votos).slice(0, 15);
    const pct = extrairPercentualApurado(json);
    det.innerHTML = `<div style="font-size:12px;color:var(--tx3);margin-bottom:10px">${pct.toFixed(1).replace(".", ",")}% das seções apuradas em ${esc(m.nome)}</div>` +
      (candidatos.length ? `<table class="tab"><thead><tr><th>#</th><th>Candidato</th><th>Partido</th><th class="num">Votos</th></tr></thead><tbody>
        ${candidatos.map((c, i) => `<tr><td>${i + 1}º</td><td><b>${esc(c.nome)}</b></td><td>${esc(c.partido)}</td><td class="num">${fmtN(c.votos)}</td></tr>`).join("")}
        </tbody></table>` : '<div class="vazio">Sem votos apurados ainda.</div>');
  };

  /* ---------- Página ---------- */
  let inicializado = false;
  function init() {
    if (inicializado) return;
    inicializado = true;
    popularBuscaMunicipio();
    $("#btn-ap-atualizar").onclick = atualizar;
    timerAtualizacao = setInterval(atualizar, 60000);
  }

  function render() {
    init();
    atualizar();
  }

  PAGES.apuracao = { render };
})();
