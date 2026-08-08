# Handoff: Cockpit Field Sales Takeat — Redesign completo (Gestor + Executivo)

## Overview
Redesign do Cockpit de Field Sales da Takeat (repo `julyanrib/cockpit-unificado`, hoje um `public/index.html` único servido na Vercel, dados de `data/*.json` gerados do HubSpot + Supabase para Daily/PDI/Avisos). Dois perfis com experiências distintas: **Gestor** (comandar o dia do time) e **Executivo** (saber o que fazer às 8h30 e assumir compromissos). A execução na rua continua no Expogo — o Cockpit é planejamento, direção e gestão. Desktop é a superfície principal (1440px de referência).

## About the Design Files
Os arquivos em `designs/` são **referências de design em HTML** (protótipos navegáveis — abra `cockpit-gestor-hi-fi.html` no navegador; eles usam `support.js` local para renderizar). **Não são código de produção para copiar.** A tarefa é **recriar estas telas pixel-perfect dentro do codebase existente** (`cockpit-unificado`), usando os padrões já estabelecidos lá (HTML/CSS/JS vanilla no `index.html`, tokens CSS, injeção de dados via `<script id="cockpit-data">`, filtro por papel via `sessaoAtual`/`filtrar()`), OU migrando para framework se o time decidir — mas o resultado visual e comportamental deve ser IDÊNTICO aos protótipos.

## Fidelity
**High-fidelity.** Cores, tipografia, espaçamentos, raios, sombras, estados de hover e copy são finais — recriar exatamente. Exceção: `drawers-nivel-3.html` e `desenvolvimento-executivo.html` estão em média fidelidade estrutural (aplicar o mesmo acabamento das demais telas ao implementar).

## Regras de produto (inegociáveis)
1. **Três níveis por tela**: Nível 1 = decisão imediata (acima da dobra, 900px); Nível 2 = aprofundamento (scroll); Nível 3 = detalhe operacional (SEMPRE em drawer de 480px da direita, nunca inline). Nenhuma tela mostra os três simultaneamente.
2. **Nenhum dado existente foi removido** — o que saiu da tela foi para drawer/expansão.
3. **Vermelho `#E51A31` só para ação e seleção.** Estado usa verde/âmbar/vermelho-de-estado como pill + texto, nunca fundo inteiro.
4. **1 bloco escuro por tela**: o banner preto do topo. Nada mais é escuro.
5. **Janela de tempo sempre rotulada** junto ao número (ex.: "taxa de avanço · semana", "janela: 01–07/08") — resolve as inconsistências entre telas.
6. Ícones **lineares SVG stroke 1.75, 16px** (os paths exatos estão nos HTMLs). Emoji só em celebração/gamificação (🔥 🏆 🎉 👋) — nunca como ícone de sistema.
7. Gestor e executivo têm navs diferentes (6 itens cada). Sem aba "Território". Não transformar índice de prioridade em probabilidade. Sem gráficos decorativos.

## Design Tokens
Cores:
- canvas `#EFE9DC` · superfície `#FDFBF0` · superfície-2 `#FBF6EC` · hover de card `#F7F0E0` · trilha de barra `#F3EDE0`
- bordas `#E4DBC6` (padrão) · `#F0E9D8` (linhas de tabela) · `#D8CFBA` (botões outline)
- escuro `#1A1613` (banner/nav ativa) · texto `#1A1613` · corpo `#3D362E` · secundário `#6E6558` · terciário `#A2937A` · terciário-no-escuro `#8A8072`/`#9C9284`
- vermelho ação `#E51A31` · hover `#C7142A` · red-soft `#FBEEF0` · vermelho-no-escuro `#FF6B78`
- verde `#1E7A63` · green-soft `#E9F4EF` · verde-no-escuro `#57C29A`
- âmbar `#B0782A` · amber-soft `#FBF1DF` · âmbar-no-escuro `#E0A64A`
- cores de etapa do funil: Prospecção `#E8A33D` · Visita `#4A7FC7` · Decisor `#7C6FE0` · Demo `#2FA88A` · Negociação `#D9668F` · Pagamento `#E51A31`
- azul só informação/links; links `#B0782A` → hover `#E51A31`

