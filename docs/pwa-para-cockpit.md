# O que o PWA precisa mandar para o Cockpit

**Para:** time de RPA (dono do PWA Outbound)
**De:** Cockpit Field Sales
**Data:** 28/08/2026

Documento irmão do [`contrato-eventos-rpa.md`](contrato-eventos-rpa.md). Aquele define o
formato do touchpoint; este é o **diagnóstico do que falta hoje**, levantado inspecionando
o PWA em produção, com os números que cada lacuna produz na tela do executivo.

---

## 1. O que eu encontrei

O PWA e o Cockpit vivem em **dois projetos Supabase diferentes**:

| | projeto | tabelas |
|---|---|---|
| PWA Outbound | `mxyjvijclhlxrlafqcrz` | `clients`, `client_visits`, `client_notes`, `client_tasks`, `client_meetings`, `client_stage_changes`, `field_routes`, `field_route_stops`, `profiles`, `sector_visibility` |
| Cockpit | `xitmahwxncpdzopmdook` | `leads_prospeccao`, `planos_diarios`, `dailies`, `pdi_compromissos`, `um_a_um`, `comunicados`, … |

Zero sobreposição de tabelas, e o projeto do PWA está em outra organização — o Cockpit
não tem e não precisa ter acesso direto a ele.

**A ponte já existe e funciona**, e é por ela que tudo abaixo deve passar:

```
sendHubspotEvent({ type, ... })
  → Supabase Edge Function 'hubspot-sync'
  → fallback para o n8n se a edge estiver indisponível
```

Tipos de evento já em uso: `create_pin`, `change_stage`. O `change_stage` tem 2
retentativas e, se falhar, atualiza `clients.etapa` localmente e loga
`[change_stage] sync HubSpot falhou` — comportamento correto, mantenham.

**Portanto: nada aqui pede infraestrutura nova.** Tudo é evento novo (ou campo novo em
evento existente) sobre transporte que já está de pé.

---

## 2. O que já chega, e por que isso não é suficiente

Hoje o Cockpit mede a rua pelas **visitas do Expogo que vão para o HubSpot**. As do PWA
chegam pelo mesmo caminho — tanto que o Cockpit já precisou deduplicar visita que subiu
pelos dois (`atividadesComprovadasNoDia`; caso real de 27/08, "Rei dos galetos" contado
duas vezes). Essa parte está resolvida.

O problema é que a visita chega **sem o conteúdo dela**. Medido nos 132 negócios abertos
do time em 28/08:

| campo | preenchido | consequência |
|---|---|---|
| `gargalo_operacional` (a dor) | **41%** — e só 4% na etapa Visita | sem dor, não há motivo para voltar |
| `nome_do_sistema` (o PDV atual) | **16%** | o pitch de foodservice é dado no escuro |
| `qual_maior_desafio_` | 8% | — |
| `data_da_reuniao` | **0%** | — |
| tarefa datada no HubSpot | **16 negócios de 132** | o Cockpit acha que ninguém agendou nada |

E o efeito no funil:

```
Prospecção 26 · VISITA 51 · Decisor 21 · Demo 11 · Negociação 18 · Ag.Pag 5
```

Entram 51 em Visita e chegam 21 ao Decisor. **Dos 51 em Visita, 49 não têm nem o sistema
nem a dor registrados.** O executivo volta da rua e o CRM não sabe o que ele aprendeu.

---

## 3. Lacuna 1 — a qualificação (maior valor, menor esforço)

**O PWA não tem o campo `nome_do_sistema`.** Procurei no bundle: não existe. E `gargalo`
existe como noção, mas não chega ao negócio no HubSpot.

Esses dois campos **são** a qualificação em foodservice. "Que sistema você usa hoje" e
"qual a sua maior dor" definem o pitch, o plano a apresentar e o argumento para pedir o
decisor. E os dois só existem na cabeça de quem esteve no salão.

O Cockpit já foi corrigido para exigi-los na entrada da etapa Visita, e para cobrá-los
na ficha de quem já está lá. Mas **cobrar depois é o desenho errado**: o executivo
preenche horas mais tarde, de memória, ou não preenche — foi exatamente assim que se
chegou a 49 de 51 em branco. Quem está no restaurante é o PWA.

### O que fazer

No fechamento da visita no PWA, pedir dois campos (dez segundos, um deles é picklist):

