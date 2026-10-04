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
  const TURNO2 = window.APURACAO_TURNO2 || { presidente: false, governador: false };
  function cdEleicaoAtual(cargoKey, cargo) {
    return (TURNO2[cargoKey] && cargo.cdEleicaoT2) ? cargo.cdEleicaoT2 : cargo.cdEleicao;
  }

  /* CONFIRMADO em 04/10/2026 olhando as requisições reais do app oficial do TSE:
       <base>/<cd_eleicao>/dados/<uf>/<uf>-c<cargo 4 díg>-e<cd_eleicao 6 díg>-u.jws
       <base>/<cd_eleicao>/dados/pr/pr<município TSE 5 díg>-c<cargo 4 díg>-e<cd_eleicao 6 díg>-u.jws
     (cd_eleicao com 6 dígitos — "e006257" — e extensão .jws, JSON assinado.)
     O TSE responde com CORS liberado (Access-Control-Allow-Origin ecoa a origem, inclusive
     pré-voo e 404), então o navegador busca DIRETO — sem proxy. */
  function urlResultadoEstado(cargoKey, cargo) {
    const cd = cdEleicaoAtual(cargoKey, cargo);
    return `${AMBIENTE_BASE}/${cd}/dados/${cargo.uf}/${cargo.uf}-c${cargo.codigo.padStart(4, "0")}-e${cd.padStart(6, "0")}-u.jws`;
  }
  function urlResultadoMunicipio(codTse, cargoKey, cargo) {
    // Município é sempre dentro do PR, mesmo pra Presidente (o resultado que decide a eleição é
    // o nacional, uf "br" — mas dá pra ver o recorte de um município do PR).
    const cd = cdEleicaoAtual(cargoKey, cargo);
    return `${AMBIENTE_BASE}/${cd}/dados/pr/pr${codTse}-c${cargo.codigo.padStart(4, "0")}-e${cd.padStart(6, "0")}-u.jws`;
  }

  function decodeJWS(texto) {
    // JWS compacto (header.payload.assinatura, base64url). Só lemos o payload; o texto vem em
    // UTF-8, então decodifica os bytes (atob sozinho estragaria os acentos: "FEDERAÇÃO").
    const t = texto.trim();
    if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t);
    const partes = t.split(".");
    if (partes.length < 2) throw new Error("formato de resposta não reconhecido");
    let payload = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    const bytes = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder("utf-8").decode(bytes));
  }

  // Devolve { json, erro } — erro é um texto curto pra mostrar na tela quando json é null.
  async function buscarJsonTSE(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const resp = await fetch(url + "?nocache=" + Date.now(), { signal: ctrl.signal });
      if (resp.status === 404) return { json: null, erro: "o TSE ainda não publicou esse arquivo" };
      if (!resp.ok) return { json: null, erro: "o TSE respondeu HTTP " + resp.status };
      return { json: decodeJWS(await resp.text()), erro: null };
    } catch (e) {
      return { json: null, erro: e.name === "AbortError" ? "o TSE demorou demais pra responder" : "falha de conexão com o TSE" };
    } finally {
      clearTimeout(timer);
    }
  }

  const buscarResultadoEstado = (cargoKey, cargo) => buscarJsonTSE(urlResultadoEstado(cargoKey, cargo));
  const buscarResultadoMunicipio = (codTse, cargoKey, cargo) => buscarJsonTSE(urlResultadoMunicipio(codTse, cargoKey, cargo));

  /* ---------- Extração (esquema REAL do arquivo -u.jws, conferido em 04/10/2026) ----------
     json.carg[0].agr[]            agremiação: partido isolado, federação ("com" = "PT/PC do B/PV") ou coligação
       .par[]                      partidos da agremiação: n, sg (sigla), tvtn (votos nominais), tvtl (votos de legenda)
         .cand[]                   candidatos: n (número), nmu (nome de urna), vap (votos), e ("s" = eleito), st (situação), vs[] (vice/suplentes)
     json.s.pst                    % de seções totalizadas ("12,34" — vírgula decimal)
     json.v.vv                     votos válidos; json.carg[0].qe quociente eleitoral; json.dg/hg data/hora do arquivo */
  const numInt = v => Number(String(v ?? "").replace(/\D/g, "")) || 0;
  const fmtPct = n => (Number(n) || 0).toFixed(2).replace(".", ",") + "%";
  const numBR = v => { const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : 0; };

  function extrairAgrs(json) {
    const carg = json && json.carg && json.carg[0];
    return (carg && carg.agr) || [];
  }
  function extrairCandidatos(json) {
    const out = [];
    extrairAgrs(json).forEach(agr => {
      (agr.par || []).forEach(par => {
        (par.cand || []).forEach(c => {
          const eleito = c.e === "s";
          const st = String(c.st || "").trim();
          const vice = (c.vs || []).find(x => x.tp === "v");
          out.push({
            numero: String(c.n ?? ""),
            nome: c.nmu || c.nm || "(sem nome)",
            partido: par.sg || "",
            agrupamento: agr.com || par.sg || "",
            votos: numInt(c.vap),
            pct: numBR(c.pvap),
            eleito,
            situacao: eleito ? (st || "Eleito") : (/turno/i.test(st) ? st : ""),
            vice: vice ? (vice.nmu || vice.nm || "") : ""
          });
        });
      });
    });
    return out;
  }

  /* Candidatos do registro oficial do TSE (roster-candidatos-2026.js) — só serve de reserva
     quando o arquivo de resultado não pôde ser baixado (assim a lista de nomes não some). Com o
     arquivo do TSE em mãos, a lista vem inteira dele (já traz todos os candidatos, mesmo com 0 voto). */
  function candidatosDoRoster(cargoKey) {
    const lista = (window.ROSTER_2026 && window.ROSTER_2026[cargoKey]) || [];
    return lista.map(c => ({ numero: String(c.numero), nome: c.nome, partido: c.partido, agrupamento: c.partido, votos: 0, pct: 0, eleito: false, situacao: "", vice: "" }));
  }
  function candidatosDoCargo(json, cargoKey) {
    const doTSE = extrairCandidatos(json);
    return doTSE.length ? doTSE : candidatosDoRoster(cargoKey);
  }
  function extrairPercentualApurado(json) {
    return json && json.s ? numBR(json.s.pst) : 0;
  }
  /* Números OFICIAIS do TSE por agremiação (conferido em 04/10 com 99% apurado):
       agr.vag     vagas já distribuídas pelo TSE (soma = nº de cadeiras)        carg.qe  quociente eleitoral oficial
       par.tvtn    votos nominais VÁLIDOS (a soma de cand.vap inclui anulados sub judice e passa disso)
       par.tvtl    votos de legenda (soma bate com v.vl)
     Preferimos esses números à nossa conta (a projeção própria só entra quando o TSE ainda não distribuiu vagas). */
  function extrairOficial(json) {
    const resumo = {};
    extrairAgrs(json).forEach(agr => {
      const chave = agr.com || ((agr.par || [])[0] || {}).sg || "";
      if (!chave) return;
      const r = resumo[chave] || (resumo[chave] = { vag: 0, tvtn: 0, tvtl: 0 });
      r.vag += numInt(agr.vag);
      (agr.par || []).forEach(p => { r.tvtn += numInt(p.tvtn); r.tvtl += numInt(p.tvtl); });
    });
    const carg = json && json.carg && json.carg[0];
    return { resumo, qe: carg ? numInt(carg.qe) : 0 };
  }

  /* ---------- Projeção de vagas ----------
     Proporcional (Dep. Federal/Estadual): quociente partidário + sobras por
     maiores médias — mesmo método já validado no Simulador de Chapa.
     Majoritário (Presidente/Governador/Senador): não tem quociente — são
     eleitos os N mais votados (aqui só mostramos quem está na frente, sem
     simular 2º turno). "votosLegendaPorPartido" soma no total do partido
     (conta pro quociente real) mas não pertence a nenhum candidato. */
  function calcularProjecaoVagas(candidatos, vagas, proporcional, oficial) {
    const porPartido = {};
    candidatos.forEach(c => {
      // Proporcional: a unidade do quociente é a agremiação (federação conta como UM partido só,
      // ex. "PT/PC do B/PV"). Majoritário: agrupa pelo partido do candidato.
      const p = (proporcional ? (c.agrupamento || c.partido) : c.partido) || "(sem partido)";
      if (!porPartido[p]) porPartido[p] = { partido: p, total: 0, votosNominais: 0, votosLegenda: 0, eleitos: 0, candidatos: [] };
      porPartido[p].total += c.votos;
      porPartido[p].votosNominais += c.votos;
      porPartido[p].candidatos.push(c);
      if (c.eleito) porPartido[p].eleitos++;
    });
    // Proporcional: total do partido = nominais VÁLIDOS (tvtn) + legenda (tvtl), como o TSE conta.
    const resumo = (proporcional && oficial && oficial.resumo) || {};
    Object.entries(resumo).forEach(([chave, r]) => {
      if (!porPartido[chave]) porPartido[chave] = { partido: chave, total: 0, votosNominais: 0, votosLegenda: 0, eleitos: 0, candidatos: [] };
      const p = porPartido[chave];
      p.votosNominais = r.tvtn > 0 ? r.tvtn : p.votosNominais;
      p.votosLegenda = r.tvtl;
      p.total = p.votosNominais + p.votosLegenda;
    });
    const totalGeral = Object.values(porPartido).reduce((a, p) => a + p.total, 0);
    const lista = Object.values(porPartido);
    lista.sort((a, b) => b.total - a.total);

    // O TSE já distribuiu as vagas: usa a distribuição oficial (inclui as regras de sobra que a
    // nossa conta simplificada não tem). Os eleitos de cada partido = os mais votados dentro dele.
    const vagOficial = Object.values(resumo).reduce((a, r) => a + r.vag, 0);
    if (proporcional && vagOficial > 0) {
      lista.forEach(p => {
        const r = resumo[p.partido];
        p.vagasTotal = r ? r.vag : 0; p.vagasQP = p.vagasTotal; p.vagasSobra = 0; p.oficial = true;
        [...p.candidatos].sort((a, b) => b.votos - a.votos).slice(0, p.vagasTotal).forEach(c => { if (c.votos > 0) c.eleitoProj = true; });
      });
      return { lista, qe: oficial.qe, totalGeral, proporcional: true, oficial: true };
    }

    if (!proporcional || totalGeral === 0) {
      // majoritário: não há "vaga por partido" de verdade — cada vaga é de um candidato.
      // totalGeral===0 (antes da apuração começar, só com o roster pré-carregado): não dá pra
      // calcular quociente nem sobra com base em zero voto — sem isso o "maiores médias" atribuiria
      // TODAS as sobras ao primeiro partido da lista (todo mundo empatado em 0), o que é falso.
      lista.forEach(p => { p.vagasTotal = 0; p.vagasQP = 0; p.vagasSobra = 0; });
      return { lista, qe: 0, totalGeral, proporcional };
    }

    // Quociente eleitoral (CE art. 106): fração igual ou inferior a 0,5 é desprezada; superior a 0,5 vira 1.
    const bruto = vagas > 0 ? totalGeral / vagas : 1;
    const qe = Math.max(1, (bruto - Math.floor(bruto)) > 0.5 ? Math.ceil(bruto) : Math.floor(bruto));
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
    const primeira = String(sigla).split("/")[0].trim(); // federação "PT/PC do B/PV" → cor do 1º partido
    if (window.corPartido) { const c = corPartido(primeira); if (c && c !== "#64748b") return c; }
    return CORES_FALLBACK[idx % CORES_FALLBACK.length];
  }
  // Com voto: mais votados primeiro (empate por nome). Sem nenhum voto ainda: ordem alfabética.
  function ordenarCandidatos(lista, temVotos) {
    return [...lista].sort((a, b) => (temVotos ? b.votos - a.votos : 0) || a.nome.localeCompare(b.nome, "pt-BR"));
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
    const geradoTSE = json && json.dg ? ` · arquivo do TSE de ${json.dg.slice(0, 5)} ${json.hg}` : "";
    $("#ap-ultima-att").textContent = erro ? `Última tentativa: ${agora} (sem sucesso)` : `Atualizado às ${agora}${geradoTSE}`;

    const aviso = $("#ap-aviso-config");
    if (erro) {
      aviso.style.display = "block";
      $("#ap-aviso-config-texto").innerHTML = `<b>⚠️ Não foi possível carregar os dados do TSE agora</b> (${esc(erro)}). Os candidatos abaixo são os registrados oficialmente; a página tenta de novo sozinha a cada 30 segundos.`;
    } else if (!pct) {
      aviso.style.display = "block";
      $("#ap-aviso-config-texto").innerHTML = `<b>Conectado ao TSE — a apuração ainda não começou</b> (0% das seções totalizadas). O TSE só libera os resultados depois que a votação termina em todo o país, inclusive as urnas no exterior; assim que liberar, os números aparecem aqui sozinhos.`;
    } else {
      aviso.style.display = "none";
    }
    const cargo = CARGOS[cargoAtivo];
    $("#ap-status-texto").innerHTML = erro
      ? (json ? `Sem conexão agora — mostrando os últimos dados recebidos do TSE.` : `Candidatos carregados — sem conexão com o TSE no momento.`)
      : `<b>${pct.toFixed(1).replace(".", ",")}%</b> das seções totalizadas — ${cargo.nome}/${cargo.uf.toUpperCase()}`;
  }

  function renderKpis(candidatos, totalGeral, cargo) {
    const confirmados = candidatos.filter(c => c.eleito).length;
    const projetados = candidatos.filter(c => c.eleitoProj).length;
    const eleitos = confirmados || projetados;
    const rotuloEleitos = confirmados ? "Eleitos confirmados" : (projetados ? "Vagas definidas (projeção TSE)" : "Eleitos confirmados");
    const liderA = totalGeral > 0 ? [...candidatos].sort((a, b) => b.votos - a.votos)[0] : null;
    $("#ap-kpis").innerHTML = `
      <div class="card-kpi destaque"><div class="rotulo">Votos válidos (${esc(cargo.nome)})</div><div class="valor">${fmtN(totalGeral)}</div></div>
      <div class="card-kpi"><div class="rotulo">Candidatos no pleito</div><div class="valor">${candidatos.length}</div></div>
      <div class="card-kpi"><div class="rotulo">${cargo.proporcional ? rotuloEleitos : "Vaga(s) em disputa"}</div><div class="valor">${cargo.proporcional ? eleitos : cargo.vagas} <span style="font-size:13px;color:var(--tx3)">${cargo.proporcional ? "/ " + cargo.vagas : ""}</span></div></div>
      <div class="card-kpi"><div class="rotulo">Mais votado no momento</div><div class="valor" style="font-size:16px">${liderA ? esc(liderA.nome) : "—"}</div>
        <div class="extra">${liderA ? fmtN(liderA.votos) + " votos · " + fmtPct(liderA.pct) + " (" + esc(liderA.partido) + ")" : "Aguardando apuração"}</div></div>`;
  }

  function renderPartidos(projecao) {
    $("#ap-partidos-titulo").textContent = projecao.proporcional ? (projecao.oficial ? "Por partido — votos e vagas (TSE)" : "Por partido — votos e vagas projetadas") : "Por partido — total de votos";
    $("#ap-partidos-nota").textContent = projecao.oficial
      ? `Vagas por partido conforme a totalização oficial do TSE (quociente eleitoral ${fmtN(projecao.qe)}), com votos nominais válidos + legenda. Em cada partido, os eleitos são os mais votados dele.`
      : projecao.proporcional
      ? "Projeção recalculada a cada atualização com o quociente eleitoral sobre os votos já apurados (quociente partidário + sobras por maiores médias) — mesmo método validado no Simulador de Chapa."
      : "Cargo majoritário — não há vaga \"por partido\" (quem é eleito são os candidatos mais votados, veja ao lado). Aqui é só o total agregado de votos de cada partido.";
    const max = projecao.lista[0] ? projecao.lista[0].total : 1;
    $("#ap-partidos").innerHTML = projecao.lista.length ? projecao.lista.map((p, i) => {
      const cor = corDoPartido(p.partido, i);
      const pct = max ? (p.total / max * 100) : 0;
      const legendaTxt = p.votosLegenda ? ` <span style="color:var(--tx3)">(${fmtN(p.votosLegenda)} de legenda)</span>` : "";
      const eleitosTxt = p.eleitos ? `<b>${p.eleitos}</b> eleito${p.eleitos > 1 ? "s" : ""} confirmado${p.eleitos > 1 ? "s" : ""}<br>` : "";
      const vagasTxt = projecao.proporcional ? `<b${p.oficial && p.vagasTotal > 0 ? ' style="color:var(--ok)"' : ""}>${p.vagasTotal}</b> vaga(s) ${p.oficial ? "(TSE)" : "projetada(s)"}<br>` : "";
      // valor igual ao do <select>: federação/coligação = "agr:", partido isolado = "par:"
      const filtro = (projecao.proporcional && p.partido.includes("/") ? "agr:" : "par:") + p.partido;
      return `<div class="ap-partido-row clicavel${partidoFiltro === filtro ? " sel" : ""}" data-filtro="${esc(filtro)}" title="Ver os candidatos de ${esc(p.partido)}">
        <div class="ap-partido-sigla" style="color:${cor}">${esc(p.partido)}</div>
        <div class="ap-partido-bar"><div style="width:${pct}%;background:${cor}"></div></div>
        <div class="ap-partido-vagas">${vagasTxt}${eleitosTxt}${fmtN(p.total)} votos${projecao.totalGeral > 0 ? " · " + fmtPct(p.total / projecao.totalGeral * 100) : ""}${legendaTxt}</div>
      </div>`;
    }).join("") : '<div class="vazio">Aguardando votos apurados.</div>';
  }

  function renderCandidatos(candidatos, cargo) {
    const totalGeral = candidatos.reduce((a, c) => a + c.votos, 0);
    // partidoFiltro = "agr:<federação/coligação/partido isolado>" ou "par:<sigla individual>"
    const filtrados = partidoFiltro
      ? candidatos.filter(c => partidoFiltro.startsWith("agr:") ? c.agrupamento === partidoFiltro.slice(4) : c.partido === partidoFiltro.slice(4))
      : candidatos;
    // Sem filtro, lista é só uma amostra (top 20) — com um partido escolhido, mostra a chapa
    // inteira dele (pode passar de 20 em Dep. Federal/Estadual com federação grande).
    const ordenados = ordenarCandidatos(filtrados, totalGeral > 0);
    const top = partidoFiltro ? ordenados : ordenados.slice(0, 20);
    const sufixoFiltro = partidoFiltro ? ` — ${partidoFiltro.slice(4)}` : "";
    $("#ap-candidatos-titulo").textContent = (totalGeral > 0 ? "Candidatos mais votados" : "Candidatos registrados (ordem alfabética — aguardando votos)") + sufixoFiltro;
    $("#ap-candidatos").innerHTML = top.length ? top.map((c, i) => `
      <div class="ap-cand-row${c.eleito || c.eleitoProj ? " eleito" : ""}">
        <div class="ap-cand-rank">${i + 1}º</div>
        <div class="ap-cand-nome"><b>${esc(c.nome)}</b>${c.eleito ? '<span class="ap-selo">✔ ELEITO</span>' : c.eleitoProj ? '<span class="ap-selo proj">✔ ELEITO (projeção)</span>' : ""}<span>${esc(c.partido)}${c.vice ? " · vice " + esc(c.vice) : ""}${c.eleito ? (c.situacao && c.situacao !== "Eleito" ? " · " + esc(c.situacao) : "") : (c.situacao ? " · " + esc(c.situacao) : (!c.eleitoProj && totalGeral > 0 && i < cargo.vagas && !cargo.proporcional ? " · na frente" : ""))}</span></div>
        <div class="ap-cand-votos"><b>${fmtN(c.votos)}</b>${totalGeral > 0 ? `<span>${fmtPct(c.pct)}</span>` : ""}</div>
      </div>`).join("") : `<div class="vazio">${partidoFiltro ? "Esse partido não tem candidato registrado nesse cargo." : "Nenhum candidato registrado para esse cargo ainda."}</div>`;
  }

  // Filtro de partido na lista de candidatos — guarda o último candidatos/cargo renderizados
  // pra poder refiltrar na hora (sem precisar buscar de novo) quando o <select> mudar.
  let partidoFiltro = "";
  let ultimoCandidatosRenderizados = [];
  let ultimoCargoRenderizado = null;
  // Opções: federações/coligações (agremiações com mais de um partido) + partidos individuais.
  function htmlOpcoesFiltro(candidatos) {
    const agrs = [...new Set(candidatos.map(c => c.agrupamento).filter(a => a && a.includes("/")))].sort();
    const partidos = [...new Set(candidatos.map(c => c.partido).filter(Boolean))].sort();
    const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
    return '<option value="">Todos os partidos</option>'
      + (agrs.length ? `<optgroup label="Federações / coligações">${agrs.map(a => opt("agr:" + a, a)).join("")}</optgroup>` : "")
      + `<optgroup label="Partidos">${partidos.map(p => opt("par:" + p, p)).join("")}</optgroup>`;
  }
  function popularFiltroPartido(cargoKey) {
    const sel = $("#ap-filtro-partido");
    if (!sel) return;
    const html = htmlOpcoesFiltro(candidatosDoRoster(cargoKey));
    sel.dataset.opcoes = html;
    sel.innerHTML = html;
    sel.value = "";
    partidoFiltro = "";
  }

  // Guarda o último json (ou null) e o candidatos/projeção já calculados de cada cargo que já
  // foi buscado nesta sessão — assim trocar pra uma aba já visitada mostra na hora o que já se
  // sabia (mesmo que zero voto), em vez de ficar em branco esperando a rede de novo.
  const cacheUltimoPorCargo = {};

  // Reconstrói as opções do filtro a partir dos candidatos que realmente estão na lista (o arquivo
  // do TSE pode trazer um partido que o roster não tinha), mantendo a seleção atual se ainda existir.
  function sincronizarOpcoesFiltro(candidatos) {
    const sel = $("#ap-filtro-partido");
    if (!sel) return;
    const html = htmlOpcoesFiltro(candidatos);
    if (sel.dataset.opcoes === html) return;
    sel.dataset.opcoes = html;
    sel.innerHTML = html;
    if ([...sel.options].some(o => o.value === partidoFiltro)) sel.value = partidoFiltro; else { sel.value = ""; partidoFiltro = ""; }
  }

  function renderComDados(cargoKey, json, erro) {
    const cargo = CARGOS[cargoKey];
    const candidatos = candidatosDoCargo(json, cargoKey);
    const projecao = calcularProjecaoVagas(candidatos, cargo.vagas, cargo.proporcional, extrairOficial(json));
    // Votos válidos: o total oficial do TSE quando existe (inclui legenda); senão a soma que temos.
    const vvTSE = json && json.v ? numInt(json.v.vv) : 0;
    const totalGeral = vvTSE || projecao.totalGeral;
    ultimoCandidatosRenderizados = candidatos;
    ultimoCargoRenderizado = cargo;
    sincronizarOpcoesFiltro(candidatos);
    renderStatus(json, erro);
    renderKpis(candidatos, totalGeral, cargo);
    renderPartidos(projecao);
    renderCandidatos(candidatos, cargo);
  }

  async function atualizar() {
    if (buscando) return;
    buscando = true;
    // Captura o cargo ATIVO NESTE MOMENTO — se o usuário trocar de aba enquanto esse
    // fetch ainda está em voo, não queremos misturar o cabeçalho de um cargo com a lista
    // de candidatos de outro quando a resposta finalmente chegar.
    const cargoKey = cargoAtivo;
    const cargo = CARGOS[cargoKey];
    $("#btn-ap-atualizar").disabled = true;
    const busca = await buscarResultadoEstado(cargoKey, cargo);
    const erro = busca.erro;
    // Falha passageira de rede NÃO pode apagar os números já na tela: mantém o último arquivo bom.
    const anterior = cacheUltimoPorCargo[cargoKey];
    const json = busca.json || (anterior && anterior.json) || null;
    if (busca.json) ultimoResultado = busca.json;
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
    $("#ap-sub").textContent = `${CARGOS[id].nome} ${CARGOS[id].uf === "br" ? "— resultado nacional" : "no Paraná"} — dados oficiais do TSE, direto da fonte`;
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
      const { json, erro } = await buscarResultadoMunicipio(codTse, key, cargo);
      return { cargo, json, erro };
    }));
    det.innerHTML = `<div style="font-size:12.5px;color:var(--tx3);margin-bottom:12px"><b>${esc(m.nome)}</b> — apuração local nos 5 cargos</div>` +
      porCargo.map(({ cargo, json, erro }) => {
        if (!json) {
          return `<div style="margin-bottom:16px"><div style="font-weight:600;margin-bottom:6px">${esc(cargo.nome)}</div><div class="vazio">Apuração ainda não disponível (${esc(erro || "sem resposta")}).</div></div>`;
        }
        const todos = extrairCandidatos(json);
        const temVotos = todos.some(c => c.votos > 0);
        const candidatos = ordenarCandidatos(todos, temVotos).slice(0, cargo.proporcional ? 10 : cargo.vagas + 4);
        const pct = extrairPercentualApurado(json);
        return `<div style="margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:6px">${esc(cargo.nome)} <span style="font-size:11px;color:var(--tx3);font-weight:400">— ${pct.toFixed(1).replace(".", ",")}% apurado</span></div>
          ${candidatos.length && temVotos ? `<table class="tab"><thead><tr><th>#</th><th>Candidato</th><th>Partido</th><th class="num">Votos</th><th class="num">%</th></tr></thead><tbody>
            ${candidatos.map((c, i) => `<tr><td>${i + 1}º</td><td><b>${esc(c.nome)}</b></td><td>${esc(c.partido)}</td><td class="num">${fmtN(c.votos)}</td><td class="num">${fmtPct(c.pct)}</td></tr>`).join("")}
            </tbody></table>` : '<div class="vazio">A apuração ainda não começou neste município.</div>'}
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
    const aplicarFiltro = valor => {
      partidoFiltro = valor;
      const sel = $("#ap-filtro-partido");
      if (valor && ![...sel.options].some(o => o.value === valor)) sel.add(new Option(valor.slice(4), valor));
      sel.value = valor;
      $$("#ap-partidos .ap-partido-row").forEach(r => r.classList.toggle("sel", !!valor && r.dataset.filtro === valor));
      if (ultimoCargoRenderizado) renderCandidatos(ultimoCandidatosRenderizados, ultimoCargoRenderizado);
    };
    $("#ap-filtro-partido").onchange = e => aplicarFiltro(e.target.value);
    // Clicar num partido do gráfico filtra a lista de candidatos por ele (clicar de novo limpa).
    $("#ap-partidos").onclick = e => {
      const linha = e.target.closest(".ap-partido-row");
      if (!linha) return;
      aplicarFiltro(partidoFiltro === linha.dataset.filtro ? "" : linha.dataset.filtro);
      if (partidoFiltro) $("#ap-candidatos-titulo").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    timerAtualizacao = setInterval(atualizar, 30000);
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