Tipografia: **Poppins** 600/700/800 para títulos e números (números com `font-variant-numeric: tabular-nums`, letter-spacing -.01em nos títulos grandes); **DM Sans** 400/500/700 para corpo. Escala usada: 9.5/10/10.5/11/11.5/12/12.5/13/13.5/14/15px UI · 20-22px títulos de banner · 26-28px KPIs · 40-42px hero.

Espaçamento: página com padding lateral 32px; gaps de grid 18px; padding de card 18-20px/22px; gaps internos 7-14px. Raios: 999px pills/botões · 18px cards · 11-13px sub-cards · 9-10px linhas · 6-7px checkbox/badges. Sombras: cards `0 1px 3px rgba(26,22,19,.05)`; card-decisão `0 4px 16px rgba(229,26,49,.1)`; CTA vermelho `0 4px 14px rgba(229,26,49,.4)`; drawer `-18px 0 44px rgba(26,22,19,.3)`; hover de card de pessoa `0 6px 18px rgba(229,26,49,.18)`.

## Chrome comum (todas as telas)
- Topbar 52px sticky: logo Takeat (`assets/logo-takeat.png`, 24px) · divisor · "Field Sales" · chip do papel (GESTOR/EXECUTIVO, 9.5px letter-spacing .1em) · nav em pills (ativa = pill escura; hover = `#F3EDE0`; badges vermelhos com contagem em Prospecção/Avisos) · direita: "✓ HubSpot · hoje 14h37" + avatar 30px vermelho com inicial.
- Banner escuro `#1A1613`: kicker 10px letter-spacing .12em cor `#8A8072` · título Poppins 800 22px · divisor vertical `rgba(253,251,240,.12)` · KPIs 28px com sublabel 11px · CTA vermelho à direita. Cada aba tem no banner a **pergunta que ela responde** (ver telas).

## Screens — Gestor
### 1. Cockpit (`cockpit-gestor-hi-fi.html`) — "Onde eu ajo hoje?"
- Banner: saudação "Boa tarde, Julyan 👋" + pill semáforo (ok/atenção/crítico: <15% / <35% / ≥35% dos abertos com SLA estourado) + KPIs: em aberto, fechados/meta, travados, taxa de avanço (com delta ▾), Dailies fechadas hoje + CTA "Conduzir a Daily →".
- Nível 1 (grid 1.2fr 1fr 1fr): **Funil por etapa** (barras horizontais 22px, contagem dentro da barra, % à direita, nota de gargalo em box `#FBF6EC`; clique na etapa → drawer com os leads) · **Leads quentes** (6 linhas: nome/dono/etapa/dias + pill "no prazo") · **Onde agir hoje** (card com borda 1.5px vermelha: 3 decisões numeradas com sub-explicação e CTA cada).
- Nível 2: **Tabela por executivo** (colunas: executivo c/ avatar-iniciais + praça + tag de alerta, abertos, travados colorido, Daily hoje, fechados, barra de meta 72×5px + n/10; hover `#FBF6EC`; **clique abre o drawer do dossiê**) · **Placar do mês** (17 clientes · R$ 5.497 MRR · 21% da meta + ranking 1º-4º, 1º com fundo `#FBF1DF`; linha expande clientes; MRR editável no detalhe) · **Planos do time hoje** (1 linha por executivo; quem não enviou em red-soft com "cobrar").
- Drawer dossiê (Nível 3): header escuro com avatar/nome/praça/abertos/meta + badge; blocos GARGALO (red-soft) e BOA PRÁTICA (green-soft); travados com SLA; compromissos do 1:1; rodapé com "Preparar 1:1 →" (vermelho) e "Cobrar Daily" (outline). Overlay `rgba(26,22,19,.32)`, fecha no X e no overlay.

