# Decisões do Gestor v2 · Pessoas (a semana de gestão do líder)

Handoff `design_handoff_gestor_v2` (01/11/2026). O README do handoff é a fonte da verdade; aqui ficam as
escolhas feitas onde ele não decidia, ou onde o código existente mandou de outro jeito. O Território
(estados `t*` do protótipo) não entra nesta rodada.

## Etapa 0 · o inventário: tudo o que a Pessoas mostra hoje (antes de mexer)

Levantado no `template/cockpit.template.html` em 02/11/26, na ordem em que aparece na tela.

| # | Item de hoje | Onde está no código | Depois (v2) |
|---|---|---|---|
| 1 | Cabeçalho "Pessoas · como cada um está e onde eu ajudo" e o botão **Comunicados** (com "N sem ler") | `GV2.render.pessoas` | Cabeçalho "Pessoas · seg dd/mm · a sua semana de gestão · N pessoas · X plenos e Y novatos"; o botão **Comunicados** fica no cabeçalho, igual |
| 2 | **Onde o seu tempo rende esta semana** (até 3 cartões: Ir a campo, 1:1, Cobrar quentes) | `GV2.v5Rende` | Vira os **4 contadores** "Minha semana de líder" (1:1, idas a campo, reconhecimentos, combinados conferidos) e a coluna **o que precisa de mim** da placa (1:1 → campo → reconhecer → fase). O "Cobrar quentes" vai para a coluna **sem passo** da placa (abre o funil da pessoa) e para o bloco **Funil** da página ("Cobrar os N") |
| 3 | **Placar da semana** "Como o time se vê · melhor da semana · 1º leva R$ 250", "Como a pontuação é feita", "Ver o ranking completo" | `GV2.render.v6Placar`, gaveta `v6gav:pontos` e `v6gav:ranking` | **Sai da Pessoas e vai para o Hoje do gestor** (mesma função `placar_da_semana`, mesmas gavetas). Na Pessoas fica a pílula "ranking e disputa da semana ficam no Hoje ›" |
| 4 | **Resultado do mês** (ranking por MRR, "Todas as vendas do mês") | `GV2.render.v7Mes`, gaveta `v6gav:vendas` | Também é ranking: **vai para o Hoje**, logo abaixo do placar (mesma `vendas_do_mes`) |
| 5 | A lista **O time · N · pela necessidade de coaching** | `GV2.v5Coaching` + lista em `render.pessoas` | **A placa do time**: uma linha por pessoa, com o que precisa de mim, missão, na rua, sem passo, app e a ação. O motivo de coaching (`v5Coaching`) continua calculado e aparece no Agora/pauta |
| 6 | Página da pessoa · cabeçalho (nome, praça, "1:1 há N dias", status ao vivo) | `GV2.render.v5Pessoa` | Cabeçalho do **painel largo** (nome, fase · praça, último 1:1, abriu o app esta semana) |
| 7 | "Conquistou desde o último 1:1" e "abriu esta semana: sim/não" (DV2) | `DV2.linhaDoGestor` | Parte 1 da **Pauta do 1:1 pronta** e o "abriu o app" do cabeçalho e da placa |
| 8 | Resumo de 5 números (Hoje · Semana · Mês · Quentes · Travados), cada um abre a gaveta | `v5Pessoa` (resumo v8) | **Resumo de 5 (Hoje · Mês · Ritmo · Disciplina · Carteira)**, o clique leva ao bloco. Semana → bloco Ritmo (a semana em 5 células); Quentes e Travados → bloco Funil (os mesmos `v8neg:quentes/travados/mes`) |
| 9 | Funil do mês contra o esperado (barras, gargalo, passos, "funil completo →", "disciplina →") | `v5Pessoa` (funil8) | Bloco **Funil** (o funil contra o time e os atalhos) e, inteiro, em "A página de antes, inteira" |
| 10 | 1 · Agora e semana (onde está, jornada, Ver o dia na Rua, os dias da semana) | `v5Pessoa` (b1) | Bloco **Agora** (paradas de hoje com prova, âmbar quando passou da hora, "Ver na Rua") e **Ritmo** (os 5 dias, futuro tracejado, feriado escrito) |
| 11 | 2 · Rua · 7 dias (fotos, pinos movidos, lead criado na hora, contatos) | `GV2.render.v6Rua7` | Seção **Rua · 7 dias** abaixo das duas colunas do painel (o mesmo componente) |
| 12 | 3 · Coaching (pauta pronta de 3 itens, "Abrir a pauta do 1:1", Campo com o roteiro, Marcar/Confirmar ida, Rotação) | `v5Pessoa` (b2) | Coluna esquerda: **Pauta do 1:1 pronta** (4 partes) e **Registrar 1:1**; bloco **Campo** (próxima ida, roteiro, Marcar ida, Rotação, Campo completo) |
| 13 | 4 · Evolução (ritmo em barras, sem desfecho, portas sem como foi, decisor nomeado, funil contra o time, Playbook) | `v5Pessoa` (b3) | Blocos **Ritmo**, **Disciplina** e **Funil**; o Playbook no Ritmo e no Desenvolvimento |
| 14 | 5 · PDI (lista, vigente, "Anexar PDI") | `GV2.pdiBloco` | Bloco **Desenvolvimento** (linha PDI e "Anexar PDI", a mesma gaveta) |
| 15 | A voz da rua (notas da pessoa em 30 dias) | envoltório de `v5Pessoa` | Em "A página de antes, inteira" no fim do painel |
| 16 | Os 7 combinados da semana, aceite, rituais (marcar daily/simulação), ocorrências e "Registrar ocorrência" | `GV2.render.cbPessoa`, `cbGav` | Seção **Os 7 combinados** abaixo das duas colunas do painel (o mesmo componente e a mesma gaveta) |
| 17 | Habilidade do mês (escolha, resumo antes · meta · agora, semana a semana, mudar, desfazer) | `GV2.render.hbPessoa` | **Registrar 1:1** escolhe a habilidade (antes → meta); o componente inteiro fica na seção **Habilidade do mês** do painel; o resumo vai no bloco **Desenvolvimento** |
| 18 | Padrinho de / Rumo a líder de praça | `GV2.render.ldPessoa` | Seção **Padrinho e carreira** do painel; na placa, o novato mostra o padrinho na trilha |
| 19 | Gaveta 1:1: último 1:1 com Cumpriu/Não cumpriu, pauta de 5 min por item, "Combinar agora" com cartões editáveis, prazo, Automático/Você confere, + Combinado, Registrar com Desfazer 5 s | `GV2.p3UmAUm`, `v5Gav` | Continua inteira (botão "1:1 completo" na pauta). A Pauta pronta mostra os combinados com o resultado e o "Cumpriu/Não cumpriu" do manual |
| 20 | **Barra do pé** com **Pauta no WhatsApp** e a ação do momento | `GV2.p3Pe` | **Barra do pé do painel**: "Pauta no WhatsApp" (mesmo `pauta:wa`) + Registrar 1:1 · Aprovar fase · Marcar ida. A `p3Pe` segue nas gavetas |
| 21 | Gaveta Disciplina: reuniões sem desfecho com **Aconteceu · Remarcar · Não aconteceu** (RPC `reuniao_desfecho`), ver todas, antigas fora da cobrança, portas sem como foi, decisor nomeado, follow-ups de hoje, fila do app, Cobrar a disciplina | `GV2.p3Disciplina` | Bloco **Disciplina** mostra as 3 mais recentes com os 3 botões (mesma RPC) e "Cobrar a disciplina"; "Ver todas as N" abre a gaveta inteira |
| 22 | Gaveta Funil: Fechados, Provável, Variável, **Como contamos**, funil do mês, por etapa, Para puxar com Cobrar, carteira limpa (repetidos), nota mais recente | `GV2.p3Funil`, `GV2.v4Mes` | Bloco **Funil** (fechados × meta, variável, sem passo, o funil contra o time, prospecção, para puxar, "Cobrar os N") e "funil completo" abre a gaveta com o "Como contamos" |
| 23 | Gaveta Campo: próxima ida, rota do dia, roteiro, devolutiva (faz bem, mudar, combinado) | `GV2.p3Campo` | Coluna esquerda **Ir a campo** (dias, Marcar ida, "como foi" em 3 toques); a gaveta continua em "Campo completo" |
| 24 | Rotação de campo (folha lateral) | `GV2.render.rotacao` | Continua: link "rotação de campo" no topo da aba e botão no bloco Campo |
| 25 | Gavetas do v8 (Mês, Quentes, Travados) e o dia na Rua (`v5dia`) | `v8neg:*`, `v5dia:*` | Continuam, pelos botões do Funil e das células da semana |
| 26 | Fim da aba: grade dos 7 combinados do time | `GV2.render.cbTime` | Continua no fim da aba |
| 27 | Fim da aba: habilidade no fim do mês (veredito, próxima) e a gaveta | `GV2.render.hbTime`, `hbGav` | Continua no fim da aba |
| 28 | Fim da aba: Próximo líder de praça e "Indicar padrinho" | `GV2.render.ldTime`, `ldGav` | Continua no fim da aba |
| 29 | Fim da aba: O cliente que fica | `GV2.render.cfTime` | Continua no fim da aba |
| 30 | Fontes que não responderam (rodapé) | `GV2.faltaHTML` | Continua no fim da aba |
| 31 | Gaveta de Comunicados (lista, quem leu, lembrar, novo) | `GV2.render.v6Gav` | Continua (botão no cabeçalho da Pessoas e do Hoje) |
| 32 | Reconhecimento da sexta, Disputa da vez por praça e Previsão honesta | `GV2.render.rcHoje` (já no Hoje) | Ficam no Hoje; os destaques da sexta passam a alimentar o contador "reconhecimentos" e o "reconhecer" da placa |

