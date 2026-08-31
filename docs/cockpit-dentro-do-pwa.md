# O Cockpit dentro do app de campo

**Decidido na reunião de 31/08/26 (Julyan + RPA).** O app de campo passa a ter duas abas:

| aba | para que serve | quem usa, quando |
|---|---|---|
| **Mapa** | operação: onde estou, para onde vou, o que registrei | executivo, na rua, aberto o dia todo |
| **Cockpit** | gestão: o que o dia/semana está dizendo e o que cobrar | gestor na Daily; executivo antes e depois da rua |

Este documento é o que o time do PWA precisa para plugar o Cockpit e para receber as ações
dele. Nada aqui é pedido de refactor: **o lado do Cockpit já está pronto e no ar.**

---

## 1. Ligar a transição é uma variável de ambiente

Toda ação de campo do Cockpit (ligar, WhatsApp, navegar) já passa por um funil único. Ele
está desligado até existir um endereço de app:

```
PWA_DEEP_LINK=https://<app>/acao
```

Com a variável definida na Vercel, **todo** link `tel:`, `wa.me` e navegação de Maps do
Cockpit — os que existem hoje e os que alguém escrever amanhã — para de sair para o
discador do sistema e passa a abrir o app, com o contexto da ação na querystring.

Sem a variável, nada muda: `tel:` liga, `wa.me` abre, Maps navega. Não existe tela
esperando o app para funcionar, e não existe ação que morra no meio da transição.

> Por que interceptador e não 18 trocas de link: são 9 `tel:`, 3 `wa.me` e 5 navegações de
> Maps espalhados por sete telas. Um a um, o próximo link que alguém escrevesse ficaria
> fora do trilho. O interceptador roda na fase de captura — várias dessas âncoras vivem
> dentro de cartões clicáveis que dão `stopPropagation`, e na fase de bolha metade nunca
> chegaria nele.

---

## 2. O que o app recebe

`GET <PWA_DEEP_LINK>?...` — uma aba nova, sem POST, sem corpo.

| parâmetro | quando vem | o que é |
|---|---|---|
| `acao` | sempre | `ligar` · `whatsapp` · `navegar` · `navegar-rota` |
| `telefone` | ligar, whatsapp | só dígitos, com DDI (`5551999887766`) |
| `dealId` | quando a linha clicada declara o negócio | id do deal no HubSpot |
| `cliente` | quando a tela sabe o nome | nome exibido, até 120 caracteres |
| `lat`, `lng` | navegar | destino |
| `paradas`, `ids` | navegar-rota | `lat,lng|lat,lng|…` e os ids na mesma ordem |
| `ownerId` | sessão de executivo | dono da ação (no gestor vem vazio, de propósito) |
| `origem` | sempre | `cockpit` |

**O que o app deve fazer com isso:** abrir a tela da ação **já com o registro pendente**,
não só disparar o discador. Se o app só abrir o telefone, o registro continua sendo digitado
à mão depois — que é exatamente o buraco que a fila pendente expôs.

Exemplo real, capturado da tela:

```
https://<app>/acao?acao=ligar&telefone=5551999887766&dealId=77777
  &cliente=Don+Aguilar&ownerId=86100506&origem=cockpit
```

Duas garantias do nosso lado, com teste automatizado (`scripts/testar-acoes-pwa.js`, 34
checagens): só `http(s)` absoluto vira destino — `javascript:` e link relativo são recusados
— e o telefone vai sempre só com dígitos.

---

## 3. Quem é dono de cada ação depois da transição

A regra que o Julyan definiu: **cadência, cobrir funil e o que acontece na rota vão para o
app. Fica no Cockpit o que é decisão de gestor.**

### Vão para o app (o Cockpit só aponta)

| ação | como está hoje no Cockpit | depois |
|---|---|---|
| ligar para o cliente | link `tel:` | abre no app, que registra a ligação |
| mandar WhatsApp | link `wa.me` | abre no app, com o registro do toque |
| navegar até a parada | Maps | rota no app, com check-in |
| sequência de paradas do dia | Maps com waypoints | rota do dia no app (`navegar-rota`) |
| desfecho da visita | não existe (o HubSpot só diz que a tarefa fechou) | **só o app pode capturar** — lista curta e fechada, no momento em que a pessoa sai do cliente |
| próximo passo depois da visita | nota escrita à mão | app, no mesmo gesto do desfecho |

### Ficam no Cockpit

| ação | por quê |
|---|---|
| corrigir MRR de um negócio | decisão de gestor, com trilha |
| importar lote de contas-alvo | decisão de gestor |
| aprovar/atribuir fila de prospecção | decisão de gestor |
| sugerir plano do dia para alguém | é conversa de Daily, não de rua |
| mudar etapa do funil | continua nos dois: gestor no Cockpit, executivo no app |
| a promessa das 9h30 | ritual de reunião |

### Já resolvido dos dois lados

