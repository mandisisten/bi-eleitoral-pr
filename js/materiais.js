/* =====================================================================
   BI Paraná — Materiais de campanha: catálogo, estoque e envios
   ===================================================================== */

(() => {
  let inicializado = false;
  let abaAtiva = "remessas";

  function enviadoPorMaterial() {
    const r = {};
    BI.remessas.forEach(x => r[x.materialId] = (r[x.materialId] || 0) + (Number(x.qtd) || 0));
    return r;
  }
  window.enviadoPorMaterial = enviadoPorMaterial;

  function init() {
    if (inicializado) return;
    inicializado = true;
    selectMunicipios($("#rem-municipio"), true);
    ["rem-busca", "rem-material", "rem-municipio"].forEach(id => $("#" + id).addEventListener("input", render));
    $("#btn-novo-material").onclick = () => abrirMaterial();
    $("#btn-nova-remessa").onclick = () => abrirRemessa();
    $$("#page-materiais .aba").forEach(a => a.onclick = () => {
      abaAtiva = a.dataset.aba;
      $$("#page-materiais .aba").forEach(x => x.classList.toggle("ativa", x === a));
      $("#aba-remessas").style.display = abaAtiva === "remessas" ? "block" : "none";
      $("#aba-catalogo").style.display = abaAtiva === "catalogo" ? "block" : "none";
    });
  }

  function render() {
    init();
    const enviados = enviadoPorMaterial();
    const totalEnviado = Object.values(enviados).reduce((a, b) => a + b, 0);
    const munAtendidos = new Set(BI.remessas.map(r => r.municipioId)).size;
    const custoTotal = BI.remessas.reduce((a, r) => {
      const mat = BI.materiais.find(m => m.id === r.materialId);
      return a + (Number(r.qtd) || 0) * (Number(mat?.custoUnit) || 0);
    }, 0);

    $("#mat-cards").innerHTML = `
      <div class="card-kpi"><div class="rotulo">Tipos de material</div><div class="valor">${BI.materiais.length}</div></div>
      <div class="card-kpi"><div class="rotulo">Unidades enviadas</div><div class="valor">${fmtN(totalEnviado)}</div><div class="extra">${BI.remessas.length} envios</div></div>
      <div class="card-kpi"><div class="rotulo">Municípios atendidos</div><div class="valor">${munAtendidos}</div></div>
      <div class="card-kpi"><div class="rotulo">Custo estimado enviado</div><div class="valor">${custoTotal ? fmtR(custoTotal) : "—"}</div><div class="extra">com base no custo unitário</div></div>`;

    // filtro do select de materiais
    const selMat = $("#rem-material");
    const selVal = selMat.value;
    selMat.innerHTML = '<option value="">Todos</option>' + BI.materiais.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join("");
    selMat.value = selVal;

    /* --- remessas --- */
    const busca = ($("#rem-busca").value || "").toLowerCase();
    const fMat = $("#rem-material").value;
    const fMun = $("#rem-municipio").value;
    const lista = BI.remessas.filter(r => {
      const mun = MUNI_BY_ID[r.municipioId];
      if (busca && !(r.materialNome || "").toLowerCase().includes(busca) &&
          !(r.liderancaNome || "").toLowerCase().includes(busca) &&
          !(mun && mun.nome.toLowerCase().includes(busca))) return false;
      if (fMat && r.materialId !== fMat) return false;
      if (fMun && String(r.municipioId) !== fMun) return false;
      return true;
    });

    $("#rem-tabela").innerHTML = lista.length ? `
      <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">${lista.length} envio(s)</div>
      <table class="tab"><thead><tr><th>Data</th><th>Material</th><th class="num">Quantidade</th><th>Liderança</th><th>Município</th><th>Registrado por</th><th>Obs</th><th></th></tr></thead><tbody>
      ${lista.map(r => {
        const mun = MUNI_BY_ID[r.municipioId];
        return `<tr>
          <td>${esc(formatarData(r.data))}</td>
          <td><b>${esc(r.materialNome)}</b></td>
          <td class="num"><b>${fmtN(r.qtd)}</b></td>
          <td>${esc(r.liderancaNome || "—")}</td>
          <td>${mun ? esc(mun.nome) : "—"}</td>
          <td style="color:var(--tx2);font-size:12px">${esc(r.criadoPor || "—")}</td>
          <td style="color:var(--tx2);font-size:12px">${esc(r.obs || "")}</td>
          <td><button class="btn danger mini" onclick="excluirRemessa('${r.id}')">✕</button></td>
        </tr>`;
      }).join("")}
      </tbody></table>` : '<div class="vazio">Nenhum envio registrado. Clique em "+ Registrar envio".</div>';

    /* --- catálogo --- */
    $("#cat-tabela").innerHTML = BI.materiais.length ? `
      <table class="tab"><thead><tr><th>Material</th><th>Tipo</th><th class="num">Custo unitário</th>
        <th class="num">Estoque inicial</th><th class="num">Enviado</th><th class="num">Saldo</th><th></th></tr></thead><tbody>
      ${BI.materiais.map(m => {
        const env = enviados[m.id] || 0;
        const saldo = (Number(m.estoque) || 0) - env;
        return `<tr class="clicavel" onclick="abrirMaterial('${m.id}')">
          <td><b>${esc(m.nome)}</b></td>
          <td style="color:var(--tx2)">${esc(m.tipo || "—")}</td>
          <td class="num">${m.custoUnit ? "R$ " + Number(m.custoUnit).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}</td>
          <td class="num">${fmtN(m.estoque)}</td>
          <td class="num">${fmtN(env)}</td>
          <td class="num"><b style="color:${saldo < 0 ? "var(--err)" : saldo === 0 ? "var(--tx3)" : "var(--ok)"}">${fmtN(saldo)}</b></td>
          <td><button class="btn danger mini" onclick="event.stopPropagation();excluirMaterial('${m.id}','${esc(m.nome)}')">✕</button></td>
        </tr>`;
      }).join("")}
      </tbody></table>` : '<div class="vazio">Catálogo vazio. Cadastre os materiais da campanha (santinhos, adesivos, bandeiras...).</div>';
  }

  PAGES.materiais = { render };
})();

