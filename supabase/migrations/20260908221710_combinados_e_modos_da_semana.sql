-- ══════════════════════════════════════════════════════════════════════════════════════
-- OS COMBINADOS DA SEMANA E O MODO DE AGIR COM CADA UM (08/09/26)
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Nasce da aba Semana v3 ("modo ação"). Duas coisas que a prancha pede e que NAO tinham
-- onde morar, medido antes de escrever isto:
--
--   1. O COMBINADO DA SEMANA — um por vez, derivado do gargalo nº 1, com dono, prazo e
--      pagina do playbook; e os combinados da semana PASSADA com status ("5 de 8
--      cumpriram · cobrar Marco e Renata"). Sem isto, o passo "27–30 min: combinados
--      anteriores" da Semanal nao tem o que mostrar, e o ritual volta a ser memoria de
--      quem lembrar.
--
--   2. O MODO DE AGIR de cada executivo (cobrar / destravar junto / ir a campo junto /
--      acompanhar / reconhecer). O sistema SUGERE pelos numeros; o gestor pode discordar.
--      A sugestao e derivada e nao se guarda — ela se recalcula a cada sync. O que se
--      guarda e o OVERRIDE, porque ele e a unica coisa que os numeros nao sabem: o gestor
--      falou com a pessoa e sabe algo que o CRM nao mostra.
--
-- POR QUE TABELAS PROPRIAS, e nao mais tipos em pauta_do_lider (a alternativa que eu
-- considerei): pauta_do_lider e uma LISTA DE ITENS de ritual, com toggle e delete — o
-- estado dela e "esta na pauta ou nao". Combinado tem prazo, tem ciclo de vida de uma
-- semana para a outra e tem cumprimento por pessoa; modo de agir e um valor por
-- (semana, pessoa). Enfiar prazo no campo `detalhe` como texto livre faria a tela nao
-- conseguir ordenar nem cobrar por vencimento, e seria exatamente o atalho que vira
-- divida. Os toggles de PAUTA continuam em pauta_do_lider — uma tabela por natureza de
-- dado, e nao uma tabela por tela.
--
-- A SEMANA E SEMPRE A SEGUNDA (`data_segunda`), o mesmo idioma de planos_semanais. Assim
-- "a semana passada" e uma subtracao de 7 dias, e nao uma conta de fuso.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ── 1. O COMBINADO ──────────────────────────────────────────────────────────────────
create table if not exists public.combinados_semana (
  id uuid primary key default gen_random_uuid(),

  -- a segunda da semana a que o combinado pertence (idioma de planos_semanais)
  data_segunda date not null,

  -- imperativo e curto: "Visita so conta com proximo passo agendado antes de ir embora"
  titulo text not null,

  -- o porque COM NUMEROS, que e o que faz o combinado colar: "ataca as 36 visitas acima
  -- da regua e as perdas por sem retorno"
  justificativa text,

  -- de onde ele saiu: 'etapa' | 'cadencia' | 'boca_do_funil'. Guardado porque a tela
  -- deriva o combinado do gargalo nº 1, e o gargalo muda de semana para semana — sem
  -- isto, em outubro ninguem sabe por que este combinado existiu.
  origem_gargalo text,

  -- quem tem de cumprir. Vazio/nulo = o time todo, que e o caso mais comum: combinado de
  -- habito e do time. Com nomes, e cobranca dirigida.
  alvo_owner_ids text[] not null default '{}',

  -- rotulo do dono como a tela mostra ("time todo", "Andre · Marco"). Guardado porque o
  -- alvo pode ser o time (array vazio) e a frase da tela precisa dizer isso em palavra.
  dono_rotulo text,

  prazo date,

  -- pagina do playbook que ensina o habito, quando houver
  playbook_pagina integer,

  -- 'aberto' | 'cumprido' | 'nao_cumprido'. O toggle "marcar resolvido / reabrir" da tela
  -- mexe aqui. NAO e boolean: "nao cumprido" e uma informacao diferente de "ainda aberto",
  -- e e ela que alimenta "cobre antes de criar novo".
  status text not null default 'aberto',

  -- o combinado entrou na pauta da Semanal (o CTA "fechar este combinado na Semanal")
  na_semanal boolean not null default false,

  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- UM COMBINADO POR TITULO POR SEMANA. A tela grava por clique, e clique duplo (ou dois
  -- gestores) inseriria dois combinados iguais na mesma Semanal. A regra da prancha e
  -- "um por vez, com dono e prazo".
  unique (data_segunda, titulo),

  constraint combinados_status_valido
    check (status in ('aberto', 'cumprido', 'nao_cumprido')),
  constraint combinados_gargalo_valido
    check (origem_gargalo is null or origem_gargalo in ('etapa', 'cadencia', 'boca_do_funil'))
);

comment on table public.combinados_semana is
  'O combinado da semana do gestor (um por vez, derivado do gargalo nº 1): titulo imperativo, justificativa com numeros, dono, prazo e pagina do playbook. Lido pela aba Semana; o status alimenta o passo "combinados anteriores" da Semanal.';

create index if not exists combinados_semana_semana_idx
  on public.combinados_semana (data_segunda desc);

-- ── 2. QUEM CUMPRIU ─────────────────────────────────────────────────────────────────
-- Uma linha por (combinado, pessoa). A tela mostra "5 de 8 cumpriram · cobrar Marco e
-- Renata", e esse "5 de 8" nao sai de um contador: sai daqui, com quem marcou e quando.
--
-- POR QUE NAO UM ARRAY `descumpriram text[]` NO COMBINADO (a opcao mais curta): porque
-- cobranca precisa de rastro. "Quem disse que o Marco nao cumpriu, e quando" e a primeira
-- pergunta que aparece num 1:1 tenso, e array nao guarda isso. Sao 11 pessoas — o custo
-- de uma tabela filha aqui e zero.
create table if not exists public.combinados_cumprimento (
  id uuid primary key default gen_random_uuid(),
  combinado_id uuid not null references public.combinados_semana (id) on delete cascade,
  owner_id text not null,
  cumpriu boolean not null,
  marcado_por text,
  marcado_em timestamptz not null default now(),
  unique (combinado_id, owner_id)
);

comment on table public.combinados_cumprimento is
  'Quem cumpriu cada combinado, uma linha por pessoa, com quem marcou e quando. E daqui que sai o "5 de 8 cumpriram" da aba Semana — cobranca precisa de rastro, nao de contador.';

create index if not exists combinados_cumprimento_combinado_idx
  on public.combinados_cumprimento (combinado_id);

-- ── 3. O MODO DE AGIR, quando o gestor discorda dos numeros ─────────────────────────
-- SO O OVERRIDE MORA AQUI. A sugestao do sistema e derivada (resultado × esforco ×
-- tendencia) e se recalcula a cada sync — guardar as duas faria a tela ter duas verdades
-- e a primeira a divergir seria a que ninguem olha. Linha ausente = vale a sugestao.
create table if not exists public.modos_de_agir (
  id uuid primary key default gen_random_uuid(),
  data_segunda date not null,
  owner_id text not null,

  -- 'cobrar' | 'destravar' | 'campo' | 'acompanhar' | 'reconhecer'
  modo text not null,

  -- o que o sistema tinha sugerido quando o gestor trocou. Guardado para a tela poder
  -- dizer "o sistema sugeria cobrar; voce escolheu destravar junto" — e para, um dia,
  -- alguem medir se a regra dos numeros esta boa ou se ela erra sempre no mesmo lugar.
  modo_sugerido text,

  definido_por text,
  definido_em timestamptz not null default now(),
  unique (data_segunda, owner_id),

  constraint modos_valido
    check (modo in ('cobrar', 'destravar', 'campo', 'acompanhar', 'reconhecer')),
  constraint modos_sugerido_valido
    check (modo_sugerido is null or modo_sugerido in ('cobrar', 'destravar', 'campo', 'acompanhar', 'reconhecer'))
);

comment on table public.modos_de_agir is
  'O modo de agir escolhido PELO GESTOR quando ele discorda da sugestao dos numeros, por semana e por pessoa. Linha ausente = vale a sugestao derivada, que nao se guarda de proposito.';

create index if not exists modos_de_agir_semana_idx
  on public.modos_de_agir (data_segunda desc, owner_id);

-- ══ AS POLITICAS COPIAM pauta_do_lider, QUE JA FUNCIONA ════════════════════════════
-- mapa_usuarios (nao usuarios), lower(email) dos dois lados, e `(select auth.jwt())` em
-- vez de `auth.jwt()` — a forma com select e avaliada uma vez por consulta (InitPlan) em
-- vez de uma por linha, o ajuste que a migration 20260908010953 fez depois de o advisor
-- do Supabase acusar 4 avisos de performance.

alter table public.combinados_semana enable row level security;
alter table public.combinados_cumprimento enable row level security;
alter table public.modos_de_agir enable row level security;

-- ── LEITURA ─────────────────────────────────────────────────────────────────────────
-- COMBINADO: o gestor le tudo; o executivo le o do time todo ou o que o nomeia. E de
-- proposito: combinado que a pessoa cobrada nao consegue ler nao e combinado, e surpresa.
create policy "combinados_select_gestor_ou_alvo" on public.combinados_semana
  for select using (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and (
          mu.role = 'manager'
          or cardinality(combinados_semana.alvo_owner_ids) = 0
          or mu.owner_id = any (combinados_semana.alvo_owner_ids)
        )
    )
  );