A prova de que nada sumiu está em `scripts/testar-pessoas-v2.js` ("nada some: …") e na suíte do gestor
(`testar-gestor-v2.js`), que continua conferindo a página de antes inteira, agora dentro do painel.

## Etapa 1 · as funções

1. **Cinco funções puras, testadas sem tela** (`template/cockpit.template.html`, bloco "PESSOAS v2"):
   `semanaDoLider()`, `oQuePrecisaDeMim(p)`, `pautaDo1a1(p)`, `mapaDeCalor(p | null, lente)` e
   `mapaDeHorarios(p)`. Tudo lê `GV2.base` e os quadros que o Cockpit já lê; nenhuma leitura nova de tabela.
2. **"Sem passo" é `GV2.semProximoPasso(p.negocios)`**, a função única do Planejamento v3 que o Hoje do
   executivo e a fila do app usam (Ag. Pagamento fora, Prospecção dentro, vencido conta). A suíte roda a
   fixture do Hoje v3 (a mesma do app) e compara com a esperada do app.
3. **Missão, sequência, medalhas e "abriu o app" saem do `desenvolvimento_quadro(p_owner)`**, a mesma leitura
   que a linha "conquistou desde o último 1:1" já fazia (`DV2.gestor`), formatada pelas mesmas funções do
   DV2 (`missaoDaSemana`, `colecao`, `habilidadeDoMes`, `carreira`). A suíte usa a fixture do
   Desenvolvimento v2 (a mesma do app) e confere o texto contra a esperada.
