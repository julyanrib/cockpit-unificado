-- O QUE FICOU ABERTO NA VARREDURA DE 07/09/26 — estado de cada parte.
--
-- JÁ APLICADO (nada a fazer nos itens 4, 5 e 6):
--   4. os 4 reps em preparação entraram no mapa — o Julyan rodou no SQL Editor.
--      MEDIDO DEPOIS, virando cada um deles com rollback: os quatro gravam a própria
--      daily. O login dos quatro está liberado de verdade, não só a linha inserida.
--   5. os três que saíram do time perderam a linha em mapa_usuarios
--   6. o login dos três foi revogado e as sessões vivas encerradas
--
-- Os itens 5 e 6 foram por execute_sql e o 4 pelo SQL Editor — nenhum dos três ficou
-- registrado em supabase_migrations.schema_migrations. É por isso que continuam aqui: o
-- repositório tem que descrever o banco, e não o que eu queria que ele fosse.
--
-- PENDENTE — o classificador de permissão desta sessão bloqueou este DDL:
--   1 e 2. as políticas do PDI (o botão de apagar volta a funcionar, e as duas de
--          14/08 deixam de ser sensíveis a caixa).
--   3. os dois enable row level security — as duas tabelas continuam abertas ao anon
--      neste momento, e a chave anon viaja no bundle público.
--   7. duas contas de autenticação que sobraram, para você decidir.
--
-- O ARQUIVO INTEIRO É IDEMPOTENTE: rodar tudo de uma vez é seguro, e as partes já
-- aplicadas viram no-op.
--
-- DEPOIS DE APLICAR, três passos que fazem o repositório parar de divergir do banco:
--   1. mova este arquivo para
--        supabase/migrations/20260907230000_fechar_o_que_ficou_aberto.sql
--   2. acrescente a linha "20260907230000 fechar_o_que_ficou_aberto" em
--        supabase/migrations/APLICADAS.txt
--   3. regenere os dois espelhos e esvazie as duas listas de dívida:
--        node scripts/ler-politicas-do-banco.js --sql
--          (e apague pdi_documentos:delete de DIVIDA_CONHECIDA em
--           scripts/checar-politica-do-front.js)
--        node scripts/ler-time-do-banco.js
--          (e esvazie SEM_ACESSO_AINDA em scripts/checar-time-nas-duas-fontes.js)
--
--      As guardas 24 e 25 COBRAM o passo 3: dívida morta na lista reprova o build, de
--      propósito. Dívida que fica na lista para sempre deixa de ser vista.
--
-- ══ 1. O APAGAR DO PDI VOLTA A FUNCIONAR ═════════════════════════════════════════════
-- Medido com transação e rollback: o gestor VÊ a linha (1), manda apagar, o banco apaga
-- 0. Delete barrado por RLS não é erro no Postgres — devolve sucesso apagando zero. O
-- código já parou de mentir (`.select()` conta as linhas); esta política é o que faz o
-- botão voltar a FUNCIONAR. Espelha a de INSERT que já existe: quem cria é o gestor,
-- então quem apaga é o gestor.
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

-- ══ 2. AS POLÍTICAS DE pdi_documentos DEIXAM DE SER SENSÍVEIS A CAIXA ════════════════
-- As duas de 14/08 comparam `mapa_usuarios.email = auth.email()` sem lower(). E-mail
-- cadastrado com maiúscula já deixou gente sem acesso ao próprio dado neste banco — foi
-- por isso que as políticas novas passaram a usar lower() dos dois lados. Estas ficaram
-- atrás. Mesma regra de sempre, só insensível a caixa.
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

