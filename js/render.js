/* ===================== render: stat cards ===================== */
function personCellHTML(s) {
  return `<div class="person-cell">
    <div class="avatar" style="background:${colorFor(s.nome)}">${esc(initials(s.nome))}</div>
    <div><div class="p-name">${esc(s.nome)}</div><div class="p-sub">${esc(s.bairro ? s.bairro + ", " : "")}${esc(s.cidade || "—")}</div></div>
  </div>`;
}

function presAvatarHTML(s, size) {
  size = size || 32;
  const style = `width:${size}px;height:${size}px;font-size:${Math.max(10, Math.round(size * 0.38))}px;background:${colorFor(s.nome)}`;
  // a foto só é buscada quando o avatar aparece na tela (ver observarAvatares)
  const foto = s.fotoUrl ? ` data-foto-aluno="${esc(s.id)}" data-foto-orig="${esc(s.fotoUrl)}"` : "";
  if (s.fotoUrl) agendarScanFotos();
  return `<div class="avatar" style="${style}"${foto}>${esc(initials(s.nome))}</div>`;
}

const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function renderPresencas() {
  const search = (byId("presenca-search-input").value || "").toLowerCase();
  const turmaFilter = byId("presenca-filter-turma").value;
  const nivelFilter = byId("presenca-filter-nivel").value;
  const sortBy = byId("presenca-sort").value;

  const rows = students
    .filter(s => s.status === "ativo")
    .map(s => {
      const sum = presencaSummaryByAluno.get(s.id);
      const presencasN = sum ? sum.presencas : 0;
      const faltasN = sum ? sum.faltas : 0;
      const total = presencasN + faltasN;
      const pct = total ? Math.round((presencasN / total) * 1000) / 10 : null;
      return { s, presencasN, faltasN, total, pct, level: total ? freqLevel(pct) : "" };
    })
    .filter(r => r.total > 0);

  // ---- estatísticas gerais (sempre sobre a base completa, não filtrada) ----
  const totalAulas = presencasTotal;
  const mediaGeral = rows.length ? Math.round((rows.reduce((a, r) => a + r.pct, 0) / rows.length) * 10) / 10 : null;
  const criticos = rows.filter(r => r.level === "critica").length;
  byId("pres-stat-media").textContent = mediaGeral !== null ? mediaGeral.toString().replace(".", ",") + "%" : "—";
  byId("pres-stat-media-sub").textContent = `média entre ${rows.length} alunos ativos`;
  byId("pres-stat-aulas").textContent = totalAulas.toLocaleString("pt-BR");
  byId("pres-stat-criticos").textContent = criticos;

  // ---- filtros da tabela ----
  let filtered = rows.filter(r => {
    if (search && !r.s.nome.toLowerCase().includes(search)) return false;
    if (turmaFilter && r.s.turmaId !== turmaFilter) return false;
    if (nivelFilter && r.level !== nivelFilter) return false;
    return true;
  });

  if (sortBy === "freq-asc") filtered.sort((a, b) => a.pct - b.pct);
  else if (sortBy === "freq-desc") filtered.sort((a, b) => b.pct - a.pct);
  else filtered.sort((a, b) => a.s.nome.localeCompare(b.s.nome, "pt-BR"));

  byId("presenca-count").textContent = filtered.length;
  byId("presenca-body").innerHTML = filtered.map(r => `
    <tr>
      <td><div class="person-cell">${presAvatarHTML(r.s, 32)}<div><div class="p-name">${esc(r.s.nome)}</div></div></div></td>
      <td><span class="turma-tag">${esc(r.s.turmaNome || "—")}</span></td>
      <td class="mono">${r.presencasN}</td>
      <td class="mono">${r.faltasN}</td>
      <td class="mono">${r.total}</td>
      <td>
        <div class="freq-badge">
          <div class="freq-bar ${r.level}"><span style="width:${r.pct}%"></span></div>
          <span class="freq-pct ${r.level}">${r.pct.toString().replace(".", ",")}%</span>
        </div>
      </td>
      <td><button class="btn btn-ghost" style="padding:6px 12px; font-size:12px;" type="button" data-pres-detail="${r.s.id}">Ver histórico</button></td>
    </tr>
  `).join("") || `<tr><td colspan="7" style="text-align:center; color:var(--text-faint); padding:24px;">Nenhum aluno encontrado com esses filtros.</td></tr>`;

  agendarScanFotos();
}
// um único ouvinte para todos os botões "Ver histórico" (em vez de um por linha a cada redesenho)
byId("presenca-body").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pres-detail]");
  if (btn) openPresencaDetail(btn.dataset.presDetail);
});

async function openPresencaDetail(alunoId) {
  const s = students.find(x => x.id === alunoId);
  const sum = presencaSummaryByAluno.get(alunoId);
  if (!s || !sum) return;
  const { data: registros, error } = await supabase.from("presencas").select("data, presente").eq("aluno_id", alunoId).order("data");
  if (error) { console.error("Erro ao carregar o histórico de presenças:", error); alert("Não foi possível carregar o histórico deste aluno. Tente de novo."); return; }
  sum.registros = registros;

  const total = sum.presencas + sum.faltas;
  const pct = total ? Math.round((sum.presencas / total) * 1000) / 10 : 0;
  const level = freqLevel(pct);

  byId("presenca-modal-head").innerHTML = `
    ${presAvatarHTML(s, 46)}
    <div>
      <div class="d-name">${esc(s.nome)}</div>
      <div class="d-meta">${esc(s.turmaNome || "—")} · <span class="freq-pct ${level}">${pct.toString().replace(".", ",")}% de frequência</span> · ${sum.presencas} presenças, ${sum.faltas} faltas</div>
    </div>
  `;

  const byMonth = new Map();
  [...sum.registros].sort((a, b) => a.data.localeCompare(b.data)).forEach(r => {
    const ym = r.data.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(r);
  });

  const monthsHtml = [...byMonth.entries()].map(([ym, regs]) => {
    const [y, m] = ym.split("-");
    const label = `${MESES_PT[parseInt(m, 10) - 1]} de ${y}`;
    const days = regs.map(r => {
      const day = r.data.slice(8, 10);
      return `<div class="presenca-day ${r.presente ? "p" : "f"}" title="${fmtDate(r.data)} — ${r.presente ? "presente" : "falta"}">${day}</div>`;
    }).join("");
    return `<div class="presenca-month"><h4>${label}</h4><div class="presenca-day-grid">${days}</div></div>`;
  }).join("");

  byId("presenca-modal-body").innerHTML = `
    <div class="presenca-legend">
      <span><i style="background:var(--success)"></i>Presente</span>
      <span><i style="background:var(--critical)"></i>Falta</span>
    </div>
    ${monthsHtml || `<p style="color:var(--text-faint);">Sem registros de presença para este aluno.</p>`}
  `;

  byId("presenca-modal-backdrop").classList.add("open");
}
function closePresencaModal() {
  byId("presenca-modal-backdrop").classList.remove("open");
}
byId("presenca-modal-close").addEventListener("click", closePresencaModal);
byId("presenca-modal-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "presenca-modal-backdrop") closePresencaModal();
});
byId("presenca-search-input").addEventListener("input", debounce(renderPresencas));
byId("presenca-filter-turma").addEventListener("change", renderPresencas);
byId("presenca-filter-nivel").addEventListener("change", renderPresencas);
byId("presenca-sort").addEventListener("change", renderPresencas);

