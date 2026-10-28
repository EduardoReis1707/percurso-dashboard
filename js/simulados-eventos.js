/* ===================== Simulados: liga eventos fixos (uma única vez) ===================== */
function wireSimuladoOnce(){
  document.querySelectorAll('#view-simulados [data-sim-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.simTab;
      if (v === 'home') showView('homeView');
      if (v === 'correcao') showView('correcaoView');
      if (v === 'professores') showView('professoresView');
    });
  });

  byId('sim-round-select').addEventListener('change', (e) => {
    loadSimuladoRound(e.target.value);
  });

  byId('sim-import-toggle').addEventListener('click', () => {
    byId('sim-import-panel').classList.toggle('hidden');
    byId('sim-lancar-panel').classList.add('hidden');
    byId('sim-gab-panel').classList.add('hidden');
    byId('sim-omr-panel').classList.add('hidden');
  });

  byId('sim-lancar-toggle').addEventListener('click', () => {
    byId('sim-lancar-panel').classList.toggle('hidden');
    byId('sim-import-panel').classList.add('hidden');
    byId('sim-gab-panel').classList.add('hidden');
    byId('sim-omr-panel').classList.add('hidden');
    if (!byId('sim-lancar-panel').classList.contains('hidden')) renderLancarPanel();
  });
  byId('lancarFilter').addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    document.querySelectorAll('#lancarFilter button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    lancarFilterMode = e.target.getAttribute('data-lf');
    renderLancarList();
  });
  byId('lancarSearch').addEventListener('input', debounce(renderLancarList, 150));
  byId('lancarFaltou').addEventListener('change', applyLancarFaltouState);
  byId('lancar-form').addEventListener('submit', e => {
    e.preventDefault();
    salvarLancarResultado();
  });

  byId('sim-import-submit').addEventListener('click', async () => {
    const nome = byId('sim-import-nome').value.trim();
    const dataAplicacao = byId('sim-import-data').value || null;
    const fileInput = byId('sim-import-file');
    const resultEl = byId('sim-import-result');
    if (!nome) { alert('Informe o nome do simulado.'); return; }
    if (!fileInput.files[0]) { alert('Selecione o arquivo JSON com os resultados.'); return; }
    const btn = byId('sim-import-submit');
    btn.disabled = true; btn.textContent = 'Importando...';
    resultEl.innerHTML = '';
    try {
      const text = await fileInput.files[0].text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('O arquivo precisa conter uma lista (array) de alunos.');
      const summary = await importSimuladoRound(nome, dataAplicacao, parsed);
      resultEl.innerHTML = `<b>${summary.matched}</b> de <b>${summary.total}</b> aluno(s) casados automaticamente pelo nome com o cadastro.` +
        (summary.unmatched.length
          ? `<div class="warn" style="margin-top:6px">${summary.unmatched.length} não encontrados no cadastro — revise os nomes e reimporte se precisar:<br>${summary.unmatched.map(n => esc(n)).join('<br>')}</div>`
          : '');
      await loadSimuladosList();
      byId('sim-round-select').value = summary.roundId;
      await loadSimuladoRound(summary.roundId);
      byId('sim-import-nome').value = '';
      byId('sim-import-data').value = '';
      fileInput.value = '';
    } catch (err) {
      console.error(err);
      resultEl.innerHTML = `<span class="warn">Erro ao importar: ${esc(err.message || String(err))}</span>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Importar';
    }
  });

  const renderTableDebounced = debounce(renderTable, 150);
  byId('search').addEventListener('input', e => { state.q = e.target.value; renderTableDebounced(); });
  byId('tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-nome]');
    if (tr) openStudent(decodeURIComponent(tr.getAttribute('data-nome')));
  });
  byId('turmaFilter').addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    document.querySelectorAll('#turmaFilter button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    state.turma = e.target.getAttribute('data-t');
    /* Recorte de turma afeta tudo no painel HOME (não só a tabela): KPIs, gráfico de
       tópicos, questões mais difíceis, top 3 e faltosos — ver recomputeSimDerived(). */
    recomputeSimDerived();
    renderSimScopeCurrent();
    renderSimKpis();
    renderSimTopicChart();
    renderQErrChart();
    renderSimTop3();
    renderSimFaltosos();
    renderTable();
  });
  byId('sortBtn').addEventListener('click', e => {
    state.sortDesc = !state.sortDesc;
    e.target.textContent = state.sortDesc ? 'Ordenar: Melhor → pior' : 'Ordenar: Pior → melhor';
    renderTable();
  });

  document.querySelectorAll('#view-simulados .stu-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#view-simulados .stu-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#view-simulados .tabpanel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
      const target = byId('tab-' + btn.getAttribute('data-tab'));
      target.classList.add('active');
      target.style.display = 'block';
    });
  });
  byId('backBtn').addEventListener('click', () => showView('homeView'));

  const renderConversasDebounced = debounce(renderConversas, 200);
  byId('convSearch').addEventListener('input', renderConversasDebounced);
  byId('critNota').addEventListener('input', renderConversasDebounced);
  byId('critQueda').addEventListener('input', renderConversasDebounced);
  // se chegou uma atualização enquanto alguém digitava, redesenha assim que ele sai da caixa de anotação
  byId('convList').addEventListener('focusout', () => {
    setTimeout(() => { if (convSujo && !convDigitando()) renderConversasSoon(); }, 0);
  });
  byId('convPriorityFilter').addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    document.querySelectorAll('#convPriorityFilter button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderConversas();
  });
  byId('convFilter').addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    document.querySelectorAll('#convFilter button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderConversas();
  });
  byId('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(checklist, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `checklist_conversas_percurso_${stamp}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  byId('importBtn').addEventListener('click', () => {
    byId('importFile').click();
  });
  byId('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const incoming = JSON.parse(reader.result);
        checklist = Object.assign({}, checklist, incoming);
        saveChecklist(checklist);
        renderConversas();
        const nomes = Object.keys(incoming);
        for (const nome of nomes) { await upsertChecklistEntry(nome); }
        if (nomes.length) alert(`Backup restaurado e enviado pra nuvem: ${nomes.length} aluno(s).`);
      } catch (err) {
        alert('Não foi possível ler esse arquivo de backup.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  byId('profBack').addEventListener('click', () => {
    byId('profDetail').classList.remove('open');
  });
}

/* ===================== Simulados: integração com a ficha (drawer) do aluno ===================== */
async function loadDrawerSimulado(alunoId){
  const { data, error } = await supabase
    .from('simulado_resultados')
    .select('acertos, pct, simulado:simulados(id, nome, data_aplicacao, ano_letivo)')
    .eq('aluno_id', alunoId);
  if (error || !data || !data.length) return null;
  const doAno = data.filter(r => r.simulado && r.simulado.ano_letivo === selectedAnoLetivo);
  if (!doAno.length) return null;
  const sorted = [...doAno].sort((a, b) => {
    const da = (a.simulado && a.simulado.data_aplicacao) || '';
    const db = (b.simulado && b.simulado.data_aplicacao) || '';
    return db.localeCompare(da);
  });
  return sorted[0];
}

async function goToSimuladoStudent(nomeAluno, simuladoId){
  goto('simulados');
  if (simuladoId && (!currentSimuladoMeta || currentSimuladoMeta.id !== simuladoId)) {
    const sel = byId('sim-round-select');
    if (sel.querySelector(`option[value="${simuladoId}"]`)) sel.value = simuladoId;
    await loadSimuladoRound(simuladoId);
  }
  openStudent(nomeAluno);
}

wireSimuladoOnce();
wireGabaritoOmrOnce();
