-- MUDANÇAS DE DADO QUE ENTRARAM FORA DE MIGRATION — 07/09/26.
--
-- POR QUE ESTE ARQUIVO EXISTE, e por que não está em migrations/: as três mudanças
-- abaixo mexem em DADO, não em schema, e entraram por execute_sql e pelo SQL Editor.
-- Nenhuma ficou registrada em supabase_migrations.schema_migrations. Botá-las em
-- migrations/ faria a guarda 23 reprovar com razão — ela compara APLICADAS.txt (que é
-- lido do banco) com os arquivos do diretório, e ali só entra o que o banco registrou.
--
-- Mas elas precisam estar no repositório de alguma forma: o repositório tem que
-- descrever o banco, e não o que eu queria que ele fosse.
--
-- TUDO AQUI É IDEMPOTENTE: rodar de novo não duplica nem estraga nada.

-- ══ 1. OS QUATRO REPS EM PREPARAÇÃO ENTRARAM NO MAPA DE ACESSO ═══════════════════════
-- data/usuarios.json listava 5 reps com aComecar:true, mas só ricardoantunes estava em
-- mapa_usuarios. Os outros quatro não existiam para a RLS: toda política cruza o e-mail
-- do JWT com essa tabela, então eles não alcançavam nem o próprio dado.
--
-- E não era teórico. Os quatro estavam com SESSÃO VIVA no momento da varredura
-- (andregomes 3, luizpimentel 2, scaetano 2, renatapessoa 1), usando um app que devolvia
-- vazio em tudo e mostrava "não tem dado" em toda tela. scaetano já tinha 2 páginas de
-- Playbook lidas — aquela tabela usa o e-mail do JWT direto, sem passar por aqui — mas
-- não conseguiria salvar uma daily.
--
-- owner_id 'pendente_*' é a convenção que já existia para quem não tem owner do HubSpot
-- ainda, e é o mesmo padrão do ricardoantunes, que funciona.
--
-- MEDIDO DEPOIS, virando cada um deles com rollback: os QUATRO gravam a própria daily.
-- Linha inserida não é acesso funcionando, e essa é a diferença que o teste mede.
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

-- ══ 2. OS TRÊS QUE SAÍRAM DO TIME PERDERAM O ACESSO AO DADO ══════════════════════════
-- Julyan confirmou em 07/09/26 que michel, gleyson e ricardofiaes saíram. Eles estavam
-- em mapa_usuarios e ausentes de data/usuarios.json — acesso vivo para quem a tela não
-- considerava do time.
--
-- TIRA O ACESSO, NÃO O HISTÓRICO: dailies, análises e PDIs continuam gravados por
-- owner_id, e o gestor continua alcançando tudo pela cláusula de manager — o número do
-- mês passado do time não muda. Conferido depois: 28 dailies, 28 análises semanais e 3
-- PDIs preservados, zero perfil órfão.
--
-- Conferido ANTES, e cada um desses podia ter estragado a operação:
--   `perfis.email` é a única FK que aponta para mapa_usuarios, e é NO ACTION — perfil
--     existente faria este delete FALHAR. Nenhum dos três tinha perfil.
--   Nenhum tinha lead no nome (0 em leads_prospeccao): não sobrou território sem dono.
--   No snapshot do HubSpot daquele dia eles só apareciam em `motivosPerda` (negócio já
--     perdido) — zero negócio aberto para reatribuir. E não mexemos no HubSpot de todo
--     jeito: somos espelho dele.
delete from public.mapa_usuarios
where lower(email) in (
  'michel.takeat@gmail.com',
  'gleyson.takeat@gmail.com',
  'ricardofiaes.takeat@gmail.com'
);

-- ══ 3. E O LOGIN DELES FOI REVOGADO ══════════════════════════════════════════════════
-- Tirar de mapa_usuarios fecha o acesso ao DADO (toda política devolve vazio), e
-- api/dados.js já devolvia 403 porque eles não estão em data/usuarios.json. Mas conta de
-- autenticação viva ainda emite JWT válido — michel tinha entrado em 13/08, e UM DELES
-- AINDA TINHA SESSÃO ABERTA no momento da limpeza. Eram duas portas, não uma.
--
-- BLOQUEIO em vez de delete de auth.users, de propósito: é reversível e preserva o
-- registro de quem foi (created_at, last_sign_in_at). Apagar a conta é irreversível e
-- mexe no schema interno do Supabase. Bloqueado já não entra, que era o objetivo.
--
-- As sessões vivas morrem junto: sem isso um refresh token existente continuaria
-- renovando por dias, e o bloqueio só valeria no próximo login.
with alvo as (
  select id from auth.users where lower(email) in (
    'michel.takeat@gmail.com','gleyson.takeat@gmail.com','ricardofiaes.takeat@gmail.com')
)
, mortas as (delete from auth.sessions where user_id in (select id from alvo) returning 1)
update auth.users set banned_until = 'infinity' where id in (select id from alvo);

-- ══ AINDA ABERTO, PARA O JULYAN DECIDIR — NÃO APLICADO ═══════════════════════════════
-- Duas contas de autenticação com login vivo e ausentes das DUAS fontes do time
-- (data/usuarios.json e mapa_usuarios). Nenhuma alcança dado: api/dados.js devolve 403 e
-- toda tabela devolve vazio. Mas continuam podendo autenticar.
--
--   test-recon@proton.me      conta de teste, nunca fez parte do time
--   julyan@takeat.com.br      segundo e-mail do Julyan; o cadastrado é julyan.takeat@gmail.com
--
-- Não bloqueei nenhuma das duas: a primeira porque não foi uma das três que ele nomeou, e
-- a segunda porque é dele e bloquear pode ser o contrário do que ele quer. Se for para
-- limpar a de teste:
--   update auth.users set banned_until = 'infinity' where lower(email) = 'test-recon@proton.me';