```js
sendHubspotEvent({
  type: 'qualificar_negocio',
  deal_id: '64365430108',          // obrigatório
  owner_id: '91477292',            // hubspot_owner_id de quem registrou
  nome_do_sistema: 'Consumer',     // texto livre, até 120 caracteres
  gargalo_operacional: 'Fila'      // OBRIGATORIAMENTE um destes:
  // 'Fila' | 'Falta de Garçom' | 'Falta de Gestão' | 'Sem fidelização'
  // | 'Demora na divisão de contas' | 'Estoque'
})
```

`gargalo_operacional` é enumeração no HubSpot: valor fora da lista volta como erro cru
da API. Validem no cliente **e** na edge.

Se preferirem não criar evento novo, o Cockpit já expõe uma rota equivalente e
autenticada.

> **Mudou o caminho canônico em 31/08/26.** As ações de negócio do Cockpit passaram a ser
> servidas por uma porta única: `POST /api/negocio-acao` com `op: 'nota'`. O motivo é
> capacidade — o plano Hobby da Vercel dá 12 funções, as 12 estavam ocupadas, e precisamos
> de espaço para o endpoint onde o PWA vai publicar a fila pendente do app.
>
> **A URL antiga continua valendo.** `POST /api/criar-nota-negocio` segue existindo como
> apelido da mesma implementação, com o mesmo corpo e os mesmos códigos de erro. Nada que
> vocês já tenham escrito precisa mudar. Quando confirmarem a migração para a porta única,
> a gente remove o apelido e libera mais um slot.

O corpo é idêntico nos dois caminhos: `tipoAcao: 'proximo-passo'` e o objeto
`qualificacao: { nomeDoSistema, gargalo }`. Ela grava as duas propriedades e mais nada,
valida a picklist no servidor e confere pipeline e dono. Mas o caminho pelo
`hubspot-sync` é mais direto e não faz o PWA depender do Cockpit.

**Por que isto primeiro:** é o único item da lista que muda o resultado no mesmo dia. Com
os dois campos preenchidos na visita, o executivo abre o Cockpit à noite e já tem
argumento para o próximo contato — em vez de um nome, um endereço e um contador de dias.

---

## 4. Lacuna 2 — o desfecho estruturado

O Cockpit **já tem o parser pronto** (`tpDesfechoDaNota`) e ele nunca recebeu nada: o
desfecho fica `null`, a cadência cai para a régua genérica da etapa, e dor, objeção e
decisor se perdem mesmo quando o executivo os soube.

Procurei `DESFECHO_VISITA` no bundle do PWA: **não existe**.

### O que fazer

Ao fechar a visita, gravar a nota no negócio **com este bloco como corpo** — via
`hubspot-sync` (evento de nota) ou via `POST /api/negocio-acao` do Cockpit (`op: 'nota'`;
a URL antiga `/api/criar-nota-negocio` continua funcionando como apelido):

```
DESFECHO_VISITA v1
cliente: Bar do Zé
ocorrido_em: 2026-08-27T17:30:00.000Z
canal: visita
desfecho: decisor_ausente
pessoa: Marcos
papel: Gerente
decisor_alcancado: nao
dor: taxa de marketplace come a margem do delivery
objecao:
interesse: cardápio digital + comanda
observacao: dono aparece só depois das 19h
proximo_passo: ligacao | 2026-08-28 | Ligar pedindo o decisor pelo nome
cadencia: acesso_decisor #2
origem: pwa
```

Regras que o parser exige (detalhe em `contrato-eventos-rpa.md` §3):

- primeira linha **exatamente** `DESFECHO_VISITA v1`;
- uma chave por linha, `chave: valor`, snake_case sem acento;
- chave vazia é melhor que chave ausente;
- `proximo_passo: <canal> | <AAAA-MM-DD> | <ação>`;
- `decisor_alcancado`: **só `sim` vale como verdadeiro.** Ausente ou vazio é
  *desconhecido*, e o Cockpit trata como desconhecido de propósito. **Nunca mandem `nao`
  para dizer "não sei"** — isso transforma "não tenho registro" em "não alcançou", que é
  uma afirmação diferente sobre o trabalho da pessoa;
- versão desconhecida (`v2` amanhã) faz o Cockpit marcar `requer_revisao` em vez de
  reinterpretar em silêncio. Se mudarem o formato, subam a versão.

---

## 5. Lacuna 3 — as tarefas (duas filas concorrentes)

Esta é a mais delicada, porque hoje **existem duas filas de trabalho e nenhuma sabe da
outra**:

| | como é calculada | quanto tem |
|---|---|---|
| PWA | `generate_client_tasks` → `client_tasks` | **88 pendências** |
| Cockpit | `filaDeFollowUp`, 8 baldes | Kelly: 28 itens |
| Cockpit julga constância por | tarefa datada **no HubSpot** | **16 no time todo** |