### 2. Daily & Ritmo (`daily-e-ritmo-gestor.html`) — "Quem prometeu, quem cumpriu, quem está vazio?"
Funde Daily + Agenda. KPIs: Dailies fechadas 6/8, 3 agendas vazias, 14% da semana planejada. Nível 1: **Exceções primeiro** (card borda vermelha, 3 cards red-soft com "Cobrar plano →") · **Daily do time** em tabela 1-linha (prometido hoje, ontem P×R ✓/◐/✗, sequência 🔥, pontos, status pill; linhas pendentes com fundo `#FFF8F8`). Nível 2: **Grade da semana** (heatmap células 28px: `#1E7A63` 3+, `#57C29A` 1-2, `#F3EDE0` vazio, hoje-vazio tracejado vermelho) · **Pódio da Daily** + celebração ("Amanda completou semana cheia 🎉 → vira aviso com 1 clique").

### 3. Semana (`semana-gestor.html`) — "O que mudou e o que eu faço?"
Topbar direita mostra a janela. KPIs: 6 ganhos, 14→2 reuniões, 12 quentes; CTA outline "Compartilhar com o time". Nível 1: **A leitura da semana** (prosa 14px/1.7, editável) + **Como agir** (card vermelho, 3 ações numeradas). Nível 2: **Semana × anterior** (deltas 24px ▲▼ coloridos por bom/ruim) · **Ganhos da semana** com MRR · **Leitura por executivo** (1 linha, urgentes em red-soft; parágrafo no drawer).

### 4. Pessoas (`pessoas-gestor.html`) — "Quem precisa de mim no 1:1?"
KPIs: 2 PDIs vencidos, 3 sem plano ativo, 5/8 1:1 no mês; CTA "Agendar 1:1 →". Nível 1: **grid do time ordenado por urgência** — urgentes com borda vermelha + fundo red-soft + avatar vermelho + "Preparar 1:1 →"; em acompanhamento com card claro + "Abrir dossiê →"; ok em linha compacta. Cada card: gargalo OU boa prática + status PDI/1:1. Nível 2: **Roteiro de coaching** (pauta derivada do gargalo real; vira compromissos com checkbox espelhados no executivo) · **Arquivo** (PDI PDF, atas, gravações — só no drawer).

### 5. Prospecção (`prospeccao-gestor.html`) — "O que eu aprovo hoje?"
KPIs: 45 aguardando, 6 praças, 112 aprovadas; CTA "Aprovar seleção (45) →". Nível 1: **cards por praça** (contagem pendente âmbar; em dia = verde ✓) · **Fila de aprovação**: filtros em pills (Todas/praça/nota≥4,5/sem telefone), tabela com checkbox vermelho, nome + badge "sem telefone", praça, nota, avaliações, executivo, origem (TripAdvisor/iFood); rodapé com ações em lote "Aprovar seleção" / "Devolver p/ revisão". Nível 2: **Backlog aprovado** com barras de progresso por praça (SP 3/28 em vermelho) · nota sobre a ficha no drawer. Aprovadas viram visita obrigatória no Expogo.

### 6. Avisos (`avisos-gestor.html`) — "Quem ainda não leu o quê?"
CTA "＋ Novo comunicado". Lista estilo inbox: fixado com ícone de sino âmbar e prazo; contador "n/8 leram" (vermelho <50%, âmbar <100%, verde 8/8 ✓). Painel lateral **Leitura pendente** com avatar + "lembrar →" individual + regras (não-lidos primeiro; link de ação vira item de plano; >48h vira lembrete no Hoje do executivo).

