/* =====================================================================
   BI Paraná — Apuração ao vivo (Eleições 2026, Deputado Estadual/PR)

   Fonte: feed público oficial do TSE (resultados.tse.jus.br). Esse feed
   não libera CORS para navegador, então passamos por um proxy público
   (ver PROXIES abaixo). Como o app é 100% estático (GitHub Pages), não
   dá pra rodar um coletor próprio — essa é a opção mais rápida dentro
   do que foi combinado.

   O que está CONFIRMADO (direto da config oficial do TSE, 02/10/2026,
   arquivo "comum/config/ele-c.jws" — a mesma fonte que já tinha dado
   os códigos de PR agora confirmou também Presidente e o 2º turno):
     - cd_eleicao "Eleição Ordinária Estadual - 2026 1º Turno" = 6259
       (Governador/Senador/Dep. Federal/Dep. Estadual, abrangência PR)
       — 2º turno (só Governador, se ninguém passar de 50%) = 6260
     - cd_eleicao "Eleição Ordinária Federal - 2026 1º Turno" = 6257
       (Presidente, abrangência NACIONAL — por isso usa UF "br", não
       "pr") — 2º turno (quase certo de acontecer) = 6258
     - cargo Presidente = 1, Governador = 3, Senador = 5,
       Dep. Federal = 6, Dep. Estadual = 7
     - UF Paraná = "pr"
   O que NÃO dá pra confirmar antes de domingo (arquivo só existe depois
   que a apuração começa): o nome exato do arquivo de resultado. Por
   isso FILENAME_VARIANTES tenta várias combinações plausíveis — na
   primeira que funcionar, o código já fixa essa combinação e usa só
   ela dali pra frente (ver cache em `urlsEstadoQueFuncionam`).
   ===================================================================== */

