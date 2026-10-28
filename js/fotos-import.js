/* ===================== importar fotos dos alunos ===================== */
let pickedFotoFiles = [];

function logFotos(text, cls, clear) {
  const el = byId("fotos-log");
  if (clear) el.innerHTML = "";
  const line = document.createElement("div");
  line.className = "import-log-line" + (cls ? " " + cls : "");
  line.textContent = text;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function groupFotoFilesByFolder(files) {
  const groups = {};
  files.forEach(f => {
    const parts = (f.webkitRelativePath || "").split("/");
    if (parts.length < 2) return;
    const folderName = parts[parts.length - 2];
    (groups[folderName] = groups[folderName] || []).push(f);
  });
  return groups;
}

byId("fotos-pick-btn").addEventListener("click", () => {
  byId("fotos-dir-input").click();
});

byId("fotos-dir-input").addEventListener("change", (e) => {
  pickedFotoFiles = Array.from(e.target.files).filter(f => /\.(jpe?g|png|webp)$/i.test(f.name));
  const groups = groupFotoFilesByFolder(pickedFotoFiles);
  const folderCount = Object.keys(groups).length;
  byId("fotos-picked-summary").textContent =
    `${pickedFotoFiles.length} imagens em ${folderCount} subpastas`;
  byId("fotos-start-btn").disabled = pickedFotoFiles.length === 0;
  logFotos(`Pasta selecionada: ${pickedFotoFiles.length} imagens em ${folderCount} subpastas. Clique em "Iniciar importação" para continuar.`, "muted", true);
});

byId("fotos-start-btn").addEventListener("click", async () => {
  const startBtn = byId("fotos-start-btn");
  const pickBtn = byId("fotos-pick-btn");
  startBtn.disabled = true;
  pickBtn.disabled = true;
  logFotos("Iniciando importação...", "muted", true);

  const groups = groupFotoFilesByFolder(pickedFotoFiles);
  const nameToStudent = new Map(students.map(s => [normName(s.nome), s]));

  let uploaded = 0;
  const unmatched = [];
  const failed = [];

  for (const [folderName, files] of Object.entries(groups)) {
    const key = normName(folderName);
    const targetName = FOLDER_TO_ALUNO[key];
    if (!targetName) {
      unmatched.push(folderName);
      logFotos(`Sem correspondência no mapa: pasta "${folderName}"`, "warn");
      continue;
    }
    const student = nameToStudent.get(normName(targetName));
    if (!student) {
      unmatched.push(folderName);
      logFotos(`Aluno "${targetName}" não encontrado no cadastro atual (pasta "${folderName}")`, "warn");
      continue;
    }
    const best = files.reduce((a, b) => (b.size > a.size ? b : a));
    const ext = (best.name.match(/\.(\w+)$/) || [null, "jpg"])[1].toLowerCase();
    const path = `${student.id}.${ext}`;
    try {
      const { error: upErr } = await supabase.storage.from("fotos-alunos").upload(path, best, {
        upsert: true,
        contentType: best.type || "image/jpeg",
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("alunos").update({ foto_url: path }).eq("id", student.id);
      if (dbErr) throw dbErr;
      fotoUrlCache.delete(path);
      try { await enviarMiniatura(student.id, best); } catch (e) { console.warn("Miniatura não gerada:", e); }
      uploaded++;
      logFotos(`Enviada: ${student.nome}`, "ok");
    } catch (err) {
      failed.push(folderName);
      logFotos(`Erro ao enviar foto de ${student.nome}: ${err.message || err}`, "err");
    }
  }

  logFotos(`Concluído: ${uploaded} fotos enviadas · ${unmatched.length} pastas sem correspondência · ${failed.length} erros de envio.`, "muted");
  startBtn.disabled = false;
  pickBtn.disabled = false;
  try {
    await loadStudents();
    applyAnoLetivoFilter();
    renderFotosTabela();
  } catch (err) {
    console.error(err);
  }
});

