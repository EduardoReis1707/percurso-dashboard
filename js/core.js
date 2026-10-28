const byId = id => document.getElementById(id);

/* ===================== conexão Supabase ===================== */
const SUPABASE_URL = "https://fpsbujscwbrbsipbazmq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwc2J1anNjd2JyYnNpcGJhem1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNzk4NDUsImV4cCI6MjEwMzg1NTg0NX0.5ISlQPJ2PG8G4612aBqjA_S7inr57kT2e0TqpPw4H_I";
async function fetchComRetry(url, opts) {
  const metodo = ((opts && opts.method) || "GET").toUpperCase();
  const leitura = metodo === "GET" || metodo === "HEAD";
  for (let tentativa = 0; ; tentativa++) {
    try {
      const r = await fetch(url, opts);
      if (leitura && (r.status === 429 || r.status >= 500) && tentativa < 2) { await new Promise(ok => setTimeout(ok, 500 * (tentativa + 1))); continue; }
      return r;
    } catch (e) {
      if (!leitura || tentativa >= 2) throw e;
      await new Promise(ok => setTimeout(ok, 500 * (tentativa + 1)));
    }
  }
}
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: fetchComRetry } });

let students = [];
let turmasList = [];
let allTurmasRaw = [];
let allStudentsRaw = [];
let anosDisponiveis = [];
let selectedAnoLetivo = null;
const ANO_LETIVO_KEY = 'percurso_ano_letivo';
let presencas = [];
let presencaSummaryByAluno = new Map();
let professoresList = [];
let horarioSemanal = [];
let registrosAula = [];
let horarioExecucao = [];
let horTurmaAtual = null; // uuid de turmas.id
let horSemanaAtual = null;
let fichaProfessorAtual = null;
let kanTurmaAtual = null; // uuid de turmas.id
let kanSemanaAtual = null;
const HOR_DIA_ORDER = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
let editingStudentId = null;
let currentDrawerId = null;
const TURMA_ORDER = ["Pré-CEFET 1", "Pré-CEFET 2", "8º ano", "Pré-ENEM"];
const avatarColors = ["#00a651", "#3568b0", "#b9770e", "#7a4fc4", "#c23a2f", "#0f9b8e"];

/* Mapa: nome normalizado da pasta do aluno -> nome completo real no cadastro.
   Resolvido a partir das pastas "Pré-Cefet 2026" e "Pré-Enem 2026" enviadas por Eduardo,
   incluindo os casos ambíguos confirmados manualmente (Ana Luiza, Isadora). */
