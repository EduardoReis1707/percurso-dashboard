import openpyxl, json, re, unicodedata

SRC = '/root/.claude/uploads/8cd1b70a-a724-5839-8a69-aadc345fb9af/7b0debe7-Folha_de_ponto_professores.xlsx'
wb = openpyxl.load_workbook(SRC, data_only=True)

NAME_ALIASES = {
    'miichele': 'Michele',
    'willian': 'William',
    'weslley': 'Wesley',
    'wesley (leis extravagantes) - gcm - 4': 'Wesley',
    'william (legislacao municipal)': 'William',
}

def norm_key(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'\s+', ' ', s).strip().lower()

def clean_prof_name(raw):
    s = raw.strip()
    # remove parenthetical / dash suffixes like "(Legislação Municipal)" or "- GCM - 4"
    s = re.sub(r'\s*\(.*?\)\s*', ' ', s).strip()
    s = re.sub(r'\s*-\s*.*$', '', s).strip()
    key = norm_key(s)
    if key in NAME_ALIASES:
        return NAME_ALIASES[key]
    key2 = norm_key(raw)
    if key2 in NAME_ALIASES:
        return NAME_ALIASES[key2]
    return s if s else raw.strip()

def clean_turma(raw):
    s = str(raw).strip()
    s = re.sub(r'\s+', ' ', s)
    key = norm_key(s)
    mapping = {
        'cefet 1': 'Cefet 1', 'cefet 2': 'Cefet 2',
        '8 ano': '8º ano', '8o ano': '8º ano', 'ano': '8º ano',
        'enem': 'Enem', 'intensivao': 'Intensivão', 'camara': 'Câmara',
    }
    if key in mapping:
        return mapping[key]
    if 'cefet 1' in key: return 'Cefet 1'
    if 'cefet 2' in key: return 'Cefet 2'
    if '8' in key and 'ano' in key: return '8º ano'
    if 'enem' in key: return 'Enem'
    if 'intensiv' in key: return 'Intensivão'
    if 'camara' in key: return 'Câmara'
    return s

import datetime
records = []
for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    headers = []
    for m in ws.merged_cells.ranges:
        if m.max_row == m.min_row and (m.max_col - m.min_col) == 2:
            v = ws.cell(m.min_row, m.min_col).value
            if v and isinstance(v, str) and v.strip():
                headers.append((m.min_row, m.min_col, v))
    headers.sort()
    for hi, (hrow, hcol, praw) in enumerate(headers):
        prof = clean_prof_name(praw)
        r = hrow + 1
        max_r = ws.max_row
        blanks = 0
        count_this_block = 0
        while r <= max_r and count_this_block < 60:
            dcell = ws.cell(r, hcol).value
            if isinstance(dcell, datetime.datetime):
                turma_raw = ws.cell(r, hcol+1).value
                horas = ws.cell(r, hcol+2).value
                if turma_raw is not None and horas is not None:
                    records.append({
                        'mes_sheet': sheet_name,
                        'professor_raw': praw,
                        'professor': prof,
                        'data': dcell.strftime('%Y-%m-%d'),
                        'turma_raw': str(turma_raw),
                        'turma': clean_turma(turma_raw),
                        'horas': float(horas),
                    })
                blanks = 0
                count_this_block += 1
            else:
                blanks += 1
                if blanks >= 2:
                    break
            r += 1

print('total records:', len(records))
profs = sorted(set(r['professor'] for r in records))
print('professores:', profs)
turmas = sorted(set(r['turma'] for r in records))
print('turmas:', turmas)
by_prof_mes = {}
for r in records:
    k = (r['professor'], r['mes_sheet'])
    by_prof_mes[k] = by_prof_mes.get(k, 0) + r['horas']
json.dump(records, open('/tmp/percurso_dashboard/horas_import/records.json','w'), ensure_ascii=False, indent=1)
print('sample check Fabiano Agosto total (expect 48):', by_prof_mes.get(('Fabiano','Agosto')))
print('sample check Jessica Agosto total (expect 47):', [v for k,v in by_prof_mes.items() if k[0].startswith('J') and k[1]=='Agosto'])
