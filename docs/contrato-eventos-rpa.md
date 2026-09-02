# Contrato de eventos — Cockpit ↔ Expogo ↔ PWA Outbound ↔ HubSpot

**Público:** time de RPA/integração.
**Status:** v1, 27/08/2026.
**Fonte de verdade deste documento no código:** `template/cockpit.template.html`, nos
blocos delimitados pelos marcadores `@nucleo`, `@nucleo2` e `@nucleo3`. Os objetos
`TP_CANAIS`, `TP_DESFECHOS`, `TP_SYNC` e `TP_ORIGENS` **são** o contrato, e
`tpDesfechoDaNota()` é o parser de referência do bloco `DESFECHO_VISITA` (§3) — este
arquivo descreve, não define. Se os dois divergirem, o código está certo.

---

## 1. Por que este contrato existe

A operação de rua está em transição do **Expogo** para o **PWA Outbound**. O Cockpit
precisa funcionar com os dois ao mesmo tempo, sem uma linha de `if (ferramenta === ...)`
na interface, e sem contar a mesma visita duas vezes enquanto os dois estiverem vivos.

A solução é um **evento normalizado** — o *touchpoint*. Qualquer origem (Expogo, PWA,
HubSpot, Cockpit) é traduzida para o mesmo formato antes de qualquer tela ler qualquer
coisa. Trocar o Expogo pelo PWA passa a ser trocar o produtor do evento, não reescrever
o consumidor.

**O que o Cockpit NÃO faz e não vai fazer:** registrar a execução de rua. Isso é do PWA.
O Cockpit organiza, recomenda e acompanha; o HubSpot comprova.

---

## 2. O modelo de touchpoint

Um touchpoint é **um ponto de contato com um cliente**, realizado ou planejado.

| campo | tipo | obrigatório | observação |
|---|---|---|---|
| `touchpoint_id` | string | **sim** | Estável e único **por origem**. É a chave de deduplicação (§6). |
| `deal_id` | string | sim quando existe | ID do negócio no HubSpot. **Sem ele a visita é "não confirmada"** (§5). |
| `company_id` | string | não | |
| `contact_id` | string | não | |
| `owner_id` | string | **sim** | `hubspot_owner_id` do executivo. |
| `visit_id` | string | não | Agrupa touchpoints de uma mesma visita física (chegada, conversa, desfecho). |
| `occurred_at` | ISO 8601 com fuso | **sim** | Quando aconteceu. Para o planejado, quando vai acontecer. |
| `channel` | enum `TP_CANAIS` | **sim** | `visita`, `ligacao`, `whatsapp`, `email`, `reuniao`, `demo`, `proposta`, `outro`. |
| `type` | string | **sim** | Rótulo legível do tipo de atividade. |
| `outcome` | enum `TP_DESFECHOS` \| null | sim para visita realizada | §3. `null` = registro incompleto. |
| `decision_maker_reached` | bool \| null | não | `null` = desconhecido. **Não use `false` para "não sei"** (§7.3). |
| `pain` | string | não | Dor principal, texto curto. |
| `objection` | string | não | Objeção principal, quando houve. |
| `product_interest` | string | não | Produto/solução de interesse. |
| `notes` | string | não | Observação curta ou referência de evidência. |
| `source` | enum `TP_ORIGENS` | **sim** | `expogo`, `pwa`, `hubspot`, `cockpit`, `manual_revisado`. |
| `sync_status` | enum `TP_SYNC` | **sim** | §4. |
| `completed_at` | ISO 8601 \| null | não | Quando o registro foi fechado. |
| `next_touch_type` | string | sim quando houve conversa comercial | §3. |
| `next_touch_at` | ISO 8601 (data) | idem | |
| `next_touch_channel` | enum `TP_CANAIS` | idem | |
| `cadence_name` | string | não | Chave em `data/cadencias.json`. |
| `cadence_step` | int | não | Número do toque dentro da régua. |
| `cadence_status` | enum | não | `nao_iniciada`, `planejada`, `em_dia`, `atrasada`, `quebrada`, `encerrada`. |

### Enums

```
channel        : visita | ligacao | whatsapp | email | reuniao | demo | proposta | outro
source         : expogo | pwa | hubspot | cockpit | manual_revisado
sync_status    : local | enviando | sincronizado | falhou | requer_revisao
cadence_status : nao_iniciada | planejada | em_dia | atrasada | quebrada | encerrada
```

---

## 3. Desfechos de visita e o próximo passo