const FOLDER_TO_ALUNO = {"adriano miguel soares freitas": "Adriano Miguel Soares Freitas", "ana clara silva santos": "Ana Clara Silva Santos", "antonella vieira bebiano": "Antonella Vieira Bebiano", "antonio garcia de mattos neto": "Antonio Garcia de Mattos Neto", "arthur aguiar nogueira": "Arthur Aguiar Nogueira", "arthur bedendo do carmo lima de souza": "Arthur Bedendo Do Carmo Lima de Souza", "arthur vieira de almeida": "Arthur Vieira de Almeida", "beatriz bianque de melo": "Beatriz Bianque de Melo", "beatriz cruzato ferreira correa": "Beatriz Cruzato Ferreira Correa", "benicio ravaglia fernandes netto": "Benício Raváglia Fernandes Netto", "bernardo alves pereira": "Bernardo Alves Pereira", "bernardo souza ribeiro ciconeli": "Bernardo Souza Ribeiro Ciconeli", "camila santos oliveira": "Camila Santos Oliveira", "daniel rodrigues morais": "Daniel Rodrigues Morais", "davi lucca rodrigues henriques": "Davi Lucca Rodrigues Henriques", "davi luciano pimenta": "Davi Luciano Pimenta", "davi ramos gouvea modesto de andrade": "Davi Ramos Gouvea Modesto de Andrade", "davy tavares cabral": "Davy Tavares Cabral", "emanuel carlos liberato tomaz": "Emanuel Carlos Liberato Tomaz", "emanuelle alves nascimento": "Emanuelle Alves Nascimento", "emily marquezine barbosa": "Emily Marquezine Barbosa", "enzo mendes de souza lima": "Enzo Mendes de Souza Lima", "felipe campos benini": "Felipe Campos Benini", "flavio de oliveira soares": "Flávio de Oliveira Soares", "gabriel carvalho theodoro": "Gabriel Carvalho Theodoro", "gabriel de oliveira leitao": "Gabriel de Oliveira Leitão", "gabriel marquez de souza bitencourt": "Gabriel Marquez de Souza Bitencourt", "gabriel vecchi oliveira": "Gabriel Vecchi Oliveira", "gabriela brum oliveira barros": "Gabriela Brum Oliveira Barros", "giovanna urgal tavares ribeiro": "Giovanna Urgal Tavares Ribeiro", "heitor gabriel rodrigues marcal": "Heitor Gabriel Rodrigues Marçal", "heitor xavier ramos boalento": "Heitor Xavier Ramos Boalento", "hellen amorim ravalia": "Hellen Amorim Ravalia", "heloisa mendes rafael": "Heloísa Mendes Rafael", "inacio medeiros pinheiro": "Inácio Medeiros Pinheiro", "isabela carvalho espindola": "Isabela Carvalho Espindola", "isabela da silva fernandes": "Isabela Da Silva Fernandes", "isabela de barros claro": "Isabela de Barros Claro", "isabela vianna de melo": "Isabela Vianna De Melo", "isabelly da silva diogo": "Isabelly da silva diogo", "isadora carvalho torres": "Isadora Carvalho Torres", "isadora oliveira goncalves de paiva": "Isadora Oliveira Gonçalves de Paiva", "joao emanuel batista teixeira": "João Emanuel Batista Teixeira", "joao inacio lacerda de sousa simoes": "João Ignácio Lacerda de Sousa Simões", "joao paulo godinho de sousa": "João Paulo Godinho de Sousa", "julia de souza xavier": "Júlia de Souza Xavier", "kaio de melo machado": "Kaio de Melo Machado", "kaua almeida hebriques tostes": "Kaua Almeida Hebriques Tostes", "kaua felippe ferreira tomaz": "Kaua Felippe Ferreira Tomaz", "larissa ferreira ramos de oliveira": "Larissa Ferreira Ramos de Oliveira", "laura freitas lanziere": "Laura Freitas Lanziere", "laura silveira stephan": "Laura Silveira Stephan", "leticia de carvalho sales niimi": "Letícia de Carvalho Sales Niimi", "livia lopes aguiar": "Livia Lopes Aguiar", "lorena oliveira souza": "Lorena Oliveira Souza", "lucca almeida alencar": "Lucca Almeida Alencar", "luis fellipe freitas de oliveira": "Luis Fellipe Freitas de Oliveira", "luisa oliveira silva vaz": "Luisa Oliveira Silva Vaz", "luisa ribeiro bella romanhol": "Luisa Ribeiro Bella Romanhol", "luiza riguete ananias": "Luiza Riguete Ananias", "luiza urgal tavares ribeiro": "Luíza Urgal Tavares Ribeiro", "manuella helena de morais pinheiro": "Manuella Helena de Morais Pinheiro", "marcela rodrigues fernandes": "Marcela Rodrigues Fernandes", "maria eduarda ferreira titoneli": "Maria Eduarda Ferreira Titoneli", "maria luiza de almeida falcao": "Maria Luiza de Almeida Falcão", "maria paula vieira de souza almeida": "Maria Paula Vieira de Souza Almeida", "mariana da silva cirino": "Mariana da Silva Cirino", "mateus vieira moraes": "Mateus Vieira Moraes", "miguel carli da mato mendes": "Miguel Carli da Mato Mendes", "miguel da silva ferreira leite": "Miguel Da Silva Ferreira Leite", "miguel do nascimento rodrigues dutra": "Miguel do Nascimento Rodrigues Dutra", "murilo gomes barbosa": "Murilo Gomes Barbosa", "murilo henrique degliesporte antonio": "Murilo Henrique Degliesporte Antonio", "nicolas gonzaga pimentel": "Nicolas Gonzaga Pimentel", "pablo ferraz mendes": "Pablo Ferraz Mendes", "pedro augusto benini soares": "Pedro Augusto Benini Soares", "pedro guilherme saldanha spindola": "Pedro Guilherme Saldanha Spindola", "pedro lima cruz": "Pedro Lima Cruz", "pedro lucas da silva e souza": "Pedro Lucas da Silva e Souza", "pedro martins de oliveira sousa": "Pedro Martins De Oliveira Sousa", "pedro patricio martins de souza": "Pedro Patrício Martins de Souza", "rai tavares ferreira": "Raí Tavares Ferreira", "ryan do carmo augusto": "Ryan do Carmo Augusto", "ryan marquezine barbosa": "Ryan Marquezine Barbosa", "sofia vieira de souza": "Sofia Vieira de Souza", "stella machado chagas": "Stella Machado Chagas", "victor hugo martins vieira": "Victor Hugo Martins Vieira", "vinicius da silva teofilo": "Vinícius da Silva Teófilo", "vitoria ferreira souza silva": "Vitória Ferreira Souza Silva", "yuri harvey vieira da silva": "Yuri Harvey Vieira da Silva", "alberto": "Alberto Alves Lacerda", "ana luiza": "Ana Luiza Diogo Gomes", "artur silva": "Artur Silva Garcia", "beatriz": "Beatriz Alves de Oliveira Silva", "bernardo alecrin": "Bernardo da Costa Alecrim", "bernardo magalhaes": "Bernardo de Sousa Magalhães Landis", "carla vargas": "Carla Vargas Angelo", "emanuel": "Emanoel Nunes Gonçalves", "emily cravinho": "Emily de Oliveira Cravinho", "gabriel": "Gabriel Soares da Silva", "gabriela": "Gabriela da Silva Carvalho", "isabeli gomes teza": "Isabeli Gomes Teza", "isadora": "Isadora Fernandes Freitas", "jessica": "Jéssica de Almeida Mariquito", "joao pedro": "João Pedro Pinto da Silva", "joshua": "Joshua Junio Costa Ribeiro", "juliana": "Juliana Silva Oliveira Mello", "lara zorzan": "Lara Zorzan de Oliveira", "livia": "Livia Braga Xavier", "lucas assis": "Lucas Assis Justino Dos Santos", "lucas bretas": "Lucas Coutinho Bretas", "luiza da silva": "Luiza da Silva Pinto", "manuela almeida": "Manuela Almeida Alvarenga", "manuela oliveira": "Manuela Oliveira Novais", "maria clara miranda": "Maria Clara da Silva Miranda", "maria machado": "Maria Machado De Oliveira", "matheus": "Matheus Aparecido Vianna da Silva", "mirela": "Mirela Sad Gomes Rosario", "noemi": "Noemi Coelho Eleuterio", "otavia": "Otavia Marianne Muller Martins Santos", "pedro henrique": "Pedro Henrique Carvalho da Silva Barbosa", "pedro spindola": "Pedro Spíndola", "sahra": "Sahra Basílio Teixeira", "samara": "Samara Masalla Miranda", "talita": "Talita de Souza Prado", "vitor": "Vitor Carvalho Rocha", "rafael procaci de paula": "Rafael Procaci de Paula", "yasmim aparecida andrade de souza": "Yasmim Aparecida Andrade de Souza"};

