/* ===================== Simulados: estado e orquestração ===================== */
let STUDENTS = [];
let presentes = [], faltosos = [], t1 = [], t2 = [], ranked = [];
let rankedPosByRef = new Map(); // aluno -> posição no ranking geral (evita indexOf O(n) em renderTable)

/* As análises comparativas do HOME (Turma 1 x Turma 2, gráfico de tópicos, alunos fracos,
   relatório PDF) são desenhadas especificamente para comparar as DUAS turmas de CEFET —
   não é um "para cada turma genérica". CEFET_T1_ID/CEFET_T2_ID resolvem essas duas turmas
   reais (por tipo='CEFET', na ordem de TURMA_ORDER) a partir de turmasList, já filtrada
   pelo ano letivo selecionado. Recalculados a cada renderSimuladoAll()/recomputeSimDerived(). */
let CEFET_T1_ID = null, CEFET_T2_ID = null;
function updateCefetTurmaIds(){
  const cefet = turmasList
    .filter(t => t.tipo === 'CEFET')
    .sort((a, b) => TURMA_ORDER.indexOf(a.nome) - TURMA_ORDER.indexOf(b.nome));
  CEFET_T1_ID = cefet[0] ? cefet[0].id : null;
  CEFET_T2_ID = cefet[1] ? cefet[1].id : null;
}
/* Versões já recortadas pela turma selecionada em `state.turma` (ver #turmaFilter) —
   usadas por tudo no painel HOME que deve respeitar o filtro de turma. */
let scopedPresentes = [], scopedFaltosos = [], scopedRanked = [];

/* Critérios de desempate no ranking, nesta ordem: maior nota em Português, depois
   Matemática, depois Ciências (Biologia+Química+Física), depois História, depois Geografia.
   Funciona tanto pra simulados com correção questão a questão (9 grupos de tópico)
   quanto pra simulados só com nota por matéria (5 matérias). */
const TIEBREAK_SUBJECTS = ['Português','Matemática','Ciências','História','Geografia'];
function subjectScore(s, subject){
  if(!s.topicos) return 0;
  if(isPorMateria()) return s.topicos[subject] || 0;
  switch(subject){
    case 'Português': return (s.topicos['Interpretação']||0) + (s.topicos['Gramática']||0);
    case 'Matemática': return (s.topicos['Aritmética']||0) + (s.topicos['Álgebra e Geometria']||0);
    case 'Ciências': return (s.topicos['Biologia']||0) + (s.topicos['Química']||0) + (s.topicos['Física']||0);
    case 'História': return s.topicos['História']||0;
    case 'Geografia': return s.topicos['Geografia']||0;
    default: return 0;
  }
}
function compareRanked(a, b){
  if(b.acertos !== a.acertos) return b.acertos - a.acertos;
  for(const subj of TIEBREAK_SUBJECTS){
    const diff = subjectScore(b, subj) - subjectScore(a, subj);
    if(diff !== 0) return diff;
  }
  return 0;
}

/* Faltosos "completos": junta (a) alunos que já têm uma linha lançada pra esta rodada
   mas com acertos=null (marcados explicitamente como faltosos), com (b) alunos ativos
   do cadastro (Pré-CEFET 1/2 — as únicas turmas que fazem Simulados) que não têm
   nenhuma linha lançada ainda pra esta rodada (nem presença, nem falta). Sem isso, um
   aluno cujo lançamento nunca foi feito simplesmente não aparecia em lugar nenhum.
   Deduplicado por nome normalizado — ver lancarFaltantesList(), que resolve o mesmo
   problema (b) mas só pro painel interno de lançamento. */