4. **"Abriu o app esta semana"** é a contagem de `aberturas.semana` do quadro, que desde a 0241 conta só o
   Meu desempenho e a Desenvolvimento. A coluna diz APP e o título (tooltip) diz o que conta.
5. **Ordem do "o que precisa de mim"** é a do handoff: 1:1 atrasado (não teve nesta semana e passou da
   cadência de 7 dias, ou nunca teve) → campo (10+ sem próximo passo, sem ida na semana e sem campo há mais
   de 7 dias) → reconhecer (destaque da sexta ainda não reconhecido) → fase (a fase da rampa venceu). O
   corte de 10 sem passo é o mesmo número que a pauta usa como "o número que caiu".
6. **Os destaques da sexta** são os de `GV2.rcDestaques` (o mesmo cartão do Hoje); ganharam a lista de
   donos (`ids`) para virar pessoa na placa, sem mudar o cálculo.
7. **Combinados conferidos** = combinados do último 1:1 com resultado (cumprido ou não cumprido, automático
   ou marcado pelo gestor), sobre o total dos combinados do último 1:1 de cada um.
8. **A placa é do time**: `GV2.pv2Time()` tira a carteira do próprio gestor (`sessaoAtual.ownerId`).

## Etapas 2 a 4 · a aba

9. **Os contadores filtram a placa** (as outras linhas a 35%) e o mesmo clique desfaz; "mostrar todos"
   aparece no cabeçalho da placa.
