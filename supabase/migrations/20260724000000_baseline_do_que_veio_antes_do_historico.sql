-- 20260724000000_baseline_do_que_veio_antes_do_historico
--
-- ═══════════════════════════════════════════════════════════════════════════════════
-- O QUE ESTE ARQUIVO É, E POR QUE ELE TEM ESTA DATA (07/09/26)
-- ═══════════════════════════════════════════════════════════════════════════════════
--
-- O histórico de migrations do Supabase começa em 20260814231943 — e essa primeira
-- migration é de RLS: ela dá `alter policy` em tabelas que JÁ EXISTIAM. As 17 tabelas
-- abaixo nasceram antes disso, criadas direto no painel do Supabase entre 24/07 e
-- 14/08/26. Nenhuma delas tinha CREATE TABLE em lugar nenhum: nem no repositório, nem
-- no histórico do banco.
--
-- Consequência prática, que é o motivo deste arquivo existir: **não havia como recriar
-- este banco**. Se o projeto fosse perdido, ou se alguém quisesse um ambiente de teste,
-- o schema teria de ser reconstruído de memória a partir do que o código lê.
--
-- A data 20260724000000 é a da criação do projeto, e serve para este arquivo ordenar
-- ANTES de toda migration registrada — que é a ordem em que os fatos aconteceram.
--
-- COMO ELE FOI FEITO: lido do banco em 07/09/26, via pg_catalog (colunas, tipos,
-- defaults, nullability, chaves e políticas). Não é reconstrução de memória.
--
-- ⚠ ELE REFLETE O SCHEMA DE HOJE, e não o de 24/07. Colunas que migrations posteriores
-- acrescentaram (prometido_fechamentos em dailies; cnpj, socio, data_abertura e
-- hubspot_deal_id em leads_prospeccao; treino_* e validado_* em pdi_compromissos) já
-- aparecem aqui. Isso NÃO quebra o replay: todas aquelas migrations usam
-- `add column if not exists`, então elas viram no-op quando rodam depois deste arquivo.
--
-- ⚠ IDEMPOTENTE DE PROPÓSITO. `create table if not exists` e um `drop policy if exists`
-- antes de cada `create policy` — o Postgres não tem `create policy if not exists`, e
-- sem o drop este arquivo não poderia ser rodado num banco que já tem as políticas.
-- Rodar isto contra a produção de hoje não muda nada.
--
-- ⚠ ESTE ARQUIVO NÃO FOI APLICADO NO BANCO, e não deve ser: ele descreve o que já está
-- lá. Ele existe para o schema ficar no git e para um banco novo poder nascer igual.
-- ═══════════════════════════════════════════════════════════════════════════════════


-- ── AS TABELAS ────────────────────────────────────────────────────────────────────

-- mapa_usuarios é a raiz de TODA a segurança do projeto: cada política de RLS cruza o
-- e-mail do JWT com esta tabela para saber o owner_id e o papel. Sem ela, ninguém lê
-- nada. Por isso ela vem primeiro.
create table if not exists public.mapa_usuarios (
  email text not null,
  owner_id text,
  role text not null,
  nome text not null,
  PRIMARY KEY (email)
);

create table if not exists public.dailies (
  id uuid default gen_random_uuid() not null,
  owner_id text not null,
  data date not null,
  prometido_visitas integer,
  prometido_avancos integer,
  prometido_propostas integer,
  realizado_visitas integer,
  realizado_avancos integer,
  realizado_propostas integer,
  realizado_fechamentos integer,
  nota_campo text,
  compromisso_amanha text,
  criado_por text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  prometido_fechamentos integer,
  UNIQUE (owner_id, data),
  PRIMARY KEY (id)
);

create table if not exists public.planos_diarios (
  id uuid default gen_random_uuid() not null,
  owner_id text not null,
  data date not null,
  criado_por text,
  prioridades jsonb default '[]'::jsonb not null,
  contas_alvo jsonb default '[]'::jsonb not null,
  agenda_resumo jsonb default '[]'::jsonb not null,
  daily_snapshot jsonb,
  bloqueios text,
  observacao text,
  status text default 'rascunho'::text not null,
  versao integer default 1 not null,
  fechado_em timestamp with time zone,
  sincronizado_em timestamp with time zone,
  recebido_expogo_em timestamp with time zone,
  atualizado_em timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  local_atuacao text,
  local_atuacao_lat double precision,
  local_atuacao_lng double precision,
  UNIQUE (owner_id, data),
  PRIMARY KEY (id)
);

