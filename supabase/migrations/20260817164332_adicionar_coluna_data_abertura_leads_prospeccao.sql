-- 20260817164332_adicionar_coluna_data_abertura_leads_prospeccao
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- Mesma pendência do cnpj: o script de backfill já tenta gravar data_abertura
-- (alimenta o "Aberta há N dias" na ficha), mas a coluna nunca foi criada.
alter table leads_prospeccao add column if not exists data_abertura timestamptz;
