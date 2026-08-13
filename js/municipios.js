/* =====================================================================
   BI Paraná — página Municípios + ficha detalhada
   ===================================================================== */

(() => {
  let ordem = { campo: "pop2024", asc: false };
  let inicializado = false;

  function init() {
    if (inicializado) return;
    inicializado = true;
    selectMesos($("#mun-meso"));
    const partidos = [...new Set(MUNI.map(m => m.prefeitos?.["2024"]?.partido).filter(Boolean))].sort();
    $("#mun-partido").innerHTML = '<option value="">Todos</option>' + partidos.map(p => `<option>${esc(p)}</option>`).join("");
    ["mun-busca", "mun-meso", "mun-partido", "mun-cobertura"].forEach(id => {
      $("#" + id).addEventListener("input", render);
    });
  }

  function filtrar() {
    const busca = ($("#mun-busca").value || "").toLowerCase();
    const meso = $("#mun-meso").value;
    const partido = $("#mun-partido").value;
    const cob = $("#mun-cobertura").value;
    const lidPorMun = liderancasPorMunicipio();
    return MUNI.filter(m => {
      if (busca && !m.nome.toLowerCase().includes(busca)) return false;
      if (meso && m.meso !== meso) return false;
      if (partido && m.prefeitos?.["2024"]?.partido !== partido) return false;
      if (cob === "com" && !lidPorMun[m.id]) return false;
      if (cob === "sem" && lidPorMun[m.id]) return false;
      return true;
    });
  }

  function render() {
    init();
    const exp = expectativaPorMunicipio();
    const lidPorMun = liderancasPorMunicipio();
    let lista = filtrar();

    const val = m => {
      switch (ordem.campo) {
        case "nome": return m.nome;
        case "meso": return m.meso;
        case "prefeito": return m.prefeitos?.["2024"]?.nomeUrna || "";
        case "partido": return m.prefeitos?.["2024"]?.partido || "";
        case "liderancas": return lidPorMun[m.id] || 0;
        case "expectativa": return exp[m.id] || 0;
        default: return m[ordem.campo] || 0;
      }
    };
    lista.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return ordem.asc ? c : -c;
    });

    const th = (rotulo, campo, num) =>
      `<th class="${num ? "num" : ""}" data-campo="${campo}">${rotulo}${ordem.campo === campo ? (ordem.asc ? " ▲" : " ▼") : ""}</th>`;

    $("#mun-tabela").innerHTML = `
      <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">${lista.length} município(s)</div>
      <table class="tab"><thead><tr>
        ${th("Município", "nome")}${th("Mesorregião", "meso")}
        ${th("População", "pop2024", 1)}${th("Eleitorado", "eleitorado2024", 1)}
        ${th("PIB per capita", "pibPerCapita", 1)}
        ${th("Prefeito 2024", "prefeito")}${th("Partido", "partido")}
        ${th("Lideranças", "liderancas", 1)}${th("Expectativa", "expectativa", 1)}
      </tr></thead><tbody>
      ${lista.map(m => {
        const p = m.prefeitos?.["2024"];
        return `<tr class="clicavel" onclick="abrirMunicipio(${m.id})">
          <td><b>${esc(m.nome)}</b></td>
          <td style="color:var(--tx2)">${esc(m.meso.replace(" Paranaense", ""))}</td>
          <td class="num">${fmtN(m.pop2024)}</td>
          <td class="num">${fmtN(m.eleitorado2024)}</td>
          <td class="num">${fmtR(m.pibPerCapita)}</td>
          <td>${p ? esc(p.nomeUrna) : "—"}</td>
          <td>${p ? `<span class="tag azul">${esc(p.partido)}</span>` : "—"}</td>
          <td class="num">${lidPorMun[m.id] || 0}</td>
          <td class="num"><b>${fmtN(exp[m.id] || 0)}</b></td>
        </tr>`;
      }).join("")}
      </tbody></table>`;

    $$("#mun-tabela th").forEach(el => el.onclick = () => {
      const campo = el.dataset.campo;
      if (ordem.campo === campo) ordem.asc = !ordem.asc;
      else ordem = { campo, asc: campo === "nome" || campo === "meso" };
      render();
    });
  }

  PAGES.municipios = { render };
})();

