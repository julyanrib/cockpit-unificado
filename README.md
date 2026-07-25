# Handoff: Cockpit Unificado Field Sales — repaginação (identidade Takeat)

## Overview
Repaginação visual e de conteúdo do cockpit de Field Sales da Takeat (HubSpot + Daily), hoje em produção como um HTML único gerado por build (`template/cockpit.template.html`) e publicado na Vercel. Duas experiências no mesmo app: **gestor** (leitura do time, coaching, PDIs) e **executivo** (o próprio dia, Daily gamificada, leads da praça).

Três mudanças de produto além do visual:
1. A métrica de atividade **deixa de vir do Expogo/GPS** e passa a ser **prometido na Daily vs. realizado**.
2. A aba **Daily fica gamificada** (sequência, pontos, conquistas).
3. Entra a aba **Leads da praça** — sugestão automática de casas bem avaliadas fora do funil.

## About the Design Files
Os arquivos deste pacote são **referências de design feitas em HTML** — protótipos que mostram aparência e comportamento pretendidos, **não código de produção pra copiar**. A tarefa é **recriar estes designs no ambiente que já existe no repositório** (`cockpit-unificado`: HTML único com CSS em `:root`/classes, JS vanilla, dados injetados no build), usando seus padrões atuais. Não introduza framework, bundler ou dependência nova.

`Cockpit Takeat.dc.html` roda num runtime de componentes que usa estilos inline; isso é detalhe do protótipo. No repo, traduza para variáveis CSS + classes.

## Fidelity
**High-fidelity.** Cores, tipografia, espaçamento, raios, sombras e copy são finais. Recrie fielmente, com os tokens abaixo.

## Screens / Views

### Estrutura global (todas as telas)
- **Header** fixo, altura 62px, `background: var(--panel)`, `border-bottom: 1px solid var(--line)`, padding 0 22px, itens em flex com gap 18px. Da esquerda: logo Takeat (altura 24px) · divisor 1×22px `var(--line)` · "Field Sales" (Poppins 700, 13px) · "COCKPIT" (11px, 700, `letter-spacing:.08em`, uppercase, `var(--muted2)`). À direita: seletor de perfil (só demo — em produção vem do `role` da sessão), botão de tema (36×36, círculo, borda `var(--line)`, `☾`/`☀`), nome + cargo (12.5px/11px) e avatar 34px círculo `var(--red)` com iniciais brancas Poppins 800.
- **Nav lateral**: largura 208px, `var(--panel)`, `border-right: 1px solid var(--line)`, padding 18px 12px, gap 3px. Item: flex, gap 10px, padding 11px, `border-radius:12px`, min-height 44px, ícone 16px, label 13.5px. Ativo: `background: var(--red-soft)`, `color: var(--red)`, peso 700. Inativo: `color: var(--muted)`, peso 500, hover `background: var(--sunk)`. Badge à direita 11px/800. No pé, card `var(--sunk)` com "Dados · HubSpot + Daily, sincronizado …".
- **Main**: padding 26px 30px 44px, gap 22px em coluna.
- **Título de tela**: eyebrow 11px/700 uppercase `letter-spacing:.1em` `var(--muted2)` + `<h1>` Poppins 800 27px `letter-spacing:-.015em`.
- **Card padrão**: `var(--panel)`, `1px solid var(--line)`, `border-radius:20px`, padding 20px 22px, `box-shadow: var(--shadow)`.

