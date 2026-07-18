/* =====================================================================
   BI Paraná — Votação por Candidato (deputados estadual/federal, TSE 2022)
   Modo "1 candidato" (mapa de calor da votação) e "Comparar 2 candidatos"
   (mapa de dominância). Usa carregarVotosDeputados() (app.js), sob demanda.
   ===================================================================== */

(() => {
  let inicializado = false;
  let modo = "1";
  let mapaCand = null, camadaCand = null, legendaCand = null;

  const ESCALA_CAND = ["#1e2740", "#1e3a8a", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"];
  const ESCALA_A = ["#1e2740", "#1e3a8a", "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa"];
  const ESCALA_B = ["#1e2740", "#7c2d12", "#9a3412", "#c2410c", "#ea580c", "#f97316"];
  const COR_EMPATE = "#4b5563";

  function init() {
    if (inicializado) return;
    inicializado = true;
    $("#cand-cargo").addEventListener("change", () => {
      popularSelect(); popularSelectPar("a"); popularSelectPar("b"); popularSelectChapas();
      $("#sim-resultado").innerHTML = ""; $("#sim-candidatos-lista").dataset.carregado = "";
      if ($("#sim-modo-completa").style.display !== "none") carregarRosterChapa();
      renderModo();
    });
    $("#cand-busca").addEventListener("input", () => { popularSelect(); renderModo(); });
    $("#cand-select").addEventListener("change", renderModo);
    $("#cand-busca-a").addEventListener("input", () => { popularSelectPar("a"); renderModo(); });
    $("#cand-busca-b").addEventListener("input", () => { popularSelectPar("b"); renderModo(); });
    $("#cand-select-a").addEventListener("change", renderModo);
    $("#cand-select-b").addEventListener("change", renderModo);
    $$("#page-candidatos .aba").forEach(a => a.onclick = () => {
      modo = a.dataset.modo;
      $$("#page-candidatos .aba").forEach(x => x.classList.toggle("ativa", x === a));
      $("#cand-modo-unico").style.display = modo === "1" ? "block" : "none";
      $("#cand-modo-comparar").style.display = modo === "2" ? "block" : "none";
      $("#cand-modo-chapas").style.display = modo === "3" ? "block" : "none";
      $("#cand-modo-simulador").style.display = modo === "4" ? "block" : "none";
      $("#painel-mapa-cand").style.display = (modo === "1" || modo === "2") ? "block" : "none";
      $("#painel-tabela-cand").style.display = (modo === "1" || modo === "2") ? "block" : "none";
      renderModo();
    });
    $("#btn-simular-chapa").onclick = simularChapa;
    $("#btn-simular-chapa-completa").onclick = simularChapaCompleta;
    $("#btn-salvar-chapa-sim").onclick = salvarChapaSim;
    $("#btn-sim-add-candidato").onclick = () => addLinhaCandidatoSim("", "");
    $("#sim-chapa").addEventListener("change", carregarRosterChapa);
    $$("#cand-modo-simulador .aba[data-simmodo]").forEach(a => a.onclick = () => {
      const simmodo = a.dataset.simmodo;
      $$("#cand-modo-simulador .aba[data-simmodo]").forEach(x => x.classList.toggle("ativa", x === a));
      $("#sim-modo-simples").style.display = simmodo === "simples" ? "block" : "none";
      $("#sim-modo-completa").style.display = simmodo === "completa" ? "block" : "none";
      if (simmodo === "completa" && $("#sim-candidatos-lista").dataset.carregado !== "1") {
        carregarRosterChapa();
      }
    });
  }

  function idChapaSim(cargo, chave) { return (cargo + "__" + chave).replace(/[^a-zA-Z0-9]+/g, "_"); }

  function carregarRosterChapa() {
    const cargo = $("#cand-cargo").value;
    const chave = $("#sim-chapa").value;
    if (!chave) return;
    const salvo = BI.chapaSim[idChapaSim(cargo, chave)];
    $("#sim-candidatos-lista").innerHTML = "";
    $("#sim-candidatos-lista").dataset.carregado = "1";
    if (salvo && salvo.candidatos && salvo.candidatos.length) {
      salvo.candidatos.forEach(c => addLinhaCandidatoSim(c.nome, c.votos));
      $("#sim-legenda").value = salvo.legenda || 0;
      $("#sim-salvo-info").textContent = `Chapa salva anteriormente por ${salvo.atualizadoPor || "alguém"}.`;
    } else {
      const exp = Object.values(expectativaPorMunicipio()).reduce((a, b) => a + b, 0);
      addLinhaCandidatoSim("Você (candidato principal)", exp || "");
      addLinhaCandidatoSim("", "");
      $("#sim-legenda").value = 0;
      $("#sim-salvo-info").textContent = "Ainda não salva — clique em \"Salvar esta chapa\" para guardar este cenário.";
    }
  }

  async function salvarChapaSim() {
    const cargo = $("#cand-cargo").value;
    const chave = $("#sim-chapa").value;
    const dados = chapasAtual();
    const chapaReal = dados && dados.lista.find(c => c.chave === chave);
    if (!chapaReal) return;
    const candidatos = $$("#sim-candidatos-lista .sim-cand-linha").map(l => ({
      nome: l.querySelector(".sim-cand-nome").value.trim(),
      votos: Number(l.querySelector(".sim-cand-votos").value) || 0
    })).filter(c => c.nome || c.votos);
    const legenda = Number($("#sim-legenda").value) || 0;
    try {
      await colCampanha("chapaSim").doc(idChapaSim(cargo, chave)).set({
        cargo, chapaChave: chave, chapaNome: chapaReal.nome, candidatos, legenda,
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        atualizadoPor: BI.perfil.username
      });
      toast("Chapa simulada salva!", "ok");
    } catch (e) { toast("Erro ao salvar: " + e.message, "erro"); }
  }

  async function render() {
    init();
    if (!window.VOTOS_DEPUTADOS) {
      $("#cand-cards").innerHTML = '<div class="vazio">Carregando dados de votação (6 MB, só na primeira vez)...</div>';
      $("#cand-cards-comparar").innerHTML = "";
      $("#cand-tabela-municipios").innerHTML = "";
      try { await carregarVotosDeputados(); } catch (e) { toast(e.message, "erro"); $("#cand-cards").innerHTML = `<div class="vazio">${esc(e.message)}</div>`; return; }
    }
    popularSelect();
    popularSelectPar("a");
    popularSelectPar("b");
    popularSelectChapas();
    renderModo();
  }
  PAGES.candidatos = { render };

  function listaAtual() {
    const cargo = $("#cand-cargo").value;
    return (window.VOTOS_DEPUTADOS && window.VOTOS_DEPUTADOS[cargo]) || [];
  }

  function opcaoTexto(c) {
    return `${c.nomeUrna} (${c.partido}) — ${fmtN(c.total)} votos${/^ELEITO/.test(c.situacao) ? " ✓ eleito" : ""}`;
  }

  function popularSelect() {
    const busca = ($("#cand-busca").value || "").toLowerCase();
    const lista = listaAtual();
    const filtrada = busca ? lista.filter(c => c.nomeUrna.toLowerCase().includes(busca) || c.nome.toLowerCase().includes(busca)) : lista;
    const sel = $("#cand-select");
    const valorAntigo = sel.value;
    sel.innerHTML = filtrada.map(c => `<option value="${esc(c.numero)}">${esc(opcaoTexto(c))}</option>`).join("");
    if (filtrada.some(c => c.numero === valorAntigo)) sel.value = valorAntigo;
  }

  function popularSelectPar(suf) {
    const busca = ($(`#cand-busca-${suf}`).value || "").toLowerCase();
    const lista = listaAtual();
    const filtrada = busca ? lista.filter(c => c.nomeUrna.toLowerCase().includes(busca) || c.nome.toLowerCase().includes(busca)) : lista;
    const sel = $(`#cand-select-${suf}`);
    const valorAntigo = sel.value;
    sel.innerHTML = filtrada.map(c => `<option value="${esc(c.numero)}">${esc(opcaoTexto(c))}</option>`).join("");
    if (filtrada.some(c => c.numero === valorAntigo)) sel.value = valorAntigo;
    else if (suf === "b" && sel.options.length > 1) sel.selectedIndex = 1;
  }

  function candidatoPorNumero(numero) { return listaAtual().find(c => c.numero === numero) || null; }

  function renderModo() {
    if (modo === "1") {
      renderCards(candidatoPorNumero($("#cand-select").value));
      renderIndicacoes(candidatoPorNumero($("#cand-select").value));
      renderTabela(candidatoPorNumero($("#cand-select").value));
      renderMapaUnico(candidatoPorNumero($("#cand-select").value));
    } else if (modo === "2") {
      const a = candidatoPorNumero($("#cand-select-a").value);
      const b = candidatoPorNumero($("#cand-select-b").value);
      renderCardsComparacao(a, b);
      renderTabelaComparacao(a, b);
      renderMapaComparacao(a, b);
    } else if (modo === "3") {
      renderChapas();
    }
  }

  /* ---------- Modo: Chapas 2022 ---------- */
  function chapasAtual() {
    const cargo = $("#cand-cargo").value;
    return (window.VOTOS_DEPUTADOS && window.VOTOS_DEPUTADOS.chapas && window.VOTOS_DEPUTADOS.chapas[cargo]) || null;
  }

  function eleitosDaChapa(cargo, chapa) {
    const lista = (window.VOTOS_DEPUTADOS && window.VOTOS_DEPUTADOS[cargo]) || [];
    return lista.filter(c => chapa.partidos.includes(c.partido) && /^ELEITO/.test(c.situacao)).sort((a, b) => b.total - a.total);
  }

  function renderChapas() {
    const dados = chapasAtual();
    if (!dados) { $("#chapas-tabela").innerHTML = '<div class="vazio">Sem dados de chapas para este cargo.</div>'; return; }
    $("#chapas-info").innerHTML = `Quociente eleitoral 2022 (QE) = <b>${fmtN(dados.qe)}</b> votos válidos por vaga — ${dados.vagas} vagas disputadas, ${fmtN(dados.totalGeral)} votos válidos no total.
      <br><span style="color:var(--tx3)">Aproximação do método oficial (quociente partidário + sobras por maiores médias). Validado contra o resultado real de 2022: acerta 54/54 vagas estaduais e 29/30 federais (1 vaga disputadíssima na última sobra pode variar).</span>`;
    $("#chapas-tabela").innerHTML = `
      <table class="tab"><thead><tr><th>Chapa</th><th>Partidos</th><th class="num">Votos</th><th class="num">Vagas por QP</th><th class="num">Sobras</th><th class="num">Total de vagas</th></tr></thead><tbody>
      ${dados.lista.map(c => `<tr class="clicavel" onclick="verEleitosChapa('${esc(c.chave)}')">
        <td><b>${esc(c.nome)}</b></td>
        <td style="color:var(--tx2);font-size:12px">${c.partidos.map(esc).join(", ")}</td>
        <td class="num">${fmtN(c.total)}</td>
        <td class="num">${c.vagasQP}</td>
        <td class="num">${c.vagasSobra}</td>
        <td class="num"><b style="color:${c.vagasTotal ? "var(--pri2)" : "var(--tx3)"}">${c.vagasTotal}</b></td>
      </tr>`).join("")}
      </tbody></table>`;
  }

  function verEleitosChapa(chave) {
    const cargo = $("#cand-cargo").value;
    const dados = chapasAtual();
    const chapa = dados.lista.find(c => c.chave === chave);
    if (!chapa) return;
    const eleitos = eleitosDaChapa(cargo, chapa);
    Modal.abrir(`
      <h3>${esc(chapa.nome)} — eleitos em 2022</h3>
      <div style="font-size:12.5px;color:var(--tx2);margin-bottom:12px">${fmtN(chapa.total)} votos — ${chapa.vagasTotal} vaga(s) (${chapa.vagasQP} por quociente + ${chapa.vagasSobra} de sobra)</div>
      <table class="tab"><thead><tr><th>#</th><th>Candidato</th><th>Partido</th><th class="num">Votos</th></tr></thead><tbody>
      ${eleitos.map((c, i) => `<tr><td style="color:var(--tx3)">${i + 1}º</td><td><b>${esc(c.nomeUrna)}</b></td><td><span class="tag azul">${esc(c.partido)}</span></td><td class="num">${fmtN(c.total)}</td></tr>`).join("") || '<tr><td colspan="4" style="color:var(--tx3)">Nenhum eleito encontrado (candidato abaixo de 100 votos pode não estar na base).</td></tr>'}
      </tbody></table>`);
  }
  window.verEleitosChapa = verEleitosChapa;

  function popularSelectChapas() {
    const dados = chapasAtual();
    const sel = $("#sim-chapa");
    if (!dados) { sel.innerHTML = ""; return; }
    const valorAntigo = sel.value;
    sel.innerHTML = dados.lista.map(c => `<option value="${esc(c.chave)}">${esc(c.nome)} — ${fmtN(c.total)} votos (${c.vagasTotal} vaga${c.vagasTotal === 1 ? "" : "s"} em 2022)</option>`).join("");
    if (dados.lista.some(c => c.chave === valorAntigo)) sel.value = valorAntigo;
    if (!$("#sim-votos-proprios").value) {
      const exp = Object.values(expectativaPorMunicipio()).reduce((a, b) => a + b, 0);
      $("#sim-votos-proprios").value = exp || "";
    }
  }

  /* ---------- Modo: Simulador de Chapa 2026 ---------- */
  function simularAlocacao(qe, vagas, listaOriginal, chaveAlvo, novoTotal) {
    const lista = listaOriginal.map(c => ({ chave: c.chave, nome: c.nome, partidos: c.partidos, total: c.chave === chaveAlvo ? novoTotal : c.total, vagasQP: 0, vagasSobra: 0 }));
    lista.forEach(c => { c.vagasQP = Math.floor(c.total / qe); });
    let sobras = Math.max(0, vagas - lista.reduce((a, c) => a + c.vagasQP, 0));
    for (let i = 0; i < sobras; i++) {
      let melhor = null, melhorMedia = -1;
      lista.forEach(c => { const media = c.total / (c.vagasQP + c.vagasSobra + 1); if (media > melhorMedia) { melhorMedia = media; melhor = c; } });
      melhor.vagasSobra++;
    }
    lista.forEach(c => { c.vagasTotal = c.vagasQP + c.vagasSobra; });
    return lista;
  }

  function simularChapa() {
    const cargo = $("#cand-cargo").value;
    const dados = chapasAtual();
    const chave = $("#sim-chapa").value;
    const chapaReal = dados.lista.find(c => c.chave === chave);
    if (!chapaReal) return;
    const votosProprios = Number($("#sim-votos-proprios").value) || 0;
    const votosResto = Number($("#sim-votos-resto").value) || 0;
    const novoTotal = votosProprios + votosResto;

    const listaSimulada = simularAlocacao(dados.qe, dados.vagas, dados.lista, chave, novoTotal);
    const chapaSimulada = listaSimulada.find(c => c.chave === chave);
    const delta = chapaSimulada.vagasTotal - chapaReal.vagasTotal;

    const eleitos2022 = eleitosDaChapa(cargo, chapaReal);
    const votosOrdenados = eleitos2022.map(c => c.total).sort((a, b) => b - a);
    let posicaoTexto;
    if (chapaSimulada.vagasTotal === 0) {
      posicaoTexto = `Com esse total, a chapa <b style="color:var(--err)">não elegeria ninguém</b> nesta simulação.`;
    } else if (chapaSimulada.vagasTotal > votosOrdenados.length) {
      posicaoTexto = `A chapa elegeria <b>${chapaSimulada.vagasTotal}</b> — mais do que em 2022 (${votosOrdenados.length}). Não há referência histórica para a(s) vaga(s) extra, mas ${fmtN(votosProprios)} votos pessoais é uma posição forte dentro da chapa.`;
    } else {
      const corte = votosOrdenados[chapaSimulada.vagasTotal - 1];
      const passa = votosProprios >= corte;
      posicaoTexto = passa
        ? `Com <b>${fmtN(votosProprios)}</b> votos pessoais, você <b style="color:var(--ok)">superaria o corte histórico</b> (${fmtN(corte)} votos) para ser um(a) dos ${chapaSimulada.vagasTotal} eleitos da chapa, com base no padrão de 2022.`
        : `Com <b>${fmtN(votosProprios)}</b> votos pessoais, você ficaria <b style="color:var(--warn)">abaixo do corte histórico</b> (${fmtN(corte)} votos) para ser um(a) dos ${chapaSimulada.vagasTotal} eleitos da chapa, com base no padrão de 2022.`;
    }

    $("#sim-resultado").innerHTML = `
      <div class="det-grid" style="margin-bottom:14px">
        <div class="det-item"><div class="r">Total simulado da chapa</div><div class="v">${fmtN(novoTotal)}</div></div>
        <div class="det-item"><div class="r">Total da chapa em 2022</div><div class="v">${fmtN(chapaReal.total)}</div></div>
        <div class="det-item" style="border:1px solid var(--pri)"><div class="r">Vagas estimadas</div><div class="v" style="color:var(--pri2)">${chapaSimulada.vagasTotal}</div></div>
        <div class="det-item"><div class="r">Vagas em 2022</div><div class="v">${chapaReal.vagasTotal} ${delta !== 0 ? `<span style="font-size:13px;color:${delta > 0 ? "var(--ok)" : "var(--err)"}">(${delta > 0 ? "+" : ""}${delta})</span>` : ""}</div></div>
      </div>
      <div style="font-size:13px;color:var(--tx2);line-height:1.6">${posicaoTexto}</div>
      <div style="font-size:11.5px;color:var(--tx3);margin-top:10px">Simulação mantém as demais chapas nos valores reais de 2022 e usa o quociente eleitoral (QE) de 2022 como referência — é uma aproximação para orientar estratégia, não uma previsão exata do resultado de 2026.</div>`;
  }

  /* ---------- Simulador: chapa completa (candidato a candidato) ---------- */
  function addLinhaCandidatoSim(nomeDefault, votosDefault) {
    const div = document.createElement("div");
    div.className = "sim-cand-linha";
    div.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center";
    div.innerHTML = `
      <input type="text" class="sim-cand-nome" placeholder="Nome do candidato" value="${esc(nomeDefault || "")}" style="flex:2">
      <input type="number" class="sim-cand-votos" placeholder="Votos esperados" min="0" value="${votosDefault === "" ? "" : (votosDefault || "")}" style="flex:1">
      <button class="btn danger mini" type="button">✕</button>`;
    div.querySelector("button").onclick = () => div.remove();
    $("#sim-candidatos-lista").appendChild(div);
  }

  function simularChapaCompleta() {
    const cargo = $("#cand-cargo").value;
    const dados = chapasAtual();
    const chave = $("#sim-chapa").value;
    const chapaReal = dados.lista.find(c => c.chave === chave);
    if (!chapaReal) return;

    const candidatos = $$("#sim-candidatos-lista .sim-cand-linha").map(l => ({
      nome: l.querySelector(".sim-cand-nome").value.trim() || "Candidato sem nome",
      votos: Number(l.querySelector(".sim-cand-votos").value) || 0
    })).filter(c => c.votos > 0);

    if (!candidatos.length) { $("#sim-resultado").innerHTML = '<div class="vazio">Adicione ao menos um candidato com votos esperados.</div>'; return; }

    const legenda = Number($("#sim-legenda").value) || 0;
    const novoTotal = candidatos.reduce((a, c) => a + c.votos, 0) + legenda;

    const listaSimulada = simularAlocacao(dados.qe, dados.vagas, dados.lista, chave, novoTotal);
    const chapaSimulada = listaSimulada.find(c => c.chave === chave);
    const delta = chapaSimulada.vagasTotal - chapaReal.vagasTotal;
    const vagas = chapaSimulada.vagasTotal;
    const ordenados = [...candidatos].sort((a, b) => b.votos - a.votos);

    $("#sim-resultado").innerHTML = `
      <div class="det-grid" style="margin-bottom:14px">
        <div class="det-item"><div class="r">Total simulado da chapa</div><div class="v">${fmtN(novoTotal)}</div></div>
        <div class="det-item"><div class="r">Total da chapa em 2022</div><div class="v">${fmtN(chapaReal.total)}</div></div>
        <div class="det-item" style="border:1px solid var(--pri)"><div class="r">Vagas estimadas</div><div class="v" style="color:var(--pri2)">${vagas}</div></div>
        <div class="det-item"><div class="r">Vagas em 2022</div><div class="v">${chapaReal.vagasTotal} ${delta !== 0 ? `<span style="font-size:13px;color:${delta > 0 ? "var(--ok)" : "var(--err)"}">(${delta > 0 ? "+" : ""}${delta})</span>` : ""}</div></div>
      </div>
      <table class="tab"><thead><tr><th>#</th><th>Candidato</th><th class="num">Votos esperados</th><th>Resultado</th></tr></thead><tbody>
      ${ordenados.map((c, i) => `<tr>
        <td style="color:var(--tx3)">${i + 1}º</td>
        <td><b>${esc(c.nome)}</b></td>
        <td class="num">${fmtN(c.votos)}</td>
        <td>${i < vagas ? '<span class="tag verde">Eleito</span>' : '<span class="tag vermelho">Não eleito</span>'}</td>
      </tr>`).join("")}
      </tbody></table>
      ${legenda ? `<div style="font-size:12px;color:var(--tx2);margin-top:10px">+ ${fmtN(legenda)} votos de legenda estimados incluídos no total da chapa.</div>` : ""}
      <div style="font-size:11.5px;color:var(--tx3);margin-top:10px">A ordem de eleição dentro da chapa segue os mais votados entre os candidatos informados (lista aberta, como na eleição real). Simulação mantém as demais chapas nos valores reais de 2022 e usa o quociente eleitoral (QE) de 2022 como referência.</div>`;
  }

  /* ---------- Modo: 1 candidato ---------- */
  function renderCards(cand) {
    if (!cand) { $("#cand-cards").innerHTML = '<div class="vazio">Nenhum candidato encontrado com esse termo de busca.</div>'; return; }
    const munsComVoto = Object.values(cand.votos || {}).filter(v => v > 0).length;
    let munTop = null, votoTop = 0;
    Object.entries(cand.votos || {}).forEach(([id, v]) => { if (v > votoTop) { votoTop = v; munTop = MUNI_BY_ID[id]; } });
    $("#cand-cards").innerHTML = `
      <div class="card-kpi destaque"><div class="rotulo">Total de votos (PR)</div><div class="valor">${fmtN(cand.total)}</div>
        <div class="extra">${esc(cand.partido)} ${/^ELEITO/.test(cand.situacao) ? '<span class="tag verde">Eleito</span>' : cand.situacao === "SUPLENTE" ? '<span class="tag amarelo">Suplente</span>' : '<span class="tag cinza">Não eleito</span>'}</div></div>
      <div class="card-kpi"><div class="rotulo">Municípios com votos</div><div class="valor">${munsComVoto} <span style="font-size:13px;color:var(--tx3)">/ 399</span></div></div>
      <div class="card-kpi"><div class="rotulo">Município onde mais votou</div><div class="valor" style="font-size:17px">${munTop ? esc(munTop.nome) : "—"}</div>
        <div class="extra">${munTop ? fmtN(votoTop) + " votos" : ""}</div></div>
      <div class="card-kpi"><div class="rotulo">Nome completo</div><div class="valor" style="font-size:15px">${esc(cand.nome)}</div><div class="extra">nº ${esc(cand.numero)}</div></div>`;
  }

  function renderIndicacoes(cand) {
    const cont = $("#cand-indicacoes");
    const cargo = $("#cand-cargo").value;
    if (cargo !== "est") { cont.innerHTML = ""; return; }
    if (!cand) { cont.innerHTML = ""; return; }
    const municipiosIndicando = MUNI.filter(m =>
      Array.isArray(m.indicacaoDeputadoEstadual) && m.indicacaoDeputadoEstadual.some(d => d.numero === cand.numero)
    ).sort((a, b) => (b.eleitorado2024 || 0) - (a.eleitorado2024 || 0));

    if (!municipiosIndicando.length) {
      cont.innerHTML = `<div class="painel"><div style="font-size:12.5px;color:var(--tx2)">Não consta como indicado por nenhum prefeito na lista de indicação parcial (COAP/Casa Civil, 27/02/2025).</div></div>`;
      return;
    }
    cont.innerHTML = `
      <div class="painel">
        <h3 style="margin-bottom:10px">🤝 Indicado por prefeitos em ${municipiosIndicando.length} município(s)</h3>
        <table class="tab"><thead><tr><th>Município</th><th>Mesorregião</th><th class="num">Eleitorado</th><th>Prefeito 2024</th></tr></thead><tbody>
        ${municipiosIndicando.map(m => {
          const p = m.prefeitos?.["2024"];
          return `<tr class="clicavel" onclick="abrirMunicipio(${m.id})">
            <td><b>${esc(m.nome)}</b></td>
            <td style="color:var(--tx2)">${esc(m.meso.replace(" Paranaense", ""))}</td>
            <td class="num">${fmtN(m.eleitorado2024)}</td>
            <td>${p ? esc(p.nomeUrna) + " (" + esc(p.partido) + ")" : "—"}</td>
          </tr>`;
        }).join("")}
        </tbody></table>
        <div style="font-size:11px;color:var(--tx3);margin-top:8px">Fonte: indicação parcial de deputados estaduais — COAP/Casa Civil (27/02/2025). Pode não refletir alianças atuais.</div>
      </div>`;
  }

  function renderTabela(cand) {
    if (modo !== "1") return;
    if (!cand) { $("#cand-tabela-municipios").innerHTML = ""; return; }
    const linhas = Object.entries(cand.votos || {})
      .map(([id, v]) => ({ m: MUNI_BY_ID[id], v }))
      .filter(x => x.m && x.v > 0)
      .sort((a, b) => b.v - a.v);
    $("#cand-tabela-municipios").innerHTML = `
      <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">${linhas.length} município(s) com votos para ${esc(cand.nomeUrna)}</div>
      <table class="tab"><thead><tr><th>Município</th><th>Mesorregião</th><th class="num">Votos</th><th class="num">% do eleitorado local</th></tr></thead><tbody>
      ${linhas.map(x => `<tr class="clicavel" onclick="abrirMunicipio(${x.m.id})">
        <td><b>${esc(x.m.nome)}</b></td>
        <td style="color:var(--tx2)">${esc(x.m.meso.replace(" Paranaense", ""))}</td>
        <td class="num"><b>${fmtN(x.v)}</b></td>
        <td class="num">${x.m.eleitorado2024 ? (x.v / x.m.eleitorado2024 * 100).toFixed(2) + "%" : "—"}</td>
      </tr>`).join("")}
      </tbody></table>`;
  }

  async function obterMapa() {
    if (!mapaCand) mapaCand = L.map("mapa-cand", { zoomSnap: 0.25, attributionControl: false }).setView([-24.6, -51.6], 6.75);
    if (camadaCand) { camadaCand.remove(); camadaCand = null; }
    if (legendaCand) { legendaCand.remove(); legendaCand = null; }
    return mapaCand;
  }

  async function renderMapaUnico(cand) {
    if (modo !== "1") return;
    $("#cand-mapa-titulo").textContent = cand ? `Mapa de votação — ${cand.nomeUrna} (${cand.partido})` : "Mapa de votação";
    const elMapa = $("#mapa-cand");
    if (!elMapa || !$("#page-candidatos").classList.contains("ativa")) return;
    try {
      const geo = await carregarGeoJson();
      await obterMapa();

      const votosPorId = (cand && cand.votos) || {};
      const valorDe = m => Number(votosPorId[m.id]) || 0;
      const vals = MUNI.map(valorDe).filter(v => v > 0).sort((a, b) => a - b);
      const q = p => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] : 0;
      const limites = [q(.2), q(.4), q(.6), q(.8), q(.95)];
      const corDe = m => {
        const v = valorDe(m);
        if (!v) return ESCALA_CAND[0];
        for (let i = limites.length - 1; i >= 0; i--) if (v >= limites[i]) return ESCALA_CAND[i + 1];
        return ESCALA_CAND[1];
      };
      const legendaHtml = cand
        ? `<b>Votos de ${esc(cand.nomeUrna)}</b><br>` + limites.map((l, i) => `<i style="background:${ESCALA_CAND[i + 1]}"></i>≥ ${fmtN(l)}`).reverse().join("<br>") + `<br><i style="background:${ESCALA_CAND[0]}"></i>zero`
        : "<b>Escolha um candidato</b>";

      camadaCand = L.geoJSON(geo, {
        style: f => ({ fillColor: corDe(MUNI_BY_ID[Number(f.properties.codarea)] || {}), weight: 0.6, color: "#0d1220", fillOpacity: 0.9 }),
        onEachFeature: (f, layer) => {
          const m = MUNI_BY_ID[Number(f.properties.codarea)];
          if (!m) return;
          const v = valorDe(m);
          layer.bindTooltip(`<b>${esc(m.nome)}</b><br>${cand ? esc(cand.nomeUrna) + ": " + fmtN(v) + " votos" : "selecione um candidato"}`, { sticky: true });
          layer.on("click", () => abrirMunicipio(m.id));
          layer.on("mouseover", () => layer.setStyle({ weight: 2, color: "#60a5fa" }));
          layer.on("mouseout", () => camadaCand.resetStyle(layer));
        }
      }).addTo(mapaCand);

      legendaCand = L.control({ position: "bottomright" });
      legendaCand.onAdd = () => { const d = L.DomUtil.create("div", "mapa-legenda"); d.innerHTML = legendaHtml; return d; };
      legendaCand.addTo(mapaCand);
    } catch (e) {
      elMapa.innerHTML = `<div class="vazio">Não foi possível carregar o mapa.<br>${esc(e.message)}</div>`;
    }
  }

  /* ---------- Modo: comparar 2 candidatos ---------- */
  function renderCardsComparacao(a, b) {
    if (!a || !b) { $("#cand-cards-comparar").innerHTML = '<div class="vazio">Escolha os dois candidatos para comparar.</div>'; return; }
    const votosA = a.votos || {}, votosB = b.votos || {};
    const todosIds = new Set([...Object.keys(votosA), ...Object.keys(votosB)]);
    let munA = 0, munB = 0;
    let maiorVantA = null, maiorVantAValor = -Infinity, maiorVantB = null, maiorVantBValor = -Infinity;
    todosIds.forEach(id => {
      const va = votosA[id] || 0, vb = votosB[id] || 0;
      if (va > vb) { munA++; if (va - vb > maiorVantAValor) { maiorVantAValor = va - vb; maiorVantA = MUNI_BY_ID[id]; } }
      else if (vb > va) { munB++; if (vb - va > maiorVantBValor) { maiorVantBValor = vb - va; maiorVantB = MUNI_BY_ID[id]; } }
    });
    $("#cand-cards-comparar").innerHTML = `
      <div class="card-kpi destaque"><div class="rotulo">${esc(a.nomeUrna)}</div><div class="valor" style="color:#60a5fa">${fmtN(a.total)}</div><div class="extra">${esc(a.partido)} — vence em ${munA} município(s)</div></div>
      <div class="card-kpi destaque"><div class="rotulo">${esc(b.nomeUrna)}</div><div class="valor" style="color:#fb923c">${fmtN(b.total)}</div><div class="extra">${esc(b.partido)} — vence em ${munB} município(s)</div></div>
      <div class="card-kpi"><div class="rotulo">Maior vantagem de ${esc(a.nomeUrna)}</div><div class="valor" style="font-size:15px">${maiorVantA ? esc(maiorVantA.nome) : "—"}</div><div class="extra">${maiorVantA ? "+" + fmtN(maiorVantAValor) + " votos" : ""}</div></div>
      <div class="card-kpi"><div class="rotulo">Maior vantagem de ${esc(b.nomeUrna)}</div><div class="valor" style="font-size:15px">${maiorVantB ? esc(maiorVantB.nome) : "—"}</div><div class="extra">${maiorVantB ? "+" + fmtN(maiorVantBValor) + " votos" : ""}</div></div>`;
  }

  function renderTabelaComparacao(a, b) {
    if (modo !== "2") return;
    if (!a || !b) { $("#cand-tabela-municipios").innerHTML = ""; return; }
    const votosA = a.votos || {}, votosB = b.votos || {};
    const ids = new Set([...Object.keys(votosA), ...Object.keys(votosB)]);
    const linhas = [...ids].map(id => ({ m: MUNI_BY_ID[id], va: votosA[id] || 0, vb: votosB[id] || 0 })).filter(x => x.m && (x.va > 0 || x.vb > 0));
    linhas.sort((x, y) => Math.abs(y.va - y.vb) - Math.abs(x.va - x.vb));
    $("#cand-tabela-municipios").innerHTML = `
      <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">${linhas.length} município(s) — ordenado pela maior diferença entre os dois</div>
      <table class="tab"><thead><tr><th>Município</th><th class="num">${esc(a.nomeUrna)}</th><th class="num">${esc(b.nomeUrna)}</th><th class="num">Vantagem</th></tr></thead><tbody>
      ${linhas.map(x => {
        const dif = x.va - x.vb;
        const cor = dif > 0 ? "#60a5fa" : dif < 0 ? "#fb923c" : "var(--tx3)";
        const texto = dif === 0 ? "empate" : (dif > 0 ? "+" : "") + fmtN(dif) + " " + (dif > 0 ? esc(a.nomeUrna) : esc(b.nomeUrna));
        return `<tr class="clicavel" onclick="abrirMunicipio(${x.m.id})">
          <td><b>${esc(x.m.nome)}</b></td>
          <td class="num">${fmtN(x.va)}</td>
          <td class="num">${fmtN(x.vb)}</td>
          <td class="num" style="color:${cor}"><b>${texto}</b></td>
        </tr>`;
      }).join("")}
      </tbody></table>`;
  }

  function corMargem(paleta, margem) {
    if (margem >= .6) return paleta[5];
    if (margem >= .4) return paleta[4];
    if (margem >= .25) return paleta[3];
    if (margem >= .1) return paleta[2];
    return paleta[1];
  }

  async function renderMapaComparacao(a, b) {
    if (modo !== "2") return;
    $("#cand-mapa-titulo").textContent = (a && b) ? `Comparação — ${a.nomeUrna} vs ${b.nomeUrna}` : "Comparação de candidatos";
    const elMapa = $("#mapa-cand");
    if (!elMapa || !$("#page-candidatos").classList.contains("ativa")) return;
    try {
      const geo = await carregarGeoJson();
      await obterMapa();

      if (!a || !b) {
        camadaCand = L.geoJSON(geo, { style: () => ({ fillColor: "#1e2740", weight: 0.6, color: "#0d1220", fillOpacity: 0.9 }) }).addTo(mapaCand);
        legendaCand = L.control({ position: "bottomright" });
        legendaCand.onAdd = () => { const d = L.DomUtil.create("div", "mapa-legenda"); d.innerHTML = "<b>Escolha os dois candidatos</b>"; return d; };
        legendaCand.addTo(mapaCand);
        return;
      }

      const votosA = a.votos || {}, votosB = b.votos || {};
      const corDe = m => {
        const va = Number(votosA[m.id]) || 0, vb = Number(votosB[m.id]) || 0;
        if (va === 0 && vb === 0) return "#1e2740";
        if (va === vb) return COR_EMPATE;
        const margem = Math.abs(va - vb) / (va + vb);
        return va > vb ? corMargem(ESCALA_A, margem) : corMargem(ESCALA_B, margem);
      };

      camadaCand = L.geoJSON(geo, {
        style: f => ({ fillColor: corDe(MUNI_BY_ID[Number(f.properties.codarea)] || { id: -1 }), weight: 0.6, color: "#0d1220", fillOpacity: 0.9 }),
        onEachFeature: (f, layer) => {
          const m = MUNI_BY_ID[Number(f.properties.codarea)];
          if (!m) return;
          const va = Number(votosA[m.id]) || 0, vb = Number(votosB[m.id]) || 0;
          layer.bindTooltip(`<b>${esc(m.nome)}</b><br>${esc(a.nomeUrna)}: ${fmtN(va)}<br>${esc(b.nomeUrna)}: ${fmtN(vb)}`, { sticky: true });
          layer.on("click", () => abrirMunicipio(m.id));
          layer.on("mouseover", () => layer.setStyle({ weight: 2, color: "#fff" }));
          layer.on("mouseout", () => camadaCand.resetStyle(layer));
        }
      }).addTo(mapaCand);

      legendaCand = L.control({ position: "bottomright" });
      legendaCand.onAdd = () => {
        const d = L.DomUtil.create("div", "mapa-legenda");
        d.innerHTML = `<b>${esc(a.nomeUrna)}</b> domina<br>` +
          [5, 4, 3, 2, 1].map(i => `<i style="background:${ESCALA_A[i]}"></i>margem ${i === 5 ? "≥60%" : i === 4 ? "40–60%" : i === 3 ? "25–40%" : i === 2 ? "10–25%" : "<10%"}`).join("<br>") +
          `<br><br><b>${esc(b.nomeUrna)}</b> domina<br>` +
          [1, 2, 3, 4, 5].map(i => `<i style="background:${ESCALA_B[i]}"></i>margem ${i === 1 ? "<10%" : i === 2 ? "10–25%" : i === 3 ? "25–40%" : i === 4 ? "40–60%" : "≥60%"}`).join("<br>");
        return d;
      };
      legendaCand.addTo(mapaCand);
    } catch (e) {
      elMapa.innerHTML = `<div class="vazio">Não foi possível carregar o mapa.<br>${esc(e.message)}</div>`;
    }
  }
})();
