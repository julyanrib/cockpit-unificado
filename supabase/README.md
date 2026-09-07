# O banco do Cockpit

O schema vive aqui, em `migrations/`. **Isso é novo desde 07/09/26** — antes o banco tinha
20 migrations aplicadas e o repositório tinha 5 arquivos.

## Como está organizado

| arquivo | o que é |
|---|---|
| `20260724000000_baseline_do_que_veio_antes_do_historico.sql` | as 17 tabelas criadas no painel do Supabase entre 24/07 e 14/08/26, antes de existir histórico de migration. Lido do `pg_catalog`, não reconstruído de memória. **Nunca foi aplicado como migration** — descreve o que já está lá. |
| `<versão de 14 dígitos>_<nome>.sql` × 20 | as migrations aplicadas, com o SQL **exatamente** como o banco recebeu (resgatado de `supabase_migrations.schema_migrations`). |
| `APLICADAS.txt` | a lista do que o banco tem aplicado. É o que a guarda compara com o diretório. |

A ordem dos nomes é a ordem de aplicação, e o baseline ordena antes de tudo porque foi o
que aconteceu primeiro.

## Ao aplicar uma migration nova

Duas coisas, sempre juntas:

1. o arquivo em `migrations/`, com a versão que o Supabase registrou;
2. a linha em `APLICADAS.txt`.

`node scripts/checar-migrations-versionadas.js` reprova se uma andar sem a outra — e essa
guarda roda dentro do `check-scripts.js`, ou seja, dentro do build. Foi escrita justamente
porque "aplico agora e commito depois" foi o que produziu a divergência de 15 migrations.

## Duas coisas que valem saber antes de mexer

**O baseline reflete o schema de HOJE, não o de 24/07.** Colunas que migrations posteriores
acrescentaram já aparecem nele. Isso não quebra o replay num banco novo porque todas
aquelas migrations usam `add column if not exists` — elas viram no-op. Mas significa que o
baseline não é uma foto histórica: é o ponto de partida para chegar ao estado atual.

**`cockpit_snapshot` tem RLS ligada e nenhuma policy, de propósito.** Ela guarda o CRM
inteiro do time. Sem policy, nem `anon` nem `authenticated` leem nada — só a `service_role`
do servidor. Se algo não consegue ler essa tabela, a resposta certa é usar a service_role no
servidor, **nunca** criar uma policy de leitura: uma policy para `authenticated` entregaria
o CRM completo a qualquer executivo logado, que é exatamente o corte que `/api/dados` existe
para fazer. O comentário está dentro da própria migration.
