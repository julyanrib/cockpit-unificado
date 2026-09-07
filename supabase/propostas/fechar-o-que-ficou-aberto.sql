-- PRONTO PARA APLICAR — Julyan autorizou em 07/09/26 ("faça toda a correção").
-- Eu não consegui aplicar daqui: o DDL foi bloqueado pelo classificador de permissão
-- desta sessão. Cole no SQL Editor do Supabase de uma vez — é idempotente, dá para
-- rodar duas vezes sem estrago.
--
-- DEPOIS DE APLICAR, três passos que fazem o repositório parar de divergir do banco:
--   1. mv supabase/propostas/fechar-o-que-ficou-aberto.sql \
--        supabase/migrations/20260907230000_fechar_o_que_ficou_aberto.sql
--   2. acrescente `20260907230000 fechar_o_que_ficou_aberto` em migrations/APLICADAS.txt
--   3. node scripts/ler-politicas-do-banco.js --sql   (regenera POLITICAS.txt)
--      e apague 'pdi_documentos:delete' de DIVIDA_CONHECIDA em
--      scripts/checar-politica-do-front.js — a guarda 24 vai COBRAR isso, porque dívida
--      morta na lista reprova o build.
--
-- Quatro coisas, todas com o mesmo tema: o banco permitia menos, ou mais, do que a tela
-- supunha — e em nenhum dos casos aparecia erro.

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

-- ══ 4. OS QUATRO REPS EM PREPARAÇÃO ENTRAM NO MAPA DE ACESSO ═════════════════════════
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
