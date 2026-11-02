# Antes → depois · Desenvolvimento v2 (01/11/26)

O que a aba **Desenvolvimento** do executivo (Cockpit, GV2.DV de 07/10) e o **Meu desempenho** (app, aba Eu)
mostravam antes, e onde cada item ficou. Os únicos que podiam sair sem lugar novo (PROMPT, "Prove que nada
se perdeu") são os 5 números repetidos do Hoje e os blocos vazios. **As duas telas antigas continuam
inteiras** atrás de `localStorage['desenvolvimento-v1'] = '1'` (Cockpit) e
`localStorage['meu-desempenho-v1'] = '1'` (app).

## Cockpit · aba Desenvolvimento

| Antes (v1, espelho do 1:1) | Depois (v2) | Por quê |
|---|---|---|
| Topo "Antes do seu 1:1": a data do 1:1 | Bloco 1, **1:1 em uma linha** ("Seu 1:1 é segunda 16/11 08:30 · leve: …"), abre a lista | README §4.1 |
| Frase do agora (a prioridade nº 1) | **Missão da semana** (bloco 3) e "o próximo a passar" (bloco 2) | a prioridade da semana virou uma missão só |
| Os 5 cartões (Hoje, Semana, Mês, Porta → decisor, Sem desfecho) com a tendência de 4 semanas | **Saem** — continuam no Hoje do Cockpit (os mesmos 5) | permitido: os 5 números repetidos do Hoje. A tendência da semana vira "sua melhor semana" em Você contra você |
| "O que combinamos" com "Fiz a minha parte" | Vazio: **sai** (permitido). Com combinados: a linha do 1:1 leva o que a pessoa conquistou; o "Fiz a minha parte" segue na v1 | README §1 ("O que combinamos" vazio sai); o veredito dos combinados é do Cockpit do gestor |
| Recados do gestor (7 dias) | Chegam por push (push-fila `recado`) e ficam em Avisos do app; no Cockpit, na v1 | os recados já viram push desde 19/10 |
| Sua disciplina: reuniões sem desfecho (Aconteceu · Remarcar · Não aconteceu) | **Sai** desta aba (README §1, "Sua disciplina em vermelho … sai"): o número fica no cartão "Sem desfecho" do Hoje; fechar fica na Agenda do app (Sem desfecho) e na v1 | a aba deixou de cobrar |
| Portas sem "como foi" (7 dias) | **Missão "Registro na hora"** quando é o hábito mais longe do time; a ficha continua no mapa | a cobrança virou missão com prova |
| Decisor nomeado / falou com o decisor (mês × time) | **Habilidade do mês** ("Sair com o dono": antes, meta, agora) e a sugestão do maior gap | a mesma taxa (habilidade_quadro) |
| Fila do app (Feito em 7 dias) | **Sequência "Fila zerada"** (bloco 4) e a medalha "Fila zerada 5 dias" | fila zerada antes das 18h |
| Um hábito para esta semana (você × time, alvo) | **Missão da semana** (bloco 3), escolhida pelo hábito de maior distância para o time | README §4.3 |
| Treino de 5 min (roleplay) e página do Playbook | **Playbook como nível** com "fazer o quiz" (bloco 7); o treino segue na v1 | ler sem quiz não sobe |
| Seu PDI (anexo) | **Sai** (vazio para todos) | permitido: bloco vazio |
| Rodapé: Playbook nível e dias parado, "Continuar a trilha" | Bloco 7: "Playbook · nível N de T", segmentos e o próximo capítulo; selo "Playbook nível N" no cabeçalho | README §4.7 |
| "Como contamos" | A nota de cada bloco ("ponto só nasce de prova…", "a chama só apaga…", "comissionamento.json") | sem textão |
| Fonte e horário do dado | "— · <fonte>" em cada bloco que cair; rodapé do mês diz a fonte | regra 8 |
| (não existia) | Semana · disputa dos R$ 250 com pódio e o próximo a passar; sequências; escada do variável; carreira (rampa, pleno, líder com os 4 critérios); coleção com o reconhecimento da sexta; você contra você | o jogo da carreira |

## App · Meu desempenho

| Antes (v1) | Depois (v2) | Por quê |
|---|---|---|
| Habilidade do mês (MinhaHabilidadeCard: a taxa e as 4 taxas contra o time) | Bloco 6 **o chefão** (antes, meta, agora, barra) e, sem habilidade, o convite com o maior gap contra o time | a mesma habilidade_quadro |
| Variável de novembro (R$, contratos, faixa, próxima venda, degrau) | Bloco 5 **a escada** (um degrau por venda, agrupado por faixa, "A 6ª venda muda a faixa: +R$ 550", R$ do mês no rodapé) | as mesmas faixas do comissionamento |
| HOJE (x de 6 visitas provadas) | **Sai** — é número do Hoje (o x de y da Agenda e do Hoje) | permitido: os 5 números do Hoje |
| SEMANA (placar do bônus: posição, vendas, demos, visitas, regra) | Bloco 2 **a semana**: pontos, posição, pódio, o próximo a passar com a menor ação, a regra em chips | README §4.2 |
| MELHOR DA SEMANA (vizinhos no ranking e a folha do ranking) | Pódio e "o próximo a passar"; o ranking completo abre por "a disputa completa" (a mesma FolhaRanking) | regra 3: nesta tela não há lista completa |
| HISTÓRICO (7 dias, 5 semanas, 5 meses em barras) | Bloco 9 **você contra você** (melhor semana, recorde de sequência, mês × mês) e a tira dos 5 últimos dias úteis nas sequências; as barras seguem na v1 | a evolução sem gráfico de cobrança |
| Linhas da aba Eu (Planejar a semana, Playbook, Recém-abertos, Gestão, Avisos, Ajustes e sair) | **Iguais**, no fim da tela | nada mudou |
| (não existia) | 1:1 em uma linha, missão, sequências, carreira, coleção, toast de conquista, pílula no Hoje, pushes de segunda e sexta | o jogo da carreira |
