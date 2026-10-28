/* ===================== Financeiro: pagamentos, recibos e atrasos ===================== */
/* Cada pagamento registrado vira uma linha em `pagamentos` com número de recibo automático (trigger no banco).
   Parcelas ainda não pagas ficam como "pendente"; pendente com vencimento antes de hoje = atrasado. */
const RECIBO_CFG = { nome: "Percurso", documento: "30.026.277/0002-35" };
let pagamentos = [];
let pagamentosCanal = null;
let finAlertaFechado = false;

function hojeISO() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function diasEntre(isoA, isoB) { return Math.round((new Date(isoB + "T12:00:00") - new Date(isoA + "T12:00:00")) / 86400000); }
/* índices por id, refeitos só quando as listas são substituídas (loadStudents/loadTurmas) */
let _alunosIdx = null, _alunosRef = null, _turmasIdx = null, _turmasRef = null;
function alunoPorId(id) {
  if (_alunosRef !== allStudentsRaw) { _alunosIdx = new Map(allStudentsRaw.map(s => [s.id, s])); _alunosRef = allStudentsRaw; }
  return _alunosIdx.get(id) || null;
}
function turmaPorId(id) {
  if (_turmasRef !== allTurmasRaw) { _turmasIdx = new Map(allTurmasRaw.map(t => [t.id, t])); _turmasRef = allTurmasRaw; }
  return _turmasIdx.get(id) || null;
}
function turmaDoAluno(s) { return s ? turmaPorId(s.turmaId) : null; }
/* "Pré-CEFET 1" -> "Pré-Cefet" (sem número, como no modelo de recibo) */
function nomeTurmaRecibo(t) {
  if (!t) return "";
  if (t.tipo === "CEFET") return "Pré-Cefet";
  if (t.tipo === "ENEM") return "Pré-Enem";
  return t.nome;
}
function descricaoPagamento(p) {
  if (p.descricao) return p.descricao;
  if (p.tipo === "matricula") return "Taxa de Matrícula";
  if (p.tipo === "material") return "Material Didático";
  if (p.tipo === "mensalidade" && p.numero_parcela) return p.numero_parcela + "ª Parcela";
  return p.tipo === "mensalidade" ? "Mensalidade" : "Pagamento";
}
const TIPO_PAG_LABEL = { matricula: "Matrícula", mensalidade: "Mensalidade", material: "Material didático", outro: "Outro" };

