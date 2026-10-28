/* ===================== autenticação ===================== */
const ROLE_KEY = 'percurso_role';
// landing.html manda ?role=gestor|coordenacao para já pular a etapa de escolha de perfil
const ROLE_FROM_LANDING = new URLSearchParams(location.search).get('role');
const GESTOR_ONLY_VIEWS = ['horarios'];
const ROLE_VALID_FROM_LANDING = ROLE_FROM_LANDING === 'gestor' || ROLE_FROM_LANDING === 'coordenacao';
let currentRole = ROLE_VALID_FROM_LANDING ? ROLE_FROM_LANDING : (localStorage.getItem(ROLE_KEY) || null);
if (ROLE_VALID_FROM_LANDING) localStorage.setItem(ROLE_KEY, currentRole);
const ROLE_LABELS = { gestor: 'Gestor', coordenacao: 'Coordenação' };

function applyRolePermissions(role) {
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    const isGestorOnly = GESTOR_ONLY_VIEWS.includes(btn.dataset.view);
    // Gestor enxerga tudo (as abas normais + as exclusivas dele).
    // Coordenação só enxerga as abas que não são exclusivas do Gestor.
    btn.style.display = (role === 'gestor' || !isGestorOnly) ? '' : 'none';
  });
  // "Visão geral" do Financeiro (receita prevista) é só do Gestor; a coordenação abre direto em Pagamentos
  const abaGeral = document.querySelector('#fin-tabs [data-fin-tab="geral"]');
  if (abaGeral) abaGeral.style.display = role === 'gestor' ? '' : 'none';
  finIrParaAba('pag');
  const defaultView = 'overview';
  goto(defaultView);
}

function showLogin() {
  byId("login-screen").style.display = "flex";
  byId("app-shell").style.display = "none";
  const bgDecor = document.querySelector(".bg-decor");
  if (bgDecor) bgDecor.style.display = "";
  // se já tinha um perfil escolhido antes (ex: sessão expirou), pula direto pro login com senha
  if (currentRole) {
    byId('login-role-label').textContent =
      `Entrando como ${ROLE_LABELS[currentRole] || currentRole}. Informe seu e-mail e senha.`;
    showLoginStep('login-form');
  } else {
    showLoginStep('role-step');
  }
}

document.querySelectorAll('.role-btn[data-role]').forEach(btn => {
  btn.addEventListener('click', () => {
    currentRole = btn.dataset.role;
    localStorage.setItem(ROLE_KEY, currentRole);
    byId('login-role-label').textContent =
      `Entrando como ${ROLE_LABELS[currentRole] || currentRole}. Informe seu e-mail e senha.`;
    showLoginStep('login-form');
  });
});
byId('role-back').addEventListener('click', () => {
  currentRole = null;
  localStorage.removeItem(ROLE_KEY);
  showLoginStep('role-step');
});

async function onLoggedIn() {
  byId("login-screen").style.display = "none";
  byId("app-shell").style.display = "grid";
  const bgDecor = document.querySelector(".bg-decor");
  if (bgDecor) bgDecor.style.display = "none";
  const { data: { user } } = await supabase.auth.getUser();
  byId("user-email").textContent = user ? user.email : "";
  if (!currentRole) currentRole = 'coordenacao'; // sessão restaurada sem escolha explícita — acesso completo por segurança
  applyRolePermissions(currentRole);
  await bootstrapData();
}

function renderAll() {
  // marca todas as telas como desatualizadas e desenha só a que está aberta
  Object.keys(VIEW_RENDERERS).forEach(k => dirtyViews.add(k));
  desenharViewSeSuja();
}

window.addEventListener("offline", () => { const el = byId("sync-status"); if (el) el.textContent = "Sem internet — as alterações não serão salvas até reconectar"; });
window.addEventListener("online", () => { const el = byId("sync-status"); if (el) el.textContent = "Conexão restabelecida"; });

async function bootstrapData() {
  const statusEl = byId("sync-status");
  statusEl.textContent = "Carregando dados…";
  try {
    carregarMiniaturas(); // em paralelo com o resto; os avatares só esperam por isto quando forem desenhados
    await Promise.all([loadTurmas(), loadStudents(), loadProfessores()]);
    computeAnosDisponiveis();
    const savedAno = Number(localStorage.getItem(ANO_LETIVO_KEY));
    selectedAnoLetivo = anosDisponiveis.includes(savedAno) ? savedAno : anosDisponiveis[0];
    applyAnoLetivoFilter();
    renderAnoSwitch();
    populateTurmaFilters();
    byId("f-data-matricula").value = new Date().toISOString().slice(0, 10);
    renderAll();
    // presenças (~15 mil linhas) e horários só são usados nas suas abas: carregam depois da primeira tela
    Promise.all([loadPresencas(), loadHorarioSemanal(), loadRegistrosAula(), loadHorarioExecucao()])
      .then(() => { dirtyViews.add("presencas"); dirtyViews.add("horarios"); desenharViewSeSuja(); statusEl.textContent = "Dados sincronizados agora"; })
      .catch(err => { console.error("Erro ao carregar presenças/horários:", err); statusEl.textContent = "Erro ao carregar presenças/horários — recarregue a página"; });
    loadPagamentos().catch(err => console.error("Erro ao carregar pagamentos:", err));
    initSimulados().catch(err => console.error("Erro ao carregar simulados:", err));
    initBolsao().catch(err => console.error("Erro ao carregar o Bolsão:", err));
    statusEl.textContent = "Carregando presenças e horários…";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Erro ao carregar dados — recarregue a página";
  }
}

