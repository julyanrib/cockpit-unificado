-- 20260831170425_criar_fila_pwa
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- FILA PENDENTE DO PWA (31/08/26)
-- O Cockpit não distinguia "o app não subiu" de "não aconteceu": quando a Daily mostrava
-- "0 visitas", podia ser que a pessoa não saiu, ou que trabalhou o dia todo sem sinal.
-- Cobrar em cima disso é chute. Esta tabela é onde o PWA declara o que está na fila local
-- e ainda não subiu, por executivo e por dia.
--
-- Escrita: SÓ pelo servidor (POST /api/fila-pwa, com a service key, que ignora RLS).
-- Nenhuma política de INSERT/UPDATE para cliente, de propósito — o app passa pela rota
-- autenticada, não escreve direto.
-- Leitura: o próprio dono ou o gestor, no mesmo padrão de planos_diarios.
create table if not exists public.fila_pwa (
  owner_id text not null,
  dia date not null,
  pendentes integer not null default 0,
  falhas integer not null default 0,
  ultima_tentativa timestamptz,
  versao_app text,
  detalhe jsonb,
  origem text not null default 'pwa',
  atualizado_em timestamptz not null default now(),
  primary key (owner_id, dia)
);

comment on table public.fila_pwa is
  'O que o app de campo tem na fila local e ainda nao subiu, por executivo e por dia. Ausencia de linha significa "nao sabemos", nunca zero.';
comment on column public.fila_pwa.pendentes is 'eventos na fila local sem subir';
comment on column public.fila_pwa.falhas is 'eventos que desistiram depois das tentativas';
comment on column public.fila_pwa.ultima_tentativa is 'quando o app tentou subir por ultimo';

alter table public.fila_pwa enable row level security;

create policy "fila_pwa_select_por_owner" on public.fila_pwa
  for select to authenticated
  using (exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = fila_pwa.owner_id)
  ));
