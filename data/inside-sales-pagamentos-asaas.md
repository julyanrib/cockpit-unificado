# Pagamento Realizado (Asaas) + Painel Semanal — guia de replicação

Documento para **replicar esta integração em outro projeto** e para **diagnosticar** quando ela
para de funcionar. Escrito depois da implantação real no Takeat OS (13/08/2026), então inclui os
erros que aconteceram de verdade, não só o caminho feliz.

**O que foi entregue:** duas telas que antes só existiam numa planilha do time comercial —
(1) o painel semanal por vendedor e (2) a coluna "Pagamento Realizado" na tabela de vendas,
alimentada pelo Asaas.

---

## 1. Arquitetura

```
HubSpot ──(diário 03:00)──► inside-sales-vendas-sync ──► inside_sales_vendas
                                                            ▲   ▲
Asaas ──(evento em tempo real)──► asaas-webhook ────────────┘   │
                                                                │
Asaas ──(semanal, rede de segurança)──► inside-sales-pagamentos-sync
                                                                │
                                                      Painel Inside Sales (React)
```

Três caminhos de escrita na **mesma tabela** (`inside_sales_vendas`), com papéis distintos:

| Componente                     | Gatilho                    | Papel                                             | Custo de API                      |
| ------------------------------ | -------------------------- | ------------------------------------------------- | --------------------------------- |
| `inside-sales-vendas-sync`     | cron diário 03:00 BRT      | traz vendas do HubSpot + a propriedade `asaas_id` | HubSpot: ~2-3 páginas/dia         |
| `asaas-webhook`                | evento do Asaas (push)     | marca pago/vencido em tempo real                  | **zero**                          |
| `inside-sales-pagamentos-sync` | cron semanal + sob demanda | backfill e recuperação de eventos perdidos        | Asaas: 1 req por cliente não pago |

### Por que os três, e não só o webhook

O webhook sozinho **não é suficiente**, por três motivos que só aparecem em produção:

1. **Histórico.** Webhook não traz o passado. Vendas fechadas antes da implantação nunca teriam o dado.
2. **Corrida de sequência.** A venda só entra na tabela quando o sync do HubSpot roda (03:00). O
   cliente costuma pagar no mesmo dia da assinatura, à tarde — o evento chega, não acha a venda e
   se perde. Sem o sync, justamente as vendas do dia ficariam sem o "Pago".
3. **Entregas perdidas.** Deploy, indisponibilidade, ou o gateway rejeitando: o evento não volta
   sozinho. O Asaas inclusive _penaliza_ e interrompe a fila do endpoint depois de algumas falhas.

E o polling sozinho também não serve: latência de um dia e consumo de quota proporcional ao volume.

---

## 2. Pré-requisitos no projeto destino

Sem isso, não adianta começar:

- [ ] **Propriedade `asaas_id` no deal do HubSpot**, preenchida nos deals do pipeline comercial.
      É a chave que liga venda ↔ cliente do Asaas. No Takeat, 309 de 320 vendas (96,6%) tinham.
- [ ] **Tabela de vendas** já sincronizada do CRM (aqui, `inside_sales_vendas`, alimentada por uma
      edge function que filtra pipeline + "ganho").
- [ ] **Conta Asaas** com API key (para o polling) e permissão de cadastrar webhook.
- [ ] **Supabase** com pg_cron e pg_net habilitados, e edge functions.
- [ ] **Metas mensais por vendedor** numa tabela (aqui `sales_performance.meta_clientes`) — só para
      o painel semanal.

---

## 3. Inventário de artefatos

| Arquivo                                                    | Linhas | O que é                              |
| ---------------------------------------------------------- | ------ | ------------------------------------ |
| `supabase/functions/asaas-webhook/index.ts`                | 164    | recebedor do webhook                 |
| `supabase/functions/inside-sales-pagamentos-sync/index.ts` | 300    | polling/backfill                     |
| `migrations/inside_sales_vendas_pagamento.sql`             | 26     | colunas + índices                    |
| `migrations/inside_sales_pagamentos_cron.sql`              | 51     | agendamento                          |
| `src/pages/aquisicao/inside-sales/SemanaTab.jsx`           | 401    | painel semanal                       |
| `VendasTab.jsx` (alterações)                               | ~170   | 6 colunas novas + 2 filtros + export |
| `inside-sales-vendas-sync/index.ts` (alteração)            | 5      | trazer `asaas_id` do HubSpot         |

**Total: ~1.100 linhas.**

### Colunas adicionadas

```sql
alter table public.inside_sales_vendas
  add column if not exists asaas_id            text,
  add column if not exists pagamento_realizado boolean,  -- true/false/null (ver abaixo)
  add column if not exists pagamento_data      date,
  add column if not exists pagamento_valor     numeric,
  add column if not exists pagamento_status    text,
  add column if not exists pagamento_synced_at timestamptz,
  add column if not exists onboarding          boolean;
```

**Semântica de três estados** — a decisão mais importante do modelo:

