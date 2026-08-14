/* =====================================================================
   BI Paraná — núcleo: Firebase, autenticação, navegação, dashboard, mapa
   ===================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDLRTXzl0ZzPK_UheeQA8MtIh72O84-zMw",
  authDomain: "bi-eleitoral-pr.firebaseapp.com",
  projectId: "bi-eleitoral-pr",
  storageBucket: "bi-eleitoral-pr.firebasestorage.app",
  messagingSenderId: "541288496972",
  appId: "1:541288496972:web:b2054334c1e58d55d2d9e9"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const DOMINIO_USUARIO = "@bieleitoral.local"; // separado do sistema cripto

/* ---------- Estado global ---------- */
const BI = {
  usuario: null,        // firebase user
  perfil: null,         // doc bi_usuarios {id, username, role, campanhaId, ativo}
  campanhaAtual: null,  // doc bi_campanhas atualmente "aberto" {id, nome, partido, cargo, metaTotal, ...}
  campanhas: [],         // lista de campanhas (para a tela do master)
  liderancas: [],
  materiais: [],
  remessas: [],
  eventos: [],
  metas: {},            // municipioId -> {metaVotos}
  chapaSim: {},         // idChapaSim -> {cargo, chapaChave, chapaNome, candidatos, legenda}
  config: { nomeCandidato: "", partido: "", cargo: "Deputado Estadual", metaTotal: 0 },
  paginaAtual: "dashboard",
  unsubs: [],           // listeners escopados à campanha aberta (desligados ao trocar/sair)
  unsubsConta: []       // listeners de nível de conta (ex.: lista de campanhas do master)
};
window.BI = BI;
const PAGES = {};       // cada módulo registra sua página
window.PAGES = PAGES;

/* ---------- Índices dos dados públicos ---------- */
const MUNI = window.DADOS_PR;
const MUNI_BY_ID = {};
MUNI.forEach(m => MUNI_BY_ID[m.id] = m);
const MESOS = [...new Set(MUNI.map(m => m.meso))].sort();
window.MUNI = MUNI; window.MUNI_BY_ID = MUNI_BY_ID; window.MESOS = MESOS;

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
window.$ = $; window.$$ = $$;

const fmtN = n => n == null ? "—" : new Intl.NumberFormat("pt-BR").format(Math.round(n));
const fmtR = n => n == null ? "—" : "R$ " + new Intl.NumberFormat("pt-BR").format(Math.round(n));
const fmtMilR = n => n == null ? "—" : (n >= 1e6 ? "R$ " + (n/1e6).toFixed(2).replace(".", ",") + " bi" : n >= 1e3 ? "R$ " + (n/1e3).toFixed(1).replace(".", ",") + " mi" : "R$ " + fmtN(n) + " mil");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
window.fmtN = fmtN; window.fmtR = fmtR; window.fmtMilR = fmtMilR; window.esc = esc;