/* normName é chamada milhares de vezes (listas de alunos, simulados, fotos). O resultado só depende
   do texto, então guardamos em memória para não repetir normalize() + regex a cada chamada. */
const _normNameCache = new Map();
function normName(s) {
  if (!s) return "";
  let r = _normNameCache.get(s);
  if (r === undefined) {
    r = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
    if (_normNameCache.size > 5000) _normNameCache.clear();
    _normNameCache.set(s, r);
  }
  return r;
}

function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ===================== desempenho: utilitários ===================== */
/* Espera o usuário parar de digitar antes de redesenhar uma lista inteira. */
function debounce(fn, ms) {
  let t = null;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms == null ? 180 : ms); };
}

/* O Supabase devolve no máximo 1.000 linhas por consulta (o limite do projeto). Para nenhuma
   tabela grande (ex.: presenças, com mais de 15 mil linhas) ser cortada, esta função busca a
   primeira página e, se ela vier cheia, traz as seguintes em lotes de 4 páginas em paralelo, até
   vir uma página incompleta. `montar()` devolve uma consulta nova a cada chamada, já com
   select e order (a ordem precisa ser estável, com desempate por uma coluna única). */
async function buscarTodasLinhas(montar, tamanho) {
  const T = tamanho || 1000;
  const primeira = await montar().range(0, T - 1);
  if (primeira.error) throw primeira.error;
  const linhas = primeira.data || [];
  if (linhas.length < T) return linhas; // cabia numa página só
  let fim = false, inicio = T;
  while (!fim) {
    const lote = [0, 1, 2, 3].map(i => montar().range(inicio + i * T, inicio + (i + 1) * T - 1));
    const respostas = await Promise.all(lote);
    for (const r of respostas) {
      if (r.error) throw r.error;
      const d = r.data || [];
      linhas.push(...d);
      if (d.length < T) { fim = true; break; }
    }
    inicio += 4 * T;
  }
  return linhas;
}

