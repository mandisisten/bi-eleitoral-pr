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
  const UF = "pr";
  const AMBIENTE_BASE = "https://resultados.tse.jus.br/oficial/ele2026";

  /* Códigos de cargo confirmados direto da config oficial do TSE (02/10/2026).
     "proporcional" decide o tipo de projeção: Federal/Estadual usam quociente
     partidário + sobras (nº de vagas = cadeiras do PR); Governador/Senador são
     por maioria de votos (os N mais votados), sem quociente. */
  const CARGOS = {
    governador:   { codigo: "3", nome: "Governador",        vagas: 1,  proporcional: false },
    senador:      { codigo: "5", nome: "Senador",           vagas: 2,  proporcional: false },
    depfederal:   { codigo: "6", nome: "Deputado Federal",  vagas: 30, proporcional: true },
    depestadual:  { codigo: "7", nome: "Deputado Estadual", vagas: 54, proporcional: true }
  };
  let cargoAtivo = "depestadual";

  const PROXIES = [
    url => "https://proxy.corsfix.com/?" + url,
    url => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
    url => "https://corsproxy.io/?url=" + encodeURIComponent(url)
  ];

  function candidatosFilenames(cargo) {
    const dir = `${AMBIENTE_BASE}/${CD_ELEICAO}/dados/${UF}`;
    const c4 = cargo.codigo.padStart(4, "0");
    const nomes = [
      `${UF}-c${c4}-e000006259-u.json`,
      `${UF}-c${cargo.codigo}-e6259-u.json`,
      `${UF}-c${c4}-e000006259-u.jws`
    ];
    return nomes.map(n => `${dir}/${n}`);
  }
  function municipioFilenames(codTse, cargo) {
    const dir = `${AMBIENTE_BASE}/${CD_ELEICAO}/dados/${UF}`;
    const c4 = cargo.codigo.padStart(4, "0");
    const nomes = [
      `${UF}${codTse}-c${c4}-e000006259-u.json`,
      `${UF}${codTse}-c${cargo.codigo}-e6259-u.json`
    ];
    return nomes.map(n => `${dir}/${n}`);
  }

  let proxyPreferido = 0;       // índice do proxy que funcionou da última vez — tenta ele primeiro
  let urlsEstadoQueFuncionam = {}; // por cargo: fixa a URL certa assim que acha, pra não ficar testando toda hora

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

  async function buscarResultadoEstado(cargo) {
    const urlFixada = urlsEstadoQueFuncionam[cargo.codigo];
    if (urlFixada) {
      const json = await tentarUrl(urlFixada);
      if (json) return json;
      delete urlsEstadoQueFuncionam[cargo.codigo]; // parou de funcionar — tenta descobrir de novo
    }
    for (const url of candidatosFilenames(cargo)) {
      const json = await tentarUrl(url);
      if (json) { urlsEstadoQueFuncionam[cargo.codigo] = url; return json; }
    }
    return null;
  }

  async function buscarResultadoMunicipio(codTse, cargo) {
    const urls = municipioFilenames(codTse, cargo);
    for (const url of urls) {
      const json = await tentarUrl(url);
      if (json) return json;
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

  /* ---------- Projeção de vagas ----------
     Proporcional (Dep. Federal/Estadual): quociente partidário + sobras por
     maiores médias — mesmo método já validado no Simulador de Chapa.
     Majoritário (Governador/Senador): não tem quociente — são eleitos os N
     mais votados (1 só com +50% no caso do Governador, senão vai pro 2º
     turno; aqui só mostramos quem está na frente, sem simular 2º turno). */
  function calcularProjecaoVagas(candidatos, vagas, proporcional) {
    const porPartido = {};
    candidatos.forEach(c => {
      const p = c.partido || "(sem partido)";
      if (!porPartido[p]) porPartido[p] = { partido: p, total: 0, candidatos: [] };
      porPartido[p].total += c.votos;
      porPartido[p].candidatos.push(c);
    });
    const totalGeral = Object.values(porPartido).reduce((a, p) => a + p.total, 0);
    const lista = Object.values(porPartido);
    lista.sort((a, b) => b.total - a.total);

    if (!proporcional) {
      // majoritário: não há "vaga por partido" de verdade — cada vaga é de um candidato.
      // Mostramos aqui só o agregado por partido pra exibição; quem está "à frente" vem de renderCandidatos.
      lista.forEach(p => { p.vagasTotal = 0; p.vagasQP = 0; p.vagasSobra = 0; });
      return { lista, qe: 0, totalGeral, proporcional: false };
    }

    const qe = vagas > 0 ? Math.max(1, Math.floor(totalGeral / vagas)) : 1;
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
    return { lista, qe, totalGeral, proporcional: true };
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
      : `<b>${pct.toFixed(1).replace(".", ",")}%</b> das seções apuradas — ${CARGOS[cargoAtivo].nome}/PR`;
  }

  function renderKpis(candidatos, totalGeral, cargo) {
    const eleitos = candidatos.filter(c => /ELEITO/.test(c.situacao || "")).length;
    const liderA = [...candidatos].sort((a, b) => b.votos - a.votos)[0];
    $("#ap-kpis").innerHTML = `
      <div class="card-kpi destaque"><div class="rotulo">Votos apurados (${esc(cargo.nome)})</div><div class="valor">${fmtN(totalGeral)}</div></div>
      <div class="card-kpi"><div class="rotulo">Candidatos no pleito</div><div class="valor">${candidatos.length}</div></div>
      <div class="card-kpi"><div class="rotulo">${cargo.proporcional ? "Eleitos confirmados" : "Vaga(s) em disputa"}</div><div class="valor">${cargo.proporcional ? eleitos : cargo.vagas} <span style="font-size:13px;color:var(--tx3)">${cargo.proporcional ? "/ " + cargo.vagas : ""}</span></div></div>
      <div class="card-kpi"><div class="rotulo">Mais votado no momento</div><div class="valor" style="font-size:16px">${liderA ? esc(liderA.nome) : "—"}</div>
        <div class="extra">${liderA ? fmtN(liderA.votos) + " votos (" + esc(liderA.partido) + ")" : ""}</div></div>`;
  }

  function renderPartidos(projecao) {
    $("#ap-partidos-titulo").textContent = projecao.proporcional ? "Por partido — votos e vagas projetadas" : "Por partido — total de votos";
    $("#ap-partidos-nota").textContent = projecao.proporcional
      ? "Projeção recalculada a cada atualização com o quociente eleitoral sobre os votos já apurados (quociente partidário + sobras por maiores médias) — mesmo método validado no Simulador de Chapa."
      : "Cargo majoritário — não há vaga \"por partido\" (quem é eleito são os candidatos mais votados, veja ao lado). Aqui é só o total agregado de votos de cada partido.";
    const max = projecao.lista[0] ? projecao.lista[0].total : 1;
    $("#ap-partidos").innerHTML = projecao.lista.length ? projecao.lista.map((p, i) => {
      const cor = corDoPartido(p.partido, i);
      const pct = max ? (p.total / max * 100) : 0;
      return `<div class="ap-partido-row">
        <div class="ap-partido-sigla" style="color:${cor}">${esc(p.partido)}</div>
        <div class="ap-partido-bar"><div style="width:${pct}%;background:${cor}"></div></div>
        <div class="ap-partido-vagas">${projecao.proporcional ? `<b>${p.vagasTotal}</b> vaga(s)<br>` : ""}${fmtN(p.total)} votos</div>
      </div>`;
    }).join("") : '<div class="vazio">Aguardando votos apurados.</div>';
  }

  function renderCandidatos(candidatos, cargo) {
    const top = [...candidatos].sort((a, b) => b.votos - a.votos).slice(0, 20);
    $("#ap-candidatos").innerHTML = top.length ? top.map((c, i) => `
      <div class="ap-cand-row">
        <div class="ap-cand-rank">${i + 1}º</div>
        <div class="ap-cand-nome"><b>${esc(c.nome)}</b><span>${esc(c.partido)}${c.situacao ? " · " + esc(c.situacao) : (i < cargo.vagas && !cargo.proporcional ? " · eleito(a) no momento" : "")}</span></div>
        <div class="ap-cand-votos"><b>${fmtN(c.votos)}</b></div>
      </div>`).join("") : '<div class="vazio">Aguardando votos apurados.</div>';
  }

  async function atualizar() {
    if (buscando) return;
    buscando = true;
    const cargo = CARGOS[cargoAtivo];
    $("#ap-status-texto").innerHTML = `<b>Buscando...</b>`;
    $("#btn-ap-atualizar").disabled = true;
    try {
      const json = await buscarResultadoEstado(cargo);
      if (!json) { renderStatus(null, "não encontrei o arquivo de resultado ainda"); }
      else {
        ultimoResultado = json;
        const candidatos = extrairCandidatos(json);
        const totalGeral = extrairTotalVotos(json);
        const projecao = calcularProjecaoVagas(candidatos, cargo.vagas, cargo.proporcional);
        renderStatus(json, null);
        renderKpis(candidatos, totalGeral, cargo);
        renderPartidos(projecao);
        renderCandidatos(candidatos, cargo);
      }
    } catch (e) {
      renderStatus(null, e.message);
    }
    buscando = false;
    $("#btn-ap-atualizar").disabled = false;
  }

  function trocarCargo(id) {
    if (cargoAtivo === id) return;
    cargoAtivo = id;
    $$("#ap-cargo-abas .chip-filtro").forEach(b => b.classList.toggle("ativo", b.dataset.cargo === id));
    $("#ap-sub").textContent = `${CARGOS[id].nome} no Paraná — dados oficiais do TSE, direto da fonte`;
    const det = $("#ap-mun-detalhe");
    if (det) det.innerHTML = "";
    atualizar();
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
    const json = await buscarResultadoMunicipio(codTse, CARGOS[cargoAtivo]);
    if (!json) { det.innerHTML = '<div class="vazio">Apuração de ' + esc(m.nome) + ' ainda não disponível.</div>'; return; }
    const candidatos = extrairCandidatos(json).sort((a, b) => b.votos - a.votos).slice(0, 15);
    const pct = extrairPercentualApurado(json);
    det.innerHTML = `<div style="font-size:12px;color:var(--tx3);margin-bottom:10px">${CARGOS[cargoAtivo].nome} — ${pct.toFixed(1).replace(".", ",")}% das seções apuradas em ${esc(m.nome)}</div>` +
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
    $$("#ap-cargo-abas .chip-filtro").forEach(b => b.onclick = () => trocarCargo(b.dataset.cargo));
    timerAtualizacao = setInterval(atualizar, 60000);
  }

  function render() {
    init();
    atualizar();
  }

  PAGES.apuracao = { render };
})();
