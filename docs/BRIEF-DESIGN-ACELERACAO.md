# Brief para o design — Acelerar o Field Sales

**Pedido:** Julyan (gestor de Field Sales), 30/10/2026
**Base:** a auditoria do app e do cockpit contra o plano "Acelerar o Field Sales" (The Sales Acceleration Formula, Mark Roberge)
**Onde vive:** cockpit do gestor (GV2) e, em dois casos, o app do executivo

## Regra número 1: o cockpit atual fica como está

Julyan, 30/10: **"o cockpit já tá pronto, não vamos perder"**. Este brief **não** pede redesenho das telas atuais (Hoje, Rua, Funil, Território, Pessoas, Propostas, Playbook, Acessos, Prova dos números). Tudo o que está abaixo entra assim:

- **abas novas** no menu do gestor (ex.: "Contratação", "Rampa");
- ou **cartões e linhas novas** dentro de uma aba que já existe, no mesmo estilo que ela já usa.

Nada sai, nada muda de lugar e nenhum fluxo existente é refeito. Se alguma proposta exigir mexer numa tela pronta, ela volta para o Julyan decidir antes de seguir.

**Já entrou no código em 30/10, sem precisar de design:** o "Quem precisa de você" do Hoje ganhou quatro linhas (1:1 atrasado, visita sem ficha, não fechou o dia, carteira de quem saiu), e a aba Acessos ganhou o cartão "Carteira de quem saiu". O design não precisa desenhar essas partes de novo, só manter o padrão das linhas que já existiam.

## O problema em uma frase

O canal tem método (playbook, funil inverso) e ferramenta (app e cockpit), mas o maior gargalo é **gente e comportamento**. Desde junho, 14 executivos foram contratados e 5 saíram, 3 deles antes de 60 dias. O cockpit mostra bem o funil e a rua. Não mostra **quem entra**, **como cada novo está na rampa**, **se o coaching está acontecendo** nem **se o cliente vendido fica**.

## O que já existe e não deve ser refeito

- **Pessoas:** fila por necessidade de coaching, 1:1 com combinados, PDI, disciplina, campo, funil por pessoa contra o time.
- **Funil:** funil por pessoa, com o gargalo calculado pelo funil inverso.
- **Hoje:** "Quem precisa de você".
- **Território:** abastecer, decidir, radar de leads.
- **Acessos:** criar e tirar acesso, com a passagem dos leads `clients`.
- **App:** fecho do dia às 18h, "Antes da rua", fila de tarefas com "sem próximo passo", Meu desempenho, placar e "Combinados com o gestor".

**Dado de uso (30/10):** os 1:1 registrados vão de 05/10 a 14/10 e nada depois; o último PDI é de agosto; a pauta do líder não tem nada depois de 02/10. As ferramentas existem e pararam de ser usadas. Parte do trabalho é fazer o cockpit **cobrar o gestor** também.

---

## Prioridade 1 — Contratação (área nova no cockpit)

Hoje não existe nada: nenhum candidato, vaga, entrevista ou indicação.

**O que o gestor precisa fazer na tela:**
1. Abrir uma **vaga** (praça, quantas pessoas, data de início da turma).
2. Ver o **funil de candidatos** por etapa: fonte → triagem → entrevista e simulação → meio dia de rua → referências → decisão. A referência é de ~30 candidatos para 2 contratados.
3. Preencher o **scorecard** de cada candidato: 7 características, nota de 1 a 10 e uma frase de justificativa em cada uma. O peso e a média ponderada são calculados. Treinabilidade e ética são **eliminatórias** (abaixo de 6 não contrata), e a tela precisa deixar isso claro.
4. **Dois avaliadores com notas separadas**: a nota do segundo só aparece depois que o primeiro salva.
5. **Ficha da rua acompanhada**, preenchida pelo executivo pleno: 7 perguntas sim/não.
6. **Indicação**: quem indicou, e o prêmio liberado quando o indicado completa 60 dias e fecha o primeiro cliente.
7. **Decisão** (contrata / não contrata) com motivo. Contratar cria o acesso já com a fase "preparação" e a data da turma.

**Depois:** o scorecard fica guardado na pessoa. No dia 60, a tela mostra as notas da entrevista ao lado do resultado real (visitas, demos, clientes). Isso alimenta a revisão trimestral do scorecard.

## Prioridade 2 — Rampa de 60 dias com aprovações de verdade

**Hoje:**
- A fase é escrita à mão no `usuarios.json`.
- O pill "Gates: D30 · D45 · D60" é texto fixo.
- Não há aprovação, evidência, padrinho nem data de corte.

**O que precisa existir:**
- **Cockpit**, um quadro por turma, com uma linha por pessoa:
  - as fases 1 a 4 com as metas do playbook (8–10 reuniões assistidas e 3 simulações; 15–20 demos e 1 demo aprovada; 12–15 visitas na base e 3 casos; 6 visitas por dia por 2 semanas);
  - o realizado de cada meta;
  - um botão **"Aprovar fase"** com evidência e data;
  - o **padrinho** de cada novo;
  - a **contagem até o dia 45**, com a decisão formal (avança / estende com PDI / desliga) registrada.