create table if not exists public.leads_prospeccao (
  id uuid default gen_random_uuid() not null,
  place_id text,
  fonte text not null,
  nome text not null,
  categoria text,
  endereco text,
  bairro text,
  cidade text not null,
  estado text,
  telefone text,
  telefone_normalizado text,
  nota numeric,
  avaliacoes integer,
  lat double precision,
  lng double precision,
  presencial boolean default true,
  delivery boolean default false,
  horario_funcionamento text,
  responsavel_owner_id text,
  status text default 'pendente'::text not null,
  data_rota date,
  ja_existe_hubspot boolean default false,
  hubspot_company_id text,
  criado_por text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  socio text,
  cnpj text,
  data_abertura timestamp with time zone,
  hubspot_deal_id text,
  PRIMARY KEY (id)
);

create table if not exists public.pdi_compromissos (
  id uuid default gen_random_uuid() not null,
  owner_id text not null,
  versao_analise text not null,
  checked boolean[] default '{}'::boolean[] not null,
  data_um_a_um text,
  atualizado_por text,
  updated_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  treino_feito_em timestamp with time zone,
  treino_foco text,
  validado_em timestamp with time zone[],
  validado_por text[],
  devolvido_em timestamp with time zone[],
  devolvido_motivo text[],
  UNIQUE (owner_id, versao_analise),
  PRIMARY KEY (id)
);

create table if not exists public.pdi_documentos (
  id uuid default gen_random_uuid() not null,
  owner_id text not null,
  titulo text not null,
  caminho_arquivo text not null,
  nome_arquivo text not null,
  autor text not null,
  data date default CURRENT_DATE not null,
  created_at timestamp with time zone default now() not null,
  compromissos jsonb default '[]'::jsonb not null,
  PRIMARY KEY (id)
);

create table if not exists public.um_a_um (
  id uuid default gen_random_uuid() not null,
  owner_id text not null,
  data date default CURRENT_DATE not null,
  autor text not null,
  resumo text,
  compromissos jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  PRIMARY KEY (id)
);

create table if not exists public.sugestoes_planos (
  id uuid default gen_random_uuid() not null,
  owner_id text not null,
  texto text not null,
  autor text not null,
  created_at timestamp with time zone default now() not null,
  PRIMARY KEY (id)
);

create table if not exists public.comunicados (
  id uuid default gen_random_uuid() not null,
  tipo text not null,
  titulo text not null,
  mensagem text,
  imagem_url text,
  autor text not null,
  created_at timestamp with time zone default now() not null,
  imagem_caminho text,
  resumo_ia text,
  PRIMARY KEY (id)
);

create table if not exists public.comunicados_lidos (
  comunicado_id uuid not null,
  email_leitor text not null,
  lido_em timestamp with time zone default now() not null,
  PRIMARY KEY (comunicado_id, email_leitor)
);

create table if not exists public.perfis (
  email text not null,
  foto_caminho text,
  updated_at timestamp with time zone default now() not null,
  PRIMARY KEY (email)
);

-- As duas análises que o robô de IA escreve (generate-weekly-summary). Leitura só do
-- gestor — ver as políticas no fim do arquivo.
create table if not exists public.analise_individual_semanal (
  id uuid default gen_random_uuid() not null,
  owner_id text not null,
  semana_label text not null,
  numero_semana_mes integer not null,
  mes_ano text not null,
  gargalo_semana text,
  como_agir text,
  tendencia text,
  created_at timestamp with time zone default now() not null,
  PRIMARY KEY (id)
);

create table if not exists public.analise_individual_mensal (
  id uuid default gen_random_uuid() not null,
  owner_id text not null,
  mes_ano text not null,
  resumo_mes text,
  acoes_recomendadas jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  PRIMARY KEY (id)
);

-- ── OS DOIS CACHES ────────────────────────────────────────────────────────────────
-- Existem para não pagar duas vezes pela mesma consulta externa. Chave = a pergunta.
create table if not exists public.restaurantes_osm (
  chave text not null,
  lat double precision not null,
  lng double precision not null,
  raio_m integer not null,
  itens jsonb default '[]'::jsonb not null,
  buscado_em timestamp with time zone default now() not null,
  PRIMARY KEY (chave)
);

create table if not exists public.novidades_mercado (
  chave text not null,
  itens jsonb default '[]'::jsonb not null,
  buscado_em timestamp with time zone default now() not null,
  PRIMARY KEY (chave)
);

-- ── E UMA SOBRA, registrada como sobra ────────────────────────────────────────────
-- Backup manual dos donos de São Paulo, tirado em 01/09/26 antes de uma
-- redistribuição de carteira. Sem chave primária, sem RLS, sem código lendo. Não
-- apago aqui porque apagar dado de produção não é trabalho de um arquivo de baseline —
-- mas ela está documentada para a decisão poder ser tomada com o fato na mão.
create table if not exists public.backup_donos_sp_20260901 (
  id uuid,
  responsavel_owner_id text,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  tirado_em timestamp with time zone
);