### Gestor · Cockpit
- **Faixa de KPIs**: bloco escuro (`var(--dark)`), `border-radius:22px`, padding 22px 24px, grid `repeat(auto-fit,minmax(168px,1fr))`. Cada KPI: label 10.5px/700 uppercase `var(--dark-mut)`, número Poppins 800 34px, hint 11.5px. KPIs: Negócios em aberto 322 (−18 vs. semana passada) · Fechados no mês 62 (meta 90 · 69%, cor `#4FC49E`) · Leads travados 55 (`#FF6B78`) · **Aderência da Daily 84%** (204 informadas de 244 prometidas, `#E0A64A`) · Taxa de avanço 28% (+4pp).
- **Funil por etapa** (card 1.35fr): linha = nome (150px, 13px) + trilha 22px altura `var(--sunk)` `radius:8px` com barra colorida e contagem 11.5px branca alinhada à direita dentro da barra + conversão (78px, 11.5px, `var(--muted)`). Etapas: Prospecção 182 100% `#E8A33D` · Conversa c/ Decisor 99 54% `#6E7BF2` (54%→) · Demo/Proposta 57 31% `#2FA88A` (58%→) · Negociação 32 18% `#D97BA8` (56%→) · Ag. Pagamento 14 8% `var(--red)` (44%→). Abaixo, caixa `var(--panel2)` radius 12px com o diagnóstico em 12.5px.
- **Motivo de perda** (card 1fr): 32 perdas na semana; barra 6px. Preço 11 · Já usa concorrente 8 · Não achou o decisor 6 · Não operacionaliza delivery 4 · Sem interesse agora 3. Caixa de alerta `var(--red-soft)`.
- **Tabela "Por executivo"**: card com `overflow:hidden`; cabeçalho `var(--panel2)`, colunas `1.6fr .8fr .8fr .8fr .8fr 1.1fr` = Executivo · Abertos · Travados · **Visitas · Daily** · Fechados · Meta do mês. Linha: padding 15px 22px, `border-bottom 1px solid var(--line)`, hover `var(--panel2)`, clique seleciona. Avatar 32px (selecionado: `var(--red)`/branco; senão `var(--sunk)`/`var(--muted)`), nome 13.5px, praça 11px `var(--muted2)`, tag pill 10.5px. Coluna Visitas mostra `realizadas/prometidas` (13.5px) com a aderência embaixo (10.5px/800): ≥90% `var(--green)`, ≥75% `var(--amber)`, abaixo `var(--red)`. Travados: ≥7 vermelho, ≥4 âmbar. Meta: label `fechados/meta` + barra 6px (≥80% verde, ≥60% âmbar, senão vermelho).
- **Dossiê do executivo selecionado**: card com avatar 40px, nome Poppins 18px, botão "Abrir no HubSpot ↗" (pill, borda e texto `var(--red)`). Três caixas radius 16px: **Gargalo** (`var(--red-soft)`), **Boa prática a replicar** (`var(--green-soft)`), **Aderência à Daily** (`var(--amber-soft)`) — eyebrow 10.5px na cor do tema da caixa, texto 13px. Abaixo, duas colunas: "Plano da semana · compromissos" (checkbox 21px radius 7px; marcado = `var(--green)` com ✓ branco; texto 13px `var(--muted)`; rodapé "x/3 cumpridos · combinado no 1:1 de dd/mm") e "Leads travados agora" (linha `var(--panel2)` radius 13px, nome 13px, `etapa · Nd parado · SLA Nd` 11.5px, pill `+Nd` em `var(--red)`/`var(--red-soft)`).

### Gestor · Resumo semanal
Bloco escuro com "A leitura da semana" (eyebrow `var(--red)`) e parágrafo 17px `max-width:74ch`. Grid de 4 deltas (`minmax(215px,1fr)`): Fechados 21 (+4) · Visitas informadas 204 (−11) · Aderência da Daily 84% (−5pp) · Taxa de avanço 28% (+4pp) — número Poppins 30px, delta 12.5px colorido, hint 11.5px. Duas colunas: 🏆 Destaques e ⚠ Pontos de atenção, 2 parágrafos de 13px cada.

### Gestor · Leads da praça / Executivo · Leads da praça
Eyebrow "Sugestão automática · atualiza toda segunda"; botão "Enviar todos pro HubSpot ↗". Caixa explicativa (`var(--panel)`, radius 16px, 13px, `max-width:80ch`): a lista cruza nota e volume de avaliações públicas com os negócios já abertos no HubSpot; se alguém do time já tocou, o lead sai. Depois, por praça: título Poppins 16px + responsáveis 11.5px, e grid `minmax(320px,1fr)` de cards radius 18px com nome 14.5px, `tipo · 📍 bairro` 11.5px, pill verde `★ nota · N avaliações`, motivo 12.5px e ações "Criar negócio" (pill `var(--red)`, branco) / "Descartar" (pill com borda). Gestor vê as 5 praças (15 leads); executivo vê só a dele.

### Gestor · PDIs
Grid `minmax(330px,1fr)`. Card por executivo: avatar 32px, nome 14px, praça 11px, pill `✓ PDI n/total` (tudo feito = verde, nada = vermelho, parcial = âmbar) e a lista de compromissos clicáveis (checkbox 19px).

### Gestor · Coaching
Chips de executivo (pill 12.5px; ativo `var(--red)`/branco). Card do selecionado com avatar 44px e roteiro de 1:1 em 4 caixas radius 16px: **1 · Abrir pelo que foi bem**, **2 · Nomear o gargalo com dado**, **3 · Checar a aderência**, **4 · Fechar compromisso** (esta em `var(--red-soft)`, com a pergunta de fechamento).

