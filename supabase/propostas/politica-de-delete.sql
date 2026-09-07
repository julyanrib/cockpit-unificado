-- PROPOSTA — NÃO APLICADA. Esperando o ok do Julyan (07/09/26).
--
-- Este arquivo não tem timestamp no nome de propósito: ele NÃO é uma migration ainda.
-- Ao aprovar, renomear para `<timestamp>_politica_de_delete.sql`, aplicar, acrescentar
-- em APLICADAS.txt, regenerar POLITICAS.txt e apagar as duas linhas de DIVIDA_CONHECIDA
-- em scripts/checar-politica-do-front.js.
--
-- ══ O QUE ESTÁ ERRADO HOJE ═══════════════════════════════════════════════════════════
--
-- Duas tabelas têm botão de apagar na tela e RLS ligada SEM política de DELETE. Um
-- delete barrado por RLS não é erro no Postgres: apaga zero linhas e devolve sucesso.
-- Então `if (error)` nunca disparava e as duas telas reportavam que apagaram.
--
-- MEDIDO, não deduzido — com transação e rollback, virando `authenticated` com o JWT
-- de gente real:
--   pdi_documentos      gestor VÊ a linha (1), manda apagar, banco apaga 0. Sem erro.
--   playbook_progresso  Bruno VÊ a própria linha (1), manda apagar, banco apaga 0.
--
-- O código já parou de mentir (`.select()` depois do `.delete()`, zero linha = falha
-- com aviso na tela). Falta a política, que é o que faz o botão voltar a FUNCIONAR.
--
-- ══ POR QUE ESTAS REGRAS, E NÃO OUTRAS ═══════════════════════════════════════════════
--
-- Cada uma espelha a política de INSERT que a tabela JÁ tem — quem cria é quem apaga.
-- Não estou inventando permissão nova: no PDI, o INSERT hoje exige role='manager';
-- no Playbook, o INSERT hoje exige que o e-mail da linha seja o do próprio JWT.
--
-- `lower()` nos dois lados porque e-mail cadastrado com maiúscula já deixou gente sem
-- acesso ao próprio dado neste banco. (A política de SELECT de pdi_documentos ainda usa
-- comparação sensível a caixa, do estilo antigo — vale consolidar, mas em separado:
-- mexer nela agora misturaria uma correção de acesso com uma de leitura.)

-- ── 1. PDI: quem cria é o gestor, então quem apaga é o gestor ────────────────────────
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

-- ── 2. Playbook: NÃO ENTROU, e vale registrar por quê ───────────────────────────────
-- Eu tinha escrito aqui uma política de DELETE para playbook_progresso. Medindo os usos
-- antes de propor: o desmarcar do Playbook NÃO EXISTE — os dois únicos chamadores de
-- playbookMarcarProgresso passam concluido=true, e não há gesto de desmarcar na tela.
-- Era código morto, e código morto não ganha política: ganha remoção. Foi removido do
-- template. Se um dia entrar o gesto, a guarda 24 cobra a política no build, antes de
-- o botão existir na tela.

-- ══ FORA DO ESCOPO DESTE ARQUIVO, mas medido na mesma varredura ══════════════════════
--
-- Duas tabelas estão com RLS DESLIGADA e com grant de SELECT/INSERT/UPDATE/DELETE para
-- `anon` — e a chave anon viaja dentro do bundle público, à vista de quem abrir o
-- código-fonte:
--
--   backup_donos_sp_20260901  400 linhas: responsavel_owner_id, cidade, bairro, lat, lng.
--                             É o mapa de território de SP. Ninguém no código a lê.
--   webhook_cooldown          1 linha, um timestamp. Só api/hubspot-webhook.js usa.
--                             Com UPDATE liberado ao anon, dá para silenciar ou liberar
--                             o disparo do webhook de fora.
--
-- Não escrevi o DDL delas aqui porque as decisões são diferentes e são do Julyan:
-- a primeira provavelmente é `drop table` (é backup de 01/09, sem leitor), a segunda é
-- `alter table ... enable row level security` sem política nenhuma (só o servidor usa).
-- Apagar tabela e mexer em RLS são coisas que eu não faço por conta.
