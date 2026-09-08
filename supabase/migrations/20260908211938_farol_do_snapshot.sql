-- ══════════════════════════════════════════════════════════════════════════════════════
-- O FAROL DO SNAPSHOT (08/09/26)
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Julyan: "eu quero que a tela atualize toda hora que for possível... pq precisamos
-- esperar alguma janela se ele ja ta todo instantaneo? tudo na tela tem q ser instantaneo
-- pelo supabase".
--
-- MEDIDO ANTES DE ESCREVER ISTO:
--   · o webhook do HubSpot JÁ existe e dispara o robô com cooldown de 5 min — 37 disparos
--     em 08/09. O snapshot não espera 2h: ele se atualiza a cada 10–20 min com o time
--     mexendo;
--   · o que NÃO acontece é a aba reler. A tela chama /api/dados UMA vez, no login. Aba
--     aberta desde as 9h mostra dado das 9h, por mais fresco que o Supabase esteja.
--
-- POR QUE UMA TABELA NOVA, E NÃO REALTIME EM cockpit_snapshot:
--   1. `cockpit_snapshot` tem RLS LIGADA COM ZERO POLÍTICA, de propósito — ela guarda o
--      CRM inteiro (933 kB) e quem a lê é o servidor, com service_role. O Realtime
--      RESPEITA RLS: uma subscription do navegador nela não entregaria nada. Abrir uma
--      política de leitura ali entregaria o funil do time inteiro a qualquer sessão, que é
--      exatamente o que aquela RLS existe para impedir;
--   2. mesmo que entregasse, o payload de 933 kB viajaria por WebSocket a cada rodada.
--
-- Então o que vai para o Realtime é um FAROL: uma linha por chave, com a hora e um
-- contador. Ele não carrega dado de negócio nenhum — é um "mudou, vai buscar". A aba
-- escuta o farol e chama /api/dados, que continua sendo o único caminho para o dado, com
-- service_role no servidor e o corte por papel que já existe.
--
-- A POLÍTICA DE LEITURA É PARA `authenticated`, e não para `anon`: a chave anon viaja
-- dentro do bundle público (é assim que o login funciona), então `anon` é qualquer pessoa
-- na internet. `authenticated` é quem passou pelo login do Supabase.
-- ══════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.snapshot_farol (
  -- a mesma chave de cockpit_snapshot ('hubspot', 'narrativas', 'weekly-raw', ...), para
  -- a aba saber O QUE mudou e decidir se aquilo a afeta.
  chave text primary key,
  -- contador monotônico: `atualizado_em` sozinho basta para o Realtime, mas duas
  -- publicações no mesmo milissegundo dariam o mesmo valor, e a aba compara valores para
  -- decidir se já viu esta versão.
  versao bigint not null default 1,
  atualizado_em timestamptz not null default now(),
  -- quem publicou. Serve para depurar "quem tocou o farol às 21:15" sem abrir log.
  origem text
);

comment on table public.snapshot_farol is
  'Farol de frescor do cockpit_snapshot: uma linha por chave, com hora e versão. NÃO guarda dado de negócio — existe para o navegador saber que precisa chamar /api/dados. Escrito por service_role (robô), lido por authenticated.';

alter table public.snapshot_farol enable row level security;

-- LEITURA PARA QUEM ESTÁ LOGADO. `(select auth.role())` e não `auth.role()`: a forma com
-- select é avaliada uma vez por consulta (InitPlan) em vez de uma vez por linha — o mesmo
-- ajuste que a migration 20260908010953 fez nas outras políticas depois de o advisor do
-- Supabase acusar 4 avisos de performance.
drop policy if exists "farol legivel por quem esta logado" on public.snapshot_farol;
create policy "farol legivel por quem esta logado"
  on public.snapshot_farol
  for select
  to authenticated
  using (true);

-- ESCRITA NÃO TEM POLÍTICA, e é de propósito: só o robô escreve, e ele usa service_role,
-- que passa por cima de RLS. Sem política de insert/update, nenhuma sessão de navegador
-- consegue tocar o farol e forçar todas as abas do time a recarregar 933 kB.

-- ── REALTIME ────────────────────────────────────────────────────────────────────────
-- A publicação `supabase_realtime` existe neste projeto e estava SEM NENHUMA TABELA
-- (conferido antes desta migration). Esta é a primeira.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'snapshot_farol'
  ) then
    alter publication supabase_realtime add table public.snapshot_farol;
  end if;
end $$;

-- A linha do farol de cada chave que já existe no snapshot nasce agora, com a hora da
-- última publicação — assim a primeira aba que abrir já tem uma versão de referência em
-- vez de tratar "farol vazio" como "mudou".
insert into public.snapshot_farol (chave, versao, atualizado_em, origem)
select s.chave, 1, s.atualizado_em, 'migration 20260908211938'
from public.cockpit_snapshot s
on conflict (chave) do nothing;