byId("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = byId("login-email").value.trim();
  const password = byId("login-password").value;
  const errEl = byId("login-error");
  const card = document.querySelector("#login-screen .login-card");
  errEl.textContent = "";
  const btn = byId("login-btn");
  btn.disabled = true; btn.textContent = "Entrando...";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = "Entrar";
  if (error) {
    console.error("Erro de login:", error);
    errEl.textContent = `${error.message || "Erro ao entrar."} (${error.status || error.code || "sem código"})`;
    if (card) {
      card.classList.remove("shake");
      void card.offsetWidth;
      card.classList.add("shake");
    }
    return;
  }
  await onLoggedIn();
});

byId("logout-btn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  currentRole = null;
  localStorage.removeItem(ROLE_KEY);
  try { await supabase.removeAllChannels(); } catch (e) { /* ignora */ }
  location.reload(); // limpa também os dados dos alunos que estavam na memória
});

/* ===================== esqueci minha senha (código por e-mail) ===================== */
function showLoginStep(stepId) {
  ["role-step", "login-form", "forgot-email-form", "forgot-code-form"].forEach(id => {
    byId(id).hidden = (id !== stepId);
  });
}
byId("forgot-link").addEventListener("click", () => showLoginStep("forgot-email-form"));
byId("forgot-email-back").addEventListener("click", () => showLoginStep("login-form"));
byId("forgot-code-back").addEventListener("click", () => showLoginStep("login-form"));

byId("forgot-email-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = byId("forgot-email").value.trim();
  const errEl = byId("forgot-email-error");
  errEl.textContent = "";
  const btn = byId("forgot-email-btn");
  btn.disabled = true; btn.textContent = "Enviando...";
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  btn.disabled = false; btn.textContent = "Enviar código";
  if (error) {
    errEl.textContent = error.message || "Erro ao enviar o código.";
    return;
  }
  byId("forgot-email-display").textContent = email;
  byId("forgot-code-form").dataset.email = email;
  byId("forgot-code").value = "";
  byId("forgot-new-pw").value = "";
  byId("forgot-confirm-pw").value = "";
  byId("forgot-code-error").textContent = "";
  showLoginStep("forgot-code-form");
});

byId("forgot-code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = byId("forgot-code-form").dataset.email;
  const code = byId("forgot-code").value.trim();
  const p1 = byId("forgot-new-pw").value;
  const p2 = byId("forgot-confirm-pw").value;
  const errEl = byId("forgot-code-error");
  errEl.textContent = "";
  if (p1.length < 8) { errEl.textContent = "A senha precisa ter pelo menos 8 caracteres."; return; }
  if (p1 !== p2) { errEl.textContent = "As senhas não coincidem."; return; }

  const btn = byId("forgot-code-btn");
  btn.disabled = true; btn.textContent = "Confirmando...";

  const { error: otpErr } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (otpErr) {
    btn.disabled = false; btn.textContent = "Confirmar e trocar senha";
    errEl.textContent = otpErr.message || "Código inválido ou expirado.";
    return;
  }
  const { error: updErr } = await supabase.auth.updateUser({ password: p1 });
  btn.disabled = false; btn.textContent = "Confirmar e trocar senha";
  if (updErr) {
    errEl.textContent = updErr.message || "Erro ao definir a nova senha.";
    return;
  }
  showLoginStep("login-form");
  await onLoggedIn();
});

/* ===================== tema claro/escuro ===================== */
const THEME_KEY = "percurso_admin_theme";
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "light") root.setAttribute("data-theme", "light");
  else if (mode === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  document.querySelectorAll(".theme-btn").forEach(b => b.classList.toggle("active", b.dataset.themeOpt === mode));
  try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
}
function currentEffectiveTheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr) return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
document.querySelectorAll(".theme-btn").forEach(b => b.addEventListener("click", () => applyTheme(b.dataset.themeOpt)));
byId("login-theme-toggle").addEventListener("click", () => {
  applyTheme(currentEffectiveTheme() === "dark" ? "light" : "dark");
});
(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (saved) applyTheme(saved);
})();

/* ===================== aviso de nova versão do painel ===================== */
/* Quem deixa o painel aberto não recebe sozinho uma versão publicada depois. A cada 3 minutos (e ao voltar para a aba)
   o painel confere se o arquivo no servidor mudou e mostra um aviso para atualizar, sem recarregar sozinho
   para não apagar o que a pessoa estiver digitando. */
(function(){
  let base = null, avisou = false;
  async function versao(){
    try { const r = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' }); return r.ok ? r.headers.get('etag') : null; }
    catch(e){ return null; }
  }
  function mostrar(){
    const d = document.createElement('div');
    d.id = 'nova-versao'; d.setAttribute('role', 'status');
    d.innerHTML = '<span>Há uma nova versão do painel disponível.</span><button type="button" class="btn btn-primary">Atualizar agora</button>';
    d.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(d);
  }
  async function checar(){
    if (avisou || document.visibilityState !== 'visible') return;
    const e = await versao(); if (!e) return;
    if (base === null){ base = e; return; }
    if (e !== base){ avisou = true; mostrar(); }
  }
  checar();
  setInterval(checar, 180000);
  document.addEventListener('visibilitychange', checar);
})();

/* ===================== init ===================== */
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) { await onLoggedIn(); } else { showLogin(); }
})();