/* ===================== Fotos dos alunos: miniaturas + carregamento sob demanda ===================== */
/* As fotos originais têm em média 645 KB, mas aparecem em avatares de 28 a 56 px. Por isso:
   1) cada foto ganha uma miniatura quadrada de ~160 px (cerca de 10 KB) em thumbs/<id>.jpg;
   2) avatares usam a miniatura quando ela existe e só a foto original quando não existe;
   3) o endereço (URL assinada) de cada foto é pedido em lote e guardado em memória;
   4) a foto só é buscada quando o avatar aparece na tela (IntersectionObserver). */
const FOTO_BUCKET = "fotos-alunos";
const FOTO_TTL_MS = 50 * 60 * 1000;
const fotoUrlCache = new Map();      // caminho -> { url, exp }
let fotoThumbIds = new Set();        // ids de alunos que já têm miniatura
let fotoThumbsReady = Promise.resolve();
const fotoPendentes = new Map();     // elemento -> true (aguardando o endereço da foto)
let fotoFlushTimer = null, fotoObserver = null, fotoScanAgendado = false;

function fotoThumbPath(alunoId) { return `thumbs/${alunoId}.jpg`; }
function fotoPathParaAvatar(alunoId, origPath) { return fotoThumbIds.has(alunoId) ? fotoThumbPath(alunoId) : origPath; }

/* Descobre quais alunos já têm miniatura (uma única listagem, sem baixar nada). */
function carregarMiniaturas() {
  fotoThumbsReady = (async () => {
    try {
      const ids = new Set();
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.storage.from(FOTO_BUCKET).list("thumbs", { limit: 1000, offset });
        if (error || !data) break;
        data.forEach(f => { const m = /^(.+)\.jpg$/.exec(f.name || ""); if (m) ids.add(m[1]); });
        if (data.length < 1000) break;
      }
      fotoThumbIds = ids;
    } catch (e) { console.warn("Não foi possível listar as miniaturas:", e); }
    if (typeof atualizarCaixaMiniaturas === "function") atualizarCaixaMiniaturas();
  })();
  return fotoThumbsReady;
}

/* Pede o endereço de várias fotos de uma vez (até 100 por chamada) e guarda em memória. */
async function resolverUrlsFotos(paths) {
  const agora = Date.now();
  const faltam = [...new Set(paths.filter(Boolean))].filter(p => { const c = fotoUrlCache.get(p); return !c || c.exp < agora; });
  for (let i = 0; i < faltam.length; i += 100) {
    const lote = faltam.slice(i, i + 100);
    let porCaminho = new Map();
    try {
      const { data, error } = await supabase.storage.from(FOTO_BUCKET).createSignedUrls(lote, 3600);
      if (!error && data) data.forEach(d => { if (d && d.path && d.signedUrl) porCaminho.set(d.path, d.signedUrl); });
    } catch (e) { console.warn("Falha ao obter endereços das fotos:", e); }
    lote.forEach(p => {
      const url = porCaminho.get(p) || null;
      fotoUrlCache.set(p, { url, exp: agora + (url ? FOTO_TTL_MS : 30000) });
    });
  }
}
function getFotoSignedUrlCached(path) {
  return resolverUrlsFotos([path]).then(() => { const c = fotoUrlCache.get(path); return c ? c.url : null; });
}

function aplicarFotoAoElemento(el, url) {
  el.style.backgroundImage = `url("${url}")`;
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = "center";
  el.textContent = "";
}

