/* ===================== nova matrícula: checagem de CPF/RG duplicado ===================== */
async function acharAlunoPorCampo(campo, valor, excluirId){
  if (!valor) return null;
  let q = supabase.from("alunos").select("id,nome_completo").eq(campo, valor).limit(1);
  if (excluirId) q = q.neq("id", excluirId);
  const { data, error } = await q.maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}
async function acharResponsavelPorCampo(campo, valor, excluirId){
  if (!valor) return null;
  let q = supabase.from("responsaveis").select("id,nome_completo").eq(campo, valor).limit(1);
  if (excluirId) q = q.neq("id", excluirId);
  const { data, error } = await q.maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}

async function checkMatriculaDuplicada({ alunoCpf, alunoRg, respCpf, respRg, excluirAlunoId, excluirResponsavelId }){
  const conflitos = [];

  const alunoPorCpf = await acharAlunoPorCampo("cpf", alunoCpf, excluirAlunoId);
  if (alunoPorCpf) conflitos.push({ tipo: "aluno", campo: "CPF do aluno", outroNome: alunoPorCpf.nome_completo, outroAlunoId: alunoPorCpf.id });

  const alunoPorRg = await acharAlunoPorCampo("rg", alunoRg, excluirAlunoId);
  if (alunoPorRg && !conflitos.some(c => c.outroAlunoId === alunoPorRg.id)) {
    conflitos.push({ tipo: "aluno", campo: "RG do aluno", outroNome: alunoPorRg.nome_completo, outroAlunoId: alunoPorRg.id });
  }

  const respPorCpf = await acharResponsavelPorCampo("cpf", respCpf, excluirResponsavelId);
  if (respPorCpf) conflitos.push({ tipo: "responsavel", campo: "CPF do responsável", outroNome: respPorCpf.nome_completo, outroResponsavelId: respPorCpf.id });

  const respPorRg = await acharResponsavelPorCampo("rg", respRg, excluirResponsavelId);
  if (respPorRg && !conflitos.some(c => c.outroResponsavelId === respPorRg.id)) {
    conflitos.push({ tipo: "responsavel", campo: "RG do responsável", outroNome: respPorRg.nome_completo, outroResponsavelId: respPorRg.id });
  }

  for (const c of conflitos) {
    if (c.tipo === "responsavel") {
      const { data } = await supabase.from("alunos").select("id,nome_completo").eq("responsavel_id", c.outroResponsavelId);
      c.alunosVinculados = data || [];
    }
  }
  return conflitos;
}

function showDupMatriculaModal(conflitos, onProceed){
  const itens = conflitos.map(c => {
    if (c.tipo === "aluno") {
      return `<li><b>${esc(c.campo)}</b> já usado no cadastro de <b>${esc(c.outroNome)}</b>.</li>`;
    }
    const filhos = (c.alunosVinculados || []).map(a => esc(a.nome_completo)).join(", ") || "nenhum aluno vinculado ainda";
    return `<li><b>${esc(c.campo)}</b> já cadastrado para <b>${esc(c.outroNome)}</b> (responsável de: ${filhos}).</li>`;
  }).join("");
  byId("dup-modal-body").innerHTML = `
    Encontramos cadastro(s) já existentes com esses dados:
    <ul>${itens}</ul>
    Você pode apagar o cadastro de aluno relacionado e recomeçar, ou seguir e cadastrar esta como uma nova matrícula (por exemplo, um irmão usando o mesmo responsável).`;

  const alunosParaApagar = new Map();
  conflitos.forEach(c => {
    if (c.tipo === "aluno") alunosParaApagar.set(c.outroAlunoId, c.outroNome);
    else if ((c.alunosVinculados || []).length === 1) {
      alunosParaApagar.set(c.alunosVinculados[0].id, c.alunosVinculados[0].nome_completo);
    }
  });

  const backdrop = byId("dup-modal-backdrop");
  const deleteBtn = byId("dup-modal-delete");
  const proceedBtn = byId("dup-modal-proceed");
  const cancelBtn = byId("dup-modal-cancel");
  const closeModal = () => backdrop.classList.remove("open");

  deleteBtn.hidden = alunosParaApagar.size === 0;
  deleteBtn.disabled = false;
  deleteBtn.textContent = "Apagar a outra matrícula";
  deleteBtn.onclick = async () => {
    const nomes = [...alunosParaApagar.values()];
    const lista = nomes.map(n => `"${n}"`).join(" e ");
    if (!confirm(`Isso vai apagar definitivamente ${nomes.length > 1 ? "os alunos" : "o aluno"} ${lista} — matrícula, financeiro, presenças e simulados. Essa ação não pode ser desfeita. Confirma?`)) return;
    deleteBtn.disabled = true; deleteBtn.textContent = "Apagando...";
    try {
      for (const alunoId of alunosParaApagar.keys()) {
        const { error: finErr } = await supabase.from("matricula_financeiro").delete().eq("aluno_id", alunoId);
        if (finErr) throw finErr;
        const { error: alunoErr } = await supabase.from("alunos").delete().eq("id", alunoId);
        if (alunoErr) throw alunoErr;
      }
      closeModal();
      await onProceed();
    } catch (err) {
      console.error(err);
      alert("Erro ao apagar a outra matrícula: " + (err.message || err));
      deleteBtn.disabled = false; deleteBtn.textContent = "Apagar a outra matrícula";
    }
  };
  proceedBtn.onclick = () => { closeModal(); onProceed(); };
  cancelBtn.onclick = closeModal;
  backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };

  backdrop.classList.add("open");
}