10. **A placa ordena por necessidade** (1:1 → campo → reconhecer → fase → em dia), e quem já foi atendido
    na semana fica verde (`okSoft`).
11. **Reconhecer é inline**: a linha fica verde com "reconhecido · aparece no app dele". Grava pela função
    nova `reconhecer_destaque` (0244) e manda o recado para o sino do app (que já existe e já vira push).
    Sem a 0244, o recado segura e o reconhecimento fica marcado na sessão (avisar, não travar).
12. **O mapa de calor usa as visitas com prova da Praça** (`GV2.pxGlobal`: `visitas_com_prova` de 60 dias
    com bairro e coordenada do cliente), cortadas em 4 semanas. O mapa é o Google do Cockpit
    (`pt6CarregarGoogle`, o mesmo mapId e o mesmo `fitBounds` da Praça), com o calor desenhado num canvas
    por cima (o HeatmapLayer saiu da API do Google em 2026, a Praça já faz assim); sem o Google, a mesma
    projeção da caixa dos pontos.
13. **"Bairro sem visita"** = bairro com negócio aberto da carteira (o `lead.bairro` do HubSpot) e nenhuma
    visita com prova nas 4 semanas. Aparece tracejado no mapa e no fim da lista.

## Etapa 5 · a página da pessoa

14. **Painel largo** (1200 px em 1536, 1000 px em 1280, pelo corte 1366 da escala do build).
15. **A coluna da esquerda tem 3 modos** (Rampa · 1:1 · Ir a campo), escolhidos pelo que a pessoa precisa e
    trocáveis por um seletor no topo. O protótipo mostrava só um; com o seletor o gestor faz o 1:1 de quem
    também precisa de campo, e o novato também tem 1:1.
16. **Registrar 1:1 grava como o 1:1 já grava**: `um_a_um` (canal vídeo) com até 3 dos 7 combinados do
    time (`origem: 'os 7 combinados'`, `combinado: n`, prazo de 5 dias úteis), um recado no sino do app
    por combinado ("Aceite no app"), e a habilidade pelo `hbCombinar` (habilidades_mes), com os mesmos 5 s
    de Desfazer. "Dia planejado" o app confere sozinho (`plano_diario`); os outros o gestor confere com a
    prova da semana dos 7 combinados ao lado, na pauta.
17. **A habilidade no registro** mostra as 3 taxas em porcentagem (Sair com o dono, Virar demo, Fechar) com
    antes → meta (a meta padrão do Cockpit), a sugerida primeiro. O componente inteiro (com Volume, meta
    editável e "como treinar") continua no painel.
18. **A rampa** mostra as 4 fases com os nomes do app (DV2.FASES) e os critérios do banco (`GV2.RP`,
    `rampa_quadro`). Aprovar usa a gravação que já existia (`rp:ok` → `rampa_fases`), com a evidência e o
    motivo pedidos pela mesma validação; o drawer antigo tinha sido apagado, então o formulário ficou inline.
    A decisão do dia 45 só fica ativa no dia 45 (`rp:d45ok` → `rampa_decisao_d45`).
19. **Marcar ida**: a função nova `marcar_ida_do_gestor` (0244) põe a pessoa e o dia na rotação
    (`gestor_idas_campo.dia_por_owner`, status confirmada) e o "acompanhamento do gestor" na rota do dia
    dele (`field_routes.acompanhamento`). Não é parada de cliente: `field_route_stops` exige cliente, então
    o acompanhamento mora na rota do dia. Sem a 0244, o Cockpit grava a ida em `gestor_idas_campo` (o
    lugar em que a ida a campo já é registrada) e manda o recado "Acompanhamento do gestor" para o app.