/* ---------------- mini-modal genérico (edição de aula / lançamento de horas) ---------------- */
let miniModalOnSave = null;
function openMiniModal(title, bodyHtml, onSave) {
  byId("mini-modal-title").textContent = title;
  byId("mini-modal-body").innerHTML = bodyHtml;
  miniModalOnSave = onSave;
  byId("mini-modal-backdrop").classList.add("open");
}
function closeMiniModal() {
  byId("mini-modal-backdrop").classList.remove("open");
  miniModalOnSave = null;
}
byId("mini-modal-cancel").addEventListener("click", closeMiniModal);
byId("mini-modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "mini-modal-backdrop") closeMiniModal(); });
byId("mini-modal-save").addEventListener("click", () => { if (miniModalOnSave) miniModalOnSave(); });

/* ---------------- seletor de ano letivo / adicionar turma ---------------- */
async function onAnoLetivoChanged() {
  applyAnoLetivoFilter();
  renderAnoSwitch();
  populateTurmaFilters();
  renderAll(); // renderAll() já chama renderHorarios(), que se autocorrige pro ano selecionado
  await initSimulados().catch(err => console.error("Erro ao recarregar simulados para o ano selecionado:", err));
}

byId("ano-letivo-select").addEventListener("change", async (e) => {
  selectedAnoLetivo = Number(e.target.value);
  localStorage.setItem(ANO_LETIVO_KEY, String(selectedAnoLetivo));
  await onAnoLetivoChanged();
});

byId("ano-add-turma-btn").addEventListener("click", () => {
  const bodyHtml = `
    <div class="f-field"><label>Nome da turma</label><input type="text" id="nt-nome" placeholder="Ex: Pré-CEFET 1"></div>
    <div class="f-field"><label>Tipo</label>
      <select id="nt-tipo">
        <option value="CEFET">CEFET</option>
        <option value="8º ano">8º ano</option>
        <option value="ENEM">ENEM</option>
      </select>
    </div>
    <div class="f-field"><label>Ano letivo</label><input type="number" id="nt-ano" value="${selectedAnoLetivo + 1}" step="1"></div>
    <div class="f-field"><label>Horário</label><input type="text" id="nt-horario" placeholder="Ex: Segunda à quinta"></div>
  `;
  openMiniModal("Adicionar turma", bodyHtml, async () => {
    const nome = byId("nt-nome").value.trim();
    const tipo = byId("nt-tipo").value;
    const ano = parseInt(byId("nt-ano").value, 10);
    const horario = byId("nt-horario").value.trim() || null;
    if (!nome) { alert("Informe o nome da turma."); return; }
    if (!ano) { alert("Informe um ano letivo válido."); return; }
    const btn = byId("mini-modal-save");
    btn.disabled = true;
    try {
      const { error } = await supabase.from("turmas").insert({ nome, tipo, ano_letivo: ano, horario });
      if (error) throw error;
      await loadTurmas();
      computeAnosDisponiveis();
      selectedAnoLetivo = ano;
      localStorage.setItem(ANO_LETIVO_KEY, String(selectedAnoLetivo));
      await onAnoLetivoChanged();
      closeMiniModal();
      alert("Turma adicionada com sucesso!");
    } catch (err) {
      console.error("Erro ao adicionar turma:", err);
      alert("Erro ao adicionar turma: " + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  });
});

/* ---------------- Grade de horários (editável, por semana) ---------------- */
/* Escopo por ano letivo via turma_id de verdade (FK para turmas.id, que já carrega
   ano_letivo) — não por nome de turma nem por data. turmasList já vem filtrada pelo
   ano selecionado, então as abas mostram exatamente as turmas daquele ano. turma_nome
   continua sendo gravado em cada linha só como legenda de exibição (kanban, conflitos,
   editor de célula) — nunca é usado para decidir a quem/qual ano uma linha pertence. */
function nomeDaTurma(turmaId) {
  const t = turmasList.find(x => x.id === turmaId) || allTurmasRaw.find(x => x.id === turmaId);
  return t ? t.nome : "—";
}

function renderHorTurmaTabs() {
  byId("hor-turma-tabs").innerHTML = turmasList.map(t =>
    `<button type="button" class="tab-btn ${t.id === horTurmaAtual ? "active" : ""}" data-hor-turma="${t.id}">${esc(t.nome)}</button>`
  ).join("");
  document.querySelectorAll("[data-hor-turma]").forEach(btn => {
    btn.addEventListener("click", () => {
      horTurmaAtual = btn.dataset.horTurma;
      horSemanaAtual = horDefaultSemana(horTurmaAtual);
      renderHorTurmaTabs();
      renderHorWeekNav();
      renderHorGrid();
      renderHorNovaSemanaBtn();
    });
  });
}

function horWeeksForTurma(turmaId) {
  return [...new Set(horarioSemanal.filter(r => r.turma_id === turmaId).map(r => r.semana_num))].sort((a, b) => a - b);
}
function horWeekRange(turmaId, semana) {
  const dates = horarioSemanal.filter(r => r.turma_id === turmaId && r.semana_num === semana).map(r => r.data).sort();
  return { min: dates[0], max: dates[dates.length - 1] };
}
function horDefaultSemana(turma) {
  const weeks = horWeeksForTurma(turma);
  if (!weeks.length) return null;
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const w of weeks) {
    const { min, max } = horWeekRange(turma, w);
    if (todayIso >= min && todayIso <= max) return w;
  }
  return weeks[weeks.length - 1];
}

function renderHorWeekNav() {
  const weeks = horWeeksForTurma(horTurmaAtual);
  const idx = weeks.indexOf(horSemanaAtual);
  const prevBtn = byId("hor-week-prev");
  const nextBtn = byId("hor-week-next");
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx === -1 || idx >= weeks.length - 1;
  const label = byId("hor-week-label");
  if (idx === -1) { label.textContent = "Sem dados"; return; }
  const { min, max } = horWeekRange(horTurmaAtual, horSemanaAtual);
  label.textContent = `Semana ${String(horSemanaAtual).padStart(2, "0")} — ${fmtDate(min)} a ${fmtDate(max)}`;
}
byId("hor-week-prev").addEventListener("click", () => {
  const weeks = horWeeksForTurma(horTurmaAtual);
  const idx = weeks.indexOf(horSemanaAtual);
  if (idx > 0) { horSemanaAtual = weeks[idx - 1]; renderHorWeekNav(); renderHorGrid(); }
});
byId("hor-week-next").addEventListener("click", () => {
  const weeks = horWeeksForTurma(horTurmaAtual);
  const idx = weeks.indexOf(horSemanaAtual);
  if (idx !== -1 && idx < weeks.length - 1) { horSemanaAtual = weeks[idx + 1]; renderHorWeekNav(); renderHorGrid(); }
});

/* ---------------- Nova semana (duplica a última semana existente) ---------------- */
function addDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function startOfWeekIso(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay(); // 0=domingo..6=sábado
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day)); // volta pra segunda-feira
  return d.toISOString().slice(0, 10);
}
function renderHorNovaSemanaBtn() {
  const btn = byId("hor-nova-semana-btn");
  // habilitado se a turma atual já tem semana, OU se existe uma turma com o MESMO NOME
  // em outro ano com horário cadastrado (serve de modelo pra começar um ano novo do zero).
  const nome = nomeDaTurma(horTurmaAtual);
  const temModelo = horWeeksForTurma(horTurmaAtual).length > 0
    || allTurmasRaw.some(t => t.nome === nome && t.id !== horTurmaAtual && horarioSemanal.some(r => r.turma_id === t.id));
  btn.disabled = !temModelo;
}
byId("hor-nova-semana-btn").addEventListener("click", async () => {
  const weeksAno = horWeeksForTurma(horTurmaAtual);
  let baseRows, novaSemana, novaSegunda;
  if (weeksAno.length) {
    const ultimaSemana = weeksAno[weeksAno.length - 1];
    baseRows = horarioSemanal.filter(r => r.turma_id === horTurmaAtual && r.semana_num === ultimaSemana);
    novaSemana = ultimaSemana + 1;
    novaSegunda = null; // usa a data de cada linha +7 dias
  } else {
    // esta turma (deste ano) ainda não tem nenhuma semana: usa como modelo a semana mais
    // recente de uma turma com o MESMO NOME em outro ano, recomeçando a numeração em 1,
    // ancorada na semana atual real.
    const nome = nomeDaTurma(horTurmaAtual);
    const turmaModeloId = allTurmasRaw
      .filter(t => t.nome === nome && t.id !== horTurmaAtual && horarioSemanal.some(r => r.turma_id === t.id))
      .sort((a, b) => b.ano_letivo - a.ano_letivo)[0]?.id;
    if (!turmaModeloId) { alert("Não há nenhum horário cadastrado para uma turma com esse nome em nenhum ano."); return; }
    const todasSemanas = [...new Set(horarioSemanal.filter(r => r.turma_id === turmaModeloId).map(r => r.semana_num))].sort((a, b) => a - b);
    const semanaModelo = todasSemanas[todasSemanas.length - 1];
    baseRows = horarioSemanal.filter(r => r.turma_id === turmaModeloId && r.semana_num === semanaModelo);
    novaSemana = 1;
    novaSegunda = startOfWeekIso(new Date());
  }
  if (!baseRows.length) return;
  const nomeAtual = nomeDaTurma(horTurmaAtual);
  const confirmMsg = weeksAno.length
    ? `Criar a semana ${String(novaSemana).padStart(2, "0")} para ${nomeAtual}, duplicando a semana ${String(novaSemana - 1).padStart(2, "0")}?`
    : `Criar a 1ª semana de ${selectedAnoLetivo} para ${nomeAtual}, usando como modelo o horário mais recente cadastrado?`;
  if (!confirm(confirmMsg)) return;
  const btn = byId("hor-nova-semana-btn");
  btn.disabled = true;
  try {
    const novasLinhas = baseRows.map(r => ({
      turma_id: horTurmaAtual,
      turma_nome: nomeAtual,
      semana_num: novaSemana,
      data: novaSegunda ? addDaysIso(novaSegunda, HOR_DIA_ORDER.indexOf(r.dia_semana)) : addDaysIso(r.data, 7),
      dia_semana: r.dia_semana,
      periodo_ordem: r.periodo_ordem,
      periodo_label: r.periodo_label,
      materia: r.materia,
      professor_nome: r.professor_nome,
      texto_livre: r.texto_livre,
    }));
    const { data: inserted, error } = await supabase.from("horario_semanal").insert(novasLinhas).select();
    if (error) throw error;
    horarioSemanal.push(...inserted);
    horSemanaAtual = novaSemana;
    renderHorWeekNav();
    renderHorGrid();
    renderHorNovaSemanaBtn();
  } catch (err) {
    alert("Erro ao criar nova semana: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
});

function renderHorCellTd(cell) {
  if (!cell) return `<td></td>`;
  if (cell.texto_livre) {
    return `<td><div class="hor-cell special" data-hor-cell-id="${cell.id}">${esc(cell.texto_livre)}</div></td>`;
  }
  const hasContent = cell.materia || cell.professor_nome;
  const mainText = cell.materia || cell.professor_nome || "";
  return `<td><div class="hor-cell ${hasContent ? "" : "empty"}" data-hor-cell-id="${cell.id}">
    <div class="hc-materia">${hasContent ? esc(mainText) : "Clique para preencher"}</div>
    ${cell.materia && cell.professor_nome ? `<div class="hc-prof">${esc(cell.professor_nome)}</div>` : ""}
  </div></td>`;
}

function renderHorGrid() {
  const rows = horarioSemanal.filter(r => r.turma_id === horTurmaAtual && r.semana_num === horSemanaAtual);
  byId("hor-turma-count").textContent = nomeDaTurma(horTurmaAtual);
  if (!rows.length) {
    byId("hor-grade-table").innerHTML = `<tbody><tr><td style="padding:24px; text-align:center; color:var(--text-faint);">Nenhum dado para esta semana.</td></tr></tbody>`;
    return;
  }
  const dias = HOR_DIA_ORDER.filter(d => rows.some(r => r.dia_semana === d));
  const periodos = [...new Map(rows.map(r => [r.periodo_ordem, r.periodo_label])).entries()].sort((a, b) => a[0] - b[0]);

  let thead = `<thead><tr><th>Período</th>${dias.map(d => `<th>${esc(d)}</th>`).join("")}</tr></thead>`;
  let tbody = "<tbody>";
  periodos.forEach(([ordem, label], i) => {
    tbody += `<tr><td>${esc(label)}</td>${dias.map(d => {
      const cell = rows.find(r => r.periodo_ordem === ordem && r.dia_semana === d);
      return renderHorCellTd(cell);
    }).join("")}</tr>`;
    if (i === 1) {
      tbody += `<tr><td class="hor-cell intervalo">Intervalo</td>${dias.map(() => `<td class="hor-cell intervalo">-------------</td>`).join("")}</tr>`;
    }
  });
  tbody += "</tbody>";
  byId("hor-grade-table").innerHTML = thead + tbody;

  document.querySelectorAll("[data-hor-cell-id]").forEach(el => {
    el.addEventListener("click", () => openHorCellEditor(el.dataset.horCellId));
  });
}

function openHorCellEditor(cellId) {
  const cell = horarioSemanal.find(r => r.id === cellId);
  if (!cell) return;
  const profOpts = `<option value="">— nenhum(a) —</option>` + professoresAtivos().map(p =>
    `<option value="${esc(p.nome)}" ${p.nome === cell.professor_nome ? "selected" : ""}>${esc(p.nome)}</option>`
  ).join("");
  openMiniModal(`${cell.turma_nome} · ${cell.dia_semana} · ${cell.periodo_label}`, `
    <div class="f-field"><label>Matéria</label><input type="text" id="mm-materia" value="${esc(cell.materia || "")}"></div>
    <div class="f-field"><label>Professor(a)</label><select id="mm-professor">${profOpts}</select></div>
    <div class="f-field"><label>Texto livre (ex: CARNAVAL, Coordenação, Recesso...)</label><input type="text" id="mm-texto-livre" value="${esc(cell.texto_livre || "")}" placeholder="Deixe em branco se houver matéria/professor"></div>
  `, async () => {
    const materia = byId("mm-materia").value.trim() || null;
    const professor_nome = byId("mm-professor").value || null;
    const texto_livre = byId("mm-texto-livre").value.trim() || null;
    const btn = byId("mini-modal-save");
    btn.disabled = true;
    try {
      const { error } = await supabase.from("horario_semanal").update({ materia, professor_nome, texto_livre }).eq("id", cellId);
      if (error) throw error;
      cell.materia = materia; cell.professor_nome = professor_nome; cell.texto_livre = texto_livre;
      renderHorGrid();
      closeMiniModal();
    } catch (err) {
      alert("Erro ao salvar: " + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------------- Ficha de horas ---------------- */
function mesTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function mesLabel(mesStr) {
  const [y, m] = mesStr.split("-");
  return `${MESES_PT[parseInt(m, 10) - 1]} de ${y}`;
}
function allMonthsDesc() {
  // mes_referencia já é "AAAA-MM", então o ano é derivado dele — sem precisar de coluna extra.
  const prefixo = String(selectedAnoLetivo) + "-";
  const set = new Set(registrosAula.map(r => r.mes_referencia).filter(m => m && m.startsWith(prefixo)));
  if (selectedAnoLetivo === new Date().getFullYear()) set.add(mesTodayStr());
  if (!set.size) set.add(`${selectedAnoLetivo}-01`); // ano novo sem nenhum lançamento ainda
  return [...set].sort().reverse();
}
function fichaResumoMes() {
  return byId("ficha-mes-select").value;
}
function fichaDetalheMes() {
  return byId("ficha-detalhe-mes-select").value;
}

function populateFichaMesSelects() {
  const months = allMonthsDesc();
  const opts = months.map(m => `<option value="${m}">${esc(mesLabel(m))}</option>`).join("");
  const monthsComData = new Set(registrosAula.map(r => r.mes_referencia));
  const defaultMes = months.find(m => monthsComData.has(m)) || months[0];
  const selResumo = byId("ficha-mes-select");
  const selDetalhe = byId("ficha-detalhe-mes-select");
  selResumo.innerHTML = opts; selResumo.value = defaultMes;
  selDetalhe.innerHTML = opts; selDetalhe.value = defaultMes;
}

function renderFichaResumo() {
  const mes = fichaResumoMes();
  const porProf = new Map();
  registrosAula.filter(r => r.mes_referencia === mes).forEach(r => {
    const e = porProf.get(r.professor_id) || { aulas: 0, horas: 0 };
    e.aulas++; e.horas += Number(r.horas);
    porProf.set(r.professor_id, e);
  });
  const rows = professoresList.map(p => {
    const e = porProf.get(p.id) || { aulas: 0, horas: 0 };
    return { prof: p, ...e };
  }).sort((a, b) => b.horas - a.horas);

  byId("ficha-resumo-count").textContent = rows.filter(r => r.aulas > 0).length;
  byId("ficha-resumo-body").innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.prof.nome)}</td>
      <td class="mono">${r.aulas}</td>
      <td class="mono">${r.horas}h</td>
      <td><button class="btn btn-ghost" style="padding:6px 12px; font-size:12px;" type="button" data-ficha-abrir="${r.prof.id}">Ver ficha</button></td>
    </tr>
  `).join("");
  byId("ficha-resumo-total-aulas").textContent = rows.reduce((a, r) => a + r.aulas, 0);
  byId("ficha-resumo-total-horas").textContent = rows.reduce((a, r) => a + r.horas, 0) + "h";

  document.querySelectorAll("[data-ficha-abrir]").forEach(btn => {
    btn.addEventListener("click", () => openFichaDetalhe(btn.dataset.fichaAbrir));
  });
}

function openFichaDetalhe(professorId) {
  fichaProfessorAtual = professorId;
  byId("ficha-detalhe-mes-select").value = fichaResumoMes();
  byId("ficha-resumo-view").classList.add("hidden");
  byId("ficha-detalhe-view").classList.remove("hidden");
  renderFichaDetalhe();
}
function voltarFichaResumo() {
  byId("ficha-detalhe-view").classList.add("hidden");
  byId("ficha-resumo-view").classList.remove("hidden");
  fichaProfessorAtual = null;
  renderFichaResumo();
}
byId("ficha-voltar-btn").addEventListener("click", voltarFichaResumo);

function renderFichaDetalhe() {
  const prof = professoresList.find(p => p.id === fichaProfessorAtual);
  if (!prof) return;
  const mes = fichaDetalheMes();
  byId("ficha-detalhe-nome").textContent = `${prof.nome} — ${mesLabel(mes)}`;
  const rows = registrosAula.filter(r => r.professor_id === fichaProfessorAtual && r.mes_referencia === mes)
    .sort((a, b) => a.data.localeCompare(b.data));

  byId("ficha-detalhe-body").innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${fmtDate(r.data)}</td>
      <td>${esc(r.turma)}</td>
      <td class="mono">${r.horas}h</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost" style="padding:5px 10px; font-size:12px;" type="button" data-ficha-editar="${r.id}">Editar</button>
        <button class="btn btn-danger" style="padding:5px 10px; font-size:12px;" type="button" data-ficha-excluir="${r.id}">Excluir</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="4" style="text-align:center; color:var(--text-faint); padding:20px;">Nenhum lançamento neste mês.</td></tr>`;

  byId("ficha-detalhe-total-aulas").textContent = rows.length + " aulas";
  byId("ficha-detalhe-total-horas").textContent = rows.reduce((a, r) => a + Number(r.horas), 0) + "h";

  document.querySelectorAll("[data-ficha-editar]").forEach(btn => btn.addEventListener("click", () => openFichaLancamentoForm(btn.dataset.fichaEditar)));
  document.querySelectorAll("[data-ficha-excluir]").forEach(btn => btn.addEventListener("click", () => excluirLancamento(btn.dataset.fichaExcluir)));
}

function daysInMonth(mesStr) {
  const [y, m] = mesStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function openFichaLancamentoForm(registroId) {
  const isEdit = !!registroId;
  const reg = isEdit ? registrosAula.find(r => r.id === registroId) : null;
  const mes = fichaDetalheMes();
  const [anoCtx, mesCtx] = mes.split("-");
  const maxDay = daysInMonth(mes);
  const currentDay = reg ? Number(reg.data.split("-")[2]) : "";
  openMiniModal(isEdit ? "Editar lançamento" : "Novo lançamento", `
    <div class="f-field"><label>Dia do mês (${esc(mesLabel(mes))})</label><input type="number" id="mm-dia" min="1" max="${maxDay}" step="1" value="${currentDay}" placeholder="Ex: 15"></div>
    <div class="f-field"><label>Turma / atividade</label><input type="text" id="mm-turma" list="mm-turma-list" value="${esc(reg ? reg.turma : "")}" placeholder="Ex: Cefet 1, Enem, Câmara...">
      <datalist id="mm-turma-list">
        <option value="Cefet 1"><option value="Cefet 2"><option value="8º ano"><option value="Enem">
        <option value="Intensivão"><option value="Câmara"><option value="Concursos"><option value="Prefeitura">
      </datalist>
    </div>
    <div class="f-field"><label>Horas</label><input type="number" id="mm-horas" step="0.5" min="0" value="${reg ? reg.horas : "2"}"></div>
  `, async () => {
    const dia = parseInt(byId("mm-dia").value, 10);
    const turma = byId("mm-turma").value.trim();
    const horas = parseFloat(byId("mm-horas").value);
    if (!dia || dia < 1 || dia > maxDay || !turma || isNaN(horas)) { alert(`Preencha um dia válido (1 a ${maxDay}), turma/atividade e horas.`); return; }
    const data = `${anoCtx}-${mesCtx}-${String(dia).padStart(2, "0")}`;
    const mes_referencia = mes;
    const btn = byId("mini-modal-save");
    btn.disabled = true;
    try {
      if (isEdit) {
        const { error } = await supabase.from("registros_aula").update({ data, turma, horas, mes_referencia, updated_at: new Date().toISOString() }).eq("id", registroId);
        if (error) throw error;
        Object.assign(reg, { data, turma, horas, mes_referencia });
      } else {
        const { data: inserted, error } = await supabase.from("registros_aula").insert({ professor_id: fichaProfessorAtual, data, turma, horas, mes_referencia }).select().single();
        if (error) throw error;
        registrosAula.push(inserted);
      }
      byId("ficha-detalhe-mes-select").value = mes_referencia;
      renderFichaDetalhe();
      closeMiniModal();
    } catch (err) {
      alert("Erro ao salvar lançamento: " + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  });
}
byId("ficha-novo-btn").addEventListener("click", () => openFichaLancamentoForm(null));

async function excluirLancamento(registroId) {
  if (!confirm("Excluir este lançamento da ficha de horas?")) return;
  const { error } = await supabase.from("registros_aula").delete().eq("id", registroId);
  if (error) { alert("Erro ao excluir: " + (error.message || error)); return; }
  registrosAula = registrosAula.filter(r => r.id !== registroId);
  renderFichaDetalhe();
}

byId("ficha-mes-select").addEventListener("change", renderFichaResumo);
byId("ficha-detalhe-mes-select").addEventListener("change", renderFichaDetalhe);

byId("ficha-pdf-btn").addEventListener("click", async () => {
  const prof = professoresList.find(p => p.id === fichaProfessorAtual);
  if (!prof) return;
  try { await ensureJsPdfLoaded(); } catch (e) { alert(e.message); return; }
  const mes = fichaDetalheMes();
  const rows = registrosAula.filter(r => r.professor_id === fichaProfessorAtual && r.mes_referencia === mes).sort((a, b) => a.data.localeCompare(b.data));
  gerarPdfFicha(prof, mes, rows);
});

function gerarPdfFicha(prof, mes, rows) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PW = 210, MX = 16;
  let y = 20;
  const brand = [0, 166, 81], brandDark = [4, 67, 47], ink = [22, 36, 25], muted = [93, 107, 97];

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text("PERCURSO CATAGUASES — FICHA DE HORAS", MX, y); y += 8;
  doc.setDrawColor(...brand); doc.setLineWidth(0.6); doc.line(MX, y, PW - MX, y); y += 9;
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...brandDark);
  doc.text(prof.nome, MX, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...muted);
  doc.text(mesLabel(mes), MX, y); y += 12;

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...ink);
  doc.text("Data", MX, y); doc.text("Turma / atividade", MX + 32, y); doc.text("Horas", PW - MX - 14, y);
  y += 3; doc.setDrawColor(...ink); doc.setLineWidth(0.3); doc.line(MX, y, PW - MX, y); y += 6;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  rows.forEach(r => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.setTextColor(...ink);
    doc.text(fmtDate(r.data), MX, y);
    doc.text(String(r.turma), MX + 32, y);
    doc.text(String(r.horas) + "h", PW - MX - 14, y);
    y += 6.5;
  });

  y += 4; doc.setDrawColor(...brand); doc.setLineWidth(0.6); doc.line(MX, y, PW - MX, y); y += 8;
  const totalAulas = rows.length;
  const totalHoras = rows.reduce((a, r) => a + Number(r.horas), 0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...brandDark);
  doc.text(`Total de aulas: ${totalAulas}`, MX, y);
  doc.text(`Total de horas: ${totalHoras}h`, PW - MX - 45, y);

  doc.save(`ficha_horas_${prof.nome.replace(/[^a-zA-Z0-9]+/g, "_")}_${mes}.pdf`);
}

/* ---------------- Painel de execução (kanban) ---------------- */
const KAN_COLUMNS = [
  { key: "planejada", cls: "planejada", title: "Escala Planejada" },
  { key: "confirmada", cls: "confirmada", title: "Escala Confirmada" },
  { key: "execucao", cls: "execucao", title: "Em Execução" },
  { key: "ajuste", cls: "ajuste", title: "Pendente de Ajuste" },
  { key: "concluida", cls: "concluida", title: "Concluído & Computado" },
];
let kanLastCards = [];

function round2(n) { return Math.round(n * 100) / 100; }

function parsePeriodoLabel(label) {
  const m = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(label || "");
  if (!m) return null;
  const startStr = `${m[1].padStart(2, "0")}:${m[2]}`;
  const endStr = `${m[3].padStart(2, "0")}:${m[4]}`;
  const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const endMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
  const horas = round2((endMin - startMin) / 60);
  return { startStr, endStr, startMin, endMin, horas };
}

function kanClockStatus(dataIso, startStr, endStr, now) {
  const startDT = new Date(`${dataIso}T${startStr}:00`);
  const endDT = new Date(`${dataIso}T${endStr}:00`);
  const dayBefore = new Date(`${dataIso}T00:00:00`);
  dayBefore.setDate(dayBefore.getDate() - 1);
  if (now < dayBefore) return "planejada";
  if (now < startDT) return "confirmada";
  if (now < endDT) return "execucao";
  return "concluida";
}

function kanBuildCard(row, now, execMap) {
  const parsed = parsePeriodoLabel(row.periodo_label);
  if (!parsed) return null;
  const exec = execMap.get(row.id) || null;
  const professorEfetivo = (exec && exec.professor_substituto_nome) || row.professor_nome;
  const computado = !!(exec && exec.computado);
  let status = kanClockStatus(row.data, parsed.startStr, parsed.endStr, now);
  if (exec && exec.status_manual === "pendente_ajuste") status = "ajuste";
  if (computado) status = "concluida";
  return {
    id: row.id, row, exec, computado,
    dataIso: row.data, dia_semana: row.dia_semana, turma_nome: row.turma_nome,
    materia: row.materia, professorOriginal: row.professor_nome, professorEfetivo,
    periodo_ordem: row.periodo_ordem,
    startStr: parsed.startStr, endStr: parsed.endStr,
    startMin: parsed.startMin, endMin: parsed.endMin, horas: parsed.horas,
    status,
  };
}

function kanCardsForRows(rows, now, execMap) {
  return rows
    .filter(r => r.professor_nome && !r.texto_livre)
    .map(r => kanBuildCard(r, now, execMap))
    .filter(Boolean)
    .sort((a, b) => a.dataIso === b.dataIso ? a.periodo_ordem - b.periodo_ordem : a.dataIso.localeCompare(b.dataIso));
}

function detectKanConflicts(cards) {
  const byKey = new Map();
  cards.forEach(c => {
    const key = normName(c.professorEfetivo) + "|" + c.dataIso;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(c);
  });
  const conflicts = [];
  byKey.forEach(list => {
    if (list.length < 2) return;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.startMin < b.endMin && b.startMin < a.endMin) {
          conflicts.push({
            professor: a.professorEfetivo, dataIso: a.dataIso,
            turmaA: a.turma_nome, startA: a.startStr, endA: a.endStr,
            turmaB: b.turma_nome, startB: b.startStr, endB: b.endStr,
          });
        }
      }
    }
  });
  return conflicts;
}

function renderKanConflictBanner(conflicts) {
  const el = byId("kan-conflitos");
  if (!conflicts.length) { el.innerHTML = ""; return; }
  const items = conflicts.map(c => `<li><b>${esc(c.professor)}</b> — ${esc(fmtDate(c.dataIso))}: ${esc(c.turmaA)} (${c.startA}–${c.endA}) × ${esc(c.turmaB)} (${c.startB}–${c.endB})</li>`).join("");
  el.innerHTML = `<div class="kan-alert">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
    <div><b>${conflicts.length} conflito(s) de horário detectado(s)</b>
    <ul>${items}</ul></div>
  </div>`;
}

function groupKanCardsByDay(cards) {
  const map = new Map();
  cards.forEach(c => {
    if (!map.has(c.dataIso)) map.set(c.dataIso, []);
    map.get(c.dataIso).push(c);
  });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderKanCardHTML(card) {
  const subLine = card.exec && card.exec.professor_substituto_nome
    ? `<div class="kc-sub">Substituto(a): ${esc(card.exec.professor_substituto_nome)} (orig.: ${esc(card.professorOriginal)})</div>` : "";
  const obsLine = card.exec && card.exec.observacao ? `<div class="kc-obs">${esc(card.exec.observacao)}</div>` : "";
  const actions = card.computado ? `<div class="kc-obs">Já lançado(a) na ficha de horas.</div>` : `<div class="kan-card-actions">
    <button type="button" class="${card.status === "ajuste" ? "warn" : ""}" data-kan-ajuste="${card.id}">${card.status === "ajuste" ? "Resolver" : "Ajuste"}</button>
  </div>`;
  return `<div class="kan-card ${card.computado ? "computado" : ""}">
    <div class="kc-prof">${esc(card.professorEfetivo)}</div>
    <div class="kc-turma">${esc(card.turma_nome)}${card.materia ? " · " + esc(card.materia) : ""}</div>
    <div class="kc-janela">${esc(card.dia_semana)} ${fmtDate(card.dataIso)} · ${card.startStr}–${card.endStr}</div>
    <div class="kc-horas">${card.horas}h</div>
    ${subLine}
    ${obsLine}
    ${actions}
  </div>`;
}

function renderKanBoard(cards) {
  let html = "";
  KAN_COLUMNS.forEach(col => {
    const colCards = cards.filter(c => c.status === col.key);
    const groups = groupKanCardsByDay(colCards);
    let body = "";
    if (!groups.length) {
      body = `<div class="kan-col-empty">Nenhum card</div>`;
    } else {
      groups.forEach(([dataIso, dayCards]) => {
        const diaLabel = `${dayCards[0].dia_semana} · ${fmtDate(dataIso)}`;
        const confirmBtn = (col.key === "concluida" && dayCards.some(c => !c.computado))
          ? `<button type="button" class="kan-day-confirmar" data-kan-confirmar-dia="${esc(dataIso)}">Confirmar dia</button>` : "";
        body += `<div class="kan-day-group">
          <div class="kan-day-head"><span class="kan-day-label">${esc(diaLabel)}</span>${confirmBtn}</div>
          ${dayCards.map(renderKanCardHTML).join("")}
        </div>`;
      });
    }
    html += `<div class="kan-col ${col.cls}">
      <div class="kan-col-head"><span class="kan-col-title">${col.title}</span><span class="kan-col-count">${colCards.length}</span></div>
      ${body}
    </div>`;
  });
  byId("kan-board").innerHTML = html;
  document.querySelectorAll("[data-kan-ajuste]").forEach(btn => btn.addEventListener("click", () => openKanAjusteModal(btn.dataset.kanAjuste)));
  document.querySelectorAll("[data-kan-confirmar-dia]").forEach(btn => btn.addEventListener("click", () => confirmarKanDia(btn.dataset.kanConfirmarDia)));
}

function renderKanBancoHoras(cards) {
  const byProf = new Map();
  cards.forEach(c => {
    if (!byProf.has(c.professorEfetivo)) byProf.set(c.professorEfetivo, { esperada: 0, realizada: 0 });
    const e = byProf.get(c.professorEfetivo);
    e.esperada += c.horas;
    if (c.computado) e.realizada += c.horas;
  });
  const rows = [...byProf.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  byId("kan-banco-count").textContent = rows.length;
  byId("kan-banco-body").innerHTML = rows.map(([nome, e]) => {
    const saldo = e.realizada - e.esperada;
    const saldoCls = saldo >= 0 ? "kan-saldo-pos" : "kan-saldo-neg";
    const pct = e.esperada > 0 ? Math.round((e.realizada / e.esperada) * 100) : 0;
    return `<tr>
      <td>${esc(nome)}</td>
      <td class="mono">${round2(e.esperada)}h</td>
      <td class="mono">${round2(e.realizada)}h (${pct}%)</td>
      <td class="mono ${saldoCls}">${saldo >= 0 ? "+" : ""}${round2(saldo)}h</td>
    </tr>`;
  }).join("") || `<tr><td colspan="4" style="text-align:center; color:var(--text-faint); padding:16px;">Nenhum card nesta semana.</td></tr>`;
}

function renderKanTurmaTabs() {
  byId("kan-turma-tabs").innerHTML = turmasList.map(t =>
    `<button type="button" class="tab-btn ${t.id === kanTurmaAtual ? "active" : ""}" data-kan-turma="${t.id}">${esc(t.nome)}</button>`
  ).join("");
  document.querySelectorAll("[data-kan-turma]").forEach(btn => {
    btn.addEventListener("click", () => {
      kanTurmaAtual = btn.dataset.kanTurma;
      kanSemanaAtual = horDefaultSemana(kanTurmaAtual);
      renderKanban();
    });
  });
}

function renderKanWeekNav() {
  const weeks = horWeeksForTurma(kanTurmaAtual);
  const idx = weeks.indexOf(kanSemanaAtual);
  const prevBtn = byId("kan-week-prev");
  const nextBtn = byId("kan-week-next");
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx === -1 || idx >= weeks.length - 1;
  const label = byId("kan-week-label");
  if (idx === -1) { label.textContent = "Sem dados"; return; }
  const { min, max } = horWeekRange(kanTurmaAtual, kanSemanaAtual);
  label.textContent = `Semana ${String(kanSemanaAtual).padStart(2, "0")} — ${fmtDate(min)} a ${fmtDate(max)}`;
}
byId("kan-week-prev").addEventListener("click", () => {
  const weeks = horWeeksForTurma(kanTurmaAtual);
  const idx = weeks.indexOf(kanSemanaAtual);
  if (idx > 0) { kanSemanaAtual = weeks[idx - 1]; renderKanban(); }
});
byId("kan-week-next").addEventListener("click", () => {
  const weeks = horWeeksForTurma(kanTurmaAtual);
  const idx = weeks.indexOf(kanSemanaAtual);
  if (idx !== -1 && idx < weeks.length - 1) { kanSemanaAtual = weeks[idx + 1]; renderKanban(); }
});

function renderKanban() {
  if (!kanTurmaAtual || !turmasList.some(t => t.id === kanTurmaAtual)) {
    kanTurmaAtual = (turmasList.find(t => horarioSemanal.some(r => r.turma_id === t.id)) || turmasList[0] || {}).id || null;
  }
  if (kanSemanaAtual === null || !horWeeksForTurma(kanTurmaAtual).includes(kanSemanaAtual)) {
    kanSemanaAtual = horDefaultSemana(kanTurmaAtual);
  }
  renderKanTurmaTabs();
  renderKanWeekNav();
  byId("kan-turma-count").textContent = nomeDaTurma(kanTurmaAtual);

  if (kanSemanaAtual === null) {
    kanLastCards = [];
    byId("kan-board").innerHTML = `<p style="padding:24px; text-align:center; color:var(--text-faint);">Nenhum dado para esta turma.</p>`;
    byId("kan-conflitos").innerHTML = "";
    renderKanBancoHoras([]);
    return;
  }

  const now = new Date();
  const execMap = new Map(horarioExecucao.map(e => [e.horario_semanal_id, e]));
  const { min, max } = horWeekRange(kanTurmaAtual, kanSemanaAtual);
  const rowsTurma = horarioSemanal.filter(r => r.turma_id === kanTurmaAtual && r.semana_num === kanSemanaAtual);
  const cards = kanCardsForRows(rowsTurma, now, execMap);
  kanLastCards = cards;

  const rowsRange = horarioSemanal.filter(r => r.data >= min && r.data <= max);
  const conflicts = detectKanConflicts(kanCardsForRows(rowsRange, now, execMap));

  renderKanConflictBanner(conflicts);
  renderKanBoard(cards);
  renderKanBancoHoras(cards);
}

function openKanAjusteModal(cardId) {
  const card = kanLastCards.find(c => c.id === cardId);
  if (!card) return;
  const exec = card.exec;
  const isAjuste = card.status === "ajuste";
  const profOpts = `<option value="">— sem substituição —</option>` + professoresAtivos().map(p =>
    `<option value="${esc(p.nome)}" ${exec && exec.professor_substituto_nome === p.nome ? "selected" : ""}>${esc(p.nome)}</option>`
  ).join("");
  openMiniModal(`Ajustar aula — ${card.turma_nome} · ${fmtDate(card.dataIso)} · ${card.startStr}–${card.endStr}`, `
    <div class="f-field"><label>Situação</label>
      <select id="mm-kan-situacao">
        <option value="pendente" ${isAjuste ? "selected" : ""}>Pendente de ajuste (troca, falta, atraso...)</option>
        <option value="resolvido" ${!isAjuste ? "selected" : ""}>Resolvido</option>
      </select>
    </div>
    <div class="f-field"><label>Professor(a) substituto(a) (se houver)</label><select id="mm-kan-substituto">${profOpts}</select></div>
    <div class="f-field"><label>Observação</label><input type="text" id="mm-kan-obs" value="${esc(exec ? exec.observacao || "" : "")}" placeholder="Ex: troca com fulano(a), atraso, falta..."></div>
  `, async () => {
    const situacao = byId("mm-kan-situacao").value;
    const substituto = byId("mm-kan-substituto").value || null;
    const observacao = byId("mm-kan-obs").value.trim() || null;
    const payload = {
      horario_semanal_id: card.id,
      status_manual: situacao === "pendente" ? "pendente_ajuste" : null,
      professor_substituto_nome: substituto,
      observacao,
      updated_at: new Date().toISOString(),
    };
    const btn = byId("mini-modal-save");
    btn.disabled = true;
    try {
      const { data: upserted, error } = await supabase.from("horario_execucao").upsert(payload, { onConflict: "horario_semanal_id" }).select().single();
      if (error) throw error;
      const idx = horarioExecucao.findIndex(e => e.horario_semanal_id === card.id);
      if (idx >= 0) horarioExecucao[idx] = upserted; else horarioExecucao.push(upserted);
      closeMiniModal();
      renderKanban();
    } catch (err) {
      alert("Erro ao salvar ajuste: " + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------------- Fechamento: lançar horas concluídas na ficha ---------------- */
function mesReferenciaFromDate(dataIso) { return dataIso.slice(0, 7); }

function resolveProfessorIdByName(nome) {
  if (!nome) return null;
  const norm = normName(nome);
  const found = professoresList.find(p => normName(p.nome) === norm);
  return found ? found.id : null;
}

async function postarCardKanban(card) {
  if (card.computado) return { ok: false, motivo: `${card.professorEfetivo} — já lançado(a)` };
  if (card.status !== "concluida") return { ok: false, motivo: `${card.professorEfetivo} — aula ainda não concluída` };
  const professorId = resolveProfessorIdByName(card.professorEfetivo);
  if (!professorId) return { ok: false, motivo: `professor(a) "${card.professorEfetivo}" não encontrado(a) no cadastro` };
  const { data: inserted, error } = await supabase.from("registros_aula").insert({
    professor_id: professorId,
    data: card.dataIso,
    turma: card.turma_nome,
    horas: card.horas,
    mes_referencia: mesReferenciaFromDate(card.dataIso),
    observacao: "Lançado automaticamente via painel Kanban",
  }).select().single();
  if (error) return { ok: false, motivo: `${card.professorEfetivo} — ${error.message || error}` };
  registrosAula.push(inserted);

  const { data: upserted, error: execErr } = await supabase.from("horario_execucao").upsert({
    horario_semanal_id: card.id,
    computado: true,
    registro_aula_id: inserted.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "horario_semanal_id" }).select().single();
  if (execErr) {
    console.error(execErr);
  } else {
    const idx = horarioExecucao.findIndex(e => e.horario_semanal_id === card.id);
    if (idx >= 0) horarioExecucao[idx] = upserted; else horarioExecucao.push(upserted);
  }
  return { ok: true, horas: card.horas, professorNome: card.professorEfetivo };
}

async function confirmarKanCards(cards, escopoLabel) {
  const elegiveis = cards.filter(c => c.status === "concluida" && !c.computado);
  if (!elegiveis.length) { alert("Não há aulas concluídas pendentes de lançamento neste escopo."); return; }
  if (!confirm(`Confirmar ${escopoLabel}? Isso vai lançar ${elegiveis.length} aula(s) na ficha de horas.`)) return;
  const resultados = [];
  for (const card of elegiveis) {
    resultados.push(await postarCardKanban(card));
  }
  const sucesso = resultados.filter(r => r.ok);
  const falhas = resultados.filter(r => !r.ok);
  const totalHoras = sucesso.reduce((a, r) => a + r.horas, 0);
  const porProf = new Map();
  sucesso.forEach(r => porProf.set(r.professorNome, (porProf.get(r.professorNome) || 0) + r.horas));
  let msg = `Lançamento concluído: ${sucesso.length} aula(s), ${round2(totalHoras)}h no total.`;
  if (porProf.size) msg += `\n\n` + [...porProf.entries()].map(([nome, h]) => `• ${nome}: ${round2(h)}h`).join("\n");
  if (falhas.length) msg += `\n\n${falhas.length} não lançada(s):\n` + falhas.map(f => `• ${f.motivo}`).join("\n");
  alert(msg);
  populateFichaMesSelects();
  renderFichaResumo();
  if (fichaProfessorAtual) renderFichaDetalhe();
  renderKanban();
}

function confirmarKanDia(dataIso) {
  confirmarKanCards(kanLastCards.filter(c => c.dataIso === dataIso), `o dia ${fmtDate(dataIso)}`);
}
byId("kan-confirmar-semana-btn").addEventListener("click", () => {
  confirmarKanCards(kanLastCards, "a semana em exibição");
});

/* ---------------- abas Grade / Ficha / Painel de execução ---------------- */
document.querySelectorAll(".hor-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".hor-tab").forEach(b => b.classList.toggle("active", b === btn));
    const tab = btn.dataset.horTab;
    byId("hor-panel-grade").classList.toggle("hidden", tab !== "grade");
    byId("hor-panel-ficha").classList.toggle("hidden", tab !== "ficha");
    byId("hor-panel-kanban").classList.toggle("hidden", tab !== "kanban");
    if (tab === "kanban") renderKanban();
  });
});

function renderHorarios() {
  if (!horTurmaAtual || !turmasList.some(t => t.id === horTurmaAtual)) {
    horTurmaAtual = (turmasList.find(t => horarioSemanal.some(r => r.turma_id === t.id)) || turmasList[0] || {}).id || null;
  }
  if (horSemanaAtual === null || !horWeeksForTurma(horTurmaAtual).includes(horSemanaAtual)) {
    horSemanaAtual = horDefaultSemana(horTurmaAtual);
  }
  renderHorTurmaTabs();
  renderHorWeekNav();
  renderHorGrid();
  renderHorNovaSemanaBtn();
  populateFichaMesSelects();
  renderFichaResumo();
  renderKanban();
}

function renderOverview() {
  const ativos = students.filter(s => s.status === "ativo");
  const desistentes = students.filter(s => s.status === "desistente");

  byId("stat-total").textContent = ativos.length;
  byId("stat-total-sub").textContent = `${desistentes.length} desistentes / cancelados`;

  // uma barra por turma REAL do ano selecionado, contada por id (antes a lista era fixa pelo nome das turmas de 2026)
  const counts = new Map(turmasList.map(t => [t.id, 0]));
  ativos.forEach(s => { if (s.turmaId && counts.has(s.turmaId)) counts.set(s.turmaId, counts.get(s.turmaId) + 1); });
  const max = Math.max(1, ...counts.values());
  byId("turma-bars").innerHTML = turmasList.map(t => `
    <div class="turma-bar-row">
      <span class="t-name">${esc(t.nome)}</span>
      <div class="turma-bar-track"><div class="turma-bar-fill" style="width:${counts.get(t.id) / max * 100}%"></div></div>
      <span class="t-count">${counts.get(t.id)}</span>
    </div>`).join("") || '<span class="hint">Nenhuma turma cadastrada neste ano.</span>';

  byId("stat-desistentes").textContent = desistentes.length;
  byId("stat-desistentes-total").textContent = students.length;

  const bolsas = students.filter(s => s.tipo === "bolsa 100%");
  byId("stat-bolsas").textContent = bolsas.length;

  const semTurma = students.filter(s => !s.turmaId);
  byId("attention-count").textContent = semTurma.length;
  byId("attention-body").innerHTML = semTurma.map(s => `
    <tr onclick="openDrawer('${s.id}')">
      <td>${personCellHTML(s)}</td>
      <td><span class="turma-tag">Sem turma</span></td>
      <td><span class="pill late">Desistente</span></td>
      <td style="color:var(--text-muted)">Turma (Pré-CEFET 1 ou 2) não confirmada na planilha original — checar manualmente</td>
    </tr>`).join("") || `<tr><td colspan="4" class="empty-note">Nenhuma pendência no momento 🎉</td></tr>`;
}

/* ===================== render: students table ===================== */
function renderStudents() {
  const q = byId("search-input").value.trim().toLowerCase();
  const turmaF = byId("filter-turma").value;
  const statusF = byId("filter-status").value;

  const filtered = students.filter(s => {
    if (turmaF && s.turmaId !== turmaF) return false;
    if (statusF && s.status !== statusF) return false;
    if (q) {
      const hay = (s.nome + " " + (s.responsavel || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  byId("students-count").textContent = filtered.length;
  byId("students-body").innerHTML = filtered.map(s => {
    const sit = situacao(s);
    return `<tr onclick="openDrawer('${s.id}')">
      <td>${personCellHTML(s)}</td>
      <td><span class="turma-tag">${esc(s.turmaNome || "Sem turma")}</span></td>
      <td>${esc(s.responsavel)}<div class="p-sub">${esc(s.telResp || "—")}</div></td>
      <td><span class="pill ${sit.cls}">${sit.label}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="4" class="empty-note">Nenhum aluno encontrado com esse filtro.</td></tr>`;
}

/* ===================== render: financeiro ===================== */
function renderFinanceiro() {
  const ativosIntegral = students.filter(s => s.status === "ativo" && s.tipo !== "bolsa 100%");
  const total = ativosIntegral.reduce((sum, s) => sum + (Number(s.mensalidade) || 0), 0);
  byId("fin-total").textContent = fmtBRL(total);
  byId("fin-ok").textContent = students.filter(s => s.status === "ativo").length;
  byId("fin-scholarship").textContent = students.filter(s => s.tipo === "bolsa 100%").length;

  const q = byId("fin-search-input").value.trim().toLowerCase();
  const turmaF = byId("fin-filter-turma").value;
  const statusF = byId("fin-filter-status").value;
  const tipoF = byId("fin-filter-tipo").value;
  const vencF = byId("fin-filter-vencimento").value;

  const filtered = students.filter(s => {
    if (turmaF && s.turmaId !== turmaF) return false;
    if (statusF && s.status !== statusF) return false;
    if (tipoF === "bolsa 100%" && s.tipo !== "bolsa 100%") return false;
    if (tipoF === "integral" && s.tipo === "bolsa 100%") return false;
    if (vencF && s.vencimento !== vencF) return false;
    if (q) {
      const hay = (s.nome + " " + (s.responsavel || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  byId("financeiro-count").textContent = filtered.length;
  byId("financeiro-body").innerHTML = filtered.map(s => {
    const sit = situacao(s);
    return `<tr onclick="openDrawer('${s.id}')">
      <td>${personCellHTML(s)}</td>
      <td><span class="turma-tag">${esc(s.turmaNome || "Sem turma")}</span></td>
      <td class="mono">${s.tipo === "bolsa 100%" ? "Bolsa 100%" : fmtBRL(s.mensalidade)}</td>
      <td class="mono">${s.vencimento === "—" ? "—" : "dia " + esc(s.vencimento)}</td>
      <td><span class="pill ${sit.cls}">${sit.label}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" class="empty-note">Nenhum aluno encontrado com esse filtro.</td></tr>`;
}

/* ===================== render: material ===================== */
function renderMaterial() {
  byId("material-body").innerHTML =
    `<tr><td colspan="6" class="empty-note">Dados de apostila e uniforme ainda não foram importados para o painel.</td></tr>`;
}

/* ===================== render: fotos por aluno (tabela unificada) ===================== */
function renderFotosTabela() {
  const q = byId("fotos-tabela-search").value.trim().toLowerCase();
  const turmaF = byId("fotos-tabela-filter-turma").value;
  const statusF = byId("fotos-tabela-filter-status").value;
  const soSemFoto = byId("fotos-tabela-so-sem-foto").checked;

  const filtered = students
    .filter(s => {
      if (soSemFoto && s.fotoUrl) return false;
      if (turmaF && s.turmaId !== turmaF) return false;
      if (statusF && s.status !== statusF) return false;
      if (q && !s.nome.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  byId("fotos-tabela-count").textContent = filtered.length;

  const statusEl = byId("fotos-tabela-status");
  const comFoto = filtered.filter(s => s.fotoUrl);
  statusEl.textContent = filtered.length
    ? `${filtered.length - comFoto.length} sem foto · ${comFoto.length} com foto nesta lista.`
    : "Nenhum aluno encontrado com esse filtro.";
  statusEl.className = "import-log-line muted";

  if (!filtered.length) {
    byId("fotos-tabela-body").innerHTML =
      `<tr><td colspan="5" class="empty-note">Nenhum aluno encontrado com esse filtro.</td></tr>`;
    return;
  }

  byId("fotos-tabela-body").innerHTML = filtered.map(s => {
    const sit = situacao(s);
    return `<tr data-student-id="${s.id}">
      <td>
        <div class="avatar foto-thumb" id="foto-thumb-${s.id}" style="background:${colorFor(s.nome)}; cursor:pointer;"${s.fotoUrl ? ` data-foto-aluno="${esc(s.id)}" data-foto-orig="${esc(s.fotoUrl)}"` : ""} onclick="openDrawer('${s.id}')">${esc(initials(s.nome))}</div>
      </td>
      <td onclick="openDrawer('${s.id}')" style="cursor:pointer;">
        <div class="p-name">${esc(s.nome)}</div>
      </td>
      <td><span class="turma-tag">${esc(s.turmaNome || "Sem turma")}</span></td>
      <td><span class="pill ${sit.cls}">${sit.label}</span></td>
      <td>
        <label class="btn btn-ghost foto-row-upload-btn" style="cursor:pointer; display:inline-flex;">
          ${s.fotoUrl ? "Trocar foto" : "Adicionar foto"}
          <input type="file" accept="image/*" data-upload-for="${s.id}" hidden>
        </label>
      </td>
    </tr>`;
  }).join("");

  // as fotos (miniaturas, quando existem) só são buscadas para as linhas que aparecem na tela
  agendarScanFotos();
}

byId("fotos-tabela-body").addEventListener("change", async (e) => {
  const input = e.target.closest("input[data-upload-for]");
  if (!input || !input.files[0]) return;
  const alunoId = input.dataset.uploadFor;
  const student = students.find(s => s.id === alunoId);
  const file = input.files[0];
  const statusEl = byId("fotos-tabela-status");

  statusEl.textContent = `Enviando foto de ${student ? student.nome : "aluno"}...`;
  statusEl.className = "import-log-line muted";

  const ext = (file.name.match(/\.(\w+)$/) || [null, "jpg"])[1].toLowerCase();
  const path = `${alunoId}.${ext}`;
  try {
    const { error: upErr } = await supabase.storage.from("fotos-alunos").upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (upErr) throw upErr;
    const { error: dbErr } = await supabase.from("alunos").update({ foto_url: path }).eq("id", alunoId);
    if (dbErr) throw dbErr;
    if (student) student.fotoUrl = path;
    fotoUrlCache.delete(path);
    // gera também a versão leve (miniatura) usada nos avatares; se falhar, o avatar usa a foto original
    try { await enviarMiniatura(alunoId, file); } catch (e) { console.warn("Miniatura não gerada:", e); }
    statusEl.textContent = `Foto de ${student ? student.nome : "aluno"} enviada com sucesso.`;
    statusEl.className = "import-log-line ok";
    renderFotosTabela();
  } catch (err) {
    statusEl.textContent = `Erro ao enviar foto de ${student ? student.nome : "aluno"}: ${err.message || err}`;
    statusEl.className = "import-log-line err";
  }
});

/* ===================== drawer ===================== */
/* Quebra o texto livre de histórico de pagamentos (separado por " / ") em itens de linha do
   tempo, tentando destacar data e valor de cada um sem perder o texto original. */
function parseHistoricoPagamentos(text){
  if(!text) return [];
  return text.split(/(?<=\s)\/(?=\s)/).map(t=>t.trim()).filter(Boolean).map(frag=>{
    const dateMatch = frag.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
    const valorMatch = frag.match(/R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}|\b\d{1,3}(?:\.\d{3})*,\d{2}\b/);
    return { text: frag, date: dateMatch ? dateMatch[0] : null, valor: valorMatch ? valorMatch[0].replace(/^R\$\s?/, '') : null };
  });
}
function historicoTimelineHTML(text){
  const items = parseHistoricoPagamentos(text);
  if(!items.length) return '';
  return `<div class="hist-timeline">${items.map(it => `
    <div class="hist-item">
      <div class="hist-dot"></div>
      <div class="hist-content">
        <div class="hist-top">
          ${it.date ? `<span class="hist-date">${esc(it.date)}</span>` : ''}
          ${it.valor ? `<span class="hist-valor">R$ ${esc(it.valor)}</span>` : ''}
        </div>
        <div class="hist-text">${esc(it.text)}</div>
      </div>
    </div>`).join('')}</div>`;
}

async function openDrawer(id) {
  const s = students.find(x => x.id === id);
  if (!s) return;
  currentDrawerId = id;
  const sit = situacao(s);
  const avatarEl = byId("d-avatar");
  avatarEl.style.backgroundImage = "";
  avatarEl.textContent = initials(s.nome);
  avatarEl.style.background = colorFor(s.nome);
  avatarEl.dataset.fullUrl = "";
  avatarEl.style.cursor = "default";
  if (s.fotoUrl) {
    // endereço guardado em memória: reabrir o mesmo aluno não baixa a foto de novo
    getFotoSignedUrlCached(s.fotoUrl).then(url => {
      if (url && byId("d-avatar").dataset.forId === id) {
        avatarEl.style.backgroundImage = `url("${url}")`;
        avatarEl.style.backgroundSize = "cover";
        avatarEl.style.backgroundPosition = "center";
        avatarEl.textContent = "";
        avatarEl.dataset.fullUrl = url;
        avatarEl.style.cursor = "pointer";
      }
    });
  }
  avatarEl.dataset.forId = id;
  byId("d-name").textContent = s.nome;
  byId("d-meta").textContent = `${s.turmaNome || "Sem turma"} · matriculado em ${fmtDate(s.matricula)}`;

  const enderecoLinha1 = [s.endereco, s.numero].filter(Boolean).join(", ") + (s.complemento ? " - " + s.complemento : "");
  const enderecoLinha2 = [s.bairro, s.cidade, s.uf].filter(Boolean).join(", ");
  const enderecoFull = [enderecoLinha1, enderecoLinha2].filter(Boolean).join(" · ") || "—";

  byId("drawer-body").innerHTML = `
    <div class="d-section">
      <h4>Dados pessoais</h4>
      <div class="d-grid">
        <div class="d-field"><div class="f-label">Nascimento</div><div class="f-value">${fmtDate(s.nascimento)}</div></div>
        <div class="d-field"><div class="f-label">Turma</div><div class="f-value">${esc(s.turmaNome || "Sem turma")}</div></div>
        <div class="d-field full"><div class="f-label">Endereço</div><div class="f-value">${esc(enderecoFull)}</div></div>
        <div class="d-field"><div class="f-label">Telefone</div><div class="f-value">${esc(s.telAluno || s.whatsappAluno || "—")}</div></div>
        <div class="d-field"><div class="f-label">E-mail</div><div class="f-value" style="font-size:12px">${esc(s.emailAluno || "—")}</div></div>
        <div class="d-field"><div class="f-label">RG</div><div class="f-value">${esc(s.rg || "—")}</div></div>
        <div class="d-field"><div class="f-label">CPF</div><div class="f-value">${esc(s.cpf || "—")}</div></div>
      </div>
    </div>
    <div class="d-section">
      <h4>Responsável</h4>
      <div class="d-grid">
        <div class="d-field full"><div class="f-label">Nome</div><div class="f-value">${esc(s.responsavel)}</div></div>
        <div class="d-field"><div class="f-label">Telefone</div><div class="f-value">${esc(s.telResp || "—")}</div></div>
        <div class="d-field"><div class="f-label">E-mail</div><div class="f-value" style="font-size:12px">${esc(s.emailResp || "—")}</div></div>
        <div class="d-field"><div class="f-label">Profissão</div><div class="f-value">${esc(s.profissaoResp || "—")}</div></div>
      </div>
    </div>
    <div class="d-section">
      <h4>Matrícula</h4>
      <div class="d-grid">
        <div class="d-field full"><div class="f-label">Situação da matrícula</div><div class="f-value"><span class="pill ${sit.cls}">${sit.label}</span></div></div>
      </div>
    </div>
    ${true ? `
    <div class="d-section">
      <h4>Financeiro</h4>
      <div id="d-fin-body"></div>
      <div class="f-label" style="margin:16px 0 8px">Plano de pagamento</div>
      <div class="d-grid">
        <div class="d-field"><div class="f-label">Mensalidade</div><div class="f-value mono">${s.tipo === "bolsa 100%" ? "Bolsa 100%" : fmtBRL(s.mensalidade)}</div></div>
        <div class="d-field"><div class="f-label">Vencimento</div><div class="f-value mono">${s.vencimento === "—" ? "—" : "dia " + esc(s.vencimento)}</div></div>
        ${s.matriculaRaw ? `<div class="d-field full"><div class="f-label">Matrícula (valor / forma)</div><div class="f-value" style="font-weight:500">${esc(s.matriculaRaw)}</div></div>` : ""}
      </div>
      ${s.historico ? `<div style="margin-top:16px"><div class="f-label" style="margin-bottom:10px">Histórico de transações</div>${historicoTimelineHTML(s.historico)}</div>` : ""}
    </div>` : ""}
    <div class="d-section">
      <h4>Observações</h4>
      <textarea id="d-observacoes" placeholder="Anotações internas sobre o aluno (comportamento, atendimentos, combinados com a família etc.)" style="width:100%; min-height:90px; resize:vertical; font-family:var(--font-body); font-size:13.5px; line-height:1.6; padding:14px 16px; border:none; border-left:3px solid var(--gold); border-radius:8px; background:var(--surface-2); color:var(--text); transition:background-color .35s var(--ease-out-quart), box-shadow .2s var(--ease-out-quart);">${esc(s.observacoes || "")}</textarea>
      <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:8px;">
        <span id="d-observacoes-status" style="font-size:12px; color:var(--text-faint);"></span>
        <button class="btn btn-primary" type="button" id="d-observacoes-save" data-student-id="${esc(id)}" style="padding:8px 16px;">Salvar observações</button>
      </div>
    </div>
    <div class="d-section" id="d-simulado-section">
      <h4>Simulados</h4>
      <div id="d-simulado-body"><div class="f-value" style="font-weight:500; color:var(--text-faint);">Carregando…</div></div>
    </div>
  `;
  byId("drawer").classList.add("open");
  byId("drawer-backdrop").classList.add("open");
  renderDrawerFinanceiro(id);

  loadDrawerSimulado(id).then(row => {
    if (currentDrawerId !== id) return;
    const body = byId("d-simulado-body");
    if (!body) return;
    if (!row) {
      body.innerHTML = `<div class="f-value" style="font-weight:500; color:var(--text-faint);">Nenhum simulado registrado ainda.</div>`;
      return;
    }
    const pct = row.pct !== null && row.pct !== undefined ? Number(row.pct) : null;
    const cls = row.acertos === null || row.acertos === undefined ? "pending" : (pct !== null && pct >= 60 ? "ok" : (pct !== null && pct >= 40 ? "pending" : "late"));
    const label = row.acertos === null || row.acertos === undefined
      ? "Faltou"
      : `${row.acertos}/50${pct !== null ? " · " + pct.toFixed(1) + "%" : ""}`;
    body.innerHTML = `
      <div class="d-grid">
        <div class="d-field full">
          <div class="f-label">${esc(row.simulado ? row.simulado.nome : "Simulado")}</div>
          <div class="f-value"><span class="pill ${cls}">${esc(label)}</span></div>
        </div>
      </div>
      <button class="btn btn-ghost" type="button" id="d-sim-goto-btn" style="margin-top:10px; width:100%; justify-content:center;">Ver simulado completo</button>
    `;
    byId("d-sim-goto-btn").addEventListener("click", () => {
      goToSimuladoStudent(s.nome, row.simulado ? row.simulado.id : null);
    });
  }).catch(err => {
    console.error(err);
    const body = byId("d-simulado-body");
    if (body) body.textContent = "Erro ao carregar simulado.";
  });
}
function closeDrawer() {
  byId("drawer").classList.remove("open");
  byId("drawer-backdrop").classList.remove("open");
}
byId("drawer-close").addEventListener("click", closeDrawer);
byId("drawer-backdrop").addEventListener("click", closeDrawer);

/* ===================== ampliar foto do aluno ===================== */
function openPhotoLightbox(url, name) {
  if (!url) return;
  byId("photo-lightbox-img").src = url;
  byId("photo-lightbox-name").textContent = name || "";
  byId("photo-lightbox-backdrop").classList.add("open");
}
function closePhotoLightbox() {
  byId("photo-lightbox-backdrop").classList.remove("open");
  byId("photo-lightbox-img").src = "";
}
byId("d-avatar").addEventListener("click", () => {
  const url = byId("d-avatar").dataset.fullUrl;
  if (!url) return;
  const s = students.find(x => x.id === currentDrawerId);
  openPhotoLightbox(url, s ? s.nome : "");
});
byId("photo-lightbox-close").addEventListener("click", closePhotoLightbox);
byId("photo-lightbox-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "photo-lightbox-backdrop") closePhotoLightbox();
});

/* ===================== editar / excluir matrícula ===================== */
function openEditForm(id) {
  const s = students.find(x => x.id === id);
  if (!s) return;
  editingStudentId = id;
  closeDrawer();
  goto("form");

  byId("form-title").textContent = "Editar matrícula";
  byId("form-subtitle").textContent = `Editando os dados de ${s.nome}`;
  byId("save-form-btn-label").textContent = "Salvar alterações";

  byId("f-turma").value = s.turmaId || "";
  byId("f-data-matricula").value = s.matricula || "";

  byId("f-aluno-nome").value = s.nome || "";
  byId("f-aluno-nascimento").value = s.nascimento || "";
  byId("f-aluno-local-nasc").value = s.localNascimento || "";
  byId("f-aluno-endereco").value = s.endereco || "";
  byId("f-aluno-bairro").value = s.bairro || "";
  byId("f-aluno-cidade").value = s.cidade || "";
  byId("f-aluno-cep").value = s.cep || "";
  byId("f-aluno-uf").value = s.uf || "";
  byId("f-aluno-tel").value = s.telAluno || s.whatsappAluno || "";
  byId("f-aluno-email").value = s.emailAluno || "";
  byId("f-aluno-rg").value = s.rg || "";
  byId("f-aluno-rg-orgao").value = s.rgOrgao || "";
  byId("f-aluno-rg-data").value = s.rgData || "";
  byId("f-aluno-cpf").value = s.cpf ? maskCPF(s.cpf) : "";

  byId("f-resp-nome").value = s.responsavel && s.responsavel !== "—" ? s.responsavel : "";
  byId("f-resp-nascimento").value = s.respNascimento || "";
  byId("f-resp-profissao").value = s.profissaoResp || "";
  byId("f-resp-tel").value = s.telResp || "";
  byId("f-resp-email").value = s.emailResp || "";
  byId("f-resp-rg").value = s.respRg || "";
  byId("f-resp-rg-orgao").value = s.respRgOrgao || "";
  byId("f-resp-rg-data").value = s.respRgData || "";
  byId("f-resp-cpf").value = s.respCpf ? maskCPF(s.respCpf) : "";

  const moneyStr = formatMoneyBR;
  byId("f-fin-valor-matricula").value = moneyStr(s.finValorMatricula);
  byId("f-fin-data-pagamento").value = s.finDataPagMatricula || "";
  if (s.finFormaMatricula) byId("f-fin-forma").value = s.finFormaMatricula;
  byId("f-fin-total").value = moneyStr(s.finTotalCurso);
  byId("f-fin-parcelas").value = s.finQtdParcelas || "";
  byId("f-fin-valor-parcela").value = moneyStr(s.mensalidade);
  byId("f-fin-vencimento").value = s.vencimento && s.vencimento !== "—" ? s.vencimento : "";
  byId("f-fin-apostila-valor").value = "";
  byId("f-fin-apostila-forma").value = "";
  byId("f-fin-apostila-parcelas").value = "";
  byId("f-fin-apostila-data").value = "";
  carregarMaterialNoForm(id, moneyStr);

  ["f-aluno-tel", "f-resp-tel"].forEach(id => { const el = byId(id); el.value = maskPhoneBR(el.value); });
  ["f-aluno-tel", "f-resp-tel", "f-aluno-rg", "f-resp-rg", "f-aluno-email", "f-resp-email", "f-aluno-nascimento", "f-resp-nascimento", "f-aluno-rg-data", "f-resp-rg-data"]
    .forEach(id => { const el = byId(id); if (el && el._atualizarDica) el._atualizarDica(); });
  // revalida os campos de CPF pré-preenchidos
  ["f-aluno-cpf", "f-resp-cpf"].forEach(id => byId(id).dispatchEvent(new Event("input")));
  checkSelfResponsavelWarning();
}

/* preenche os campos do material didático (tabela material_didatico) ao editar um aluno */
async function carregarMaterialNoForm(alunoId, moneyStr) {
  try {
    const { data } = await supabase.from("material_didatico").select("valor, forma_pagamento, data_pagamento").eq("aluno_id", alunoId).eq("tipo", "apostila").maybeSingle();
    if (!data || editingStudentId !== alunoId) return;
    byId("f-fin-apostila-valor").value = moneyStr(data.valor);
    const m = /^(.*?)(?: em (\d+)x)?$/.exec(data.forma_pagamento || "");
    if (m && m[1]) byId("f-fin-apostila-forma").value = m[1];
    byId("f-fin-apostila-parcelas").value = (m && m[2]) || "";
    byId("f-fin-apostila-data").value = data.data_pagamento || "";
  } catch (e) { console.error("Material didático indisponível:", e); }
}

async function deleteStudent(id) {
  const s = students.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`Tem certeza que deseja excluir "${s.nome}"? Essa ação não pode ser desfeita — os dados financeiros e de matrícula desse aluno também serão apagados.`)) return;

  const deleteBtn = byId("drawer-delete-btn");
  deleteBtn.disabled = true; deleteBtn.textContent = "Excluindo...";

  try {
    if (s.finId) {
      const { error: finErr } = await supabase.from("matricula_financeiro").delete().eq("aluno_id", id);
      if (finErr) throw finErr;
    }
    const { error: alunoErr } = await supabase.from("alunos").delete().eq("id", id);
    if (alunoErr) throw alunoErr;
    if (s.fotoUrl) {
      // melhor esforço — não bloqueia a exclusão se falhar
      supabase.storage.from("fotos-alunos").remove([s.fotoUrl, fotoThumbPath(s.id)]).catch(() => {});
      fotoThumbIds.delete(s.id); fotoUrlCache.delete(s.fotoUrl);
    }
    closeDrawer();
    await loadStudents();
    applyAnoLetivoFilter();
    renderAll();
    alert(`Aluno "${s.nome}" excluído com sucesso.`);
  } catch (err) {
    console.error(err);
    alert("Erro ao excluir aluno: " + (err.message || err));
  } finally {
    deleteBtn.disabled = false;
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>Excluir aluno`;
  }
}

byId("drawer-edit-btn").addEventListener("click", () => { if (currentDrawerId) openEditForm(currentDrawerId); });
byId("drawer-delete-btn").addEventListener("click", () => { if (currentDrawerId) deleteStudent(currentDrawerId); });

byId("drawer-body").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("#d-observacoes-save");
  if (!btn) return;
  const studentId = btn.dataset.studentId;
  const textarea = byId("d-observacoes");
  const statusEl = byId("d-observacoes-status");
  if (!studentId || !textarea) return;
  const novoValor = textarea.value.trim();
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "Salvando…";
  if (statusEl) statusEl.textContent = "";
  try {
    const { error } = await supabase.from("alunos").update({ observacoes: novoValor || null }).eq("id", studentId);
    if (error) throw error;
    const s = students.find(x => x.id === studentId);
    if (s) s.observacoes = novoValor;
    if (statusEl) {
      statusEl.textContent = "Salvo ✓";
      statusEl.style.color = "var(--success)";
      setTimeout(() => { if (statusEl.textContent === "Salvo ✓") statusEl.textContent = ""; }, 3000);
    }
  } catch (err) {
    alert("Erro ao salvar observações: " + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

document.querySelector('.nav-item[data-view="form"]').addEventListener("click", () => {
  editingStudentId = null;
  document.querySelectorAll("#view-form input[type=text], #view-form input[type=email], #view-form input[type=tel], #view-form input[type=date]:not(#f-data-matricula)").forEach(i => i.value = "");
  document.querySelectorAll("#view-form .cpf-hint").forEach(h => { h.textContent = ""; h.className = "cpf-hint"; });
  document.querySelectorAll("#view-form .cpf-valid, #view-form .cpf-invalid").forEach(i => i.classList.remove("cpf-valid", "cpf-invalid"));
  byId("form-title").textContent = "Nova matrícula";
  byId("form-subtitle").textContent = `Mesmos campos do Requerimento de Matrícula em papel — turma de ${selectedAnoLetivo}`;
  byId("save-form-btn-label").textContent = "Salvar matrícula";
  byId("self-resp-warning").hidden = true;
});

/* ===================== nav / views ===================== */
/* Redesenho sob demanda: antes, cada alteração redesenhava as 7 telas, inclusive as escondidas.
   Agora só a tela aberta é desenhada; as outras ficam marcadas como "sujas" e são desenhadas na
   hora em que a pessoa as abre. */
const VIEW_RENDERERS = {
  overview: () => renderOverview(),
  students: () => renderStudents(),
  financeiro: () => { renderFinanceiro(); renderFinPagamentos(); renderFinAtrasados(); },
  material: () => renderMaterial(),
  fotos: () => { renderFotosTabela(); atualizarCaixaMiniaturas(); },
  presencas: () => renderPresencas(),
  horarios: () => { if (horariosProntos) { esconderCarregandoHorarios(); renderHorarios(); } else { mostrarCarregandoHorarios(); garantirHorarios(); } },
};
/* horários, registros de aula e execução só são baixados na primeira vez que a aba Horários é aberta */
let horariosProntos = false, horariosPromise = null;
function mostrarCarregandoHorarios() {
  const v = byId("view-horarios");
  if (v && !byId("hor-carregando")) v.insertAdjacentHTML("afterbegin", '<p id="hor-carregando" style="padding:24px;color:var(--text-faint)">Carregando horários…</p>');
}
function esconderCarregandoHorarios() { const el = byId("hor-carregando"); if (el) el.remove(); }
function garantirHorarios() {
  if (!horariosPromise) {
    horariosPromise = Promise.all([loadHorarioSemanal(), loadRegistrosAula(), loadHorarioExecucao()])
      .then(() => { horariosProntos = true; dirtyViews.add("horarios"); desenharViewSeSuja(); })
      .catch(err => {
        horariosPromise = null;
        console.error("Erro ao carregar horários:", err);
        const el = byId("hor-carregando"); if (el) el.textContent = "Erro ao carregar os horários. Abra a aba de novo para tentar outra vez.";
      });
  }
  return horariosPromise;
}
const dirtyViews = new Set();
function nomeDaViewAtiva() {
  const v = document.querySelector(".view.active");
  return v ? v.id.replace("view-", "") : null;
}
function desenharViewSeSuja() {
  const nome = nomeDaViewAtiva();
  if (nome && dirtyViews.has(nome) && VIEW_RENDERERS[nome]) {
    dirtyViews.delete(nome);
    VIEW_RENDERERS[nome]();
  }
}
function goto(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  byId("view-" + view).classList.add("active");
  document.querySelectorAll(".nav-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  desenharViewSeSuja();
}
document.querySelectorAll(".nav-item[data-view]").forEach(b => b.addEventListener("click", () => goto(b.dataset.view)));
document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => goto(b.dataset.goto)));

byId("search-input").addEventListener("input", debounce(renderStudents));
byId("filter-turma").addEventListener("change", renderStudents);
byId("filter-status").addEventListener("change", renderStudents);

byId("fin-search-input").addEventListener("input", debounce(renderFinanceiro));
byId("fin-filter-turma").addEventListener("change", renderFinanceiro);
byId("fin-filter-status").addEventListener("change", renderFinanceiro);
byId("fin-filter-tipo").addEventListener("change", renderFinanceiro);
byId("fin-filter-vencimento").addEventListener("change", renderFinanceiro);

byId("fotos-tabela-search").addEventListener("input", debounce(renderFotosTabela));
byId("fotos-tabela-filter-turma").addEventListener("change", renderFotosTabela);
byId("fotos-tabela-filter-status").addEventListener("change", renderFotosTabela);
byId("fotos-tabela-so-sem-foto").addEventListener("change", renderFotosTabela);

wireCpfField("f-aluno-cpf", "f-aluno-cpf-hint");
wireCpfField("f-resp-cpf", "f-resp-cpf-hint");

["f-aluno-cpf", "f-resp-cpf", "f-aluno-nome", "f-resp-nome", "f-aluno-nascimento"].forEach(id => {
  byId(id).addEventListener("input", checkSelfResponsavelWarning);
});

document.querySelectorAll("[data-fotos-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-fotos-tab]").forEach(b => b.classList.toggle("active", b === btn));
    byId("fotos-tab-individual").hidden = btn.dataset.fotosTab !== "individual";
    byId("fotos-tab-lote").hidden = btn.dataset.fotosTab !== "lote";
  });
});

