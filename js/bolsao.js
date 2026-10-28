/* ===================== BOLSÃO (prova de bolsas) =====================
   Tabelas no Supabase: bolsao_provas (gabarito, assuntos, tabela de bolsa) e
   bolsao_alunos (respostas + conversa com a família). As duas estão no realtime:
   qualquer mudança feita em um computador aparece nos outros na hora.
   Respostas: a-e = alternativa marcada, _ = em branco, * = marcação dupla (conta como erro). */

const BS_FAIXAS_PADRAO = [
  {min:0,max:12,bolsa:10},{min:13,max:14,bolsa:20},{min:15,max:16,bolsa:30},{min:17,max:19,bolsa:40},
  {min:20,max:25,bolsa:50},{min:26,max:28,bolsa:60},{min:29,max:29,bolsa:80},{min:30,max:30,bolsa:100}];

const bs = {
  provas: [], alunos: [], edicao: null,
  aba: 'res', filtroProva: 'all', busca: '', sortKey: 'total', sortDir: -1, aberto: null,
  convStatus: 'all', canal: null, iniciado: false,
  editProva: null, editAluno: null, respostas: [], confirmExcluir: null
};
const bsEl = id => document.getElementById(id);
const bsNorm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const bsHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const bsData = iso => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
const bsQ = n => String(n).padStart(2, '0');

function bsAviso(msg){ const el = bsEl('bs-aviso'); el.textContent = msg || ''; el.hidden = !msg; }

/* ---------- cálculo ---------- */
function bsProva(id){ return bs.provas.find(p => p.id === id); }
function bsTema(prova, q){
  const t = (prova.temas || []).find(x => Number(x.q) === q) || {};
  return { area: t.area || 'Geral', assunto: t.assunto || 'Sem assunto definido', conteudo: t.conteudo || '' };
}
function bsBolsa(prova, acertos){
  const f = (prova.tabela_bolsa || []).find(f => acertos >= f.min && acertos <= f.max);
  return f ? Number(f.bolsa) : 0;
}
function bsCorrigir(a){
  const p = bsProva(a.prova_id);
  if (!p) return null;
  const g = p.gabarito, n = g.length, marks = [], porArea = {};
  let total = 0;
  for (let i = 0; i < n; i++){
    const r = (a.respostas || '')[i] || '_';
    const ok = r === g[i];
    const area = bsTema(p, i + 1).area;
    porArea[area] = porArea[area] || {ok: 0, n: 0};
    porArea[area].n++;
    if (ok){ total++; porArea[area].ok++; }
    marks.push({ r, ok, vazio: !/[a-e]/.test(r), dupla: r === '*', branco: r === '_' });
  }
  return { prova: p, n, total, porArea, marks, bolsa: bsBolsa(p, total),
           duplas: marks.filter(m => m.dupla).length, brancos: marks.filter(m => m.branco).length };
}
function bsAlunosDaEdicao(){
  const ids = new Set(bs.provas.filter(p => p.edicao === bs.edicao).map(p => p.id));
  const lista = bs.alunos.filter(a => ids.has(a.prova_id)).map(a => ({ ...a, c: bsCorrigir(a) })).filter(a => a.c);
  lista.sort((x, y) => (y.c.total / y.c.n) - (x.c.total / x.c.n) || y.c.total - x.c.total || x.nome.localeCompare(y.nome, 'pt'));
  lista.forEach((a, i) => a.pos = i + 1);
  return lista;
}
function bsProvasDaEdicao(){ return bs.provas.filter(p => p.edicao === bs.edicao).sort((a, b) => a.nome.localeCompare(b.nome, 'pt')); }
/* valor do curso: parcela integral da prova menos a bolsa, com duas casas decimais (contas em centavos para não errar o arredondamento) */
const bsBRL = cents => 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function bsCurso(prova, bolsa){
  if (prova.valor_parcela == null) return null;
  const n = Number(prova.num_parcelas) || 10;
  const base = Math.round(Number(prova.valor_parcela) * 100);
  const parcela = Math.round(base * (100 - bolsa) / 100);
  return { n, base, parcela, total: parcela * n, totalBase: base * n, desconto: base - parcela };
}
function bsValorHtml(a){
  const p = a.c.prova, v = bsCurso(p, a.c.bolsa);
  if (!v) return ''; // prova sem valor cadastrado (ex.: 8º ano por enquanto): não mostra nada
  const pism = /pism|enem/i.test(a.turma_marcada || '')
    ? `<p class="bs-note bs-alerta">Turma marcada na folha: ${esc(a.turma_marcada)}. Este valor é da tabela de preços da prova; confira se vale para essa turma.</p>` : '';
  return `<div class="bs-valor"><div class="bs-label">Valor do curso com bolsa de ${a.c.bolsa}%</div>
    <div class="bs-valor-linha"><b class="bs-valor-num">${bsBRL(v.parcela)}</b><span>por parcela · ${v.n} parcelas</span></div>
    <div class="bs-note">Total no ano: <b>${bsBRL(v.total)}</b></div>
    <div class="bs-note">Valor integral: ${bsBRL(v.base)} por parcela (${bsBRL(v.totalBase)} no ano). Desconto de ${bsBRL(v.desconto)} por parcela.</div>${pism}</div>`;
}
function bsBolsaTag(b){ const cls = b <= 10 ? 'b1' : b >= 80 ? 'b4' : b >= 40 ? 'b3' : ''; return `<span class="bs-bolsa ${cls}">${b}%</span>`; }
function bsAbrevArea(a){ return a === 'Português' ? 'Port.' : a === 'Matemática' ? 'Mat.' : a; }

