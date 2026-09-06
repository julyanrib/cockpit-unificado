-- A PROMESSA DA SEMANA (06/09/26, prancha Semana v2 do gestor)
--
-- A aba Semana v2 gira em torno de PROMETIDO x CUMPRIDO por nome. O cumprido sempre
-- existiu e vem do HubSpot (ganhos na semana, visitas, avancos) — a prova esta fora da
-- nossa mao, e e isso que faz o placar ser a prova de auto-relato. O PROMETIDO nao
-- existia em lugar nenhum: planos_semanais guardava a grade de rota e as regioes, e
-- nenhuma coluna dizia quantos fechamentos, visitas e prospeccoes a pessoa se
-- comprometeu a entregar. Sem isso o placar mostraria "promessa nao dada" para os sete,
-- para sempre.
--
-- POR QUE JSONB E NAO TRES COLUNAS: as dimensoes da promessa mudam. Hoje sao tres
-- (fechamentos, visitas, prospeccao); a prancha ja fala de "so dimensoes com promessa >0
-- entram na media", o que e um convite a acrescentar uma quarta. Coluna nova por dimensao
-- e migration por dimensao; um objeto com as chaves que existirem resolve, e a tela e
-- quem sabe quais ler.
--
-- POR QUE NAO REUSEI fechado_em: ele ja significa outra coisa — "o executivo fechou a
-- grade da semana dele". A trava da promessa e um segundo ato, do GESTOR, na Semanal de
-- segunda. Dois atos diferentes com dois carimbos diferentes; juntar os dois faria a tela
-- nao conseguir dizer qual dos dois aconteceu.
--
-- A PROVENIENCIA E O PONTO. `promessa_dada_em` nao e enfeite de auditoria: a prancha
-- exige que a linha expandida mostre "promessa dada seg 8h07 · medido HubSpot 11h40", e
-- a regra das 8h30 (sem promessa ate 8h30, o placar marca "promessa NAO dada") depende de
-- comparar esse carimbo com o horario. Sem ele, a regra nao existe.

alter table public.planos_semanais
  -- {fechamentos: n, visitas: n, prospeccao: n} — o que ELE se comprometeu a entregar
  add column if not exists promessa jsonb,
  -- quando e por quem: e o carimbo que a regra das 8h30 le, e a proveniencia da linha
  add column if not exists promessa_dada_em timestamptz,
  add column if not exists promessa_dada_por text,
  -- a trava do GESTOR na Semanal de segunda, confirmada em voz alta
  add column if not exists promessa_travada_em timestamptz,
  add column if not exists promessa_travada_por text;

create index if not exists planos_semanais_promessa_idx
  on public.planos_semanais (data_segunda desc)
  where promessa is not null;

-- SEM MUDANCA DE POLICY, e isso e deliberado: as politicas de planos_semanais ja dizem
-- exatamente o que esta tela precisa — LEITURA para o gestor e para o dono; ESCRITA so
-- para o DONO da semana. Conferido em pg_policies antes de aplicar.
--
-- A consequencia e boa: o executivo grava a propria promessa (e a palavra dele) e o
-- gestor NAO consegue escrever no lugar dele nem por engano. A trava do gestor precisa,
-- por isso, de um caminho proprio — e ela vai por update do dono na tela do gestor? Nao:
-- vai pela pauta_do_lider, que e a tabela do gestor. O que a Semanal trava fica como item
-- de pauta ('promessa_travada'), e a promessa em si continua sendo a linha dele.
-- Assim ninguem escreve na palavra de ninguem.