Treze desfechos. Cada um traz três propriedades que mudam o que o sistema exige depois:

| `outcome` | conversa comercial | encerra cadência | exige motivo |
|---|---|---|---|
| `decisor_falou` | sim | não | não |
| `equipe_falou` | sim | não | não |
| `decisor_ausente` | sim | não | não |
| `diagnostico` | sim | não | não |
| `demo` | sim | não | não |
| `proposta_enviada` | sim | não | não |
| `negociacao` | sim | não | não |
| `fechado` | sim | não | não |
| `sem_contato` | não | não | não |
| `reagendar` | não | não | não |
| `sem_aderencia` | sim | **sim** | **sim** |
| `recusou` | sim | **sim** | **sim** |
| `outro` | sim | não | **sim** |

**Regra dura:** desfecho com `conversa comercial = sim` e `encerra = não` **precisa** de
`next_touch_type` + `next_touch_at` + `next_touch_channel`. Um evento assim sem próximo
passo é rejeitado pela interface do Cockpit e aparece na fila como *follow-up
descoberto*. Se o PWA aceitar salvar sem, o Cockpit vai continuar cobrando — e com razão.

**Regra dura:** desfecho com `encerra = sim` precisa de motivo, de
`data/cadencias.json → motivosDeSaida`:

```
recusa_explicita | sem_perfil | duplicidade | operacao_encerrada | sem_aderencia | outro_comercial
```

### Formato hoje: bloco estruturado em NOTE do HubSpot

Enquanto não houver campo próprio no HubSpot, o desfecho viaja como uma **NOTE**
associada ao negócio, com um bloco de texto de formato fixo. É o que o Cockpit já grava
(`desfechoNotaEstruturada`), e é o que o PWA deve gravar para ser lido pelo mesmo parser:

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

Regras do bloco:
- primeira linha exatamente `DESFECHO_VISITA v1` (a versão sobe se o formato mudar; o
  parser passa a aceitar as duas, **nunca** reinterpreta em silêncio);
- uma chave por linha, `chave: valor`, chave em snake_case sem acento;
- chave vazia é permitida (linha presente, valor vazio) — melhor que chave ausente;
- `proximo_passo: <canal> | <AAAA-MM-DD> | <ação>`;
- rodapé de assinatura opcional, mas se existir use `— <Nome> (via PWA Outbound)` (§7.1).

---

## 4. Sincronização: o que cada estado significa

| `sync_status` | significado | conta como feito? |
|---|---|---|
| `local` | existe só no aparelho | **não** |
| `enviando` | em trânsito | **não** |
| `sincronizado` | chegou ao HubSpot | **sim** |
| `falhou` | envio falhou | **não** |
| `requer_revisao` | chegou inconsistente | **não** |

Só `sincronizado` autoriza tratar a ação como feita. Isso não é preciosismo: o Cockpit
mostra "aguardando sincronização" para tudo que não for `sincronizado`, e a diferença
entre "o executivo não fez" e "o app não subiu" é a diferença entre cobrar e consertar.

**Sincronização ≠ desfecho.** Um evento pode estar `sincronizado` e ainda ter
`outcome: null` — aí ele é *registro incompleto*, não falha de rede. Confundir os dois
foi um bug real desta implementação, corrigido em 27/08.

**Limitação atual, importante:** o Cockpit **não tem API do Expogo nem do PWA**. Ele lê
o HubSpot. Portanto ele não consegue distinguir "o app ainda não subiu" de "não
aconteceu": ambos aparecem como ausência. É por isso que a tarja de frescor diz
`Expogo e PWA: sincronização não confirmada` em vez de um ✓ verde. Para isso mudar, o
PWA precisa expor um endpoint de fila pendente por `owner_id` (§8).

---

## 5. As regras de verdade que o consumidor aplica

O Cockpit aplica estas regras sobre qualquer evento, de qualquer origem:

1. **agendado ≠ realizado** — `occurred_at` no futuro nunca conta como toque;
2. **nota interna não é ponto de contato** — nota sem sinal de contato com alguém é
   descartada como touchpoint (`TP_NOTA_DE_CONTATO` no código);
3. **visita sem `deal_id` = não confirmada** — casar por nome faz o evento aparecer na
   linha do negócio, mas **não** é prova de vínculo. Medido na carga de 27/08: 419 de
   443 itens de agenda têm associação; os 24 restantes aparecem marcados;