-- CUMPRIMENTO: o gestor le tudo; o executivo le SO a propria linha. Quem cumpriu e quem
-- nao e assunto de 1:1, nao de mural — a lista aberta para todos viraria ranking de
-- vergonha, que e o oposto de servir com excelencia.
create policy "cumprimento_select_gestor_ou_proprio" on public.combinados_cumprimento
  for select using (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and (mu.role = 'manager' or mu.owner_id = combinados_cumprimento.owner_id)
    )
  );

-- MODO DE AGIR: SO O GESTOR LE. "cobrar" e "ir a campo junto" sao decisoes de gestao
-- sobre a pessoa; ela ler o rotulo que o chefe pos nela, sem a conversa, machuca sem
-- ensinar nada. O que a pessoa tem de ver e a ACAO (o 1:1 marcado, o campo combinado),
-- e isso vive em pauta_do_lider, que ela le.
create policy "modos_select_gestor" on public.modos_de_agir
  for select using (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and mu.role = 'manager'
    )
  );

-- ── ESCRITA: SO O GESTOR, nas tres ──────────────────────────────────────────────────
-- Executivo que pudesse escrever marcaria a si mesmo como cumpridor, ou trocaria o
-- proprio modo de "cobrar" para "reconhecer".
create policy "combinados_insert_gestor" on public.combinados_semana
  for insert with check (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  );
create policy "combinados_update_gestor" on public.combinados_semana
  for update using (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  ) with check (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  );
-- COM DELETE: o CTA "fechar este combinado na Semanal" e um toggle, e desfazer tem de
-- sumir com a linha. O mesmo motivo anotado em pauta_do_lider: item riscado que fica na
-- lista e ruido no ritual da segunda.
create policy "combinados_delete_gestor" on public.combinados_semana
  for delete using (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  );

create policy "cumprimento_insert_gestor" on public.combinados_cumprimento
  for insert with check (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  );
create policy "cumprimento_update_gestor" on public.combinados_cumprimento
  for update using (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  ) with check (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  );
create policy "cumprimento_delete_gestor" on public.combinados_cumprimento
  for delete using (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  );

create policy "modos_insert_gestor" on public.modos_de_agir
  for insert with check (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  );
create policy "modos_update_gestor" on public.modos_de_agir
  for update using (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  ) with check (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  );
-- DELETE no modo = "volta a valer a sugestao do sistema", que e a forma de desfazer.
create policy "modos_delete_gestor" on public.modos_de_agir
  for delete using (
    exists (select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  );
