/* =====================================================================
   BI Paraná — Radar Municipal
   Dashboard focado em UM município por vez: selecione e veja lideranças
   (por segmento e individualmente, com o quanto cada uma "vale" em
   votos), expectativa, histórico político, perfil socioeconômico,
   saúde, emprego e materiais enviados — tudo num só painel.
   ===================================================================== */

(() => {
  let inicializado = false;
  let municipioAtualId = null;

  const STATUS_TAG = { confirmada: "verde", em_conversa: "amarelo", indecisa: "cinza", perdida: "vermelho" };
  const STATUS_ROTULO = { confirmada: "Confirmada", em_conversa: "Em conversa", indecisa: "Indecisa", perdida: "Perdida" };

  function init() {
    if (inicializado) return;
    inicializado = true;
    popularSelectMun();
    $("#radar-busca-mun").addEventListener("input", popularSelectMun);
    $("#radar-select-mun").addEventListener("change", () => {
      const id = Number($("#radar-select-mun").value);
      if (id) selecionarMunicipio(id);
    });
  }

  function popularSelectMun() {
    const busca = ($("#radar-busca-mun").value || "").toLowerCase();
    const lista = busca ? MUNI.filter(m => m.nome.toLowerCase().includes(busca)) : MUNI;
    const sel = $("#radar-select-mun");
    const valorAntigo = sel.value;
    sel.innerHTML = '<option value="">Selecione um município...</option>' +
      lista.map(m => `<option value="${m.id}">${esc(m.nome)} — ${esc(m.meso.replace(" Paranaense", ""))}</option>`).join("");
    if (lista.some(m => String(m.id) === valorAntigo)) sel.value = valorAntigo;
  }

  /* Índice de prioridade: cruza tamanho do eleitorado (percentil entre os 399)
     com o quanto da expectativa de votos já cobre esse eleitorado — usado só
     pra sugerir por onde começar antes de escolher um município. */
  function renderSugestoes() {
    const exp = expectativaPorMunicipio();
    const lidPorMun = {};
    BI.liderancas.forEach(l => { (lidPorMun[l.municipioId] = lidPorMun[l.municipioId] || []).push(l); });
    const eleitorados = MUNI.map(m => m.eleitorado2024 || 0).sort((a, b) => a - b);
    const percentil = v => {
      if (!eleitorados.length) return 0;
      let i = 0; while (i < eleitorados.length && eleitorados[i] < v) i++;
      return i / eleitorados.length;
    };
    const dados = MUNI.map(m => {
      const lids = lidPorMun[m.id] || [];
      const expM = exp[m.id] || 0;
      const eleitorado = m.eleitorado2024 || 0;
      const coberturaPct = eleitorado ? Math.min(1, expM / eleitorado) : 0;
      const indice = Math.round(percentil(eleitorado) * (1 - coberturaPct) * 100);
      return { m, lidsCount: lids.length, indice, eleitorado, expM };
    }).filter(d => d.eleitorado > 0).sort((a, b) => b.indice - a.indice).slice(0, 8);

    $("#radar-sugestoes").innerHTML = dados.map((d, i) => `
      <div class="clicavel" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #1e2740" onclick="selecionarMunicipioRadar(${d.m.id})">
        <div style="width:18px;color:var(--tx3);font-size:12px">${i + 1}º</div>
        <div style="flex:1"><b style="font-size:13px">${esc(d.m.nome)}</b>
          <div style="font-size:11px;color:var(--tx3)">${fmtN(d.eleitorado)} eleitores · ${d.lidsCount} liderança(s) · ${fmtN(d.expM)} votos esperados</div>
        </div>
        <span class="tag ${d.indice > 60 ? "vermelho" : d.indice > 30 ? "amarelo" : "azul"}">prioridade ${d.indice}</span>
      </div>`).join("") || '<div class="vazio">Sem dados suficientes ainda.</div>';
  }

  function selecionarMunicipio(id) {
    municipioAtualId = id;
    $("#radar-select-mun").value = id;
    $("#radar-vazio").style.display = "none";
    $("#radar-dashboard").style.display = "block";
    renderDashboardMunicipio(id);
  }
  window.selecionarMunicipioRadar = selecionarMunicipio;

  function tabelaTop(lista, titulo) {
    if (!Array.isArray(lista) || !lista.length) return `<div style="font-size:12px;color:var(--tx3)">${titulo}: sem dados.</div>`;
    return `
      <div style="font-size:12px;color:var(--tx2);font-weight:600;margin:10px 0 4px">${titulo}</div>
      <table class="tab"><tbody>
      ${lista.slice(0, 5).map(c => `<tr><td><b>${esc(c.nomeUrna)}</b> <span style="color:var(--tx3)">(${esc(c.partido)})</span></td><td class="num">${fmtN(c.votos)}</td></tr>`).join("")}
      </tbody></table>`;
  }

  function renderDashboardMunicipio(id) {
    const m = MUNI_BY_ID[id];
    if (!m) return;
    const lids = BI.liderancas.filter(l => l.municipioId === id);
    const expTotal = lids.reduce((a, l) => a + expectativaLideranca(l), 0);
    const meta = BI.metas[id];
    const metaVotos = Number(meta?.metaVotos) || 0;
    const p24 = m.prefeitos?.["2024"];

    $("#radar-mun-nome").textContent = m.nome;
    $("#radar-mun-sub").textContent = `${m.meso} — ${fmtN(m.eleitorado2024)} eleitores${p24 ? " · Prefeito: " + p24.nomeUrna + " (" + p24.partido + ")" : ""}`;

    /* ---- KPIs ---- */
    $("#radar-mun-cards").innerHTML = `
      <div class="card-kpi destaque"><div class="rotulo">Expectativa de votos</div><div class="valor">${fmtN(expTotal)}</div>
        <div class="extra">${m.eleitorado2024 ? (expTotal / m.eleitorado2024 * 100).toFixed(2) + "% do eleitorado" : ""}</div></div>
      <div class="card-kpi"><div class="rotulo">Lideranças cadastradas</div><div class="valor">${lids.length}</div>
        <div class="extra">${lids.filter(l => l.status === "confirmada").length} confirmada(s)</div></div>
      <div class="card-kpi"><div class="rotulo">Eleitorado (2024)</div><div class="valor">${fmtN(m.eleitorado2024)}</div></div>
      <div class="card-kpi"><div class="rotulo">Meta de votos</div><div class="valor">${metaVotos ? fmtN(metaVotos) : "—"}</div>
        <div class="extra">${metaVotos ? Math.round(expTotal / metaVotos * 100) + "% atingido" : "sem meta definida"}</div></div>`;

    /* ---- Lideranças por segmento ---- */
    const porFuncao = {};
    lids.forEach(l => {
      const f = l.funcao || "Sem função definida";
      if (!porFuncao[f]) porFuncao[f] = { count: 0, exp: 0 };
      porFuncao[f].count++;
      porFuncao[f].exp += expectativaLideranca(l);
    });
    const segmentos = Object.entries(porFuncao).sort((a, b) => b[1].exp - a[1].exp);
    $("#radar-mun-segmentos").innerHTML = segmentos.length ? segmentos.map(([f, d]) => `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px"><span>${esc(f)} <span style="color:var(--tx3)">— ${d.count} liderança${d.count === 1 ? "" : "s"}</span></span><b>${fmtN(d.exp)} votos</b></div>
        <div class="barra-prog"><div style="width:${expTotal ? (d.exp / expTotal * 100) : 0}%"></div></div>
      </div>`).join("") : '<div class="vazio">Nenhuma liderança cadastrada neste município ainda. <a class="link-btn" onclick="novaLideranca(' + id + ')">+ Cadastrar liderança</a></div>';

    /* ---- Gráfico de participação individual (só relevante com >1 liderança) ---- */
    if (lids.length > 1) {
      const ordenadas = [...lids].sort((a, b) => expectativaLideranca(b) - expectativaLideranca(a));
      novoChart("chart-radar-mun-lid", {
        type: "doughnut",
        data: {
          labels: ordenadas.map(l => l.apelido || l.nome),
          datasets: [{ data: ordenadas.map(l => expectativaLideranca(l)), backgroundColor: ["#3b82f6", "#f97316", "#22c55e", "#a78bfa", "#eab308", "#ef4444", "#06b6d4", "#ec4899"] }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { font: { size: 10.5 }, boxWidth: 10 } } } }
      });
    } else if (CHARTS["chart-radar-mun-lid"]) {
      CHARTS["chart-radar-mun-lid"].destroy();
      delete CHARTS["chart-radar-mun-lid"];
    }

    /* ---- Tabela detalhada de lideranças ---- */
    $("#radar-mun-lid-titulo").textContent = `Lideranças cadastradas (${lids.length})`;
    $("#radar-mun-lid-tabela").innerHTML = lids.length ? `
      <table class="tab"><thead><tr><th>Nome</th><th>Função</th><th>Status</th><th class="num">Potencial</th><th class="num">Confiança</th><th class="num">Vale (votos)</th></tr></thead><tbody>
      ${[...lids].sort((a, b) => expectativaLideranca(b) - expectativaLideranca(a)).map(l => `
        <tr class="clicavel" onclick="editarLideranca('${l.id}')">
          <td><b>${esc(l.nome)}</b>${l.apelido ? ` <span style="color:var(--tx3)">(${esc(l.apelido)})</span>` : ""}</td>
          <td style="color:var(--tx2)">${esc(l.funcao || "—")}</td>
          <td><span class="tag ${STATUS_TAG[l.status] || "cinza"}">${STATUS_ROTULO[l.status] || l.status || "—"}</span></td>
          <td class="num">${fmtN(l.potencialVotos)}</td>
          <td class="num">${l.confianca != null ? l.confianca + "%" : "100%"}</td>
          <td class="num"><b>${fmtN(expectativaLideranca(l))}</b></td>
        </tr>`).join("")}
      </tbody></table>` : '<div class="vazio">Nenhuma liderança cadastrada neste município ainda.</div>';

    /* ---- Histórico político ---- */
    const dep2022 = (m.depEst2022 || []).slice(0, 5);
    const indicacao = Array.isArray(m.indicacaoDeputadoEstadual) ? m.indicacaoDeputadoEstadual : [];
    $("#radar-mun-politico").innerHTML = `
      <div style="font-size:12px;color:var(--tx2);font-weight:600;margin-bottom:4px">Prefeitos (TSE)</div>
      ${["2024", "2020", "2016"].map(ano => {
        const p = m.prefeitos?.[ano];
        return `<div class="pref-linha"><span class="ano">${ano}</span>${p ? `<span style="flex:1"><b>${esc(p.nomeUrna)}</b></span><span class="tag azul">${esc(p.partido)}</span>` : '<span style="color:var(--tx3)">sem dados</span>'}</div>`;
      }).join("")}
      ${indicacao.length ? `
        <div style="font-size:12px;color:var(--tx2);font-weight:600;margin:12px 0 4px">Indicação de deputado estadual pelo prefeito</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${indicacao.map((d, i) => `<span class="tag roxo" style="font-size:11.5px">${i === 0 ? "1ª" : "2ª"} opção: ${esc(d.nome)}${d.partido ? " · " + esc(d.partido) : ""}</span>`).join("")}
        </div>` : ""}
      ${tabelaTop(dep2022, "Deputados estaduais mais votados (2022)")}
      <div style="font-size:12px;color:var(--tx2);font-weight:600;margin:10px 0 4px">Vereadores eleitos (2024)</div>
      <div style="font-size:12.5px;color:var(--tx2)">${Array.isArray(m.vereadores2024) ? m.vereadores2024.length : 0} vereador(es) eleito(s)</div>`;

    /* ---- Perfil socioeconômico ---- */
    const agroOrd = Object.entries(m.agro || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    $("#radar-mun-perfil").innerHTML = `
      <div class="det-grid" style="margin-bottom:10px">
        <div class="det-item"><div class="r">População</div><div class="v">${fmtN(m.pop2024)}</div></div>
        <div class="det-item"><div class="r">PIB per capita</div><div class="v">${fmtR(m.pibPerCapita)}</div></div>
        <div class="det-item"><div class="r">Área</div><div class="v">${fmtN(m.areaKm2)} km²</div></div>
        <div class="det-item"><div class="r">Densidade</div><div class="v">${m.densidade ? m.densidade.toLocaleString("pt-BR") : "—"} hab/km²</div></div>
      </div>
      ${agroOrd.length ? `<div style="font-size:12px;color:var(--tx2);font-weight:600;margin-bottom:4px">Principais produtos agrícolas (valor, IBGE ${esc(m.anoAgro || "")})</div>
      ${agroOrd.map(([n, v]) => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;border-bottom:1px solid #1e2740"><span style="color:var(--tx2)">${esc(n)}</span><b>${fmtMilR(v)}</b></div>`).join("")}` : ""}`;

    /* ---- Saúde e emprego ---- */
    const s = m.saude, e = m.emprego;
    $("#radar-mun-saude-emprego").innerHTML = `
      <div style="font-size:12px;color:var(--tx2);font-weight:600;margin-bottom:6px">Saúde (CNES)</div>
      ${s ? `<div class="det-grid" style="margin-bottom:12px">
        <div class="det-item"><div class="r">Estabelecimentos</div><div class="v">${fmtN(s.estabelecimentos)}</div></div>
        <div class="det-item"><div class="r">UBS</div><div class="v">${fmtN(s.ubs)}</div></div>
        <div class="det-item"><div class="r">Hospitais</div><div class="v">${fmtN(s.hospitais)}</div></div>
      </div>` : '<div class="vazio" style="margin-bottom:12px">Sem dados de saúde.</div>'}
      <div style="font-size:12px;color:var(--tx2);font-weight:600;margin-bottom:6px">Emprego formal (Novo CAGED)</div>
      ${e ? `<div class="det-grid">
        <div class="det-item" style="${e.saldo >= 0 ? "border:1px solid var(--ok)" : "border:1px solid var(--err)"}"><div class="r">Saldo de vagas</div><div class="v" style="color:${e.saldo >= 0 ? "var(--ok)" : "var(--err)"}">${e.saldo >= 0 ? "+" : ""}${fmtN(e.saldo)}</div></div>
        <div class="det-item"><div class="r">Admissões</div><div class="v">${fmtN(e.admissoes)}</div></div>
      </div>` : '<div class="vazio">Sem dados de emprego.</div>'}`;

    /* ---- Materiais enviados ---- */
    const rems = BI.remessas.filter(r => r.municipioId === id);
    $("#radar-mun-materiais").innerHTML = rems.length ? `
      <table class="tab"><thead><tr><th>Data</th><th>Material</th><th>Liderança</th><th class="num">Qtd</th></tr></thead><tbody>
      ${rems.slice(0, 10).map(r => `<tr><td>${esc(formatarData(r.data))}</td><td>${esc(r.materialNome)}</td><td>${esc(r.liderancaNome || "—")}</td><td class="num">${fmtN(r.qtd)}</td></tr>`).join("")}
      </tbody></table>` : '<div class="vazio">Nenhum material enviado para este município ainda.</div>';
  }

  function render() {
    init();
    renderSugestoes();
    if (municipioAtualId) {
      $("#radar-vazio").style.display = "none";
      $("#radar-dashboard").style.display = "block";
      renderDashboardMunicipio(municipioAtualId);
    } else {
      $("#radar-vazio").style.display = "block";
      $("#radar-dashboard").style.display = "none";
    }
  }

  PAGES.radar = { render };
})();