As 88 tarefas do PWA são geradas e resolvidas dentro do PWA (`resolveTask` grava
`status`, `resolved_at`, `resolved_by`) e **nunca viram tarefa no HubSpot**.

Consequência: o executivo pode resolver tarefas do PWA o dia inteiro e o Cockpit continuar
dizendo "0 de 32 com próximo passo". Não é que o time seja inconstante — é que o Cockpit
está olhando para outro lugar.

### O que fazer — e o que decidir antes

Não é decisão só técnica, então não proponho uma só saída:

**Opção A — o PWA cria a tarefa no HubSpot quando o executivo agenda um retorno.**
Melhor caminho, porque o HubSpot volta a ser a fonte única de prova e nada no Cockpit
muda. Vale só para o próximo passo que o *executivo* marcou — as tarefas
auto-geradas por `generate_client_tasks` **não** devem virar tarefa no HubSpot, senão
o CRM enche de item que ninguém prometeu.

```js
sendHubspotEvent({
  type: 'criar_proximo_passo',
  deal_id: '64365430108',
  owner_id: '91477292',
  subject: 'Follow-up - ligar pedindo o decisor',
  due_at: '2026-08-31T12:00:00Z',   // ver a nota de fuso abaixo
  tipo: 'Follow-up'                  // Follow-up | Visita | Reunião | Demo
})
```

**Opção B — expor `client_tasks` em leitura para o Cockpit** (view somente-leitura ou
endpoint). Mantém a geração no PWA e faz o Cockpit parar de ignorá-la. Exige acordo
sobre acesso entre as duas contas Supabase.

**Opção C — deixar como está e alinhar o discurso:** o Cockpit passa a dizer
explicitamente que mede *tarefa no HubSpot*, não *pendência do PWA*. É a pior das três,
mas é melhor que a situação atual, em que a tela parece dizer que a pessoa não trabalhou.

Minha recomendação é **A**, e não é preferência estética: prova de execução precisa viver
onde o gestor, o Cockpit e o HubSpot olham. Duas verdades sobre o mesmo dia é o que
produz a discussão de daily que ninguém ganha.

### Nota de fuso, que já causou bug

O Cockpit grava todo próximo passo às **12:00 UTC (09:00 de Brasília)** —
`Date.UTC(ano, mes, dia, 12, 0, 0)` em `api/criar-nota-negocio.js`. Usem a mesma
convenção quando não houver hora específica.

E o motivo de a convenção importar: até 28/08 o Cockpit comparava o vencimento por
*instante*, então toda tarefa datada para hoje desaparecia da tela às 09h01 — o dia útil
inteiro. Já corrigido (comparação por dia), mas se vocês mandarem hora diferente sem
avisar, o comportamento volta a ficar sensível a detalhe de fuso.

---

## 6. O que **não** mandar

- **Visita sem `deal_id`.** O Cockpit conta como "visita não confirmada" e ela fica fora
  do ciclo fechado — não dá para avaliar o que não aponta para negócio nenhum. O PWA já
  tem `ensureHubspotDeal`; use antes de fechar a visita.
- **`decisor_alcancado: nao` como sinônimo de "não sei".** Ver §4.
- **Tarefa auto-gerada como tarefa do HubSpot.** Ver §5, opção A.
- **Visita duplicada de propósito** "para garantir". A deduplicação existe e é
  conservadora (mesmo dono + mesmo dia + mesmo cliente normalizado), mas ela reporta a
  duplicidade na tela, e isso vira dúvida sobre o número.

---

## 7. Resumo, em ordem de valor

| # | o que | esforço | o que destrava |
|---|---|---|---|
| 1 | `nome_do_sistema` + `gargalo_operacional` no fecho da visita | dois campos, um é picklist | 49 negócios em Visita hoje cegos; o argumento para chegar ao decisor |
| 2 | bloco `DESFECHO_VISITA v1` na nota | formatação de texto | cadência certa por desfecho, dor e objeção preservadas, parser que já existe passa a servir |
| 3 | próximo passo do executivo como tarefa no HubSpot | evento novo | fim das duas filas concorrentes; a constância passa a medir o que a pessoa fez |

Os três usam o `hubspot-sync` que já está de pé. Nenhum exige mudança no Cockpit — o lado
do consumidor está pronto e testado (71 testes de núcleo, 12 de rota).

Qualquer divergência entre este documento e o código: **o código está certo**. O parser de
referência é `tpDesfechoDaNota()` e o whitelist da qualificação é `gravarQualificacao()`
em `api/criar-nota-negocio.js`.