function agendarFlushFotos() {
  if (fotoFlushTimer) return;
  fotoFlushTimer = setTimeout(async () => {
    fotoFlushTimer = null;
    await fotoThumbsReady;
    const itens = [...fotoPendentes.keys()].filter(el => el.isConnected)
      .map(el => ({ el, path: fotoPathParaAvatar(el.dataset.fotoAluno, el.dataset.fotoOrig) }));
    fotoPendentes.clear();
    if (!itens.length) return;
    await resolverUrlsFotos(itens.map(i => i.path));
    itens.forEach(({ el, path }) => {
      const c = fotoUrlCache.get(path);
      if (c && c.url && el.isConnected) aplicarFotoAoElemento(el, c.url);
    });
  }, 40);
}

function observarAvatares() {
  const els = document.querySelectorAll("[data-foto-orig]:not([data-foto-obs])");
  if (!els.length) return;
  if (!("IntersectionObserver" in window)) {
    els.forEach(el => { el.dataset.fotoObs = "1"; fotoPendentes.set(el, true); });
    agendarFlushFotos();
    return;
  }
  if (!fotoObserver) {
    fotoObserver = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { fotoObserver.unobserve(en.target); fotoPendentes.set(en.target, true); } });
      if (fotoPendentes.size) agendarFlushFotos();
    }, { rootMargin: "200px" });
  }
  els.forEach(el => { el.dataset.fotoObs = "1"; fotoObserver.observe(el); });
}
/* Quem cria um avatar chama isto; a varredura roda uma vez por quadro, mesmo com centenas de avatares. */
function agendarScanFotos() {
  if (fotoScanAgendado) return;
  fotoScanAgendado = true;
  requestAnimationFrame(() => { fotoScanAgendado = false; observarAvatares(); });
}