(() => {
  const AMBIENTE_BASE = "https://resultados.tse.jus.br/oficial/ele2026";

  /* Códigos de cargo confirmados direto da config oficial do TSE (02/10/2026).
     "proporcional" decide o tipo de projeção: Federal/Estadual usam quociente
     partidário + sobras (nº de vagas = cadeiras do PR); Presidente/Governador/
     Senador são por maioria de votos (os N mais votados), sem quociente.
     "cdEleicao"/"uf" variam por cargo: Presidente é um pleito NACIONAL separado
     (cd_eleicao 6257, uf "br"), os outros 3 são do pleito estadual do PR
     (cd_eleicao 6259, uf "pr"). "cdEleicaoT2" é o código do 2º turno, se/quando
     precisar trocar (ver TURNO2 abaixo) — null pra cargo que nunca tem 2º turno. */
  const CARGOS = {
    presidente:   { codigo: "1", nome: "Presidente",        vagas: 1,  proporcional: false, cdEleicao: "6257", cdEleicaoT2: "6258", uf: "br" },
    governador:   { codigo: "3", nome: "Governador",        vagas: 1,  proporcional: false, cdEleicao: "6259", cdEleicaoT2: "6260", uf: "pr" },
    senador:      { codigo: "5", nome: "Senador",           vagas: 2,  proporcional: false, cdEleicao: "6259", cdEleicaoT2: null,   uf: "pr" },
    depfederal:   { codigo: "6", nome: "Deputado Federal",  vagas: 30, proporcional: true,  cdEleicao: "6259", cdEleicaoT2: null,   uf: "pr" },
    depestadual:  { codigo: "7", nome: "Deputado Estadual", vagas: 54, proporcional: true,  cdEleicao: "6259", cdEleicaoT2: null,   uf: "pr" }
  };
  let cargoAtivo = "depestadual";

  // Vira true pro cargo certo (Presidente/Governador) no dia em que confirmar que teve 2º turno
  // — aí a busca passa a usar cdEleicaoT2 em vez de cdEleicao. Ver função cdEleicaoAtual().
  const TURNO2 = { presidente: false, governador: false };
  function cdEleicaoAtual(cargoKey, cargo) {
    return (TURNO2[cargoKey] && cargo.cdEleicaoT2) ? cargo.cdEleicaoT2 : cargo.cdEleicao;
  }

  const PROXIES = [
    url => "https://proxy.corsfix.com/?" + url,
    url => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
    url => "https://corsproxy.io/?url=" + encodeURIComponent(url)
  ];

  function candidatosFilenames(cargoKey, cargo) {
    const cdEleicao = cdEleicaoAtual(cargoKey, cargo);
    const dir = `${AMBIENTE_BASE}/${cdEleicao}/dados/${cargo.uf}`;
    const c4 = cargo.codigo.padStart(4, "0");
    const cdPad = cdEleicao.padStart(9, "0");
    const nomes = [
      `${cargo.uf}-c${c4}-e${cdPad}-u.json`,
      `${cargo.uf}-c${cargo.codigo}-e${cdEleicao}-u.json`,
      `${cargo.uf}-c${c4}-e${cdPad}-u.jws`
    ];
    return nomes.map(n => `${dir}/${n}`);
  }
  function municipioFilenames(codTse, cargoKey, cargo) {
    // Município é sempre dentro do PR, mesmo pra Presidente (cujo resultado "oficial" que
    // decide a eleição é o nacional, uf "br" — mas dá pra ver o recorte de um município do PR).
    const UF_MUN = "pr";
    const cdEleicao = cdEleicaoAtual(cargoKey, cargo);
    const dir = `${AMBIENTE_BASE}/${cdEleicao}/dados/${UF_MUN}`;
    const c4 = cargo.codigo.padStart(4, "0");
    const cdPad = cdEleicao.padStart(9, "0");
    const nomes = [
      `${UF_MUN}${codTse}-c${c4}-e${cdPad}-u.json`,
      `${UF_MUN}${codTse}-c${cargo.codigo}-e${cdEleicao}-u.json`
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

  async function buscarResultadoEstado(cargoKey, cargo) {
    // Chave inclui o cd_eleicao atual (não só o código do cargo) — se um dia virar 2º turno
    // (TURNO2), o cd_eleicao muda e a URL fixada do 1º turno não vale mais pra essa chave nova.
    const chaveCache = `${cargoKey}:${cdEleicaoAtual(cargoKey, cargo)}`;
    const urlFixada = urlsEstadoQueFuncionam[chaveCache];
    if (urlFixada) {
      const json = await tentarUrl(urlFixada);
      if (json) return json;
      delete urlsEstadoQueFuncionam[chaveCache]; // parou de funcionar — tenta descobrir de novo
    }
    for (const url of candidatosFilenames(cargoKey, cargo)) {
      const json = await tentarUrl(url);
      if (json) { urlsEstadoQueFuncionam[chaveCache] = url; return json; }
    }
    return null;
  }

  async function buscarResultadoMunicipio(codTse, cargoKey, cargo) {
    const urls = municipioFilenames(codTse, cargoKey, cargo);
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
      numero: String(c.n ?? c.nr ?? c.numero ?? ""),
      nome: c.nm ?? c.nmu ?? c.nome ?? "(sem nome)",
      partido: c.sg ?? c.partido ?? (c.ele && c.ele.sg) ?? "",
      votos: Number(c.vap ?? c.votos ?? c.v ?? 0),
      situacao: c.st ?? c.situacao ?? c.sit ?? ""
    })).filter(c => c.votos >= 0);
  }

  /* Nomes/números/partidos oficiais (registro de candidaturas do TSE, roster-candidatos-2026.js)
     — carregados ANTES da apuração começar, pra já mostrar quem concorre em cada cargo mesmo
     sem nenhum voto apurado ainda. Conforme a apuração real chega (por número do candidato),
     os votos vão sendo sobrepostos em cima desse roster; nunca o contrário. */
  function candidatosDoRoster(cargoKey) {
    const lista = (window.ROSTER_2026 && window.ROSTER_2026[cargoKey]) || [];
    return lista.map(c => ({ numero: String(c.numero), nome: c.nome, partido: c.partido, votos: 0, situacao: "" }));
  }
  function mesclarComRoster(candidatosApi, cargoKey) {
    const base = candidatosDoRoster(cargoKey);
    if (!base.length) return candidatosApi; // sem roster pra esse cargo — usa só o que veio do TSE
    const porNumero = {};
    base.forEach(c => { porNumero[c.numero] = c; });
    candidatosApi.forEach(c => {
      if (porNumero[c.numero]) Object.assign(porNumero[c.numero], c);
      else base.push(c); // candidato apurado que não bateu com o roster (raro) — inclui do mesmo jeito
    });
    return base;
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
  /* Votos de legenda: eleitor que votou só no número do partido, sem escolher candidato —
     contam pro total/quociente do partido mas não pertencem a nenhum candidato específico.
     Igual ao resto da extração, o nome exato do campo não dá pra confirmar antes da apuração
     abrir — tenta as variações mais plausíveis dentro de json.agr (agregado por partido). */
  function extrairVotosLegendaPorPartido(json) {
    if (!json || !json.agr) return {};
    const out = {};
    json.agr.forEach(a => {
      const sigla = a.sg ?? a.sigla ?? a.nm ?? "";
      if (!sigla) return;
      const legenda = Number(a.vl ?? a.vln ?? a.votoLegenda ?? a.votosLegenda ?? a.vlegenda ?? 0);
      if (legenda) out[sigla] = (out[sigla] || 0) + legenda;
    });
    return out;
  }

  /* ---------- Projeção de vagas ----------
     Proporcional (Dep. Federal/Estadual): quociente partidário + sobras por
     maiores médias — mesmo método já validado no Simulador de Chapa.
     Majoritário (Presidente/Governador/Senador): não tem quociente — são
     eleitos os N mais votados (aqui só mostramos quem está na frente, sem
     simular 2º turno). "votosLegendaPorPartido" soma no total do partido
     (conta pro quociente real) mas não pertence a nenhum candidato. */
  function calcularProjecaoVagas(candidatos, vagas, proporcional, votosLegendaPorPartido) {
    const porPartido = {};
    candidatos.forEach(c => {
      const p = c.partido || "(sem partido)";
      if (!porPartido[p]) porPartido[p] = { partido: p, total: 0, votosNominais: 0, votosLegenda: 0, eleitos: 0, candidatos: [] };
      porPartido[p].total += c.votos;
      porPartido[p].votosNominais += c.votos;
      porPartido[p].candidatos.push(c);
      if (/ELEITO/.test(c.situacao || "")) porPartido[p].eleitos++;
    });
    Object.entries(votosLegendaPorPartido || {}).forEach(([partido, votos]) => {
      if (!porPartido[partido]) porPartido[partido] = { partido, total: 0, votosNominais: 0, votosLegenda: 0, eleitos: 0, candidatos: [] };
      porPartido[partido].votosLegenda += votos;
      porPartido[partido].total += votos;
    });
    const totalGeral = Object.values(porPartido).reduce((a, p) => a + p.total, 0);
    const lista = Object.values(porPartido);
    lista.sort((a, b) => b.total - a.total);

    if (!proporcional || totalGeral === 0) {
      // majoritário: não há "vaga por partido" de verdade — cada vaga é de um candidato.
      // totalGeral===0 (antes da apuração começar, só com o roster pré-carregado): não dá pra
      // calcular quociente nem sobra com base em zero voto — sem isso o "maiores médias" atribuiria
      // TODAS as sobras ao primeiro partido da lista (todo mundo empatado em 0), o que é falso.
      lista.forEach(p => { p.vagasTotal = 0; p.vagasQP = 0; p.vagasSobra = 0; });
      return { lista, qe: 0, totalGeral, proporcional };
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
      $("#ap-aviso-config-texto").innerHTML = `<b>⚠️ A apuração oficial ainda não começou.</b> Os candidatos abaixo já são os registrados oficialmente no TSE — os votos aparecem automaticamente aqui assim que a contagem for aberta (domingo, a partir das 17h). Se já passou desse horário e continuar assim, me avise — é só ajustar o nome do arquivo no código.<br><span style="color:var(--tx3);font-size:11px">${esc(erro)}</span>`;
    } else if (!pct) {
      aviso.style.display = "block";
      $("#ap-aviso-config-texto").innerHTML = `<b>Conectado ao TSE, mas a apuração ainda não começou</b> (0% das seções totalizadas). Essa página atualiza sozinha.`;
    } else {
      aviso.style.display = "none";
    }
    $("#ap-status-texto").innerHTML = erro
      ? `Candidatos carregados — aguardando início da apuração.`
      : `<b>${pct.toFixed(1).replace(".", ",")}%</b> das seções apuradas — ${CARGOS[cargoAtivo].nome}/PR`;
  }

  function renderKpis(candidatos, totalGeral, cargo) {
    const eleitos = candidatos.filter(c => /ELEITO/.test(c.situacao || "")).length;
    const liderA = totalGeral > 0 ? [...candidatos].sort((a, b) => b.votos - a.votos)[0] : null;
    $("#ap-kpis").innerHTML = `
      <div class="card-kpi destaque"><div class="rotulo">Votos apurados (${esc(cargo.nome)})</div><div class="valor">${fmtN(totalGeral)}</div></div>
      <div class="card-kpi"><div class="rotulo">Candidatos no pleito</div><div class="valor">${candidatos.length}</div></div>
      <div class="card-kpi"><div class="rotulo">${cargo.proporcional ? "Eleitos confirmados" : "Vaga(s) em disputa"}</div><div class="valor">${cargo.proporcional ? eleitos : cargo.vagas} <span style="font-size:13px;color:var(--tx3)">${cargo.proporcional ? "/ " + cargo.vagas : ""}</span></div></div>
      <div class="card-kpi"><div class="rotulo">Mais votado no momento</div><div class="valor" style="font-size:16px">${liderA ? esc(liderA.nome) : "—"}</div>
        <div class="extra">${liderA ? fmtN(liderA.votos) + " votos (" + esc(liderA.partido) + ")" : "Aguardando apuração"}</div></div>`;
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
      const legendaTxt = p.votosLegenda ? ` <span style="color:var(--tx3)">(${fmtN(p.votosLegenda)} de legenda)</span>` : "";
      const eleitosTxt = p.eleitos ? `<b>${p.eleitos}</b> eleito${p.eleitos > 1 ? "s" : ""} confirmado${p.eleitos > 1 ? "s" : ""}<br>` : "";
      const vagasTxt = projecao.proporcional ? `<b>${p.vagasTotal}</b> vaga(s) projetada(s)<br>` : "";
      return `<div class="ap-partido-row">
        <div class="ap-partido-sigla" style="color:${cor}">${esc(p.partido)}</div>
        <div class="ap-partido-bar"><div style="width:${pct}%;background:${cor}"></div></div>
        <div class="ap-partido-vagas">${vagasTxt}${eleitosTxt}${fmtN(p.total)} votos${legendaTxt}</div>
      </div>`;
    }).join("") : '<div class="vazio">Aguardando votos apurados.</div>';
  }

  function renderCandidatos(candidatos, cargo) {
    const totalGeral = candidatos.reduce((a, c) => a + c.votos, 0);
    const filtrados = partidoFiltro ? candidatos.filter(c => c.partido === partidoFiltro) : candidatos;
    // Sem filtro, lista é só uma amostra (top 20) — com um partido escolhido, mostra a chapa
    // inteira dele (pode passar de 20 em Dep. Federal/Estadual com federação grande).
    const ordenados = [...filtrados].sort((a, b) => b.votos - a.votos);
    const top = partidoFiltro ? ordenados : ordenados.slice(0, 20);
    const sufixoFiltro = partidoFiltro ? ` — ${partidoFiltro}` : "";
    $("#ap-candidatos-titulo").textContent = (totalGeral > 0 ? "Candidatos mais votados" : "Candidatos registrados (ordem alfabética — aguardando votos)") + sufixoFiltro;
    $("#ap-candidatos").innerHTML = top.length ? top.map((c, i) => `
      <div class="ap-cand-row">
        <div class="ap-cand-rank">${i + 1}º</div>
        <div class="ap-cand-nome"><b>${esc(c.nome)}</b><span>${esc(c.partido)}${c.situacao ? " · " + esc(c.situacao) : (totalGeral > 0 && i < cargo.vagas && !cargo.proporcional ? " · eleito(a) no momento" : "")}</span></div>
        <div class="ap-cand-votos"><b>${fmtN(c.votos)}</b></div>
      </div>`).join("") : `<div class="vazio">${partidoFiltro ? "Esse partido não tem candidato registrado nesse cargo." : "Nenhum candidato registrado para esse cargo ainda."}</div>`;
  }

  // Filtro de partido na lista de candidatos — guarda o último candidatos/cargo renderizados
  // pra poder refiltrar na hora (sem precisar buscar de novo) quando o <select> mudar.
  let partidoFiltro = "";
  let ultimoCandidatosRenderizados = [];
  let ultimoCargoRenderizado = null;
  function popularFiltroPartido(cargoKey) {
    const sel = $("#ap-filtro-partido");
    if (!sel) return;
    const partidos = [...new Set(candidatosDoRoster(cargoKey).map(c => c.partido).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Todos os partidos</option>' + partidos.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
    sel.value = "";
    partidoFiltro = "";
  }

  // Guarda o último json (ou null) e o candidatos/projeção já calculados de cada cargo que já
  // foi buscado nesta sessão — assim trocar pra uma aba já visitada mostra na hora o que já se
  // sabia (mesmo que zero voto), em vez de ficar em branco esperando a rede de novo.
  const cacheUltimoPorCargo = {};

  function renderComDados(cargoKey, json, erro) {
    const cargo = CARGOS[cargoKey];
    const candidatos = mesclarComRoster(json ? extrairCandidatos(json) : [], cargoKey);
    const totalGeral = candidatos.reduce((a, c) => a + c.votos, 0);
    const votosLegenda = json ? extrairVotosLegendaPorPartido(json) : {};
    const projecao = calcularProjecaoVagas(candidatos, cargo.vagas, cargo.proporcional, votosLegenda);
    ultimoCandidatosRenderizados = candidatos;
    ultimoCargoRenderizado = cargo;
    renderStatus(json, erro);
    renderKpis(candidatos, totalGeral, cargo);
    renderPartidos(projecao);
    renderCandidatos(candidatos, cargo);
  }

  async function atualizar() {
    if (buscando) return;
    buscando = true;
    // Captura o cargo ATIVO NESTE MOMENTO — se o usuário trocar de aba enquanto esse
    // fetch ainda está em voo (proxy lento), não queremos misturar o cabeçalho de um
    // cargo com a lista de candidatos de outro quando a resposta finalmente chegar.
    const cargoKey = cargoAtivo;
    const cargo = CARGOS[cargoKey];
    $("#btn-ap-atualizar").disabled = true;
    let json = null, erro = null;
    try {
      json = await buscarResultadoEstado(cargoKey, cargo);
      if (!json) erro = "não encontrei o arquivo de resultado ainda";
      else ultimoResultado = json;
    } catch (e) {
      erro = e.message;
    }
    buscando = false;
    $("#btn-ap-atualizar").disabled = false;
    cacheUltimoPorCargo[cargoKey] = { json, erro };
    if (cargoAtivo !== cargoKey) {
      // o usuário trocou de aba durante essa busca — não redesenha aqui (a aba atual já está
      // mostrando o cache/roster que tinha). MAS a chamada de atualizar() que o próprio clique
      // da aba nova fez pode ter sido um no-op (bloqueada pelo "buscando" que ainda era true
      // por causa DESSA busca) — sem isso, a aba nova nunca buscaria dado real nenhum até o
      // próximo timer de 60s. Refaz agora pra aba que está realmente selecionada.
      atualizar();
      return;
    }
    renderComDados(cargoKey, json, erro);
  }

  function trocarCargo(id) {
    if (cargoAtivo === id) return;
    cargoAtivo = id;
    $$("#ap-cargo-abas .chip-filtro").forEach(b => b.classList.toggle("ativo", b.dataset.cargo === id));
    $("#ap-sub").textContent = `${CARGOS[id].nome} no Paraná — dados oficiais do TSE, direto da fonte`;
    popularFiltroPartido(id); // lista de partidos é por cargo — reseta pro cargo novo
    const det = $("#ap-mun-detalhe");
    if (det) det.innerHTML = "";
    // Mostra ALGO na hora (cache da última busca desse cargo nesta sessão, ou o roster com 0
    // voto se é a 1ª vez) em vez de deixar a tela parada em "Buscando..." até a rede responder —
    // é isso que fazia a troca de aba "parecer" lenta mesmo quando a lista de nomes já é conhecida.
    const cache = cacheUltimoPorCargo[id];
    renderComDados(id, cache ? cache.json : null, cache ? cache.erro : null);
    if (!cache) $("#ap-status-texto").innerHTML = `<b>Buscando...</b>`;
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
    det.innerHTML = '<div class="vazio">Buscando apuração de ' + esc(m.nome) + ' nos 5 cargos...</div>';
    const codTse = getMunByIbge()[id];
    if (!codTse) { det.innerHTML = '<div class="vazio">Não encontrei o código TSE deste município.</div>'; return; }
    // Município é sempre dos 5 cargos de uma vez — não depende da aba selecionada acima.
    const porCargo = await Promise.all(Object.entries(CARGOS).map(async ([key, cargo]) => {
      let json = null;
      try { json = await buscarResultadoMunicipio(codTse, key, cargo); } catch (e) { /* mostra "ainda não disponível" */ }
      return { cargo, json };
    }));
    det.innerHTML = `<div style="font-size:12.5px;color:var(--tx3);margin-bottom:12px"><b>${esc(m.nome)}</b> — apuração local nos 5 cargos</div>` +
      porCargo.map(({ cargo, json }) => {
        if (!json) {
          return `<div style="margin-bottom:16px"><div style="font-weight:600;margin-bottom:6px">${esc(cargo.nome)}</div><div class="vazio">Apuração ainda não disponível.</div></div>`;
        }
        const candidatos = extrairCandidatos(json).sort((a, b) => b.votos - a.votos).slice(0, cargo.proporcional ? 10 : cargo.vagas + 4);
        const pct = extrairPercentualApurado(json);
        return `<div style="margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:6px">${esc(cargo.nome)} <span style="font-size:11px;color:var(--tx3);font-weight:400">— ${pct.toFixed(1).replace(".", ",")}% apurado</span></div>
          ${candidatos.length ? `<table class="tab"><thead><tr><th>#</th><th>Candidato</th><th>Partido</th><th class="num">Votos</th></tr></thead><tbody>
            ${candidatos.map((c, i) => `<tr><td>${i + 1}º</td><td><b>${esc(c.nome)}</b></td><td>${esc(c.partido)}</td><td class="num">${fmtN(c.votos)}</td></tr>`).join("")}
            </tbody></table>` : '<div class="vazio">Sem votos apurados ainda.</div>'}
        </div>`;
      }).join("");
  };

  /* ---------- Página ---------- */
  let inicializado = false;
  function init() {
    if (inicializado) return;
    inicializado = true;
    popularBuscaMunicipio();
    $("#btn-ap-atualizar").onclick = atualizar;
    $$("#ap-cargo-abas .chip-filtro").forEach(b => b.onclick = () => trocarCargo(b.dataset.cargo));
    $("#ap-filtro-partido").onchange = e => {
      partidoFiltro = e.target.value;
      if (ultimoCargoRenderizado) renderCandidatos(ultimoCandidatosRenderizados, ultimoCargoRenderizado);
    };
    timerAtualizacao = setInterval(atualizar, 60000);
  }

  function render() {
    init();
    popularFiltroPartido(cargoAtivo);
    // Mesma lógica do trocarCargo: se já tem algo em cache (ou pelo menos o roster), mostra na
    // hora em vez de deixar a tela em branco até a primeira busca de rede terminar.
    const cache = cacheUltimoPorCargo[cargoAtivo];
    renderComDados(cargoAtivo, cache ? cache.json : null, cache ? cache.erro : null);
    if (!cache) $("#ap-status-texto").innerHTML = `<b>Buscando...</b>`;
    atualizar();
  }

  PAGES.apuracao = { render };
})();