/* ===================== nova matrícula (grava no Supabase) ===================== */
byId("save-form-btn").addEventListener("click", async () => {
  const nome = byId("f-aluno-nome").value.trim();
  if (!nome) { alert("Informe o nome completo do aluno."); return; }

  if (checkSelfResponsavelWarning()) {
    alert("O aluno não pode ser seu próprio responsável financeiro.");
    return;
  }

  const alunoCpfVal = byId("f-aluno-cpf").value.trim();
  if (alunoCpfVal && !validarCPF(alunoCpfVal)) {
    alert("O CPF do aluno parece estar incorreto. Confira os números antes de salvar.");
    byId("f-aluno-cpf").focus();
    return;
  }
  const respCpfVal = byId("f-resp-cpf").value.trim();
  if (respCpfVal && !validarCPF(respCpfVal)) {
    alert("O CPF do responsável parece estar incorreto. Confira os números antes de salvar.");
    byId("f-resp-cpf").focus();
    return;
  }
  const respNomeVal = byId("f-resp-nome").value.trim();
  if (respNomeVal && !respCpfVal) {
    const semCpfOk = confirm(
      "O responsável está sendo cadastrado sem CPF.\n\n" +
      "A senha inicial da Área do Responsável é gerada a partir dos 6 primeiros dígitos do CPF — sem ele, o responsável não vai conseguir fazer o primeiro acesso, e a secretaria vai precisar completar o cadastro depois.\n\n" +
      "Salvar assim mesmo?"
    );
    if (!semCpfOk) { byId("f-resp-cpf").focus(); return; }
  }

  if (!(await confirmarProblemas(problemasMatricula().filter(m => !/^CPF/.test(m)), "salvar a matrícula"))) return;

  const editingSnapshotPreCheck = editingStudentId ? students.find(s => s.id === editingStudentId) : null;
  const conflitos = await checkMatriculaDuplicada({
    alunoCpf: alunoCpfVal,
    alunoRg: byId("f-aluno-rg").value.trim(),
    respCpf: respCpfVal,
    respRg: byId("f-resp-rg").value.trim(),
    excluirAlunoId: editingStudentId || null,
    excluirResponsavelId: editingSnapshotPreCheck ? editingSnapshotPreCheck.responsavelId : null,
  });
  if (conflitos.length) {
    showDupMatriculaModal(conflitos, executeSaveMatricula);
    return;
  }
  await executeSaveMatricula();
});

