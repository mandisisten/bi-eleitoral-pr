/* =====================================================================
   BI Paraná — Configurações: candidato, IA e usuários
   ===================================================================== */

(() => {
  let inicializado = false;
  let usuarios = [];

  function init() {
    if (inicializado) return;
    inicializado = true;
    $("#btn-cfg-salvar").onclick = salvarCandidato;
    $("#btn-novo-usuario").onclick = abrirNovoUsuario;
    $("#sobre-dados").innerHTML = `
      <b>População:</b> IBGE — estimativa populacional 2024 e Censo Demográfico 2022 (API de agregados).<br>
      <b>PIB:</b> IBGE — Produto Interno Bruto dos Municípios, 2021 (última divulgação municipal).<br>
      <b>Produção agrícola:</b> IBGE — Produção Agrícola Municipal (PAM), valor da produção por produto.<br>
      <b>Rebanhos:</b> IBGE — Pesquisa da Pecuária Municipal (PPM).<br>
      <b>Prefeitos e votações:</b> TSE — Dados Abertos (votação candidato por município/zona, eleições 2016, 2020 e 2024, incluindo eleições suplementares).<br>
      <b>Deputados:</b> TSE — 10 deputados estaduais e federais mais votados em cada município na eleição de 2022.<br>
      <b>Vereadores:</b> TSE — vereadores eleitos em 2024 em cada município, com votação.<br>
      <b>Eleitorado:</b> TSE — eleitores aptos por município (eleições 2024).<br>
      <b>Mapa:</b> IBGE — API de malhas territoriais.<br><br>
      Os dados públicos são estáticos (embutidos no arquivo <code>dados-pr.js</code>) e podem ser atualizados regenerando o arquivo.
      Lideranças, materiais, metas e agenda ficam no banco Firestore em tempo real.`;
  }

  function render() {
    init();
    $("#cfg-nome").value = BI.config.nomeCandidato || "";
    $("#cfg-partido").value = BI.config.partido || "";
    $("#cfg-cargo").value = BI.config.cargo || "Deputado Estadual";
    $("#cfg-meta").value = BI.config.metaTotal || "";
    carregarUsuarios();
  }
  PAGES.config = { render };

  async function salvarCandidato() {
    try {
      const nomeCandidato = $("#cfg-nome").value.trim();
      await db.collection("bi_campanhas").doc(BI.campanhaAtual.id).set({
        nome: nomeCandidato,
        nomeCandidato,
        partido: $("#cfg-partido").value.trim(),
        cargo: $("#cfg-cargo").value,
        metaTotal: Number($("#cfg-meta").value) || 0
      }, { merge: true });
      toast("Configurações salvas!", "ok");
    } catch (e) { toast("Erro: " + e.message, "erro"); }
  }

  /* ---------- Usuários (da campanha atual) ---------- */
  async function carregarUsuarios() {
    if (!ehAdmin() && !ehMaster()) { $("#painel-usuarios").style.display = "none"; return; }
    $("#painel-usuarios").style.display = "block";
    try {
      const snap = await db.collection("bi_usuarios").where("campanhaId", "==", BI.campanhaAtual.id).get();
      usuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderUsuarios();
    } catch (e) {
      $("#usr-tabela").innerHTML = `<div class="vazio">Erro ao listar usuários: ${esc(e.message)}</div>`;
    }
  }

  function renderUsuarios() {
    $("#usr-tabela").innerHTML = `
      <table class="tab"><thead><tr><th>Usuário</th><th>Papel</th><th>Status</th><th></th></tr></thead><tbody>
      ${usuarios.map(u => {
        const podeExcluir = u.id !== BI.perfil.id && (ehMaster() || u.role === "coordenador");
        return `<tr>
        <td><b>${esc(u.username)}</b>${u.id === BI.perfil.id ? ' <span class="tag azul">você</span>' : ""}</td>
        <td>${u.role === "admin" ? '<span class="tag roxo">Administrador</span>' : '<span class="tag cinza">Coordenador</span>'}</td>
        <td>${u.ativo !== false ? '<span class="tag verde">Ativo</span>' : '<span class="tag vermelho">Revogado</span>'}</td>
        <td style="text-align:right;white-space:nowrap">${u.id !== BI.perfil.id ? `
          <button class="btn sec mini" onclick="alternarUsuario('${u.id}', ${u.ativo !== false})">${u.ativo !== false ? "Revogar" : "Reativar"}</button>` : ""}
          ${podeExcluir ? `<button class="btn danger mini" onclick="confirmarExclusaoUsuario('${u.id}','${esc(u.username)}')">Excluir</button>` : ""}</td>
      </tr>`;
      }).join("")}
      </tbody></table>`;
  }

  window.alternarUsuario = async (id, ativoAtual) => {
    try {
      await db.collection("bi_usuarios").doc(id).update({ ativo: !ativoAtual });
      toast(ativoAtual ? "Acesso revogado." : "Acesso reativado.", "ok");
      carregarUsuarios();
    } catch (e) { toast("Erro: " + e.message, "erro"); }
  };

  window.confirmarExclusaoUsuario = (id, nome) => {
    Modal.abrir(`<h3>Excluir usuário</h3>
      <p style="font-size:13.5px;color:var(--tx2)">Tem certeza que deseja excluir o acesso de <b style="color:var(--tx)">${nome}</b>?
      Essa ação não pode ser desfeita — se a pessoa precisar de acesso de novo, será preciso criar um usuário novo.</p>
      <div class="modal-acoes">
        <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
        <button class="btn danger" onclick="excluirUsuario('${id}')">Excluir</button>
      </div>`);
  };

  window.excluirUsuario = async (id) => {
    try {
      await db.collection("bi_usuarios").doc(id).delete();
      Modal.fechar();
      toast("Usuário excluído.", "ok");
      carregarUsuarios();
    } catch (e) { toast("Erro: " + e.message, "erro"); }
  };

  function abrirNovoUsuario() {
    const senhaGerada = gerarSenha();
    Modal.abrir(`
      <h3>Criar usuário</h3>
      <div class="form-grid">
        <div class="span2"><label>Nome de usuário *</label><input id="f-usr-nome" placeholder="ex.: joao.coordenador"></div>
        <div class="span2"><label>Senha inicial (compartilhe com a pessoa)</label>
          <input id="f-usr-senha" value="${senhaGerada}"></div>
      </div>
      <p style="font-size:12px;color:var(--tx2);margin-top:10px">Entra como coordenador(a) desta campanha (cadastra lideranças e envios, sem acesso a Configurações). O usuário loga com esse nome e senha na tela de login.</p>
      <div class="modal-acoes">
        <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
        <button class="btn" onclick="criarUsuario()">Criar usuário</button>
      </div>`);
  }

  function gerarSenha(tam = 10) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const arr = new Uint8Array(tam);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => chars[b % chars.length]).join("");
  }

  /* Cria a conta num app secundário para não derrubar a sessão do admin.
     Sempre como coordenador(a) da campanha atualmente aberta. */
  window.criarUsuario = async () => {
    const nome = sanitizarUsuario($("#f-usr-nome").value);
    const senha = $("#f-usr-senha").value;
    if (!nome) return toast("Informe o nome de usuário.", "erro");
    if (senha.length < 6) return toast("Senha muito curta (mínimo 6).", "erro");
    try {
      const appSec = firebase.initializeApp(firebaseConfig, "secundario-" + Date.now());
      try {
        const cred = await appSec.auth().createUserWithEmailAndPassword(paraEmail(nome), senha);
        await db.collection("bi_usuarios").doc(cred.user.uid).set({
          username: nome, role: "coordenador", campanhaId: BI.campanhaAtual.id, ativo: true,
          criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
          criadoPor: BI.perfil.username
        });
        await appSec.auth().signOut();
      } finally {
        appSec.delete();
      }
      Modal.fechar();
      toast(`Usuário "${nome}" criado!`, "ok");
      carregarUsuarios();
    } catch (e) {
      toast(e.code === "auth/email-already-in-use" ? "Esse nome de usuário já existe." : "Erro: " + e.message, "erro");
    }
  };
})();