| Valor   | Significa                                                  | Na tela            |
| ------- | ---------------------------------------------------------- | ------------------ |
| `true`  | achou cobrança paga no Asaas                               | **Sim** (verde)    |
| `false` | checado e não há cobrança paga                             | **Não** (vermelho) |
| `null`  | não dá para saber (venda sem `asaas_id`, ou nunca checada) | **—** (cinza)      |

Sem o terceiro estado, "não checado" viraria "não pagou" — e o painel mentiria.

### Regras de escrita (valem para os dois caminhos)

- `pagamento_data` é a do **primeiro** pagamento. As mensalidades seguintes não sobrescrevem.
- Um `PAYMENT_OVERDUE` posterior **não rebaixa** uma venda já paga. Quem pagou a primeira e ficou
  inadimplente no terceiro mês continua "Pago: Sim" — inadimplência é outro painel.
- O `asaas_id` nunca é apagado por quem não o conhece (ver armadilha 3).

---

## 4. Passo a passo de replicação

1. Rodar a migration das colunas.
2. Adicionar `asaas_id` à lista de propriedades do sync do CRM e ao mapeamento de gravação.
3. Deployar as duas functions **com JWT desligado** (`--no-verify-jwt`).
4. Criar os secrets: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `<PROJETO>_PAGAMENTOS_TOKEN`.
5. Rodar o sync do CRM na janela desejada para popular `asaas_id`.
6. **Conferir o vínculo antes de gastar quota:**
   ```sql
   select count(*) filter (where asaas_id is not null) as com_asaas, count(*) as total
   from public.inside_sales_vendas where close_date >= now() - interval '45 days';
   ```
   Se `com_asaas` for zero, pare: a propriedade não está preenchida no CRM e o resto não funciona.
7. Backfill em lotes: `{"days": 45, "limit": 50}` primeiro (para medir custo), depois `limit` maior.
8. Cadastrar o webhook no Asaas (eventos `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`)
   com o token de autenticação.
9. Agendar o cron do backfill.
10. Testar o webhook com um cliente inexistente (não escreve nada):
    ```bash
    curl -X POST '<URL>/functions/v1/asaas-webhook' \
      -H 'asaas-access-token: <TOKEN>' -H 'Content-Type: application/json' \
      -d '{"event":"PAYMENT_RECEIVED","payment":{"customer":"cus_teste_000","value":1,"status":"RECEIVED","paymentDate":"2026-08-13"}}'
    # esperado: 200 {"ok":true,...,"ignorado":"nenhuma venda para esse cliente"}
    ```

---

## 5. Diagnóstico — sintomas reais e suas causas

Todos os itens abaixo aconteceram nesta implantação. É aqui que o tempo foi embora.

### 5.1. Webhook do Asaas devolvendo 401, com "Penalização aplicada"

**Causa:** a function foi deployada com verificação de JWT ligada (padrão do deploy pelo Dashboard).
O gateway do Supabase barra antes de chegar no código, porque o Asaas não manda `Authorization`.

**Como distinguir** — o corpo da resposta diz de quem é o 401:

| Resposta                                 | Origem              | Correção                                               |
| ---------------------------------------- | ------------------- | ------------------------------------------------------ |
| `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` | gateway do Supabase | desligar "Verify JWT" / deployar com `--no-verify-jwt` |
| `{"error":"Token inválido"}`             | o próprio código    | o token do Asaas ≠ o secret                            |

**Teste decisivo** (de fora, sem tocar em dado):

```bash
curl -s -X POST '<URL>/functions/v1/asaas-webhook' -H 'Content-Type: application/json' -d '{}'
```

O Asaas interrompe a fila do endpoint após falhas seguidas. Depois de corrigir, **reative a fila no
painel dele** — os eventos represados são reenviados.

### 5.2. Cron voltando 401 em silêncio

**Causa:** o agendamento foi copiado de outro cron do projeto que mandava só a anon key. Aquela
function não checava auth; a nova checa. Resultado: o job roda, toma 401 e ninguém percebe — não há
erro visível em lugar nenhum.

**Correção:** o cron precisa mandar o mesmo header que a function exige (`x-sync-token`).

**Lição de replicação:** ao copiar um cron existente, confirme o _modelo de auth da função destino_,
não só a URL. Vale sempre testar o job manualmente com `curl` antes de agendar.

### 5.3. `sem_asaas_id` em 100% das vendas

**Causa:** premissa errada de modelagem. Tentamos ligar venda → cliente do Asaas por uma tabela de
onboarding (`onboarding_deals`, join por `deal_id`). Mas aquela tabela só contém os pipelines
Onboarding e Sucesso, enquanto as vendas estão no pipeline Comercial. **Um deal está em um pipeline
por vez** — o join nunca podia casar.

**Correção:** `asaas_id` é propriedade do próprio deal no HubSpot (é por ela que o fluxo n8n legado
busca). Basta trazê-la no sync do CRM. Passou de 0% para 96,6% de vínculo.

**Efeito colateral perigoso:** a versão errada gravava `asaas_id = null` quando não encontrava —
ou seja, apagava a cada execução o que o sync do CRM acabara de preencher. Regra geral: **um
processo que não é dono de um campo nunca deve escrever `null` nele.**

