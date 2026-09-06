-- VALIDACAO DO GESTOR NO ACORDO DO EXECUTIVO (06/09/26, prancha Pessoas)
--
-- A aba Pessoas tem um bloco "Aguardando a sua validacao": o executivo marca o acordo como
-- feito na aba Desenvolvimento dele, e o gestor valida (ou devolve com motivo) na dele.
--
-- POR QUE COLUNAS NA MESMA TABELA, e nao uma tabela de validacoes:
-- o par so tem sentido junto. `checked[i]` e a marcacao dele; `validado_em[i]` e o carimbo
-- do gestor sobre AQUELA marcacao. Numa tabela separada, as duas metades poderiam divergir
-- (validacao de um indice que nao existe mais, acordo apagado com validacao orfa) e a tela
-- teria que reconciliar. Na mesma linha, o ✓ aparece nos dois lados sem sincronizacao
-- nenhuma — e essa e a promessa da prancha: "mesma linha de dado, nao copia".
--
-- ARRAYS PARALELOS A `checked`, pelo mesmo motivo: ele ja e boolean[], com uma posicao por
-- compromisso da analise da semana. Manter o mesmo formato deixa indice[i] querendo dizer a
-- mesma coisa nas quatro colunas.
--
-- DEVOLVER EXIGE MOTIVO (a tela obriga): devolucao sem motivo e o gestor mandando refazer
-- sem dizer o que, e o acordo volta igual na semana seguinte.
--
-- SEM MUDANCA DE POLICY: pdi_compromissos ja da UPDATE ao gestor (role='manager' em
-- mapa_usuarios) — conferido em pg_policies antes de aplicar.

alter table public.pdi_compromissos
  add column if not exists validado_em timestamptz[],
  add column if not exists validado_por text[],
  add column if not exists devolvido_em timestamptz[],
  add column if not exists devolvido_motivo text[];