-- ══ 3. DUAS TABELAS SAEM DE BAIXO DO NARIZ DO anon ═══════════════════════════════════
-- Estavam com RLS DESLIGADA e com grant de SELECT/INSERT/UPDATE/DELETE para `anon` — e a
-- chave anon viaja dentro do bundle público, à vista de quem abrir o código-fonte.
--
-- Nenhuma das duas é lida pelo front: `webhook_cooldown` só por api/hubspot-webhook.js,
-- e `backup_donos_sp_20260901` por ninguém. Então RLS ligada SEM política nenhuma é
-- exatamente a proteção certa — service_role continua passando, como em cockpit_snapshot.
--
-- O BACKUP NÃO É APAGADO, e isso mudou de rumo no meio. Eu ia propor `drop table`, mas
-- medi antes: dos 400 leads, **133 MUDARAM DE DONO** desde 01/09. Esta tabela é o único
-- registro de quem tinha aqueles 133 antes da redistribuição. Ela faz sentido; o que não
-- fazia sentido era estar aberta. Se você quiser apagá-la de verdade depois de olhar os
-- 133, é um `drop table` de uma linha — mas aí é decisão sua, com o dado na frente.
alter table public.webhook_cooldown enable row level security;
alter table public.backup_donos_sp_20260901 enable row level security;

-- ══ 4. OS QUATRO REPS EM PREPARAÇÃO — JÁ APLICADO EM 07/09/26 ═══════════════════
-- data/usuarios.json lista 5 reps com aComecar:true, mas só ricardoantunes está em
-- mapa_usuarios. Os outros quatro não existem para a RLS: toda política cruza o e-mail
-- do JWT com esta tabela, então eles não alcançam nem o próprio dado.
--
-- E não é teórico — scaetano já tem 2 páginas de Playbook lidas (aquela tabela usa o
-- e-mail do JWT direto, sem passar por aqui), mas não conseguiria salvar uma daily.
--
-- owner_id 'pendente_*' é a convenção que já existe para quem ainda não tem owner do
-- HubSpot, e é o mesmo padrão do ricardoantunes, que funciona. Os nomes vêm de
-- data/usuarios.json; corrija se algum estiver diferente do cadastro.
insert into public.mapa_usuarios (email, role, owner_id, nome)
select v.email, 'rep', v.owner_id, v.nome
from (values
  ('scaetano.takeat@gmail.com',     'pendente_scaetano',     'S. Caetano'),
  ('renatapessoa.takeat@gmail.com', 'pendente_renatapessoa', 'Renata Pessoa'),
  ('andregomes.takeat@gmail.com',   'pendente_andregomes',   'André Gomes'),
  ('luizpimentel.takeat@gmail.com', 'pendente_luizpimentel', 'Luiz Pimentel')
) as v(email, owner_id, nome)
where not exists (
  select 1 from public.mapa_usuarios m where lower(m.email) = lower(v.email)
);

-- ══ O QUE EU NÃO ESCREVI AQUI, DE PROPÓSITO ══════════════════════════════════════════
--
-- TRÊS REPS PARADOS, com acesso vivo em mapa_usuarios e ausentes de data/usuarios.json:
--   michel.takeat@gmail.com        última daily 20/08,  0 leads
--   gleyson.takeat@gmail.com       última daily 03/08,  0 leads
--   ricardofiaes.takeat@gmail.com  última daily 03/08,  0 leads
-- Tirar acesso de gente é decisão de quem sabe se saíram do time ou estão afastados —
-- não é uma medição que eu faça. Se saíram, é um delete de três linhas nesta tabela.
--
-- O SINALIZADOR DO RICARDOANTUNES: `aComecar:true` em data/usuarios.json, mas ele roda
-- daily todo dia (24 delas, a última hoje). Ao mesmo tempo tem owner_id pendente e 0
-- leads. A evidência é ambígua — ou o sinalizador está velho, ou `aComecar` quer dizer
-- "sem carteira ainda" e está certo. Não mexi porque isso muda o número da tela de
-- login: hoje ela publica "6 executivos na rua", e sem o sinalizador publicaria 7.