### 5.4. Backfill retorna `consultados: 0` sem erro

**Causa provável:** `ASAAS_API_KEY` errada. A function trata falha por item para não abortar o run
inteiro, então erro de autenticação vira resultado vazio em vez de erro — ponto cego conhecido.

**Diagnóstico:** `asaas_requests: 0` com `pendentes > 0` confirma que nem chegou a chamar o Asaas.

### 5.5. "Um mês não puxou"

**Causa:** não é bug. A fila é ordenada por `close_date desc` e cortada pelo `limit`, então o mês
mais recente é processado primeiro. Com `limit: 50` sobre 320 vendas, só agosto aparecia.

**Correção:** repetir com `limit` maior até `pendentes` zerar.

### 5.6. Upsert em lote falhando

**Causa:** o PostgREST exige que **todas as linhas de um upsert em lote tenham exatamente as mesmas
chaves**. Montar linhas com formatos diferentes (umas com 6 campos, outras com 2) quebra a chamada.

**Correção:** normalizar todas as linhas para o mesmo conjunto de chaves, repetindo o valor atual
onde não há mudança.

### 5.7. Suspeita em aberto: falso negativo em cartão

Na primeira amostra, só 32% das vendas ganhas apareceram como pagas — baixo demais para ser real.

**Hipótese:** o filtro usa `paymentDate[ge]`, mas no Asaas o `paymentDate` é a data em que o dinheiro
**caiu**, não em que o cliente pagou (num payload real: `confirmedDate` 26/06 e `paymentDate` 28/07).
Uma venda no cartão confirmada e ainda não creditada provavelmente tem `paymentDate` nulo e **some
do filtro**, sendo marcada como não paga.

**Verificação:** pegar 3 vendas marcadas como não pagas, de preferência cartão, e conferir no Asaas
se existe cobrança paga.

**Correção, se confirmado:** trocar o filtro para `dateCreated[ge]` (não depende de crédito) e
reprocessar com `{"recheck": true}`.

---

## 6. Custos e limites operacionais

- **Quota do Asaas:** 25k requisições/12h, compartilhada com todos os fluxos da empresa. O polling
  gasta 1 req por cliente ainda não pago. Depois do backfill, cai para dezenas por execução.
- **403 do Asaas** pode ser bloqueio temporário por excesso. A function **aborta em vez de insistir**
  — retry nesse caso prolonga o bloqueio.
- **Deadline de 90s** por execução: o que não coube volta em `pendentes` para o run seguinte.
- **Teto de 400 clientes** por execução, configurável no body.

---

## 7. Referência para precificação

Distribuição real do esforço — o que costuma ser subestimado é a coluna da direita:

| Frente                         | Peso     | Observação                                                           |
| ------------------------------ | -------- | -------------------------------------------------------------------- |
| Painel semanal (front)         | ~35%     | tabela transposta, meta rateada por dia, validação contra a planilha |
| Colunas na tabela de vendas    | ~15%     | 6 colunas, 2 filtros, export                                         |
| Webhook + polling + migrations | ~25%     | as duas functions e o agendamento                                    |
| **Implantação e diagnóstico**  | **~25%** | JWT, auth do cron, modelagem do vínculo, backfill em lotes           |

Pontos que mais consomem tempo em um projeto novo, por ordem:

1. **Descobrir a chave de ligação CRM ↔ gateway de pagamento.** Foi o erro mais caro aqui. Verifique
   _antes de qualquer código_ se existe uma propriedade preenchida no CRM que aponte para o cliente
   no gateway — e em qual pipeline ela está preenchida.
2. **Auth de edge function.** JWT do gateway × auth própria da função × header do cron: três camadas
   que falham com o mesmo código 401 e mensagens diferentes.
3. **Validar a regra de negócio contra a planilha de origem.** No painel semanal, a % usa a meta
   **fracionada** (9,5), não a arredondada (10) exibida na linha. Conferir célula a célula com a
   planilha original evitou entregar um número que "parece certo" e está errado.

Trabalho recorrente depois de no ar: praticamente nulo (dois crons e um webhook), exceto quando o
CRM muda o nome de uma propriedade.

---

## 8. Pendências conhecidas

- [ ] Confirmar/corrigir o falso negativo de cartão (5.7).
- [ ] `consultados: 0` deveria ser erro explícito, não resultado vazio (5.4).
- [ ] O sync semanal deixa até ~6 dias de atraso no pior caso (venda paga no mesmo dia em que
      fechou, antes de existir na tabela). Passar para diário resolve, e custa pouco. Alternativa
      definitiva: tabela buffer de eventos, onde o webhook grava **todo** evento — inclusive os sem
      venda correspondente — e o sync do CRM casa depois. Custo zero de API.
- [ ] A divisão `$ Assinatura` × `$ Avulso` é derivada (`MRR × meses do período`, limitado ao valor
      do negócio), não vem do CRM. Confirmar com o time comercial se a regra é essa mesma.