4. **visita sem `outcome` = registro incompleto**;
5. **visita sem próximo passo = follow-up descoberto**;
6. **próximo passo só existe com ação, responsável e data** — os três;
7. **checkbox local não comprova execução** — não existe mais nenhum no Cockpit do
   executivo;
8. **snapshot velho não gera cobrança** — com carga acima de 8h o painel troca de tom.

---

## 6. Deduplicação (transição Expogo → PWA)

Durante a transição a mesma visita pode chegar por dois caminhos (o app grava a nota de
follow-up **e** a tarefa `Visita - X` é criada em paralelo). Ocorreu de verdade na carga
de 27/08: um cliente contado duas vezes no mesmo dia.

**Ordem de deduplicação, do mais forte para o mais fraco:**

1. `touchpoint_id` igual → é o mesmo evento. **Sempre** mande o mesmo
   `touchpoint_id` ao reenviar; é o que torna o reenvio idempotente;
2. `deal_id` + `channel` + mesma janela de 15 minutos em `occurred_at`;
3. `owner_id` + dia + nome de cliente normalizado (o que o Cockpit usa hoje, por não
   ter os dois anteriores).

Ao deduplicar, **preserve o registro com `deal_id`** (associação real) e mantenha o
descartado acessível — o Cockpit reporta "N registros duplicados no dia, contamos uma
vez só" em vez de esconder. Duplicidade silenciosamente removida é indistinguível de
dado perdido.

**Não obrigue o executivo a registrar a mesma ação nos dois apps.** Enquanto os dois
existirem, o Expogo é a origem legada e o PWA a nova; o Cockpit aceita as duas com o
mesmo formato e resolve a duplicidade. Quando o Expogo for desligado, nada de histórico
deve ser apagado: eventos com `source: expogo` continuam válidos para sempre.

---

## 7. O que o Cockpit precisa e ainda não recebe

Em ordem de impacto. Cada item abaixo é hoje um `—` na tela, com a nota do motivo —
nunca uma estimativa.

### 7.1 Assinatura de origem distinguível
Hoje a origem é inferida do texto: `(via App Outbound)` → `expogo`, `(via PWA)` ou
`(via PWA Outbound)` → `pwa`. É frágil (um rename quebra) e vive num único lugar do
código (`tpOrigemDoTexto`). **Pedido:** propriedade própria no objeto do HubSpot, ou
assinatura estável e documentada.

### 7.2 Histórico completo de atividades por negócio
A carga atual devolve, por negócio: tarefas **em aberto**, as **2** notas mais recentes,
e `ultimaInteracao`. Não devolve atividades concluídas. Consequência direta: a contagem
de toques do Cockpit é um **piso**, não um total — e a interface escreve `≥ N`, não `N`.

Isso bloqueia três coisas que o negócio pediu:
- **tempo médio até o 2º toque** (hoje calculado sobre a minoria com 2 toques datados,
  com a amostra declarada na tela);
- **vendas por número do toque** (negócio fechado sai do funil aberto e o histórico
  dele não vem);
- **média de pontos de contato antes da venda**.

**Pedido:** engagements concluídos por `deal_id`, com `type`, `timestamp` e `outcome`.

### 7.3 Decisor alcançado — parcialmente resolvido do nosso lado
`hs_decisor_confirmado` continua sem ser preenchido por nenhuma automação
(`agendaDecisor` devolve `null` sempre). **Mas** o registro de desfecho do Cockpit grava
`decisor_alcancado` no bloco estruturado, e o parser (§3) o lê de volta — então o campo
passa a existir para toda visita fechada pelo Cockpit.

Regra do parser, que o PWA precisa respeitar: **só `sim` é sim.** Campo ausente ou vazio
é `null` (desconhecido), **não** `false`. A diferença entre "não alcancei" e "não sei" é
a diferença entre um dado e um chute — e é ela que decide se o negócio entra no balde de
"decisores ainda não alcançados". Esse balde também exige 2+ toques antes de acusar,
justamente porque a maior parte da base ainda é "não sei".

**Pedido que continua:** o PWA manda `decision_maker_reached` no desfecho, no mesmo
formato.

### 7.4 Desfecho estruturado — resolvido do nosso lado, pendente no PWA
`hs_task_status = COMPLETED` diz que a tarefa foi fechada, não **o que aconteceu na
visita** — isso não mudou.

