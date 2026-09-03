-- REGISTROS DA RODADA (03/09/26, prancha da Daily §4)
--
-- PRIMEIRO ARQUIVO SQL DESTE REPOSITORIO, e isso e parte do motivo dele existir: o schema
-- do Supabase vivia SO no banco. Uma tabela criada por migracao sem registro no codigo e
-- invisivel para quem le o repo — e este projeto tem seis tabelas nessa situacao. Daqui pra
-- frente, mudanca de schema entra aqui junto do commit que a usa.
--
-- POR QUE A TABELA EXISTE: a §4 da prancha pede que cada linha da rodada tenha UMA acao
-- recomendada com itens que gravam de verdade. Duas das quatro acoes — cobrar plano e
-- reconhecer entrega — nao tinham lugar nenhum para gravar. Sem isso, "cobrar plano" seria
-- um botao que muda de cor, e a rodada seguinte nao poderia dizer "cobrado as 9:05, ainda
-- aberto", que e a parte que muda o comportamento do gestor.
--
-- UMA tabela para as duas, com `tipo`: elas tem exatamente a mesma forma (gestor registra
-- algo sobre um executivo num dia) e duas tabelas iguais seriam duas politicas de RLS para
-- manter em sincronia.
--
-- O QUE A PRANCHA PEDE E NAO ESTA AQUI: push no app e WhatsApp do executivo. Nenhum dos 13
-- usuarios em data/usuarios.json tem telefone (o cadastro tem email, role, ownerId e nome).
-- Nao e escolha de desenho, e buraco de dado. O registro fica; o envio nao existe, e a tela
-- diz isso em vez de mostrar um botao que finge.

create table if not exists public.registros_rodada (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cobranca_plano', 'reconhecimento')),
  owner_id text not null,
  data date not null,
  gestor_email text not null,
  detalhe text,
  criado_em timestamptz not null default now(),
  -- IDEMPOTENTE, como a prancha pede: clicar duas vezes no mesmo dia nao cria dois
  -- registros. O upsert do cliente usa exatamente este onConflict.
  unique (tipo, owner_id, data)
);

create index if not exists registros_rodada_owner_data on public.registros_rodada (owner_id, data);

alter table public.registros_rodada enable row level security;

-- LEITURA: o executivo ve o que e sobre ele; o gestor ve o time. Mesmo predicado das
-- policies de `dailies`, via mapa_usuarios (email -> owner_id + role).
create policy "leitura registros_rodada" on public.registros_rodada
  for select using (
    owner_id = (select owner_id from public.mapa_usuarios where email = (select auth.email()))
    or (select role from public.mapa_usuarios where email = (select auth.email())) = 'manager'
  );

-- ESCRITA: SO gestor. Cobranca e reconhecimento sao atos de gestao; executivo registrando o
-- proprio reconhecimento nao e evidencia de nada. E gestor_email tem que ser o dele, para o
-- registro nao poder ser assinado com o nome de outra pessoa.
create policy "escrita registros_rodada" on public.registros_rodada
  for insert with check (
    (select role from public.mapa_usuarios where email = (select auth.email())) = 'manager'
    and gestor_email = (select auth.email())
  );

create policy "atualizar registros_rodada" on public.registros_rodada
  for update using (
    (select role from public.mapa_usuarios where email = (select auth.email())) = 'manager'
    and gestor_email = (select auth.email())
  );

-- DESFAZER enquanto a rodada esta aberta: so quem registrou apaga.
create policy "apagar registros_rodada" on public.registros_rodada
  for delete using (
    (select role from public.mapa_usuarios where email = (select auth.email())) = 'manager'
    and gestor_email = (select auth.email())
  );

-- CONFERIDO NO BANCO com JWT simulado e rollback, antes de a tela usar:
--   gestor insere        -> passa
--   rep insere           -> bloqueado
--   o dono le sobre ele  -> le
--   outro rep le sobre ele -> nao le
