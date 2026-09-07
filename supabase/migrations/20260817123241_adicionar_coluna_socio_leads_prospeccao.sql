-- 20260817123241_adicionar_coluna_socio_leads_prospeccao
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- Pedido do Julyan (17/08/26): ficha da Prospecção passa a mostrar sócio, além de
-- endereço (já existia) e telefone (já existia). Mesmo padrão das outras: sob demanda,
-- cacheada aqui pra não gastar crédito de novo na próxima vez que abrir a ficha.
alter table leads_prospeccao add column if not exists socio text;