/* ---------- Ficha do município (modal) ---------- */
function abrirMunicipio(id) {
  const m = MUNI_BY_ID[id];
  if (!m) return;
  const exp = expectativaPorMunicipio()[id] || 0;
  const lids = BI.liderancas.filter(l => l.municipioId === id);
  const rems = BI.remessas.filter(r => r.municipioId === id);
  const meta = BI.metas[id]?.metaVotos || 0;
  const pctEleit = m.eleitorado2024 ? (exp / m.eleitorado2024 * 100).toFixed(1) : null;

  const agroOrd = Object.entries(m.agro || {}).sort((a, b) => b[1] - a[1]);
  const agroTotal = agroOrd.reduce((a, [, v]) => a + v, 0);
  const rebOrd = Object.entries(m.rebanhos || {}).sort((a, b) => b[1] - a[1]);

  const tagSituacao = s => {
    if (/^ELEITO/.test(s || "")) return '<span class="tag verde">Eleito</span>';
    if (s === "SUPLENTE") return '<span class="tag amarelo">Suplente</span>';
    return '<span class="tag cinza">Não eleito</span>';
  };
  const tabelaCandidatos = listaOrig => {
    const lista = (Array.isArray(listaOrig) ? [...listaOrig] : []).sort((a, b) => (b.votos || 0) - (a.votos || 0));
    return lista.length ? `
    <table class="tab"><thead><tr><th>#</th><th>Candidato</th><th>Partido</th><th class="num">Votos aqui</th><th>Situação final</th></tr></thead><tbody>
    ${lista.map((d, i) => `<tr><td style="color:var(--tx3)">${i + 1}º</td>
      <td><b>${esc(d.nomeUrna)}</b><br><span style="font-size:11px;color:var(--tx3)">${esc(d.nome)} · nº ${esc(d.numero)}</span></td>
      <td><span class="tag azul">${esc(d.partido)}</span></td>
      <td class="num"><b>${fmtN(d.votos)}</b></td>
      <td>${tagSituacao(d.situacao)}</td></tr>`).join("")}
    </tbody></table>` : '<div style="color:var(--tx3);font-size:12.5px;padding:8px 0">Sem dados para este município.</div>';
  };

  const statusTag = s => ({
    confirmada: '<span class="tag verde">Confirmada</span>',
    em_conversa: '<span class="tag amarelo">Em conversa</span>',
    indecisa: '<span class="tag cinza">Indecisa</span>',
    perdida: '<span class="tag vermelho">Perdida</span>'
  }[s] || esc(s));

  Modal.abrir(`
    <h3>${esc(m.nome)} <span style="color:var(--tx3);font-weight:400;font-size:13px">— ${esc(m.meso)} · Microrregião de ${esc(m.micro)}</span></h3>
    <div class="det-grid">
      <div class="det-item"><div class="r">População (2024)</div><div class="v">${fmtN(m.pop2024)}</div></div>
      <div class="det-item"><div class="r">Eleitorado (2024)</div><div class="v">${fmtN(m.eleitorado2024)}</div></div>
      <div class="det-item"><div class="r">PIB (2021)</div><div class="v">${fmtMilR(m.pib2021)}</div></div>
      <div class="det-item"><div class="r">PIB per capita</div><div class="v">${fmtR(m.pibPerCapita)}</div></div>
      <div class="det-item"><div class="r">Área</div><div class="v">${fmtN(m.areaKm2)} km²</div></div>
      <div class="det-item"><div class="r">Densidade</div><div class="v">${m.densidade ? m.densidade.toLocaleString("pt-BR") : "—"} hab/km²</div></div>
      <div class="det-item" style="border:1px solid var(--pri)"><div class="r">Expectativa de votos</div><div class="v" style="color:var(--pri2)">${fmtN(exp)}</div></div>
      <div class="det-item"><div class="r">% do eleitorado</div><div class="v">${pctEleit != null ? pctEleit + "%" : "—"}</div></div>
    </div>

    <div class="grid-2">
      <div>
        <h3 style="font-size:13px;margin:10px 0 6px">🏛️ Prefeitos (TSE)</h3>
        ${["2024", "2020", "2016"].map(ano => {
          const p = m.prefeitos?.[ano];
          if (!p) return `<div class="pref-linha"><span class="ano">${ano}</span><span style="color:var(--tx3)">sem dados</span></div>`;
          return `<div class="pref-linha"><span class="ano">${ano}</span>
            <span style="flex:1"><b>${esc(p.nomeUrna)}</b><br><span style="font-size:11.5px;color:var(--tx3)">${esc(p.nome)}${p.obs ? "<br>⚠️ " + esc(p.obs) : ""}</span></span>
            <span class="tag azul">${esc(p.partido)}</span>
            <span style="color:var(--tx2);font-size:12px">${fmtN(p.votos)} votos</span></div>`;
        }).join("")}
        <h3 style="font-size:13px;margin:14px 0 6px">🐄 Rebanhos (IBGE ${esc(m.anoRebanho || "")})</h3>
        ${rebOrd.length ? rebOrd.map(([n, v]) => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid #1e2740"><span style="color:var(--tx2)">${esc(n)}</span><b>${fmtN(v)}</b></div>`).join("") : '<div style="color:var(--tx3);font-size:12px">sem dados</div>'}
      </div>
      <div>
        <h3 style="font-size:13px;margin:10px 0 6px">🌾 Produção agrícola — valor (IBGE ${esc(m.anoAgro || "")})</h3>
        ${agroOrd.length ? `<div style="font-size:12px;color:var(--tx2);margin-bottom:8px">Valor total: <b style="color:var(--tx)">${fmtMilR(agroTotal)}</b>${m.pib2021 ? ` — ${(agroTotal / m.pib2021 * 100).toFixed(1).replace(".", ",")}% do PIB municipal` : ""}</div>` : ""}
        ${agroOrd.length ? agroOrd.slice(0, 12).map(([n, v]) => {
          const pct = v / agroOrd[0][1] * 100;
          return `<div style="font-size:12px;margin-bottom:6px"><div style="display:flex;justify-content:space-between"><span style="color:var(--tx2)">${esc(n)}</span><b>${fmtMilR(v)}</b></div>
          <div class="barra-prog"><div style="width:${pct}%;background:var(--verde-pr)"></div></div></div>`;
        }).join("") : '<div style="color:var(--tx3);font-size:12px">sem dados</div>'}
        <h3 style="font-size:13px;margin:14px 0 6px">🎯 Meta de votos neste município</h3>
        <div style="display:flex;gap:8px">
          <input id="det-meta" type="number" min="0" value="${meta || ""}" placeholder="ex.: 500">
          <button class="btn mini" onclick="salvarMeta(${m.id})">Salvar</button>
        </div>
        ${meta ? `<div style="font-size:12px;color:var(--tx2);margin-top:6px">Atingido: <b>${Math.round(exp / meta * 100)}%</b> da meta</div>` : ""}
      </div>
    </div>

    <h3 style="font-size:13px;margin:16px 0 6px">🏥 Saúde (CNES — jun/2026)</h3>
    ${m.saude ? `
      <div class="det-grid" style="margin-bottom:14px">
        <div class="det-item"><div class="r">Estabelecimentos de saúde</div><div class="v">${fmtN(m.saude.estabelecimentos)}</div></div>
        <div class="det-item"><div class="r">Unidades Básicas de Saúde</div><div class="v">${fmtN(m.saude.ubs)}</div></div>
        <div class="det-item"><div class="r">Hospitais</div><div class="v">${fmtN(m.saude.hospitais)}</div></div>
        <div class="det-item"><div class="r">Pronto-atendimento</div><div class="v">${fmtN(m.saude.prontoAtendimento)}</div></div>
        <div class="det-item"><div class="r">Farmácias cadastradas</div><div class="v">${fmtN(m.saude.farmacias)}</div></div>
      </div>
      <div style="font-size:11px;color:var(--tx3);margin-top:-8px;margin-bottom:16px">Fonte: CNES/DATASUS — estabelecimentos ativos</div>`
      : '<div style="color:var(--tx3);font-size:12.5px;margin-bottom:16px">Sem dados de saúde para este município.</div>'}

    <h3 style="font-size:13px;margin:16px 0 6px">💼 Emprego formal (Novo CAGED — jun/2026)</h3>
    ${m.emprego ? `
      <div class="det-grid" style="margin-bottom:14px">
        <div class="det-item" style="${m.emprego.saldo >= 0 ? "border:1px solid var(--ok)" : "border:1px solid var(--err)"}"><div class="r">Saldo de vagas no mês</div><div class="v" style="color:${m.emprego.saldo >= 0 ? "var(--ok)" : "var(--err)"}">${m.emprego.saldo >= 0 ? "+" : ""}${fmtN(m.emprego.saldo)}</div></div>
        <div class="det-item"><div class="r">Admissões</div><div class="v">${fmtN(m.emprego.admissoes)}</div></div>
        <div class="det-item"><div class="r">Desligamentos</div><div class="v">${fmtN(m.emprego.desligamentos)}</div></div>
        <div class="det-item"><div class="r">Salário médio na admissão</div><div class="v">${fmtR(m.emprego.salarioMedioAdmissao)}</div></div>
      </div>
      <div style="font-size:11px;color:var(--tx3);margin-top:-8px;margin-bottom:16px">Fonte: Novo CAGED/Ministério do Trabalho — movimentação de emprego formal no mês</div>`
      : '<div style="color:var(--tx3);font-size:12.5px;margin-bottom:16px">Sem dados de emprego para este município.</div>'}

    <details class="secao-colapsavel">
      <summary>🗳️ Deputados mais votados neste município — eleição 2022</summary>
      <div class="secao-corpo">
        <div style="text-align:right;margin-bottom:8px">
          <button class="btn mini" id="btn-dep-est" onclick="trocarDeputados('est')">Estadual</button>
          <button class="btn sec mini" id="btn-dep-fed" onclick="trocarDeputados('fed')">Federal</button>
        </div>
        <div id="dep-lista-est">${tabelaCandidatos(m.depEst2022)}</div>
        <div id="dep-lista-fed" style="display:none">${tabelaCandidatos(m.depFed2022)}</div>
      </div>
    </details>

    <h3 style="font-size:13px;margin:16px 0 6px">🤝 Deputado(a) estadual indicado(a) pelo prefeito</h3>
    ${Array.isArray(m.indicacaoDeputadoEstadual) && m.indicacaoDeputadoEstadual.length ? `
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px">
        ${m.indicacaoDeputadoEstadual.map((d, i) => `<span class="tag ${d.partido ? "roxo" : "cinza"}" style="font-size:12px;padding:5px 12px"><b>${i === 0 ? "1ª opção" : "2ª opção"}:</b> ${esc(d.nome)}${d.partido ? " · " + esc(d.partido) : ""}${d.votos2022 ? " · " + fmtN(d.votos2022) + " votos em 2022" : ""}</span>`).join("")}
      </div>
      <div style="font-size:11px;color:var(--tx3)">Fonte: Indicação parcial dos gabinetes das prefeituras</div>`
      : '<div style="color:var(--tx3);font-size:12.5px">Sem indicação registrada para este município.</div>'}

    <details class="secao-colapsavel">
      <summary>🏛️ Vereadores eleitos em 2024 (${Array.isArray(m.vereadores2024) ? m.vereadores2024.length : 0})</summary>
      <div class="secao-corpo">${tabelaCandidatos(m.vereadores2024)}</div>
    </details>

    <h3 style="font-size:13px;margin:16px 0 6px">🤝 Lideranças (${lids.length})
      <button class="btn mini" style="float:right" onclick="Modal.fechar();novaLideranca(${m.id})">+ Adicionar</button></h3>
    ${lids.length ? `<table class="tab"><thead><tr><th>Nome</th><th>Função</th><th>Status</th><th class="num">Potencial</th><th class="num">Expectativa</th></tr></thead><tbody>
      ${lids.map(l => `<tr class="clicavel" onclick="Modal.fechar();editarLideranca('${l.id}')"><td><b>${esc(l.nome)}</b>${l.apelido ? ` <span style="color:var(--tx3)">(${esc(l.apelido)})</span>` : ""}</td>
        <td style="color:var(--tx2)">${esc(l.funcao || "—")}</td><td>${statusTag(l.status)}</td>
        <td class="num">${fmtN(l.potencialVotos)}</td><td class="num"><b>${fmtN(expectativaLideranca(l))}</b></td></tr>`).join("")}
    </tbody></table>` : '<div style="color:var(--tx3);font-size:12.5px">Nenhuma liderança cadastrada neste município ainda.</div>'}

    <h3 style="font-size:13px;margin:16px 0 6px">📦 Materiais enviados (${rems.length})</h3>
    ${rems.length ? `<table class="tab"><thead><tr><th>Data</th><th>Material</th><th>Liderança</th><th class="num">Qtd</th></tr></thead><tbody>
      ${rems.slice(0, 15).map(r => `<tr><td>${esc(formatarData(r.data))}</td><td>${esc(r.materialNome)}</td><td>${esc(r.liderancaNome || "—")}</td><td class="num">${fmtN(r.qtd)}</td></tr>`).join("")}
    </tbody></table>` : '<div style="color:var(--tx3);font-size:12.5px">Nenhum material enviado para este município.</div>'}
  `, true);
}
window.abrirMunicipio = abrirMunicipio;

function trocarDeputados(tipo) {
  $("#dep-lista-est").style.display = tipo === "est" ? "block" : "none";
  $("#dep-lista-fed").style.display = tipo === "fed" ? "block" : "none";
  $("#btn-dep-est").className = tipo === "est" ? "btn mini" : "btn sec mini";
  $("#btn-dep-fed").className = tipo === "fed" ? "btn mini" : "btn sec mini";
}
window.trocarDeputados = trocarDeputados;

function formatarData(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}
window.formatarData = formatarData;

async function salvarMeta(id) {
  const v = Number($("#det-meta").value) || 0;
  try {
    if (v > 0) await colCampanha("metas").doc(String(id)).set({ metaVotos: v });
    else await colCampanha("metas").doc(String(id)).delete();
    toast("Meta salva!", "ok");
    Modal.fechar();
  } catch (e) { toast("Erro ao salvar meta: " + e.message, "erro"); }
}
window.salvarMeta = salvarMeta;