### Executivo · Meu painel
- **Hero vermelho** (`var(--red)`, radius 22px, padding 24px 26px, texto branco): eyebrow "Seu mês" + pill "2º de 9 no time"; número Poppins 800 66px (fechados) + "de 10 fechamentos"; barra 10px branca sobre `rgba(255,255,255,.25)`; linha "💪 faltam 3 — e você tem 4 propostas em negociação". Rodapé com 3 métricas separadas por `border-top rgba(255,255,255,.22)`: **22/28 visitas — o que você prometeu nas dailies**, 31% taxa de avanço (+6pp), 41 negócios em aberto.
- **Fila de hoje** (bloco escuro ao lado): eyebrow "🔥 Sua fila de hoje" em `var(--red)` + contador "n de N feitos"; frase "Destravar os 2 mais atrasados já te coloca em 1º"; itens clicáveis (`var(--dark-fill)`, radius 14px, min-height 44px) com checkbox 22px (feito = `#2FA88A`, texto riscado, opacidade .5), nome 13.5px, `etapa · Nd parado · SLA Nd` 11.5px e pill `+Nd`.
- **Onde seu funil está preso**: mesmas etapas do gestor em escala pessoal (18/11/7/4/1), barras 10px, caixa de diagnóstico.
- **🏁 Ranking da semana**: lista com posição (Poppins 800 13px), nome 13.5px + praça 11.5px, fechados 14px. A linha do próprio executivo tem `background: var(--red-soft)`, borda `var(--red)` e números em vermelho. Ranking completo com nomes reais.
- **Seu plano com o gestor**: cards de compromisso (radius 15px; feito = `var(--green-soft)`).

### Executivo · Daily (gamificada)
- Cabeçalho com pill à direita: "Você contra o que você prometeu — não contra o time".
- **Faixa de jogo** (bloco escuro, grid `auto 1fr auto`, gap 26px): **Sequência** (número Poppins 44px + 🔥 26px, "dias batendo o prometido") · **Semana 30** com um quadrado 44×44 radius 14px por dia útil (dia batido = `rgba(255,69,87,.16)` com 🔥 e label `#FF6B78`; hoje = borda `var(--red)`; futuro = `var(--dark-fill)` com `·`) · **Pontos de hoje** (Poppins 44px, eyebrow `var(--red)`, hint "visita 10 · avanço 25 · proposta 40 · fechamento 100").
- **Prometido vs. realizado**: por linha, label ("Visitas — você prometeu 6"), pill de pontos ganhos (`+50`) e valor `5 / 6`, com barra 9px na cor do status (≥100% verde, parcial âmbar, zero vermelho). Caixa de fecho: "Você prometeu 6 visitas e fez 5 — mas as 5 renderam 2 avanços de etapa."
- **Fechar o dia**: chips do compromisso de amanhã (toggle; ativo `var(--red)`/branco), campo de nota de campo (`var(--panel2)`, radius 14px, min-height 76px) e botão "Enviar daily" (pill `var(--red)`, 14px padding, min-height 46px).
- **🏅 Conquistas**: grid `minmax(180px,1fr)`, 6 cards radius 16px — desbloqueado: `var(--red-soft)` + borda `var(--red)` + título `var(--red)`; bloqueado: `var(--panel2)`, borda `var(--line)`, opacidade .62, título `var(--muted2)`. São: 🔥 Sequência de 4 · 🎯 Palavra é palavra · ⚡ Destravador (desbloqueadas) · 🏆 Meta do mês · 📝 Daily de ferro · 🥇 Topo da praça (bloqueadas, com o critério na descrição).

### Executivo · Avisos
Lista de comunicados: card com `border-left: 4px solid` na cor da categoria, tag 10.5px uppercase, data 11px, título Poppins 16px, corpo 13.5px. Categorias: Comercial (`var(--red)`), Produto (`var(--green)`), Operação (`var(--amber)`).

## Interactions & Behavior
- Nav troca de view sem recarregar (o repo já faz isso em `activateTab`). "Leads travados" no menu do executivo aponta pro painel.
- Clique na linha da tabela / no chip de Coaching seleciona o executivo e atualiza o dossiê.
- Checkbox de compromisso do PDI: alterna e persiste (o repo já usa `localStorage` com `pdiStorageKey(ownerId)` versionado por `DATA.versaoAnalise`).
- Itens da fila de hoje: alternam para "feito" (risco no texto, opacidade .5, pill neutralizada).
- Chips da Daily: toggle do compromisso de amanhã.
- Tema: `data-theme="dark"` no `<body>`; persistir a escolha (o repo já tem o toggle).
- Hover: nav e linhas de tabela em `var(--panel2)`/`var(--sunk)`; botões vermelhos escurecem para `var(--red-dk)`. Transições curtas (120–160ms `ease`).
- **Responsivo**: abaixo de 900px a nav lateral vira barra inferior fixa (4–5 itens, ícone + label 10.5px, ativo em `var(--red)`), grids de 2 colunas viram 1, faixa de KPIs rola horizontalmente, alvos de toque ≥44px.

