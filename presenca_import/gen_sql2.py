import json

uniq = json.load(open('/tmp/percurso_dashboard/presenca_import/uniq_alunos.json', encoding='utf-8'))
rows = json.load(open('/tmp/percurso_dashboard/presenca_import/rows.json', encoding='utf-8'))

# map aluno_id -> short int code
code_of = {aluno_id: i+1 for i, (aluno_id, turma_id) in enumerate(uniq)}

# 1) map table SQL
map_values = ',\n'.join(f"({i+1},'{aluno_id}','{turma_id}')" for i, (aluno_id, turma_id) in enumerate(uniq))
map_sql = (
    "create temp table if not exists presenca_map (code int primary key, aluno_id uuid, turma_id uuid);\n"
    "truncate presenca_map;\n"
    "insert into presenca_map (code, aluno_id, turma_id) values\n"
    + map_values + ";\n"
)
open('/tmp/percurso_dashboard/presenca_import/map.sql', 'w', encoding='utf-8').write(map_sql)
print('map.sql bytes:', len(map_sql))

# 2) data batches using short codes
BATCH = 3000
batches = []
for i in range(0, len(rows), BATCH):
    chunk = rows[i:i+BATCH]
    vals = ',\n'.join(
        f"({code_of[aluno_id]},'{data}',{'true' if presente else 'false'})"
        for aluno_id, turma_id, data, presente in chunk
    )
    sql = (
        "insert into public.presencas (aluno_id, turma_id, data, presente)\n"
        "select m.aluno_id, m.turma_id, x.data::date, x.presente\n"
        "from (values\n" + vals + "\n) as x(code, data, presente)\n"
        "join presenca_map m on m.code = x.code\n"
        "on conflict (aluno_id, data) do update set turma_id = excluded.turma_id, presente = excluded.presente, updated_at = now();"
    )
    batches.append(sql)

for i, b in enumerate(batches):
    open(f'/tmp/percurso_dashboard/presenca_import/pbatch_{i:02d}.sql', 'w', encoding='utf-8').write(b)

print('num data batches:', len(batches))
for i, b in enumerate(batches):
    print(i, len(b), 'bytes')
