# Hoje v3 · antes → depois

O que o Hoje do Cockpit e o dia do app faziam até 01/11/2026, e onde cada coisa ficou (ou por que saiu).
O mesmo arquivo está nos dois repositórios. "v2" = `localStorage['hoje-v2'] = '1'`, que devolve o anterior
nos dois lados.

## Hoje do Cockpit (executivo)

| Antes | Depois | Onde / por quê |
|---|---|---|
| Os 5 números da Pessoas do gestor (Plano hoje, Semana, Mês, Porta → decisor, Sem próximo passo) | sai do Hoje | Desenvolvimento (botão "abrir a Desenvolvimento" no placar); o "Sem próximo passo" virou o bloco do meio |
| "O seu gestor vai te chamar por" | sai | Desenvolvimento (linha do 1:1) e "Quem precisa de você" do gestor |
| As 5 regras numeradas ("N de 5") | sai | regra 1 → bloco "Plano de hoje"; 2 e 3 → "Sem próximo passo N → 0" (quentes primeiro); 4 (ficha) → app (toast pós-visita e fecho); 5 (fechar o dia) → fecho do app e "Fechou o dia ontem" no placar; "vencem hoje" no plano |
| Sem próximo passo (lista com tipo + data, 5 s para desfazer) | fica, como o componente do Planejamento v3 | bloco do meio: atalho "+ Pôr em …", Pôr num dia, Ligar em, Decidir; mesma função `GV2.semProximoPasso` |
| Disputa da semana (placar do R$ 250, a corrida, o que o dia ainda vale) | resumida | bloco "Placar do dia": pontos da semana e "Faltam N pts para passar X." (a conta da semana do Desenvolvimento v2); a corrida completa está no Desenvolvimento |
| Leads quentes | dentro do Sem próximo passo | os quentes sem data vêm primeiro na fila por dinheiro, com o selo QUENTE |
| A fila "o que eu faço agora" (h8, 4 itens, "ver a fila toda") | sai | Tarefas do app (o bloco do plano tem "abrir no app") |
| "Pronto pra rua?" / o meu dia / o amanhã à noite | sai | folha da manhã do app; o plano de hoje fica no bloco 1 |
| Meu mês | sai | Desenvolvimento (escada do variável) |
| Copiar resumo para o gestor | sai | o gestor lê o mesmo dia na Rua e na Pessoas |
| Pílula "Missão · Na rua" no topo | dentro do placar | "Na rua há N dias" e "Missão n de m" |
| — | novo | selo "o mesmo dia do app · ao vivo"; "Sem expediente hoje" no feriado e no fim de semana; medição `hoje_cockpit / aberto` |

## O dia no app

| Antes | Depois | Onde / por quê |
|---|---|---|
| FolhaPlanoDoDia ("Vamos? / Confirma?") na 1ª abertura até as 19h | FolhaManhaV3 "seu dia em 30 segundos", só até as 10h e em dia útil, e pelo push das 8h | plano, vencem hoje, sem próximo passo (o mesmo número do Cockpit) com "Pôr em …"; "Montar o dia" é o de sempre |
| "Agora não · a linha fica âmbar e às 9h00 o gestor vê" | "depois" | avisar, não travar |
| Antes da rua (quentes esfriando) | fica | sobe depois da folha da manhã, como antes |
| Pílula de baixo (próxima porta, "x hoje", "sem prova") | fica, + "passo vence hoje" | e a pílula-placar nova no topo, na faixa da vez |
| Cheguei → a ficha abre na hora | Cheguei → toast "+3 pts · sequência" 1,4 s → a ficha | o +3 só quando o placar conta |
| Ficha "como foi" | fica igual | depois de fechar: toast do passo salvo ou "ficou sem próximo passo" com chips de 1 toque |
| Entre portas, faixa da vez, LinhaDoDia pendente | ficam | a pendência ganha da pílula-placar |
| FolhaFechoDoDia às 18h quando o app volta para a frente | FolhaFechoV3 pelo push das 18h ou "fechar o dia" na pílula | lista do dia, chips nos pendentes, "fechar mesmo assim", check-out com recompensa; grava o mesmo `fecho_do_dia` |
| Aba Tarefas: "Sem próximo passo = vencido + nunca marcado" calculado na tela | o mesmo número, por `semProximoPassoDaFila` | uma função para a tela, a folha e o push das 8h, com paridade com o Cockpit |
| Pushes da fila 08:30 · 12:30 · 17:30 · 18:05 | ficam; + 08:00 e 18:00 do Hoje | o das 18:05 não vai a quem recebeu o fecho das 18h |
| Meu desempenho, Desenvolvimento v2 | ficam | o selo "abriu esta semana" passa a contar só as telas dele |
| O mapa (lentes, pinos, rota) | não muda | o selo "vence hoje" no pino não entrou (ver DECISOES 16) |
