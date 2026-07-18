/* =====================================================================
   BI Paraná — Lideranças, Expectativa de Votos e Agenda
   ===================================================================== */

const FUNCOES_LIDERANCA = ["Vereador(a)", "Ex-prefeito(a)", "Prefeito(a)", "Vice-prefeito(a)", "Presidente de partido",
  "Empresário(a)", "Líder comunitário", "Líder religioso", "Sindicalista", "Produtor rural",
  "Servidor público", "Profissional da saúde", "Professor(a)", "Cabo eleitoral", "Outro"];

const STATUS_INFO = {
  confirmada: { rotulo: "Confirmada", tag: "verde" },
  em_conversa: { rotulo: "Em conversa", tag: "amarelo" },
  indecisa: { rotulo: "Indecisa", tag: "cinza" },
  perdida: { rotulo: "Perdida", tag: "vermelho" }
};
function tagStatus(s) {
  const i = STATUS_INFO[s] || { rotulo: s || "—", tag: "cinza" };
  return `<span class="tag ${i.tag}">${esc(i.rotulo)}</span>`;
}
window.tagStatus = tagStatus;

/* ================== PÁGINA LIDERANÇAS ================== */
(() => {
  let inicializado = false;
  function init() {
    if (inicializado) return;
    inicializado = true;
    selectMunicipios($("#lid-municipio"), true);
    $("#lid-funcao").innerHTML = '<option value="">Todas</option>' + FUNCOES_LIDERANCA.map(f => `<option>${esc(f)}</option>`).join("");
    ["lid-busca", "lid-municipio", "lid-status", "lid-funcao"].forEach(id => $("#" + id).addEventListener("input", render));
    $("#btn-nova-lideranca").onclick = () => novaLideranca();
  }

  function render() {
    init();
    const busca = ($("#lid-busca").value || "").toLowerCase();
    const munId = $("#lid-municipio").value;
    const status = $("#lid-status").value;
    const funcao = $("#lid-funcao").value;

    const lista = BI.liderancas.filter(l => {
      const mun = MUNI_BY_ID[l.municipioId];
      if (busca && !(l.nome || "").toLowerCase().includes(busca) &&
          !(l.apelido || "").toLowerCase().includes(busca) &&
          !(mun && mun.nome.toLowerCase().includes(busca))) return false;
      if (munId && String(l.municipioId) !== munId) return false;
      if (status && l.status !== status) return false;
      if (funcao && l.funcao !== funcao) return false;
      return true;
    });

    const totalExp = BI.liderancas.reduce((a, l) => a + expectativaLideranca(l), 0);
    const confirmadas = BI.liderancas.filter(l => l.status === "confirmada");
    $("#lid-cards").innerHTML = `
      <div class="card-kpi"><div class="rotulo">Total de lideranças</div><div class="valor">${BI.liderancas.length}</div></div>
      <div class="card-kpi"><div class="rotulo">Confirmadas</div><div class="valor" style="color:var(--ok)">${confirmadas.length}</div></div>
      <div class="card-kpi"><div class="rotulo">Em conversa</div><div class="valor" style="color:var(--warn)">${BI.liderancas.filter(l => l.status === "em_conversa").length}</div></div>
      <div class="card-kpi"><div class="rotulo">Municípios cobertos</div><div class="valor">${Object.keys(liderancasPorMunicipio()).length} / 399</div></div>
      <div class="card-kpi destaque"><div class="rotulo">Expectativa total</div><div class="valor">${fmtN(totalExp)}</div><div class="extra">votos projetados</div></div>`;

    $("#lid-tabela").innerHTML = lista.length ? `
      <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">${lista.length} liderança(s)</div>
      <table class="tab"><thead><tr><th>Nome</th><th>Município</th><th>Função</th><th>Contato</th><th>Status</th>
        <th class="num">Potencial</th><th class="num">Confiança</th><th class="num">Expectativa</th><th></th></tr></thead><tbody>
      ${lista.map(l => {
        const mun = MUNI_BY_ID[l.municipioId];
        return `<tr class="clicavel" onclick="editarLideranca('${l.id}')">
          <td><b>${esc(l.nome)}</b>${l.apelido ? `<br><span style="font-size:11px;color:var(--tx3)">${esc(l.apelido)}</span>` : ""}</td>
          <td>${mun ? esc(mun.nome) : "—"}</td>
          <td style="color:var(--tx2)">${esc(l.funcao || "—")}</td>
          <td style="color:var(--tx2);font-size:12px">${esc(l.telefone || "—")}</td>
          <td>${tagStatus(l.status)}</td>
          <td class="num">${fmtN(l.potencialVotos)}</td>
          <td class="num">${l.confianca != null ? l.confianca + "%" : "100%"}</td>
          <td class="num"><b>${fmtN(expectativaLideranca(l))}</b></td>
          <td><button class="btn danger mini" onclick="event.stopPropagation();excluirLideranca('${l.id}','${esc(l.nome)}')">✕</button></td>
        </tr>`;
      }).join("")}
      </tbody></table>` : '<div class="vazio">Nenhuma liderança encontrada. Clique em "+ Nova liderança" para começar.</div>';
  }

  PAGES.liderancas = { render };
})();