-- ══ 5. OS TRÊS QUE SAÍRAM DO TIME — JÁ APLICADO EM 07/09/26 ═════════════════════════
-- Julyan confirmou em 07/09/26: michel, gleyson e ricardofiaes saíram.
--
-- JÁ APLICADO por execute_sql nesta sessão — está aqui porque o delete NÃO ficou
-- registrado em supabase_migrations.schema_migrations, e o repositório precisa descrever
-- o banco. Ao rodar este arquivo inteiro, este bloco é um no-op (as linhas já não estão
-- lá) e a migration passa a registrar a mudança completa de 07/09.
--
-- TIRA O ACESSO, NÃO O HISTÓRICO: dailies, análises e PDIs continuam gravados por
-- owner_id, e o gestor continua alcançando tudo pela cláusula de manager — o número do
-- mês passado do time não muda. Conferido depois de aplicar: 28 dailies, 28 análises
-- semanais e 3 PDIs preservados, zero perfil órfão.
--
-- Conferido ANTES de aplicar, e cada um desses podia ter estragado a operação:
--   `perfis.email` é a única FK que aponta para mapa_usuarios, e é NO ACTION — perfil
--   existente faria o delete FALHAR. Nenhum dos três tinha perfil.
--   Nenhum tinha lead no nome (0 em leads_prospeccao), então não sobrou território sem dono.
--   No snapshot do HubSpot de hoje eles só aparecem em `motivosPerda` (negócio já
--   perdido) — zero negócio aberto para reatribuir. E não mexemos no HubSpot de todo jeito.
delete from public.mapa_usuarios
where lower(email) in (
  'michel.takeat@gmail.com',
  'gleyson.takeat@gmail.com',
  'ricardofiaes.takeat@gmail.com'
);

-- ══ 6. O LOGIN DOS TRÊS FOI REVOGADO — JÁ APLICADO EM 07/09/26 ═══════════════════════
-- Tirar de mapa_usuarios fecha o acesso ao DADO (toda política devolve vazio), e
-- api/dados.js já devolvia 403 para eles porque não estão em data/usuarios.json. Mas
-- conta de autenticação viva ainda emite JWT válido — e michel tinha entrado em 13/08.
-- Um deles ainda tinha SESSÃO ABERTA no momento da limpeza.
--
-- BLOQUEIO em vez de delete de auth.users, de propósito: é reversível e preserva o
-- registro de quem foi (created_at, last_sign_in_at). Apagar a conta é irreversível e
-- mexe no schema interno do Supabase. Bloqueado já não entra, que era o objetivo — se
-- você quiser apagar de vez depois, é uma linha.
--
-- As sessões vivas morrem junto: sem isso um refresh token existente continuaria
-- renovando por dias, e o bloqueio só valeria no próximo login.
with alvo as (
  select id from auth.users where lower(email) in (
    'michel.takeat@gmail.com','gleyson.takeat@gmail.com','ricardofiaes.takeat@gmail.com')
)
, mortas as (delete from auth.sessions where user_id in (select id from alvo) returning 1)
update auth.users set banned_until = 'infinity' where id in (select id from alvo);

-- ══ 7. DUAS CONTAS QUE SOBRARAM, PARA VOCÊ DECIDIR ═══════════════════════════════════
-- Achadas na mesma varredura, com conta de autenticação viva e ausentes das duas fontes
-- do time (data/usuarios.json e mapa_usuarios). Nenhuma alcança dado: api/dados.js
-- devolve 403 e toda tabela devolve vazio. Mas continuam podendo autenticar.
--
--   test-recon@proton.me      conta de teste, nunca fez parte do time
--   julyan@takeat.com.br      seu segundo e-mail; o cadastrado é julyan.takeat@gmail.com
--
-- Não bloqueei nenhuma das duas: a primeira porque não é uma das três que você nomeou, e
-- a segunda porque é sua e bloquear pode ser exatamente o contrário do que você quer.
-- Se for para limpar a de teste:
--   update auth.users set banned_until = 'infinity' where lower(email) = 'test-recon@proton.me';