async function executeSaveMatricula(){
  const nome = byId("f-aluno-nome").value.trim();
  const btn = byId("save-form-btn");
  const labelEl = byId("save-form-btn-label");
  const originalLabelText = labelEl.textContent;
  btn.disabled = true; labelEl.textContent = "Salvando...";

  const isEdit = !!editingStudentId;
  const editingSnapshot = isEdit ? students.find(s => s.id === editingStudentId) : null;
  let succeeded = false;

  try {
    let responsavelId = isEdit ? (editingSnapshot ? editingSnapshot.responsavelId : null) : null;
    const respNome = byId("f-resp-nome").value.trim();
    const respPayload = {
      nome_completo: respNome,
      data_nascimento: byId("f-resp-nascimento").value || null,
      profissao: byId("f-resp-profissao").value.trim() || null,
      telefone: byId("f-resp-tel").value.trim() || null,
      email: byId("f-resp-email").value.trim() || null,
      rg: byId("f-resp-rg").value.trim() || null,
      rg_orgao_expedidor: byId("f-resp-rg-orgao").value.trim() || null,
      rg_data_expedicao: byId("f-resp-rg-data").value || null,
      cpf: byId("f-resp-cpf").value.trim() || null,
    };
    if (respNome) {
      if (!responsavelId && respPayload.cpf) {
        // Irmãos: se já existe um responsável com esse CPF (ex: outro filho já matriculado),
        // reaproveita o cadastro em vez de tentar inserir de novo e violar o unique de cpf.
        const { data: existente, error: buscaErr } = await supabase
          .from("responsaveis").select("id").eq("cpf", respPayload.cpf).maybeSingle();
        if (buscaErr) throw buscaErr;
        if (existente) responsavelId = existente.id;
      }
      if (responsavelId) {
        const { error: respErr } = await supabase.from("responsaveis").update(respPayload).eq("id", responsavelId);
        if (respErr) throw respErr;
      } else {
        const { data: resp, error: respErr } = await supabase.from("responsaveis").insert(respPayload).select("id").single();
        if (respErr) throw respErr;
        responsavelId = resp.id;
      }
    }

    const alunoPayload = {
      nome_completo: nome,
      data_nascimento: byId("f-aluno-nascimento").value || null,
      local_nascimento: byId("f-aluno-local-nasc").value.trim() || null,
      endereco: byId("f-aluno-endereco").value.trim() || null,
      bairro: byId("f-aluno-bairro").value.trim() || null,
      cidade: byId("f-aluno-cidade").value.trim() || null,
      cep: byId("f-aluno-cep").value.trim() || null,
      uf: byId("f-aluno-uf").value.trim().toUpperCase() || null,
      telefone: byId("f-aluno-tel").value.trim() || null,
      email: byId("f-aluno-email").value.trim() || null,
      rg: byId("f-aluno-rg").value.trim() || null,
      rg_orgao_expedidor: byId("f-aluno-rg-orgao").value.trim() || null,
      rg_data_expedicao: byId("f-aluno-rg-data").value || null,
      cpf: byId("f-aluno-cpf").value.trim() || null,
      turma_id: byId("f-turma").value || null,
      responsavel_id: responsavelId,
      data_matricula: byId("f-data-matricula").value || null,
    };

    let alunoId;
    if (isEdit) {
      const { error: alunoErr } = await supabase.from("alunos").update(alunoPayload).eq("id", editingStudentId);
      if (alunoErr) throw alunoErr;
      alunoId = editingStudentId;
    } else {
      alunoPayload.status = "ativo";
      const { data: aluno, error: alunoErr } = await supabase.from("alunos").insert(alunoPayload).select("id").single();
      if (alunoErr) throw alunoErr;
      alunoId = aluno.id;
    }

    const valorParcelaRaw = byId("f-fin-valor-parcela").value.trim();
    const vencRaw = byId("f-fin-vencimento").value.trim();
    const valorMatricula = byId("f-fin-valor-matricula").value.trim();
    const dataPag = byId("f-fin-data-pagamento").value;
    const apostilaValor = byId("f-fin-apostila-valor").value.trim();
    const existingFinId = editingSnapshot ? editingSnapshot.finId : null;
    const totalRaw = byId("f-fin-total").value.trim();
    const qtdRaw = byId("f-fin-parcelas").value.trim();
    const apostilaForma = byId("f-fin-apostila-forma").value;
    const apostilaParcelas = parseInt(byId("f-fin-apostila-parcelas").value, 10);
    const apostilaData = byId("f-fin-apostila-data").value;
    const formaMat = byId("f-fin-forma").value;
    const temFin = valorParcelaRaw || valorMatricula || totalRaw || qtdRaw || dataPag || vencRaw;

    if (temFin || existingFinId) {
      const diaVenc = vencRaw ? parseInt(vencRaw.replace(/\D/g, ""), 10) : null;
      const qtd = parseInt(qtdRaw, 10);
      const notas = [];
      if (valorMatricula) notas.push(`Matrícula: ${valorMatricula} via ${formaMat}${dataPag ? " em " + fmtDate(dataPag) : ""}`);
      if (apostilaValor) notas.push(`Material didático: ${apostilaValor} via ${apostilaForma}${apostilaParcelas > 1 ? " em " + apostilaParcelas + "x" : ""}`);
      // todos os campos financeiros do formulário vão para colunas próprias (antes só parcela e vencimento eram gravados)
      const finPayload = {
        valor_matricula: parseMoneyBR(valorMatricula),
        forma_pagamento_matricula: (valorMatricula || dataPag) ? formaMat : null,
        data_pagamento_matricula: dataPag || null,
        valor_total_curso: parseMoneyBR(totalRaw),
        qtd_parcelas: qtd > 0 ? qtd : null,
        valor_parcela: valorParcelaRaw ? parseMoneyBR(valorParcelaRaw) : (editingSnapshot ? editingSnapshot.mensalidade : null),
        dia_vencimento: (diaVenc && !isNaN(diaVenc)) ? diaVenc : null,
      };
      if (notas.length) finPayload.matricula_raw = notas.join(" / ");

      if (existingFinId) {
        const { error: finErr } = await supabase.from("matricula_financeiro").update(finPayload).eq("id", existingFinId);
        if (finErr) throw finErr;
      } else {
        const { error: finErr } = await supabase.from("matricula_financeiro").insert({
          aluno_id: alunoId,
          ano_letivo: selectedAnoLetivo,
          tipo: "integral",
          ...finPayload,
          matricula_raw: notas.join(" / ") || null,
        });
        if (finErr) throw finErr;
      }
    }

    // material didático: uma linha por aluno na tabela material_didatico (parcelas vão junto da forma: "Cartão em 4x")
    if (apostilaValor || apostilaData) {
      const matPayload = {
        aluno_id: alunoId,
        tipo: "apostila",
        valor: parseMoneyBR(apostilaValor),
        forma_pagamento: apostilaForma + (apostilaParcelas > 1 ? " em " + apostilaParcelas + "x" : ""),
        data_pagamento: apostilaData || null,
      };
      const { data: matExist, error: matBuscaErr } = await supabase.from("material_didatico").select("id").eq("aluno_id", alunoId).eq("tipo", "apostila").maybeSingle();
      if (matBuscaErr) throw matBuscaErr;
      const { error: matErr } = matExist
        ? await supabase.from("material_didatico").update(matPayload).eq("id", matExist.id)
        : await supabase.from("material_didatico").insert(matPayload);
      if (matErr) throw matErr;
    }

    alert(isEdit ? "Matrícula atualizada com sucesso!" : "Matrícula salva com sucesso!");
    document.querySelectorAll("#view-form input[type=text], #view-form input[type=email], #view-form input[type=tel], #view-form input[type=date]:not(#f-data-matricula)").forEach(i => i.value = "");
    document.querySelectorAll("#view-form .cpf-hint").forEach(h => { h.textContent = ""; h.className = "cpf-hint"; });
    document.querySelectorAll("#view-form .cpf-valid, #view-form .cpf-invalid").forEach(i => i.classList.remove("cpf-valid", "cpf-invalid"));
    editingStudentId = null;
    byId("form-title").textContent = "Nova matrícula";
    byId("form-subtitle").textContent = `Mesmos campos do Requerimento de Matrícula em papel — turma de ${selectedAnoLetivo}`;
    labelEl.textContent = "Salvar matrícula";
    byId("self-resp-warning").hidden = true;
    succeeded = true;
    await loadStudents();
    applyAnoLetivoFilter();
    renderAll();
    goto("students");
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar matrícula: " + (err.message || err));
  } finally {
    btn.disabled = false;
    if (!succeeded) labelEl.textContent = originalLabelText;
  }
}

