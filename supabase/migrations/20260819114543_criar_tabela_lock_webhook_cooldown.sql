-- 20260819114543_criar_tabela_lock_webhook_cooldown
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- CORREÇÃO (19/08/26, achado real: Julyan viu pares de execuções do robô com poucos
-- minutos/segundos de diferença, mesmo com cooldown de 60min configurado) — a
-- verificação de cooldown em api/hubspot-webhook.js fazia "consultar API do GitHub →
-- decidir → disparar" em passos separados. Quando o HubSpot manda vários avisos quase
-- simultâneos (uma mudança de etapa + preencher campos = vários avisos de uma vez),
-- duas requisições da function podiam consultar a MESMA última execução (de >60min
-- atrás) ANTES que a primeira run aparecesse na lista do GitHub — as duas concluíam
-- "pode disparar" e disparavam juntas. Clássica race condition de check-then-act.
--
-- Esta tabela resolve isso com uma trava ATÔMICA: um único UPDATE condicional no
-- banco (não dá pra dois processos "ganharem" a mesma trava ao mesmo tempo, o
-- Postgres serializa isso). Só uma linha, sempre a mesma (id=1).
create table if not exists webhook_cooldown (
  id int primary key,
  ultimo_disparo_em timestamptz not null default '2000-01-01T00:00:00Z'
);
insert into webhook_cooldown (id, ultimo_disparo_em) values (1, '2000-01-01T00:00:00Z')
  on conflict (id) do nothing;