function computeFaltosos(){
  const comLinha = STUDENTS
    .filter(s => s.acertos===null || s.acertos===undefined)
    .map(s => ({ nome: s.nome, turma: s.turma, aluno_id: s.aluno_id, semLancamento: false }));
  const jaTemLinha = new Set(STUDENTS.map(s => normName(s.nome)));
  const cefetIds = omrCefetTurmaIds();
  const semLinha = students
    .filter(s => (s.status || '').toLowerCase() !== 'desistente')
    .filter(s => !jaTemLinha.has(normName(s.nome)))
    .filter(s => cefetIds.has(s.turmaId))
    .map(s => ({ nome: s.nome, turma: s.turmaId, aluno_id: s.id, semLancamento: true }));
  const seen = new Set();
  const merged = [];
  [...comLinha, ...semLinha].forEach(item => {
    const key = normName(item.nome);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

/* Estatísticas por questão (% de acerto, distribuição de marcações, erro mais comum)
   calculadas a partir das respostas reais dos alunos da população passada (ok/marc
   por índice de questão) — em vez de um valor fixo, assim elas acompanham corretamente
   tanto a rodada carregada quanto o recorte de turma selecionado. O gabarito de cada
   questão (letra correta) vem de QCONTENT, que é o conteúdo real da prova. */
function computeQStats(pop){
  const out = {};
  for(let q=1; q<=50; q++){
    const idx = q-1;
    let total = 0, correct = 0;
    const dist = {};
    pop.forEach(s => {
      if(!s.ok || s.ok[idx]===undefined || s.ok[idx]===null) return;
      total++;
      if(s.ok[idx]===1) correct++;
      const letter = s.marc && s.marc[idx];
      if(letter) dist[letter] = (dist[letter]||0) + 1;
    });
    const gab = (QCONTENT[q] && QCONTENT[q].gabarito) || null;
    let mostWrongLetter = null, mostWrongCount = 0;
    Object.entries(dist).forEach(([letter, count]) => {
      if(letter !== gab && count > mostWrongCount){ mostWrongCount = count; mostWrongLetter = letter; }
    });
    out[q] = {
      correct_pct: total ? correct/total*100 : 0,
      dist,
      gab,
      most_wrong_letter: mostWrongLetter,
      most_wrong_count: mostWrongCount,
      most_wrong_pct: total ? mostWrongCount/total*100 : 0,
    };
  }
  return out;
}

function recomputeSimDerived(){
  updateCefetTurmaIds();
  presentes = STUDENTS.filter(s=>s.acertos!==null && s.acertos!==undefined);
  faltosos = computeFaltosos();
  t1 = presentes.filter(s=>s.turma===CEFET_T1_ID);
  t2 = presentes.filter(s=>s.turma===CEFET_T2_ID);
  ranked = [...presentes].sort(compareRanked);
  rankedPosByRef = new Map(ranked.map((s, i) => [s, i + 1]));

  scopedPresentes = state.turma==='all' ? presentes : presentes.filter(s=>s.turma===state.turma);
  scopedFaltosos = state.turma==='all' ? faltosos : faltosos.filter(s=>s.turma===state.turma);
  scopedRanked = [...scopedPresentes].sort(compareRanked);

  QSTATS = isPorMateria() ? {} : computeQStats(scopedPresentes);
}

let simuladosList = [];
let currentSimuladoMeta = null;

function reshapeSimResultRow(row){
  return {
    id: row.id,
    aluno_id: row.aluno_id,
    nome: row.nome_referencia,
    turma: row.turma_id,
    acertos: row.acertos,
    pct: (row.pct === null || row.pct === undefined) ? null : Number(row.pct),
    topicos: row.topicos || {},
    ok: row.ok || [],
    marc: row.marc || [],
    gab: row.gab || [],
    sim1: row.sim1,
    sim2: row.sim2,
    part: row.part,
    comp: row.comp,
    grupo: row.grupo,
  };
}

/* Renderiza tudo que depende dos dados do simulado carregado (STUDENTS) */
function renderSimTurmaFilterButtons(){
  const el = byId('turmaFilter');
  if (!el) return;
  if (!turmasList.some(t => t.id === state.turma)) state.turma = 'all';
  el.innerHTML = `<button data-t="all" class="${state.turma === 'all' ? 'active' : ''}">Todas as turmas</button>` +
    turmasList.map(t => `<button data-t="${t.id}" class="${state.turma === t.id ? 'active' : ''}">${esc(t.nome)}</button>`).join('');
}

function renderSimuladoAll(){
  renderSimTurmaFilterButtons();
  recomputeSimDerived();
  setTopicMetaForRound(currentSimuladoMeta);

  const meta = currentSimuladoMeta;
  byId('simHeroTitle').textContent = meta ? meta.nome : 'Nenhum simulado selecionado';
  byId('simHeroSub').textContent = turmasList.length
    ? turmasList.map(t => t.nome).join(' · ') + ' · Desempenho por aluno e por tópico'
    : 'Desempenho por aluno e por tópico';
  byId('simHeroRight').innerHTML = meta
    ? `Aplicação ${meta.data_aplicacao ? fmtDate(meta.data_aplicacao) : '—'}<br>${meta.num_questoes || 50} questões · 4 alternativas`
    : '';

  renderSimScopeCurrent();
  renderSimKpis();
  renderSimTopicChart();
  renderQErrChart();
  renderSimTop3();
  renderSimFaltosos();
  renderTable();
  /* As abas "Correção do simulado" e "Relatório docente", o painel de lançamento e o bloco de
     Conversas só são desenhados quando aparecem (ver showView, o botão de lançamento e
     renderConversasSoon). Antes, tudo isso era refeito a cada troca de simulado ou de turma. */
  simLazy.corr = true; simLazy.prof = true;
  byId('corrDetail').classList.remove('open');
  renderStorageNote();
  renderConversasSoon();
  byId('profDetail').classList.remove('open');
  if (!byId('sim-lancar-panel').classList.contains('hidden')) renderLancarPanel();
  updateCefetToggles();
  flushSimLazy(simSubViewAtiva());
}

const simLazy = { corr: true, prof: true };
function simSubViewAtiva(){
  return ['homeView','studentView','correcaoView','professoresView'].find(id => {
    const el = byId(id);
    return el && !el.classList.contains('hidden') && el.style.display !== 'none';
  }) || 'homeView';
}
function flushSimLazy(nome){
  if (nome === 'correcaoView' && simLazy.corr) { simLazy.corr = false; renderCorrTopics(); renderCorrGrid(); }
  if (nome === 'professoresView' && simLazy.prof) { simLazy.prof = false; renderProfGrid(); }
}

/* ===================== Simulados: lançar/atualizar resultado de um aluno ===================== */
let lancarSelectedNome = null;
let lancarFilterMode = 'lancados';

function renderLancarPanel(){
  const noRound = byId('lancar-no-round');
  const body = byId('lancar-body');
  if (!currentSimuladoMeta) {
    noRound.classList.remove('hidden');
    body.classList.add('hidden');
    return;
  }
  noRound.classList.add('hidden');
  body.classList.remove('hidden');
  renderLancarList();
  renderLancarForm();
}

function lancarFaltantesList(){
  const jaLancados = new Set(STUDENTS.map(s => normName(s.nome)));
  return students
    .filter(s => (s.status || '').toLowerCase() !== 'desistente')
    .filter(s => !jaLancados.has(normName(s.nome)));
}

function renderLancarList(){
  const q = (byId('lancarSearch').value || '').trim().toLowerCase();
  let items;
  if (lancarFilterMode === 'lancados') {
    items = STUDENTS.map(s => ({ nome: s.nome, turma: s.turma, faltou: s.acertos===null || s.acertos===undefined }));
  } else {
    items = lancarFaltantesList().map(s => ({ nome: s.nome, turma: s.turmaId, faltou: false }));
  }
  if (q) items = items.filter(i => i.nome.toLowerCase().includes(q));
  items.sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const list = byId('lancarList');
  if (!items.length) {
    list.innerHTML = `<div class="lancar-empty-note">${lancarFilterMode==='lancados' ? 'Nenhum resultado lançado ainda pra esse simulado.' : 'Todos os alunos matriculados já têm um lançamento (presente ou faltoso) nesse simulado.'}</div>`;
    return;
  }
  list.innerHTML = items.map(i => `
    <div class="lancar-item ${i.nome===lancarSelectedNome?'selected':''}" data-nome="${encodeURIComponent(i.nome)}">
      <span>${esc(i.nome)}${i.faltou?' <span class="hint">(faltou)</span>':''}</span>
      <span class="lancar-item-turma">${i.turma ? esc(turmaShort(i.turma)) : ''}</span>
    </div>`).join('');
  list.querySelectorAll('.lancar-item').forEach(el => {
    el.addEventListener('click', () => {
      lancarSelectedNome = decodeURIComponent(el.getAttribute('data-nome'));
      renderLancarList();
      renderLancarForm();
    });
  });
}

function renderLancarForm(){
  const empty = byId('lancar-form-empty');
  const form = byId('lancar-form');
  if (!lancarSelectedNome) {
    empty.classList.remove('hidden');
    form.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  form.classList.remove('hidden');

  const existing = STUDENTS.find(s => s.nome === lancarSelectedNome);
  const cadastro = students.find(s => s.nome === lancarSelectedNome);

  byId('lancarFormNome').textContent = lancarSelectedNome;
  byId('lancarFaltou').checked = !!existing && (existing.acertos===null || existing.acertos===undefined);
  const turmaSel = byId('lancarTurma');
  turmaSel.innerHTML = turmasList.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
  // cadastro.turmaId é a turma real do aluno (cadastro em Alunos) — usada como padrão
  // ao lançar um resultado, caso ainda não haja um resultado anterior com turma definida.
  const turmaPadrao = (existing && existing.turma) || (cadastro && cadastro.turmaId) || (turmasList[0] && turmasList[0].id) || '';
  turmaSel.value = turmaPadrao;

  const topicosWrap = byId('lancarTopicos');
  topicosWrap.innerHTML = TOPIC_ORDER.map(topic => {
    const total = TOPIC_TOTALS[topic];
    const val = (existing && existing.topicos && existing.topicos[topic]!=null) ? existing.topicos[topic] : '';
    return `<div class="lancar-topico-field">
      <label>${esc(topic)} (0–${total})</label>
      <input type="number" min="0" max="${total}" step="1" data-topic="${esc(topic)}" value="${val}">
    </div>`;
  }).join('');

  topicosWrap.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateLancarTotal));
  byId('lancar-result').innerHTML = '';
  applyLancarFaltouState();
}

function applyLancarFaltouState(){
  const faltou = byId('lancarFaltou').checked;
  byId('lancarTopicos').querySelectorAll('input').forEach(inp => inp.disabled = faltou);
  updateLancarTotal();
}

function updateLancarTotal(){
  const faltou = byId('lancarFaltou').checked;
  const totalEl = byId('lancarTotal');
  if (faltou) { totalEl.innerHTML = 'Aluno marcado como <b>faltoso</b> — nenhuma nota será somada.'; return; }
  const inputs = [...byId('lancarTopicos').querySelectorAll('input')];
  const soma = inputs.reduce((acc, inp) => acc + (parseInt(inp.value, 10) || 0), 0);
  const totalGeral = TOPIC_ORDER.reduce((acc, t) => acc + TOPIC_TOTALS[t], 0);
  totalEl.innerHTML = `Total: <b>${soma}</b>/${totalGeral} (${fmt1(totalGeral ? soma/totalGeral*100 : 0)}%)`;
}

async function salvarLancarResultado(){
  const resultEl = byId('lancar-result');
  const btn = byId('lancarSalvar');
  if (!currentSimuladoMeta || !lancarSelectedNome) return;
  btn.disabled = true; btn.textContent = 'Salvando...';
  resultEl.innerHTML = '';
  const nomeSalvo = lancarSelectedNome;
  try {
    const faltou = byId('lancarFaltou').checked;
    const turmaId = byId('lancarTurma').value || null;
    let acertos = null, pct = null, topicos = null;
    if (!faltou) {
      const inputs = [...byId('lancarTopicos').querySelectorAll('input')];
      topicos = {};
      inputs.forEach(inp => { topicos[inp.getAttribute('data-topic')] = parseInt(inp.value, 10) || 0; });
      acertos = Object.values(topicos).reduce((a,b)=>a+b, 0);
      const totalGeral = TOPIC_ORDER.reduce((acc, t) => acc + TOPIC_TOTALS[t], 0);
      pct = totalGeral ? (acertos / totalGeral * 100) : 0;
    }
    const alunoId = matchAlunoIdByName(nomeSalvo);
    const existing = STUDENTS.find(s => s.nome === nomeSalvo);
    const payload = {
      simulado_id: currentSimuladoMeta.id,
      aluno_id: alunoId,
      nome_referencia: nomeSalvo,
      turma_id: turmaId,
      acertos,
      pct,
      topicos,
    };
    let error;
    if (existing && existing.id) {
      ({ error } = await supabase.from('simulado_resultados').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('simulado_resultados').insert(payload));
    }
    if (error) throw error;
    await loadSimuladoRound(currentSimuladoMeta.id);
    lancarSelectedNome = nomeSalvo;
    renderLancarPanel();
    byId('lancar-result').innerHTML = `<b>Salvo!</b> Resultado de ${esc(nomeSalvo)} atualizado.`;
  } catch (err) {
    console.error(err);
    byId('lancar-result').innerHTML = `<span class="warn">Erro ao salvar: ${esc(err.message || String(err))}</span>`;
  } finally {
    byId('lancarSalvar').disabled = false;
    byId('lancarSalvar').textContent = 'Salvar resultado';
  }
}

/* ===================== Simulados: carregar dados do Supabase ===================== */
async function loadSimuladosList(){
  const { data, error } = await supabase
    .from('simulados')
    .select('*')
    .eq('ano_letivo', selectedAnoLetivo)
    .order('data_aplicacao', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) { console.error(error); simuladosList = []; return; }
  simuladosList = data || [];
  const sel = byId('sim-round-select');
  sel.innerHTML = simuladosList.map(r =>
    `<option value="${r.id}">${esc(r.nome)}${r.data_aplicacao ? ' · ' + fmtDate(r.data_aplicacao) : ''}</option>`
  ).join('');
  byId('sim-empty-state').hidden = simuladosList.length > 0;
}

async function loadSimuladoRound(simuladoId){
  if (!simuladoId) {
    STUDENTS = [];
    currentSimuladoMeta = null;
    renderSimuladoAll();
    return;
  }
  currentSimuladoMeta = simuladosList.find(r => r.id === simuladoId) || null;
  // o histórico (notas das outras rodadas, só colunas leves) vem em paralelo com os resultados desta rodada
  const [{ data, error }] = await Promise.all([
    supabase.from('simulado_resultados').select('*').eq('simulado_id', simuladoId),
    loadSimHistory(),
    loadChecklistFromSupabase(),
  ]);
  if (error) {
    console.error(error);
    STUDENTS = [];
    renderSimuladoAll();
    return;
  }
  STUDENTS = (data || []).map(reshapeSimResultRow);
  renderSimuladoAll();
}

async function initSimulados(){
  await loadSimuladosList();
  const sel = byId('sim-round-select');
  if (simuladosList.length) {
    sel.value = simuladosList[0].id;
    await loadSimuladoRound(simuladosList[0].id);
  } else {
    currentSimuladoMeta = null;
    STUDENTS = [];
    renderSimuladoAll();
  }
  subscribeChecklistRealtime();
}

/* ===================== Simulados: histórico de notas por aluno ===================== */
/* Notas do aluno em todas as rodadas do ano letivo, calculadas a partir dos resultados reais.
   Substitui os campos fixos sim1/sim2 (que só existiam nas linhas do 3º simulado e deixavam o
   4º simulado sem "histórico", "queda de acertos" e comparação com o simulado anterior). */
let SIM_HIST = { byAluno: new Map(), byNome: new Map(), todos: [] };
/* Antes buscava TODA a tabela simulado_resultados (todas as rodadas, todos os anos) com um
   join embutido em simulados, e só depois filtrava por ano_letivo no JS — ficando mais lento
   a cada rodada nova e a cada ano que passa. Agora usa só as rodadas do ano selecionado
   (simuladosList, já carregada) pra filtrar direto no banco com .in(), sem join nenhum. */
async function loadSimHistory(){
  try {
    const metaById = new Map(simuladosList.map(r => [r.id, r]));
    const idsDoAno = [...metaById.keys()];
    if (!idsDoAno.length) { SIM_HIST = { byAluno: new Map(), byNome: new Map(), todos: [] }; return; }
    const { data, error } = await supabase
      .from('simulado_resultados')
      .select('aluno_id, nome_referencia, turma_id, acertos, topicos, simulado_id')
      .in('simulado_id', idsDoAno);
    if (error) throw error;
    const byAluno = new Map(), byNome = new Map(), todos = [];
    const add = (m, k, p) => { if (!m.has(k)) m.set(k, []); m.get(k).push(p); };
    (data || []).forEach(r => {
      const meta = metaById.get(r.simulado_id);
      if (!meta) return;
      const p = { simId: meta.id, label: meta.nome, data: meta.data_aplicacao, acertos: r.acertos, topicos: r.topicos, turmaId: r.turma_id };
      todos.push(p);
      if (r.aluno_id) add(byAluno, r.aluno_id, p);
      add(byNome, normName(r.nome_referencia), p);
    });
    const porData = (a, b) => (a.data || '').localeCompare(b.data || '');
    byAluno.forEach(a => a.sort(porData));
    byNome.forEach(a => a.sort(porData));
    SIM_HIST = { byAluno, byNome, todos };
  } catch (e) { console.error('Histórico de simulados indisponível:', e); }
}
/* "3º Simulado Pré-CEFET" -> "3º simulado" */
function simRodadaCurta(label){
  const m = /^\s*(\d+)\s*º/.exec(label || '');
  return m ? `${m[1]}º simulado` : (label || 'simulado');
}
function simRodadaAtualCurta(){ return simRodadaCurta(currentSimuladoMeta ? currentSimuladoMeta.nome : ''); }
function simHistoricoDe(s){
  return (s.aluno_id && SIM_HIST.byAluno.get(s.aluno_id)) || SIM_HIST.byNome.get(normName(s.nome)) || [];
}
/* Até 2 rodadas ANTERIORES à rodada aberta (da mais antiga para a mais recente). */
function simAnteriores(s){
  const cur = currentSimuladoMeta;
  if (!cur) return [];
  const dataAtual = cur.data_aplicacao || '';
  const ant = simHistoricoDe(s).filter(p => p.simId !== cur.id && (p.data || '') < dataAtual);
  if (ant.length) return ant.slice(-2);
  // compatibilidade: as rodadas antigas só tinham os campos sim1/sim2 na linha do aluno
  const out = [];
  if (s.sim1 != null) out.push({ label: '1º Simulado', acertos: s.sim1 });
  if (s.sim2 != null) out.push({ label: '2º Simulado', acertos: s.sim2 });
  return out;
}
/* Rodada anterior mais recente em que o aluno tem nota. */
function simRodadaBase(s){
  const ant = simAnteriores(s).filter(p => p.acertos != null);
  return ant.length ? ant[ant.length - 1] : null;
}

/* ===================== Simulados: casar nome -> aluno cadastrado ===================== */
function matchAlunoIdByName(nome){
  const found = alunoPorNome(nome);
  return found ? found.id : null;
}

/* O JSON importado (gerado por uma ferramenta externa de OMR) traz rótulos livres de
   turma — geralmente "Turma 1"/"Turma 2", às vezes já o nome real. Preferimos sempre a
   turma do cadastro do aluno (mais confiável); esse resolver é só o fallback quando o
   aluno não bate por nome com ninguém cadastrado. */
function resolveTurmaIdFromLabel(label){
  if (!label) return null;
  const norm = String(label).trim().toLowerCase();
  if (norm === 'turma 1') return (turmasList.find(t => t.tipo === 'CEFET' && /1/.test(t.nome)) || {}).id || null;
  if (norm === 'turma 2') return (turmasList.find(t => t.tipo === 'CEFET' && /2/.test(t.nome)) || {}).id || null;
  const byName = turmasList.find(t => t.nome.toLowerCase() === norm);
  return byName ? byName.id : null;
}

async function importSimuladoRound(nomeRodada, dataAplicacao, parsedStudents){
  const { data: roundData, error: roundErr } = await supabase
    .from('simulados')
    .insert({ nome: nomeRodada, data_aplicacao: dataAplicacao || null, ano_letivo: selectedAnoLetivo, num_questoes: 50, topico_ranges: { tipo: 'por_questao', ranges: TOPIC_RANGES } })
    .select()
    .single();
  if (roundErr) throw roundErr;

  const rows = parsedStudents.map(s => {
    const alunoId = matchAlunoIdByName(s.nome);
    const cadastro = alunoId ? students.find(st => st.id === alunoId) : null;
    const turmaId = (cadastro && cadastro.turmaId) || resolveTurmaIdFromLabel(s.turma);
    return {
      simulado_id: roundData.id,
      aluno_id: alunoId,
      nome_referencia: s.nome,
      turma_id: turmaId,
      acertos: s.acertos ?? null,
      pct: s.pct ?? null,
      topicos: s.topicos ?? null,
      ok: s.ok ?? null,
      marc: s.marc ?? null,
      gab: s.gab ?? null,
      sim1: s.sim1 ?? null,
      sim2: s.sim2 ?? null,
      part: s.part ?? null,
      comp: s.comp ?? null,
      grupo: s.grupo ?? null,
    };
  });

  if (rows.length) {
    const { error: insErr } = await supabase.from('simulado_resultados').insert(rows);
    if (insErr) throw insErr;
  }

  return {
    roundId: roundData.id,
    total: rows.length,
    matched: rows.filter(r => r.aluno_id).length,
    unmatched: rows.filter(r => !r.aluno_id).map(r => r.nome_referencia),
  };
}
