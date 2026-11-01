# Planejamento do executivo · antes (v2) → depois (v3)

Inventário da aba como estava em 01/11/26 (`renderPlanejamento6a` + `pl6Ligar` + `GV2.PL7`), uma linha por
ação, número ou atalho, e onde cada um ficou na v3 (`GV2.PLV3`). A v2 inteira continua acessível com
`localStorage['planejamento-v2'] = '1'`.

Só três itens podiam sair sem lugar novo (README §8): "Enviar o plano ao gestor", o editor da palavra da
semana e o seletor de hora/horários sugeridos. Os demais que saíram estão marcados **SAIU (pendente)** com o
motivo, para decisão do dono do produto.

## Números

| Antes (v2) | Depois (v3) |
|---|---|
| KPI "Hoje" (plano x/y do dia, da mesma conta da Hoje) | Cabeçalho da coluna de hoje ("n de 6", barra, selo HOJE hh:mm) e a ordem do app nos cartões de hoje. O x/y continua na aba Hoje. |
| KPI "Visitas agendadas" (paradas na semana · meta com prova) | Faixa: "na grade N" (soma exata dos cartões dos dias úteis) + "semana: N visitas com prova". |
| KPI "Dias cobertos" (com feriado fora) | Faixa: "N de M dias cobertos" (feriado fora da conta). |
| Faixa "A sua palavra desta semana" (fechamentos, visitas, contas novas prometidas) | Faixa, só leitura: "semana: 30 visitas com prova · 2 fechamentos" (meta do sistema). |
| Cadência da carteira: % com próximo passo e "N de M sem próximo passo" | Contador da faixa "N sem próximo passo → 0" (a função única `GV2.semProximoPasso`, a mesma da Hoje e do Raio X). |
| Barra dos 5 grupos + legenda (quentes sem data, follow-up vencido, CNPJ novo, outros) | "cadência ▾" (chips: quentes sem data, passos vencidos ou que ficaram, sem lugar no mapa, média, aviso 1,5×, feitas ÷ plano da semana passada) e os filtros Quentes / mais › follow-up vencido / CNPJ novo · 90 d. |
| As 5 regras da semana (regra 1 quentes, 2 follow-up, 3 CNPJ novo, 4 dia com 6+, 5 todo negócio com passo) | 1 → bloco Quentes; 2 → selo "venceu …" e filtro follow-up vencido; 3 → filtro CNPJ novo · 90 d; 4 → barra e "n de 6" de cada dia; 5 → o contador. |
| Capacidade por dia (segmentos até a meta, "+N") e o mix do dia | Barra de 6 segmentos no cabeçalho do dia (âmbar abaixo, verde na meta, vermelho além) + "média 5,2" + aviso de capacidade em 1,5× a média (manter / mover N para …). O "mix" (tipos de visita do dia) **SAIU (pendente)**: a etapa aparece em cada cartão. |
| Contagens das faixas de cada propósito (todos, acima da régua, sem passo, com passo futuro, por etapa, ★4,5+, fontes…) | Os números dos filtros da fila (Sem passo, Quentes, Contas-alvo, follow-up vencido, CNPJ novo, Reciclagem, Ag. Pagamento, Relacionamento). As faixas finas (acima da régua, ★4,5+, por fonte, por etapa) **SAÍRAM (pendente)**: a fila ordena por dinheiro e a busca acha pelo nome. |
| "N de 55 sem endereço no CRM" (onde ▾) | Selo "sem lugar no mapa" na linha e no cartão, e o chip "sem lugar no mapa" da cadência. |
| Toques das 6 semanas (quadradinhos por negócio) | **SAIU (pendente)**: não está na prancha v3. Continua na ficha do negócio da v2 (flag). |
| Visitas "feitas com prova" / "não foi" nos cartões (dias que passaram) | Cartão "feito · check-in 09:40", "ficou para trás", "fora do plano · check-in" e o botão "plano 7 · feitas 4 / fora do plano 1" do dia. |

## Ações e atalhos

