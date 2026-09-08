import openpyxl, json, re

SRC = '/root/.claude/uploads/8cd1b70a-a724-5839-8a69-aadc345fb9af/0eab9096-Hor_rio__TURMAS_2026.xlsx'
wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb['Horário Geral']

def split_materia_prof(cell):
    if cell is None:
        return (None, None)
    s = str(cell).strip()
    if s in ('Monitoria', 'Coordenação'):
        return (s, None)
    m = re.match(r'^(.*?)\s*\(([^)]+)\)\s*$', s)
    if m:
        materia = m.group(1).strip()
        prof = m.group(2).strip()
        # fix known typo
        if prof.lower() == 'miichele':
            prof = 'Michele'
        return (materia, prof)
    return (s, None)

blocks = [
    ('Cefet 1', 2, ['Segunda','Terça','Quarta','Quinta','Sexta']),
    ('Cefet 2', 9, ['Segunda','Terça','Quarta','Quinta','Sexta']),
    ('8º ano', 16, ['Terça','Quinta']),
    ('Enem', 22, ['Segunda','Terça','Quarta','Quinta','Sexta']),
]

rows_out = []
for turma, header_row, dias in blocks:
    day_cols = list(range(2, 2+len(dias)))
    r = header_row + 1
    ordem = 0
    while True:
        periodo_label = ws.cell(r, 1).value
        if periodo_label is None:
            break
        if str(periodo_label).strip() == 'Intervalo':
            r += 1
            continue
        for di, dia in enumerate(dias):
            col = day_cols[di]
            raw = ws.cell(r, col).value
            materia, prof = split_materia_prof(raw)
            rows_out.append({
                'turma': turma, 'dia': dia, 'ordem': ordem,
                'periodo_label': str(periodo_label).strip(),
                'materia': materia, 'professor': prof,
            })
        ordem += 1
        r += 1
        # stop condition: blank row (next turma header gap) after we've done at least 2 periods
        if ws.cell(r,1).value is None and ordem >= 2:
            break

print('total rows:', len(rows_out))
for row in rows_out[:10]:
    print(row)
json.dump(rows_out, open('/tmp/percurso_dashboard/horas_import/horario_rows.json','w'), ensure_ascii=False, indent=1)

profs = sorted(set(r['professor'] for r in rows_out if r['professor']))
print('professores no horario:', profs)
