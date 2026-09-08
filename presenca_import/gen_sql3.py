import json

data = json.load(open('/tmp/percurso_dashboard/presenca_import/runs.json', encoding='utf-8'))
calendars = data['calendars']
runs = data['runs']

uniq = json.load(open('/tmp/percurso_dashboard/presenca_import/uniq_alunos.json', encoding='utf-8'))
code_of = {aluno_id: i+1 for i, (aluno_id, turma_id) in enumerate(uniq)}

alunos = json.load(open('/tmp/percurso_dashboard/presenca_import/alunos.json', encoding='utf-8'))
turma_id_by_nome = {}
for a in alunos:
    if a['turma_nome'] and a['turma_id']:
        turma_id_by_nome[a['turma_nome']] = a['turma_id']

# 1) calendar table SQL
cal_rows = []
for turma_nome, dates in calendars.items():
    turma_id = turma_id_by_nome[turma_nome]
    for idx, d in enumerate(dates):
        cal_rows.append(f"('{turma_id}',{idx},'{d}')")
cal_sql = (
    "create table if not exists public._presenca_calendario_import (turma_id uuid, idx int, data date, primary key(turma_id, idx));\n"
    "truncate public._presenca_calendario_import;\n"
    "insert into public._presenca_calendario_import (turma_id, idx, data) values\n"
    + ',\n'.join(cal_rows) + ";\n"
)
open('/tmp/percurso_dashboard/presenca_import/calendar.sql', 'w', encoding='utf-8').write(cal_sql)
print('calendar.sql bytes:', len(cal_sql), 'rows:', len(cal_rows))

# 2) runs batches (split so each SQL file is small enough to read/retype in one go)
BATCH = 900
n_batches = 0
for i in range(0, len(runs), BATCH):
    chunk = runs[i:i+BATCH]
    vals = ',\n'.join(
        f"({code_of[aluno_id]},{start_idx},{end_idx},{'true' if presente else 'false'})"
        for aluno_id, turma_nome, start_idx, end_idx, presente in chunk
    )
    sql = (
        "insert into public.presencas (aluno_id, turma_id, data, presente)\n"
        "select m.aluno_id, m.turma_id, c.data, r.presente\n"
        "from (values\n" + vals + "\n) as r(code, start_idx, end_idx, presente)\n"
        "join public._presenca_map_import m on m.code = r.code\n"
        "join public._presenca_calendario_import c on c.turma_id = m.turma_id and c.idx between r.start_idx and r.end_idx\n"
        "on conflict (aluno_id, data) do update set turma_id = excluded.turma_id, presente = excluded.presente, updated_at = now();"
    )
    fn = f'/tmp/percurso_dashboard/presenca_import/runs_insert_{n_batches:02d}.sql'
    open(fn, 'w', encoding='utf-8').write(sql)
    print(fn, len(sql), 'bytes', len(chunk), 'rows')
    n_batches += 1
print('total batches:', n_batches)
