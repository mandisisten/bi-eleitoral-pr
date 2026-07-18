/* =====================================================================
   BI Paraná — Gestão de Campanhas (somente master)
   Cada campanha é um candidato/tenant isolado, com seus próprios dados.
   ===================================================================== */

(() => {
  let inicializado = false;

  function init() {
    if (inicializado) return;
    inicializado = true;
    $("#btn-nova-campanha").onclick = abrirNovaCampanha;
  }

  function render() {
    init();
    const lista = BI.campanhas;
    $("#campanhas-cards").innerHTML = `
      <div class="card-kpi"><div class="rotulo">Campanhas cadastradas</div><div class="valor">${lista.length}</div></div>
      <div class="card-kpi"><div class="rotulo">Ativas</div><div class="valor" style="color:var(--ok)">${lista.filter(c => c.ativo !== false).length}</div></div>`;

    $("#campanhas-tabela").innerHTML = lista.length ? `
      <table class="tab"><thead><tr><th>Campanha</th><th>Partido</th><th>Cargo</th><th class="num">Meta de votos</th><th>Status</th><th></th></tr></thead><tbody>
      ${lista.map(c => `<tr>
        <td><b>${esc(c.nome || c.nomeCandidato || "(sem nome)")}</b></td>
        <td>${c.partido ? `<span class="tag azul">${esc(c.partido)}</span>` : "—"}</td>
        <td style="color:var(--tx2)">${esc(c.cargo || "—")}</td>
        <td class="num">${c.metaTotal ? fmtN(c.metaTotal) : "—"}</td>
        <td>${c.ativo !== false ? '<span class="tag verde">Ativa</span>' : '<span class="tag vermelho">Inativa</span>'}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn sec mini" onclick="abrirEditarCampanha('${c.id}')">Editar</button>
          <button class="btn danger mini" onclick="abrirExcluirCampanha('${c.id}','${esc(c.nome || c.nomeCandidato || "")}')">Excluir</button>
          <button class="btn mini" onclick="entrarCampanha('${c.id}')">Entrar →</button>
        </td>
      </tr>`).join("")}
      </tbody></table>` : '<div class="vazio">Nenhuma campanha cadastrada ainda. Clique em "+ Nova campanha" para criar a primeira.</div>';
  }
  PAGES.campanhas = { render };

  window.abrirEditarCampanha = (id) => {
    const c = BI.campanhas.find(x => x.id === id);
    if (!c) return;
    Modal.abrir(`
      <h3>Editar campanha</h3>
      <div class="form-grid">
        <div><label>Nome do candidato *</label><input id="f-edit-nome" value="${esc(c.nomeCandidato || c.nome || "")}"></div>
        <div><label>Partido</label><input id="f-edit-partido" value="${esc(c.partido || "")}"></div>
        <div><label>Cargo em disputa</label><select id="f-edit-cargo">
          <option value="Deputado Estadual" ${c.cargo === "Deputado Estadual" ? "selected" : ""}>Deputado Estadual</option>
          <option value="Deputado Federal" ${c.cargo === "Deputado Federal" ? "selected" : ""}>Deputado Federal</option>
        </select></div>
        <div><label>Meta de votos</label><input id="f-edit-meta" type="number" min="0" value="${c.metaTotal || ""}"></div>
      </div>
      <div class="modal-acoes">
        <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
        <button class="btn" onclick="salvarEdicaoCampanha('${id}')">Salvar</button>
      </div>`);
  };

  window.salvarEdicaoCampanha = async (id) => {
    const nomeCandidato = $("#f-edit-nome").value.trim();
    if (!nomeCandidato) return toast("Informe o nome do candidato.", "erro");
    try {
      await db.collection("bi_campanhas").doc(id).update({
        nome: nomeCandidato, nomeCandidato,
        partido: $("#f-edit-partido").value.trim(),
        cargo: $("#f-edit-cargo").value,
        metaTotal: Number($("#f-edit-meta").value) || 0
      });
      Modal.fechar();
      toast("Campanha atualizada!", "ok");
    } catch (e) { toast("Erro: " + e.message, "erro"); }
  };

  window.abrirExcluirCampanha = (id, nome) => {
    Modal.abrir(`
      <h3>Excluir campanha "${nome}"</h3>
      <p style="font-size:13.5px;color:var(--tx2);line-height:1.6">
        Isso apaga <b style="color:var(--err)">permanentemente</b> todas as lideranças, materiais, envios,
        metas, compromissos de agenda e simulações de chapa desta campanha, e remove o acesso de todos os
        usuários vinculados a ela. <b>Essa ação não pode ser desfeita.</b>
      </p>
      <div class="campo" style="margin-top:12px">
        <label>Para confirmar, digite o nome da campanha: <b>${nome}</b></label>
        <input id="f-confirma-excluir-campanha" autocomplete="off">
      </div>
      <div class="modal-acoes">
        <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
        <button class="btn danger" id="btn-confirma-excluir-campanha" disabled onclick="excluirCampanhaDefinitivamente('${id}')">Excluir definitivamente</button>
      </div>`);
    $("#f-confirma-excluir-campanha").oninput = e => {
      $("#btn-confirma-excluir-campanha").disabled = e.target.value.trim() !== nome;
    };
  };

  window.excluirCampanhaDefinitivamente = async (id) => {
    const btn = $("#btn-confirma-excluir-campanha");
    btn.disabled = true;
    btn.textContent = "Excluindo...";
    try {
      const campRef = db.collection("bi_campanhas").doc(id);
      const subcolecoes = ["liderancas", "materiais", "remessas", "metas", "eventos", "chapaSim"];
      for (const col of subcolecoes) {
        const snap = await campRef.collection(col).get();
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const lote = db.batch();
          docs.slice(i, i + 400).forEach(d => lote.delete(d.ref));
          await lote.commit();
        }
      }
      const usuariosSnap = await db.collection("bi_usuarios").where("campanhaId", "==", id).get();
      if (usuariosSnap.docs.length) {
        const loteUsr = db.batch();
        usuariosSnap.docs.forEach(d => loteUsr.delete(d.ref));
        await loteUsr.commit();
      }
      await campRef.delete();
      Modal.fechar();
      toast("Campanha excluída.", "ok");
    } catch (e) {
      toast("Erro ao excluir: " + e.message, "erro");
      btn.disabled = false;
      btn.textContent = "Excluir definitivamente";
    }
  };

  function abrirNovaCampanha() {
    const senhaGerada = gerarSenhaCampanha();
    Modal.abrir(`
      <h3>Nova campanha</h3>
      <div class="form-grid">
        <div><label>Nome do candidato *</label><input id="f-camp-nome" placeholder="ex.: Fulano de Tal"></div>
        <div><label>Partido</label><input id="f-camp-partido"></div>
        <div><label>Cargo em disputa</label><select id="f-camp-cargo">
          <option value="Deputado Estadual">Deputado Estadual</option>
          <option value="Deputado Federal">Deputado Federal</option>
        </select></div>
        <div><label>Meta de votos</label><input id="f-camp-meta" type="number" min="0"></div>
      </div>
      <h3 style="font-size:13px;margin:16px 0 6px">Primeiro acesso desta campanha</h3>
      <div class="form-grid">
        <div><label>Nome de usuário *</label><input id="f-camp-usr" placeholder="ex.: fulano.admin"></div>
        <div><label>Senha inicial</label><input id="f-camp-senha" value="${senhaGerada}"></div>
      </div>
      <p style="font-size:12px;color:var(--tx2);margin-top:10px">Essa conta entra como administradora dessa campanha — só ela (e você, como master) vê os dados cadastrados aqui.</p>
      <div class="modal-acoes">
        <button class="btn sec" onclick="Modal.fechar()">Cancelar</button>
        <button class="btn" onclick="criarCampanha()">Criar campanha</button>
      </div>`);
  }

  function gerarSenhaCampanha(tam = 10) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const arr = new Uint8Array(tam);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => chars[b % chars.length]).join("");
  }

  window.criarCampanha = async () => {
    const nomeCandidato = $("#f-camp-nome").value.trim();
    const partido = $("#f-camp-partido").value.trim();
    const cargo = $("#f-camp-cargo").value;
    const metaTotal = Number($("#f-camp-meta").value) || 0;
    const usuario = sanitizarUsuario($("#f-camp-usr").value);
    const senha = $("#f-camp-senha").value;

    if (!nomeCandidato) return toast("Informe o nome do candidato.", "erro");
    if (!usuario) return toast("Informe o nome de usuário de acesso.", "erro");
    if (senha.length < 6) return toast("Senha muito curta (mínimo 6).", "erro");

    try {
      const novaRef = db.collection("bi_campanhas").doc();
      await novaRef.set({
        nome: nomeCandidato, nomeCandidato, partido, cargo, metaTotal,
        ativo: true, criadoEm: firebase.firestore.FieldValue.serverTimestamp(), criadoPor: BI.perfil.username
      });

      const appSec = firebase.initializeApp(firebaseConfig, "secundario-" + Date.now());
      try {
        const cred = await appSec.auth().createUserWithEmailAndPassword(paraEmail(usuario), senha);
        await db.collection("bi_usuarios").doc(cred.user.uid).set({
          username: usuario, role: "admin", campanhaId: novaRef.id, ativo: true,
          criadoEm: firebase.firestore.FieldValue.serverTimestamp(), criadoPor: BI.perfil.username
        });
        await appSec.auth().signOut();
      } finally {
        appSec.delete();
      }

      Modal.fechar();
      toast(`Campanha "${nomeCandidato}" criada!`, "ok");
    } catch (e) {
      toast(e.code === "auth/email-already-in-use" ? "Esse nome de usuário já existe." : "Erro: " + e.message, "erro");
    }
  };
})();