/* ---------- Formulário de liderança ---------- */
function formLideranca(l, municipioPre) {
  const munSel = l?.municipioId || municipioPre || "";
  return `
    <h3>${l ? "Editar" : "Nova"} liderança</h3>
    <div class="form-grid">
      <div class="span2"><label>Nome completo *</label><input id="f-nome" value="${esc(l?.nome || "")}"></div>
      <div><label>Apelido / como é conhecido</label><input id="f-apelido" value="${esc(l?.apelido || "")}"></div>
      <div><label>Município *</label><select id="f-municipio"></select></div>
      <div><label>Função / perfil</label><select id="f-funcao">${FUNCOES_LIDERANCA.map(f => `<option ${l?.funcao === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></div>
      <div><label>Partido (se tiver)</label><input id="f-partido" value="${esc(l?.partido || "")}"></div>
      <div><label>Telefone / WhatsApp</label><input id="f-telefone" value="${esc(l?.telefone || "")}"></div>
      <div><label>E-mail</label><input id="f-email" value="${esc(l?.email || "")}"></div>
      <div><label>Potencial de votos *</label><input id="f-potencial" type="number" min="0" value="${l?.potencialVotos ?? ""}"></div>
      <div><label>Confiança na entrega (%)</label><input id="f-confianca" type="number" min="0" max="100" value="${l?.confianca ?? 100}"></div>
      <div><label>Status</label><select id="f-status">${Object.entries(STATUS_INFO).map(([k, v]) => `<option value="${k}" ${l?.status === k ? "selected" : ""}>${v.rotulo}</option>`).join("")}</select></div>
      <div class="span2"><label>Observações</label><textarea id="f-obs" rows="2">${esc(l?.obs || "")}</textarea></div>
    </div>
    <div class="modal-acoes">
      <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn" onclick="salvarLideranca('${l?.id || ""}')">Salvar</button>
    </div>`;
}

function novaLideranca(municipioPre) {
  Modal.abrir(formLideranca(null, municipioPre));
  selectMunicipios($("#f-municipio"), false);
  $("#f-municipio").value = municipioPre || MUNI[0].id;
}
window.novaLideranca = novaLideranca;

function editarLideranca(id) {
  const l = BI.liderancas.find(x => x.id === id);
  if (!l) return;
  Modal.abrir(formLideranca(l));
  selectMunicipios($("#f-municipio"), false);
  $("#f-municipio").value = l.municipioId;
}
window.editarLideranca = editarLideranca;

async function salvarLideranca(id) {
  const dados = {
    nome: $("#f-nome").value.trim(),
    apelido: $("#f-apelido").value.trim(),
    municipioId: Number($("#f-municipio").value),
    funcao: $("#f-funcao").value,
    partido: $("#f-partido").value.trim(),
    telefone: $("#f-telefone").value.trim(),
    email: $("#f-email").value.trim(),
    potencialVotos: Number($("#f-potencial").value) || 0,
    confianca: Math.min(100, Math.max(0, Number($("#f-confianca").value) || 0)),
    status: $("#f-status").value,
    obs: $("#f-obs").value.trim(),
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoPor: BI.perfil.username
  };
  if (!dados.nome) return toast("Informe o nome da liderança.", "erro");
  if (!dados.municipioId) return toast("Escolha o município.", "erro");
  try {
    if (id) await colCampanha("liderancas").doc(id).update(dados);
    else {
      dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
      dados.criadoPor = BI.perfil.username;
      await colCampanha("liderancas").add(dados);
    }
    Modal.fechar();
    toast("Liderança salva!", "ok");
  } catch (e) { toast("Erro ao salvar: " + e.message, "erro"); }
}
window.salvarLideranca = salvarLideranca;

function excluirLideranca(id, nome) {
  Modal.abrir(`<h3>Excluir liderança</h3>
    <p style="font-size:13.5px;color:var(--tx2)">Tem certeza que deseja excluir <b style="color:var(--tx)">${nome}</b>? Essa ação não pode ser desfeita.</p>
    <div class="modal-acoes">
      <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn danger" onclick="confirmarExclusaoLideranca('${id}')">Excluir</button>
    </div>`);
}
window.excluirLideranca = excluirLideranca;
async function confirmarExclusaoLideranca(id) {
  try { await colCampanha("liderancas").doc(id).delete(); Modal.fechar(); toast("Liderança excluída.", "ok"); }
  catch (e) { toast("Erro: " + e.message, "erro"); }
}
window.confirmarExclusaoLideranca = confirmarExclusaoLideranca;

/* ================== PÁGINA EXPECTATIVA DE VOTOS ================== */
(() => {
  let inicializado = false;
  function init() {
    if (inicializado) return;
    inicializado = true;
    selectMesos($("#votos-meso"));
    ["votos-busca", "votos-meso", "votos-filtro"].forEach(id => $("#" + id).addEventListener("input", render));
    $("#btn-carregar-quociente").onclick = async () => {
      const btn = $("#btn-carregar-quociente");
      btn.disabled = true; btn.textContent = "Carregando...";
      try { await carregarVotosDeputados(); renderQuociente(); btn.style.display = "none"; }
      catch (e) { toast(e.message, "erro"); btn.disabled = false; btn.textContent = "Carregar comparação"; }
    };
  }

  function cargoAtualCodigo() { return BI.config.cargo === "Deputado Federal" ? "fed" : "est"; }

  function estatisticasEleitos(cargo) {
    const lista = (window.VOTOS_DEPUTADOS && window.VOTOS_DEPUTADOS[cargo]) || [];
    const eleitos = lista.filter(c => /^ELEITO/.test(c.situacao))
      .map(c => ({ nomeUrna: c.nomeUrna, partido: c.partido, total: c.total }))
      .sort((a, b) => a.total - b.total);
    if (!eleitos.length) return null;
    const soma = eleitos.reduce((a, c) => a + c.total, 0);
    return {
      vagas: eleitos.length,
      minimo: eleitos[0],
      mediana: eleitos[Math.floor(eleitos.length / 2)],
      media: Math.round(soma / eleitos.length),
      eleitos
    };
  }

  function renderQuociente() {
    const cont = $("#quociente-conteudo");
    if (!window.VOTOS_DEPUTADOS) return;
    const cargo = cargoAtualCodigo();
    const stats = estatisticasEleitos(cargo);
    if (!stats) { cont.innerHTML = '<div class="vazio">Sem dados suficientes para este cargo.</div>'; return; }
    const exp = Object.values(expectativaPorMunicipio()).reduce((a, b) => a + b, 0);
    const cargoTxt = cargo === "fed" ? "Deputado Federal" : "Deputado Estadual";

    cont.innerHTML = `
      <div style="font-size:12.5px;color:var(--tx2);margin-bottom:12px">Com base nos ${stats.vagas} candidatos eleitos a <b>${esc(cargoTxt)}</b> no Paraná em 2022.</div>
      <div class="det-grid" style="margin-bottom:14px">
        <div class="det-item"><div class="r">Sua expectativa atual</div><div class="v" style="color:var(--pri2)">${fmtN(exp)}</div></div>
        <div class="det-item"><div class="r">Mínimo para eleger (2022)</div><div class="v">${fmtN(stats.minimo.total)}</div></div>
        <div class="det-item"><div class="r">Mediana dos eleitos</div><div class="v">${fmtN(stats.mediana.total)}</div></div>
        <div class="det-item"><div class="r">Média dos eleitos</div><div class="v">${fmtN(stats.media)}</div></div>
      </div>
      <div class="chart-box baixo"><canvas id="chart-quociente"></canvas></div>
      <div style="font-size:12.5px;color:var(--tx2);margin-top:12px" id="quociente-mensagem"></div>
      <h4 style="font-size:12.5px;margin:14px 0 6px;color:var(--tx2)">Os 5 eleitos com menor votação em 2022 (referência do "corte")</h4>
      <table class="tab"><thead><tr><th>Candidato</th><th>Partido</th><th class="num">Votos</th></tr></thead><tbody>
      ${stats.eleitos.slice(0, 5).map(c => `<tr><td><b>${esc(c.nomeUrna)}</b></td><td><span class="tag azul">${esc(c.partido)}</span></td><td class="num">${fmtN(c.total)}</td></tr>`).join("")}
      </tbody></table>`;

    novoChart("chart-quociente", {
      type: "bar",
      data: {
        labels: ["Sua expectativa", "Mínimo p/ eleger", "Mediana eleitos", "Média eleitos"],
        datasets: [{ data: [exp, stats.minimo.total, stats.mediana.total, stats.media], backgroundColor: ["#3b82f6", "#64748b", "#64748b", "#64748b"], borderRadius: 4 }]
      },
      options: { maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { grid: { color: "#1e2740" } }, y: { grid: { display: false } } } }
    });

    const msg = $("#quociente-mensagem");
    if (exp >= stats.minimo.total) {
      const faltamMedia = Math.max(0, stats.media - exp);
      msg.innerHTML = `✅ Sua expectativa atual já <b style="color:var(--ok)">supera o mínimo histórico</b> para eleger em 2022.${faltamMedia ? ` Faltam ${fmtN(faltamMedia)} votos para chegar à média dos eleitos.` : " Você já está acima da média dos eleitos!"}`;
    } else {
      msg.innerHTML = `⚠️ Faltam <b style="color:var(--warn)">${fmtN(stats.minimo.total - exp)} votos</b> para chegar ao mínimo histórico de quem se elegeu em 2022.`;
    }
  }

  function render() {
    init();
    const exp = expectativaPorMunicipio();
    const lidPorMun = liderancasPorMunicipio();
    const totalExp = Object.values(exp).reduce((a, b) => a + b, 0);
    const metaTotal = Number(BI.config.metaTotal) || 0;
    const somaMetas = Object.values(BI.metas).reduce((a, m) => a + (Number(m.metaVotos) || 0), 0);
    const eleitTotal = MUNI.reduce((a, m) => a + (m.eleitorado2024 || 0), 0);

    if (BI.config.nomeCandidato) {
      $("#votos-sub").textContent = `Projeção de votos de ${BI.config.nomeCandidato} para ${BI.config.cargo || "Deputado"} com base nas lideranças`;
    }

    $("#votos-cards").innerHTML = `
      <div class="card-kpi destaque"><div class="rotulo">Expectativa total</div><div class="valor">${fmtN(totalExp)}</div>
        <div class="extra">${(totalExp / eleitTotal * 100).toFixed(2)}% do eleitorado do PR</div></div>
      <div class="card-kpi"><div class="rotulo">Meta da campanha</div><div class="valor">${metaTotal ? fmtN(metaTotal) : "—"}</div>
        <div class="extra">${metaTotal ? Math.round(totalExp / metaTotal * 100) + "% atingido" : "defina em Configurações"}</div></div>
      <div class="card-kpi"><div class="rotulo">Soma das metas municipais</div><div class="valor">${fmtN(somaMetas)}</div>
        <div class="extra">${Object.keys(BI.metas).length} municípios com meta</div></div>
      <div class="card-kpi"><div class="rotulo">Municípios com expectativa</div><div class="valor">${Object.keys(exp).filter(k => exp[k] > 0).length}</div></div>`;

    // gráfico por mesorregião (expectativa x soma de metas)
    const porMesoExp = {}, porMesoMeta = {};
    MESOS.forEach(ms => { porMesoExp[ms] = 0; porMesoMeta[ms] = 0; });
    MUNI.forEach(m => {
      porMesoExp[m.meso] += exp[m.id] || 0;
      porMesoMeta[m.meso] += Number(BI.metas[m.id]?.metaVotos) || 0;
    });
    novoChart("chart-votos-meso", {
      type: "bar",
      data: {
        labels: MESOS.map(x => x.replace(" Paranaense", "")),
        datasets: [
          { label: "Expectativa", data: MESOS.map(ms => porMesoExp[ms]), backgroundColor: "#3b82f6", borderRadius: 4 },
          { label: "Meta", data: MESOS.map(ms => porMesoMeta[ms]), backgroundColor: "#2a3552", borderRadius: 4 }
        ]
      },
      options: { maintainAspectRatio: false, scales: { x: { ticks: { font: { size: 10 } }, grid: { display: false } }, y: { grid: { color: "#1e2740" } } } }
    });

    // tabela
    const busca = ($("#votos-busca").value || "").toLowerCase();
    const meso = $("#votos-meso").value;
    const filtro = $("#votos-filtro").value;
    let lista = MUNI.filter(m => {
      if (busca && !m.nome.toLowerCase().includes(busca)) return false;
      if (meso && m.meso !== meso) return false;
      if (filtro === "com" && !(exp[m.id] > 0)) return false;
      if (filtro === "meta" && !BI.metas[m.id]) return false;
      return true;
    }).sort((a, b) => (exp[b.id] || 0) - (exp[a.id] || 0));

    $("#votos-tabela").innerHTML = `
      <table class="tab"><thead><tr><th>Município</th><th class="num">Eleitorado</th><th class="num">Lideranças</th>
        <th class="num">Expectativa</th><th class="num">% eleitorado</th><th class="num">Meta</th><th>Progresso da meta</th></tr></thead><tbody>
      ${lista.map(m => {
        const e = exp[m.id] || 0;
        const meta = Number(BI.metas[m.id]?.metaVotos) || 0;
        const pct = meta ? Math.min(100, Math.round(e / meta * 100)) : 0;
        return `<tr class="clicavel" onclick="abrirMunicipio(${m.id})">
          <td><b>${esc(m.nome)}</b> <span style="font-size:11px;color:var(--tx3)">${esc(m.meso.replace(" Paranaense", ""))}</span></td>
          <td class="num">${fmtN(m.eleitorado2024)}</td>
          <td class="num">${lidPorMun[m.id] || 0}</td>
          <td class="num"><b style="color:${e > 0 ? "var(--pri2)" : "var(--tx3)"}">${fmtN(e)}</b></td>
          <td class="num">${m.eleitorado2024 && e ? (e / m.eleitorado2024 * 100).toFixed(1) + "%" : "—"}</td>
          <td class="num">${meta ? fmtN(meta) : "—"}</td>
          <td>${meta ? `<div style="display:flex;align-items:center;gap:8px"><div class="barra-prog" style="flex:1"><div style="width:${pct}%;background:${pct >= 100 ? "var(--ok)" : "var(--pri)"}"></div></div><span style="font-size:11px;color:var(--tx2)">${pct}%</span></div>` : '<span style="color:var(--tx3);font-size:11px">sem meta</span>'}</td>
        </tr>`;
      }).join("")}
      </tbody></table>`;

    if (window.VOTOS_DEPUTADOS) { $("#btn-carregar-quociente").style.display = "none"; renderQuociente(); }
  }

  PAGES.votos = { render };
})();

/* ================== PÁGINA AGENDA ================== */
(() => {
  let inicializado = false;
  function init() {
    if (inicializado) return;
    inicializado = true;
    $("#btn-novo-evento").onclick = () => abrirEvento();
  }

  function render() {
    init();
    const hoje = new Date().toISOString().slice(0, 10);
    const lista = [...BI.eventos];
    $("#agenda-tabela").innerHTML = lista.length ? `
      <table class="tab"><thead><tr><th>Data</th><th>Hora</th><th>Compromisso</th><th>Município</th><th>Responsável</th><th></th></tr></thead><tbody>
      ${lista.map(ev => {
        const mun = MUNI_BY_ID[ev.municipioId];
        const passado = ev.data < hoje;
        return `<tr class="clicavel" style="${passado ? "opacity:.5" : ""}" onclick="abrirEvento('${ev.id}')">
          <td><b>${esc(formatarData(ev.data))}</b>${ev.data === hoje ? ' <span class="tag verde">hoje</span>' : ""}</td>
          <td>${esc(ev.hora || "—")}</td>
          <td><b>${esc(ev.titulo)}</b>${ev.descricao ? `<br><span style="font-size:11.5px;color:var(--tx3)">${esc(ev.descricao)}</span>` : ""}</td>
          <td>${mun ? esc(mun.nome) : "—"}</td>
          <td style="color:var(--tx2)">${esc(ev.responsavel || "—")}</td>
          <td><button class="btn danger mini" onclick="event.stopPropagation();excluirEvento('${ev.id}')">✕</button></td>
        </tr>`;
      }).join("")}
      </tbody></table>` : '<div class="vazio">Nenhum compromisso agendado.</div>';
  }

  PAGES.agenda = { render };
})();

function abrirEvento(id) {
  const ev = id ? BI.eventos.find(x => x.id === id) : null;
  Modal.abrir(`
    <h3>${ev ? "Editar" : "Novo"} compromisso</h3>
    <div class="form-grid">
      <div><label>Data *</label><input id="f-ev-data" type="date" value="${ev?.data || ""}"></div>
      <div><label>Hora</label><input id="f-ev-hora" type="time" value="${ev?.hora || ""}"></div>
      <div class="span2"><label>Título *</label><input id="f-ev-titulo" value="${esc(ev?.titulo || "")}" placeholder="ex.: Reunião com lideranças"></div>
      <div><label>Município</label><select id="f-ev-municipio"></select></div>
      <div><label>Responsável</label><input id="f-ev-resp" value="${esc(ev?.responsavel || "")}"></div>
      <div class="span2"><label>Descrição</label><textarea id="f-ev-desc" rows="2">${esc(ev?.descricao || "")}</textarea></div>
    </div>
    <div class="modal-acoes">
      <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn" onclick="salvarEvento('${ev?.id || ""}')">Salvar</button>
    </div>`);
  const sel = $("#f-ev-municipio");
  sel.innerHTML = '<option value="">— nenhum —</option>' + MUNI.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join("");
  if (ev?.municipioId) sel.value = ev.municipioId;
}
window.abrirEvento = abrirEvento;

async function salvarEvento(id) {
  const dados = {
    data: $("#f-ev-data").value,
    hora: $("#f-ev-hora").value,
    titulo: $("#f-ev-titulo").value.trim(),
    municipioId: Number($("#f-ev-municipio").value) || null,
    responsavel: $("#f-ev-resp").value.trim(),
    descricao: $("#f-ev-desc").value.trim()
  };
  if (!dados.data || !dados.titulo) return toast("Informe ao menos data e título.", "erro");
  try {
    if (id) await colCampanha("eventos").doc(id).update(dados);
    else await colCampanha("eventos").add({ ...dados, criadoPor: BI.perfil.username });
    Modal.fechar(); toast("Compromisso salvo!", "ok");
  } catch (e) { toast("Erro: " + e.message, "erro"); }
}
window.salvarEvento = salvarEvento;

async function excluirEvento(id) {
  try { await colCampanha("eventos").doc(id).delete(); toast("Compromisso excluído.", "ok"); }
  catch (e) { toast("Erro: " + e.message, "erro"); }
}
window.excluirEvento = excluirEvento;