function linkWhatsApp(telefone, mensagem) {
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const comDDI = digitos.length <= 11 ? "55" + digitos : digitos;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(mensagem || "")}`;
}
function abrirWhatsApp(telefone, mensagem) {
  const link = linkWhatsApp(telefone, mensagem);
  if (!link) return toast("Essa liderança não tem telefone cadastrado.", "erro");
  window.open(link, "_blank", "noopener");
}
window.linkWhatsApp = linkWhatsApp; window.abrirWhatsApp = abrirWhatsApp;

function toast(texto, tipo) {
  const el = document.createElement("div");
  el.className = "toast " + (tipo || "");
  el.textContent = texto;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
window.toast = toast;

const Modal = {
  abrir(html, largo) {
    $("#modal-caixa").classList.toggle("largo", !!largo);
    $("#modal-conteudo").innerHTML = html;
    $("#modal-fundo").classList.add("aberto");
  },
  fechar() { $("#modal-fundo").classList.remove("aberto"); $("#modal-conteudo").innerHTML = ""; }
};
window.Modal = Modal;
$("#modal-fechar").onclick = Modal.fechar;
$("#modal-fundo").addEventListener("click", e => { if (e.target.id === "modal-fundo") Modal.fechar(); });

function baixarCSV(nomeArquivo, linhas) {
  const csv = "﻿" + linhas.map(l => l.map(c => {
    c = String(c ?? "");
    return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
  }).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.baixarCSV = baixarCSV;

function selectMunicipios(sel, incluirVazio) {
  sel.innerHTML = (incluirVazio ? '<option value="">Todos</option>' : "") +
    MUNI.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join("");
}
window.selectMunicipios = selectMunicipios;

function selectMesos(sel) {
  sel.innerHTML = '<option value="">Todas</option>' + MESOS.map(m => `<option>${esc(m)}</option>`).join("");
}
window.selectMesos = selectMesos;

/* Referência à subcoleção da campanha atualmente aberta (liderancas, materiais, remessas, metas, eventos, chapaSim) */
function colCampanha(nome) {
  return db.collection("bi_campanhas").doc(BI.campanhaAtual.id).collection(nome);
}
window.colCampanha = colCampanha;

/* Carrega sob demanda a votação completa (todos os municípios) de cada candidato a
   deputado estadual/federal em 2022 — arquivo pesado (~6,5MB), usado pela página
   "Votação por Candidato" e pelo simulador de quociente eleitoral. */
let _carregandoVotosDeputados = null;
function carregarVotosDeputados() {
  if (window.VOTOS_DEPUTADOS) return Promise.resolve();
  if (_carregandoVotosDeputados) return _carregandoVotosDeputados;
  _carregandoVotosDeputados = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "votos-deputados.js?v=4";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Não foi possível carregar os dados de votação."));
    document.head.appendChild(s);
  });
  return _carregandoVotosDeputados;
}
window.carregarVotosDeputados = carregarVotosDeputados;

/* ---------- Cálculo de expectativa ---------- */
function expectativaLideranca(l) {
  if (l.status === "perdida") return 0;
  const conf = l.confianca == null ? 100 : Number(l.confianca);
  return Math.round((Number(l.potencialVotos) || 0) * conf / 100);
}
function expectativaPorMunicipio() {
  const r = {};
  BI.liderancas.forEach(l => {
    r[l.municipioId] = (r[l.municipioId] || 0) + expectativaLideranca(l);
  });
  return r;
}
function liderancasPorMunicipio() {
  const r = {};
  BI.liderancas.forEach(l => { r[l.municipioId] = (r[l.municipioId] || 0) + 1; });
  return r;
}

/* Lideranças que ocupam (ou ocuparam) cargo eletivo — usado no mapa e no relatório */
const FUNCOES_ELETIVAS = {
  lid_prefeitos: ["Prefeito(a)"],
  lid_vices: ["Vice-prefeito(a)"],
  lid_vereadores: ["Vereador(a)"],
  lid_cargo_eletivo: ["Prefeito(a)", "Vice-prefeito(a)", "Vereador(a)"]
};
const PLURAL_FUNCAO_ELETIVA = {
  "Prefeito(a)": "Prefeitos(as)",
  "Vice-prefeito(a)": "Vice-prefeitos(as)",
  "Vereador(a)": "Vereadores(as)"
};
function liderancasPorMunicipioFiltradas(funcoes) {
  const r = {};
  BI.liderancas.forEach(l => { if (funcoes.includes(l.funcao)) (r[l.municipioId] = r[l.municipioId] || []).push(l); });
  return r;
}
function resumoCargoEletivo(municipioId, grupoCargoEletivo) {
  const lista = grupoCargoEletivo[municipioId];
  if (!lista || !lista.length) return "nenhum aliado com mandato";
  const porFuncao = {};
  lista.forEach(l => porFuncao[l.funcao] = (porFuncao[l.funcao] || 0) + 1);
  return Object.entries(porFuncao).map(([f, n]) => `${n} ${n > 1 ? PLURAL_FUNCAO_ELETIVA[f] : f}`).join(", ");
}
window.expectativaLideranca = expectativaLideranca;
window.expectativaPorMunicipio = expectativaPorMunicipio;
window.liderancasPorMunicipio = liderancasPorMunicipio;
window.FUNCOES_ELETIVAS = FUNCOES_ELETIVAS;
window.liderancasPorMunicipioFiltradas = liderancasPorMunicipioFiltradas;
window.resumoCargoEletivo = resumoCargoEletivo;

/* ---------- Login / bootstrap ---------- */
function sanitizarUsuario(u) { return String(u).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, ""); }
function paraEmail(u) { return sanitizarUsuario(u) + DOMINIO_USUARIO; }
window.paraEmail = paraEmail; window.sanitizarUsuario = sanitizarUsuario;

async function verificarBootstrap() {
  try {
    const doc = await db.collection("bi_config").doc("bootstrap").get();
    if (!doc.exists) $("#link-bootstrap").style.display = "inline";
  } catch (e) { /* sem permissão de leitura anônima — ignora */ }
}

$("#link-bootstrap").onclick = () => { $("#login-form").style.display = "none"; $("#bootstrap-form").style.display = "block"; };
$("#link-voltar-login").onclick = () => { $("#bootstrap-form").style.display = "none"; $("#login-form").style.display = "block"; };

$("#btn-bootstrap").onclick = async () => {
  const u = sanitizarUsuario($("#boot-user").value);
  const s1 = $("#boot-senha").value, s2 = $("#boot-senha2").value;
  const erro = $("#boot-erro");
  erro.textContent = "";
  if (!u) return erro.textContent = "Informe um nome de usuário.";
  if (s1.length < 6) return erro.textContent = "Senha muito curta (mínimo 6).";
  if (s1 !== s2) return erro.textContent = "As senhas não conferem.";
  try {
    const cred = await auth.createUserWithEmailAndPassword(paraEmail(u), s1);
    const batch = db.batch();
    batch.set(db.collection("bi_usuarios").doc(cred.user.uid), {
      username: u, role: "master", ativo: true,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.set(db.collection("bi_config").doc("bootstrap"), { criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    toast("Conta master criada!", "ok");
  } catch (e) {
    erro.textContent = e.code === "auth/email-already-in-use" ? "Esse usuário já existe." : "Erro: " + e.message;
  }
};

$("#btn-entrar").onclick = entrar;
$("#login-senha").addEventListener("keydown", e => { if (e.key === "Enter") entrar(); });
async function entrar() {
  const erro = $("#login-erro");
  erro.textContent = "";
  try {
    await auth.signInWithEmailAndPassword(paraEmail($("#login-user").value), $("#login-senha").value);
  } catch (e) {
    erro.textContent = "Usuário ou senha inválidos.";
  }
}
$("#btn-sair").onclick = () => auth.signOut();

auth.onAuthStateChanged(async user => {
  if (!user || !user.email || !user.email.endsWith(DOMINIO_USUARIO)) {
    if (user) { /* conta de outro sistema (cripto) — não pertence ao BI */ auth.signOut(); }
    encerrarSessao();
    return;
  }
  try {
    const doc = await db.collection("bi_usuarios").doc(user.uid).get();
    if (!doc.exists || doc.data().ativo === false) {
      $("#login-erro").textContent = "Acesso não autorizado ou revogado.";
      auth.signOut();
      return;
    }
    BI.usuario = user;
    BI.perfil = { id: user.uid, ...doc.data() };
    iniciarApp();
  } catch (e) {
    $("#login-erro").textContent = "Erro ao carregar perfil: " + e.message;
    auth.signOut();
  }
});

function encerrarSessao() {
  BI.usuario = null; BI.perfil = null; BI.campanhaAtual = null; BI.campanhas = [];
  BI.unsubs.forEach(u => u()); BI.unsubs = [];
  BI.unsubsConta.forEach(u => u()); BI.unsubsConta = [];
  $("#app").style.display = "none";
  $("#tela-migracao").style.display = "none";
  $("#tela-login").style.display = "flex";
  verificarBootstrap();
}

function ehAdmin() { return BI.perfil && BI.perfil.role === "admin"; }
function ehMaster() { return BI.perfil && BI.perfil.role === "master"; }
window.ehAdmin = ehAdmin;
window.ehMaster = ehMaster;

/* ---------- Precisa de migração? (contas criadas antes do modelo multi-campanha) ---------- */
function precisaMigrar() { return BI.perfil.role === "admin" && !("campanhaId" in BI.perfil); }

/* ---------- Inicialização pós-login ---------- */
function iniciarApp() {
  $("#tela-login").style.display = "none";
  $("#app").style.display = "block";
  $("#user-nome").textContent = BI.perfil.username;
  const inicial = (BI.perfil.username || "?").charAt(0).toUpperCase();
  $("#user-avatar").textContent = inicial;
  $("#topbar-avatar").textContent = inicial;
  $("#nav-campanhas").style.display = ehMaster() ? "flex" : "none";

  if (precisaMigrar()) { mostrarTelaMigracao(); return; }

  if (ehMaster()) {
    $("#user-papel").textContent = "Master";
    escutarListaCampanhas();
    mostrarNavEmCampanha(false);
    mostrarPagina("campanhas");
  } else if (BI.perfil.campanhaId) {
    entrarCampanha(BI.perfil.campanhaId);
  } else {
    // conta antiga (coordenador) ainda não vinculada a uma campanha — peça pro admin migrar primeiro
    $("#app").style.display = "none";
    $("#tela-login").style.display = "flex";
    $("#login-erro").textContent = "Sua conta ainda não está vinculada a nenhuma campanha. Peça para o administrador migrar o sistema primeiro.";
    auth.signOut();
  }
}

/* Mostra/esconde os itens de navegação da campanha (Municípios, Lideranças, etc.) —
   o master só os vê depois de "entrar" numa campanha; admin/coordenador sempre os vê. */
function mostrarNavEmCampanha(dentro) {
  $$(".nav-item:not(#nav-campanhas)").forEach(b => b.style.display = dentro ? "" : "none");
  $("#badge-campanha").style.display = (dentro && ehMaster()) ? "flex" : "none";
}

function escutarListaCampanhas() {
  BI.unsubsConta.push(db.collection("bi_campanhas").orderBy("nome").onSnapshot(snap => {
    BI.campanhas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (PAGES.campanhas && BI.paginaAtual === "campanhas") PAGES.campanhas.render();
  }, e => console.error("bi_campanhas", e)));
}

/* Entra numa campanha (aberta pelo dono dela, ou pelo master visitando qualquer uma) */
async function entrarCampanha(campanhaId) {
  BI.unsubs.forEach(u => u()); BI.unsubs = [];
  try {
    const docCamp = await db.collection("bi_campanhas").doc(campanhaId).get();
    if (!docCamp.exists) { toast("Campanha não encontrada.", "erro"); return; }
    BI.campanhaAtual = { id: campanhaId, ...docCamp.data() };
    BI.config = BI.campanhaAtual;
  } catch (e) { toast("Erro ao entrar na campanha: " + e.message, "erro"); return; }

  $("#user-papel").textContent = ehMaster() ? "Master" : ehAdmin() ? "Administrador" : "Coordenador";
  mostrarNavEmCampanha(true);
  $("#nav-config").style.display = (ehAdmin() || ehMaster()) ? "flex" : "none";
  $("#mh-modulo-config").style.display = (ehAdmin() || ehMaster()) ? "flex" : "none";
  atualizarCabecalho();

  const escutar = (nome, alvo, ordenar) => {
    BI.unsubs.push(colCampanha(nome).onSnapshot(snap => {
      BI[alvo] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (ordenar) BI[alvo].sort(ordenar);
      aoMudarDados();
    }, e => console.error(nome, e)));
  };
  escutar("liderancas", "liderancas", (a, b) => (b.potencialVotos || 0) - (a.potencialVotos || 0));
  escutar("materiais", "materiais", (a, b) => (a.nome || "").localeCompare(b.nome || ""));
  escutar("remessas", "remessas", (a, b) => (b.data || "").localeCompare(a.data || ""));
  escutar("eventos", "eventos", (a, b) => (a.data || "").localeCompare(b.data || ""));
  BI.unsubs.push(colCampanha("metas").onSnapshot(snap => {
    BI.metas = {};
    snap.docs.forEach(d => BI.metas[d.id] = d.data());
    aoMudarDados();
  }));
  BI.unsubs.push(colCampanha("chapaSim").onSnapshot(snap => {
    BI.chapaSim = {};
    snap.docs.forEach(d => BI.chapaSim[d.id] = d.data());
    aoMudarDados();
  }));
  BI.unsubs.push(db.collection("bi_campanhas").doc(campanhaId).onSnapshot(doc => {
    if (doc.exists) { BI.campanhaAtual = { id: campanhaId, ...doc.data() }; BI.config = BI.campanhaAtual; atualizarCabecalho(); aoMudarDados(); }
  }));

  mostrarPagina("dashboard");
}
window.entrarCampanha = entrarCampanha;

/* Master sai da campanha e volta pra lista de campanhas */
function sairDaCampanha() {
  BI.unsubs.forEach(u => u()); BI.unsubs = [];
  BI.campanhaAtual = null; BI.config = { nomeCandidato: "", partido: "", cargo: "Deputado Estadual", metaTotal: 0 };
  mostrarNavEmCampanha(false);
  mostrarPagina("campanhas");
}
window.sairDaCampanha = sairDaCampanha;

/* ---------- Migração do formato antigo (single-tenant) para multi-campanha ---------- */
function mostrarTelaMigracao() {
  $("#app").style.display = "none";
  $("#tela-login").style.display = "none";
  $("#tela-migracao").style.display = "flex";
  $("#btn-migrar").onclick = migrarParaMultiCampanha;
}

async function migrarParaMultiCampanha() {
  const status = $("#migracao-status");
  const btn = $("#btn-migrar");
  btn.disabled = true;
  status.innerHTML = "";
  const log = m => { status.innerHTML += `<div>${esc(m)}</div>`; };
  try {
    log("Lendo configurações antigas...");
    let configAntiga = {};
    try {
      const docCfg = await db.collection("bi_config").doc("geral").get();
      if (docCfg.exists) configAntiga = docCfg.data();
    } catch (e) { /* pode não existir */ }

    log("Promovendo sua conta a master...");
    await db.collection("bi_usuarios").doc(BI.usuario.uid).update({
      role: "master", campanhaId: firebase.firestore.FieldValue.delete()
    });
    BI.perfil.role = "master";
    delete BI.perfil.campanhaId;

    log("Criando a primeira campanha com seus dados atuais...");
    const novaRef = db.collection("bi_campanhas").doc();
    await novaRef.set({
      nome: configAntiga.nomeCandidato || "Minha Campanha",
      nomeCandidato: configAntiga.nomeCandidato || "",
      partido: configAntiga.partido || "",
      cargo: configAntiga.cargo || "Deputado Estadual",
      metaTotal: configAntiga.metaTotal || 0,
      ativo: true,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      criadoPor: BI.perfil.username
    });
    const novoId = novaRef.id;

    const colecoes = [
      ["bi_liderancas", "liderancas"], ["bi_materiais", "materiais"], ["bi_remessas", "remessas"],
      ["bi_metas", "metas"], ["bi_eventos", "eventos"], ["bi_chapa_sim", "chapaSim"]
    ];
    for (const [colAntiga, colNova] of colecoes) {
      log(`Copiando ${colAntiga}...`);
      const snap = await db.collection(colAntiga).get();
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const lote = db.batch();
        docs.slice(i, i + 400).forEach(d => lote.set(novaRef.collection(colNova).doc(d.id), d.data()));
        await lote.commit();
      }
      log(`  ${docs.length} documento(s) copiado(s).`);
    }

    log("Ajustando outros usuários já cadastrados...");
    const usuariosSnap = await db.collection("bi_usuarios").get();
    const loteUsr = db.batch();
    let ajustados = 0;
    usuariosSnap.docs.forEach(d => {
      const dados = d.data();
      if (d.id !== BI.usuario.uid && dados.role !== "master" && !("campanhaId" in dados)) {
        loteUsr.update(d.ref, { campanhaId: novoId });
        ajustados++;
      }
    });
    if (ajustados) await loteUsr.commit();
    log(`  ${ajustados} usuário(s) vinculado(s) à nova campanha.`);

    log("Migração concluída! ✅");
    status.innerHTML += `<div class="modal-acoes" style="justify-content:flex-start;margin-top:14px">
      <button class="btn ok" id="btn-ir-campanha">Entrar na campanha agora</button></div>`;
    $("#btn-ir-campanha").onclick = () => {
      $("#tela-migracao").style.display = "none";
      $("#app").style.display = "block";
      $("#nav-campanhas").style.display = "flex";
      escutarListaCampanhas();
      entrarCampanha(novoId);
    };
  } catch (e) {
    log("Erro na migração: " + e.message);
    btn.disabled = false;
  }
}

function atualizarCabecalho() {
  const c = BI.config;
  if (c.nomeCandidato) {
    $("#logo-sub").textContent = (c.nomeCandidato + " • " + (c.partido || "")).toUpperCase();
    $("#dash-sub").textContent = `Campanha de ${c.nomeCandidato}${c.partido ? " (" + c.partido + ")" : ""} para ${c.cargo || "Deputado"} — dados IBGE/TSE`;
    $("#badge-campanha-nome").textContent = c.nomeCandidato;
    $("#topbar-campanha").textContent = c.nomeCandidato;
  } else {
    $("#badge-campanha-nome").textContent = "(sem nome)";
    $("#topbar-campanha").textContent = "(sem nome)";
  }
}

/* ---------- Navegação ---------- */
$$(".nav-item").forEach(b => b.onclick = () => { mostrarPagina(b.dataset.pagina); fecharMenuMobile(); });
function mostrarPagina(nome) {
  BI.paginaAtual = nome;
  $$(".nav-item").forEach(b => b.classList.toggle("ativo", b.dataset.pagina === nome));
  $$(".page").forEach(p => p.classList.toggle("ativa", p.id === "page-" + nome));
  if (PAGES[nome] && PAGES[nome].render) PAGES[nome].render();
}
window.mostrarPagina = mostrarPagina;

function abrirMenuMobile() { $("#sidebar").classList.add("aberta"); $("#sidebar-backdrop").classList.add("aberta"); }
function fecharMenuMobile() { $("#sidebar").classList.remove("aberta"); $("#sidebar-backdrop").classList.remove("aberta"); }
$("#btn-menu-mobile").onclick = abrirMenuMobile;
$("#sidebar-backdrop").onclick = fecharMenuMobile;
$$(".mh-modulo").forEach(b => b.onclick = () => mostrarPagina(b.dataset.pagina));

$("#btn-recolher").onclick = () => $("#app").classList.toggle("recolhida");

/* ---------- Busca global (municípios + lideranças) ---------- */
(() => {
  const input = $("#topbar-busca-input");
  const painel = $("#topbar-busca-resultados");
  if (!input) return;
  function abrirResultados(q) {
    const termo = q.trim().toLowerCase();
    if (termo.length < 2) { painel.classList.remove("aberto"); return; }
    const munis = MUNI.filter(m => m.nome.toLowerCase().includes(termo)).slice(0, 5);
    const lids = BI.liderancas.filter(l => (l.nome || "").toLowerCase().includes(termo)).slice(0, 5);
    let html = "";
    if (munis.length) html += `<div class="busca-grupo-titulo">Municípios</div>` + munis.map(m =>
      `<div class="busca-item" onclick="mostrarPagina('municipios');setTimeout(()=>abrirMunicipio(${m.id}),80);fecharBuscaGlobal()"><b>${esc(m.nome)}</b><span>${esc(m.meso)}</span></div>`).join("");
    if (lids.length) html += `<div class="busca-grupo-titulo">Lideranças</div>` + lids.map(l =>
      `<div class="busca-item" onclick="mostrarPagina('liderancas');setTimeout(()=>editarLideranca('${l.id}'),80);fecharBuscaGlobal()"><b>${esc(l.nome)}</b><span>${esc(MUNI_BY_ID[l.municipioId]?.nome || "")}</span></div>`).join("");
    painel.innerHTML = html || `<div class="busca-vazio">Nenhum resultado para "${esc(q)}"</div>`;
    painel.classList.add("aberto");
  }
  input.addEventListener("input", e => abrirResultados(e.target.value));
  input.addEventListener("focus", e => { if (e.target.value) abrirResultados(e.target.value); });
  document.addEventListener("click", e => { if (!e.target.closest("#topbar-busca-wrap")) painel.classList.remove("aberto"); });
  window.fecharBuscaGlobal = () => { painel.classList.remove("aberto"); input.value = ""; };
})();

/* ---------- Central de notificações ---------- */
(() => {
  const btn = $("#topbar-notif-btn");
  const dot = $("#topbar-notif-dot");
  const painel = $("#topbar-notif-painel");
  if (!btn) return;
  btn.onclick = e => {
    e.stopPropagation();
    const atividades = obterAtividadesRecentes().slice(0, 10);
    painel.innerHTML = `<div class="topbar-notif-titulo">Notificações recentes</div>` +
      (atividades.length ? atividades.map(a => `
        <div class="notif-item"><span class="notif-ico">${ICONES_ATIV[a.tipo]}</span>
          <span class="notif-texto">${a.texto}</span>
          <span class="notif-data">${a.data.toLocaleDateString("pt-BR")}</span></div>`).join("")
        : `<div class="busca-vazio">Nenhuma atividade registrada ainda.</div>`);
    painel.classList.toggle("aberto");
    dot.style.display = "none";
  };
  document.addEventListener("click", e => { if (!e.target.closest(".topbar-notif-wrap")) painel.classList.remove("aberto"); });
  window.atualizarSinoNotificacoes = () => {
    const atividades = obterAtividadesRecentes();
    const recente = atividades[0];
    if (!recente) { dot.style.display = "none"; return; }
    const horas = (Date.now() - recente.data.getTime()) / 36e5;
    dot.style.display = horas < 24 ? "block" : "none";
  };
})();

/* ---------- Tabelas -> cartões no celular ----------
   Em telas estreitas, table.tab vira uma lista de cartões (CSS faz a virada,
   aqui só rotulamos cada <td> com data-label = texto do <th> da coluna,
   pra não precisar mexer em cada função que monta tabela pelo app). */
function rotularTabelasMobile(raiz) {
  (raiz || document).querySelectorAll("table.tab").forEach(tabela => {
    const ths = [...tabela.querySelectorAll("thead th")];
    if (!ths.length) return;
    const rotulos = ths.map(th => th.textContent.replace(/\s*[▲▼]\s*$/, "").trim());
    tabela.querySelectorAll("tbody tr").forEach(tr => {
      [...tr.children].forEach((td, i) => { if (rotulos[i]) td.dataset.label = rotulos[i]; });
    });
  });
}
let _rotularTid = null;
new MutationObserver(() => {
  clearTimeout(_rotularTid);
  _rotularTid = setTimeout(() => rotularTabelasMobile(document), 30);
}).observe(document.body, { childList: true, subtree: true });
rotularTabelasMobile();

function aoMudarDados() {
  if (PAGES[BI.paginaAtual] && PAGES[BI.paginaAtual].render) PAGES[BI.paginaAtual].render();
  if (window.atualizarSinoNotificacoes) window.atualizarSinoNotificacoes();
}
window.aoMudarDados = aoMudarDados;

/* =====================================================================
   DASHBOARD
   ===================================================================== */
const CHARTS = {};
function novoChart(idCanvas, cfg) {
  if (CHARTS[idCanvas]) CHARTS[idCanvas].destroy();
  CHARTS[idCanvas] = new Chart($("#" + idCanvas), cfg);
}
window.novoChart = novoChart;
Chart.defaults.color = "#93a1c0";
Chart.defaults.borderColor = "#2a3552";
Chart.defaults.font.family = "'Segoe UI',system-ui,sans-serif";

const CORES_PARTIDOS = {
  PP: "#2563eb", PSD: "#f59e0b", MDB: "#16a34a", PL: "#1d4ed8", UNIÃO: "#0ea5e9",
  REPUBLICANOS: "#7c3aed", PT: "#dc2626", PSDB: "#3b82f6", PODE: "#eab308",
  PDT: "#ef4444", PSB: "#f97316", AVANTE: "#8b5cf6", CIDADANIA: "#ec4899",
  SOLIDARIEDADE: "#a16207", NOVO: "#ea580c", PV: "#22c55e", "PC do B": "#b91c1c",
  PRD: "#64748b", MOBILIZA: "#94a3b8", AGIR: "#78716c", DC: "#57534e", PMB: "#f472b6"
};
window.CORES_PARTIDOS = CORES_PARTIDOS;
function corPartido(p) { return CORES_PARTIDOS[p] || "#64748b"; }
window.corPartido = corPartido;

function tsParaData(ts) {
  return (ts && typeof ts.toDate === "function") ? ts.toDate() : new Date();
}

const ICONES_ATIV = { lideranca: "🤝", material: "📦" };
function obterAtividadesRecentes() {
  const atividades = [];
  BI.liderancas.forEach(l => atividades.push({
    tipo: "lideranca", data: tsParaData(l.atualizadoEm || l.criadoEm),
    texto: `Liderança <b>${esc(l.nome)}</b> cadastrada em ${esc(MUNI_BY_ID[l.municipioId]?.nome || "?")}`
  }));
  BI.remessas.forEach(r => atividades.push({
    tipo: "material", data: tsParaData(r.criadoEm),
    texto: `Envio de <b>${fmtN(r.qtd)} ${esc(r.materialNome)}</b> para ${esc(MUNI_BY_ID[r.municipioId]?.nome || "?")}`
  }));
  atividades.sort((a, b) => b.data - a.data);
  return atividades;
}
window.obterAtividadesRecentes = obterAtividadesRecentes;

function renderHomeMobile(totalExp, munComLid) {
  $("#mh-nome").textContent = BI.perfil.username;
  $("#mh-papel").textContent = ehAdmin() ? "Administrador" : "Coordenador";
  $("#mh-avatar").textContent = (BI.perfil.username || "?").charAt(0).toUpperCase();
  $("#mh-kpis").innerHTML = `
    <div class="mh-kpi"><div class="v">${fmtN(totalExp)}</div><div class="r">Expectativa de votos</div></div>
    <div class="mh-kpi"><div class="v">${BI.liderancas.length}</div><div class="r">Lideranças</div></div>
    <div class="mh-kpi"><div class="v">${munComLid}</div><div class="r">Municípios cobertos</div></div>`;

  const atividades = obterAtividadesRecentes();

  $("#mh-atividade").innerHTML = atividades.length ? atividades.slice(0, 8).map(a => `
    <div class="mh-atividade-item">
      <span class="mh-atividade-ico">${ICONES_ATIV[a.tipo]}</span>
      <span class="mh-atividade-texto">${a.texto}</span>
      <span class="mh-atividade-data">${a.data.toLocaleDateString("pt-BR")}</span>
    </div>`).join("") : '<div class="vazio">Nenhuma atividade ainda.</div>';
}

let dashSortState = { campo: "expectativa", asc: false };
PAGES.dashboard = {
  render() {
    const exp = expectativaPorMunicipio();
    const lidPorMun = liderancasPorMunicipio();
    const totalExp = Object.values(exp).reduce((a, b) => a + b, 0);
    const popTotal = MUNI.reduce((a, m) => a + (m.pop2024 || 0), 0);
    const eleitTotal = MUNI.reduce((a, m) => a + (m.eleitorado2024 || 0), 0);
    const pibTotal = MUNI.reduce((a, m) => a + (m.pib2021 || 0), 0);
    const munComLid = Object.keys(lidPorMun).length;
    const meta = Number(BI.config.metaTotal) || 0;
    const enviados = BI.remessas.reduce((a, r) => a + (Number(r.qtd) || 0), 0);

    renderHomeMobile(totalExp, munComLid);

    $("#dash-cards").innerHTML = `
      <div class="card-kpi destaque"><div class="rotulo">Expectativa de votos</div><div class="valor">${fmtN(totalExp)}</div>
        <div class="extra">${meta ? Math.round(totalExp / meta * 100) + "% da meta de " + fmtN(meta) : "defina a meta em Configurações"}</div></div>
      <div class="card-kpi"><div class="rotulo">Lideranças</div><div class="valor">${fmtN(BI.liderancas.length)}</div>
        <div class="extra">${BI.liderancas.filter(l => l.status === "confirmada").length} confirmadas</div></div>
      <div class="card-kpi"><div class="rotulo">Municípios com liderança</div><div class="valor">${munComLid} <span style="font-size:13px;color:var(--tx3)">/ 399</span></div>
        <div class="extra">${Math.round(munComLid / 399 * 100)}% de cobertura</div></div>
      <div class="card-kpi"><div class="rotulo">Eleitorado do PR</div><div class="valor">${fmtN(eleitTotal)}</div><div class="extra">TSE 2024</div></div>
      <div class="card-kpi"><div class="rotulo">População do PR</div><div class="valor">${fmtN(popTotal)}</div><div class="extra">IBGE estimativa 2024</div></div>
      <div class="card-kpi"><div class="rotulo">PIB do Paraná</div><div class="valor">${fmtMilR(pibTotal)}</div><div class="extra">IBGE 2021</div></div>
      <div class="card-kpi"><div class="rotulo">Materiais enviados</div><div class="valor">${fmtN(enviados)}</div><div class="extra">${BI.remessas.length} envios</div></div>`;

    // ---- Resumo territorial ----
    const eleitoradoComLid = MUNI.reduce((a, m) => a + (lidPorMun[m.id] ? (m.eleitorado2024 || 0) : 0), 0);
    $("#dash-resumo").innerHTML = `
      <div class="mini-stat-grid">
        <div class="mini-stat"><div class="r">Municípios ativos</div><div class="v">${munComLid}</div></div>
        <div class="mini-stat"><div class="r">Sem liderança</div><div class="v" style="color:var(--warn)">${399 - munComLid}</div></div>
        <div class="mini-stat"><div class="r">Expectativa total</div><div class="v">${fmtN(totalExp)}</div></div>
        <div class="mini-stat"><div class="r">Eleitorado coberto</div><div class="v">${fmtN(eleitoradoComLid)}</div></div>
      </div>`;

    // ---- Alertas (só com dados reais) ----
    const semLid = MUNI.filter(m => !lidPorMun[m.id]).sort((a, b) => (b.eleitorado2024 || 0) - (a.eleitorado2024 || 0));
    const pendentes = BI.liderancas.filter(l => l.status === "em_conversa" || l.status === "indecisa").length;
    const alertas = [];
    if (semLid.length) alertas.push({ cor: "#F59E0B", ico: "⚠️", html: `<b>${semLid.length} município(s)</b> ainda sem liderança cadastrada` });
    if (semLid.length) alertas.push({ cor: "#3B82F6", ico: "🎯", html: `<b>${esc(semLid[0].nome)}</b> é o maior município sem liderança (${fmtN(semLid[0].eleitorado2024)} eleitores)` });
    if (pendentes) alertas.push({ cor: "#8B5CF6", ico: "🤝", html: `<b>${pendentes} liderança(s)</b> aguardando confirmação` });
    $("#dash-alertas").innerHTML = alertas.length ? alertas.map(a => `
      <div class="alerta-item"><span class="aico" style="background:${a.cor}22;color:${a.cor}">${a.ico}</span><span>${a.html}</span></div>
    `).join("") : '<div class="vazio">Nenhum alerta no momento.</div>';

    // ---- Principais municípios (tabela ordenável e pesquisável) ----
    const linhasTop = MUNI.map(m => ({
      id: m.id, nome: m.nome, eleitorado: m.eleitorado2024 || 0, expectativa: exp[m.id] || 0,
      meta: (BI.metas[m.id] && BI.metas[m.id].metaVotos) || 0, lideranca: lidPorMun[m.id] || 0
    }));
    const renderDashTop = (filtro) => {
      let lista = linhasTop.filter(l => !filtro || l.nome.toLowerCase().includes(filtro.toLowerCase()));
      lista.sort((a, b) => {
        const va = a[dashSortState.campo], vb = b[dashSortState.campo];
        const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
        return dashSortState.asc ? c : -c;
      });
      lista = lista.slice(0, 30);
      const th = (rotulo, campo, num) => `<th class="${num ? "num" : ""}" data-campo="${campo}">${rotulo}${dashSortState.campo === campo ? (dashSortState.asc ? " ▲" : " ▼") : ""}</th>`;
      $("#dash-top-tabela").innerHTML = `<table class="tab"><thead><tr>
          ${th("Município", "nome")}${th("Eleitorado", "eleitorado", 1)}${th("Expectativa", "expectativa", 1)}${th("Meta", "meta", 1)}${th("Lideranças", "lideranca", 1)}<th>Status</th>
        </tr></thead><tbody>
        ${lista.map(l => {
          const status = l.lideranca ? (l.meta && l.expectativa >= l.meta ? ["Meta atingida", "verde"] : ["Em progresso", "azul"]) : ["Sem liderança", "amarelo"];
          return `<tr class="clicavel" onclick="abrirMunicipio(${l.id})">
            <td><b>${esc(l.nome)}</b></td>
            <td class="num">${fmtN(l.eleitorado)}</td>
            <td class="num"><b>${fmtN(l.expectativa)}</b></td>
            <td class="num">${l.meta ? fmtN(l.meta) : "—"}</td>
            <td class="num">${l.lideranca}</td>
            <td><span class="tag ${status[1]}">${status[0]}</span></td>
          </tr>`;
        }).join("") || '<tr><td colspan="6" class="vazio">Nenhum município encontrado.</td></tr>'}
        </tbody></table>`;
      $$("#dash-top-tabela th[data-campo]").forEach(el => el.onclick = () => {
        const campo = el.dataset.campo;
        if (dashSortState.campo === campo) dashSortState.asc = !dashSortState.asc;
        else dashSortState = { campo, asc: false };
        renderDashTop($("#dash-top-busca").value);
      });
    };
    renderDashTop("");
    $("#dash-top-busca").oninput = e => renderDashTop(e.target.value);

    // ---- Radar de oportunidades (eleitorado alto + sem liderança) ----
    const oportunidades = semLid.slice(0, 18);
    const oportGrupo = (lista, titulo, classe) => `
      <div class="opor-col ${classe}"><div class="opor-col-titulo">${titulo} (${lista.length})</div>
        ${lista.map(m => `<div class="opor-card" onclick="abrirMunicipio(${m.id})"><div class="nm">${esc(m.nome)}</div>
          <div class="meta"><span>Eleitorado <b>${fmtN(m.eleitorado2024)}</b></span><span>${esc(m.meso.replace(" Paranaense", ""))}</span></div></div>`).join("") || '<div class="vazio" style="padding:12px 0">Nenhum município nesta faixa.</div>'}
      </div>`;
    $("#dash-oportunidades").innerHTML = `<div class="opor-grid">
      ${oportGrupo(oportunidades.slice(0, 6), "Alta oportunidade", "alta")}
      ${oportGrupo(oportunidades.slice(6, 12), "Média oportunidade", "media")}
      ${oportGrupo(oportunidades.slice(12, 18), "Baixa oportunidade", "baixa")}
    </div>`;

    // partidos dos prefeitos 2024
    const cont = {};
    MUNI.forEach(m => { const p = m.prefeitos && m.prefeitos["2024"]; if (p) cont[p.partido] = (cont[p.partido] || 0) + 1; });
    const parts = Object.entries(cont).sort((a, b) => b[1] - a[1]);
    novoChart("chart-partidos", {
      type: "doughnut",
      data: { labels: parts.map(p => p[0]), datasets: [{ data: parts.map(p => p[1]), backgroundColor: parts.map(p => corPartido(p[0])), borderWidth: 0 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } } } }
    });

    // expectativa por mesorregião
    const porMeso = {};
    MESOS.forEach(ms => porMeso[ms] = 0);
    MUNI.forEach(m => porMeso[m.meso] += exp[m.id] || 0);
    const mesoOrd = Object.entries(porMeso).sort((a, b) => b[1] - a[1]);
    novoChart("chart-meso", {
      type: "bar",
      data: { labels: mesoOrd.map(x => x[0].replace(" Paranaense", "")), datasets: [{ data: mesoOrd.map(x => x[1]), backgroundColor: "#10b981", borderRadius: 4 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 10 } }, grid: { display: false } }, y: { grid: { color: "#1e2740" } } } }
    });

    renderMapa();
  }
};

/* ---------- Mapa coroplético ---------- */
let mapa = null, camadaGeo = null, geoJsonPR = null, legendaCtl = null;
async function carregarGeoJson() {
  if (geoJsonPR) return geoJsonPR;
  try {
    const cache = localStorage.getItem("geo_pr_v1");
    if (cache) { geoJsonPR = JSON.parse(cache); return geoJsonPR; }
  } catch (e) {}
  const resp = await fetch("https://servicodados.ibge.gov.br/api/v3/malhas/estados/41?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio");
  geoJsonPR = await resp.json();
  try { localStorage.setItem("geo_pr_v1", JSON.stringify(geoJsonPR)); } catch (e) {}
  return geoJsonPR;
}

const ESCALAS = {
  expectativa: { cores: ["#1e2740", "#1e3a8a", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"], rotulo: "Expectativa de votos" },
  cobertura:   { cores: ["#7f1d1d", "#22c55e"], rotulo: "Com/sem liderança" },
  eleitorado:  { cores: ["#1e2740", "#14532d", "#15803d", "#16a34a", "#22c55e", "#86efac"], rotulo: "Eleitorado 2024" },
  pop:         { cores: ["#1e2740", "#312e81", "#4338ca", "#6366f1", "#818cf8", "#c7d2fe"], rotulo: "População 2024" },
  pib:         { cores: ["#1e2740", "#713f12", "#a16207", "#d97706", "#f59e0b", "#fcd34d"], rotulo: "PIB per capita" }
};

async function renderMapa() {
  const elMapa = $("#mapa");
  if (!elMapa || !$("#page-dashboard").classList.contains("ativa")) return;
  try {
    const geo = await carregarGeoJson();
    if (!mapa) {
      mapa = L.map("mapa", { zoomSnap: 0.25, attributionControl: false }).setView([-24.6, -51.6], 6.75);
      $("#mapa-metrica").onchange = renderMapa;
    }
    if (camadaGeo) camadaGeo.remove();
    if (legendaCtl) legendaCtl.remove();

    const metrica = $("#mapa-metrica").value;
    const exp = expectativaPorMunicipio();
    const lidPorMun = liderancasPorMunicipio();
    const gruposEletivos = {};
    Object.keys(FUNCOES_ELETIVAS).forEach(k => gruposEletivos[k] = liderancasPorMunicipioFiltradas(FUNCOES_ELETIVAS[k]));

    const valorDe = m => {
      if (!m) return 0;
      if (metrica === "expectativa") return exp[m.id] || 0;
      if (metrica === "cobertura") return lidPorMun[m.id] ? 1 : 0;
      if (FUNCOES_ELETIVAS[metrica]) return (gruposEletivos[metrica][m.id] || []).length;
      if (metrica === "eleitorado") return m.eleitorado2024 || 0;
      if (metrica === "pop") return m.pop2024 || 0;
      if (metrica === "pib") return m.pibPerCapita || 0;
      return 0;
    };

    let corDe, legendaHtml;
    if (metrica === "partido") {
      corDe = m => { const p = m && m.prefeitos && m.prefeitos["2024"]; return p ? corPartido(p.partido) : "#374151"; };
      const cont = {};
      MUNI.forEach(m => { const p = m.prefeitos && m.prefeitos["2024"]; if (p) cont[p.partido] = (cont[p.partido] || 0) + 1; });
      legendaHtml = "<b>Partido do prefeito (2024)</b><br>" + Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([p, n]) => `<i style="background:${corPartido(p)}"></i>${esc(p)} (${n})`).join("<br>");
    } else if (metrica === "cobertura") {
      corDe = m => valorDe(m) ? "#22c55e" : "#7f1d1d";
      legendaHtml = `<b>Cobertura</b><br><i style="background:#22c55e"></i>Com liderança<br><i style="background:#7f1d1d"></i>Sem liderança`;
    } else if (FUNCOES_ELETIVAS[metrica]) {
      const ESCALA_LID = ["#1e2740", "#14532d", "#166534", "#16a34a", "#4ade80"];
      corDe = m => ESCALA_LID[Math.min(valorDe(m), 4)];
      const ROTULOS_LID = { lid_prefeitos: "Prefeitos aliados", lid_vices: "Vice-prefeitos aliados", lid_vereadores: "Vereadores aliados", lid_cargo_eletivo: "Lideranças com cargo eletivo" };
      legendaHtml = `<b>${ROTULOS_LID[metrica]}</b><br>` + [4, 3, 2, 1, 0].map(i =>
        `<i style="background:${ESCALA_LID[i]}"></i>${i === 4 ? "4 ou mais" : i === 0 ? "zero" : i}`).join("<br>");
    } else {
      const esc_ = ESCALAS[metrica];
      const vals = MUNI.map(valorDe).filter(v => v > 0).sort((a, b) => a - b);
      const q = p => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] : 0;
      const limites = [q(.2), q(.4), q(.6), q(.8), q(.95)];
      corDe = m => {
        const v = valorDe(m);
        if (!v) return esc_.cores[0];
        for (let i = limites.length - 1; i >= 0; i--) if (v >= limites[i]) return esc_.cores[i + 1];
        return esc_.cores[1];
      };
      legendaHtml = `<b>${esc_.rotulo}</b><br>` + limites.map((l, i) =>
        `<i style="background:${esc_.cores[i + 1]}"></i>≥ ${fmtN(l)}`).reverse().join("<br>") + `<br><i style="background:${esc_.cores[0]}"></i>zero / s.d.`;
    }

    camadaGeo = L.geoJSON(geo, {
      style: f => ({ fillColor: corDe(MUNI_BY_ID[Number(f.properties.codarea)]), weight: 0.6, color: "#0d1220", fillOpacity: 0.9 }),
      onEachFeature: (f, layer) => {
        const m = MUNI_BY_ID[Number(f.properties.codarea)];
        if (!m) return;
        const p24 = m.prefeitos && m.prefeitos["2024"];
        layer.bindTooltip(`<b>${esc(m.nome)}</b><br>Eleitorado: ${fmtN(m.eleitorado2024)}<br>Expectativa: ${fmtN(exp[m.id] || 0)}<br>Prefeito: ${p24 ? esc(p24.nomeUrna) + " (" + esc(p24.partido) + ")" : "—"}<br>Cargo eletivo aliado: ${esc(resumoCargoEletivo(m.id, gruposEletivos.lid_cargo_eletivo))}`, { sticky: true });
        layer.on("click", () => abrirMunicipio(m.id));
        layer.on("mouseover", () => layer.setStyle({ weight: 2, color: "#60a5fa" }));
        layer.on("mouseout", () => camadaGeo.resetStyle(layer));
      }
    }).addTo(mapa);

    legendaCtl = L.control({ position: "bottomright" });
    legendaCtl.onAdd = () => { const d = L.DomUtil.create("div", "mapa-legenda"); d.innerHTML = legendaHtml; return d; };
    legendaCtl.addTo(mapa);
  } catch (e) {
    elMapa.innerHTML = `<div class="vazio">Não foi possível carregar o mapa (verifique a internet).<br>${esc(e.message)}</div>`;
  }
}

/* início */
verificarBootstrap();