## Screens — Executivo
### 1. Hoje (`hoje-executivo-hi-fi.html`) — "O que eu faço até as 9h?"
- Banner: "Bom dia, Kelly 👋" + diagnóstico em 1 frase ("Agenda vazia e **2 leads acima do SLA** — seu dia começa por eles.") + semáforo pessoal + CTA "Fechar meu plano do dia →".
- Nível 1 (1.15fr 1fr 1fr): **Suas 3 ações de hoje** (borda vermelha; checkboxes CLICÁVEIS: marcar → fundo green-soft, texto riscado, contador 0/3→3/3, CTA do banner vira "Plano cumprido 🎉"; as 3 viram o prometido da Daily) · **Ontem P×R** (3 barras 8px: visitas 2/3 âmbar, avanços 2/2 verde, propostas 0/1 vermelho + fecho em 1 frase que aponta a ação de hoje + rodapé 🔥 4d · 12 pts) · coluna com **Quentes e travados** (2 travados border-left vermelho c/ badge +Nd; quente em red-soft com "Fechar →") e **Começar a rota** (0 na rota · 3 sugestões · "Montar rota →" · "a rua continua no Expogo").
- Nível 2: **Seu mês** (card VERMELHO hero: 42px "2 fechados · R$ 977 MRR", barra de progresso branca, "3º de 8 no time", frase de empurrão) · **Ranking da semana** ("Você" em red-soft) · **Seu plano com o gestor** (compromissos do 1:1, 2/3 ✓, aberto com prazo; "ver tudo →" abre Desenvolvimento).

### 2. Minha Daily (`minha-daily-executivo.html`) — "Cumpri o que prometi?"
KPIs: 🔥 4d, 12 pontos, 3º no pódio; CTA "Fechar meu dia →". Nível 1: **Você contra o que você prometeu** (barras 10px hoje; visitas/avanços chegam sozinhos do HubSpot/Expogo — só confirma e comenta) · **Meu plano de hoje** (herdado das 3 ações; campo de texto "o que travou/rendeu" → insumo da leitura do gestor). Nível 2: **Sua semana** (5 células: ✓ cumpriu verde / ◐ parcial âmbar / hoje tracejado; clique abre registro) · **Pódio e conquistas** (+incentivo "feche hoje e complete a semana cheia 🏆 +15 pts").

### 3. Meu funil (`meu-funil-executivo.html`) — "Onde estou presa?"
KPIs: 21 abertos, 2 acima do SLA, 2/10; semáforo pessoal. Nível 1: **funil pessoal** (mesmas barras, SLA por etapa à direita, nota do gargalo) · **Travados — resolver primeiro** (borda vermelha; cada travado com 3 ações: Avançar / Registrar motivo / ＋rota; quente destacado com "Fechar hoje →"). Nível 2: **tabela dos 21 leads** (filtros por etapa; colunas lead/etapa/dias/próximo passo; dias acima do SLA em vermelho) · ranking com incentivo.

### 4. Rota & Agenda (`rota-e-agenda-executivo.html`) — "Minha semana está planejada?"
KPIs: 3 dias sem compromisso, 5 visitas, 3 na rota; CTA "Enviar rota pro Expogo →". Nível 1: **Buracos da semana** (hoje vazio = red-soft "Preencher →"; próxima semana = amber-soft "Planejar →") · **Sugestões ranqueadas 1-2-3** (travado SLA > quente > conta-alvo no mesmo bairro; adicionadas = pill verde "na rota ✓"; fora do eixo = tracejado com "＋ rota") · **Mapa da rota** mostrando SÓ a seleção (pins numerados vermelhos 30px + trajeto tracejado; NUNCA 100+ pins; produção usa mapa real filtrado). Nível 2: grade da semana (5 cards-dia; hoje tracejado vermelho com resumo da rota).

### 5. Prospecção (`prospeccao-executivo.html`) — "Quais contas eu ataco esta semana?"
Só a praça dela. KPIs: 5 novas, 18 backlog, 7/25 visitadas. Nível 1: **Novas desta semana** (5 linhas: nome, nota ★, avaliações, categoria, bairro; ações ＋rota/detalhe; já na rota = pill verde). Nível 2: **backlog** (tabela nome/nota/bairro/status: na rota hoje âmbar, virou lead ✓ verde, visitada verde, não visitada outline; filtro por bairro casa com a rota) · **Progresso de ataque** (1 barra + "3 viraram lead — 43%"; sem gráfico decorativo).

