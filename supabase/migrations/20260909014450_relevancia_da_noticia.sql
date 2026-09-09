-- ══════════════════════════════════════════════════════════════════════════════════════
-- A NOTA DE RELEVÂNCIA DA NOTÍCIA, E O MOTIVO DELA (09/09/26)
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Julyan: "coloque semanalmente para eu saber de tudo" — e depois "conserta os cinco e
-- segue com a aba".
--
-- ══ POR QUE ISTO EXISTE, MEDIDO E NÃO SUPOSTO ═══════════════════════════════════════
-- A primeira rodada em produção gravou 36 manchetes. Eu li as 36. Depois de consertar os
-- cinco defeitos (tema sem filtro do setor, manchete de julho, história duplicada,
-- veículo com dois nomes, rótulo do TAM exagerado), sobraram 33 de 32 veículos — e o
-- problema que ficou NÃO É de filtro:
--
--   "Vendas crescem, mas lucro chega a só 32% dos bares e restaurantes do RN"
--   "Quanto custa o morango cravejado? Saiba mais sobre a nova onda viral"
--
-- As duas citam gastronomia/restaurante de verdade. Nenhuma é falso positivo de palavra.
-- Uma muda o mês do gestor; a outra é matéria de comportamento. Filtro de palavra não
-- separa as duas, e um filtro que TENTASSE separar jogaria fora notícia boa em silêncio.
--
-- ENTÃO NADA É JOGADO FORA POR JULGAMENTO DE ASSUNTO — É RANQUEADO, com o motivo do
-- lugar gravado ao lado da nota. A tela mostra as primeiras e guarda o resto atrás de
-- "ver todas". Filtro escondido decide pelo gestor; nota com motivo deixa ele discordar.
--
-- `relevancia_motivo` é o que faz esta coluna valer: sem ele a nota seria um número sem
-- procedência no meio de um cockpit onde todo número diz de onde vem. Com ele, quando um
-- release passar na frente, o motivo na tela diz por que — e o conserto é uma palavra na
-- lista do coletor, não desconfiança do bloco inteiro.
--
-- ADITIVA E ANULÁVEL: a tabela tem duas horas de vida, nada a lê ainda, e linha antiga
-- sem nota ordena por data como antes. Continua sem política de escrita — só o job
-- escreve, com service_role.
-- ══════════════════════════════════════════════════════════════════════════════════════

alter table public.noticias_setor
  add column if not exists relevancia integer,
  add column if not exists relevancia_motivo text;

comment on column public.noticias_setor.relevancia is
  'Nota de relevância para o gestor de Field Sales, calculada por scripts/radar-semanal.js: número no título, veículo de peso no setor e assunto de dinheiro do dono somam; marca de divulgação (Salão, Feira, Prefeitura) e fonte de release/conteúdo patrocinado subtraem. Serve para ORDENAR, nunca para esconder — item de nota baixa continua gravado e visível em "ver todas".';

comment on column public.noticias_setor.relevancia_motivo is
  'Em texto, os sinais que produziram a nota. Existe para o gestor poder DISCORDAR do ranking: quando um release passa na frente, o motivo na tela diz por quê.';

-- Ordenar por nota e depois por data é a consulta que a aba faz toda vez.
create index if not exists noticias_setor_relevancia_idx
  on public.noticias_setor (data_semana desc, relevancia desc nulls last, publicado_em desc);
