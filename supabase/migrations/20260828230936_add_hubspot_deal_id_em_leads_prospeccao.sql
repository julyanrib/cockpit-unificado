-- 20260828230936_add_hubspot_deal_id_em_leads_prospeccao
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- A coluna que o codigo do Cockpit ja escrevia e que nao existia.
--
-- abrirPassagemContaAlvoProFunil() grava hubspot_deal_id depois de criar o negocio no
-- HubSpot, para nao criar duas vezes o mesmo negocio a partir da mesma conta-alvo. O
-- proprio comentario no template documentava a degradacao: "Se a coluna hubspot_deal_id
-- ainda nao existir no Supabase, o update falha em silencio no console e o botao so
-- reaparece". Ou seja: a protecao contra duplicata nunca funcionou.
--
-- Aditiva e reversivel: coluna nova, anulavel, sem default, sem indice unico (dois
-- registros de prospeccao podem legitimamente apontar para o mesmo negocio se alguem
-- mesclar contas depois). 970 linhas na tabela.
alter table public.leads_prospeccao
  add column if not exists hubspot_deal_id text;

comment on column public.leads_prospeccao.hubspot_deal_id is
  'ID do negocio (deal) criado no HubSpot a partir desta conta-alvo. Preenchido por abrirPassagemContaAlvoProFunil no Cockpit; quando presente, a conta ja virou negocio e o botao de jogar no funil nao deve ser oferecido de novo.';
