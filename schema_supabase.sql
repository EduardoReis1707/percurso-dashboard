-- =========================================================
-- Percurso Cataguases — estrutura inicial do banco de dados
-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- turmas ----------
create table turmas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,               -- "Pré-CEFET 1", "8º ano"...
  tipo text not null,                -- CEFET | 8º ano | ENEM
  ano_letivo int not null,
  horario text,                      -- "Segunda a quinta"
  created_at timestamptz default now()
);

-- ---------- responsaveis ----------
create table responsaveis (
  id uuid primary key default gen_random_uuid(),
  nome_completo text not null,
  data_nascimento date,
  profissao text,
  telefone text,
  email text,
  rg text,
  rg_orgao_expedidor text,
  rg_data_expedicao date,
  cpf text unique,
  created_at timestamptz default now()
);

-- ---------- alunos ----------
create table alunos (
  id uuid primary key default gen_random_uuid(),
  nome_completo text not null,
  data_nascimento date,
  local_nascimento text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  telefone text,
  whatsapp text,
  email text,
  rg text,
  rg_orgao_expedidor text,
  rg_data_expedicao date,
  cpf text,
  foto_url text,                                 -- caminho no Storage
  turma_id uuid references turmas(id),
  responsavel_id uuid references responsaveis(id),
  autorizado_sair_sozinho boolean,
  codigo_matricula text unique,
  data_matricula date,
  status text default 'ativo',                   -- ativo | trancado | desistente | formado
  observacoes text,
  created_at timestamptz default now()
);

-- ---------- matricula_financeiro ----------
create table matricula_financeiro (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid references alunos(id) on delete cascade,
  ano_letivo int not null,
  tipo text default 'integral',                  -- integral | bolsa parcial | bolsa 100%
  valor_matricula numeric(10,2),
  forma_pagamento_matricula text,
  data_pagamento_matricula date,
  valor_total_curso numeric(10,2),
  qtd_parcelas int,
  valor_parcela numeric(10,2),
  dia_vencimento int,
  created_at timestamptz default now()
);

-- ---------- mensalidades ----------
create table mensalidades (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid references alunos(id) on delete cascade,
  numero_parcela int,
  valor numeric(10,2),
  data_vencimento date,
  data_pagamento date,
  forma_pagamento text,                          -- pix | cartão | dinheiro
  status text default 'pendente',                -- pago | atrasado | pendente | isento
  created_at timestamptz default now()
);

-- ---------- material_didatico ----------
create table material_didatico (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid references alunos(id) on delete cascade,
  tipo text not null,                            -- apostila | uniforme
  valor numeric(10,2),
  forma_pagamento text,
  pago boolean default false,
  data_pagamento date,
  entregue boolean default false,
  data_entrega date,
  created_at timestamptz default now()
);

-- ---------- presencas ----------
create table presencas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid references alunos(id) on delete cascade,
  turma_id uuid references turmas(id),
  data date not null,
  presente boolean default true,
  created_at timestamptz default now()
);

-- ---------- perfis (ligado ao login do Supabase Auth) ----------
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  papel text default 'secretaria'                -- admin | secretaria
);

-- =========================================================
-- Segurança (Row Level Security)
-- Regra simples: qualquer pessoa logada (você + secretaria)
-- tem acesso completo. Ninguém de fora, sem login, acessa nada.
-- =========================================================

alter table turmas enable row level security;
alter table responsaveis enable row level security;
alter table alunos enable row level security;
alter table matricula_financeiro enable row level security;
alter table mensalidades enable row level security;
alter table material_didatico enable row level security;
alter table presencas enable row level security;
alter table perfis enable row level security;

create policy "logados podem tudo - turmas" on turmas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "logados podem tudo - responsaveis" on responsaveis for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "logados podem tudo - alunos" on alunos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "logados podem tudo - matricula_financeiro" on matricula_financeiro for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "logados podem tudo - mensalidades" on mensalidades for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "logados podem tudo - material_didatico" on material_didatico for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "logados podem tudo - presencas" on presencas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "cada um ve seu proprio perfil" on perfis for select using (auth.uid() = id);

-- =========================================================
-- Turmas de 2026 (linha de partida — edite os nomes se preciso)
-- =========================================================
insert into turmas (nome, tipo, ano_letivo, horario) values
  ('Pré-CEFET 1', 'CEFET', 2026, 'Segunda à quinta'),
  ('Pré-CEFET 2', 'CEFET', 2026, 'Segunda à quinta'),
  ('8º ano', '8º ano', 2026, 'Segunda à quinta'),
  ('Pré-ENEM', 'ENEM', 2026, 'Segunda à sexta');