/* valor por extenso ("Duzentos e Oitenta Reais") */
function extensoBRL(valor) {
  const total = Math.round(Number(valor) * 100);
  const reais = Math.floor(total / 100), cent = total % 100;
  const U = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const C = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const ate999 = n => {
    if (!n) return "";
    if (n === 100) return "cem";
    const c = Math.floor(n / 100), r = n % 100, p = [];
    if (c) p.push(C[c]);
    if (r) { if (r < 20) p.push(U[r]); else { const d = Math.floor(r / 10), u = r % 10; p.push(D[d] + (u ? " e " + U[u] : "")); } }
    return p.join(" e ");
  };
  const ate999999 = n => {
    const m = Math.floor(n / 1000), r = n % 1000;
    if (!m) return ate999(r);
    let s = m === 1 ? "mil" : ate999(m) + " mil";
    if (r) s += (r < 100 || r % 100 === 0) ? " e " + ate999(r) : " " + ate999(r);
    return s;
  };
  if (reais >= 1000000) return fmtBRL(valor);
  const partes = [];
  if (reais) partes.push(reais === 1 ? "um real" : ate999999(reais) + " reais");
  if (cent) partes.push(cent === 1 ? "um centavo" : ate999(cent) + " centavos");
  if (!partes.length) partes.push("zero real");
  return partes.join(" e ").split(" ").map(w => (w === "e" || w === "de") ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* ---------- dados ---------- */
async function loadPagamentos() {
  pagamentos = await buscarTodasLinhas(() => supabase.from("pagamentos").select("*").order("data_vencimento", { nullsFirst: false }).order("created_at"));
  if (!pagamentosCanal) {
    pagamentosCanal = supabase.channel("pagamentos_sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos" }, payload => {
        if (payload.eventType === "DELETE") pagamentos = pagamentos.filter(p => p.id !== payload.old.id);
        else {
          const i = pagamentos.findIndex(p => p.id === payload.new.id);
          if (i >= 0) pagamentos[i] = payload.new; else pagamentos.push(payload.new);
        }
        finAtualizarSoon();
      }).subscribe();
  }
  finAtualizarTudo();
}
const finAtualizarSoon = debounce(() => finAtualizarTudo(), 120);
function pagamentosAtrasados() {
  const hoje = hojeISO();
  return pagamentos.filter(p => p.status === "pendente" && p.data_vencimento && p.data_vencimento < hoje)
    .filter(p => { const s = alunoPorId(p.aluno_id); return s && s.status !== "desistente"; });
}
function pagamentosAVencer(dias) {
  const hoje = hojeISO(), limite = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
  return pagamentos.filter(p => p.status === "pendente" && p.data_vencimento && p.data_vencimento >= hoje && p.data_vencimento <= limite)
    .filter(p => { const s = alunoPorId(p.aluno_id); return s && s.status !== "desistente"; });
}
function finAtualizarTudo() {
  atualizarAlertaFinanceiro();
  if (currentDrawerId && byId("drawer").classList.contains("open")) renderDrawerFinanceiro(currentDrawerId);
  if (nomeDaViewAtiva() === "financeiro") { renderFinPagamentos(); renderFinAtrasados(); }
  else dirtyViews.add("financeiro");
}

/* ---------- alerta de atraso ---------- */
function atualizarAlertaFinanceiro() {
  const atras = pagamentosAtrasados();
  const alunos = new Set(atras.map(p => p.aluno_id)).size;
  const total = atras.reduce((s, p) => s + Number(p.valor || 0), 0);
  const badge = byId("fin-badge");
  if (badge) { badge.hidden = !atras.length; badge.textContent = atras.length; }
  const tabBadge = byId("fin-tab-atr-badge");
  if (tabBadge) { tabBadge.hidden = !atras.length; tabBadge.textContent = atras.length; }
  const bar = byId("fin-alerta");
  if (!bar) return;
  if (!atras.length || finAlertaFechado) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.querySelector("span.msg").innerHTML = `<b>${atras.length} parcela${atras.length > 1 ? "s" : ""} em atraso</b> de ${alunos} aluno${alunos > 1 ? "s" : ""} — ${esc(fmtBRL(total))} em aberto.`;
}

/* ---------- abas do Financeiro ---------- */
function finIrParaAba(aba) {
  document.querySelectorAll("#fin-tabs .hor-tab").forEach(b => b.classList.toggle("active", b.dataset.finTab === aba));
  ["geral", "pag", "atr"].forEach(a => byId("fin-panel-" + a).classList.toggle("hidden", a !== aba));
}
document.querySelectorAll("#fin-tabs .hor-tab").forEach(b => b.addEventListener("click", () => finIrParaAba(b.dataset.finTab)));
byId("fin-alerta-ver").addEventListener("click", () => { goto("financeiro"); finIrParaAba("atr"); });
byId("fin-alerta-fechar").addEventListener("click", () => { finAlertaFechado = true; byId("fin-alerta").hidden = true; });

/* ---------- listas ---------- */
function renderFinPagamentos() {
  const q = normName(byId("pg-busca").value || "");
  const tipoF = byId("pg-filtro-tipo").value;
  const mesAtual = hojeISO().slice(0, 7);
  // meses que têm pagamento (mais recente primeiro), mantendo a escolha atual
  const selMes = byId("pg-filtro-mes"), mesEsc = selMes.value;
  const mesesComPag = [...new Set(pagamentos.filter(p => p.ano_letivo === selectedAnoLetivo && p.status === "pago" && p.data_pagamento).map(p => p.data_pagamento.slice(0, 7)))].sort().reverse();
  const nomesMes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  selMes.innerHTML = '<option value="">Todos os meses</option>' + mesesComPag.map(m => `<option value="${m}">${nomesMes[Number(m.slice(5)) - 1]} de ${m.slice(0, 4)}</option>`).join("");
  selMes.value = mesesComPag.includes(mesEsc) ? mesEsc : "";
  const mesF = selMes.value;
  const doAno = pagamentos.filter(p => p.ano_letivo === selectedAnoLetivo);
  const pagos = doAno.filter(p => p.status === "pago");
  const recebidoMes = pagos.filter(p => (p.data_pagamento || "").startsWith(mesAtual)).reduce((s, p) => s + Number(p.valor || 0), 0);
  const recebidoAno = pagos.reduce((s, p) => s + Number(p.valor || 0), 0);
  const emAberto = doAno.filter(p => p.status === "pendente").reduce((s, p) => s + Number(p.valor || 0), 0);
  byId("pg-kpi-mes").textContent = fmtBRL(recebidoMes);
  byId("pg-kpi-ano").textContent = fmtBRL(recebidoAno);
  byId("pg-kpi-aberto").textContent = fmtBRL(emAberto);

  const linhas = pagos.filter(p => {
    if (tipoF && p.tipo !== tipoF) return false;
    if (mesF && !(p.data_pagamento || "").startsWith(mesF)) return false;
    if (q) { const s = alunoPorId(p.aluno_id); if (!normName((s ? s.nome : "") + " " + (p.recibo_numero || "")).includes(q)) return false; }
    return true;
  }).sort((a, b) => (b.data_pagamento || "").localeCompare(a.data_pagamento || "") || (b.recibo_numero || 0) - (a.recibo_numero || 0));
  byId("pg-count").textContent = linhas.length;
  byId("pg-body").innerHTML = linhas.map(p => {
    const s = alunoPorId(p.aluno_id);
    return `<tr>
      <td class="mono">${p.recibo_numero != null ? "Nº " + p.recibo_numero : "—"}</td>
      <td class="mono">${esc(fmtDate(p.data_pagamento))}</td>
      <td>${esc(s ? s.nome : "—")}</td>
      <td><span class="turma-tag">${esc(((p.turma_id && allTurmasRaw.find(x => x.id === p.turma_id)) || turmaDoAluno(s) || {}).nome || "—")}</span></td>
      <td>${esc(descricaoPagamento(p))}<div style="font-size:11px;color:var(--text-muted)">${esc(TIPO_PAG_LABEL[p.tipo] || "")}</div></td>
      <td class="mono">${esc(fmtBRL(p.valor))}</td>
      <td>${esc(p.forma_pagamento || "—")}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost" data-recibo="${p.id}" data-vias="1" type="button">Recibo</button>
        <button class="btn btn-ghost" data-recibo="${p.id}" data-vias="2" type="button">2 vias</button>
        <button class="btn btn-ghost" data-excluir-pag="${p.id}" type="button" title="Excluir este pagamento">Excluir</button>
      </td></tr>`;
  }).join("") || `<tr><td colspan="8" class="empty-note">Nenhum pagamento registrado ainda em ${selectedAnoLetivo}. Use "Registrar pagamento".</td></tr>`;
}

function linhaAtraso(p, atrasado) {
  const s = alunoPorId(p.aluno_id);
  const hoje = hojeISO();
  const dias = atrasado ? diasEntre(p.data_vencimento, hoje) : diasEntre(hoje, p.data_vencimento);
  const resp = s && s.responsavel && s.responsavel !== "—" ? s.responsavel : "";
  const fone = s ? (s.telResp || s.telAluno || s.whatsappAluno || "") : "";
  const digitos = String(fone).replace(/\D/g, "");
  const msg = `Olá${resp ? ", " + resp : ""}! Aqui é do Percurso. Identificamos que a ${descricaoPagamento(p)} de ${s ? s.nome : "seu(sua) filho(a)"}, com vencimento em ${fmtDate(p.data_vencimento)} (${fmtBRL(p.valor)}), consta em aberto. Pode nos confirmar o pagamento? Obrigado!`;
  const zap = digitos.length >= 10 ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/55${digitos}?text=${encodeURIComponent(msg)}">WhatsApp</a>` : "";
  return `<tr>
    <td>${esc(s ? s.nome : "—")}<div style="font-size:11px;color:var(--text-muted)">${esc(resp)}${fone ? " · " + esc(fone) : ""}</div></td>
    <td>${esc(descricaoPagamento(p))}</td>
    <td class="mono">${esc(fmtDate(p.data_vencimento))}</td>
    <td class="mono" style="color:${atrasado ? "var(--critical)" : "var(--text-muted)"}">${atrasado ? dias + " dia" + (dias > 1 ? "s" : "") + " de atraso" : (dias === 0 ? "vence hoje" : "em " + dias + " dia" + (dias > 1 ? "s" : ""))}</td>
    <td class="mono">${esc(fmtBRL(p.valor))}</td>
    <td style="white-space:nowrap"><button class="btn btn-primary" data-pagar="${p.id}" type="button">Registrar pagamento</button> ${zap} <button class="btn btn-ghost" data-excluir-pag="${p.id}" type="button" title="Excluir este lançamento (lançado errado)">Excluir</button></td></tr>`;
}
function renderFinAtrasados() {
  const atras = pagamentosAtrasados().sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  const total = atras.reduce((s, p) => s + Number(p.valor || 0), 0);
  byId("atr-kpi-alunos").textContent = new Set(atras.map(p => p.aluno_id)).size;
  byId("atr-kpi-parcelas").textContent = atras.length;
  byId("atr-kpi-total").textContent = fmtBRL(total);
  byId("atr-body").innerHTML = atras.map(p => linhaAtraso(p, true)).join("")
    || `<tr><td colspan="6" class="empty-note">Nenhuma parcela em atraso 🎉</td></tr>`;
  const venc = pagamentosAVencer(7).sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  byId("avc-count").textContent = venc.length;
  byId("avc-body").innerHTML = venc.map(p => linhaAtraso(p, false)).join("")
    || `<tr><td colspan="6" class="empty-note">Nada vencendo nos próximos 7 dias.</td></tr>`;
}
byId("pg-busca").addEventListener("input", debounce(renderFinPagamentos));
byId("pg-filtro-tipo").addEventListener("change", renderFinPagamentos);
byId("pg-filtro-mes").addEventListener("change", renderFinPagamentos);

/* ---------- janelas (modais) dentro da página ---------- */
function abrirModal(html, { largura = 560 } = {}) {
  fecharModal();
  const ov = document.createElement("div");
  ov.id = "fin-modal";
  ov.style.cssText = "position:fixed;inset:0;z-index:650;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto";
  ov.innerHTML = `<div style="background:var(--surface,#1b2420);color:var(--text,#e8efe9);border:1px solid var(--border,#33433b);border-radius:12px;max-width:${largura}px;width:100%;padding:20px;margin:auto">${html}</div>`;
  ov.addEventListener("mousedown", e => { if (e.target === ov) fecharModal(); });
  document.body.appendChild(ov);
  return ov;
}
function fecharModal() { const m = byId("fin-modal"); if (m) m.remove(); }
function modalMensagem(titulo, corpoHTML, botoesHTML) {
  const ov = abrirModal(`<h3 style="margin:0 0 8px;font-size:16px">${esc(titulo)}</h3><div style="font-size:14px;line-height:1.6">${corpoHTML}</div><div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px">${botoesHTML}</div>`, { largura: 460 });
  return ov;
}

/* ---------- registrar pagamento ---------- */
/* parcelas já lançadas do aluno no ano (pago / a pagar), por número */
function parcelasDoAluno(alunoId, ano) {
  const mapa = new Map();
  pagamentos.filter(p => p.aluno_id === alunoId && p.tipo === "mensalidade" && p.ano_letivo === ano && p.numero_parcela)
    .forEach(p => mapa.set(p.numero_parcela, p));
  return mapa;
}
/* próxima parcela a pagar: a menor ainda "a pagar"; sem carnê gerado, a seguinte à última paga */
function proximaParcela(alunoId, ano) {
  const mapa = parcelasDoAluno(alunoId, ano || selectedAnoLetivo);
  const pendentes = [...mapa.values()].filter(p => p.status === "pendente").map(p => p.numero_parcela).sort((a, b) => a - b);
  if (pendentes.length) return pendentes[0];
  const pagas = [...mapa.values()].filter(p => p.status === "pago").map(p => p.numero_parcela);
  return (pagas.length ? Math.max(...pagas) : 0) + 1;
}
function opcoesParcela(s, selecionada) {
  const mapa = parcelasDoAluno(s.id, selectedAnoLetivo);
  const n = Math.max(Number(s.finQtdParcelas) || 0, mapa.size ? Math.max(...mapa.keys()) : 0, 10);
  let html = "";
  for (let i = 1; i <= n; i++) {
    const p = mapa.get(i);
    const nota = p ? (p.status === "pago" ? " — já paga" : " — vence " + fmtDate(p.data_vencimento).slice(0, 5)) : "";
    html += `<option value="${i}"${i === selecionada ? " selected" : ""}>${i}ª parcela${nota}</option>`;
  }
  return html;
}
function opcoesTurma(s, selecionadaId) {
  const lista = [...turmasList];
  const atual = s ? allTurmasRaw.find(t => t.id === s.turmaId) : null;
  if (atual && !lista.some(t => t.id === atual.id)) lista.push(atual);
  return `<option value="">Sem turma</option>` + lista.map(t => `<option value="${esc(t.id)}"${t.id === selecionadaId ? " selected" : ""}>${esc(t.nome)} (${esc(t.ano_letivo)})</option>`).join("");
}
function abrirModalPagamento(opts = {}) {
  const pend = opts.pendente || null;
  const ativos = students.filter(s => s.status !== "desistente");
  const alunoIni = pend ? alunoPorId(pend.aluno_id) : null;
  const ov = abrirModal(`
    <h3 style="margin:0 0 12px;font-size:17px">${pend ? "Registrar pagamento de parcela" : "Registrar pagamento"}</h3>
    <div class="form-fields" style="grid-template-columns:repeat(2,1fr)">
      <div class="form-field" style="grid-column:1/-1"><label>Aluno</label><input type="text" id="pg-aluno" list="pg-alunos" placeholder="Digite o nome e escolha na lista" ${pend ? "disabled" : ""} value="${esc(alunoIni ? alunoIni.nome : "")}"><datalist id="pg-alunos">${ativos.map(s => `<option value="${esc(s.nome)}"></option>`).join("")}</datalist></div>
      <div class="form-field"><label>Turma</label><select id="pg-turma"><option value="">Sem turma</option></select></div>
      <div class="form-field"><label>Referente a</label><select id="pg-tipo"><option value="mensalidade">Mensalidade</option><option value="matricula">Matrícula</option><option value="material">Material didático</option><option value="outro">Outro</option></select></div>
      <div class="form-field" id="pg-parcela-wrap" style="grid-column:1/-1"><label>Qual parcela está sendo paga?</label><select id="pg-parcela"></select></div>
      <div class="form-field" style="grid-column:1/-1"><label>Descrição no recibo <span style="font-weight:400;opacity:.7">(em branco = automática, ex.: 5ª Parcela)</span></label><input type="text" id="pg-desc"></div>
      <div class="form-field"><label>Valor pago</label><input type="text" id="pg-valor" inputmode="numeric" placeholder="R$ 0,00"></div>
      <div class="form-field"><label>Data do pagamento</label><input type="date" id="pg-data" value="${hojeISO()}"></div>
      <div class="form-field"><label>Forma de pagamento</label><select id="pg-forma"><option>Pix</option><option>Cartão</option><option>Dinheiro</option><option>Transferência</option><option>Boleto / carnê</option></select></div>
      <div class="form-field"><label>Observação</label><input type="text" id="pg-obs"></div>
    </div>
    <div id="pg-erro" class="cpf-hint invalid" style="margin-top:10px"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px">
      <button class="btn btn-ghost" id="pg-cancelar" type="button">Cancelar</button>
      <button class="btn btn-primary" id="pg-salvar" type="button">Salvar e gerar recibo</button>
    </div>`);
  const $ = id => ov.querySelector("#" + id);
  $("pg-valor").addEventListener("input", maskMoneyInput);
  const alunoAtual = () => pend ? alunoPorId(pend.aluno_id) : (students.find(s => normName(s.nome) === normName($("pg-aluno").value)) || null);
  /* parcela escolhida -> valor e descrição do que já está lançado */
  const aoMudarParcela = () => {
    const s = alunoAtual(); if (!s || $("pg-tipo").value !== "mensalidade") return;
    const p = parcelasDoAluno(s.id, selectedAnoLetivo).get(parseInt($("pg-parcela").value, 10));
    $("pg-valor").value = formatMoneyBR(p ? p.valor : s.mensalidade);
  };
  const montar = () => {
    const s = alunoAtual();
    $("pg-parcela-wrap").style.display = $("pg-tipo").value === "mensalidade" ? "" : "none";
    if (!s) return;
    const turmaSel = $("pg-turma").value || s.turmaId || "";
    $("pg-turma").innerHTML = opcoesTurma(s, turmaSel);
    if ($("pg-tipo").value === "mensalidade") {
      const atual = parseInt($("pg-parcela").value, 10) || proximaParcela(s.id);
      $("pg-parcela").innerHTML = opcoesParcela(s, atual);
      aoMudarParcela();
    } else if ($("pg-tipo").value === "matricula") {
      $("pg-valor").value = s.finValorMatricula ? formatMoneyBR(s.finValorMatricula) : "";
    } else { $("pg-valor").value = ""; }
  };
  $("pg-aluno").addEventListener("change", () => { $("pg-turma").value = ""; $("pg-parcela").innerHTML = ""; montar(); });
  $("pg-tipo").addEventListener("change", montar);
  $("pg-parcela").addEventListener("change", aoMudarParcela);
  if (pend) {
    $("pg-tipo").value = pend.tipo;
    $("pg-turma").innerHTML = opcoesTurma(alunoIni, pend.turma_id || (alunoIni && alunoIni.turmaId) || "");
    $("pg-parcela-wrap").style.display = pend.tipo === "mensalidade" ? "" : "none";
    if (pend.tipo === "mensalidade" && alunoIni) $("pg-parcela").innerHTML = opcoesParcela(alunoIni, pend.numero_parcela);
    $("pg-desc").value = pend.descricao || ""; $("pg-valor").value = formatMoneyBR(pend.valor); $("pg-obs").value = pend.observacao || "";
  } else {
    if (opts.alunoId) { const s = alunoPorId(opts.alunoId); if (s) $("pg-aluno").value = s.nome; }
    montar();
  }
  $("pg-cancelar").onclick = fecharModal;
  $("pg-salvar").onclick = async () => {
    const erro = msg => { $("pg-erro").textContent = msg; };
    const s = alunoAtual();
    if (!s) return erro("Escolha um aluno da lista.");
    const valor = parseMoneyBR($("pg-valor").value);
    if (!(valor > 0)) return erro("Informe o valor pago.");
    const data = $("pg-data").value;
    if (!data || !dataValida(data)) return erro("Informe a data do pagamento.");
    if (data > hojeISO()) return erro("A data do pagamento não pode ser futura.");
    const tipo = $("pg-tipo").value;
    const parcela = tipo === "mensalidade" ? (parseInt($("pg-parcela").value, 10) || null) : null;
    // se a parcela escolhida já existe como "a pagar", o pagamento baixa essa parcela (não cria outra)
    let alvo = pend;
    if (!alvo && parcela) {
      const ex = parcelasDoAluno(s.id, selectedAnoLetivo).get(parcela);
      if (ex && ex.status === "pendente") alvo = ex;
      else if (ex && ex.status === "pago" && !(await confirmarProblemas([`A ${parcela}ª parcela de ${s.nome} já consta como paga (recibo Nº ${ex.recibo_numero}).`], "registrar de novo"))) return;
    }
    const payload = {
      aluno_id: s.id, ano_letivo: alvo ? alvo.ano_letivo : selectedAnoLetivo, tipo, numero_parcela: parcela,
      turma_id: $("pg-turma").value || null,
      descricao: $("pg-desc").value.trim() || null, valor, data_pagamento: data, forma_pagamento: $("pg-forma").value,
      observacao: $("pg-obs").value.trim() || null, status: "pago",
    };
    if (!alvo) payload.data_vencimento = data;
    $("pg-salvar").disabled = true; $("pg-salvar").textContent = "Salvando…";
    const q = alvo ? supabase.from("pagamentos").update(payload).eq("id", alvo.id) : supabase.from("pagamentos").insert(payload);
    const { data: salvo, error } = await q.select().single();
    if (error) { console.error(error); $("pg-salvar").disabled = false; $("pg-salvar").textContent = "Salvar e gerar recibo"; return erro("Não consegui salvar: " + error.message); }
    const i = pagamentos.findIndex(p => p.id === salvo.id); if (i >= 0) pagamentos[i] = salvo; else pagamentos.push(salvo);
    finAtualizarTudo();
    fecharModal();
    mostrarSucessoPagamento(salvo);
  };
}
function mostrarSucessoPagamento(p) {
  const s = alunoPorId(p.aluno_id);
  const ov = modalMensagem("Pagamento registrado ✓",
    `${esc(s ? s.nome : "")} — ${esc(descricaoPagamento(p))}, <b>${esc(fmtBRL(p.valor))}</b>.<br>Recibo <b>Nº ${esc(p.recibo_numero)}</b> gerado.`,
    `<button class="btn btn-ghost" id="ok-fechar" type="button">Fechar</button><button class="btn btn-ghost" id="ok-2" type="button">Recibo (2 vias)</button><button class="btn btn-primary" id="ok-1" type="button">Recibo (1 via)</button>`);
  ov.querySelector("#ok-fechar").onclick = fecharModal;
  ov.querySelector("#ok-1").onclick = () => { fecharModal(); abrirRecibo(p.id, 1); };
  ov.querySelector("#ok-2").onclick = () => { fecharModal(); abrirRecibo(p.id, 2); };
}

/* ---------- gerar parcelas (carnê) ---------- */
function somarMeses(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const alvo = new Date(y, m - 1 + n, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}
function abrirModalParcelas(alunoId) {
  const ativos = students.filter(s => s.status !== "desistente" && s.tipo !== "bolsa 100%");
  const ov = abrirModal(`
    <h3 style="margin:0 0 4px;font-size:17px">Gerar parcelas do aluno</h3>
    <p style="margin:0 0 12px;font-size:13px;color:var(--text-muted)">Cria as parcelas como "a pagar", com vencimento mês a mês. É isso que permite o alerta de atraso.</p>
    <div class="form-fields" style="grid-template-columns:repeat(2,1fr)">
      <div class="form-field" style="grid-column:1/-1"><label>Aluno</label><input type="text" id="gp-aluno" list="gp-alunos" placeholder="Digite o nome e escolha na lista"><datalist id="gp-alunos">${ativos.map(s => `<option value="${esc(s.nome)}"></option>`).join("")}</datalist></div>
      <div class="form-field"><label>Nº de parcelas</label><input type="text" id="gp-n" inputmode="numeric" placeholder="Ex: 10"></div>
      <div class="form-field"><label>Valor de cada parcela</label><input type="text" id="gp-valor" inputmode="numeric" placeholder="R$ 0,00"></div>
      <div class="form-field" style="grid-column:1/-1"><label>Vencimento da 1ª parcela</label><input type="date" id="gp-primeira"></div>
    </div>
    <div id="gp-erro" class="cpf-hint invalid" style="margin-top:10px"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost" id="gp-cancelar" type="button">Cancelar</button><button class="btn btn-primary" id="gp-salvar" type="button">Gerar parcelas</button></div>`);
  const $ = id => ov.querySelector("#" + id);
  $("gp-valor").addEventListener("input", maskMoneyInput);
  const preencherPlano = () => {
    const s = students.find(x => normName(x.nome) === normName($("gp-aluno").value)); if (!s) return;
    if (s.finQtdParcelas) $("gp-n").value = s.finQtdParcelas;
    if (s.mensalidade) $("gp-valor").value = formatMoneyBR(s.mensalidade);
    const dia = parseInt(s.vencimento, 10);
    if (dia > 0 && !$("gp-primeira").value) { const h = hojeISO(); $("gp-primeira").value = h.slice(0, 8) + String(Math.min(dia, 28)).padStart(2, "0"); }
  };
  $("gp-aluno").addEventListener("change", preencherPlano);
  if (alunoId) { const s0 = alunoPorId(alunoId); if (s0) { $("gp-aluno").value = s0.nome; preencherPlano(); } }
  $("gp-cancelar").onclick = fecharModal;
  $("gp-salvar").onclick = async () => {
    const erro = m => { $("gp-erro").textContent = m; };
    const s = students.find(x => normName(x.nome) === normName($("gp-aluno").value));
    if (!s) return erro("Escolha um aluno da lista.");
    const n = parseInt($("gp-n").value, 10), valor = parseMoneyBR($("gp-valor").value), primeira = $("gp-primeira").value;
    if (!(n > 0 && n <= 36)) return erro("Informe o nº de parcelas (1 a 36).");
    if (!(valor > 0)) return erro("Informe o valor da parcela.");
    if (!primeira || !dataValida(primeira)) return erro("Informe o vencimento da 1ª parcela.");
    const jaExistem = new Set(pagamentos.filter(p => p.aluno_id === s.id && p.tipo === "mensalidade" && p.ano_letivo === selectedAnoLetivo).map(p => p.numero_parcela));
    const novas = [];
    for (let i = 1; i <= n; i++) {
      if (jaExistem.has(i)) continue;
      novas.push({ aluno_id: s.id, ano_letivo: selectedAnoLetivo, tipo: "mensalidade", numero_parcela: i, turma_id: s.turmaId || null, valor, data_vencimento: somarMeses(primeira, i - 1), status: "pendente" });
    }
    if (!novas.length) return erro("Esse aluno já tem todas essas parcelas cadastradas.");
    $("gp-salvar").disabled = true; $("gp-salvar").textContent = "Gerando…";
    const { data, error } = await supabase.from("pagamentos").insert(novas).select();
    if (error) { console.error(error); $("gp-salvar").disabled = false; $("gp-salvar").textContent = "Gerar parcelas"; return erro("Não consegui gerar: " + error.message); }
    pagamentos.push(...data); finAtualizarTudo(); fecharModal();
    modalMensagem("Parcelas geradas ✓", `${data.length} parcela${data.length > 1 ? "s" : ""} de ${esc(s.nome)} criada${data.length > 1 ? "s" : ""}${novas.length < n ? ` (${n - novas.length} já existiam e foram mantidas)` : ""}. Parcelas vencidas e não pagas aparecem em <b>Atrasados</b>.`, `<button class="btn btn-primary" id="gp-ok" type="button">Ok</button>`).querySelector("#gp-ok").onclick = fecharModal;
  };
}

/* ---------- clique nas tabelas ---------- */
function finCliqueAcoes(e) {
  const bRec = e.target.closest("[data-recibo]");
  if (bRec) { abrirRecibo(bRec.dataset.recibo, Number(bRec.dataset.vias)); return; }
  const bPagar = e.target.closest("[data-pagar]");
  if (bPagar) { const p = pagamentos.find(x => x.id === bPagar.dataset.pagar); if (p) abrirModalPagamento({ pendente: p }); return; }
  const bEx = e.target.closest("[data-excluir-pag]");
  if (bEx) {
    const p = pagamentos.find(x => x.id === bEx.dataset.excluirPag); if (!p) return;
    const s = alunoPorId(p.aluno_id);
    const ov = modalMensagem(p.status === "pago" ? "Excluir este pagamento?" : "Excluir esta parcela?", `${esc(s ? s.nome : "")} — ${esc(descricaoPagamento(p))}, ${esc(fmtBRL(p.valor))}${p.recibo_numero != null ? ` (recibo Nº ${esc(p.recibo_numero)})` : ""}.<br>${p.status === "pago" ? "O pagamento e o recibo deixam de existir, e o número do recibo não é reaproveitado." : "A parcela deixa de existir (nenhum pagamento foi registrado nela)."}`,
      `<button class="btn btn-ghost" id="ex-nao" type="button">Cancelar</button><button class="btn btn-primary" id="ex-sim" type="button">Excluir</button>`);
    ov.querySelector("#ex-nao").onclick = fecharModal;
    ov.querySelector("#ex-sim").onclick = async () => {
      const { error } = await supabase.from("pagamentos").delete().eq("id", p.id);
      if (error) { alert("Não consegui excluir: " + error.message); return; }
      pagamentos = pagamentos.filter(x => x.id !== p.id); fecharModal(); finAtualizarTudo();
    };
  }
}
byId("view-financeiro").addEventListener("click", finCliqueAcoes);
byId("pg-novo-btn").addEventListener("click", () => abrirModalPagamento());
byId("pg-parcelas-btn").addEventListener("click", () => abrirModalParcelas());

/* ---------- recibo (modelo da planilha: Nº, valor, "recebi de", extenso, referente a, turma e data, assinatura) ---------- */
function reciboBlocoHTML(p) {
  const s = alunoPorId(p.aluno_id), t = (p.turma_id && allTurmasRaw.find(x => x.id === p.turma_id)) || turmaDoAluno(s);
  const ano = t ? t.ano_letivo : p.ano_letivo;
  const turmaTxt = t ? `Turma ${nomeTurmaRecibo(t)} ${ano}` : "";
  const dt = p.data_pagamento ? new Date(p.data_pagamento + "T12:00:00") : new Date();
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dataExt = `${String(dt.getDate()).padStart(2, "0")} de ${meses[dt.getMonth()]} de ${dt.getFullYear()}`;
  const ref = descricaoPagamento(p) + (p.observacao ? ` — ${p.observacao}` : "");
  const valorNum = Number(p.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<div class="rc">
    <div class="rc-top"><div class="rc-titulo">RECIBO</div><div class="rc-no"><b>Nº:</b> <span>${esc(p.recibo_numero != null ? p.recibo_numero : "")}</span></div>
      <div class="rc-valor"><b>VALOR:</b> <span class="rc-v"><i>R$</i>${esc(valorNum)}</span></div></div>
    <div class="rc-corpo">
      <div class="rc-linha"><b>Recebi(emos) de</b><span class="rc-u">${esc(s ? s.nome : "")}</span></div>
      <div class="rc-linha"><b>a importância de</b><span class="rc-u">${esc(extensoBRL(p.valor))}</span></div>
      <div class="rc-linha"><b>referente a</b><span class="rc-u">${esc(ref)}</span></div>
      <div class="rc-linha"><b>e para clareza firmo(amos) o presente</b></div>
      <div class="rc-linha rc-data"><span class="rc-u" style="max-width:210px;text-align:center">${esc(turmaTxt)}</span>,<span class="rc-u" style="text-align:center">${esc(dataExt)}</span></div>
      <div class="rc-linha"><b>Assinatura</b><span class="rc-u"></span></div>
      <div class="rc-linha"><b>Nome:</b><span class="rc-u" style="max-width:260px">${esc(RECIBO_CFG.nome)}</span><b>CPF/CNPJ:</b><span class="rc-u">${esc(RECIBO_CFG.documento)}</span></div>
    </div></div>`;
}
function abrirRecibo(id, vias) {
  const p = pagamentos.find(x => x.id === id);
  if (!p) return;
  if (p.recibo_numero == null) { alert("Este pagamento ainda não tem número de recibo."); return; }
  const s = alunoPorId(p.aluno_id);
  const bloco = reciboBlocoHTML(p);
  const corpo = `<section class="rec">${bloco}${vias === 2 ? `<div class="rc-corte">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>${bloco}` : ""}</section>`;
  abrirDocumento(corpo, `Recibo Nº ${p.recibo_numero} — ${s ? s.nome : ""}`, docNomeArquivo("Recibo " + p.recibo_numero, s ? s.nome : ""));
}

/* ---------- financeiro dentro da ficha do aluno (gaveta) ---------- */
function renderDrawerFinanceiro(id) {
  const el = byId("d-fin-body");
  if (!el || currentDrawerId !== id) return;
  const s = alunoPorId(id);
  const hoje = hojeISO();
  const lista = pagamentos.filter(p => p.aluno_id === id)
    .sort((a, b) => (a.data_vencimento || a.data_pagamento || "").localeCompare(b.data_vencimento || b.data_pagamento || "") || (a.numero_parcela || 0) - (b.numero_parcela || 0));
  const soma = fn => lista.filter(fn).reduce((t, p) => t + Number(p.valor || 0), 0);
  const pago = soma(p => p.status === "pago");
  const aPagar = soma(p => p.status === "pendente");
  const atrasadas = lista.filter(p => p.status === "pendente" && p.data_vencimento && p.data_vencimento < hoje);
  const valorAtraso = atrasadas.reduce((t, p) => t + Number(p.valor || 0), 0);
  let situ;
  if (s && s.tipo === "bolsa 100%") situ = `<span class="pill scholarship">Bolsa 100%</span>`;
  else if (atrasadas.length) situ = `<span class="pill late">${atrasadas.length} parcela${atrasadas.length > 1 ? "s" : ""} em atraso · ${esc(fmtBRL(valorAtraso))}</span>`;
  else if (lista.some(p => p.status === "pendente")) situ = `<span class="pill ok">Em dia</span>`;
  else if (lista.length) situ = `<span class="pill ok">Quitado até aqui</span>`;
  else situ = `<span class="pill pending">Sem parcelas cadastradas</span>`;

  const linhas = lista.map(p => {
    const desc = esc(descricaoPagamento(p));
    if (p.status === "pago") {
      return `<div class="dp-row"><div class="dp-main"><b>${desc}</b><div class="dp-sub">Pago em ${esc(fmtDate(p.data_pagamento))}${p.forma_pagamento ? " · " + esc(p.forma_pagamento) : ""}${p.recibo_numero != null ? " · recibo Nº " + esc(p.recibo_numero) : ""}</div></div>
        <div class="dp-val">${esc(fmtBRL(p.valor))}</div>
        <div class="dp-act"><button class="btn btn-ghost" data-recibo="${p.id}" data-vias="1" type="button">Recibo</button><button class="btn btn-ghost" data-recibo="${p.id}" data-vias="2" type="button">2 vias</button><button class="btn btn-ghost" data-excluir-pag="${p.id}" type="button" title="Excluir este lançamento (lançado errado)">Excluir</button></div></div>`;
    }
    const atras = p.data_vencimento && p.data_vencimento < hoje;
    const dias = p.data_vencimento ? Math.abs(diasEntre(p.data_vencimento, hoje)) : 0;
    const tag = !p.data_vencimento ? "" : atras ? `<span class="pill late">${dias} dia${dias > 1 ? "s" : ""} de atraso</span>` : `<span class="pill pending">${dias === 0 ? "vence hoje" : "em " + dias + " dia" + (dias > 1 ? "s" : "")}</span>`;
    return `<div class="dp-row"><div class="dp-main"><b>${desc}</b><div class="dp-sub">Vence em ${esc(fmtDate(p.data_vencimento))} ${tag}</div></div>
      <div class="dp-val">${esc(fmtBRL(p.valor))}</div>
      <div class="dp-act"><button class="btn btn-primary" data-pagar="${p.id}" type="button">Registrar pagamento</button><button class="btn btn-ghost" data-excluir-pag="${p.id}" type="button" title="Excluir este lançamento (lançado errado)">Excluir</button></div></div>`;
  }).join("");

  el.innerHTML = `
    <div class="d-grid" style="margin-bottom:12px">
      <div class="d-field full"><div class="f-label">Situação financeira</div><div class="f-value">${situ}</div></div>
      <div class="d-field"><div class="f-label">Já pago</div><div class="f-value mono">${esc(fmtBRL(pago))}</div></div>
      <div class="d-field"><div class="f-label">A pagar</div><div class="f-value mono">${esc(fmtBRL(aPagar))}</div></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <button class="btn btn-primary" type="button" id="d-pg-novo" data-aluno="${esc(id)}">Registrar pagamento</button>
      <button class="btn btn-ghost" type="button" id="d-pg-parcelas" data-aluno="${esc(id)}">Gerar parcelas</button>
    </div>
    <div class="f-label" style="margin-bottom:6px">Registro de pagamentos e parcelas</div>
    <div class="dp-lista">${linhas || `<div class="f-value" style="font-weight:500;color:var(--text-faint)">Nenhum pagamento ou parcela registrado ainda. Use "Registrar pagamento" ou "Gerar parcelas".</div>`}</div>`;
}
byId("drawer-body").addEventListener("click", e => {
  const novo = e.target.closest("#d-pg-novo");
  if (novo) { abrirModalPagamento({ alunoId: novo.dataset.aluno }); return; }
  const parc = e.target.closest("#d-pg-parcelas");
  if (parc) { abrirModalParcelas(parc.dataset.aluno); return; }
  finCliqueAcoes(e);
});