- **Porta única de escrita:** `POST /api/negocio-acao` com um campo `op`
  (`mudar-etapa` · `nota` · `tarefa-rota` · `mrr` · `sugestao-gestor`). Manda um `op` errado
  e ela devolve a lista das aceitas. `POST /api/criar-nota-negocio` **continua funcionando**
  como apelido — nada que o time do PWA escreveu quebrou.
- **Fila pendente:** `POST /api/fila-pwa` está no ar. É o que faz a Daily parar de tratar
  ausência como zero. Contrato no §4 do `docs/pwa-para-cockpit.md`.
- **Autenticação:** a mesma sessão do Supabase que o Cockpit usa. Toda escrita valida sessão
  no servidor; o token do HubSpot nunca sai do servidor.

---

## 4. O que ainda depende de decisão

1. **Onde o app escreve o que é cobrança.** Direto no HubSpot (como o Expogo faz) é simples,
   mas o Cockpit só vê o que deu certo. Pela porta única, passa a existir um log só, uma
   regra de permissão só, e o Cockpit sabe o que o app *tentou* fazer.
   *Recomendação: porta única para o que é cobrança (próximo passo, mudança de etapa),
   direto no HubSpot para o que é volume (nota, foto, check-in).*
2. **Plano do dia escrito por dois lados.** Se o app passar a gravar o plano, as duas pontas
   escrevem a mesma tabela. Precisa de `origem` e `atualizado_em`, e da regra dita em voz
   alta: quem escreve por último vence, e a tela mostra a origem.
3. **Espaço na Vercel.** O plano Hobby tem teto de 12 funções. Estamos em **10**, com 2
   livres — a consolidação existiu para isso. Rota nova precisa passar por essa conta.

---

## 4b. O risco maior da fusão: dois números para a mesma pergunta

Na captura da tela de gestão que já existe no app (31/08, aba "Time · Onde eu ajo hoje?"),
os números não são os nossos. Mesma pergunta, respostas diferentes:

| executivo | "abertos" no app | em aberto no Cockpit |
|---|---|---|
| Kelly | 7 | **30** |
| Bruno | 6 | **27** |
| Amanda | 18 | **20** |
| Marco | 13 | **20** |
| Wericles (aparece como "Whell Andrade") | 5 | **17** |
| Sandro | 11 | **10** |
| **time** | **115** no topo | **124** |

Três coisas a resolver **antes** de as duas telas ficarem lado a lado no mesmo app — não
depois, porque quando um gestor vê 27 numa aba e 6 na outra, ele para de confiar nas duas:

1. **O que conta como "em aberto".** No Cockpit é deal nas seis etapas abertas do pipeline
   Field Sales — Prospecção 16 · Visita 51 · Conversa com Decisor 21 · Demo/Proposta 11 ·
   Negociação 19 · Ag. Pagamento 6 = **124**, e a soma por executivo fecha com esse total
   (30+27+20+20+17+10). Se o número do app é outro recorte (criados no período, com
   atividade recente, outro pipeline), o rótulo tem que dizer qual — ou os dois têm que usar
   o mesmo.
2. **O topo do app não fecha com a própria tabela dele.** 115 no hero, e a coluna por
   executivo somando bem menos que isso nas linhas visíveis (há um "Mostrar 8 sem atividade"
   recolhido). Pode ser recorte diferente entre hero e tabela; vale checar, porque é o mesmo
   defeito que a gente caçou aqui — dois recortes com um rótulo só.
3. **Quem é do time, e com que nome.** O app dá linha de executivo ao Julyan (4) — o
   Cockpit trata gestor como gestor, e isso muda toda média por pessoa. E chama o Wericles
   de "Whell Andrade": nome que o time não usa vira dúvida de "quem é esse?" na Daily. Os
   dois lados leem o mesmo HubSpot, então o nome pode vir de lá em vez de ser digitado.

**Como eu proporia resolver:** uma fonte só para os números de gestão. O Cockpit já lê o
HubSpot, já tem as definições escritas e testadas, e vira a aba de gestão — então o app
mostra o Cockpit nessa aba em vez de recalcular. Se eles preferirem manter a tela deles, o
mínimo é publicar a definição de cada número e conferir uma vez por semana, porque duas
contas para a mesma pergunta divergem sempre — a única dúvida é quando.

---

## 5. Como testar sem app nenhum

```bash
node scripts/testar-acoes-pwa.js
```

34 checagens (o número que o script imprime), sem rede e sem navegador: desligado não mexe em nada · base inválida é
recusada · o link leva tipo, telefone, negócio, cliente, coordenada e dono · o clique é
interceptado na captura e cancela o destino antigo · desligar em tempo de execução devolve o
comportamento antigo.

Para ver na tela antes de existir app, com o preview local aberto:

```js
DATA.pwa = { deepLink: 'https://app.exemplo/acao' };
```

A partir daí, todo "Ligar", "WhatsApp" e "rota →" abre o link do app em vez do destino
antigo — e o `title` de cada um passa a avisar que a ação abre no app de campo.
