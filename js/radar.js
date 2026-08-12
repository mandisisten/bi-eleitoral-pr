/* =====================================================================
   BI Paraná — Radar Municipal
   Visão consolidada de lideranças, expectativa de votos e um índice de
   prioridade (eleitorado grande + baixa cobertura = maior oportunidade)
   município a município.
   ===================================================================== */

(() => {
  let inicializado = false;
  let dadosAtual = [];

  const STATUS_INFO_RADAR = {
    forte: { rotulo: "Forte", tag: "verde" },
    parcial: { rotulo: "Parcial", tag: "amarelo" },
    vazio: { rotulo: "Sem cobertura", tag: "vermelho" }
  };
  function tagStatusRadar(s) {
    const i = STATUS_INFO_RADAR[s];
    return `<span class="tag ${i.tag}">${i.rotulo}</span>`;
  }
  function corPrioridade(v) {
    return v > 60 ? "var(--err)" : v > 30 ? "var(--warn)" : "var(--pri)";
  }

  function init() {
    if (inicializado) return;
    inicializado = true;
    selectMesos($("#radar-meso"));
    ["radar-busca", "radar-meso", "radar-status", "radar-ordenar"].forEach(id => $("#" + id).addEventListener("input", renderTabela));
  }

  function statusMunicipio(lids) {
    if (!lids.length) return "vazio";
    if (lids.some(l => l.status === "confirmada")) return "forte";
    return "parcial";
  }

  /* Índice de prioridade: cruza o tamanho do eleitorado (percentil entre os 399
     municípios) com o quanto da expectativa de votos já cobre esse eleitorado.
     Município grande + pouca expectativa registrada = prioridade alta (0-100). */
  function calcularDados() {
    const exp = expectativaPorMunicipio();
    const lidPorMun = {};
    BI.liderancas.forEach(l => { (lidPorMun[l.municipioId] = lidPorMun[l.municipioId] || []).push(l); });

    const eleitorados = MUNI.map(m => m.eleitorado2024 || 0).sort((a, b) => a - b);
    const percentil = v => {
      if (!eleitorados.length) return 0;
      let i = 0;
      while (i < eleitorados.length && eleitorados[i] < v) i++;
      return i / eleitorados.length;
    };

    return MUNI.map(m => {
      const lids = lidPorMun[m.id] || [];
      const expM = exp[m.id] || 0;
      const eleitorado = m.eleitorado2024 || 0;
      const coberturaPct = eleitorado ? Math.min(1, expM / eleitorado) : 0;
      const indicePrioridade = Math.round(percentil(eleitorado) * (1 - coberturaPct) * 100);
      return { m, lids, expectativa: expM, eleitorado, coberturaPct, status: statusMunicipio(lids), indicePrioridade };
    });
  }

  function renderCards(dados) {
    const cobertos = dados.filter(d => d.status !== "vazio").length;
    const fortes = dados.filter(d => d.status === "forte").length;
    const totalExp = dados.reduce((a, d) => a + d.expectativa, 0);
    const topOportunidade = [...dados].filter(d => d.eleitorado > 0).sort((a, b) => b.indicePrioridade - a.indicePrioridade)[0];

    $("#radar-cards").innerHTML = `
      <div class="card-kpi"><div class="rotulo">Municípios cobertos</div><div class="valor">${cobertos} <span style="font-size:13px;color:var(--tx3)">/ 399</span></div></div>
      <div class="card-kpi"><div class="rotulo">Cobertura forte</div><div class="valor" style="color:var(--ok)">${fortes}</div></div>
      <div class="card-kpi destaque"><div class="rotulo">Expectativa total</div><div class="valor">${fmtN(totalExp)}</div></div>
      <div class="card-kpi"><div class="rotulo">Maior oportunidade</div><div class="valor" style="font-size:16px">${topOportunidade ? esc(topOportunidade.m.nome) : "—"}</div>
        <div class="extra">${topOportunidade ? fmtN(topOportunidade.eleitorado) + " eleitores" : ""}</div></div>`;
  }

  function renderPrioridade(dados) {
    const top = [...dados].filter(d => d.eleitorado > 0).sort((a, b) => b.indicePrioridade - a.indicePrioridade).slice(0, 8);
    const maxIdx = top.length ? Math.max(1, top[0].indicePrioridade) : 1;
    $("#radar-prioridade").innerHTML = top.length ? top.map((d, i) => `
      <div class="clicavel" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #1e2740" onclick="abrirMunicipio(${d.m.id})">
        <div style="width:18px;color:var(--tx3);font-size:12px">${i + 1}º</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
            <b style="font-size:13px">${esc(d.m.nome)}</b>
            ${tagStatusRadar(d.status)}
          </div>
          <div style="font-size:11px;color:var(--tx3);margin:2px 0 4px">${fmtN(d.eleitorado)} eleitores · ${d.lids.length} liderança(s) · ${fmtN(d.expectativa)} votos esperados</div>
          <div class="barra-prog"><div style="width:${(d.indicePrioridade / maxIdx * 100)}%;background:${corPrioridade(d.indicePrioridade)}"></div></div>
        </div>
      </div>`).join("") : '<div class="vazio">Sem dados suficientes ainda.</div>';
  }

  function renderChartTop(dados) {
    const top = [...dados].filter(d => d.expectativa > 0).sort((a, b) => b.expectativa - a.expectativa).slice(0, 15);
    novoChart("chart-radar-top", {
      type: "bar",
      data: {
        labels: top.map(d => d.m.nome),
        datasets: [{ data: top.map(d => d.expectativa), backgroundColor: "#3b82f6", borderRadius: 4 }]
      },
      options: {
        indexAxis: "y", maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: "#1e2740" } }, y: { grid: { display: false }, ticks: { font: { size: 10.5 } } } }
      }
    });
  }

  function renderChartCobertura(dados) {
    const porMeso = {};
    MESOS.forEach(ms => porMeso[ms] = { forte: 0, parcial: 0, vazio: 0 });
    dados.forEach(d => { porMeso[d.m.meso][d.status]++; });
    novoChart("chart-radar-cobertura", {
      type: "bar",
      data: {
        labels: MESOS.map(x => x.replace(" Paranaense", "")),
        datasets: [
          { label: "Forte", data: MESOS.map(ms => porMeso[ms].forte), backgroundColor: "#22c55e", stack: "s" },
          { label: "Parcial", data: MESOS.map(ms => porMeso[ms].parcial), backgroundColor: "#eab308", stack: "s" },
          { label: "Sem cobertura", data: MESOS.map(ms => porMeso[ms].vazio), backgroundColor: "#374151", stack: "s" }
        ]
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, grid: { color: "#1e2740" } }
        }
      }
    });
  }

  function renderTabela() {
    const busca = ($("#radar-busca").value || "").toLowerCase();
    const meso = $("#radar-meso").value;
    const status = $("#radar-status").value;
    const ordenar = $("#radar-ordenar").value;

    let lista = dadosAtual.filter(d => {
      if (busca && !d.m.nome.toLowerCase().includes(busca)) return false;
      if (meso && d.m.meso !== meso) return false;
      if (status && d.status !== status) return false;
      return true;
    });

    const comparadores = {
      prioridade: (a, b) => b.indicePrioridade - a.indicePrioridade,
      expectativa: (a, b) => b.expectativa - a.expectativa,
      eleitorado: (a, b) => b.eleitorado - a.eleitorado,
      liderancas: (a, b) => b.lids.length - a.lids.length
    };
    lista = [...lista].sort(comparadores[ordenar] || comparadores.prioridade);

    $("#radar-tabela").innerHTML = lista.length ? `
      <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">${lista.length} município(s)</div>
      <table class="tab"><thead><tr><th>Município</th><th>Mesorregião</th><th>Status</th><th class="num">Eleitorado</th>
        <th class="num">Lideranças</th><th class="num">Expectativa</th><th class="num">% eleitorado</th><th>Prioridade</th></tr></thead><tbody>
      ${lista.map(d => `<tr class="clicavel" onclick="abrirMunicipio(${d.m.id})">
        <td><b>${esc(d.m.nome)}</b></td>
        <td style="color:var(--tx2);font-size:12px">${esc(d.m.meso.replace(" Paranaense", ""))}</td>
        <td>${tagStatusRadar(d.status)}</td>
        <td class="num">${fmtN(d.eleitorado)}</td>
        <td class="num">${d.lids.length}</td>
        <td class="num"><b>${fmtN(d.expectativa)}</b></td>
        <td class="num">${d.eleitorado ? (d.coberturaPct * 100).toFixed(2) + "%" : "—"}</td>
        <td><div style="display:flex;align-items:center;gap:6px"><div class="barra-prog" style="flex:1"><div style="width:${d.indicePrioridade}%;background:${corPrioridade(d.indicePrioridade)}"></div></div><span style="font-size:11px;color:var(--tx2)">${d.indicePrioridade}</span></div></td>
      </tr>`).join("")}
      </tbody></table>` : '<div class="vazio">Nenhum município encontrado com esses filtros.</div>';
  }

  function render() {
    init();
    dadosAtual = calcularDados();
    renderCards(dadosAtual);
    renderPrioridade(dadosAtual);
    renderChartTop(dadosAtual);
    renderChartCobertura(dadosAtual);
    renderTabela();
  }

  PAGES.radar = { render };
})();