/* Recorta o centro da foto em um quadrado e reduz para ~160 px (JPEG, ~10 KB). */
async function gerarMiniatura(origem, lado) {
  lado = lado || 160;
  const bmp = await createImageBitmap(origem);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = lado;
  c.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, lado, lado);
  if (bmp.close) bmp.close();
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("não foi possível gerar a miniatura")), "image/jpeg", 0.8));
}
async function enviarMiniatura(alunoId, origem) {
  const blob = await gerarMiniatura(origem);
  const { error } = await supabase.storage.from(FOTO_BUCKET).upload(fotoThumbPath(alunoId), blob, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  fotoThumbIds.add(alunoId);
  fotoUrlCache.delete(fotoThumbPath(alunoId));
}

/* Gera, uma única vez, as miniaturas das fotos que já estavam no sistema (3 por vez). */
let miniaturasRodando = false;
async function gerarMiniaturasFaltantes() {
  if (miniaturasRodando) return;
  miniaturasRodando = true;
  const btn = byId("fotos-thumbs-btn");
  const msg = byId("fotos-thumbs-msg");
  if (btn) btn.disabled = true;
  try {
    await fotoThumbsReady;
    const fila = allStudentsRaw.filter(s => s.fotoUrl && !fotoThumbIds.has(s.id));
    let feitas = 0, falhas = 0;
    const total = fila.length;
    const trabalhar = async () => {
      while (fila.length) {
        const s = fila.shift();
        try {
          const { data, error } = await supabase.storage.from(FOTO_BUCKET).download(s.fotoUrl);
          if (error || !data) throw error || new Error("sem arquivo");
          await enviarMiniatura(s.id, data);
          feitas++;
        } catch (e) { falhas++; console.warn("Miniatura não gerada para", s.nome, e); }
        if (msg) msg.textContent = `Gerando miniaturas… ${feitas + falhas} de ${total}`;
      }
    };
    await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
    if (msg) msg.textContent = falhas ? `Pronto: ${feitas} miniaturas geradas, ${falhas} com erro (veja o console).` : `Pronto: ${feitas} miniaturas geradas. O painel já está usando as fotos leves.`;
  } finally {
    miniaturasRodando = false;
    if (btn) btn.disabled = false;
    atualizarCaixaMiniaturas();
  }
}
function atualizarCaixaMiniaturas() {
  const box = byId("fotos-thumbs-box");
  if (!box || typeof allStudentsRaw === "undefined") return;
  const comFoto = allStudentsRaw.filter(s => s.fotoUrl);
  const prontas = comFoto.filter(s => fotoThumbIds.has(s.id)).length;
  const falta = comFoto.length - prontas;
  box.style.display = comFoto.length === 0 ? "none" : "flex";
  const msg = byId("fotos-thumbs-msg");
  const btn = byId("fotos-thumbs-btn");
  if (btn) btn.style.display = falta === 0 ? "none" : "";
  if (msg && !miniaturasRodando) msg.textContent = falta === 0
    ? `Miniaturas: todas as ${comFoto.length} fotos já têm versão leve.`
    : `${falta} de ${comFoto.length} fotos ainda não têm versão leve. Gerar uma vez acelera Presenças, Fotos e Simulados.`;
}
/* ===================== validação de CPF ===================== */
function validarCPF(cpf) {
  const digits = (cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // 000.000.000-00, 111.111.111-11 etc.
  const calcDigit = (base) => {
    let sum = 0;
    let weight = base.length + 1;
    for (let i = 0; i < base.length; i++) { sum += Number(base[i]) * weight; weight--; }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calcDigit(digits.slice(0, 9));
  const d2 = calcDigit(digits.slice(0, 9) + String(d1));
  return digits[9] === String(d1) && digits[10] === String(d2);
}
function maskCPF(value) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
  if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
  if (d.length > 3) return d.replace(/(\d{3})(\d{1,3})/, "$1.$2");
  return d;
}
function wireCpfField(inputId, hintId) {
  const input = byId(inputId);
  const hint = byId(hintId);
  input.addEventListener("input", () => {
    const pos = input.selectionStart;
    const before = input.value.length;
    input.value = maskCPF(input.value);
    const after = input.value.length;
    if (pos != null) input.setSelectionRange(pos + (after - before), pos + (after - before));
    const digits = input.value.replace(/\D/g, "");
    input.classList.remove("cpf-valid", "cpf-invalid");
    hint.classList.remove("valid", "invalid");
    if (!digits) { hint.textContent = ""; return; }
    if (digits.length < 11) { hint.textContent = ""; return; }
    if (validarCPF(input.value)) {
      input.classList.add("cpf-valid"); hint.classList.add("valid"); hint.textContent = "CPF válido";
    } else {
      input.classList.add("cpf-invalid"); hint.classList.add("invalid"); hint.textContent = "CPF inválido — confira os números";
    }
  });
}

/* ===================== aluno não pode ser seu próprio responsável (menor de idade) ===================== */
function calcAge(dateStr) {
  if (!dateStr) return null;
  const birth = new Date(dateStr + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
function samePersonAlunoResp() {
  const alunoCpf = byId("f-aluno-cpf").value.replace(/\D/g, "");
  const respCpf = byId("f-resp-cpf").value.replace(/\D/g, "");
  if (alunoCpf.length === 11 && respCpf.length === 11) return alunoCpf === respCpf;
  const alunoNome = byId("f-aluno-nome").value.trim().toLowerCase();
  const respNome = byId("f-resp-nome").value.trim().toLowerCase();
  if (alunoNome && respNome) return alunoNome === respNome;
  return false;
}
function checkSelfResponsavelWarning() {
  const warn = byId("self-resp-warning");
  const idade = calcAge(byId("f-aluno-nascimento").value);
  const blocked = samePersonAlunoResp() && (idade === null || idade < 18);
  warn.hidden = !blocked;
  return blocked;
}

function initials(name) {
  const parts = name.trim().split(" ");
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}
function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return avatarColors[Math.abs(h) % avatarColors.length];
}
function situacao(s) {
  if (s.status === "desistente") return { cls: "late", label: "Desistente" };
  if (s.tipo === "bolsa 100%") return { cls: "scholarship", label: "Bolsa 100%" };
  return { cls: "ok", label: "Ativo" };
}
/* "4.180,00" / "418" / "418,50" -> número (ou null se vazio/inválido) */
function parseMoneyBR(raw) {
  const s = String(raw == null ? "" : raw).replace(/[^\d,.]/g, "").trim();   // aceita "R$ 4.180,00"
  if (!s) return null;
  const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return isNaN(n) ? null : n;
}
/* número -> "R$ 1.234,56" (campos de dinheiro do formulário) */
function formatMoneyBR(n) {
  if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "";
  return "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/* máscara de digitação: 41800 -> "R$ 418,00" (os dígitos entram pelos centavos, como em maquininha) */
function maskMoneyInput(e) {
  const el = e.target;
  const digits = el.value.replace(/\D/g, "").replace(/^0+/, "");
  el.value = digits ? formatMoneyBR(Number(digits) / 100) : "";
}
function fmtBRL(v) {
  if (v === null || v === undefined || v === "") return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ===================== carregar dados reais ===================== */
async function loadTurmas() {
  const { data, error } = await supabase.from("turmas").select("id, nome, tipo, ano_letivo").order("nome");
  if (error) throw error;
  allTurmasRaw = data;
}

function computeAnosDisponiveis() {
  anosDisponiveis = [...new Set(allTurmasRaw.map(t => t.ano_letivo))].sort((a, b) => b - a);
  if (!anosDisponiveis.length) anosDisponiveis = [new Date().getFullYear()];
}

/* Recalcula turmasList/students a partir do ano letivo selecionado.
   Alunos sem turma só aparecem no ano do seu registro financeiro / data de matrícula. */
function applyAnoLetivoFilter() {
  turmasList = allTurmasRaw
    .filter(t => t.ano_letivo === selectedAnoLetivo)
    .sort((a, b) => TURMA_ORDER.indexOf(a.nome) - TURMA_ORDER.indexOf(b.nome));
  const turmaIds = new Set(turmasList.map(t => t.id));
  students = allStudentsRaw.filter(s => {
    if (s.turmaId) return turmaIds.has(s.turmaId);
    // sem turma: pertence ao ano do registro financeiro (ou da data de matrícula); sem nenhum ano, aparece em todos
    const ano = s.anoLetivo != null ? s.anoLetivo : (s.matricula ? Number(String(s.matricula).slice(0, 4)) : null);
    return ano == null || ano === selectedAnoLetivo;
  });
}

function renderAnoSwitch() {
  const sel = byId("ano-letivo-select");
  if (!sel) return;
  sel.innerHTML = anosDisponiveis.map(a => `<option value="${a}">Turmas ${a}</option>`).join("");
  sel.value = String(selectedAnoLetivo);
  const turmaLabel = byId("f-turma-label");
  if (turmaLabel) turmaLabel.textContent = `Turma em ${selectedAnoLetivo}`;
  document.querySelectorAll(".ano-sel").forEach(el => { el.textContent = selectedAnoLetivo; });
  const subtitle = byId("form-subtitle");
  if (subtitle) subtitle.textContent = `Mesmos campos do Requerimento de Matrícula em papel — turma de ${selectedAnoLetivo}`;
}

async function loadStudents() {
  const { data, error } = await supabase
    .from("alunos")
    .select(`
      id, nome_completo, data_nascimento, local_nascimento, endereco, numero, complemento,
      bairro, cidade, uf, cep, telefone, whatsapp, email, rg, rg_orgao_expedidor, rg_data_expedicao, cpf,
      foto_url, data_matricula, status, observacoes, responsavel_id,
      turma:turmas ( id, nome ),
      responsavel:responsaveis ( id, nome_completo, data_nascimento, profissao, telefone, email, rg, rg_orgao_expedidor, rg_data_expedicao, cpf ),
      financeiro:matricula_financeiro ( id, ano_letivo, tipo, valor_matricula, forma_pagamento_matricula, data_pagamento_matricula, valor_total_curso, qtd_parcelas, valor_parcela, dia_vencimento, matricula_raw, historico_pagamentos )
    `)
    .order("nome_completo");
  if (error) throw error;

  allStudentsRaw = data.map(a => {
    const fin = Array.isArray(a.financeiro) ? a.financeiro[0] : a.financeiro;
    const resp = a.responsavel;
    return {
      id: a.id,
      nome: a.nome_completo,
      nascimento: a.data_nascimento,
      localNascimento: a.local_nascimento,
      endereco: a.endereco, numero: a.numero, complemento: a.complemento,
      bairro: a.bairro, cidade: a.cidade, uf: a.uf, cep: a.cep,
      telAluno: a.telefone, whatsappAluno: a.whatsapp, emailAluno: a.email,
      rg: a.rg, rgOrgao: a.rg_orgao_expedidor, rgData: a.rg_data_expedicao, cpf: a.cpf,
      fotoUrl: a.foto_url,
      turmaId: a.turma ? a.turma.id : null,
      turmaNome: a.turma ? a.turma.nome : null,
      responsavelId: resp ? resp.id : (a.responsavel_id || null),
      responsavel: resp ? resp.nome_completo : "—",
      respNascimento: resp ? resp.data_nascimento : null,
      telResp: resp ? resp.telefone : null,
      emailResp: resp ? resp.email : null,
      profissaoResp: resp ? resp.profissao : null,
      respRg: resp ? resp.rg : null,
      respRgOrgao: resp ? resp.rg_orgao_expedidor : null,
      respRgData: resp ? resp.rg_data_expedicao : null,
      respCpf: resp ? resp.cpf : null,
      matricula: a.data_matricula,
      status: a.status,
      observacoes: a.observacoes,
      finId: fin ? fin.id : null,
      anoLetivo: fin ? fin.ano_letivo : null,
      tipo: fin ? fin.tipo : null,
      mensalidade: fin ? fin.valor_parcela : null,
      finValorMatricula: fin ? fin.valor_matricula : null,
      finFormaMatricula: fin ? fin.forma_pagamento_matricula : null,
      finDataPagMatricula: fin ? fin.data_pagamento_matricula : null,
      finTotalCurso: fin ? fin.valor_total_curso : null,
      finQtdParcelas: fin ? fin.qtd_parcelas : null,
      vencimento: fin && fin.dia_vencimento ? String(fin.dia_vencimento) : "—",
      matriculaRaw: fin ? fin.matricula_raw : null,
      historico: fin ? fin.historico_pagamentos : null,
    };
  });
}

/* ===================== Presenças ===================== */
async function loadPresencas() {
  // paginado: sem isso o Supabase corta a resposta em 1.000 linhas e as frequências ficam erradas
  presencas = await buscarTodasLinhas(() => supabase
    .from("presencas")
    .select("id, aluno_id, turma_id, data, presente")
    .order("data").order("id"));

  const map = new Map();
  for (const p of presencas) {
    if (!p.aluno_id) continue;
    let entry = map.get(p.aluno_id);
    if (!entry) { entry = { presencas: 0, faltas: 0, turmaId: p.turma_id, registros: [] }; map.set(p.aluno_id, entry); }
    if (p.presente) entry.presencas++; else entry.faltas++;
    entry.registros.push({ data: p.data, presente: p.presente });
  }
  presencaSummaryByAluno = map;
}

function freqLevel(pct) {
  if (pct === null) return "";
  if (pct < 75) return "critica";
  if (pct < 90) return "atencao";
  return "boa";
}

/* ===================== Horários / ficha de horas ===================== */
async function loadProfessores() {
  const { data, error } = await supabase.from("professores").select("id, nome, ativo").order("nome");
  if (error) throw error;
  professoresList = data;
}
function professoresAtivos() {
  return professoresList.filter(p => p.ativo !== false);
}
async function loadHorarioSemanal() {
  horarioSemanal = await buscarTodasLinhas(() => supabase.from("horario_semanal").select("*").order("turma_nome").order("data").order("periodo_ordem").order("id"));
}
async function loadRegistrosAula() {
  registrosAula = await buscarTodasLinhas(() => supabase.from("registros_aula").select("id, professor_id, data, turma, horas, mes_referencia").order("data").order("id"));
}
async function loadHorarioExecucao() {
  horarioExecucao = await buscarTodasLinhas(() => supabase.from("horario_execucao").select("*").order("id"));
}

function populateTurmaFilters() {
  const opts = turmasList.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join("");
  byId("filter-turma").innerHTML = `<option value="">Todas as turmas</option>` + opts;
  byId("f-turma").innerHTML = opts;
  byId("fin-filter-turma").innerHTML = `<option value="">Todas as turmas</option>` + opts;
  byId("fotos-tabela-filter-turma").innerHTML = `<option value="">Todas as turmas</option>` + opts;
  byId("presenca-filter-turma").innerHTML = `<option value="">Todas as turmas</option>` + opts;

  const dias = [...new Set(students.map(s => s.vencimento).filter(v => v && v !== "—"))]
    .sort((a, b) => Number(a) - Number(b));
  byId("fin-filter-vencimento").innerHTML =
    `<option value="">Todo vencimento</option>` + dias.map(d => `<option value="${d}">dia ${d}</option>`).join("");
}

