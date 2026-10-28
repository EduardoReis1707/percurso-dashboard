/* ===================== Simulados: rodadas CEFET — Gabarito + correção por OMR ===================== */

/* Uma rodada é considerada "CEFET" (e portanto ganha os botões de Gabarito / OMR) quando
   o nome do simulado menciona CEFET — é a mesma convenção que os nomes reais das rodadas
   já seguem ("1º Simulado Pré-CEFET" etc). Rodadas Enem / 8º ano continuam só com o
   import de JSON existente. */
function isCefetRound(meta){
  return !!(meta && typeof meta.nome === 'string' && /cefet/i.test(meta.nome));
}

function updateCefetToggles(){
  const cefet = isCefetRound(currentSimuladoMeta);
  byId('sim-gab-toggle').classList.toggle('hidden', !cefet);
  byId('sim-omr-toggle').classList.toggle('hidden', !cefet);
  byId('sim-gab-panel').classList.add('hidden');
  byId('sim-omr-panel').classList.add('hidden');
}

/* ---------------- Gabarito oficial ---------------- */

let gabaritoState = {};              // questao_num(1..50) -> 'A'|'B'|'C'|'D', enquanto edita
const gabaritoCache = new Map();     // simulado_id -> array[50] de letras, ou null se incompleto

async function fetchGabaritoRows(simuladoId){
  const { data, error } = await supabase
    .from('simulado_gabaritos')
    .select('questao_num,alternativa_correta')
    .eq('simulado_id', simuladoId);
  if (error) { console.error(error); return []; }
  return data || [];
}

/* Retorna array[50] de letras se o gabarito estiver completo, ou null caso contrário. */
async function fetchGabaritoArray(simuladoId, { fresh } = {}){
  if (!fresh && gabaritoCache.has(simuladoId)) return gabaritoCache.get(simuladoId);
  const rows = await fetchGabaritoRows(simuladoId);
  const arr = new Array(50).fill(null);
  rows.forEach(r => { if (r.questao_num >= 1 && r.questao_num <= 50) arr[r.questao_num - 1] = r.alternativa_correta; });
  const result = arr.every(v => v) ? arr : null;
  gabaritoCache.set(simuladoId, result);
  return result;
}

function renderGabaritoCols(){
  const cols = [[1, 17], [18, 34], [35, 50]];
  byId('gabCols').innerHTML = cols.map(([from, to]) => {
    let rows = '';
    for (let q = from; q <= to; q++) {
      rows += `<div class="gab-row" data-q="${q}">
        <div class="gab-qn">${String(q).padStart(2, '0')}</div>
        <div class="gab-letters">${OMR_LETTERS.map(l =>
          `<button type="button" class="gab-letter ${gabaritoState[q] === l ? 'active' : ''}" data-q="${q}" data-l="${l}">${l}</button>`
        ).join('')}</div>
      </div>`;
    }
    return `<div><div class="gab-col-title">Questões ${from}–${to}</div>${rows}</div>`;
  }).join('');
  byId('gabCols').querySelectorAll('.gab-letter').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = parseInt(btn.getAttribute('data-q'), 10);
      gabaritoState[q] = btn.getAttribute('data-l');
      btn.closest('.gab-letters').querySelectorAll('.gab-letter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateGabStatus();
    });
  });
}

function updateGabStatus(){
  const filled = Object.keys(gabaritoState).length;
  const el = byId('gabStatus');
  if (filled < 50) { el.textContent = `${filled}/50 questões marcadas.`; el.className = 'gab-status warn'; }
  else { el.textContent = 'Todas as 50 questões marcadas — pronto para salvar.'; el.className = 'gab-status ok'; }
}

async function openGabaritoPanel(){
  if (!currentSimuladoMeta) return;
  byId('gabRoundName').textContent = currentSimuladoMeta.nome;
  gabaritoState = {};
  const rows = await fetchGabaritoRows(currentSimuladoMeta.id);
  rows.forEach(r => { gabaritoState[r.questao_num] = r.alternativa_correta; });
  renderGabaritoCols();
  updateGabStatus();
}

