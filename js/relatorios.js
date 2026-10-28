/* ===================== Relatórios do aluno (simulados) ===================== */
/* Dois relatórios, ambos A4 prontos para imprimir ou salvar em PDF:
   - do simulado aberto: só aquele simulado (nota, posição, matérias, mapa de questões);
   - geral: todos os simulados do ano em que o aluno tem nota (2, 3, 4...), com a evolução. */
function totaisDeMeta(meta) {
  const tr = meta && meta.topico_ranges;
  if (tr && tr.tipo === "por_materia" && Array.isArray(tr.materias)) return tr.materias.map(([nome, total]) => ({ nome, total }));
  if (tr && Array.isArray(tr.ranges)) return tr.ranges.map(([nome, a, b]) => ({ nome, total: b - a + 1 }));
  return DEFAULT_TOPIC_ORDER.map(nome => ({ nome, total: DEFAULT_TOPIC_TOTALS[nome] }));
}
function mediaDe(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function turmaRelatorio(turmaId) {
  const t = allTurmasRaw.find(x => x.id === turmaId);
  return t ? (t.tipo === "CEFET" ? "Pré-CEFET" : t.nome) : "";
}
function nivelPct(p) {
  if (p >= 70) return { cls: "forte", txt: "Ponto forte" };
  if (p >= 50) return { cls: "bom", txt: "Bom" };
  if (p >= 35) return { cls: "reg", txt: "Atenção" };
  return { cls: "fraco", txt: "Prioridade" };
}
function corCelula(p) { return p == null ? "#f1f1f1" : p >= 70 ? "#cfeedd" : p >= 50 ? "#e6f3d5" : p >= 35 ? "#fde9c2" : "#f7cfca"; }
function pctTxt(n) { return n == null ? "—" : Math.round(n) + "%"; }
function relTopo(titulo, sub) {
  return `<div class="rel-top"><img src="${docAsset("doc-requerimento-topo.png")}" alt=""><div class="t"><h1>${docEsc(titulo)}</h1><div class="s">${docEsc(sub)}</div></div></div>`;
}
function relRodape(pagina) {
  return `<div class="rel-rodape"><span>Percurso Cataguases · Pré-CEFET</span><span>Gerado em ${docEsc(fmtDate(hojeISO()))}${pagina ? " · " + docEsc(pagina) : ""}</span></div>`;
}
function relOrientacoes(fracos, fortes) {
  const li = [];
  if (fracos.length) li.push(`<li><b>Prioridade de estudo:</b> ${fracos.map(w => docEsc(w.nome) + (w.total ? ` (${w.n}/${w.total})` : "")).join(", ")}. Vale escolher uma matéria por semana e resolver questões desse conteúdo.</li>`);
  if (fortes.length) li.push(`<li><b>Manter o ritmo em:</b> ${fortes.map(w => docEsc(w.nome)).join(", ")} — é onde o aluno já tem boa base.</li>`);
  li.push(`<li><b>Combinado:</b> revisar as questões erradas e tirar as dúvidas na monitoria antes do próximo simulado.</li>`);
  return `<ul>${li.join("")}</ul>`;
}

/* ---------- relatório do simulado aberto ---------- */
function relatorioSimuladoHTML(s) {
  const meta = currentSimuladoMeta || {};
  const presentes = STUDENTS.filter(x => x.acertos !== null && x.acertos !== undefined);
  const mesmaTurma = presentes.filter(x => x.turma === s.turma);
  const pos = 1 + presentes.filter(x => x.acertos > s.acertos).length;
  const mediaGeral = mediaDe(presentes.map(x => x.acertos)), mediaTurma = mediaDe(mesmaTurma.map(x => x.acertos));
  const linhas = TOPIC_ORDER.map(nome => {
    const total = TOPIC_TOTALS[nome], n = s.topicos[nome] || 0;
    const pct = n / total * 100;
    const mg = mediaDe(presentes.map(x => (x.topicos[nome] || 0) / total * 100));
    const mt = mediaDe(mesmaTurma.map(x => (x.topicos[nome] || 0) / total * 100));
    return { nome, total, n, pct, mg, mt };
  });
  const ordenado = [...linhas].sort((a, b) => b.pct - a.pct);
  const fortes = ordenado.filter(w => w.pct >= 60).slice(0, 2);
  const fracos = [...ordenado].reverse().filter(w => w.pct < 50).slice(0, 3);
  const base = simRodadaBase(s);
  const comp = base ? (() => {
    const d = s.acertos - base.acertos;
    return `<p style="margin:6px 0 0">Em relação ao <b>${docEsc(simRodadaCurta(base.label))}</b> (${base.acertos}/50): ${d > 0 ? `<b style="color:#1b7f4b">+${d} acertos</b>` : d < 0 ? `<b style="color:#c0392b">${d} acertos</b>` : "<b>mesma quantidade de acertos</b>"}.</p>`;
  })() : "";
  const mapa = (s.ok && s.ok.length) ? `
    <h2>MAPA DE QUESTÕES</h2>
    <div class="rel-mapa">${s.ok.map((v, i) => `<div class="rel-q ${v ? "ok" : "no"}">${i + 1}${v ? " ✓" : " ✗"}</div>`).join("")}</div>
    <div style="font-size:9px;color:#666;margin-top:4px">✓ acertou · ✗ errou ou deixou em branco. Para revisar: ${s.ok.map((v, i) => v ? null : `Q${i + 1} (marcou ${s.marc && s.marc[i] ? docEsc(s.marc[i]) : "—"}, certa ${s.gab && s.gab[i] ? docEsc(s.gab[i]) : "—"})`).filter(Boolean).join(" · ") || "nenhuma — acertou tudo!"}</div>` : "";
  return `<section class="rel">
    ${relTopo("Relatório individual de desempenho", (meta.nome || "Simulado") + (meta.data_aplicacao ? " · aplicado em " + fmtDate(meta.data_aplicacao) : ""))}
    <div class="rel-body">
      <div class="rel-aluno"><div><div class="n">${docEsc(s.nome)}</div><div class="m">${docEsc(turmaRelatorio(s.turma))}${turmaShort(s.turma) !== "—" ? " · " + docEsc(turmaShort(s.turma)) : ""}</div></div></div>
      <div class="rel-kpis">
        <div class="rel-kpi"><div class="kv">${s.acertos}<small>/50</small></div><div class="kl">Acertos</div></div>
        <div class="rel-kpi"><div class="kv">${fmt1(s.pct)}%</div><div class="kl">Aproveitamento</div></div>
        <div class="rel-kpi"><div class="kv">${pos}º<small> de ${presentes.length}</small></div><div class="kl">Posição geral</div></div>
        <div class="rel-kpi"><div class="kv">${mediaGeral == null ? "—" : fmt1(mediaGeral)}</div><div class="kl">Média geral (acertos)</div></div>
        <div class="rel-kpi"><div class="kv">${mediaTurma == null ? "—" : fmt1(mediaTurma)}</div><div class="kl">Média da turma</div></div>
      </div>
      ${comp}
      <h2>DESEMPENHO POR MATÉRIA</h2>
      <table class="rel-t"><thead><tr><th>Matéria</th><th>Acertos</th><th style="width:34%">Aproveitamento</th><th>Turma</th><th>Geral</th><th>Situação</th></tr></thead><tbody>
        ${linhas.map(l => { const nv = nivelPct(l.pct); return `<tr><td><b>${docEsc(l.nome)}</b></td><td>${l.n}/${l.total}</td><td><div class="rb"><i style="width:${l.pct}%;background:${l.pct >= 70 ? "#1b7f4b" : l.pct >= 50 ? "#5aa469" : l.pct >= 35 ? "#d98f1e" : "#c0392b"}"></i></div></td><td>${pctTxt(l.mt)}</td><td>${pctTxt(l.mg)}</td><td><span class="rchip c-${nv.cls}">${nv.txt}</span></td></tr>`; }).join("")}
      </tbody></table>
      <div class="rel-cols" style="margin-top:4px">
        <div><h2>PONTOS FORTES</h2>${fortes.length ? `<ul>${fortes.map(w => `<li>${docEsc(w.nome)} — ${w.n}/${w.total} (${Math.round(w.pct)}%)</li>`).join("")}</ul>` : `<div style="color:#666">Nenhuma matéria acima de 60% neste simulado.</div>`}</div>
        <div><h2>PONTOS DE ATENÇÃO</h2>${fracos.length ? `<ul>${fracos.map(w => `<li>${docEsc(w.nome)} — ${w.n}/${w.total} (${Math.round(w.pct)}%)</li>`).join("")}</ul>` : `<div style="color:#666">Nenhuma matéria abaixo de 50%. Ótimo!</div>`}</div>
      </div>
      <h2>ORIENTAÇÃO DE ESTUDO</h2>
      ${relOrientacoes(fracos, fortes)}
      ${mapa}
    </div>
    ${relRodape("")}
  </section>`;
}

/* ---------- relatório geral (todos os simulados com nota) ---------- */
function dadosRelatorioGeral(s) {
  const meus = simHistoricoDe(s);
  const rodadas = simuladosList.filter(r => (SIM_HIST.todos || []).some(x => x.simId === r.id))
    .sort((a, b) => (a.data_aplicacao || "").localeCompare(b.data_aplicacao || ""));
  const itens = rodadas.map(r => {
    const meu = meus.find(p => p.simId === r.id);
    const pres = (SIM_HIST.todos || []).filter(x => x.simId === r.id && x.acertos != null);
    const feito = !!(meu && meu.acertos != null);
    const totais = totaisDeMeta(r);
    const topicos = totais.map(({ nome, total }) => ({
      nome, total,
      n: feito && meu.topicos ? (meu.topicos[nome] || 0) : null,
      pct: feito && meu.topicos ? (meu.topicos[nome] || 0) / total * 100 : null,
      mg: mediaDe(pres.filter(x => x.topicos).map(x => (x.topicos[nome] || 0) / total * 100)),
    }));
    return {
      id: r.id, nome: r.nome, data: r.data_aplicacao, feito, acertos: feito ? meu.acertos : null,
      mediaGeral: mediaDe(pres.map(x => x.acertos)),
      mediaTurma: mediaDe(pres.filter(x => x.turmaId === s.turma).map(x => x.acertos)),
      pos: feito ? 1 + pres.filter(x => x.acertos > meu.acertos).length : null, total: pres.length, topicos,
    };
  });
  return itens;
}
function relatorioGeralHTML(s, itens) {
  const feitos = itens.filter(i => i.feito);
  const meta = (it) => it.nome.replace(/\s*simulado\s*pré-cefet/i, "").trim() || it.nome;
  const melhor = feitos.reduce((a, b) => (b.acertos > (a ? a.acertos : -1) ? b : a), null);
  const primeiro = feitos[0], ultimo = feitos[feitos.length - 1];
  const variacao = feitos.length > 1 ? ultimo.acertos - primeiro.acertos : null;
  const mediaAluno = mediaDe(feitos.map(i => i.acertos));
  const nomesMat = []; itens.forEach(i => i.topicos.forEach(t => { if (!nomesMat.includes(t.nome)) nomesMat.push(t.nome); }));
  // gráfico: acertos do aluno x média geral
  const W = 660, H = 200, pad = 36, n = itens.length;
  const xs = itens.map((_, i) => n === 1 ? W / 2 : pad + i * ((W - 2 * pad) / (n - 1)));
  const y = v => H - pad - (v / 50) * (H - 2 * pad);
  const caminho = (get) => { let d = ""; itens.forEach((it, i) => { const v = get(it); if (v == null) return; d += (d ? " L " : "M ") + xs[i] + " " + y(v); }); return d; };
  const pontos = itens.map((it, i) => it.feito ? `<circle cx="${xs[i]}" cy="${y(it.acertos)}" r="5" fill="#00a651" stroke="#fff" stroke-width="2"/><text x="${xs[i]}" y="${y(it.acertos) - 10}" text-anchor="middle" font-size="12" font-weight="700">${it.acertos}</text>` : `<text x="${xs[i]}" y="${H - pad - 8}" text-anchor="middle" font-size="11" fill="#888">NP</text>`).join("");
  const rotulos = itens.map((it, i) => `<text x="${xs[i]}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#555">${docEsc(meta(it))}</text>`).join("");
  const grade = [0, 25, 50].map(v => `<line x1="${pad}" y1="${y(v)}" x2="${W - pad}" y2="${y(v)}" stroke="#ddd"/><text x="4" y="${y(v) + 4}" font-size="9" fill="#888">${v}</text>`).join("");
  const grafico = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${grade}<path d="${caminho(i => i.mediaGeral)}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="5 4"/><path d="${caminho(i => i.acertos)}" fill="none" stroke="#00a651" stroke-width="2.5"/>${pontos}${rotulos}</svg>
    <div style="font-size:9.5px;color:#555"><span style="color:#00a651;font-weight:700">━</span> acertos do aluno &nbsp; <span style="color:#888;font-weight:700">┅</span> média geral da turma Pré-CEFET</div>`;
  // leitura automática por matéria
  const analise = nomesMat.map(nome => {
    const serie = itens.map(i => { const t = i.topicos.find(x => x.nome === nome); return t && t.pct != null ? t.pct : null; }).filter(v => v != null);
    if (!serie.length) return null;
    const ini = serie[0], fim = serie[serie.length - 1];
    return { nome, ini, fim, delta: serie.length > 1 ? fim - ini : null, sempreFraco: serie.every(v => v < 50), sempreForte: serie.every(v => v >= 70) };
  }).filter(Boolean);
  const evoluiu = analise.filter(a => a.delta != null && a.delta >= 10).sort((a, b) => b.delta - a.delta);
  const caiu = analise.filter(a => a.delta != null && a.delta <= -10).sort((a, b) => a.delta - b.delta);
  const fracosSempre = analise.filter(a => a.sempreFraco), fortesSempre = analise.filter(a => a.sempreForte);
  const li = [];
  if (variacao != null) li.push(`<li><b>Evolução geral:</b> do ${docEsc(meta(primeiro))} (${primeiro.acertos}) para o ${docEsc(meta(ultimo))} (${ultimo.acertos}): ${variacao > 0 ? `<b style="color:#1b7f4b">+${variacao} acertos</b>` : variacao < 0 ? `<b style="color:#c0392b">${variacao} acertos</b>` : "<b>sem variação</b>"}. ${ultimo.mediaGeral != null && primeiro.mediaGeral != null ? `A média geral da turma foi de ${fmt1(primeiro.mediaGeral)} para ${fmt1(ultimo.mediaGeral)} no mesmo período.` : ""}</li>`);
  if (evoluiu.length) li.push(`<li><b>Evoluiu em:</b> ${evoluiu.slice(0, 3).map(a => `${docEsc(a.nome)} (${Math.round(a.ini)}% → ${Math.round(a.fim)}%)`).join(", ")}.</li>`);
  if (caiu.length) li.push(`<li><b>Caiu em:</b> ${caiu.slice(0, 3).map(a => `${docEsc(a.nome)} (${Math.round(a.ini)}% → ${Math.round(a.fim)}%)`).join(", ")}. Vale revisar esses conteúdos.</li>`);
  if (fracosSempre.length) li.push(`<li><b>Atenção contínua (abaixo de 50% em todos os simulados):</b> ${fracosSempre.map(a => docEsc(a.nome)).join(", ")}.</li>`);
  if (fortesSempre.length) li.push(`<li><b>Pontos fortes constantes:</b> ${fortesSempre.map(a => docEsc(a.nome)).join(", ")}.</li>`);
  if (!li.length) li.push(`<li>Ainda há poucos simulados para apontar tendências. O relatório se completa a cada novo simulado.</li>`);
  const considerados = feitos.map(i => meta(i)).join(", ");
  const cab = relTopo("Relatório geral de desempenho", `Simulados Pré-CEFET ${selectedAnoLetivo} · ${feitos.length} simulado${feitos.length > 1 ? "s" : ""} considerado${feitos.length > 1 ? "s" : ""}`);
  const aluno = `<div class="rel-aluno"><div><div class="n">${docEsc(s.nome)}</div><div class="m">${docEsc(turmaRelatorio(s.turma))}${turmaShort(s.turma) !== "—" ? " · " + docEsc(turmaShort(s.turma)) : ""} · Simulados considerados: ${docEsc(considerados)}</div></div></div>`;
  const p1 = `<section class="rel">${cab}<div class="rel-body">${aluno}
      <div class="rel-kpis">
        <div class="rel-kpi"><div class="kv">${feitos.length}</div><div class="kl">Simulados feitos</div></div>
        <div class="rel-kpi"><div class="kv">${mediaAluno == null ? "—" : fmt1(mediaAluno)}</div><div class="kl">Média de acertos</div></div>
        <div class="rel-kpi"><div class="kv">${melhor ? melhor.acertos : "—"}</div><div class="kl">Melhor nota${melhor ? " (" + docEsc(meta(melhor)) + ")" : ""}</div></div>
        <div class="rel-kpi"><div class="kv" style="color:${variacao == null ? "#111" : variacao >= 0 ? "#1b7f4b" : "#c0392b"}">${variacao == null ? "—" : (variacao > 0 ? "+" : "") + variacao}</div><div class="kl">Variação (1º → último)</div></div>
      </div>
      <h2>RESULTADO EM CADA SIMULADO</h2>
      <table class="rel-t"><thead><tr><th>Simulado</th><th>Data</th><th>Acertos</th><th>%</th><th>Posição</th><th>Média geral</th><th>Média da turma</th><th>Variação</th></tr></thead><tbody>
        ${itens.map((it, i) => { const ant = itens.slice(0, i).reverse().find(x => x.feito); const d = it.feito && ant ? it.acertos - ant.acertos : null;
          return `<tr><td><b>${docEsc(it.nome)}</b></td><td>${docEsc(it.data ? fmtDate(it.data) : "—")}</td><td>${it.feito ? it.acertos + "/50" : "NP"}</td><td>${it.feito ? fmt1(it.acertos * 2) + "%" : "—"}</td><td>${it.feito ? it.pos + "º de " + it.total : "—"}</td><td>${it.mediaGeral == null ? "—" : fmt1(it.mediaGeral)}</td><td>${it.mediaTurma == null ? "—" : fmt1(it.mediaTurma)}</td><td style="font-weight:700;color:${d == null ? "#666" : d > 0 ? "#1b7f4b" : d < 0 ? "#c0392b" : "#666"}">${d == null ? "—" : (d > 0 ? "+" : "") + d}</td></tr>`; }).join("")}
      </tbody></table>
      <div style="font-size:9px;color:#666;margin-top:3px">NP = não compareceu ao simulado.</div>
      <h2>EVOLUÇÃO DE ACERTOS</h2>
      ${grafico}
    </div>${relRodape("página 1 de 2")}</section>`;
  const p2 = `<section class="rel">${cab}<div class="rel-body">${aluno}
      <h2>APROVEITAMENTO POR MATÉRIA EM CADA SIMULADO</h2>
      <table class="rel-t"><thead><tr><th>Matéria</th>${itens.map(it => `<th style="text-align:center">${docEsc(meta(it))}</th>`).join("")}<th style="text-align:center">Tendência</th></tr></thead><tbody>
        ${nomesMat.map(nome => {
          const cel = itens.map(it => { const t = it.topicos.find(x => x.nome === nome); return t ? `<td style="text-align:center;background:${corCelula(t.pct)}"><b>${t.pct == null ? "NP" : Math.round(t.pct) + "%"}</b>${t.pct != null ? `<div style="font-size:8.5px;color:#555">${t.n}/${t.total}</div>` : ""}</td>` : `<td style="text-align:center;background:#f1f1f1">—</td>`; }).join("");
          const a = analise.find(x => x.nome === nome);
          const tend = !a || a.delta == null ? "—" : a.delta >= 10 ? `<span style="color:#1b7f4b;font-weight:800">▲ subiu</span>` : a.delta <= -10 ? `<span style="color:#c0392b;font-weight:800">▼ caiu</span>` : `<span style="color:#666;font-weight:700">● estável</span>`;
          return `<tr><td><b>${docEsc(nome)}</b></td>${cel}<td style="text-align:center">${tend}</td></tr>`; }).join("")}
      </tbody></table>
      <div style="font-size:9px;color:#666;margin-top:3px">Verde = 70% ou mais · amarelo = 35% a 49% · vermelho = abaixo de 35%. Tendência compara o primeiro e o último simulado em que o aluno participou.</div>
      <h2>LEITURA DO DESEMPENHO</h2>
      <ul>${li.join("")}</ul>
      <h2>ORIENTAÇÃO DE ESTUDO</h2>
      ${relOrientacoes(fracosSempre.map(a => ({ nome: a.nome })), fortesSempre.map(a => ({ nome: a.nome })))}
    </div>${relRodape("página 2 de 2")}</section>`;
  return p1 + p2;
}

/* ---------- ações (botões) ---------- */
function abrirRelatorioSimulado(nome) {
  const s = byName(nome);
  if (!s || s.acertos === null || s.acertos === undefined) { alert("Este aluno não fez este simulado."); return; }
  abrirDocumento(relatorioSimuladoHTML(s), "Relatório — " + s.nome + " — " + (currentSimuladoMeta ? currentSimuladoMeta.nome : "simulado"), docNomeArquivo("Relatorio " + simRodadaAtualCurta(), s.nome));
}
function abrirRelatorioGeral(nome) {
  const s = byName(nome);
  if (!s) return;
  const itens = dadosRelatorioGeral(s);
  if (!itens.some(i => i.feito)) { alert("Este aluno ainda não tem nota em nenhum simulado deste ano."); return; }
  abrirDocumento(relatorioGeralHTML(s, itens), "Relatório geral — " + s.nome, docNomeArquivo("Relatorio geral", s.nome));
}
function abrirRelatoriosDaRodada() {
  const lista = STUDENTS.filter(x => x.acertos !== null && x.acertos !== undefined).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (!lista.length) { alert("Nenhum aluno com nota neste simulado."); return; }
  abrirDocumento(lista.map(relatorioSimuladoHTML).join(""), `Relatórios de ${lista.length} alunos — ${currentSimuladoMeta ? currentSimuladoMeta.nome : "simulado"}`, docNomeArquivo("Relatorios " + simRodadaAtualCurta(), "todos os alunos"));
}
let relAlunoAtual = null;
function atualizarBotoesRelatorio(s) {
  relAlunoAtual = s.nome;
  const bSim = byId("btnRelSim"), bGeral = byId("btnRelGeral");
  const fez = s.acertos !== null && s.acertos !== undefined;
  bSim.textContent = "📄 Relatório do " + simRodadaAtualCurta();
  bSim.disabled = !fez; bSim.title = fez ? "" : "O aluno não fez este simulado";
  const n = simHistoricoDe(s).filter(p => p.acertos != null).length;
  bGeral.textContent = `📄 Relatório geral (${n} simulado${n === 1 ? "" : "s"})`;
  bGeral.disabled = n < 1;
  byId("btnEmailSim").disabled = bSim.disabled; byId("btnEmailGeral").disabled = bGeral.disabled;
}
byId("btnRelSim").addEventListener("click", () => relAlunoAtual && abrirRelatorioSimulado(relAlunoAtual));
byId("btnRelGeral").addEventListener("click", () => relAlunoAtual && abrirRelatorioGeral(relAlunoAtual));
byId("relTodosBtn").addEventListener("click", abrirRelatoriosDaRodada);

/* ===================== envio dos relatórios por e-mail ===================== */
/* O PDF é gerado aqui no navegador e enviado pela função `enviar-relatorio` do Supabase
   (só aceita quem está logado no painel). O remetente é o Gmail configurado nos segredos
   GMAIL_USER e GMAIL_APP_PASSWORD do projeto. */
const REL_ENVIADOS_KEY = "percurso_rel_enviados_v1";
function relEnviados() { try { return JSON.parse(localStorage.getItem(REL_ENVIADOS_KEY) || "{}"); } catch (e) { return {}; } }
function marcarEnviado(chave) { try { const o = relEnviados(); o[chave] = hojeISO(); localStorage.setItem(REL_ENVIADOS_KEY, JSON.stringify(o)); } catch (e) { /* sem armazenamento local: só não marca */ } }
function contatoDoResponsavel(s) {
  const c = (s.aluno_id && alunoPorId(s.aluno_id)) || alunoPorNome(s.nome);
  return { email: (c && c.emailResp) || "", resp: c && c.responsavel && c.responsavel !== "—" ? c.responsavel : "" };
}
function primeiroNome(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }

/* modelo da mensagem; {responsavel}, {aluno} e {simulado} são trocados no envio */
function modeloMensagem(tipo) {
  const o = tipo === "geral"
    ? "o relatório geral de desempenho de {aluno} nos simulados deste ano, com a evolução entre eles"
    : "o relatório de desempenho de {aluno} no {simulado}";
  return `Olá, {responsavel}!\n\nSegue em anexo ${o}. Nele você encontra a nota, o desempenho em cada matéria e as orientações de estudo.\n\nQualquer dúvida, estamos à disposição.\n\nEquipe Percurso Cataguases`;
}
function aplicarModelo(txt, s, contato) {
  return txt.split("{responsavel}").join(contato.resp || "responsável")
    .split("{aluno}").join(primeiroNome(s.nome) ? s.nome : "seu(sua) filho(a)")
    .split("{simulado}").join(currentSimuladoMeta ? currentSimuladoMeta.nome : "simulado");
}
function prepararRelatorio(tipo, s) {
  if (tipo === "geral") {
    const itens = dadosRelatorioGeral(s);
    const n = itens.filter(i => i.feito).length;
    return { html: relatorioGeralHTML(s, itens), assunto: `Relatório geral de desempenho — ${s.nome}`, arquivo: docNomeArquivo("Relatorio geral", s.nome), chave: `geral|${s.nome}|${n}`, ok: n > 0, folhas: 2 };
  }
  const nomeSim = currentSimuladoMeta ? currentSimuladoMeta.nome : "Simulado";
  return { html: relatorioSimuladoHTML(s), assunto: `Relatório de desempenho — ${s.nome} — ${nomeSim}`, arquivo: docNomeArquivo("Relatorio " + simRodadaAtualCurta(), s.nome), chave: `${currentSimuladoMeta ? currentSimuladoMeta.id : ""}|${s.nome}`, ok: s.acertos !== null && s.acertos !== undefined, folhas: 1 };
}

/* PDF leve para e-mail (~300 KB por folha), montado numa janela escondida */
async function pdfBase64DeHTML(corpoHTML, titulo) {
  const fr = document.createElement("iframe");
  fr.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0";
  document.body.appendChild(fr);
  try {
    await new Promise(ok => { fr.onload = ok; fr.srcdoc = docMontar(corpoHTML, titulo); });
    await new Promise(r => setTimeout(r, 250));
    const pdf = await docConstruirPdf(fr, 1.4, 0.8);
    return pdf.output("datauristring").split(",")[1];
  } finally { fr.remove(); }
}
async function enviarRelatorioEmail({ para, assunto, mensagem, html, arquivo }) {
  const pdf = await pdfBase64DeHTML(html, assunto);
  const { data, error } = await supabase.functions.invoke("enviar-relatorio", { body: { para, assunto, mensagem, arquivo, pdf_base64: pdf } });
  if (error) {
    let j = {};
    try { j = await error.context.json(); } catch (e) { /* sem corpo */ }
    const err = new Error(j.erro || error.message || "falha");
    err.codigo = j.erro || "falha"; err.detalhe = j.detalhe || "";
    throw err;
  }
  return data;
}
function textoErroEnvio(e) {
  switch (e.codigo) {
    case "sem_configuracao": return "O envio por e-mail ainda não foi configurado no servidor (faltam o Gmail e a senha de app). Veja as instruções que o Claude passou.";
    case "nao_autorizado": return "Sua sessão expirou. Entre no painel de novo e tente outra vez.";
    case "email_invalido": return "O e-mail do responsável parece inválido.";
    case "pdf_invalido_ou_grande": return "O PDF ficou grande demais para enviar.";
    case "falha_no_envio": return "O Gmail recusou o envio" + (e.detalhe ? " (" + e.detalhe + ")" : "") + ". Confira a senha de app.";
    default: return "Não consegui enviar: " + (e.message || e);
  }
}

/* ---------- envio de um relatório ---------- */
function abrirModalEmail(tipo, nome) {
  const s = byName(nome);
  if (!s) return;
  const rel = prepararRelatorio(tipo, s);
  if (!rel.ok) { alert(tipo === "geral" ? "Este aluno ainda não tem nota em nenhum simulado deste ano." : "Este aluno não fez este simulado."); return; }
  const contato = contatoDoResponsavel(s);
  const ov = abrirModal(`
    <h3 style="margin:0 0 4px;font-size:17px">Enviar relatório ao responsável</h3>
    <p style="margin:0 0 12px;font-size:13px;color:var(--text-muted)">${esc(s.nome)} · ${tipo === "geral" ? "relatório geral" : "relatório do simulado"} em PDF anexo${contato.resp ? " · responsável: " + esc(contato.resp) : ""}</p>
    <div class="form-fields" style="grid-template-columns:1fr">
      <div class="form-field"><label>Para (e-mail do responsável)</label><input type="text" id="em-para" value="${esc(contato.email)}" placeholder="responsavel@email.com"></div>
      <div class="form-field"><label>Assunto</label><input type="text" id="em-assunto" value="${esc(rel.assunto)}"></div>
      <div class="form-field"><label>Mensagem</label><textarea id="em-msg" rows="9" style="width:100%;resize:vertical;font-family:inherit;font-size:13.5px;line-height:1.5;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text)">${esc(aplicarModelo(modeloMensagem(tipo), s, contato))}</textarea></div>
    </div>
    <div id="em-erro" class="cpf-hint invalid" style="margin-top:10px"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px">
      <button class="btn btn-ghost" id="em-cancelar" type="button">Cancelar</button>
      <button class="btn btn-primary" id="em-enviar" type="button">Enviar e-mail</button>
    </div>`, { largura: 600 });
  const $ = id => ov.querySelector("#" + id);
  $("em-cancelar").onclick = fecharModal;
  $("em-enviar").onclick = async () => {
    const para = $("em-para").value.trim();
    if (!para) { $("em-erro").textContent = "Informe o e-mail do responsável."; return; }
    if (valEmail(para)) { $("em-erro").textContent = valEmail(para); return; }
    $("em-erro").textContent = "";
    $("em-enviar").disabled = true; $("em-enviar").textContent = "Gerando PDF e enviando…";
    try {
      await enviarRelatorioEmail({ para, assunto: $("em-assunto").value.trim(), mensagem: $("em-msg").value, html: rel.html, arquivo: rel.arquivo });
      marcarEnviado(rel.chave);
      fecharModal();
      modalMensagem("E-mail enviado ✓", `O relatório de <b>${esc(s.nome)}</b> foi enviado para <b>${esc(para)}</b>.`, `<button class="btn btn-primary" id="em-ok" type="button">Ok</button>`).querySelector("#em-ok").onclick = fecharModal;
    } catch (e) {
      console.error(e);
      $("em-erro").textContent = textoErroEnvio(e);
      $("em-enviar").disabled = false; $("em-enviar").textContent = "Enviar e-mail";
    }
  };
}

/* ---------- envio para todos os responsáveis da rodada ---------- */
function abrirModalEmailTodos() {
  const lista = STUDENTS.filter(x => x.acertos !== null && x.acertos !== undefined).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (!lista.length) { alert("Nenhum aluno com nota neste simulado."); return; }
  const enviados = relEnviados();
  const linhas = lista.map(s => {
    const c = contatoDoResponsavel(s), valido = c.email && !valEmail(c.email);
    const jaEnviado = enviados[`${currentSimuladoMeta ? currentSimuladoMeta.id : ""}|${s.nome}`];
    return { s, c, valido, jaEnviado };
  });
  const semEmail = linhas.filter(l => !l.valido).length;
  const ov = abrirModal(`
    <h3 style="margin:0 0 4px;font-size:17px">Enviar relatórios aos responsáveis</h3>
    <p style="margin:0 0 10px;font-size:13px;color:var(--text-muted)">${esc(currentSimuladoMeta ? currentSimuladoMeta.nome : "Simulado")} · cada responsável recebe o relatório do próprio aluno em PDF.${semEmail ? ` <b>${semEmail}</b> aluno(s) estão sem e-mail válido do responsável e não serão enviados.` : ""}</p>
    <div style="max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:10px">
      <table style="width:100%;font-size:12.5px;border-collapse:collapse">
        <thead><tr><th style="width:28px"><input type="checkbox" id="et-todos"></th><th style="text-align:left;padding:6px">Aluno</th><th style="text-align:left;padding:6px">Responsável / e-mail</th><th style="text-align:left;padding:6px;width:110px">Situação</th></tr></thead>
        <tbody>${linhas.map((l, i) => `<tr style="border-top:1px solid var(--border)"><td style="padding:5px;text-align:center"><input type="checkbox" class="et-ck" data-i="${i}" ${l.valido && !l.jaEnviado ? "checked" : ""} ${l.valido ? "" : "disabled"}></td><td style="padding:5px 6px">${esc(l.s.nome)}</td><td style="padding:5px 6px">${esc(l.c.resp || "—")}<div style="font-size:11px;color:var(--text-muted)">${esc(l.c.email || "sem e-mail")}</div></td><td style="padding:5px 6px" id="et-st-${i}">${l.jaEnviado ? "enviado " + esc(fmtDate(l.jaEnviado).slice(0, 5)) : (l.valido ? "pendente" : "—")}</td></tr>`).join("")}</tbody>
      </table>
    </div>
    <div class="form-field"><label>Mensagem <span style="font-weight:400;opacity:.7">({responsavel}, {aluno} e {simulado} são preenchidos para cada um)</span></label>
      <textarea id="et-msg" rows="7" style="width:100%;resize:vertical;font-family:inherit;font-size:13px;line-height:1.5;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text)">${esc(modeloMensagem("simulado"))}</textarea></div>
    <div id="et-prog" style="margin-top:10px;font-size:13px"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px">
      <button class="btn btn-ghost" id="et-fechar" type="button">Fechar</button>
      <button class="btn btn-primary" id="et-enviar" type="button">Enviar</button>
    </div>`, { largura: 720 });
  const $ = id => ov.querySelector("#" + id);
  const marcados = () => [...ov.querySelectorAll(".et-ck")].filter(c => c.checked && !c.disabled).map(c => Number(c.dataset.i));
  const rotulo = () => { $("et-enviar").textContent = `Enviar a ${marcados().length} responsável(is)`; $("et-enviar").disabled = !marcados().length; };
  ov.querySelectorAll(".et-ck").forEach(c => c.addEventListener("change", rotulo));
  $("et-todos").addEventListener("change", e => { ov.querySelectorAll(".et-ck:not(:disabled)").forEach(c => { c.checked = e.target.checked; }); rotulo(); });
  rotulo();
  let cancelar = false, enviando = false;
  $("et-fechar").onclick = () => { if (enviando && !confirm("Há envios em andamento. Parar e fechar?")) return; cancelar = true; fecharModal(); };
  $("et-enviar").onclick = async () => {
    const ids = marcados();
    if (!ids.length) return;
    enviando = true; $("et-enviar").disabled = true;
    ov.querySelectorAll(".et-ck, #et-todos").forEach(c => { c.disabled = true; });
    // envia vários ao mesmo tempo (4 por vez): cada um gera o próprio PDF e dispara o e-mail
    let ok = 0, falhas = 0, proximo = 0, erroFatal = null;
    const atualizarProg = () => { $("et-prog").textContent = `Enviados ${ok} de ${ids.length}${falhas ? " · " + falhas + " falha(s)" : ""}…`; };
    const trabalhador = async () => {
      while (!cancelar && !erroFatal) {
        const k = proximo++;
        if (k >= ids.length) return;
        const l = linhas[ids[k]], st = $("et-st-" + ids[k]);
        st.textContent = "enviando…";
        try {
          const rel = prepararRelatorio("simulado", l.s);
          await enviarRelatorioEmail({ para: l.c.email, assunto: rel.assunto, mensagem: aplicarModelo($("et-msg").value, l.s, l.c), html: rel.html, arquivo: rel.arquivo });
          marcarEnviado(rel.chave); st.textContent = "enviado ✓"; st.style.color = "var(--success)"; ok++;
        } catch (e) {
          console.error(e); falhas++; st.textContent = "falhou"; st.style.color = "var(--critical)"; st.title = textoErroEnvio(e);
          if (e.codigo === "sem_configuracao" || e.codigo === "nao_autorizado" || e.codigo === "falha_no_envio") erroFatal = e;
        }
        atualizarProg();
      }
    };
    atualizarProg();
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, trabalhador));
    if (erroFatal) {
      $("et-prog").innerHTML = `<span style="color:var(--critical)">${esc(textoErroEnvio(erroFatal))} Envio interrompido: ${ok} enviado(s), ${falhas} falha(s).</span>`;
      enviando = false; $("et-enviar").disabled = false; $("et-enviar").textContent = "Tentar de novo";
      ov.querySelectorAll(".et-ck").forEach(c => { c.disabled = !linhas[c.dataset.i].valido; }); $("et-todos").disabled = false;
      return;
    }
    enviando = false;
    $("et-prog").innerHTML = `<b>Concluído:</b> ${ok} enviado(s)${falhas ? `, <span style="color:var(--critical)">${falhas} falha(s)</span>` : ""}.`;
    $("et-enviar").style.display = "none";
  };
}

byId("btnEmailSim").addEventListener("click", () => relAlunoAtual && abrirModalEmail("simulado", relAlunoAtual));
byId("btnEmailGeral").addEventListener("click", () => relAlunoAtual && abrirModalEmail("geral", relAlunoAtual));
byId("emailTodosBtn").addEventListener("click", abrirModalEmailTodos);

