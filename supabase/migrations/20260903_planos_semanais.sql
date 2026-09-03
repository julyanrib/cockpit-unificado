-- PLANO SEMANAL DO EXECUTIVO (03/09/26, prancha 6a do Planejamento)
--
-- A prancha 6a substitui a aba Planejamento por inteiro: o executivo escolhe a REGIAO DE
-- ATAQUE de cada dia e preenche 5 dias x 7 horarios (09:00 → 19:00). O que ele fecha aqui
-- e o que o gestor alinha na Semanal de segunda 8h30.
--
-- POR QUE UMA TABELA E NAO CINCO LINHAS DE planos_diarios:
-- planos_diarios responde "o que voce faz HOJE" — uma linha por owner por dia, com as
-- prioridades e as contas-alvo daquele dia. Ela e lida pela Daily do gestor como cliente
-- nomeado, e continua sendo. O plano SEMANAL responde outra pergunta: "a sua semana esta
-- preenchida?". Sao 35 slots, regioes por dia, bloqueios de horario e um estado de
-- fechamento — e nada disso cabe numa linha de dia sem inventar colunas que so servem para
-- a semana.
--
-- E as duas se somam: agendar um slot cria o compromisso no HubSpot, e quando aquele dia
-- chega, o compromisso aparece na agenda que a Daily le. O plano semanal abastece; o plano
-- do dia nomeia.
--
-- UMA LINHA POR OWNER POR SEMANA. A semana e identificada pela SEGUNDA (data_segunda), e
-- nao por numero ISO: numero de semana muda de significado na virada do ano e obriga quem
-- le a converter. A segunda e uma data, e data se compara.
--
-- O ESTADO VIVE EM JSONB, e isso e deliberado. A grade e 5x7 de referencias a lead, as
-- regioes sao 5 strings e os bloqueios sao posicoes — modelar isso em tabela relacional
-- daria tres tabelas filhas e uma transacao a cada clique de slot. A tela grava a grade
-- inteira a cada acao (sao 35 posicoes, nao 35 mil), e o custo de reescrever o jsonb e
-- menor que o de manter a integridade de tres tabelas para um dado que so tem um leitor.
--
-- O QUE NAO ESTA AQUI: as sugestoes aplicadas por "montar sugestao pros N livres". Elas
-- entram na propria grade — uma sugestao aceita e um agendamento como qualquer outro. Nao
-- guardo "foi sugerido" separado porque ninguem pergunta isso, e coluna que ninguem le
-- envelhece sozinha.

create table if not exists public.planos_semanais (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  data_segunda date not null,

  -- as 5 regioes de ataque, uma por dia util: ["Centro","Praia do Canto",...]
  regioes jsonb not null default '[]'::jsonb,

  -- a grade 5x7. Cada posicao e o id do lead agendado, a string '__b' para horario
  -- bloqueado (compromisso fora da rua), ou null para livre.
  grade jsonb not null default '[]'::jsonb,

  -- fechado_em marca o momento em que ele fecha a semana. NULL = ainda aberta.
  -- Reabrir volta para NULL, e o historico de quem fechou fica em atualizado_em/por.
  fechado_em timestamptz,
  fechado_por text,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- Uma linha por owner por semana. O upsert da tela depende deste unique.
  unique (owner_id, data_segunda)
);

create index if not exists planos_semanais_owner_idx
  on public.planos_semanais (owner_id, data_segunda desc);

alter table public.planos_semanais enable row level security;

-- ══ AS POLITICAS COPIAM O PADRAO QUE JA FUNCIONA, E NAO O QUE EU IMAGINEI ═══════════
-- Minha primeira versao usava `public.usuarios` e `auth.email()`. Nao existe tabela
-- `usuarios` neste projeto — conferido em information_schema antes de aplicar. O padrao
-- real, lido de pg_policies em planos_diarios e leads_prospeccao, e:
--
--   mapa_usuarios  (nao usuarios)
--   lower(mu.email) = lower(auth.jwt() ->> 'email')   (nao auth.email(), e case-insensitive)
--
-- Copiar o que funciona vale mais que escrever o que parece certo: politica que referencia
-- tabela inexistente falha na aplicacao, e politica com comparacao case-sensitive falha
-- DEPOIS, em producao, para o usuario que digitou o email com maiuscula.

-- LEITURA: o proprio executivo ve a sua semana; o gestor ve a de todos, porque a Semanal
-- de segunda e exatamente ele lendo as cinco semanas juntas.
create policy "planos_semanais_select_por_owner" on public.planos_semanais
  for select using (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and (mu.role = 'manager' or mu.owner_id = planos_semanais.owner_id)
    )
  );

-- ESCRITA: SO O DONO DA SEMANA, e aqui esta tabela DIVERGE de planos_diarios de proposito.
-- Em planos_diarios o gestor tambem escreve (a politica dele tem `role = 'manager' or`).
-- Aqui nao: a semana e o compromisso do executivo. Se o gestor pudesse preencher, a
-- Semanal de segunda deixaria de ser conversa e viraria digitacao — ele alinharia com um
-- plano que ele mesmo escreveu, o que nao alinha nada.
create policy "planos_semanais_insert_dono" on public.planos_semanais
  for insert with check (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and mu.owner_id = planos_semanais.owner_id
    )
  );

create policy "planos_semanais_update_dono" on public.planos_semanais
  for update using (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and mu.owner_id = planos_semanais.owner_id
    )
  ) with check (
    exists (
      select 1 from mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt()) ->> 'email')
        and mu.owner_id = planos_semanais.owner_id
    )
  );

-- Sem policy de DELETE, de proposito: semana nao se apaga. Reabrir e um update em
-- fechado_em, e a semana passada fica como registro do que foi combinado.
