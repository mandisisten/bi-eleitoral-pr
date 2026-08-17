/* =====================================================================
   BI Paraná — Infográficos: mapas de calor e comparativos visuais
   Página só de visualização (sem edição) — 399 municípios de uma vez.
   ===================================================================== */

(() => {
  let inicializado = false;
  let mapasRenderizados = false;
  let rankAtivo = "potencial";
  const miniMapas = {};

  function init() {
    if (inicializado) return;
    inicializado = true;
    $$(".info-ranking-abas .chip-filtro").forEach(b => b.onclick = () => {
      rankAtivo = b.dataset.rank;
      $$(".info-ranking-abas .chip-filtro").forEach(x => x.classList.toggle("ativo", x === b));
      renderRanking();
    });
  }

  /* ---------- Escalas de cor ---------- */
  function corPorQuantil(valores, cores) {
    const ordenados = valores.filter(v => v > 0).sort((a, b) => a - b);
    const q = p => ordenados.length ? ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * p))] : 0;
    const limites = [q(.2), q(.4), q(.6), q(.8), q(.95)];
    return v => {
      if (!v) return cores[0];
      for (let i = limites.length - 1; i >= 0; i--) if (v >= limites[i]) return cores[i + 1];
      return cores[1];
    };
  }
  function corSaldoEmprego(saldo) {
    if (saldo == null) return "#1e2740";
    if (saldo > 50) return "#166534";
    if (saldo > 0) return "#22c55e";
    if (saldo === 0) return "#374151";
    if (saldo > -50) return "#f59e0b";
    return "#ef4444";
  }

  /* ---------- Mini-mapa de calor (estático — só visualização) ---------- */
  async function criarMiniMapa(geo, id, titulo, corDe, legendaHtml, formatarValor) {
    const card = document.createElement("div");
    card.className = "info-mapa-card";
    card.innerHTML = `<b>${titulo}</b><div class="info-mapa-leaflet" id="info-map-${id}"></div><div class="info-mapa-legenda">${legendaHtml}</div>`;
    $("#info-mapa-grid").appendChild(card);

    const map = L.map("info-map-" + id, {
      zoomSnap: 0.25, attributionControl: false, zoomControl: false,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, tap: false
    }).setView([-24.6, -51.6], 6.2);
    miniMapas[id] = map;

    L.geoJSON(geo, {
      style: f => ({ fillColor: corDe(MUNI_BY_ID[Number(f.properties.codarea)]), weight: 0.3, color: "#0d1220", fillOpacity: 0.92 }),
      onEachFeature: (f, layer) => {
        const m = MUNI_BY_ID[Number(f.properties.codarea)];
        if (!m) return;
        layer.bindTooltip(`<b>${esc(m.nome)}</b><br>${formatarValor(m)}`, { sticky: true });
      }
    }).addTo(map);
    setTimeout(() => map.invalidateSize(), 60);
  }

  async function renderMapas() {
    if (mapasRenderizados) return;
    mapasRenderizados = true;
    $("#info-mapa-grid").innerHTML = "";

    const geo = await carregarGeoJson();
    const exp = expectativaPorMunicipio();
    const lidPorMun = liderancasPorMunicipio();

    const corEleitorado = corPorQuantil(MUNI.map(m => m.eleitorado2024 || 0), ESCALAS.eleitorado.cores);
    await criarMiniMapa(geo, "eleitorado", "Eleitorado (2024)", m => corEleitorado(m.eleitorado2024 || 0),
      '<span>baixo</span><div class="ramp" style="background:linear-gradient(90deg,#1e2740,#86efac)"></div><span>alto</span>',
      m => fmtN(m.eleitorado2024) + " eleitores");

    const corPib = corPorQuantil(MUNI.map(m => m.pibPerCapita || 0), ESCALAS.pib.cores);
    await criarMiniMapa(geo, "pib", "PIB per capita", m => corPib(m.pibPerCapita || 0),
      '<span>baixo</span><div class="ramp" style="background:linear-gradient(90deg,#1e2740,#fcd34d)"></div><span>alto</span>',
      m => fmtR(m.pibPerCapita));

    const corExp = corPorQuantil(MUNI.map(m => exp[m.id] || 0), ESCALAS.expectativa.cores);
    await criarMiniMapa(geo, "expectativa", "Expectativa de votos", m => corExp(exp[m.id] || 0),
      '<span>baixo</span><div class="ramp" style="background:linear-gradient(90deg,#1e2740,#93c5fd)"></div><span>alto</span>',
      m => fmtN(exp[m.id] || 0) + " votos esperados");

    await criarMiniMapa(geo, "cobertura", "Cobertura de lideranças", m => lidPorMun[m.id] ? "#22c55e" : "#7f1d1d",
      '<span style="color:#fca5a5">sem liderança</span><span style="margin-left:auto;color:#86efac">com liderança</span>',
      m => lidPorMun[m.id] ? (lidPorMun[m.id] + " liderança(s)") : "sem liderança cadastrada");

    await criarMiniMapa(geo, "partido", "Partido do prefeito (2024)",
      m => { const p = m.prefeitos && m.prefeitos["2024"]; return p ? corPartido(p.partido) : "#374151"; },
      '<span>cor = partido — passe o mouse pra ver qual</span>',
      m => { const p = m.prefeitos && m.prefeitos["2024"]; return p ? esc(p.nomeUrna) + " (" + esc(p.partido) + ")" : "sem dados"; });

    const corLideranca = corPorQuantil(MUNI.map(m => lidPorMun[m.id] || 0), ["#1e2740", "#4c1d95", "#6d28d9", "#7c3aed", "#a78bfa", "#ddd6fe"]);
    await criarMiniMapa(geo, "liderancas", "Lideranças por município", m => corLideranca(lidPorMun[m.id] || 0),
      '<span>poucas</span><div class="ramp" style="background:linear-gradient(90deg,#1e2740,#ddd6fe)"></div><span>muitas</span>',
      m => (lidPorMun[m.id] || 0) + " liderança(s)");

    const corSaude = corPorQuantil(MUNI.map(m => (m.saude && m.saude.estabelecimentos) || 0), ["#1e2740", "#0e7490", "#0891b2", "#06b6d4", "#22d3ee", "#a5f3fc"]);
    await criarMiniMapa(geo, "saude", "Estabelecimentos de saúde (CNES)", m => corSaude((m.saude && m.saude.estabelecimentos) || 0),
      '<span>poucos</span><div class="ramp" style="background:linear-gradient(90deg,#1e2740,#a5f3fc)"></div><span>muitos</span>',
      m => fmtN(m.saude && m.saude.estabelecimentos) + " estabelecimento(s)");

    await criarMiniMapa(geo, "emprego", "Saldo de emprego (CAGED, mês)", m => corSaldoEmprego(m.emprego && m.emprego.saldo),
      '<span style="color:#fca5a5">saldo negativo</span><span style="margin-left:auto;color:#86efac">saldo positivo</span>',
      m => m.emprego ? ((m.emprego.saldo >= 0 ? "+" : "") + fmtN(m.emprego.saldo) + " vagas") : "sem dados");
  }

  /* ---------- Rede de lideranças (status + função) ---------- */
  const COR_STATUS_LID = { confirmada: "#22c55e", em_conversa: "#f59e0b", indecisa: "#64748b", perdida: "#ef4444" };
  const ROTULO_STATUS_LID = { confirmada: "Confirmada", em_conversa: "Em conversa", indecisa: "Indecisa", perdida: "Perdida" };
  function renderRedeLiderancas() {
    const porStatus = { confirmada: 0, em_conversa: 0, indecisa: 0, perdida: 0 };
    BI.liderancas.forEach(l => { if (porStatus[l.status] != null) porStatus[l.status]++; else porStatus.indecisa++; });
    const statusChaves = Object.keys(porStatus).filter(k => porStatus[k] > 0);
    novoChart("chart-info-lid-status", {
      type: "doughnut",
      data: {
        labels: statusChaves.map(k => ROTULO_STATUS_LID[k]),
        datasets: [{ data: statusChaves.map(k => porStatus[k]), backgroundColor: statusChaves.map(k => COR_STATUS_LID[k]), borderWidth: 0 }]
      },
      options: { maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } } } }
    });

    const porFuncao = {};
    BI.liderancas.forEach(l => { const f = l.funcao || "Sem função definida"; porFuncao[f] = (porFuncao[f] || 0) + 1; });
    const funcoesOrd = Object.entries(porFuncao).sort((a, b) => b[1] - a[1]).slice(0, 10);
    novoChart("chart-info-lid-funcao", {
      type: "bar",
      data: { labels: funcoesOrd.map(x => x[0]), datasets: [{ data: funcoesOrd.map(x => x[1]), backgroundColor: "#8b5cf6", borderRadius: 4 }] },
      options: {
        maintainAspectRatio: false, indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: "#1e2740" }, ticks: { precision: 0 } }, y: { grid: { display: false }, ticks: { font: { size: 10.5 } } } }
      }
    });
  }

  /* ---------- Histórico de partidos nas prefeituras ---------- */
  function renderHistoricoPartidos() {
    const anos = ["2016", "2020", "2024"];
    const contagem = {};
    anos.forEach((ano, i) => {
      MUNI.forEach(m => {
        const p = m.prefeitos && m.prefeitos[ano];
        if (!p) return;
        if (!contagem[p.partido]) contagem[p.partido] = [0, 0, 0];
        contagem[p.partido][i]++;
      });
    });
    const totais = Object.entries(contagem).map(([p, arr]) => [p, arr.reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1]);
    const top = totais.slice(0, 8).map(x => x[0]);
    const outros = [0, 0, 0];
    Object.entries(contagem).forEach(([p, arr]) => { if (!top.includes(p)) arr.forEach((v, i) => outros[i] += v); });

    const datasets = top.map(p => ({ label: p, data: contagem[p], backgroundColor: corPartido(p) }));
    if (outros.some(v => v > 0)) datasets.push({ label: "Outros", data: outros, backgroundColor: "#475569" });

    novoChart("chart-info-historico", {
      type: "bar",
      data: { labels: ["2016", "2020", "2024"], datasets },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: { x: { grid: { display: false } }, y: { grid: { color: "#1e2740" }, beginAtZero: true, title: { display: true, text: "municípios", color: "#5f6d8c", font: { size: 10 } } } }
      }
    });
  }

  /* ---------- Perfil territorial (bolhas) ---------- */
  function renderBolhas() {
    const dados = MUNI.filter(m => m.pop2024 && m.pibPerCapita).map(m => ({
      x: m.pop2024, y: m.pibPerCapita, r: Math.max(3, Math.sqrt(m.eleitorado2024 || 0) / 25), nome: m.nome
    }));
    novoChart("chart-info-bolhas", {
      type: "bubble",
      data: { datasets: [{ data: dados, backgroundColor: "#3b82f680", borderColor: "#3b82f6", borderWidth: 1 }] },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.raw.nome}: ${fmtN(ctx.raw.x)} hab · ${fmtR(ctx.raw.y)}/hab` } }
        },
        scales: {
          x: { type: "logarithmic", title: { display: true, text: "População (escala log)", color: "#93a1c0", font: { size: 10.5 } }, grid: { color: "#1e2740" } },
          y: { title: { display: true, text: "PIB per capita (R$)", color: "#93a1c0", font: { size: 10.5 } }, grid: { color: "#1e2740" } }
        }
      }
    });
  }

  /* ---------- Rankings ---------- */
  const RANKING_CONFIG = {
    potencial: { campo: "_potencial", cor: "#8b5cf6", formatar: fmtN },
    eleitorado: { campo: "eleitorado2024", cor: "#22c55e", formatar: fmtN },
    pib: { campo: "pibPerCapita", cor: "#f59e0b", formatar: fmtR },
    pop: { campo: "pop2024", cor: "#3b82f6", formatar: fmtN }
  };
  function renderRanking() {
    const cfg = RANKING_CONFIG[rankAtivo];
    let base = MUNI;
    if (cfg.campo === "_potencial") {
      const potPorMun = {};
      BI.liderancas.forEach(l => { potPorMun[l.municipioId] = (potPorMun[l.municipioId] || 0) + expectativaLideranca(l); });
      base = MUNI.filter(m => potPorMun[m.id] > 0).map(m => ({ ...m, _potencial: potPorMun[m.id] }));
    }
    const top = [...base].sort((a, b) => (b[cfg.campo] || 0) - (a[cfg.campo] || 0)).slice(0, 15);
    $("#info-ranking-vazio").style.display = top.length ? "none" : "block";
    $("#chart-info-ranking").closest(".chart-box").style.display = top.length ? "block" : "none";
    if (!top.length) return;
    novoChart("chart-info-ranking", {
      type: "bar",
      data: { labels: top.map(m => m.nome), datasets: [{ data: top.map(m => m[cfg.campo] || 0), backgroundColor: cfg.cor, borderRadius: 4 }] },
      options: {
        maintainAspectRatio: false, indexAxis: "y",
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => cfg.formatar(ctx.parsed.x) } } },
        scales: { x: { grid: { color: "#1e2740" } }, y: { grid: { display: false } } }
      }
    });
  }

  function render() {
    init();
    renderMapas();
    renderRedeLiderancas();
    renderHistoricoPartidos();
    renderBolhas();
    renderRanking();
  }

  PAGES.infograficos = { render };
})();
