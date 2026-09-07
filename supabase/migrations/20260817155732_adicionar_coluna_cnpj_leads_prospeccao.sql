-- 20260817155732_adicionar_coluna_cnpj_leads_prospeccao
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- URGENTE (17/08/26) — achado na revisão da tela do executivo: o script de backfill
-- da Casa dos Dados já tenta gravar "cnpj" desde 16/08 (comentário confirma: "ficha
-- da rota pedia isso — o campo já vinha na resposta, só não era salvo"), mas a coluna
-- nunca foi criada. Sem ela, TODOS os leads de TODOS os executivos ficam sem CNPJ,
-- e a feature de "buscar telefone e sócio" (construída ontem) nunca tem como
-- funcionar — o botão exige l.cnpj, que é sempre vazio.
alter table leads_prospeccao add column if not exists cnpj text;