async function salvarGabarito(){
  if (!currentSimuladoMeta) return;
  if (Object.keys(gabaritoState).length < 50) { alert('Marque a alternativa correta de todas as 50 questões antes de salvar.'); return; }
  const btn = byId('gabSalvar');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    const rows = [];
    for (let q = 1; q <= 50; q++) rows.push({ simulado_id: currentSimuladoMeta.id, questao_num: q, alternativa_correta: gabaritoState[q] });
    const { error } = await supabase.from('simulado_gabaritos').upsert(rows, { onConflict: 'simulado_id,questao_num' });
    if (error) throw error;
    await fetchGabaritoArray(currentSimuladoMeta.id, { fresh: true });
    byId('gabStatus').textContent = 'Gabarito salvo com sucesso!';
    byId('gabStatus').className = 'gab-status ok';
  } catch (err) {
    console.error(err);
    alert('Erro ao salvar gabarito: ' + (err.message || String(err)));
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar gabarito';
  }
}

/* ---------------- OMR: homografia (4 pontos) em JS puro ---------------- */

/* Resolve Ax=b por eliminação de Gauss com pivô parcial. A é n×n, b é vetor de tamanho n. */
function gaussSolve(A, b){
  const n = A.length;
  A = A.map(row => row.slice());
  b = b.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const pivVal = A[col][col] || 1e-9;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = A[r][col] / pivVal;
      if (!factor) continue;
      for (let c = col; c < n; c++) A[r][c] -= factor * A[col][c];
      b[r] -= factor * b[col];
    }
  }
  return A.map((row, i) => b[i] / (row[i] || 1e-9));
}

/* Homografia planar de 4 correspondências src[i] -> dst[i] (cada um [x,y]).
   Retorna h = [h0..h8] (linha a linha, h8=1) tal que, em coordenadas homogêneas,
   dst = H * src. */
function solveHomography(src, dst){
  const A = [], bvec = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); bvec.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); bvec.push(Y);
  }
  const h = gaussSolve(A, bvec);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function applyHomography(h, pt){
  const [x, y] = pt;
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/* Escala local (pixels-fonte por unidade canônica) perto de (cx,cy), usada para saber
   qual raio (em pixels do scan) corresponde ao raio nominal de uma bolha. */
function estimateLocalScale(h, cx, cy){
  const p0 = applyHomography(h, [cx, cy]);
  const p1 = applyHomography(h, [cx + 10, cy]);
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  return Math.sqrt(dx * dx + dy * dy) / 10;
}

/* ---------------- OMR: detecção automática da borda do cartão ---------------- */

function autoGuessCorners(canvas){
  const w = canvas.width, h = canvas.height;
  const insetX = w * 0.03, insetY = h * 0.03;
  let corners = [[insetX, insetY], [w - insetX, insetY], [w - insetX, h - insetY], [insetX, h - insetY]];
  try {
    const img = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const lum = (x, y) => { const i = (y * w + x) * 4; return 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]; };
    const darkThresh = 150;
    function scanRow(yFrom, yTo, step){
      for (let y = yFrom; step > 0 ? y < yTo : y > yTo; y += step) {
        let run = 0, best = 0;
        for (let x = 0; x < w; x += 2) { if (lum(x, y) < darkThresh) { run += 2; if (run > best) best = run; } else run = 0; }
        if (best > w * 0.5) return y;
      }
      return null;
    }
    function scanCol(xFrom, xTo, step){
      for (let x = xFrom; step > 0 ? x < xTo : x > xTo; x += step) {
        let run = 0, best = 0;
        for (let y = 0; y < h; y += 2) { if (lum(x, y) < darkThresh) { run += 2; if (run > best) best = run; } else run = 0; }
        if (best > h * 0.5) return x;
      }
      return null;
    }
    const top = scanRow(Math.round(h * 0.01), Math.round(h * 0.25), 2);
    const bottom = scanRow(h - 1 - Math.round(h * 0.01), Math.round(h * 0.75), -2);
    const left = scanCol(Math.round(w * 0.01), Math.round(w * 0.35), 2);
    const right = scanCol(w - 1 - Math.round(w * 0.01), Math.round(w * 0.65), -2);
    if (top != null && bottom != null && left != null && right != null && bottom > top && right > left) {
      corners = [[left, top], [right, top], [right, bottom], [left, bottom]];
    }
  } catch (e) {
    console.warn('auto-guess de cantos do cartão falhou, usando cantos padrão', e);
  }
  return corners;
}

