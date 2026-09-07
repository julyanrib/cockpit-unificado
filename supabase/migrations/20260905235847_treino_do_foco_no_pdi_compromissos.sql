-- 20260905235847_treino_do_foco_no_pdi_compromissos
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- O treino de 5 minutos do "foco de habilidade da semana" (aba Desenvolvimento do
-- executivo). Duas colunas ADITIVAS e nulas: nenhuma linha existente muda, e todo
-- código que hoje lê a tabela continua lendo o mesmo que lia.
--
-- Por que aqui e não numa tabela nova: o foco é UM por semana, e a semana desta tabela
-- já é a chave (owner_id, versao_analise). Uma tabela só para isso teria a mesma chave,
-- o mesmo dono e o mesmo ciclo de vida — seria a mesma linha em dois lugares.
--
-- treino_feito_em: quando o executivo marcou. NULL = não fez (não é "false": é ausência).
-- treino_foco: qual foco foi treinado, para o gestor saber o que ele exercitou, e para o
--              histórico não virar "fez o treino" sem dizer treino de quê.
alter table public.pdi_compromissos
  add column if not exists treino_feito_em timestamptz,
  add column if not exists treino_foco text;

comment on column public.pdi_compromissos.treino_feito_em is
  'Quando o executivo marcou o treino de 5 min do foco da semana. NULL = não fez.';
comment on column public.pdi_compromissos.treino_foco is
  'Id do foco de habilidade treinado (FOCOS_DE_HABILIDADE do cockpit).';