O que mudou (27/08/26): o Cockpit **grava e agora também lê** o bloco `DESFECHO_VISITA`.
Era um defeito nosso — a escrita existia desde o começo e a leitura nunca foi
implementada, então o desfecho registrado voltava na carga seguinte e era tratado como
uma nota genérica com `outcome: null`. Consequência do bug, enquanto durou: a visita
seguia marcada como "sem desfecho", a régua continuava sendo escolhida pela etapa
(decisor ausente não puxava a régua de acesso ao decisor), e dor/objeção/interesse
ficavam vazios mesmo preenchidos.

Com o parser no lugar, **o desfecho passa a mandar na cadência**: `padraoPorDesfecho`
ganha de `padraoPorEtapa`, que é o comportamento que o motor foi desenhado para ter.

**Pedido:** o PWA grava o mesmo bloco, com `origem: pwa`. Ele será lido pelo mesmo
parser, sem nenhuma mudança do lado do Cockpit. Se o formato precisar mudar, **suba a
versão** no cabeçalho (`DESFECHO_VISITA v2`): o parser marca versão desconhecida como
`requer_revisao` em vez de reinterpretar campos em silêncio.

### 7.5 Marcar negócio como perdido
`api/mudar-etapa-negocio.js` aceita só as etapas **abertas** do pipeline — "Perdido"
ficou fora daquela rodada, de propósito. Portanto **não existe** botão "Perder com
motivo" no Cockpit: um botão que não escreve nada é pior que a ausência dele. O que
existe é "Reciclar com data" (escrita real, etapa Reciclagem) e o link direto para o
negócio no HubSpot. **Pedido:** liberar a etapa de perda com motivo obrigatório.

### 7.6 Fila pendente do app
Ver §4. Sem isso, "aguardando sincronização" só é detectável para o que o próprio
Cockpit acabou de gravar na sessão.

---

## 8. Régua de cadência — onde ela mora

Em `data/cadencias.json`. **Não está hardcoded em código**: o template lê
`DATA.cadencias` e, se o arquivo não vier, não desenha recomendação de cadência nenhuma
(em vez de cair numa régua inventada).

Estrutura:
- `cadencias.<nome>.passos[]` — `{ toque, dia, canal, acao }`, `dia` é D+n contado a
  partir do último toque registrado;
- `cadencias.<nome>.encerramento` — `{ aposToque, opcoes[] }`;
- `padraoPorEtapa` — `stageId` → nome da régua;
- `padraoPorDesfecho` — `outcome` → nome da régua (`null` = sai da cadência, com motivo);
- `motivosDeSaida[]`.

Dez réguas hoje: `primeiro_contato`, `acesso_decisor`, `sem_contato`, `diagnostico`,
`pos_demo`, `proposta`, `negociacao`, `pagamento`, `reciclagem`, `reativacao`.

Ajustar a operação = editar esse JSON e rodar o build. Nenhum deploy de código.

---

## 9. Idempotência

Toda ação automática precisa poder rodar duas vezes sem efeito dobrado:

- reenvio de touchpoint: mesmo `touchpoint_id`;
- criação de tarefa de próximo passo: dedup por `deal_id` + assunto + data;
- mudança de etapa: `PATCH` idempotente por natureza, mas **a tarefa de próximo passo
  que acompanha a mudança não é** — verifique antes de criar;
- nota de desfecho: dedup por `deal_id` + `DESFECHO_VISITA` + `ocorrido_em`.

---

## 10. Como testar sem escrever em negócio real

- `node scripts/testar-nucleo.js` — 49 casos sobre o código de produção recortado do
  template e avaliado com entorno stub. Cobre cadência, touchpoint, dedup, gates, fila,
  frescor, ordenação e os cenários que quase nunca aparecem juntos na base real
  (visita sem desfecho, cadência completa, recusa explícita, evento do Expogo, evento do
  PWA, aguardando sincronização);
- `node scripts/check-scripts.js` — sintaxe dos `<script>` inline e dos JSONs de dados;
- `node scripts/preview-local.js rep` — abre o Cockpit já logado, com dados reais e
  **offline**, para revisão visual. O arquivo gerado contém CRM: nunca versionar
  (`.gitignore` cobre).

Nenhum desses caminhos escreve em HubSpot ou Supabase.

<!-- Prova de disputa de push (02/09/26): este commit foi feito DE PROPOSITO enquanto o robo
     rodava, para forcar o caminho "push rejeitado -> fetch -> rebase" que falhou 6 vezes em
     dois dias. Se o robo publicou depois disto, a correcao do passo de publicacao funciona. -->