/* ---------------- OMR: leitura das 200 bolhas de uma folha ---------------- */

function sampleFill(imgData, width, height, cx, cy, r){
  let dark = 0, total = 0;
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(height - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * width + x) * 4;
      const lum = 0.299 * imgData.data[i] + 0.587 * imgData.data[i + 1] + 0.114 * imgData.data[i + 2];
      total++;
      if (lum < 120) dark++;
    }
  }
  return total ? dark / total : 0;
}

/* Regra de decisão da metodologia: mx = maior taxa de preenchimento, sec = segunda maior.
   mx < 0.25              -> em branco
   sec >= 0.6*mx e >=0.30 -> marcação dupla (ambígua)
   senão letra = argmax; se sec >= 0.35*mx e >= 0.25, ainda fica marcada como "ambígua"
   para revisão manual, mesmo já tendo uma letra escolhida. */
function decideBubble(fills){
  const sorted = OMR_LETTERS.slice().sort((a, b) => fills[b] - fills[a]);
  const mx = fills[sorted[0]], sec = fills[sorted[1]];
  if (mx < 0.25) return { letter: null, blank: true, double: false, ambig: false };
  if (sec >= 0.6 * mx && sec >= 0.30) return { letter: null, blank: false, double: true, ambig: false };
  const ambig = (sec >= 0.35 * mx && sec >= 0.25);
  return { letter: sorted[0], blank: false, double: false, ambig };
}

/* Roda a homografia + leitura das 50 questões de uma folha já com os 4 cantos confirmados.
   Preenche sheet.marc[50], sheet.flags[50], sheet.H e retorna as contagens de revisão. */
function processSheet(idx){
  const sheet = omrSheets[idx];
  const CW = OMR_CANVAS_CW, CH = OMR_CANVAS_CH;
  const canonicalCorners = [[0, 0], [CW, 0], [CW, CH], [0, CH]];
  const H = solveHomography(canonicalCorners, sheet.corners);
  sheet.H = H;
  const w = sheet.canvas.width, h = sheet.canvas.height;
  const imgData = sheet.canvas.getContext('2d').getImageData(0, 0, w, h);
  sheet.marc = new Array(50).fill(null);
  sheet.flags = new Array(50).fill(null);
  let blanks = 0, doubles = 0, ambigs = 0;
  for (let q = 1; q <= 50; q++) {
    const pos = omrBubblePositions(q);
    const fills = {};
    OMR_LETTERS.forEach(l => {
      const [fx, fy] = pos[l];
      const cxCanon = fx * CW, cyCanon = fy * CH;
      const srcPt = applyHomography(H, [cxCanon, cyCanon]);
      const scale = estimateLocalScale(H, cxCanon, cyCanon);
      const r = Math.max(4, OMR_BUBBLE_RADIUS_FRAC * CW * scale);
      fills[l] = sampleFill(imgData, w, h, srcPt[0], srcPt[1], r);
    });
    const res = decideBubble(fills);
    if (res.blank) blanks++; else if (res.double) doubles++; else if (res.ambig) ambigs++;
    sheet.marc[q - 1] = res.letter;
    sheet.flags[q - 1] = res;
  }
  return { blanks, doubles, ambigs };
}

/* Recorta, de uma folha já processada, a imagem em torno da fileira de bolhas de uma
   questão (para o staff conferir visualmente na tela de revisão). */
