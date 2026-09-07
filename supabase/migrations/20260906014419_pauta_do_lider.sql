-- PAUTA DO LIDER (06/09/26, prancha final da aba Time do gestor)
--
-- A tese da aba Time e "cada clique termina numa pauta": o gestor mede o placar,
-- direciona quem precisa, eleva uma boa pratica e fecha UMA melhoria por semana — e cada
-- uma dessas quatro acoes vira um item de agenda no rodape da propria tela. Sem uma
-- tabela, esses cliques morrem no refresh e a Agenda de lider vira enfeite.
--
-- UMA TABELA E NAO QUATRO, e essa foi a escolha do Julyan entre as opcoes que apresentei.
-- Os quatro itens sao a MESMA coisa em formatos diferentes: alguem (ou o time) tem que
-- fazer alguma coisa, num ritual datado. Espalhar isso por um_a_um + planos_semanais +
-- sugestoes_planos obrigaria a Agenda de lider a ler tres tabelas com tres formatos, e
-- cada aba nova do gestor acrescentaria uma quarta. `tipo` distingue, e o ritual do
-- rodape agrupa.
--
-- O QUE NAO ESTA AQUI, de proposito:
--   · nada de HubSpot. Pauta e conversa nossa, e a regra da casa e que o HubSpot e
--     espelho: nem dado nem configuracao dele se toca por causa de uma tela nossa.
--   · nada de "prioridade" ou "peso". Ninguem pergunta isso; coluna que ninguem le
--     envelhece sozinha.
--   · nenhum texto gerado por IA. Os quatro textos saem de calculo ao vivo (o critico por
--     nome, o contraste do benchmark, o gargalo do funil) — ver a memoria de custo de API.

create table if not exists public.pauta_do_lider (
  id uuid primary key default gen_random_uuid(),

  -- 'cobranca_daily' | 'um_a_um' | 'boa_pratica' | 'combinado'
  -- Texto e nao enum: enum novo exige migration, e a proxima aba do gestor vai querer um
  -- tipo novo. A tela e quem sabe desenhar cada tipo.
  tipo text not null,

  -- de quem e o assunto. NULL = do time todo (o caso do combinado da semana).
  alvo_owner_id text,

  -- O QUE APARECE NA AGENDA. Gravado como texto, e nao remontado na leitura, porque a
  -- pauta e um COMPROMISSO: se o funil mudar amanha, o que foi combinado hoje continua
  -- sendo o que foi combinado hoje. Remontar apagaria a decisao.
  titulo text not null,

  -- os criticos por nome, o habito da boa pratica, o dono e o prazo do combinado
  detalhe text,

  -- o ritual em que o item entra: 'daily' | 'um_a_um' | 'semanal'
  ritual text not null default 'daily',

  -- a chave que evita duplicar quando ele clica duas vezes no mesmo alvo. Ex.:
  -- 'cobranca_daily:91477292:2026-09-06'. E a tela que monta.
  chave text not null,

  feito boolean not null default false,
  criado_por text,
  criado_em timestamptz not null default now(),

  -- Clicar de novo TIRA da pauta (delete), entao nao ha estado intermediario para guardar.
  -- O unique e o que faz o clique ser idempotente.
  unique (chave)
);

create index if not exists pauta_do_lider_ritual_idx
  on public.pauta_do_lider (ritual, criado_em desc);
create index if not exists pauta_do_lider_alvo_idx
  on public.pauta_do_lider (alvo_owner_id, criado_em desc);

alter table public.pauta_do_lider enable row level security;

-- ══ AS POLITICAS COPIAM O PADRAO QUE JA FUNCIONA ═══════════════════════════════════
-- mapa_usuarios (nao usuarios), e lower(email) dos dois lados — o mesmo cuidado anotado
-- em 20260903_planos_semanais.sql, que nasceu de eu ter escrito o que parecia certo em
-- vez do que ja estava em pg_policies.

-- LEITURA: o gestor le tudo. O executivo le o que e DELE ou do time todo — e isso e o
-- ponto: "levar pra Semanal" so vira reconhecimento se a pessoa reconhecida enxergar.
create policy "pauta_select_gestor_ou_alvo" on public.pauta_do_lider
  for select using (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and (
          mu.role = 'manager'
          or pauta_do_lider.alvo_owner_id is null
          or mu.owner_id = pauta_do_lider.alvo_owner_id
        )
    )
  );

-- ESCRITA: SO O GESTOR. Pauta de lider e a agenda dele; executivo que pudesse inserir
-- estaria se auto-elogiando na Semanal ou se tirando da Daily.
create policy "pauta_insert_gestor" on public.pauta_do_lider
  for insert with check (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and mu.role = 'manager'
    )
  );

create policy "pauta_update_gestor" on public.pauta_do_lider
  for update using (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and mu.role = 'manager'
    )
  ) with check (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and mu.role = 'manager'
    )
  );

-- COM DELETE, ao contrario de planos_semanais: aqui desfazer e a regra da tela. Todo
-- botao desta aba e um toggle com desfazer, e "tirar da pauta" tem que sumir da agenda —
-- item riscado que continua na lista e ruido no ritual da manha seguinte.
create policy "pauta_delete_gestor" on public.pauta_do_lider
  for delete using (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and mu.role = 'manager'
    )
  );
