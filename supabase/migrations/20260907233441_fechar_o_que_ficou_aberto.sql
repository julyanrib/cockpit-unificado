-- 20260907233441_fechar_o_que_ficou_aberto
-- SQL exatamente como foi aplicado em 07/09/26 (apply_migration, registrada em
-- supabase_migrations.schema_migrations).
--
-- Três coisas achadas na varredura, com o mesmo tema: o banco permitia menos, ou mais,
-- do que a tela supunha — e em nenhum dos casos aparecia erro.
--
-- MEDIDO ANTES, com transação e rollback, virando `authenticated` com o JWT de gente
-- real: o gestor VIA a linha de pdi_documentos (1), mandava apagar, e o banco apagava 0.
-- Delete barrado por RLS não é erro no Postgres — devolve sucesso apagando zero linhas.
-- Por isso `if (error)` nunca disparava e a tela reportava que apagou.
--
-- MEDIDO DEPOIS, o mesmo teste esperando o resultado oposto: vê a linha (1) e apaga de
-- verdade (1). E nenhuma tabela do schema public ficou sem RLS.

-- ── 1. o apagar do PDI volta a funcionar ────────────────────────────────────────────
-- Espelha a política de INSERT que a tabela já tinha: quem cria é o gestor, então quem
-- apaga é o gestor. Não é permissão nova, é a que faltava para o botão existir de fato.
drop policy if exists "pdi_documentos_delete_gestor" on public.pdi_documentos;
create policy "pdi_documentos_delete_gestor"
on public.pdi_documentos for delete
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and mu.role = 'manager'
  )
);

-- ── 2. as duas políticas de 14/08 deixam de ser sensíveis a caixa ───────────────────
-- Elas comparavam `mapa_usuarios.email = auth.email()` sem lower(). E-mail cadastrado
-- com maiúscula já deixou gente sem acesso ao próprio dado neste banco — foi por isso
-- que as políticas novas passaram a usar lower() dos dois lados. Estas ficaram atrás.
-- Mesma regra de sempre, só insensível a caixa.
drop policy if exists "leitura pdi_documentos" on public.pdi_documentos;
create policy "pdi_documentos_select_proprio_ou_gestor"
on public.pdi_documentos for select
to authenticated
using (
  owner_id = (select mu.owner_id from public.mapa_usuarios mu
              where lower(mu.email) = lower((select auth.jwt() ->> 'email')))
  or exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email')) and mu.role = 'manager'
  )
);

drop policy if exists "escrita pdi_documentos" on public.pdi_documentos;
create policy "pdi_documentos_insert_gestor"
on public.pdi_documentos for insert
to authenticated
with check (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email')) and mu.role = 'manager'
  )
);

-- ── 3. duas tabelas saem de baixo do nariz do anon ──────────────────────────────────
-- Estavam com RLS DESLIGADA e com grant de SELECT/INSERT/UPDATE/DELETE para `anon` — e a
-- chave anon viaja dentro do bundle público, à vista de quem abrir o código-fonte.
--
-- Nenhuma das duas é lida pelo front: `webhook_cooldown` só por api/hubspot-webhook.js
-- (e com UPDATE aberto ao anon dava para silenciar o disparo de fora), e
-- `backup_donos_sp_20260901` por ninguém. Então RLS ligada SEM política nenhuma é
-- exatamente a proteção certa — service_role continua passando, como em cockpit_snapshot.
--
-- O BACKUP NÃO FOI APAGADO, e isso mudou de rumo no meio. Eu ia propor `drop table`
-- ("é backup de 01/09, ninguém lê"), mas medi antes: dos 400 leads, 133 MUDARAM DE DONO
-- desde então. A tabela é o único registro de quem tinha aqueles 133 antes da
-- redistribuição. Ela faz sentido; o que não fazia sentido era estar aberta.
alter table public.webhook_cooldown enable row level security;
alter table public.backup_donos_sp_20260901 enable row level security;

-- ── o que NÃO está aqui, e onde está ────────────────────────────────────────────────
-- No mesmo dia entraram três mudanças de DADO que não são migration e não ficaram
-- registradas em schema_migrations (foram por execute_sql e pelo SQL Editor):
--   os 4 reps em preparação entrando em mapa_usuarios,
--   os 3 que saíram do time perdendo a linha,
--   e o login desses 3 sendo revogado.
-- Estão registradas, idempotentes, em supabase/fora-de-migration.sql.