function cropBubbleRow(sheet, q){
  const { col, row } = omrQuestionColRow(q);
  const y = OMR_Y_ROWS[row];
  const xs = OMR_X_COLS[col];
  const CW = sheet.CW, CH = sheet.CH;
  const canonicalBox = [
    [xs[0] - 0.03, y - 0.022], [xs[3] + 0.03, y - 0.022],
    [xs[3] + 0.03, y + 0.022], [xs[0] - 0.03, y + 0.022],
  ];
  const pts = canonicalBox.map(([fx, fy]) => applyHomography(sheet.H, [fx * CW, fy * CH]));
  const xsPts = pts.map(p => p[0]), ysPts = pts.map(p => p[1]);
  const minX = Math.max(0, Math.min(...xsPts)), maxX = Math.min(sheet.canvas.width, Math.max(...xsPts));
  const minY = Math.max(0, Math.min(...ysPts)), maxY = Math.min(sheet.canvas.height, Math.max(...ysPts));
  const cw = Math.max(1, Math.round(maxX - minX)), ch = Math.max(1, Math.round(maxY - minY));
  const crop = document.createElement('canvas');
  crop.width = cw; crop.height = ch;
  crop.getContext('2d').drawImage(sheet.canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return crop.toDataURL('image/jpeg', 0.85);
}

/* ---------------- OMR: estado do assistente / wizard ---------------- */

let omrSheets = [];          // uma entrada por folha (página) processada
let omrCurrentSheetIdx = 0;
let omrGabarito = null;      // array[50] de letras da rodada atual
let omrRosterPopulated = false;

function resetOmrState(){
  omrSheets = [];
  omrCurrentSheetIdx = 0;
  byId('omrUploadStep').classList.add('hidden');
  byId('omrCornersStep').classList.add('hidden');
  byId('omrReviewStep').classList.add('hidden');
  byId('omrDoneStep').classList.add('hidden');
  byId('omrUploadProgress').textContent = '';
  const fi = byId('omrFileInput'); if (fi) fi.value = '';
}

function omrCefetTurmaIds(){
  return new Set(turmasList.filter(t => t.tipo === 'CEFET').map(t => t.id));
}
function populateOmrRoster(){
  const cefetIds = omrCefetTurmaIds();
  const roster = students.filter(s => cefetIds.has(s.turmaId));
  byId('omrStudentList').innerHTML = roster.map(s => `<option value="${esc(s.nome)}">`).join('');
  byId('omrStudentTurma').innerHTML = turmasList.filter(t => t.tipo === 'CEFET').map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
  omrRosterPopulated = true;
}

async function openOmrPanel(){
  if (!currentSimuladoMeta) return;
  byId('omrRoundName').textContent = currentSimuladoMeta.nome;
  resetOmrState();
  const blockedEl = byId('omrBlocked');
  const gab = await fetchGabaritoArray(currentSimuladoMeta.id);
  if (!gab) {
    blockedEl.textContent = 'Este simulado ainda não tem um gabarito completo salvo. Registre o gabarito (botão "Gabarito (CEFET)") antes de corrigir os cartões.';
    blockedEl.classList.remove('hidden');
    return;
  }
  blockedEl.classList.add('hidden');
  omrGabarito = gab;
  byId('omrUploadStep').classList.remove('hidden');
}

async function handleOmrFiles(fileList){
  const progressEl = byId('omrUploadProgress');
  const files = [...fileList];
  if (!files.length) return;
  if (!window['pdfjsLib']) {
    progressEl.textContent = 'Carregando biblioteca de leitura de PDF...';
    try { await ensurePdfJsLoaded(); }
    catch (err) { progressEl.textContent = 'Erro: biblioteca de leitura de PDF não carregou (verifique a conexão).'; return; }
  }
  for (const file of files) {
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      for (let p = 1; p <= pdf.numPages; p++) {
        progressEl.textContent = `Renderizando ${file.name} — página ${p}/${pdf.numPages}...`;
        const page = await pdf.getPage(p);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = 1650 / vp0.width;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        omrSheets.push({
          canvas, corners: autoGuessCorners(canvas),
          studentName: '', alunoId: null, turma: (turmasList.find(t => t.tipo === 'CEFET') || {}).id || null,
          marc: null, flags: null, H: null, CW: OMR_CANVAS_CW, CH: OMR_CANVAS_CH,
          fileLabel: file.name + (pdf.numPages > 1 ? (' · pág. ' + p) : ''),
          thumbUrl: null,
        });
      }
    } catch (err) {
      console.error('erro ao processar PDF', file.name, err);
      progressEl.textContent = `Erro ao processar ${file.name}: ${err.message || err}`;
    }
  }
  progressEl.textContent = `${omrSheets.length} folha(s) prontas para conferência de cantos.`;
  if (omrSheets.length) {
    byId('omrUploadStep').classList.add('hidden');
    byId('omrCornersStep').classList.remove('hidden');
    omrCurrentSheetIdx = 0;
    showCornersStepForSheet(0);
  }
}