/* ---------- carregar e sincronizar ---------- */
async function bsCarregar(deFora){
  const [rp, ra] = await Promise.all([
    supabase.from('bolsao_provas').select('*').order('created_at'),
    supabase.from('bolsao_alunos').select('*').order('created_at')
  ]);
  if (rp.error || ra.error){
    console.error('Erro ao carregar o Bolsão:', rp.error || ra.error);
    bsAviso('Não foi possível carregar os dados do Bolsão. Verifique a internet e recarregue a página.');
    return;
  }
  bs.provas = rp.data || [];
  bs.alunos = ra.data || [];
  const edicoes = [...new Set(bs.provas.map(p => p.edicao))].sort().reverse();
  if (!edicoes.includes(bs.edicao)){
    let salva = null; try { salva = localStorage.getItem('percurso_bolsao_edicao'); } catch(e){}
    bs.edicao = edicoes.includes(salva) ? salva : (edicoes[0] || null);
  }
  bsAviso('');
  bsRenderTudo(deFora); // deFora: não redesenha o campo em que alguém está digitando
}
function bsAssinar(){
  if (bs.canal) return;
  let timer = null;
  const recarregar = () => { clearTimeout(timer); timer = setTimeout(() => bsCarregar(true), 250); };
  bs.canal = supabase.channel('bolsao_sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bolsao_alunos' }, payload => {
      if (payload.eventType === 'DELETE'){
        bs.alunos = bs.alunos.filter(a => a.id !== payload.old.id);
      } else {
        const i = bs.alunos.findIndex(a => a.id === payload.new.id);
        if (i === -1) bs.alunos.push(payload.new); else bs.alunos[i] = payload.new;
      }
      bsRenderTudo(true);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bolsao_provas' }, recarregar)
    .subscribe(status => {
      if (status === 'SUBSCRIBED'){
        // ao reconectar (queda de internet, computador que dormiu) busca tudo de novo, para não perder o que mudou nesse intervalo
        if (bs.conectouAntes) bsCarregar(true);
        bs.conectouAntes = true;
        if (bs.avisoTempoReal){ bs.avisoTempoReal = false; bsAviso(''); }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
        bs.avisoTempoReal = true;
        bsAviso('A atualização em tempo real foi interrompida. Tentando reconectar…');
      }
    });
}
/* rede de segurança: quem volta para a aba, recupera a internet ou deixa o painel aberto por horas também recebe o que os outros mudaram */
function bsManterAtualizado(){
  if (bs.mantendo) return;
  bs.mantendo = true;
  const atualizar = () => { if (document.visibilityState === 'visible' && nomeDaViewAtiva() === 'bolsao') bsCarregar(true); };
  document.addEventListener('visibilitychange', atualizar);
  window.addEventListener('online', () => bsCarregar(true));
  setInterval(atualizar, 120000);
  // ao abrir a aba, confere uma vez o que mudou enquanto ela estava fechada
  document.querySelector('.nav-item[data-view="bolsao"]').addEventListener('click', () => bsCarregar(true));
}
async function initBolsao(){
  if (!bs.iniciado){ bs.iniciado = true; bsLigarEventos(); }
  await bsCarregar();
  bsAssinar();
  bsManterAtualizado();
}

/* ---------- render geral ---------- */
function bsRenderTudo(deFora){
  const sel = bsEl('bs-edicao');
  const edicoes = [...new Set(bs.provas.map(p => p.edicao))].sort().reverse();
  sel.innerHTML = edicoes.length ? edicoes.map(e => `<option value="${esc(e)}" ${e === bs.edicao ? 'selected' : ''}>${esc(e)}</option>`).join('') : '<option value="">Nenhuma prova cadastrada</option>';
  const provas = bsProvasDaEdicao();
  if (bs.filtroProva !== 'all' && !provas.some(p => p.id === bs.filtroProva)) bs.filtroProva = 'all';
  const seg = (alvo, atual) => `<button type="button" data-v="all" class="${atual === 'all' ? 'active' : ''}">Todas</button>` +
    provas.map(p => `<button type="button" data-v="${p.id}" class="${atual === p.id ? 'active' : ''}">${esc(p.nome.replace(/^Prova d[oa] /, ''))}</button>`).join('');
  bsEl('bs-filtro-prova').innerHTML = seg('res', bs.filtroProva);
  const lista = bsAlunosDaEdicao();
  const nFeitas = lista.filter(a => a.conversa_feita).length;
  bsEl('bs-filtro-conv').innerHTML = [['all', 'Todas as conversas'], ['pend', `A conversar (${lista.length - nFeitas})`], ['feita', `Conversas realizadas (${nFeitas})`]]
    .map(([v, t]) => `<button type="button" data-v="${v}" class="${bs.convStatus === v ? 'active' : ''}">${t}</button>`).join('');
  // não redesenha as telas de conversa enquanto alguém digita a data ou o que foi acordado (mudança vinda de outro computador)
  const ativo = document.activeElement;
  const digitando = !!(deFora && ativo && ativo.closest && ativo.closest('.bs-conv-campos'));
  if (!digitando) bsRenderResultados(lista);
  bsRenderDuplas(lista);
  bsRenderQuestoes(lista);
  bsRenderProvas(lista);
  if (bs.focoObs){
    const el = bsEl(`bso-r-${bs.focoObs}`);
    bs.focoObs = null;
    if (el){ el.focus(); el.scrollIntoView({ block: 'nearest' }); }
  }
}

/* ---------- Resultados ---------- */
function bsRenderResultados(lista){
  const provas = bsProvasDaEdicao();
  const media = lista.length ? (lista.reduce((s, a) => s + a.c.total, 0) / lista.length).toFixed(1).replace('.', ',') : '—';
  const acima = lista.filter(a => a.c.bolsa > Math.min(...lista.map(x => x.c.bolsa))).length;
  bsEl('bs-kpis').innerHTML = [
    ['Alunos corrigidos', lista.length, provas.map(p => `${esc(p.nome.replace(/^Prova d[oa] /, ''))}: ${lista.filter(a => a.prova_id === p.id).length}`).join(' · ') || '—'],
    ['Média de acertos', media, provas.length === 1 ? `de ${provas[0].gabarito.length} questões` : 'em todas as provas'],
    ['Acima da bolsa mínima', lista.length ? acima : '—', 'alunos'],
    ['Conversas feitas', lista.length ? `${lista.filter(a => a.conversa_feita).length}/${lista.length}` : '—', 'com as famílias']
  ].map(([l, v, s]) => `<div class="stat-card"><div class="stat-top"><span class="stat-label">${l}</span></div><div class="stat-value">${v}</div><div class="stat-sub">${s}</div></div>`).join('');

  const valores = [...new Set(provas.flatMap(p => (p.tabela_bolsa || []).map(f => Number(f.bolsa))))].sort((a, b) => a - b);
  const cont = valores.map(v => lista.filter(a => a.c.bolsa === v).length);
  const max = Math.max(1, ...cont);
  const faixaTxt = v => { const f = (provas[0]?.tabela_bolsa || []).find(f => Number(f.bolsa) === v); return f ? (f.min === f.max ? `${f.min}` : `${f.min}–${f.max}`) : ''; };
  bsEl('bs-dist').innerHTML = valores.length ? valores.map((v, i) => `<div class="col" title="${cont[i]} alunos com bolsa de ${v}%">
      <span class="n">${cont[i]}</span><div class="bar" style="height:${Math.max(2, cont[i] / max * 100)}%;opacity:${0.35 + 0.65 * (i + 1) / valores.length}"></div>
      <span class="lbl">${v}%</span><span class="rng">${faixaTxt(v)}</span></div>`).join('') : '<div class="empty-note">Cadastre uma prova com a tabela de bolsa.</div>';

  // o aluno que está aberto continua na lista mesmo que a conversa dele acabe de mudar de situação
  const passaConv = a => bs.convStatus === 'all' || a.id === bs.aberto || (bs.convStatus === 'pend' ? !a.conversa_feita : !!a.conversa_feita);
  let rows = lista.filter(a => (bs.filtroProva === 'all' || a.prova_id === bs.filtroProva) && passaConv(a) && (!bs.busca || bsNorm(a.nome).includes(bs.busca)));
  rows = rows.slice().sort((x, y) => {
    if (bs.sortKey === 'nome') return bs.sortDir * x.nome.localeCompare(y.nome, 'pt');
    if (bs.convStatus === 'feita') return (y.conversa_data || '').localeCompare(x.conversa_data || '') || x.pos - y.pos; // mais recentes primeiro
    return bs.sortDir * (x.pos - y.pos) * -1;
  });
  bsEl('bs-shown').textContent = rows.length;
  bsEl('bs-tbody').innerHTML = rows.map(a => {
    const flags = (a.c.duplas ? `<span class="bs-flag">marcou duas</span>` : '') + (a.c.brancos ? `<span class="bs-flag soft">${a.c.brancos} em branco</span>` : '');
    const conversa = a.conversa_feita
      ? `<span class="bs-flag done" title="${a.conversa_obs ? esc(a.conversa_obs) : 'Sem observação registrada'}">✓ ${a.conversa_data ? bsData(a.conversa_data) : 'sem data'}</span>${a.conversa_obs ? '<div class="bs-conv-previa">' + esc(a.conversa_obs) + '</div>' : ''}`
      : `<label class="bs-chk"><input type="checkbox" data-bs-conv-check="${a.id}" aria-label="Marcar conversa com a família de ${esc(a.nome)} como realizada"><span>A conversar</span></label>`;
    const areas = Object.entries(a.c.porArea).map(([k, v]) => `${bsAbrevArea(k)} ${v.ok}/${v.n}`).join(' · ');
    const linha = `<tr data-bs-id="${a.id}" tabindex="0" aria-expanded="${bs.aberto === a.id}">
      <td class="num pos">${a.pos}º</td>
      <td><span class="nome">${esc(a.nome)}</span>${flags}<div class="p-sub" style="font-size:11.5px;color:var(--text-faint)">${esc(a.turma_marcada || 'Turma não marcada')}</div></td>
      <td><span class="bs-prova-tag">${esc(a.c.prova.nome.replace(/^Prova d[oa] /, ''))}</span></td>
      <td class="areas">${areas}</td>
      <td class="num bs-total">${a.c.total}</td>
      <td class="num">${bsBolsaTag(a.c.bolsa)}</td>
      <td class="bs-conv-cel">${conversa}</td></tr>`;
    return linha + (bs.aberto === a.id ? `<tr class="bs-detail"><td colspan="7">${bsDetalhe(a, lista)}</td></tr>` : '');
  }).join('') || `<tr><td colspan="7"><div class="empty-note">${lista.length ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado nesta edição. Use “Adicionar aluno”.'}</div></td></tr>`;
  bsAjustarLargura();
}
function bsAjustarLargura(){
  const box = bsEl('bs-tbody').closest('.table-scroll');
  if (box && box.clientWidth) bsEl('bs-tbody').closest('table').style.setProperty('--bs-cw', box.clientWidth + 'px');
}
/* a seção começa escondida: mede a largura assim que ela aparece e a cada mudança de tamanho da tela */
(() => { const box = bsEl('bs-tbody').closest('.table-scroll'); if (box && window.ResizeObserver) new ResizeObserver(bsAjustarLargura).observe(box); })();

function bsDetalhe(a, lista){
  const p = a.c.prova;
  const colegas = lista.filter(x => x.prova_id === p.id);
  // agrupa as questões por assunto
  const grupos = {};
  for (let q = 1; q <= a.c.n; q++){
    const t = bsTema(p, q);
    const k = t.area + '|' + t.assunto;
    grupos[k] = grupos[k] || { area: t.area, nome: t.assunto, qs: [] };
    grupos[k].qs.push({ q, conteudo: t.conteudo });
  }
  const temas = Object.values(grupos).map(g => {
    const ok = g.qs.filter(x => a.c.marks[x.q - 1].ok).length;
    const okTurma = colegas.reduce((s, c) => s + g.qs.filter(x => c.c.marks[x.q - 1].ok).length, 0);
    return { ...g, ok, n: g.qs.length, pct: Math.round(ok / g.qs.length * 100),
             mediaPct: colegas.length ? Math.round(okTurma / (colegas.length * g.qs.length) * 100) : 0,
             erradas: g.qs.filter(x => !a.c.marks[x.q - 1].ok) };
  });
  const fracos = temas.filter(t => t.erradas.length && t.pct < 50).sort((x, y) => x.pct - y.pct || y.n - x.n);
  const fortes = temas.filter(t => t.pct >= 67 && t.n >= 2).sort((x, y) => y.pct - x.pct || y.n - x.n);
  const lst = arr => arr.map(t => `<b>${esc(t.nome)}</b> (${t.ok} de ${t.n})`).join(', ').replace(/, ([^,]*)$/, ' e $1');
  const areas = Object.entries(a.c.porArea);
  let frase = '';
  if (areas.length === 2){
    const [[n1, v1], [n2, v2]] = areas, p1 = v1.ok / v1.n, p2 = v2.ok / v2.n;
    frase = Math.abs(p1 - p2) >= 0.15 ? `Foi melhor em ${p1 > p2 ? n1 : n2} (${p1 > p2 ? v1.ok + '/' + v1.n : v2.ok + '/' + v2.n}) do que em ${p1 > p2 ? n2 : n1} (${p1 > p2 ? v2.ok + '/' + v2.n : v1.ok + '/' + v1.n}).`
      : `Desempenho parecido em ${n1} (${v1.ok}/${v1.n}) e ${n2} (${v2.ok}/${v2.n}).`;
  } else frase = `Acertou ${a.c.total} de ${a.c.n} questões.`;
  if (fracos.length) frase += ` Maiores dificuldades: ${lst(fracos.slice(0, 3))}.`;
  if (fortes.length) frase += ` Pontos fortes: ${lst(fortes.slice(0, 2))}.`;
  if (!fracos.length && !fortes.length) frase += ' Os erros estão espalhados entre os assuntos, sem um ponto fraco concentrado.';

  const linhaTema = t => {
    const cor = t.pct >= 67 ? 'var(--success)' : t.pct >= 34 ? 'var(--warning)' : 'var(--critical)';
    const err = t.erradas.length ? 'Errou: ' + t.erradas.map(x => `Q${bsQ(x.q)}${x.conteudo ? ' ' + esc(x.conteudo) : ''}${a.c.marks[x.q - 1].vazio ? (a.c.marks[x.q - 1].dupla ? ' (dupla)' : ' (em branco)') : ''}`).join(' · ') : 'Acertou todas';
    return `<div class="bs-tema"><div class="bs-tema-top"><span>${esc(t.nome)}</span><b>${t.ok}/${t.n}</b></div>
      <div class="bs-track" title="Média de quem fez esta prova: ${t.mediaPct}%"><div class="bs-fill" style="width:${Math.max(t.pct, 2)}%;background:${cor}"></div><span class="bs-media" style="left:${t.mediaPct}%"></span></div>
      <div class="bs-tema-err">${err}</div></div>`;
  };
  const nomesArea = [...new Set(temas.map(t => t.area))];
  const blocos = nomesArea.map(ar => `<div class="bs-area"><div class="bs-label">${esc(ar)}</div>${temas.filter(t => t.area === ar).map(linhaTema).join('')}</div>`).join('');

  const g = p.gabarito;
  const cell = (m, i) => { const cls = m.vazio ? 'nx' : m.ok ? 'ok' : 'no'; const s = m.branco ? '–' : m.dupla ? '2×' : m.r.toUpperCase();
    return `<div class="bs-q ${cls}" title="Q${i + 1} (${esc(bsTema(p, i + 1).conteudo || bsTema(p, i + 1).assunto)}): marcou ${s}, gabarito ${g[i].toUpperCase()}"><i>${bsQ(i + 1)}</i>${s}</div>`; };
  const conv = a.conversa_feita
    ? `<div class="bs-conv-feita"><div class="bs-conv-box"><span>Conversa com a família <b>realizada</b>.</span><button type="button" class="btn btn-ghost" data-bs-conv-off="${a.id}">Desmarcar conversa</button></div>${bsConvCampos(a, 'r')}</div>`
    : `<div class="bs-conv-box"><span>Conversa com a família ainda não realizada.</span><button type="button" class="btn btn-primary" data-bs-conv-on="${a.id}">Marcar conversa como realizada</button></div>`;
  return `<div class="bs-detail-body">
    <div class="bs-topo">${bsValorHtml(a)}${conv}</div>
    <p class="bs-resumo">${frase}</p>
    <div class="bs-areas">${blocos}</div>
    <p class="bs-note">A barra mostra o aproveitamento do aluno em cada assunto; o traço vertical marca a média de todos que fizeram a ${esc(p.nome.replace(/^Prova /, 'prova '))}.</p>
    <div class="bs-label">Respostas marcadas</div>
    <div class="table-scroll"><div class="bs-grid">${a.c.marks.map(cell).join('')}</div></div>
    <div class="filter-row" style="justify-content:space-between"><span class="bs-note">Folha: ${esc(a.fonte || '—')}${a.contato ? ' · Contato: ' + esc(a.contato) : ''}${a.observacoes ? ' · ' + esc(a.observacoes) : ''}</span>
      <button type="button" class="btn btn-ghost" data-bs-edit-aluno="${a.id}">Editar aluno e respostas</button></div>
  </div>`;
}

/* ---------- Marcações duplas e brancos ---------- */
function bsRenderDuplas(lista){
  const comDupla = lista.filter(a => a.c.duplas);
  bsEl('bs-dup-cards').innerHTML = comDupla.map(a => {
    const qs = a.c.marks.map((m, i) => ({ m, q: i + 1 })).filter(x => x.m.dupla);
    return `<article class="bs-card alerta"><div><h3>${esc(a.nome)}</h3><div class="meta">${esc(a.c.prova.nome)} · ${esc(a.fonte || '')}</div></div>
      <div class="bs-dq">${qs.map(x => `<b>Q${bsQ(x.q)}</b><span>marcou duas alternativas · gabarito ${a.c.prova.gabarito[x.q - 1].toUpperCase()}</span>`).join('')}</div>
      <div class="bs-conv-box" style="padding:8px 12px">${qs.length === 1 ? 'A questão conta' : 'As ' + qs.length + ' questões contam'} como erro. Total: <b>${a.c.total} acertos (${a.c.bolsa}%)</b></div></article>`;
  }).join('') || '<div class="empty-note">Nenhum aluno marcou duas alternativas nesta edição.</div>';
  const brancos = lista.filter(a => a.c.brancos);
  bsEl('bs-brancos').innerHTML = brancos.map(a => `<li><span><b>${esc(a.nome)}</b> <span class="info">· ${esc(a.c.prova.nome)}</span></span><span class="info">${a.c.marks.map((m, i) => m.branco ? 'Q' + bsQ(i + 1) : '').filter(Boolean).join(', ')}</span></li>`).join('')
    || '<li><span class="vazio">Nenhuma questão em branco nesta edição.</span></li>';
}

/* ---------- Conversa com a família ---------- */
/* data da conversa e "o que foi acordado", dentro do aluno aberto em Resultados.
   pref compõe o id dos campos ('r' = detalhe do aluno) */
function bsConvCampos(a, pref){
  return `<div class="bs-conv-campos">
    <div class="form-field"><label for="bsd-${pref}-${a.id}">Data da conversa</label>
      <input type="date" id="bsd-${pref}-${a.id}" data-bs-data="${a.id}" value="${esc(a.conversa_data || '')}"></div>
    <div class="form-field"><label for="bso-${pref}-${a.id}">O que foi acordado</label>
      <textarea id="bso-${pref}-${a.id}" data-bs-obs="${a.id}" rows="3" placeholder="Ex.: família vai matricular o aluno em janeiro; pediu desconto no material; retornar a ligação na sexta…">${esc(a.conversa_obs || '')}</textarea></div>
  </div>`;
}
/* salva a data ou a observação assim que a pessoa sai do campo */
function bsEditarConv(el){
  const dEl = el.closest('[data-bs-data]'), oEl = el.closest('[data-bs-obs]');
  const campoEl = dEl || oEl; if (!campoEl) return false;
  const id = dEl ? dEl.dataset.bsData : oEl.dataset.bsObs;
  const a = bs.alunos.find(x => x.id === id); if (!a) return true;
  const campo = dEl ? 'conversa_data' : 'conversa_obs';
  const valor = (dEl ? campoEl.value : campoEl.value.trim()) || null;
  if ((a[campo] || null) === valor) return true;
  const antes = a[campo]; a[campo] = valor;
  bsSalvarAluno(id, { [campo]: valor }, () => { a[campo] = antes; });
  if (dEl) bsRenderTudo(); // a lista é ordenada pela data da conversa
  return true;
}
async function bsSalvarAluno(id, campos, desfazer){
  const { error } = await supabase.from('bolsao_alunos').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', id);
  if (error){
    console.error('Erro ao salvar no Bolsão:', error);
    if (desfazer) desfazer();
    bsAviso('Não foi possível salvar agora. Verifique a internet e tente de novo.');
    bsRenderTudo();
    return false;
  }
  bsAviso('');
  return true;
}
function bsConversa(id, feita){
  const a = bs.alunos.find(x => x.id === id); if (!a) return;
  const antes = { conversa_feita: a.conversa_feita, conversa_data: a.conversa_data, conversa_obs: a.conversa_obs };
  const novo = feita ? { conversa_feita: true, conversa_data: bsHoje() } : { conversa_feita: false, conversa_data: null, conversa_obs: null };
  Object.assign(a, novo);
  if (feita){ bs.aberto = id; bs.focoObs = id; } // abre o aluno e deixa o cursor em "O que foi acordado"
  bsRenderTudo();
  bsSalvarAluno(id, novo, () => Object.assign(a, antes));
}

/* ---------- Por questão ---------- */
function bsRenderQuestoes(lista){
  bsEl('bs-qcharts').innerHTML = bsProvasDaEdicao().map(p => {
    const al = lista.filter(a => a.prova_id === p.id);
    let areaAnt = null;
    const linhas = [...p.gabarito].map((gq, i) => {
      const t = bsTema(p, i + 1);
      const pct = al.length ? Math.round(al.filter(a => a.c.marks[i].ok).length / al.length * 100) : 0;
      const cab = t.area !== areaAnt ? `<div class="bs-label" style="margin-top:${areaAnt ? 8 : 0}px">${esc(t.area)}</div>` : '';
      areaAnt = t.area;
      return cab + `<div class="bs-qrow ${al.length && pct < 25 ? 'low' : ''}" title="${esc(t.conteudo || t.assunto)}"><b>Q${bsQ(i + 1)}</b><span class="g">${gq.toUpperCase()}</span><div class="t"><div class="f" style="width:${Math.max(pct, 1)}%"></div></div><span class="pct">${pct}%</span></div>`;
    }).join('');
    return `<div class="panel"><div class="panel-head"><h2>${esc(p.nome)} <span class="count-chip">${al.length} alunos</span></h2></div><div class="bs-qchart">${linhas}</div></div>`;
  }).join('') || '<div class="empty-note">Nenhuma prova nesta edição.</div>';
}

/* ---------- Provas e gabaritos ---------- */
function bsRenderProvas(lista){
  bsEl('bs-prova-cards').innerHTML = bsProvasDaEdicao().map(p => {
    const n = lista.filter(a => a.prova_id === p.id).length;
    const conf = bs.confirmExcluir === p.id;
    return `<article class="bs-card"><div><h3>${esc(p.nome)}</h3><div class="meta">${esc(p.edicao)}${p.data_aplicacao ? ' · aplicada em ' + bsData(p.data_aplicacao) : ''} · ${p.gabarito.length} questões · ${n} alunos${(p.turmas || []).length ? ' · turmas: ' + esc(p.turmas.join(', ')) : ''}</div></div>
      <div class="bs-label">Gabarito</div>
      <div class="bs-keygrid">${[...p.gabarito].map((g, i) => `<div class="bs-key"><span>${bsQ(i + 1)}</span><b>${g.toUpperCase()}</b></div>`).join('')}</div>
      <div class="bs-label">Tabela de bolsa</div>
      <div class="bs-faixas">${(p.tabela_bolsa || []).map(f => { const v = bsCurso(p, Number(f.bolsa)); return `<span>${f.min === f.max ? f.min : f.min + ' a ' + f.max} acertos: <b>${f.bolsa}%</b>${v ? ' · ' + bsBRL(v.parcela) : ''}</span>`; }).join('') || '<span>Sem tabela</span>'}</div>
      <div class="bs-note">${p.valor_parcela != null ? 'Curso: ' + bsBRL(Math.round(Number(p.valor_parcela) * 100)) + ' por parcela, em ' + (p.num_parcelas || 10) + ' parcelas (integral).' : 'Valor do curso ainda não cadastrado. Use “Editar prova”.'}</div>
      <div class="bs-card-actions">
        <button type="button" class="btn btn-ghost" data-bs-edit-prova="${p.id}">Editar prova</button>
        ${conf ? `<button type="button" class="btn btn-danger" data-bs-del-prova-ok="${p.id}">Confirmar: excluir prova e ${n} alunos</button><button type="button" class="btn btn-ghost" data-bs-del-prova-cancel>Cancelar</button>`
               : `<button type="button" class="btn btn-danger" data-bs-del-prova="${p.id}">Excluir</button>`}
      </div></article>`;
  }).join('') || '<div class="empty-note">Nenhuma prova cadastrada. Use “Nova prova”.</div>';
}

/* ---------- janela da prova ---------- */
function bsAbrirProva(id){
  const p = id ? bsProva(id) : null;
  bs.editProva = p ? p.id : null;
  bsEl('bs-prova-titulo').textContent = p ? 'Editar prova' : 'Nova prova';
  const edicoes = [...new Set(bs.provas.map(x => x.edicao))];
  bsEl('bp-edicoes').innerHTML = edicoes.map(e => `<option value="${esc(e)}">`).join('');
  bsEl('bp-edicao').value = p ? p.edicao : (bs.edicao || '');
  bsEl('bp-nome').value = p ? p.nome : '';
  bsEl('bp-data').value = p && p.data_aplicacao ? p.data_aplicacao : '';
  bsEl('bp-turmas').value = p ? (p.turmas || []).join(', ') : '';
  bsEl('bp-n').value = p ? p.gabarito.length : 30;
  bsEl('bp-valor').value = p && p.valor_parcela != null ? Number(p.valor_parcela).toFixed(2).replace('.', ',') : '';
  bsEl('bp-parcelas').value = p && p.num_parcelas ? p.num_parcelas : 10;
  bsEl('bp-copiar').innerHTML = '<option value="">Não copiar</option>' + bs.provas.filter(x => !p || x.id !== p.id).map(x => `<option value="${x.id}">${esc(x.edicao)} · ${esc(x.nome)}</option>`).join('');
  bsEl('bp-qbody').innerHTML = '';
  bsMontarQuestoes(p ? p.gabarito.length : 30, p);
  bsMontarFaixas(p ? p.tabela_bolsa : BS_FAIXAS_PADRAO);
  bsEl('bp-msg').textContent = ''; bsEl('bp-msg').className = 'bs-msg';
  bsEl('bs-prova-modal').hidden = false;
  bsEl('bp-edicao').focus();
}
function bsLerQuestoes(){
  return [...bsEl('bp-qbody').querySelectorAll('tr')].map((tr, i) => ({
    q: i + 1, g: tr.querySelector('[data-k=g]').value,
    area: tr.querySelector('[data-k=area]').value.trim(), assunto: tr.querySelector('[data-k=assunto]').value.trim(), conteudo: tr.querySelector('[data-k=conteudo]').value.trim() }));
}
function bsMontarQuestoes(n, fonte){
  const atuais = bsEl('bp-qbody').children.length ? bsLerQuestoes() : [];
  const linhas = [];
  for (let q = 1; q <= n; q++){
    const t = fonte ? bsTema(fonte, q) : null;
    const prev = atuais[q - 1];
    const g = fonte && fonte.gabarito && fonte.gabarito[q - 1] ? fonte.gabarito[q - 1] : (prev ? prev.g : '');
    const area = t && t.area !== 'Geral' ? t.area : (prev ? prev.area : (q <= Math.ceil(n / 2) ? 'Português' : 'Matemática'));
    const assunto = t && t.assunto !== 'Sem assunto definido' ? t.assunto : (prev ? prev.assunto : '');
    const conteudo = t ? t.conteudo : (prev ? prev.conteudo : '');
    linhas.push(`<tr><td class="qn">${bsQ(q)}</td>
      <td><select data-k="g" aria-label="Resposta da questão ${q}"><option value="">—</option>${'abcde'.split('').map(l => `<option value="${l}" ${l === g ? 'selected' : ''}>${l.toUpperCase()}</option>`).join('')}</select></td>
      <td><input data-k="area" list="bp-areas" value="${esc(area)}" aria-label="Área da questão ${q}"></td>
      <td><input data-k="assunto" list="bp-assuntos" value="${esc(assunto)}" aria-label="Assunto da questão ${q}"></td>
      <td><input data-k="conteudo" value="${esc(conteudo)}" aria-label="Conteúdo da questão ${q}"></td></tr>`);
  }
  bsEl('bp-qbody').innerHTML = linhas.join('');
  const assuntos = [...new Set(bs.provas.flatMap(p => (p.temas || []).map(t => t.assunto)).filter(Boolean))];
  bsEl('bp-assuntos').innerHTML = assuntos.map(a => `<option value="${esc(a)}">`).join('');
}
function bsMontarFaixas(faixas){
  bsEl('bp-faixas').innerHTML = (faixas || []).map((f, i) => `<div class="bs-faixa-row">
    <div class="form-field"><label>De (acertos)</label><input type="number" min="0" data-f="min" value="${f.min}"></div>
    <div class="form-field"><label>Até (acertos)</label><input type="number" min="0" data-f="max" value="${f.max}"></div>
    <div class="form-field"><label>Bolsa (%)</label><input type="number" min="0" max="100" data-f="bolsa" value="${f.bolsa}"></div>
    <button type="button" class="btn btn-ghost" data-bp-del-faixa="${i}" aria-label="Remover faixa">Remover</button></div>`).join('');
}
function bsLerFaixas(){
  return [...bsEl('bp-faixas').querySelectorAll('.bs-faixa-row')].map(r => ({
    min: Number(r.querySelector('[data-f=min]').value), max: Number(r.querySelector('[data-f=max]').value), bolsa: Number(r.querySelector('[data-f=bolsa]').value) }));
}
async function bsSalvarProva(e){
  e.preventDefault();
  const msg = bsEl('bp-msg');
  const qs = bsLerQuestoes();
  const faixas = bsLerFaixas().sort((a, b) => a.min - b.min);
  const dados = {
    edicao: bsEl('bp-edicao').value.trim(), nome: bsEl('bp-nome').value.trim(),
    data_aplicacao: bsEl('bp-data').value || null,
    turmas: bsEl('bp-turmas').value.split(',').map(s => s.trim()).filter(Boolean),
    gabarito: qs.map(x => x.g).join(''),
    temas: qs.map(x => ({ q: x.q, area: x.area || 'Geral', assunto: x.assunto || 'Sem assunto definido', conteudo: x.conteudo })),
    tabela_bolsa: faixas, updated_at: new Date().toISOString(),
    valor_parcela: null, num_parcelas: Math.max(1, Math.round(Number(bsEl('bp-parcelas').value) || 10))
  };
  const textoValor = bsEl('bp-valor').value.trim().replace(/^R\$\s*/i, '').replace(/\./g, '').replace(',', '.');
  const valor = textoValor === '' ? null : Number(textoValor);
  if (valor !== null && isFinite(valor) && valor >= 0) dados.valor_parcela = Math.round(valor * 100) / 100;
  const faltando = qs.filter(x => !x.g).map(x => x.q);
  let erro = '';
  if (valor !== null && !(isFinite(valor) && valor >= 0)) erro = 'O valor da parcela precisa ser um número, por exemplo 418,00.';
  if (!dados.edicao) erro = 'Informe a edição do bolsão (ex.: Bolsão 2028).';
  else if (!dados.nome) erro = 'Informe o nome da prova.';
  else if (faltando.length) erro = `Escolha a resposta certa das questões ${faltando.slice(0, 8).join(', ')}${faltando.length > 8 ? '…' : ''}.`;
  else if (faixas.some(f => isNaN(f.min) || isNaN(f.max) || isNaN(f.bolsa) || f.min > f.max)) erro = 'Revise a tabela de bolsa: cada faixa precisa de “de”, “até” e porcentagem.';
  if (erro){ msg.textContent = erro; msg.className = 'bs-msg err'; return; }
  const btn = bsEl('bp-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
  const r = bs.editProva
    ? await supabase.from('bolsao_provas').update(dados).eq('id', bs.editProva)
    : await supabase.from('bolsao_provas').insert(dados);
  btn.disabled = false; btn.textContent = 'Salvar prova';
  if (r.error){ console.error(r.error); msg.textContent = 'Não foi possível salvar a prova. Verifique a internet e tente de novo.'; msg.className = 'bs-msg err'; return; }
  bs.edicao = dados.edicao; try { localStorage.setItem('percurso_bolsao_edicao', bs.edicao); } catch(err){}
  bsEl('bs-prova-modal').hidden = true;
  await bsCarregar();
}

/* ---------- janela do aluno ---------- */
function bsAbrirAluno(id){
  const a = id ? bs.alunos.find(x => x.id === id) : null;
  const provas = bsProvasDaEdicao();
  if (!provas.length){ bsAviso('Cadastre uma prova nesta edição antes de adicionar alunos (aba “Provas e gabaritos”).'); return; }
  bs.editAluno = a ? a.id : null;
  bsEl('bs-aluno-titulo').textContent = a ? 'Editar aluno' : 'Adicionar aluno';
  bsEl('ba-prova').innerHTML = provas.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');
  bsEl('ba-prova').value = a ? a.prova_id : (bs.filtroProva !== 'all' ? bs.filtroProva : provas[0].id);
  bsEl('ba-nome').value = a ? a.nome : '';
  bsEl('ba-turma').value = a ? (a.turma_marcada || '') : '';
  bsEl('ba-contato').value = a ? (a.contato || '') : '';
  bsEl('ba-fonte').value = a ? (a.fonte || '') : '';
  bsEl('ba-obs').value = a ? (a.observacoes || '') : '';
  bsEl('ba-colar').value = '';
  bs.respostas = a ? [...(a.respostas || '')] : [];
  bsEl('ba-excluir').hidden = !a; bsEl('ba-excluir').textContent = 'Excluir aluno'; bs.confirmExcluirAluno = false;
  bsEl('ba-msg').textContent = ''; bsEl('ba-msg').className = 'bs-msg';
  bsMontarRespostas();
  bsEl('bs-aluno-modal').hidden = false;
  bsEl('ba-nome').focus();
}
function bsMontarRespostas(){
  const p = bsProva(bsEl('ba-prova').value); if (!p) return;
  const n = p.gabarito.length;
  bs.respostas = Array.from({ length: n }, (_, i) => bs.respostas[i] || '_');
  bsEl('ba-turmas').innerHTML = [...new Set([...(p.turmas || []), 'Não marcou'])].map(t => `<option value="${esc(t)}">`).join('');
  bsEl('ba-resp').innerHTML = bs.respostas.map((r, i) => `<div class="bs-resp-row" data-q="${i}"><span class="qn">${bsQ(i + 1)}</span>
    ${'abcde'.split('').map(l => `<button type="button" data-l="${l}" class="${r === l ? 'on' : ''}" aria-label="Questão ${i + 1}: ${l.toUpperCase()}" aria-pressed="${r === l}">${l.toUpperCase()}</button>`).join('')}
    <button type="button" data-l="*" class="dup ${r === '*' ? 'on' : ''}" aria-label="Questão ${i + 1}: marcou duas" aria-pressed="${r === '*'}">2×</button></div>`).join('');
  bsPlacar();
}
function bsPlacar(){
  const p = bsProva(bsEl('ba-prova').value); if (!p) return;
  const tot = bs.respostas.filter((r, i) => r === p.gabarito[i]).length;
  const brancos = bs.respostas.filter(r => r === '_').length;
  bsEl('ba-placar').innerHTML = `<b>${tot}</b> de ${p.gabarito.length} acertos · bolsa <b>${bsBolsa(p, tot)}%</b>${brancos ? ` · ${brancos} em branco` : ''}`;
}
async function bsSalvarAlunoForm(e){
  e.preventDefault();
  const msg = bsEl('ba-msg');
  const dados = {
    nome: bsEl('ba-nome').value.trim(), prova_id: bsEl('ba-prova').value,
    turma_marcada: bsEl('ba-turma').value.trim() || null, contato: bsEl('ba-contato').value.trim() || null,
    fonte: bsEl('ba-fonte').value.trim() || null, observacoes: bsEl('ba-obs').value.trim() || null,
    respostas: bs.respostas.join(''), updated_at: new Date().toISOString()
  };
  if (!dados.nome){ msg.textContent = 'Informe o nome do aluno.'; msg.className = 'bs-msg err'; return; }
  const btn = bsEl('ba-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
  const r = bs.editAluno
    ? await supabase.from('bolsao_alunos').update(dados).eq('id', bs.editAluno).select().single()
    : await supabase.from('bolsao_alunos').insert(dados).select().single();
  btn.disabled = false; btn.textContent = 'Salvar aluno';
  if (r.error){ console.error(r.error); msg.textContent = 'Não foi possível salvar o aluno. Verifique a internet e tente de novo.'; msg.className = 'bs-msg err'; return; }
  const i = bs.alunos.findIndex(x => x.id === r.data.id);
  if (i === -1) bs.alunos.push(r.data); else bs.alunos[i] = r.data;
  bs.aberto = r.data.id;
  bsEl('bs-aluno-modal').hidden = true;
  bsRenderTudo();
}
async function bsExcluirAluno(){
  const b = bsEl('ba-excluir');
  if (!bs.confirmExcluirAluno){ bs.confirmExcluirAluno = true; b.textContent = 'Clique de novo para confirmar a exclusão'; return; }
  const { error } = await supabase.from('bolsao_alunos').delete().eq('id', bs.editAluno);
  if (error){ console.error(error); bsEl('ba-msg').textContent = 'Não foi possível excluir. Tente de novo.'; bsEl('ba-msg').className = 'bs-msg err'; return; }
  bs.alunos = bs.alunos.filter(x => x.id !== bs.editAluno);
  bsEl('bs-aluno-modal').hidden = true;
  bsRenderTudo();
}

/* ---------- eventos ---------- */
function bsLigarEventos(){
  document.querySelectorAll('[data-bs-tab]').forEach(b => b.addEventListener('click', () => {
    bs.aba = b.dataset.bsTab;
    document.querySelectorAll('[data-bs-tab]').forEach(x => x.classList.toggle('active', x === b));
    ['res', 'dup', 'q', 'provas'].forEach(k => bsEl('bs-' + k).hidden = k !== bs.aba);
  }));
  bsEl('bs-edicao').addEventListener('change', e => {
    bs.edicao = e.target.value; bs.aberto = null; bs.filtroProva = 'all'; bs.convStatus = 'all';
    try { localStorage.setItem('percurso_bolsao_edicao', bs.edicao); } catch(err){}
    bsRenderTudo();
  });
  bsEl('bs-filtro-prova').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b){ bs.filtroProva = b.dataset.v; bsRenderTudo(); } });
  bsEl('bs-filtro-conv').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b){ bs.convStatus = b.dataset.v; bs.aberto = null; bsRenderTudo(); } });
  bsEl('bs-busca').addEventListener('input', e => { bs.busca = bsNorm(e.target.value.trim()); bsRenderTudo(); });
  document.querySelectorAll('[data-bs-sort]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.bsSort;
    if (bs.sortKey === k) bs.sortDir *= -1; else { bs.sortKey = k; bs.sortDir = k === 'nome' ? 1 : -1; }
    document.querySelectorAll('[data-bs-sort]').forEach(x => x.textContent = x.textContent.replace(/ [▲▼]$/, ''));
    b.textContent += bs.sortDir < 0 ? ' ▼' : ' ▲';
    bsRenderTudo();
  }));
  const tbody = bsEl('bs-tbody');
  const alternar = tr => { const id = tr.dataset.bsId; bs.aberto = bs.aberto === id ? null : id; bsRenderTudo(); const de = tbody.querySelector(`tr[data-bs-id="${id}"]`); if (de) de.focus(); };
  tbody.addEventListener('click', e => {
    // caixinha "A conversar": marca a conversa como realizada (o clique no texto da caixinha chega aqui duas vezes; só o da caixinha conta)
    const chk = e.target.closest('.bs-chk');
    if (chk){ const inp = e.target.closest('input[data-bs-conv-check]'); if (inp) bsConversa(inp.dataset.bsConvCheck, true); return; }
    const on = e.target.closest('[data-bs-conv-on]'), off = e.target.closest('[data-bs-conv-off]'), ed = e.target.closest('[data-bs-edit-aluno]');
    if (on) return bsConversa(on.dataset.bsConvOn, true);
    if (off) return bsConversa(off.dataset.bsConvOff, false);
    if (ed) return bsAbrirAluno(ed.dataset.bsEditAluno);
    const tr = e.target.closest('tr[data-bs-id]'); if (tr) alternar(tr);
  });
  tbody.addEventListener('keydown', e => { const tr = e.target.closest('tr[data-bs-id]'); if (tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); alternar(tr); } });
  tbody.addEventListener('change', e => bsEditarConv(e.target));
  bsEl('bs-add-aluno').addEventListener('click', () => bsAbrirAluno(null));
  bsEl('bs-add-prova').addEventListener('click', () => bsAbrirProva(null));
  bsEl('bs-prova-cards').addEventListener('click', async e => {
    const ed = e.target.closest('[data-bs-edit-prova]'), del = e.target.closest('[data-bs-del-prova]'),
          ok = e.target.closest('[data-bs-del-prova-ok]'), cancel = e.target.closest('[data-bs-del-prova-cancel]');
    if (ed) return bsAbrirProva(ed.dataset.bsEditProva);
    if (del){ bs.confirmExcluir = del.dataset.bsDelProva; return bsRenderTudo(); }
    if (cancel){ bs.confirmExcluir = null; return bsRenderTudo(); }
    if (ok){
      const { error } = await supabase.from('bolsao_provas').delete().eq('id', ok.dataset.bsDelProvaOk);
      bs.confirmExcluir = null;
      if (error){ console.error(error); bsAviso('Não foi possível excluir a prova. Tente de novo.'); }
      await bsCarregar();
    }
  });
  // janelas
  document.querySelectorAll('.bs-modal-bg').forEach(bg => {
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-bs-close]')) bg.hidden = true; });
    bg.addEventListener('keydown', e => { if (e.key === 'Escape') bg.hidden = true; });
  });
  bsEl('bs-prova-form').addEventListener('submit', bsSalvarProva);
  bsEl('bp-n').addEventListener('change', e => { const n = Math.max(1, Math.min(120, Number(e.target.value) || 30)); e.target.value = n; bsMontarQuestoes(n, null); });
  bsEl('bp-copiar').addEventListener('change', e => {
    const src = bsProva(e.target.value); if (!src) return;
    // copia assuntos e tabela; as respostas já marcadas nesta prova continuam
    const n = Number(bsEl('bp-n').value) || src.gabarito.length;
    bsMontarQuestoes(n, { ...src, gabarito: '' });
    bsMontarFaixas(src.tabela_bolsa);
  });
  bsEl('bp-add-faixa').addEventListener('click', () => { const f = bsLerFaixas(); const ult = f[f.length - 1]; f.push({ min: ult ? ult.max + 1 : 0, max: ult ? ult.max + 1 : 0, bolsa: 0 }); bsMontarFaixas(f); });
  bsEl('bp-faixas').addEventListener('click', e => { const b = e.target.closest('[data-bp-del-faixa]'); if (b){ const f = bsLerFaixas(); f.splice(Number(b.dataset.bpDelFaixa), 1); bsMontarFaixas(f); } });
  bsEl('bs-aluno-form').addEventListener('submit', bsSalvarAlunoForm);
  bsEl('ba-prova').addEventListener('change', bsMontarRespostas);
  bsEl('ba-resp').addEventListener('click', e => {
    const b = e.target.closest('button[data-l]'); if (!b) return;
    const i = Number(b.closest('[data-q]').dataset.q);
    bs.respostas[i] = bs.respostas[i] === b.dataset.l ? '_' : b.dataset.l;
    b.closest('[data-q]').querySelectorAll('button').forEach(x => { const on = bs.respostas[i] === x.dataset.l; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    bsPlacar();
  });
  bsEl('ba-colar').addEventListener('input', e => {
    const s = e.target.value.toLowerCase().replace(/[^a-e_*?\-]/g, '').replace(/[?]/g, '*').replace(/-/g, '_');
    if (!s) return;
    bs.respostas = [...s]; bsMontarRespostas();
  });
  bsEl('ba-excluir').addEventListener('click', bsExcluirAluno);
}