## State Management
- `role` ('manager' | 'rep') — em produção vem da sessão (`aplicarSessao`), não de seletor.
- `view` — aba ativa; gestor abre em Cockpit (Resumo Semanal na segunda), executivo em Meu painel.
- `theme` — 'light' | 'dark', persistido.
- `selectedRep` — índice/ownerId do executivo em foco (Cockpit e Coaching compartilham).
- `pdiChecks[ownerId][i]` — compromissos cumpridos, em `localStorage`.
- `filaChecks[dealId]` — leads da fila marcados no dia.
- `dailyPromise` — o que o executivo prometeu (visitas, avanços, propostas) + chips de amanhã.
- Derivados (calcular, nunca chumbar): aderência = realizadas/prometidas · sequência = dias úteis consecutivos com realizado ≥ prometido · pontos = 10×visitas + 25×avanços + 40×propostas + 100×fechamentos · conquistas a partir desses três.

## Design Tokens

### Claro (`:root`)
```
--bg:#EFE9DC   --panel:#FDFBF0  --panel2:#FBF6EC  --sunk:#F3EDE0
--ink:#1A1613  --muted:#6E6558  --muted2:#A2937A  --line:#E4DBC6
--red:#E51A31  --red-dk:#B01223 --red-soft:#FBEEF0
--green:#1E7A63 --green-soft:#E9F4EF --amber:#B0782A --amber-soft:#FBF1DF
--dark:#1A1613 --dark-ink:#FDFBF0 --dark-mut:#9C9284 --dark-fill:rgba(253,251,240,.07)
--shadow:0 18px 40px -26px rgba(26,22,19,.5)
```

### Escuro (`body[data-theme="dark"]`)
```
--bg:#141110   --panel:#1E1A18  --panel2:#242020  --sunk:#191614
--ink:#F5F0E6  --muted:#A99E8D  --muted2:#7D7365  --line:#332C28
--red:#FF4557  --red-dk:#E51A31 --red-soft:#2A1719
--green:#4FC49E --green-soft:#16241F --amber:#E0A64A --amber-soft:#251D12
--dark:#100D0C --dark-ink:#F5F0E6 --dark-mut:#8B8073 --dark-fill:rgba(245,240,230,.06)
--shadow:0 18px 40px -26px rgba(0,0,0,.8)
```

### Cores de etapa do funil (fixas nos dois temas)
`#E8A33D` Prospecção · `#6E7BF2` Conversa c/ Decisor · `#2FA88A` Demo/Proposta · `#D97BA8` Negociação · `var(--red)` Ag. Pagamento. Positivo em fundo escuro: `#4FC49E`; negativo: `#FF6B78`.

### Tipografia
- **Poppins** 600/700/800 — números grandes, títulos, nomes de card, avatares.
- **DM Sans** 400/500/700 — corpo, tabelas, labels.
- Escala: h1 27px/800/`-.015em` · KPI 34–66px/800/`-.02em a -.035em` · card title 15.5–16px/700 · corpo 13–13.5px · secundário 12–12.5px · label/eyebrow 10.5–11px/700 uppercase `letter-spacing:.09em`.
- Números sempre com `font-variant-numeric: tabular-nums`.
- `text-wrap: pretty` em parágrafos de diagnóstico.

### Espaçamento, raio e sombra
Espaçamento: 3 · 6 · 8 · 10 · 12 · 14 · 18 · 22 · 26 · 30 · 44. Raio: 7 (checkbox) · 12–14 (caixas internas) · 16–18 (cards menores) · 20–22 (cards e blocos) · 999 (pills). Sombra: só `var(--shadow)`.

## Assets
- `logo-takeat.png` — logo enviada pelo usuário; usar no header e no login. O template atual embute o logo em base64 no `<img>` do `loginGate`; substituir pelo arquivo real.
- Sem ícones de biblioteca: os ícones são emoji (🎯 📊 📍 ✅ 🎧 📣 📝 🔥 🏅 🏆 🥇 ⚡ 💪 ⚠ ★), decisão do time.

## Files
- `Cockpit Takeat.dc.html` — protótipo de referência (abre no navegador; `support.js` ao lado é o runtime dele, não vai pro produto).
- `Meu Painel.dc.html` — as duas direções exploradas para a aba do executivo (histórico da decisão).
- `PROMPT_CLAUDE_CODE.md` — prompt pronto pra iniciar a implementação.
- No repo, os arquivos a mexer: `template/cockpit.template.html` (todo o CSS/markup), `scripts/build.js` e `scripts/fetch-hubspot.js` (campos de aderência da Daily), `data/usuarios.json` (time atual), `data/leads-referencia.json` (novo).

## Pendências do produto (decidir com o Julyan)
- Sobrenomes reais de Michel, Wericles, Gleyson, Kelly e Ricardo (placeholders no protótipo).
- Fonte do sinal dos leads de referência (nota do iFood, Google, ou CEP da rota) — define o que dá pra automatizar.
- Todos os números do protótipo são fictícios, embora plausíveis; a implementação deve puxar do HubSpot e das dailies.
