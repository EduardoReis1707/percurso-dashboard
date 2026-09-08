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

rows = []
unmatched = set()
for sheet_name, turma_nome in SHEETS.items():
    ws = wb[sheet_name]
    header = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
    date_cols = []
    for idx, v in enumerate(header):
        if idx == 0: continue
        if v is not None:
            date_cols.append((idx, v.date().isoformat()))
    for row in ws.iter_rows(min_row=2):
        name = row[0].value
        if not name or not str(name).strip(): continue
        name = str(name).strip()
        n = norm(name)
        if n in SKIP_NAMES:
            continue
        n = ALIASES.get(n, n)
        a = by_norm.get(n)
        aluno_id = a['aluno_id'] if a else None
        if not a:
            unmatched.add(name)
        if not aluno_id:
            continue  # sem cadastro correspondente -> não há como vincular a presença
        turma_id = turma_id_by_nome.get(turma_nome)
        for idx, iso_date in date_cols:
            if idx >= len(row): continue
            v = row[idx].value
            if v is None: continue
            v = str(v).strip().upper()
            if v not in ('P', 'F'): continue
            rows.append((aluno_id, turma_id, iso_date, v == 'P'))

print('total rows:', len(rows))
print('unmatched names (skipped):', len(unmatched))
for n in sorted(unmatched):
    print(' -', n)

# dedup by (aluno_id, data) keeping last occurrence, since unique constraint is (aluno_id, data)
dedup = {}
for aluno_id, turma_id, data, presente in rows:
    dedup[(aluno_id, data)] = (aluno_id, turma_id, data, presente)
rows = list(dedup.values())
print('rows after dedup by (aluno_id,data):', len(rows))

json.dump(rows, open('/tmp/percurso_dashboard/presenca_import/rows.json', 'w', encoding='utf-8'))