/* ===================== validação de RG, telefone, datas e e-mail ===================== */
/* RG não tem dígito verificador nacional: conferimos o formato (só letras/dígitos/. - /), o tamanho
   plausível e as trocas mais comuns (repetido, igual ao do responsável). RG igual ao CPF é aceito: há RGs que usam o número do CPF. */
function maskPhoneBR(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? "(" + d : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function valTelefone(v) {
  const d = String(v || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length < 10 || d.length > 11) return "Telefone incompleto: use DDD + número (10 ou 11 dígitos)";
  if (Number(d.slice(0, 2)) < 11) return "DDD inválido";
  if (d.length === 11 && d[2] !== "9") return "Celular com 11 dígitos deve começar com 9 depois do DDD";
  if (/^(\d)\1+$/.test(d.slice(2))) return "Número de telefone inválido (dígitos repetidos)";
  return "";
}
function valRG(v, cpfRaw) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (!/^[A-Za-z0-9.\-\/ ]+$/.test(s)) return "RG com caracteres inválidos (use só letras, números, ponto e traço)";
  const d = s.replace(/\D/g, "");
  if (d.length < 5) return "RG muito curto — confira";
  if (d.length > 12) return "RG muito longo — confira";
  if (/^(\d)\1+$/.test(d)) return "RG com dígitos repetidos — confira";
  return "";
}
function valEmail(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? "" : "E-mail em formato inválido";
}
function idadeEm(iso) {
  const n = new Date(iso + "T12:00:00"), t = new Date();
  let a = t.getFullYear() - n.getFullYear();
  if (t.getMonth() < n.getMonth() || (t.getMonth() === n.getMonth() && t.getDate() < n.getDate())) a--;
  return a;
}
function dataValida(iso) { return !iso || (/^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(new Date(iso + "T12:00:00")) && Number(iso.slice(0, 4)) >= 1900); }
function valNascimento(iso, papel) {
  if (!iso) return "";
  if (!dataValida(iso)) return "Data inválida";
  if (new Date(iso + "T12:00:00") > new Date()) return "Data de nascimento no futuro";
  const a = idadeEm(iso);
  if (papel === "aluno" && (a < 5 || a > 30)) return `Aluno com ${a} anos — confira a data`;
  if (papel === "resp" && a < 18) return `Responsável com ${a} anos — confira a data`;
  if (a > 100) return "Idade acima de 100 anos — confira a data";
  return "";
}
function valExpedicao(iso, nascIso) {
  if (!iso) return "";
  if (!dataValida(iso)) return "Data inválida";
  if (new Date(iso + "T12:00:00") > new Date()) return "Data de expedição no futuro";
  if (nascIso && iso < nascIso) return "Expedição anterior ao nascimento";
  return "";
}
/* mensagem de erro/aviso embaixo do campo (mesmo visual da dica do CPF) */
function ligarDica(id, fn) {
  const el = byId(id);
  if (!el) return;
  let dica = byId(id + "-dica");
  if (!dica) { dica = document.createElement("div"); dica.className = "cpf-hint"; dica.id = id + "-dica"; el.insertAdjacentElement("afterend", dica); }
  const atualizar = () => {
    const msg = fn(el.value);
    dica.textContent = msg; dica.classList.toggle("invalid", !!msg);
    el.classList.toggle("cpf-invalid", !!msg);
  };
  el.addEventListener("input", atualizar); el.addEventListener("change", atualizar); el.addEventListener("blur", atualizar);
  el._atualizarDica = atualizar;
}
function ligarTelefone(id) {
  const el = byId(id);
  el.addEventListener("input", () => { el.value = maskPhoneBR(el.value); });
  ligarDica(id, valTelefone);
}
/* confere o formulário de matrícula inteiro; devolve a lista de problemas */
function problemasMatricula(avisarFaltantes) {
  const v = id => (byId(id) || {}).value || "";
  const out = [];
  if (avisarFaltantes) {
    if (v("f-aluno-nome").trim() && !v("f-aluno-rg").trim()) out.push("RG do aluno: não preenchido");
    if (v("f-resp-nome").trim() && !v("f-resp-rg").trim()) out.push("RG do responsável: não preenchido");
  }
  const add = (campo, msg) => { if (msg) out.push(campo + ": " + msg); };
  add("Telefone do aluno", valTelefone(v("f-aluno-tel")));
  add("Telefone do responsável", valTelefone(v("f-resp-tel")));
  add("RG do aluno", valRG(v("f-aluno-rg"), v("f-aluno-cpf")));
  add("RG do responsável", valRG(v("f-resp-rg"), v("f-resp-cpf")));
  const rgA = v("f-aluno-rg").replace(/\D/g, ""), rgR = v("f-resp-rg").replace(/\D/g, "");
  if (rgA && rgA === rgR) out.push("RG: aluno e responsável estão com o mesmo número");
  add("Nascimento do aluno", valNascimento(v("f-aluno-nascimento"), "aluno"));
  add("Nascimento do responsável", valNascimento(v("f-resp-nascimento"), "resp"));
  add("Expedição do RG do aluno", valExpedicao(v("f-aluno-rg-data"), v("f-aluno-nascimento")));
  add("Expedição do RG do responsável", valExpedicao(v("f-resp-rg-data"), v("f-resp-nascimento")));
  add("E-mail do aluno", valEmail(v("f-aluno-email")));
  { const cep = v("f-aluno-cep").replace(/\D/g, ""); if (cep && cep.length !== 8) out.push("CEP: deve ter 8 dígitos"); }
  { const uf = v("f-aluno-uf").trim(); if (uf && !/^[A-Za-z]{2}$/.test(uf)) out.push("Estado: use a sigla com 2 letras (ex: MG)"); }
  add("E-mail do responsável", valEmail(v("f-resp-email")));
  if (v("f-aluno-cpf") && !validarCPF(v("f-aluno-cpf"))) out.push("CPF do aluno: inválido");
  if (v("f-resp-cpf") && !validarCPF(v("f-resp-cpf"))) out.push("CPF do responsável: inválido");
  return out;
}
/* true = pode seguir (sem problemas, ou a pessoa confirmou seguir assim mesmo) */
function confirmarProblemas(lista, acao) {
  if (!lista.length) return Promise.resolve(true);
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";
    ov.innerHTML = `<div style="background:var(--surface,#1b2420);color:var(--text,#e8efe9);border:1px solid var(--border,#33433b);border-radius:12px;max-width:520px;width:100%;padding:20px;max-height:85vh;overflow:auto">
      <h3 style="margin:0 0 6px;font-size:16px">Confira estes dados antes de ${esc(acao)}</h3>
      <ul style="margin:10px 0 16px;padding-left:20px;line-height:1.6;font-size:14px">${lista.map(m => "<li>" + esc(m) + "</li>").join("")}</ul>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn btn-ghost" id="prob-voltar">Voltar e corrigir</button>
        <button class="btn btn-primary" id="prob-seguir">Continuar assim mesmo</button>
      </div></div>`;
    document.body.appendChild(ov);
    const fim = r => { ov.remove(); resolve(r); };
    ov.querySelector("#prob-voltar").onclick = () => fim(false);
    ov.querySelector("#prob-seguir").onclick = () => fim(true);
    ov.querySelector("#prob-voltar").focus();
  });
}
ligarTelefone("f-aluno-tel"); ligarTelefone("f-resp-tel");
ligarDica("f-aluno-rg", v => valRG(v, byId("f-aluno-cpf").value));
ligarDica("f-resp-rg", v => valRG(v, byId("f-resp-cpf").value));
ligarDica("f-aluno-email", valEmail); ligarDica("f-resp-email", valEmail);
ligarDica("f-aluno-nascimento", v => valNascimento(v, "aluno"));
ligarDica("f-resp-nascimento", v => valNascimento(v, "resp"));
ligarDica("f-aluno-rg-data", v => valExpedicao(v, byId("f-aluno-nascimento").value));
ligarDica("f-resp-rg-data", v => valExpedicao(v, byId("f-resp-nascimento").value));