-- ── RLS ───────────────────────────────────────────────────────────────────────────
alter table public.mapa_usuarios enable row level security;
alter table public.dailies enable row level security;
alter table public.planos_diarios enable row level security;
alter table public.leads_prospeccao enable row level security;
alter table public.pdi_compromissos enable row level security;
alter table public.pdi_documentos enable row level security;
alter table public.um_a_um enable row level security;
alter table public.sugestoes_planos enable row level security;
alter table public.comunicados enable row level security;
alter table public.comunicados_lidos enable row level security;
alter table public.perfis enable row level security;
alter table public.analise_individual_semanal enable row level security;
alter table public.analise_individual_mensal enable row level security;


-- ── AS POLÍTICAS QUE JÁ EXISTIAM ──────────────────────────────────────────────────
-- Lidas do banco JÁ NA FORMA OTIMIZADA — a migration 20260816232400 trocou
-- auth.email() por (select auth.email()) para o Postgres avaliar uma vez por consulta
-- em vez de uma por linha. Ela roda depois deste arquivo e dá `alter policy` com o
-- mesmo corpo: no-op. É de propósito que estejam aqui na forma final, porque `alter
-- policy` sobre política que não existe é erro — e sem estas linhas o replay num banco
-- novo quebraria naquela migration.
--
-- As políticas de planos_diarios, pdi_compromissos e leads_prospeccao NÃO estão aqui:
-- elas são criadas por 20260814231943/20260814232234, que já estão no repositório.

drop policy if exists mapa_usuarios_select_authenticated on public.mapa_usuarios;
create policy mapa_usuarios_select_authenticated on public.mapa_usuarios
  for select using (true);

drop policy if exists "leitura dailies" on public.dailies;
create policy "leitura dailies" on public.dailies for select using (
  owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
  or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);
drop policy if exists "escrita dailies" on public.dailies;
create policy "escrita dailies" on public.dailies for insert with check (
  owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
  or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);
drop policy if exists "atualizar dailies" on public.dailies;
create policy "atualizar dailies" on public.dailies for update using (
  owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
  or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);

drop policy if exists "leitura pdi_documentos" on public.pdi_documentos;
create policy "leitura pdi_documentos" on public.pdi_documentos for select using (
  owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
  or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);
drop policy if exists "escrita pdi_documentos" on public.pdi_documentos;
create policy "escrita pdi_documentos" on public.pdi_documentos for insert with check (
  (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);

drop policy if exists "leitura 1a1" on public.um_a_um;
create policy "leitura 1a1" on public.um_a_um for select using (
  owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
  or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);
drop policy if exists "escrita 1a1" on public.um_a_um;
create policy "escrita 1a1" on public.um_a_um for insert with check (
  (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);

drop policy if exists "leitura sugestoes" on public.sugestoes_planos;
create policy "leitura sugestoes" on public.sugestoes_planos for select using (
  owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
  or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);
drop policy if exists "escrita sugestoes" on public.sugestoes_planos;
create policy "escrita sugestoes" on public.sugestoes_planos for insert with check (
  (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);

drop policy if exists "leitura comunicados" on public.comunicados;
create policy "leitura comunicados" on public.comunicados for select using (
  (select auth.role()) = 'authenticated'::text
);
drop policy if exists "escrita comunicados" on public.comunicados;
create policy "escrita comunicados" on public.comunicados for insert with check (
  (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);
drop policy if exists "editar comunicados" on public.comunicados;
create policy "editar comunicados" on public.comunicados for update using (
  (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);
drop policy if exists "excluir comunicados" on public.comunicados;
create policy "excluir comunicados" on public.comunicados for delete using (
  (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);

drop policy if exists "leitura comunicados_lidos" on public.comunicados_lidos;
create policy "leitura comunicados_lidos" on public.comunicados_lidos for select using (
  (select auth.role()) = 'authenticated'::text
);
drop policy if exists "marcar lido" on public.comunicados_lidos;
create policy "marcar lido" on public.comunicados_lidos for insert with check (
  email_leitor = (select auth.email())
);

drop policy if exists "leitura perfis" on public.perfis;
create policy "leitura perfis" on public.perfis for select using (
  (select auth.role()) = 'authenticated'::text
);
drop policy if exists "criar proprio perfil" on public.perfis;
create policy "criar proprio perfil" on public.perfis for insert with check (
  email = (select auth.email())
);
drop policy if exists "atualizar proprio perfil" on public.perfis;
create policy "atualizar proprio perfil" on public.perfis for update using (
  email = (select auth.email())
);

-- As análises da IA são leitura de GESTOR, e só. Elas contêm o gargalo e a "tendência"
-- de cada executivo, escritos por um robô — o executivo lê a versão dele na própria
-- tela, filtrada pela rota; a linha crua do colega não é dele.
drop policy if exists "leitura analise semanal - so gestor" on public.analise_individual_semanal;
create policy "leitura analise semanal - so gestor" on public.analise_individual_semanal for select using (
  (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);
drop policy if exists "leitura analise mensal - so gestor" on public.analise_individual_mensal;
create policy "leitura analise mensal - so gestor" on public.analise_individual_mensal for select using (
  (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'::text
);