function renderOmrThumbs(){
  const wrap = byId('omrThumbList');
  wrap.innerHTML = omrSheets.map((s, i) => {
    if (!s.thumbUrl) {
      const t = document.createElement('canvas');
      t.width = 80; t.height = Math.round(80 * s.canvas.height / s.canvas.width);
      t.getContext('2d').drawImage(s.canvas, 0, 0, t.width, t.height);
      s.thumbUrl = t.toDataURL('image/jpeg', 0.6);
    }
    const cls = i === omrCurrentSheetIdx ? 'current' : (s.marc ? 'done' : '');
    return `<div class="omr-sheet-thumb ${cls}" data-i="${i}" title="${esc(s.studentName || s.fileLabel || '')}"><img src="${s.thumbUrl}"></div>`;
  }).join('');
  wrap.querySelectorAll('.omr-sheet-thumb').forEach(el => {
    el.addEventListener('click', () => {
      omrCurrentSheetIdx = parseInt(el.getAttribute('data-i'), 10);
      showCornersStepForSheet(omrCurrentSheetIdx);
    });
  });
}

function wireOmrCornerDrag(markerEl, holder, sheet, i){
  let dragging = false;
  const move = (clientX, clientY) => {
    const rect = holder.getBoundingClientRect();
    let x = (clientX - rect.left) / rect.width * sheet.canvas.width;
    let y = (clientY - rect.top) / rect.height * sheet.canvas.height;
    x = Math.max(0, Math.min(sheet.canvas.width, x));
    y = Math.max(0, Math.min(sheet.canvas.height, y));
    sheet.corners[i] = [x, y];
    markerEl.style.left = (x / sheet.canvas.width * 100) + '%';
    markerEl.style.top = (y / sheet.canvas.height * 100) + '%';
  };
  markerEl.addEventListener('pointerdown', (e) => { dragging = true; try { markerEl.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  markerEl.addEventListener('pointermove', (e) => { if (dragging) move(e.clientX, e.clientY); });
  markerEl.addEventListener('pointerup', (e) => { dragging = false; try { markerEl.releasePointerCapture(e.pointerId); } catch (_) {} });
  markerEl.addEventListener('pointercancel', () => { dragging = false; });
}

function showCornersStepForSheet(idx){
  const sheet = omrSheets[idx];
  byId('omrCornersProgress').textContent = `Folha ${idx + 1} de ${omrSheets.length}${sheet.fileLabel ? ' — ' + sheet.fileLabel : ''}`;
  const holder = byId('omrCanvasHolder');
  holder.innerHTML = '';
  holder.appendChild(sheet.canvas);
  sheet.canvas.style.width = '100%'; sheet.canvas.style.height = 'auto'; sheet.canvas.style.display = 'block';
  sheet.corners.forEach((pt, i) => {
    const m = document.createElement('div');
    m.className = 'omr-corner';
    m.style.left = (pt[0] / sheet.canvas.width * 100) + '%';
    m.style.top = (pt[1] / sheet.canvas.height * 100) + '%';
    wireOmrCornerDrag(m, holder, sheet, i);
    holder.appendChild(m);
  });
  byId('omrConfirmCorners').classList.remove('hidden');
  byId('omrStudentPick').classList.add('hidden');
  byId('omrReadSummary').textContent = '';
  renderOmrThumbs();
}

function buildReviewStep(){
  const container = byId('omrReviewList');
  let html = '';
  omrSheets.forEach((sheet, sIdx) => {
    const flaggedQs = [];
    for (let q = 1; q <= 50; q++) { const f = sheet.flags[q - 1]; if (f && (f.blank || f.double || f.ambig)) flaggedQs.push(q); }
    if (!flaggedQs.length) return;
    html += `<div class="omr-review-group"><h4>${esc(sheet.studentName || '(sem nome)')} — ${flaggedQs.length} questão(ões) para revisar</h4>`;
    flaggedQs.forEach(q => {
      const f = sheet.flags[q - 1];
      const tag = f.blank ? 'blank' : (f.double ? 'double' : 'ambig');
      const tagLabel = f.blank ? 'Em branco' : (f.double ? 'Marcação dupla' : 'Ambígua');
      const current = sheet.marc[q - 1];
      const cropUrl = cropBubbleRow(sheet, q);
      html += `<div class="omr-review-item" data-q="${q}" data-sheet="${sIdx}">
        <div class="omr-review-crop"><img src="${cropUrl}"></div>
        <div><div style="font-family:var(--sim-mono);font-weight:700">Q${q}</div><div class="omr-review-tag ${tag}">${tagLabel}</div></div>
        <div class="omr-review-pick">
          ${OMR_LETTERS.map(l => `<button type="button" data-l="${l}" class="${current === l ? 'active' : ''}">${l}</button>`).join('')}
          <button type="button" data-l="" class="blankbtn ${current ? '' : 'active'}">sem resposta</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  });
  container.innerHTML = html || '<p style="color:var(--sim-muted);font-size:13px">Nenhuma questão precisou de revisão manual — tudo foi lido automaticamente.</p>';
  container.querySelectorAll('.omr-review-pick button').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.omr-review-item');
      const sIdx = parseInt(item.getAttribute('data-sheet'), 10);
      const q = parseInt(item.getAttribute('data-q'), 10);
      omrSheets[sIdx].marc[q - 1] = btn.getAttribute('data-l') || null;
      item.querySelectorAll('.omr-review-pick button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

/* Calcula acertos/pct/tópicos/ok/marc/gab de uma folha e grava (insere ou atualiza) em
   simulado_resultados — mesmo formato que importSimuladoRound/salvarLancarResultado já
   usam, então a rodada continua aparecendo certinho no ranking/relatórios existentes. */
async function saveOmrSheet(sheet, gab){
  const marc = sheet.marc;
  const ok = marc.map((m, i) => (m && gab[i] && m === gab[i]) ? 1 : 0);
  const acertos = ok.reduce((a, b) => a + b, 0);
  const pct = acertos / 50 * 100;
  const topicos = {};
  TOPIC_RANGES.forEach(([topic, from, to]) => {
    let c = 0; for (let q = from; q <= to; q++) c += ok[q - 1];
    topicos[topic] = c;
  });
  const alunoId = sheet.alunoId != null ? sheet.alunoId : matchAlunoIdByName(sheet.studentName);
  const payload = {
    simulado_id: currentSimuladoMeta.id,
    aluno_id: alunoId,
    nome_referencia: sheet.studentName,
    turma_id: sheet.turma || null,
    acertos, pct, topicos,
    ok, marc, gab,
  };
  let existing = null;
  if (alunoId) existing = STUDENTS.find(s => s.aluno_id === alunoId);
  if (!existing) existing = STUDENTS.find(s => normName(s.nome) === normName(sheet.studentName));
  let error;
  if (existing && existing.id) {
    ({ error } = await supabase.from('simulado_resultados').update(payload).eq('id', existing.id));
  } else {
    ({ error } = await supabase.from('simulado_resultados').insert(payload));
  }
  if (error) throw error;
}

async function omrSaveAll(){
  const btn = byId('omrSaveAll');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    let flaggedTotal = 0;
    omrSheets.forEach(sheet => { for (let q = 1; q <= 50; q++) { const f = sheet.flags[q - 1]; if (f && (f.blank || f.double || f.ambig)) flaggedTotal++; } });
    for (const sheet of omrSheets) await saveOmrSheet(sheet, omrGabarito);
    await loadSimuladoRound(currentSimuladoMeta.id);
    byId('omrReviewStep').classList.add('hidden');
    byId('omrDoneStep').classList.remove('hidden');
    byId('omrSummary').innerHTML =
      `<b>${omrSheets.length}</b> aluno(s) corrigido(s) e salvos no ranking. <b>${flaggedTotal}</b> questõe(s), no total, precisaram de revisão manual.`;
  } catch (err) {
    console.error(err);
    alert('Erro ao salvar correção: ' + (err.message || String(err)));
  } finally {
    btn.disabled = false; btn.textContent = 'Confirmar correção e salvar resultados';
  }
}

/* ---------------- OMR / Gabarito: liga eventos (uma única vez) ---------------- */
function wireGabaritoOmrOnce(){
  byId('sim-gab-toggle').addEventListener('click', async () => {
    const panel = byId('sim-gab-panel');
    const willOpen = panel.classList.contains('hidden');
    byId('sim-import-panel').classList.add('hidden');
    byId('sim-lancar-panel').classList.add('hidden');
    byId('sim-omr-panel').classList.add('hidden');
    panel.classList.toggle('hidden', !willOpen);
    if (willOpen) await openGabaritoPanel();
  });

  byId('sim-omr-toggle').addEventListener('click', async () => {
    const panel = byId('sim-omr-panel');
    const willOpen = panel.classList.contains('hidden');
    byId('sim-import-panel').classList.add('hidden');
    byId('sim-lancar-panel').classList.add('hidden');
    byId('sim-gab-panel').classList.add('hidden');
    panel.classList.toggle('hidden', !willOpen);
    if (willOpen) {
      if (!omrRosterPopulated) populateOmrRoster();
      await openOmrPanel();
      ensurePdfJsLoaded().catch(err => console.error(err));
    }
  });

  byId('gabSalvar').addEventListener('click', salvarGabarito);
  byId('omrFileInput').addEventListener('change', (e) => handleOmrFiles(e.target.files));
  byId('omrConfirmCorners').addEventListener('click', () => {
    const idx = omrCurrentSheetIdx, sheet = omrSheets[idx];
    const { blanks, doubles, ambigs } = processSheet(idx);
    byId('omrReadSummary').innerHTML =
      `Leitura automática: <b>${50 - blanks - doubles}</b> lidas direto, <b>${blanks}</b> em branco, <b>${doubles}</b> marcação dupla, <b>${ambigs}</b> ambígua(s) — todas essas vão para a revisão manual.`;
    byId('omrConfirmCorners').classList.add('hidden');
    byId('omrStudentPick').classList.remove('hidden');
    byId('omrStudentSearch').value = sheet.studentName || '';
    byId('omrStudentTurma').value = sheet.turma || (turmasList.find(t => t.tipo === 'CEFET') || {}).id || '';
    renderOmrThumbs();
  });
  byId('omrStudentSearch').addEventListener('input', (e) => {
    const cadastro = students.find(s => s.nome === e.target.value.trim());
    if (cadastro && cadastro.turmaId) byId('omrStudentTurma').value = cadastro.turmaId;
  });
  byId('omrConfirmSheet').addEventListener('click', () => {
    const idx = omrCurrentSheetIdx, sheet = omrSheets[idx];
    const nome = byId('omrStudentSearch').value.trim();
    if (!nome) { alert('Digite ou selecione o nome do aluno desta folha.'); return; }
    sheet.studentName = nome;
    sheet.alunoId = matchAlunoIdByName(nome);
    sheet.turma = byId('omrStudentTurma').value;
    if (idx + 1 < omrSheets.length) {
      omrCurrentSheetIdx = idx + 1;
      showCornersStepForSheet(omrCurrentSheetIdx);
    } else {
      byId('omrCornersStep').classList.add('hidden');
      byId('omrReviewStep').classList.remove('hidden');
      buildReviewStep();
    }
  });
  byId('omrSaveAll').addEventListener('click', omrSaveAll);
  byId('omrReset').addEventListener('click', () => {
    resetOmrState();
    byId('omrDoneStep').classList.add('hidden');
    byId('omrUploadStep').classList.remove('hidden');
  });
}
