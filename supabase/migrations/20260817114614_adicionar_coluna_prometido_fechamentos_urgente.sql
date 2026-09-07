-- 20260817114614_adicionar_coluna_prometido_fechamentos_urgente
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- URGENTE (17/08/26, manhã da apresentação) — executivos travados sem conseguir
-- assumir compromisso do dia: "Could not find the 'prometido_fechamentos' column
-- of 'dailies' in the schema cache". Coluna genuinamente não existia — as outras
-- 2 promessas (visitas, avanços, propostas) tinham par prometido_/realizado_, mas
-- fechamentos só tinha o realizado_. Mesmo tipo das demais colunas prometido_.
alter table dailies add column if not exists prometido_fechamentos integer;