/* ---------- CRUD material ---------- */
const TIPOS_MATERIAL = ["Impresso (santinho)", "Impresso (colinha)", "Adesivo", "Banner / faixa", "Bandeira",
  "Camiseta", "Boné", "Panfleto / folder", "Jornal da campanha", "Brinde", "Outro"];

function abrirMaterial(id) {
  const m = id ? BI.materiais.find(x => x.id === id) : null;
  Modal.abrir(`
    <h3>${m ? "Editar" : "Novo"} material</h3>
    <div class="form-grid">
      <div class="span2"><label>Nome do material *</label><input id="f-mat-nome" value="${esc(m?.nome || "")}" placeholder="ex.: Santinho 7x10 colorido"></div>
      <div><label>Tipo</label><select id="f-mat-tipo">${TIPOS_MATERIAL.map(t => `<option ${m?.tipo === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
      <div><label>Custo unitário (R$)</label><input id="f-mat-custo" type="number" step="0.01" min="0" value="${m?.custoUnit ?? ""}"></div>
      <div><label>Estoque inicial (produzido)</label><input id="f-mat-estoque" type="number" min="0" value="${m?.estoque ?? ""}"></div>
    </div>
    <div class="modal-acoes">
      <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn" onclick="salvarMaterial('${m?.id || ""}')">Salvar</button>
    </div>`);
}
window.abrirMaterial = abrirMaterial;

async function salvarMaterial(id) {
  const dados = {
    nome: $("#f-mat-nome").value.trim(),
    tipo: $("#f-mat-tipo").value,
    custoUnit: Number($("#f-mat-custo").value) || 0,
    estoque: Number($("#f-mat-estoque").value) || 0
  };
  if (!dados.nome) return toast("Informe o nome do material.", "erro");
  try {
    if (id) await colCampanha("materiais").doc(id).update(dados);
    else await colCampanha("materiais").add({ ...dados, criadoPor: BI.perfil.username });
    Modal.fechar(); toast("Material salvo!", "ok");
  } catch (e) { toast("Erro: " + e.message, "erro"); }
}
window.salvarMaterial = salvarMaterial;

function excluirMaterial(id, nome) {
  const temRemessa = BI.remessas.some(r => r.materialId === id);
  Modal.abrir(`<h3>Excluir material</h3>
    <p style="font-size:13.5px;color:var(--tx2)">Excluir <b style="color:var(--tx)">${nome}</b>?
    ${temRemessa ? "<br><br>⚠️ Existem envios registrados com esse material — o histórico de envios será mantido, mas sem vínculo com o catálogo." : ""}</p>
    <div class="modal-acoes">
      <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn danger" onclick="confirmarExclusaoMaterial('${id}')">Excluir</button>
    </div>`);
}
window.excluirMaterial = excluirMaterial;
async function confirmarExclusaoMaterial(id) {
  try { await colCampanha("materiais").doc(id).delete(); Modal.fechar(); toast("Material excluído.", "ok"); }
  catch (e) { toast("Erro: " + e.message, "erro"); }
}
window.confirmarExclusaoMaterial = confirmarExclusaoMaterial;

/* ---------- CRUD remessa (envio) ---------- */
function abrirRemessa() {
  if (!BI.materiais.length) return toast("Cadastre um material no catálogo primeiro.", "erro");
  const hoje = new Date().toISOString().slice(0, 10);
  Modal.abrir(`
    <h3>Registrar envio de material</h3>
    <div class="form-grid">
      <div><label>Material *</label><select id="f-rem-material">${BI.materiais.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join("")}</select></div>
      <div><label>Quantidade *</label><input id="f-rem-qtd" type="number" min="1" placeholder="ex.: 1000"></div>
      <div><label>Município *</label><select id="f-rem-municipio"></select></div>
      <div><label>Liderança que recebe</label><select id="f-rem-lideranca"><option value="">— nenhuma —</option></select></div>
      <div><label>Data do envio</label><input id="f-rem-data" type="date" value="${hoje}"></div>
      <div><label>Observações</label><input id="f-rem-obs" placeholder="ex.: entregue na sede"></div>
    </div>
    <div id="f-rem-saldo" style="font-size:12px;color:var(--tx2);margin-top:10px"></div>
    <div class="modal-acoes">
      <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn" onclick="salvarRemessa()">Registrar</button>
    </div>`);
  selectMunicipios($("#f-rem-municipio"), false);
  const atualizarLid = () => {
    const munId = Number($("#f-rem-municipio").value);
    const lids = BI.liderancas.filter(l => l.municipioId === munId);
    $("#f-rem-lideranca").innerHTML = '<option value="">— nenhuma —</option>' +
      lids.map(l => `<option value="${l.id}">${esc(l.nome)}${l.apelido ? " (" + esc(l.apelido) + ")" : ""}</option>`).join("");
  };
  const atualizarSaldo = () => {
    const mat = BI.materiais.find(m => m.id === $("#f-rem-material").value);
    if (!mat) return;
    const env = (window.enviadoPorMaterial()[mat.id] || 0);
    const saldo = (Number(mat.estoque) || 0) - env;
    $("#f-rem-saldo").innerHTML = `Saldo atual de <b>${esc(mat.nome)}</b>: <b style="color:${saldo > 0 ? "var(--ok)" : "var(--err)"}">${fmtN(saldo)}</b> unidades`;
  };
  $("#f-rem-municipio").onchange = atualizarLid;
  $("#f-rem-material").onchange = atualizarSaldo;
  atualizarLid(); atualizarSaldo();
}
window.abrirRemessa = abrirRemessa;

async function salvarRemessa() {
  const mat = BI.materiais.find(m => m.id === $("#f-rem-material").value);
  const lid = BI.liderancas.find(l => l.id === $("#f-rem-lideranca").value);
  const dados = {
    materialId: mat?.id || null,
    materialNome: mat?.nome || "",
    qtd: Number($("#f-rem-qtd").value) || 0,
    municipioId: Number($("#f-rem-municipio").value),
    liderancaId: lid?.id || null,
    liderancaNome: lid?.nome || "",
    data: $("#f-rem-data").value,
    obs: $("#f-rem-obs").value.trim(),
    criadoPor: BI.perfil.username,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (!dados.materialId) return toast("Escolha o material.", "erro");
  if (dados.qtd <= 0) return toast("Informe a quantidade.", "erro");
  if (!dados.municipioId) return toast("Escolha o município.", "erro");
  try {
    await colCampanha("remessas").add(dados);
    Modal.fechar(); toast("Envio registrado!", "ok");
  } catch (e) { toast("Erro: " + e.message, "erro"); }
}
window.salvarRemessa = salvarRemessa;

async function excluirRemessa(id) {
  try { await colCampanha("remessas").doc(id).delete(); toast("Envio excluído.", "ok"); }
  catch (e) { toast("Erro: " + e.message, "erro"); }
}
window.excluirRemessa = excluirRemessa;