### 6. Avisos (`avisos-executivo.html`)
Não lidos primeiro com fundo red-soft + "Confirmar leitura"; aviso com ação ganha "＋ virar item do plano"; lido = ponto cinza. Regras no painel lateral.

### 7. Desenvolvimento (`desenvolvimento-executivo.html`) — NÃO é aba
Acessado pelo card "Seu plano com o gestor" no Hoje. Compromissos do 1:1 (checkbox espelhado com o gestor em tempo real) + PDI ativo (metas quantitativas calculadas do HubSpot, qualitativas marcadas no 1:1, vencimentos coloridos) + histórico de 1:1 em timeline + Arquivo no drawer.

### Drawers (`drawers-nivel-3.html`)
Especificação dos dois drawers canônicos: **Dossiê do executivo** e **Ficha do lead** (nome, etapa + SLA, mini-trilha do funil, última nota do HubSpot, contato/endereço, ações Avançar/＋rota/Registrar motivo, "Abrir no HubSpot ↗"). A ficha do lead é UM componente, reutilizado em quentes, travados, funil, prospecção e nos dois perfis (gestor ganha botão "cobrar executivo").

## Interactions & Behavior
- Drawers: 480px da direita, overlay `rgba(26,22,19,.32)`, fecham no X/overlay/Esc. Transição sugerida: 220ms ease-out (slide + fade do overlay).
- Hovers: linhas de tabela → `#FBF6EC`; cards clicáveis → sombra elevada; pills nav → `#F3EDE0`; botão vermelho → `#C7142A`; outline → borda `#1A1613`.
- Checkboxes das 3 ações (Hoje) e do plano: toggle otimista; ao completar 3/3 o CTA vira "Plano cumprido 🎉".
- "Fechar meu plano do dia" grava as 3 ações como prometido da Daily (Supabase). "Fechar meu dia" grava realizado + comentário.
- Todos os `cursor:pointer` nos protótipos indicam elemento acionável.

## State Management / Dados
- Fonte: `data/hubspot.json` (kpis, funil, funilLeads, temperatura, stageMeta c/ slaDays, vendasMes, agenda), `data/narrativas.json` (gargalo/boa prática/compromissos por ownerId), `weekly-raw.json`/`resumo-semanal.json` (janela, deltas, ganhos, leitura em prosa, como agir), `leads-referencia.json` (prospecção por praça), Supabase (Daily prometido/realizado, pontos, sequência, PDI/1:1, avisos + confirmações de leitura).
- Filtro por papel: manter o modelo atual (`filtrar()` — executivo só recebe os próprios dados; colegas viram resumo p/ ranking). NUNCA renderizar dado de colega no perfil executivo além de nome/fechados/pontos.
- Semáforo: pct = travados/abertos → ok <15%, atenção <35%, crítico ≥35%.
- Números que nos protótipos aparecem como exemplos plausíveis (P×R 2/3, pontos 12, PDI 38% etc.) vêm do Supabase — ligar aos campos reais, não hardcodar.

## Assets
- `assets/logo-takeat.png` (do repo, `public/assets/logo-takeat.png`).
- Fontes Google: Poppins (600,700,800) e DM Sans (400,500,700).
- Ícones: SVGs inline nos HTMLs (stroke 1.75, linecap/linejoin round) — copiar os paths.

## Files
- `designs/*.html` — 14 telas navegáveis (abrir `cockpit-gestor-hi-fi.html` e `hoje-executivo-hi-fi.html` primeiro; `support.js` local é o runtime dos protótipos, ignorar na implementação).
- Links entre telas já apontam para os nomes deste pacote.
