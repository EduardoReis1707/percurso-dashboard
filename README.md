# Painel Percurso

Painel de gestão do curso preparatório **Percurso** (Cataguases/MG) para as turmas Pré-CEFET, Pré-ENEM e 8º ano.

🔗 **Acesse em produção:** [percursodashboard.vercel.app](https://percursodashboard.vercel.app/)

## Funcionalidades

- **Visão geral** — alunos ativos, desistências, bolsas integrais e pendências por turma
- **Alunos** — cadastro completo (dados pessoais, responsável, turma, situação)
- **Financeiro** — histórico de pagamentos, parcelas e atrasados
- **Apostila & uniforme** — controle de pagamento e entrega de material didático
- **Simulados** — importação de resultados, correção por leitura óptica, desempenho por tópico
- **Bolsão** — classificação, faixas de bolsa e registro de conversas com as famílias
- **Presenças** — frequência por aluno e por turma
- **Nova matrícula** — formulário com os mesmos campos do requerimento em papel
- **Contrato** — geração automática do contrato (8º ano ou 9º ano/Pré-CEFET, detectado pela turma do aluno)
- **Fotos dos alunos** — upload individual ou em lote

## Stack

- HTML/CSS/JS estático (sem framework de build)
- [Supabase](https://supabase.com/) — banco de dados Postgres, autenticação e armazenamento de fotos
- Geração de PDF via `html2canvas` + `jsPDF`
- Deploy contínuo via [Vercel](https://vercel.com/)

## Estrutura

```
index.html              # app principal (SPA)
css/                     # estilos
js/
  core.js                # utilitários e estado compartilhado
  app.js                 # inicialização e navegação
  matricula.js           # cadastro e nova matrícula
  financeiro.js          # pagamentos e mensalidades
  documentos.js          # geração de contrato e requerimento
  simulados-*.js          # importação, correção e dashboard de simulados
  bolsao.js              # painel do bolsão
  fotos-import.js         # upload de fotos
  relatorios.js          # relatórios em PDF
schema_supabase.sql      # schema do banco (tabelas e RLS)
```

## Configuração

O arquivo `js/core.js` referencia o projeto Supabase via `SUPABASE_URL` e chave pública. Para rodar uma cópia própria, crie um projeto no Supabase, rode `schema_supabase.sql` no SQL Editor e ajuste essas credenciais.
