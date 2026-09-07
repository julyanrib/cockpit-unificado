-- 20260816230939_criar_playbook_progresso
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- Progresso do Playbook gamificado, por usuário. XP e nível são DERIVADOS (count de
-- 'missao' × 100), nunca armazenados — evita divergência entre o dado bruto e o
-- cálculo. unique(user_email, guia_slug) garante que concluir 2x não duplica XP
-- (upsert idempotente).
create table if not exists playbook_progresso (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  guia_slug text not null,
  tipo text not null check (tipo in ('missao','leitura')),
  concluido_em timestamptz not null default now(),
  unique (user_email, guia_slug)
);

alter table playbook_progresso enable row level security;

-- Mesmo padrão de RLS do resto do projeto (mapa_usuarios + auth.jwt()->>'email'):
-- cada um só vê/grava o próprio progresso; gestor pode VER (não gravar) o de todos,
-- útil pra reforçar 1:1 com evidência de quais módulos o executivo já estudou.
create policy "playbook_progresso_select_proprio_ou_gestor" on playbook_progresso
  for select using (
    lower(user_email) = lower((select auth.jwt()) ->> 'email')
    or exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager'
    )
  );

create policy "playbook_progresso_insert_proprio" on playbook_progresso
  for insert with check (lower(user_email) = lower((select auth.jwt()) ->> 'email'));

create policy "playbook_progresso_update_proprio" on playbook_progresso
  for update using (lower(user_email) = lower((select auth.jwt()) ->> 'email'))
  with check (lower(user_email) = lower((select auth.jwt()) ->> 'email'));

create index if not exists playbook_progresso_user_idx on playbook_progresso(user_email);
