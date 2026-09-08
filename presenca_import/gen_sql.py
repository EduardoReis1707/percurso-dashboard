import json

rows = json.load(open('/tmp/percurso_dashboard/presenca_import/rows.json', encoding='utf-8'))

def sql_val(aluno_id, turma_id, data, presente):
    tid = f"'{turma_id}'" if turma_id else 'null'
    return f"('{aluno_id}',{tid},'{data}',{ 'true' if presente else 'false' })"

BATCH = 1000
batches = []
for i in range(0, len(rows), BATCH):
    chunk = rows[i:i+BATCH]
    values = ',\n'.join(sql_val(*r) for r in chunk)
    sql = (
        "insert into public.presencas (aluno_id, turma_id, data, presente) values\n"
        + values +
        "\non conflict (aluno_id, data) do update set turma_id = excluded.turma_id, presente = excluded.presente, updated_at = now();"
    )
    batches.append(sql)

for i, b in enumerate(batches):
    open(f'/tmp/percurso_dashboard/presenca_import/batch_{i:03d}.sql', 'w', encoding='utf-8').write(b)

print('num batches:', len(batches))