20. **"Como foi" em 3 toques** grava onde a devolutiva de campo já é gravada: `um_a_um` com canal campo,
    a devolutiva `{como_foi, pesa}` e o combinado que sai dali; a ida vira "feita".
21. **"Ver como ele vê"** abre o Meu desempenho dele montado pelo mesmo DV2, só leitura, numa gaveta.
22. **O que estava na página e não tem bloco novo fica inteiro abaixo das duas colunas**: Rua · 7 dias, os
    7 combinados (aceite, rituais, ocorrências), a habilidade, padrinho e líder, e "A página de antes,
    inteira" (fechada por padrão).
23. **Um bloco que estoura vira o aviso dele** (`GV2.pv2Seguro`); o resto do painel e a aba continuam.

## Etapa 6 · o ranking e a Disputa no Hoje

24. O Hoje do gestor já tinha a Disputa da vez por praça (`rcHoje`), mas não o placar da semana (a Disputa
    dos R$ 250, `placar_da_semana`) nem o resultado do mês. Os dois foram para o Hoje, logo antes da
    Disputa da vez, com as mesmas funções e gavetas (`v6Placar`, `v7Mes`, "Ver o ranking completo",
    "Como a pontuação é feita", "Todas as vendas do mês"). As leituras repintam também no Hoje.
25. Na Pessoas fica só a pílula "ranking e disputa da semana ficam no Hoje ›", que abre o Hoje no placar.

## Etapa 7 · a medição

26. **A Pessoas** é medida como tela `pessoas`, origem `menu`; **a página** como `pessoa:{id}`, com a origem
    do clique (`placa`, `mapa` ou `link`). Uma por dia por sessão; a falha é engolida.
27. **A 0244** amplia as telas e as origens, cria a coluna `alvo` e recria `registrar_abertura` com a MESMA
    assinatura, desmontando `pessoa:{id}` em tela `pessoa` e alvo `{id}` (só o gestor grava essa tela).
    Antes de aplicada, a função de hoje recusa a tela em silêncio e nada é gravado.

## O que diverge das telas-alvo, e por quê

- **Alvos de 40 px**: as âncoras, os chips do mapa e as lentes têm 40 px de altura (no protótipo, 32 px),
  pela regra do alvo de clique.
- **Seletor da coluna da esquerda** (Rampa · 1:1 · Ir a campo): não existe no protótipo (decisão 15).
- **Âncora "Combinados e mais"**: leva às seções que vieram inteiras da página antiga (decisão 22).
- **Mapa**: o fundo do protótipo é ilustração; aqui é o Google do Cockpit, com os rótulos por bairro em
  cima. Os números de exemplo (Madureira · 148) são do protótipo; os reais saem das visitas com prova.
- **"km por dia"** é a distância em linha reta entre os check-ins do dia (não há rota percorrida no banco).
- **Bairro do dia** da ida é o bairro em que ele mais visitou naquele dia da semana nas 4 semanas (o
  Planejamento não guarda o bairro do dia como dado).
- **A placa nas telas-alvo** não aparece nos PNG (o renderizador do protótipo não desenha aquele
  `sc-for`); a implementação segue o README §4.2 e o markup do protótipo.

## Pendências declaradas

- **Aplicar a 0244** (`PWA-app-outbound`, branch `feat/pessoas-v2-banco`): até lá, a medição da Pessoas
  não grava, o reconhecimento fica só no recado e a ida vai para a rotação sem o acompanhamento na rota.
- **No app**: mostrar o reconhecimento no Meu desempenho (ler `reconhecimentos_da_semana`) e o selo
  "acompanhamento do gestor" na Agenda do dia (`field_routes.acompanhamento`). Hoje os dois chegam pelo
  sino (recado, que já vira push).
- **Suíte do Hoje v3 neste worktree**: `testar-hoje-v3.js` compara a fixture com `../PWA-app-outbound`; no
  worktree esse caminho é um atalho para um checkout antigo do app, e a comparação cai. Os mesmos bytes
  batem com o app de verdade (conferido por hash); no checkout principal a suíte passa.

