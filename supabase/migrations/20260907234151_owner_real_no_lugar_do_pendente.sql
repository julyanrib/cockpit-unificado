-- 20260907234151_owner_real_no_lugar_do_pendente
-- SQL exatamente como foi aplicado em 07/09/26 (apply_migration, registrada em
-- supabase_migrations.schema_migrations).
--
-- POR QUE ELA EXISTE: o Julyan abriu o Cockpit com o login da Renata e viu "nada
-- liberado, apenas playbook". Não era RLS — era o portão `aComecar` do app, que existe
-- por pedido dele mesmo (19/08/26: "como eles não têm dados ainda do HubSpot, quero que
-- coloque avisos 'você está em onboarding' melhor do que deixar tudo zerado ou com
-- erro"). O portão está certo; quem estava errado era o placeholder.
--
-- MEDIDO, um por um, no HubSpot: os cinco JÁ TINHAM owner ATIVO. O 'pendente_*' era
-- resíduo de quando eles foram cadastrados antes de existir o usuário no CRM.
--   scaetano       -> 97978276  (Sérgio Caetano)
--   renatapessoa   -> 97353028
--   andregomes     -> 97353030  (André Gomes)
--   luizpimentel   -> 97353029  (Luiz Vieira Pimentel)
--   ricardoantunes -> 96662734  (Ricardo Ramires Antunes)
--
-- O QUE ESTA MIGRAÇÃO PROTEGE, e é o motivo de ela existir em vez de um update solto:
-- 468 leads de prospecção já estavam atribuídos aos placeholders (renatapessoa 221,
-- andregomes 108, luizpimentel 70, scaetano 69) e o Ricardo tinha 24 dailies e 29
-- análises semanais sob 'pendente_ricardo2'. Trocar só o ownerId em usuarios.json
-- apagaria da tela o backlog de prospecção dos quatro e o histórico inteiro do Ricardo —
-- o dado continuaria no banco, invisível, atribuído a um id que ninguém mais é.
--
-- CONFERIDO ANTES: zero linha existia sob os ids reais, nas tabelas que usam owner_id.
-- Troca limpa, sem colisão de unique (dailies é unique por owner_id+data).
-- CONFERIDO DEPOIS: zero placeholder restante no banco, e os 468 leads + as 24 dailies
-- + as 29 análises seguiram para os ids novos.
--
-- O LADO DO REPOSITÓRIO ANDA JUNTO, e sem ele isto aqui não resolve nada: o placeholder
-- era ESTRUTURAL no template. `TERRITORIOS` é chaveado por owner ('pendente_scaetano' =
-- Zona Norte e Lapa, e assim por diante) e `PRACA_POR_OWNER` também. Trocar no banco e
-- não no template deixaria os cinco sem território — com owner válido e nenhum bairro
-- para rodar. As duas mudanças estão no mesmo commit.
--
-- Idempotente: rodar de novo não acha nenhum 'pendente_' e não faz nada.

create temp table de_para(antigo text primary key, novo text);
insert into de_para values
  ('pendente_scaetano','97978276'),
  ('pendente_renatapessoa','97353028'),
  ('pendente_andregomes','97353030'),
  ('pendente_luizpimentel','97353029'),
  ('pendente_ricardo2','96662734');

update public.mapa_usuarios m set owner_id = d.novo from de_para d where m.owner_id = d.antigo;
update public.leads_prospeccao l set responsavel_owner_id = d.novo from de_para d where l.responsavel_owner_id = d.antigo;
update public.dailies t set owner_id = d.novo from de_para d where t.owner_id = d.antigo;
update public.analise_individual_semanal t set owner_id = d.novo from de_para d where t.owner_id = d.antigo;
update public.analise_individual_mensal t set owner_id = d.novo from de_para d where t.owner_id = d.antigo;
update public.planos_diarios t set owner_id = d.novo from de_para d where t.owner_id = d.antigo;
update public.planos_semanais t set owner_id = d.novo from de_para d where t.owner_id = d.antigo;
update public.pdi_compromissos t set owner_id = d.novo from de_para d where t.owner_id = d.antigo;
update public.pdi_documentos t set owner_id = d.novo from de_para d where t.owner_id = d.antigo;
update public.registros_rodada t set owner_id = d.novo from de_para d where t.owner_id = d.antigo;
update public.sugestoes_planos t set owner_id = d.novo from de_para d where t.owner_id = d.antigo;
update public.um_a_um t set owner_id = d.novo from de_para d where t.owner_id = d.antigo;
