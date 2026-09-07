-- 20260902222629_cockpit_snapshot_fora_do_repositorio
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- O snapshot do robô sai do repositório e passa a viver aqui.
--
-- POR QUE: cada rodada do robô fazia um commit em data/*.json, e todo commit gera um
-- deploy na Vercel. Isso limitava a atualização a ~15 rodadas por dia (teto de 100
-- deploys/dia do plano Hobby) e obrigava um cooldown de 20 minutos no webhook do HubSpot.
-- Com o dado aqui, a rodada não faz commit, não gera deploy e pode acontecer sempre que
-- o HubSpot avisar que algo mudou.
--
-- UMA LINHA POR ARQUIVO. As chaves são os nomes que o robô já usa (hubspot, weekly-raw,
-- resumo-semanal, narrativas, sync-status, hubspot-previous), para o código de leitura
-- não precisar de um mapa de tradução.
create table if not exists public.cockpit_snapshot (
  chave         text primary key,
  conteudo      jsonb not null,
  bytes         integer,
  atualizado_em timestamptz not null default now(),
  origem        text
);

comment on table public.cockpit_snapshot is
  'Snapshot do CRM que o robô (scripts/fetch-hubspot.js) produz — antes vivia em data/*.json e era commitado. Uma linha por arquivo, chave = nome do arquivo sem extensão.';
comment on column public.cockpit_snapshot.origem is
  'Quem escreveu: workflow agendado, webhook do HubSpot ou execução manual. Serve para rastrear de onde veio a carga que está no ar.';
comment on column public.cockpit_snapshot.bytes is
  'Tamanho do JSON quando foi gravado. Serve para perceber carga truncada — snapshot que encolhe de 884 KB para 3 KB é sinal de falha, não de mês fraco.';

-- RLS LIGADA E DE PROPÓSITO SEM NENHUMA POLICY.
--
-- Este dado é o CRM inteiro do time: todos os negócios, valores, donos e telefones. Hoje
-- ele vive num arquivo que só o servidor lê, e a rota /api/dados só devolve depois de
-- validar a sessão e FILTRAR pelo papel de quem pediu (executivo não recebe a carteira do
-- colega). Essa propriedade não pode se perder na mudança de lugar.
--
-- Sem policy, anon e authenticated não leem nada — nem com a chave anon, que roda no
-- navegador de qualquer pessoa. Só a service_role (que passa por cima da RLS e existe
-- apenas nas variáveis de ambiente do servidor) escreve e lê.
--
-- NÃO ADICIONE UMA POLICY AQUI para "consertar" o acesso: se algo não consegue ler esta
-- tabela, a resposta certa é usar a service_role no servidor, nunca abrir a tabela para o
-- cliente. Uma policy de leitura para authenticated entregaria o CRM completo a qualquer
-- executivo logado, que é exatamente o corte de privacidade que a rota existe para fazer.
alter table public.cockpit_snapshot enable row level security;
