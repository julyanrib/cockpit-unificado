-- 20260908010953_politicas_sem_reavaliar_por_linha
-- SQL exatamente como foi aplicado em 07/09/26 (apply_migration, registrada em
-- supabase_migrations.schema_migrations).
--
-- ERRO MEU, apontado pelo advisor de performance do Supabase algumas horas depois de eu
-- aplicar as políticas do PDI: eu escrevi `(select auth.jwt() ->> 'email')`, com o
-- operador DENTRO do subselect. A forma que o Postgres promove a InitPlan — uma
-- avaliação por consulta, e não por linha — é `(select auth.jwt()) ->> 'email'`: o
-- subselect envolve só a CHAMADA. É a forma que as políticas de playbook_progresso já
-- usavam, e eu não olhei antes de escrever as minhas.
--
-- `fila_pwa` tinha o mesmo padrão, de antes de hoje. Foi junto.
--
-- A REGRA NÃO MUDA em nenhuma delas: mesmo alcance, mesmo papel, mesma comparação
-- insensível a caixa. Muda só quantas vezes o Postgres pergunta quem está logado.
-- Depois de aplicar: zero WARN de performance no advisor (antes eram quatro).

drop policy if exists "pdi_documentos_delete_gestor" on public.pdi_documentos;
create policy "pdi_documentos_delete_gestor"
on public.pdi_documentos for delete
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
      and mu.role = 'manager'
  )
);

drop policy if exists "pdi_documentos_select_proprio_ou_gestor" on public.pdi_documentos;
create policy "pdi_documentos_select_proprio_ou_gestor"
on public.pdi_documentos for select
to authenticated
using (
  owner_id = (select mu.owner_id from public.mapa_usuarios mu
              where lower(mu.email) = lower((select auth.jwt()) ->> 'email'))
  or exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager'
  )
);

drop policy if exists "pdi_documentos_insert_gestor" on public.pdi_documentos;
create policy "pdi_documentos_insert_gestor"
on public.pdi_documentos for insert
to authenticated
with check (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager'
  )
);

drop policy if exists "fila_pwa_select_por_owner" on public.fila_pwa;
create policy "fila_pwa_select_por_owner"
on public.fila_pwa for select
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
      and (mu.role = 'manager' or mu.owner_id = fila_pwa.owner_id)
  )
);

-- ══ E A FUNÇÃO MORTA DO "MAIS USADAS NA RUA" SAI DO BANCO ════════════════════════════
-- `playbook_mais_copiadas` não tinha NENHUM chamador: não existe um `.rpc(` no template
-- inteiro. Ela alimentava o painel "as mais usadas na rua", que saiu com a home v7 — o
-- próprio código diz isso: "O registro em playbook_copias NÃO volta: ele alimentava o
-- painel [...] Escrever numa tabela sem leitor é ruído."
--
-- Ela também era o único WARN de segurança real do projeto: SECURITY DEFINER exposta ao
-- `anon` via /rest/v1/rpc/. NÃO era explorável — tinha guarda interna exigindo e-mail do
-- JWT em mapa_usuarios, e eu medi virando `anon`: zero linhas. Mas função que ignora RLS
-- e não tem chamador não deve existir.
--
-- A TABELA `playbook_copias` FICA, com 1 linha: ela é o registro de que alguém copiou um
-- script um dia, apagar tabela é irreversível, e sem escritor nem leitor ela não cresce.
-- Se o painel voltar, o dado está lá.
drop function if exists public.playbook_mais_copiadas(integer);
