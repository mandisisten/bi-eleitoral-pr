/* =====================================================================
   BI Paraná — Relatórios (tela, CSV e impressão)
   ===================================================================== */

(() => {
  let relAtual = null; // { titulo, colunas, linhas }
  let inicializado = false;

  function init() {
    if (inicializado) return;
    inicializado = true;
    selectMesos($("#rel-meso"));
    $$(".rel-card").forEach(btn => btn.onclick = () => gerar(btn.dataset.tipo));
    $("#rel-meso").onchange = () => { if (relAtual) gerar(relAtual.tipo); };
  }

  function exportarCSV() {
    if (!relAtual) return;
    baixarCSV(relAtual.titulo.replace(/[^\w]+/g, "_").toLowerCase() + ".csv", [relAtual.colunas, ...relAtual.linhas]);
  }
  window.exportarCSVRelatorio = exportarCSV;

  function imprimirRelatorio() {
    if (!relAtual) return;
    const c = BI.config;
    $("#rel-cabecalho-print").innerHTML = `
      <div style="font-size:18px;font-weight:800">${esc(relAtual.titulo)}</div>
      <div style="font-size:12px;color:#555">${c.nomeCandidato ? esc(c.nomeCandidato) + (c.partido ? " (" + esc(c.partido) + ")" : "") + " — " + esc(c.cargo || "") + " · " : ""}Gerado em ${new Date().toLocaleString("pt-BR")} — BI Paraná</div><hr>`;
    window.print();
  }
  window.imprimirRelatorio = imprimirRelatorio;

  function filtroMeso() { return $("#rel-meso").value; }
  function munisFiltrados() {
    const ms = filtroMeso();
    return ms ? MUNI.filter(m => m.meso === ms) : MUNI;
  }

  const GERADORES = {
    expectativa() {
      const exp = expectativaPorMunicipio();
      const lidPorMun = liderancasPorMunicipio();
      const linhas = munisFiltrados()
        .map(m => ({ m, e: exp[m.id] || 0, meta: Number(BI.metas[m.id]?.metaVotos) || 0 }))
        .sort((a, b) => b.e - a.e)
        .map(x => [x.m.nome, x.m.meso, fmtN(x.m.eleitorado2024), lidPorMun[x.m.id] || 0, x.e,
          x.m.eleitorado2024 && x.e ? (x.e / x.m.eleitorado2024 * 100).toFixed(1) + "%" : "",
          x.meta || "", x.meta ? Math.round(x.e / x.meta * 100) + "%" : ""]);
      const total = linhas.reduce((a, l) => a + Number(l[4] || 0), 0);
      linhas.push(["TOTAL", "", "", "", total, "", "", ""]);
      return { titulo: "Expectativa de votos por município", colunas: ["Município", "Mesorregião", "Eleitorado", "Lideranças", "Expectativa", "% eleitorado", "Meta", "% meta"], linhas };
    },

    meso() {
      const exp = expectativaPorMunicipio();
      const agg = {};
      MESOS.forEach(ms => agg[ms] = { exp: 0, meta: 0, eleit: 0, lid: 0, munisCob: 0, munis: 0 });
      const lidPorMun = liderancasPorMunicipio();
      MUNI.forEach(m => {
        const a = agg[m.meso];
        a.munis++; a.exp += exp[m.id] || 0; a.eleit += m.eleitorado2024 || 0;
        a.meta += Number(BI.metas[m.id]?.metaVotos) || 0;
        if (lidPorMun[m.id]) { a.munisCob++; a.lid += lidPorMun[m.id]; }
      });
      const linhas = Object.entries(agg).sort((a, b) => b[1].exp - a[1].exp)
        .map(([ms, a]) => [ms, a.munis, a.munisCob, a.lid, fmtN(a.eleit), a.exp, a.eleit ? (a.exp / a.eleit * 100).toFixed(2) + "%" : "", a.meta || ""]);
      return { titulo: "Expectativa de votos por mesorregião", colunas: ["Mesorregião", "Municípios", "Com liderança", "Lideranças", "Eleitorado", "Expectativa", "% eleitorado", "Meta"], linhas };
    },

    liderancas() {
      const ms = filtroMeso();
      const linhas = BI.liderancas
        .filter(l => !ms || MUNI_BY_ID[l.municipioId]?.meso === ms)
        .sort((a, b) => (MUNI_BY_ID[a.municipioId]?.nome || "").localeCompare(MUNI_BY_ID[b.municipioId]?.nome || ""))
        .map(l => [MUNI_BY_ID[l.municipioId]?.nome || "", l.nome, l.apelido || "", l.funcao || "", l.partido || "",
          l.telefone || "", l.email || "", (window.STATUS_INFO_REL[l.status] || l.status || ""),
          l.potencialVotos || 0, (l.confianca ?? 100) + "%", expectativaLideranca(l), l.obs || ""]);
      return { titulo: "Relatório de lideranças", colunas: ["Município", "Nome", "Apelido", "Função", "Partido", "Telefone", "E-mail", "Status", "Potencial", "Confiança", "Expectativa", "Obs"], linhas };
    },

    materiais_lid() {
      const agg = {};
      BI.remessas.forEach(r => {
        const chave = (r.liderancaNome || "(sem liderança)") + "|" + r.municipioId + "|" + r.materialNome;
        agg[chave] = (agg[chave] || 0) + (Number(r.qtd) || 0);
      });
      const ms = filtroMeso();
      const linhas = Object.entries(agg).map(([k, v]) => {
        const [lid, munId, mat] = k.split("|");
        return { lid, mun: MUNI_BY_ID[Number(munId)], mat, v };
      }).filter(x => !ms || x.mun?.meso === ms)
        .sort((a, b) => a.lid.localeCompare(b.lid))
        .map(x => [x.lid, x.mun?.nome || "", x.mat, x.v]);
      return { titulo: "Materiais enviados por liderança", colunas: ["Liderança", "Município", "Material", "Quantidade"], linhas };
    },

    materiais_mun() {
      const agg = {};
      BI.remessas.forEach(r => {
        const chave = r.municipioId + "|" + r.materialNome;
        agg[chave] = (agg[chave] || 0) + (Number(r.qtd) || 0);
      });
      const ms = filtroMeso();
      const linhas = Object.entries(agg).map(([k, v]) => {
        const [munId, mat] = k.split("|");
        return { mun: MUNI_BY_ID[Number(munId)], mat, v };
      }).filter(x => x.mun && (!ms || x.mun.meso === ms))
        .sort((a, b) => a.mun.nome.localeCompare(b.mun.nome))
        .map(x => [x.mun.nome, x.mun.meso, x.mat, x.v]);
      return { titulo: "Materiais enviados por município", colunas: ["Município", "Mesorregião", "Material", "Quantidade"], linhas };
    },

    sem_cobertura() {
      const lidPorMun = liderancasPorMunicipio();
      const linhas = munisFiltrados().filter(m => !lidPorMun[m.id])
        .sort((a, b) => (b.eleitorado2024 || 0) - (a.eleitorado2024 || 0))
        .map(m => {
          const p = m.prefeitos?.["2024"];
          return [m.nome, m.meso, fmtN(m.eleitorado2024), fmtN(m.pop2024), p ? p.nomeUrna : "", p ? p.partido : ""];
        });
      return { titulo: "Municípios sem cobertura de liderança", colunas: ["Município", "Mesorregião", "Eleitorado", "População", "Prefeito 2024", "Partido"], linhas };
    },

    lid_cargo_eletivo() {
      const ms = filtroMeso();
      const linhas = BI.liderancas
        .filter(l => FUNCOES_ELETIVAS.lid_cargo_eletivo.includes(l.funcao))
        .filter(l => !ms || MUNI_BY_ID[l.municipioId]?.meso === ms)
        .sort((a, b) => (MUNI_BY_ID[a.municipioId]?.nome || "").localeCompare(MUNI_BY_ID[b.municipioId]?.nome || ""))
        .map(l => [MUNI_BY_ID[l.municipioId]?.nome || "", l.funcao, l.nome, l.partido || "", tagStatus(l.status).replace(/<[^>]+>/g, ""), l.potencialVotos || 0, expectativaLideranca(l)]);
      return { titulo: "Lideranças com cargo eletivo (prefeitos, vices e vereadores)", colunas: ["Município", "Cargo", "Nome", "Partido", "Status", "Potencial", "Expectativa"], linhas };
    },

    ranking() {
      const linhas = munisFiltrados()
        .sort((a, b) => (b.pop2024 || 0) - (a.pop2024 || 0))
        .map((m, i) => [i + 1, m.nome, m.meso, fmtN(m.pop2024), fmtN(m.eleitorado2024), fmtMilR(m.pib2021), fmtR(m.pibPerCapita), fmtN(m.areaKm2)]);
      return { titulo: "Ranking socioeconômico dos municípios", colunas: ["#", "Município", "Mesorregião", "População 2024", "Eleitorado 2024", "PIB 2021", "PIB per capita", "Área km²"], linhas };
    },

    prefeitos() {
      const ms = filtroMeso();
      const agg = {};
      munisFiltrados().forEach(m => {
        const p = m.prefeitos?.["2024"];
        if (!p) return;
        if (!agg[p.partido]) agg[p.partido] = [];
        agg[p.partido].push({ m, p });
      });
      const linhas = [];
      Object.entries(agg).sort((a, b) => b[1].length - a[1].length).forEach(([partido, arr]) => {
        arr.forEach(({ m, p }) => linhas.push([partido, m.nome, p.nomeUrna, p.nome, fmtN(p.votos), p.obs || ""]));
      });
      return { titulo: "Prefeitos eleitos em 2024 por partido" + (ms ? " — " + ms : ""), colunas: ["Partido", "Município", "Nome de urna", "Nome completo", "Votos", "Obs"], linhas };
    },

    vereadores() {
      const linhas = [];
      munisFiltrados().forEach(m => {
        (Array.isArray(m.vereadores2024) ? [...m.vereadores2024] : []).sort((a, b) => (b.votos || 0) - (a.votos || 0)).forEach((v, i) => {
          linhas.push([m.nome, i + 1, v.nomeUrna, v.nome, v.partido, v.numero, fmtN(v.votos)]);
        });
      });
      return { titulo: "Vereadores eleitos em 2024 por município", colunas: ["Município", "#", "Nome de urna", "Nome completo", "Partido", "Número", "Votos"], linhas };
    },

    dep_estadual() { return relDeputados("depEst2022", "Deputados estaduais mais votados por município (2022)"); },
    dep_federal() { return relDeputados("depFed2022", "Deputados federais mais votados por município (2022)"); },

    agro() {
      const linhas = munisFiltrados().map(m => {
        const top = Object.entries(m.agro || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const valorTotal = Object.values(m.agro || {}).reduce((a, b) => a + b, 0);
        return { m, top, valorTotal };
      }).filter(x => x.valorTotal > 0)
        .sort((a, b) => b.valorTotal - a.valorTotal)
        .map(x => [x.m.nome, x.m.meso, fmtMilR(x.valorTotal),
          x.top[0] ? x.top[0][0] : "", x.top[1] ? x.top[1][0] : "", x.top[2] ? x.top[2][0] : "",
          fmtN(x.m.rebanhos?.["Bovino"]), fmtN(x.m.rebanhos?.["Suíno - total"]), fmtN(x.m.rebanhos?.["Galináceos - total"])]);
      return { titulo: "Potencial agropecuário por município", colunas: ["Município", "Mesorregião", "Valor produção agrícola", "1º produto", "2º produto", "3º produto", "Bovinos", "Suínos", "Aves"], linhas };
    }
  };

  function relDeputados(campo, titulo) {
    const linhas = [];
    munisFiltrados().forEach(m => {
      (Array.isArray(m[campo]) ? [...m[campo]] : []).sort((a, b) => (b.votos || 0) - (a.votos || 0)).forEach((d, i) => {
        linhas.push([m.nome, i + 1, d.nomeUrna, d.partido, fmtN(d.votos), /^ELEITO/.test(d.situacao) ? "Eleito" : d.situacao === "SUPLENTE" ? "Suplente" : "Não eleito"]);
      });
    });
    return { titulo, colunas: ["Município", "#", "Candidato", "Partido", "Votos no município", "Situação final"], linhas };
  }

  function gerar(tipo) {
    relAtual = GERADORES[tipo]();
    relAtual.tipo = tipo;
    $$(".rel-card").forEach(btn => btn.classList.toggle("ativo", btn.dataset.tipo === tipo));
    $("#rel-saida").innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px" class="no-print">
        <div><h3 style="margin:0">${esc(relAtual.titulo)}</h3><span style="font-size:12px;color:var(--tx3)">${relAtual.linhas.length} linha(s) — ${new Date().toLocaleString("pt-BR")}</span></div>
        <div style="display:flex;gap:8px">
          <button class="btn sec mini" onclick="exportarCSVRelatorio()">⬇️ Exportar CSV</button>
          <button class="btn sec mini" onclick="imprimirRelatorio()">🖨️ Imprimir</button>
        </div>
      </div>
      ${relAtual.linhas.length ? `<table class="tab"><thead><tr>${relAtual.colunas.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${relAtual.linhas.map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      : '<div class="vazio">Sem dados para este relatório.</div>'}`;
  }

  function render() { init(); }
  PAGES.relatorios = { render };
})();

window.STATUS_INFO_REL = { confirmada: "Confirmada", em_conversa: "Em conversa", indecisa: "Indecisa", perdida: "Perdida" };