| Antes (v2) | Depois (v3) |
|---|---|
| Escolher a semana (chips "esta semana · dd a dd" / "próxima · dd a dd") | Segmentado "esta semana / próxima" + "semana de dd a dd/mm"; de sex 17h a dom abre na próxima com o selo "planejando: próxima semana". |
| Aviso "Você está montando a semana de …" | Selo "planejando: próxima semana · virou sex 17h…" / "esta semana · só leitura". |
| Propósito (Rua, Cobrar, Relacionamento, Follow-up, Conta nova, Funil, Cadência) | Filtro Sem passo · Quentes · Contas-alvo + mais (follow-up vencido, CNPJ novo · 90 d, Reciclagem, Ag. Pagamento, Relacionamento). "Prospecção de rua" (bloco de rua) ver abaixo. |
| Faixas dentro do propósito (faixa), "onde ▾" (lugar) e paginação de 6 | Lista única por dinheiro, com rolagem própria (até 120 linhas por filtro, com aviso de quantas faltam). |
| Achar conta pelo nome (busca em todos os propósitos) | "achar conta pelo nome" no "mais ▾": procura em todas as listas. |
| Selecionar a conta e clicar no horário livre (pegar/soltar, abrirdia, agendar) | Atalho "Pôr em qui 12/11" (1 clique), "Pôr num dia ▾" + dia (2 cliques), sugestão do dia ("+" ou "Pôr as 3"), arrastar para o dia. Todos por `pl6AgendarNoSlot` (HubSpot antes da grade). |
| "Pôr em ▾" (poremmenu/porem) no cartão da munição | "Pôr num dia ▾" com as 5 pílulas e "n/6". |
| Seletor de hora, minutos e "hora livre" (hora/min/horalivre), horário sugerido por faixa, "cheio" | **SAIU** (permitido: "a hora é do app"). O horário fixo vindo do app aparece "fixo 14:30 · no app". |
| Arrastar a conta para o dia (abria o seletor de hora) | Arrastar a linha para o dia agenda direto; prévia "SOLTAR AQUI · sem lugar no mapa"; feriado e dia passado recusam com o motivo. |
| Mover um cartão para outro dia/horário (mover) | "mover N para sex" do aviso de capacidade (tarefa muda de data no HubSpot e depois a grade). Mover um cartão avulso: tirar do dia (×) e pôr no outro. **Parcial**: não há arrastar cartão entre dias. |
| ✕ do cartão (tirar da semana) | × do cartão: sai do dia e volta para a fila (a tarefa do HubSpot não é apagada, como antes). A trava "tirar e arquivar o negócio criado aqui" **ficou só na v2 (pendente)**. |
| Bloquear horário (bloco) | **SAIU** junto com os horários (a grade da v3 é por dia, não por hora). |
| Bloco de rua (Prospecção de rua, duração 2h/…, ruadur) | **SAIU (pendente)**: blocos de rua já gravados aparecem como cartão "Bloco de rua · região"; criar um novo continua na v2 (flag) e no app. |
| Resultado do cartão (res/resmot/resalterar/resvoltar: feito, não foi + motivo) | "como foi" do dia que passou: plano × feitas com prova, o que ficou para trás volta para a fila com "repor" (próximos 3 dias) e "decidir". Marcar "não foi · motivo" à mão **SAIU (pendente)**: a prova vem do check-in. |
| "Como foi" do card (comofoi) | Botão "plano N · feitas N" do dia e o estado do cartão. |
| Abrir a ficha do negócio pelo cartão (ficha / pl6Ficha) e agendar pela ficha (fiagendar) | Clique no cartão de negócio da grade abre a ficha (a mesma do Meu funil); "Decidir ▾ › abrir a ficha do negócio" na fila. |
| Mudar a etapa pela ficha (pl6FiEtapa) e Perdido (pl7perder) | Decidir ▾ › "perdido · motivo" (passagem de etapa de sempre, motivo já marcado); as outras etapas pela ficha do negócio. |
| Decidir na Cadência (pl7decidir) e Reciclar 60 d (pl7reciclar) | Decidir ▾ › "reciclar · volta em 30 / 60 / 90 d" (mesmo hubspot-sync). |
| Ligar/WhatsApp como próximo passo | Ligar em ▾ (Ligar \| WhatsApp + 5 dias): tarefa com data no HubSpot, não ocupa porta (EXH4.gravar). |
| Montar a semana · propor N contas (pl7montar, tirar, descartar, confirmar) | "Dar data a todos · N": revisão no lugar da fila (grupos por dia + Ligar ou WhatsApp), "ter 10 ▾" e "×" por linha, propostas tracejadas na grade, "Confirmar N · cria N tarefas no HubSpot" / "cancelar a proposta". |
| Enviar o plano ao gestor (pl7enviar) | **SAIU** (permitido). O gestor vê o plano ao vivo. |
| Ajustar a promessa / editor da palavra da semana (promessa, #pm8Raiz) | **SAIU** (permitido). A meta é só leitura na faixa. |
| Região/bairro do dia (picker e campo digitado, pl6Regiao / pl6GravarRegiaoDigitada) | Botão do bairro no cabeçalho do dia → painel de 290 px (Automático + bairros da carteira e da munição, MAIS QUENTES, JÁ EM …), grava em `planos_semanais.regioes`. Digitar um território novo **SAIU (pendente)**: a lista vem da carteira e da munição ("nada é digitado à mão"). |
| Sugestões do dia livre (bairro + 3 contas) e "encaixar" | Bloco "SUGESTÃO · BAIRRO" de cada dia (uma conta só com o atalho da linha e o bloco Quentes), "+" por item e "Pôr as 3". |
| Mini mapa do dia (pl7mapa, rota, distâncias, "por perto · encaixar") | **SAIU (pendente)**: não está na prancha v3; a rota e o mapa estão no app. |
| Endereço que falta (pl6EndGravar: rua, bairro, cidade → HubSpot) | Cartão sem endereço: "pôr o endereço" → campo "rua, número, bairro" → "gravar no cadastro" (mesmo `gravarPropriedadesDoNegocio`). |
| Criar lead novo (Instagram, Maps, rua) | **SAIU (pendente)**: a v3 não tem o formulário; continua na v2 (flag) e no app. |
| Abas de dia do celular (diaaba) | Abaixo de 760 px a v3 empilha fila e grade e a grade rola na horizontal. **Parcial**: sem abas por dia. |
| Aviso "dados novos do time · atualizar" | Saiu desta aba: a grade repinta sozinha, por dia, e a pílula do topo diz "ao vivo · app e Cockpit" / "N mudanças esperando" / "salvo · no app". |
