import json, re, unicodedata, openpyxl

XLSX = '/root/.claude/uploads/8cd1b70a-a724-5839-8a69-aadc345fb9af/17ffec39-Matr_culas_2026_3.xlsx'
SHEETS = {
    'Presença Cefet 1': 'Pré-CEFET 1',
    'Presença Cefet 2': 'Pré-CEFET 2',
    'Presença 8º ano': '8º ano',
    'Presença Enem': 'Pré-ENEM',
}

def norm(s):
    if not s: return ''
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', s.lower().strip())

ALIASES = {
    'camilla santos oliveira': 'camila santos oliveira',
    'heitor bolzano de brito medeiros': 'heytor bolzano de brito medeiros',
    'isabella carvalho espindola': 'isabela carvalho espindola',
    'isadora de carvalho torres': 'isadora carvalho torres',
    'izabeli gomes teza': 'isabeli gomes teza',
    'maria julia rodrigues satil (cancelou matricula)': 'maria julia rodrigues satil',
    'maria julia da silva': 'maria julia da silva - santana de cataguases',
    'murilo henrique': 'murilo henrique degliesporte antonio',
}
SKIP_NAMES = {'cancelados:'}

alunos = json.load(open('/tmp/percurso_dashboard/presenca_import/alunos.json', encoding='utf-8'))
by_norm = {}
turma_id_by_nome = {}
for a in alunos:
    by_norm[norm(a['nome_completo'])] = a
    if a['turma_nome'] and a['turma_id']:
        turma_id_by_nome[a['turma_nome']] = a['turma_id']

wb = openpyxl.load_workbook(XLSX, data_only=True)

# 1) build calendar: turma_nome -> ordered list of iso dates
calendars = {}
for sheet_name, turma_nome in SHEETS.items():
    ws = wb[sheet_name]
    header = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
    dates = []
    for idx, v in enumerate(header):
        if idx == 0: continue
        if v is not None:
            dates.append(v.date().isoformat())
    calendars[turma_nome] = dates

# 2) per-student per-turma attendance sequence (idx aligned to calendar), then RLE
runs = []  # (aluno_id, turma_nome, start_idx, end_idx, presente)
unmatched = set()
for sheet_name, turma_nome in SHEETS.items():
    ws = wb[sheet_name]
    header = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
    date_cols = [(idx, v.date().isoformat()) for idx, v in enumerate(header) if idx != 0 and v is not None]
    cal = calendars[turma_nome]
    date_to_calidx = {d: i for i, d in enumerate(cal)}

    for row in ws.iter_rows(min_row=2):
        name = row[0].value
        if not name or not str(name).strip(): continue
        name = str(name).strip()
        n = norm(name)
        if n in SKIP_NAMES: continue
        n = ALIASES.get(n, n)
        a = by_norm.get(n)
        if not a:
            unmatched.add(name)
            continue
        aluno_id = a['aluno_id']

        # sequence of (calidx, status) only for marked days, in calendar order
        seq = []
        for idx, iso_date in date_cols:
            if idx >= len(row): continue
            v = row[idx].value
            if v is None: continue
            v = str(v).strip().upper()
            if v not in ('P', 'F'): continue
            calidx = date_to_calidx[iso_date]
            seq.append((calidx, v == 'P'))
        seq.sort()

        # RLE over CONSECUTIVE calendar indices with same status
        i = 0
        while i < len(seq):
            start_calidx, status = seq[i]
            end_calidx = start_calidx
            j = i + 1
            while j < len(seq) and seq[j][0] == end_calidx + 1 and seq[j][1] == status:
                end_calidx = seq[j][0]
                j += 1
            runs.append((aluno_id, turma_nome, start_calidx, end_calidx, status))
            i = j

print('total runs (RLE):', len(runs))
print('unmatched:', unmatched)

json.dump({'calendars': calendars, 'runs': runs}, open('/tmp/percurso_dashboard/presenca_import/runs.json', 'w', encoding='utf-8'))