- **Regra visual:** ninguém em fase 1 a 3 aparece com meta de prospecção. Se aparecer visita de prospecção antes da aprovação da fase 3, isso aparece como alerta.
- **App, "Minha rampa":** o executivo novo vê a fase em que está, o que falta para a aprovação, o prazo e quem é o padrinho.

## Prioridade 3 — A habilidade do mês, com antes e depois

**Hoje:** existe "Um hábito para esta semana", escolhido sozinho pelo maior gap, e não existe comparação de antes e depois.

**O que muda:**
- No dia 1 do mês, o gestor **escolhe** com cada pessoa **uma** habilidade, ligada a uma taxa do funil: conversa com o dono, demo por visita, demo para cliente ou visitas por semana.
- A sugestão automática continua, como ponto de partida.
- O card mostra a **taxa do mês anterior, a meta e a taxa ao vivo**, e acompanha a pessoa nos 1:1 do mês.
- No fim do mês: "melhorou → próxima habilidade" ou "não melhorou → mudar o plano".
- No app, em Meu desempenho, o executivo vê as **próprias taxas** contra o time e a habilidade do mês. Hoje ele vê só contagens.

## Prioridade 4 — Comportamento: ocorrências e rituais

**Hoje:** o cockpit avisa e não registra nada.

**O que precisa existir:**
- **Registro de ocorrências por pessoa**, ligado aos 7 inegociáveis: visita sem ficha, sem próximo passo, registro falso, falta em ritual etc. Mostra em que degrau da régua a pessoa está: conversa → plano escrito → advertência formal. Registro falso vai direto para a advertência.
- **Adesão ao fecho do dia:** quantos dias da semana cada um fechou. Hoje há só 1 fecho registrado.
- **Presença nos rituais:** daily, simulação de segunda, quarta e sexta, 1:1.
- **O cockpit cobra o gestor** no Hoje: "1:1 com X atrasado há N dias", "habilidade do mês não definida para X", "aprovação de fase vencendo".

## Prioridade 5 — Saída sem carteira órfã (FEITA no código em 30/10)

**Hoje:** a passagem na saída move só `clients` com status lead. Os negócios do HubSpot e os `leads_prospeccao` (recém-abertos) não acompanham, e há **307 recém-abertos** no nome de quem saiu ou sai.

**O que precisa existir:**
- Um passo único de saída que mostre **tudo** o que está no nome da pessoa (leads, recém-abertos, negócios abertos, tarefas) e reparta por território.
- Um indicador fixo: **"leads no nome de quem saiu" = 0**.
- Restrição: a troca de dono no HubSpot é feita por quem tem permissão lá. O cockpit gera a lista e mostra o que falta.

## Prioridade 6 — O cliente que fica

**Hoje:** não existe indicador de retenção pós-venda, e o variável (`comissionamento.json`) paga só pela venda do mês.

**O que precisa existir:**
- Para cada executivo, **clientes vendidos que estão ativos aos 60 dias** (com uso real, comandas). A fonte é `clientes_takeat`.
- Uma prévia do variável em duas partes (assinatura + cliente ativo aos 60 dias), **quando a diretoria aprovar**.

## Prioridade 7 — Pessoas: tempo de casa e rotatividade

Na tela Pessoas: **data de entrada, tempo de casa, fase, saídas por trimestre e saídas antes de 60 dias**. É o indicador que mede se a contratação melhorou.

## Pequenos ajustes

- **Placar:** a regra exibida (venda 100, demo 25, visita 3) não bate com os pontos gravados por evento (contrato 200, demo 50, visita 20). Conferir qual é a oficial antes de redesenhar. Incluir um passo visível de **"placar auditado"** na sexta.
- **App, cliente:** registrar se a **indicação foi pedida** e quem foi indicado, já que hoje só existe a frase na Agenda.
- **Experimentos** (baixa prioridade): uma lista simples com hipótese, indicador, dono, início e fim, e o resultado.

## Regras de design que continuam valendo

- No app, **o celular não muda**: todo layout novo é condicionado por `layout.ehDesktop`.
- Usar o UI Kit da Takeat; cores de etapa e temperatura são dado, não decoração; zero emoji.
- Número sempre com a fonte e a data ("Prova dos números").
- O HubSpot é a fonte; o cockpit é espelho. Nenhuma tela nova altera propriedade ou automação do HubSpot ou do ASAAS.

## Ordem sugerida de entrega

1. Contratação, com scorecard e indicação.
2. Rampa com aprovações, no cockpit e na "Minha rampa" do app.
3. Ocorrências, cobrança do gestor no Hoje e a saída sem carteira órfã.
4. Habilidade do mês com antes e depois, e as taxas no Meu desempenho.
5. O cliente que fica, e tempo de casa e rotatividade.
