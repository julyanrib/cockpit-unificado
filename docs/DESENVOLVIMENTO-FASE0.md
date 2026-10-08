# Desenvolvimento do executivo · Fase 0 · 07/10/2026

Entrega: `DESE.zip` (Claude Design). Medido no código (cockpit `ab5dfc4`) e no banco às 19h.

## 1. Inventário: o que a aba tem hoje e o que sai
Renderer: `renderPDIs` (template ~72773; markup 73388-73540). Os 11 blocos da auditoria:

| Bloco | Lê de | Destino |
|---|---|---|
| Herói "Como eu melhoro" (4 contadores) | narrativas do robô semanal | sai |
| Onde você está travado (análise da sexta) | `narrativas.reps` (robô) | sai; número vivo vai ao topo |
| Suas 3 prioridades da semana | regras sobre `funilLeads` | sai (é a fila da Hoje) |
| Foco de habilidade | `pdi_compromissos.treino_*` | vira o treino do hábito (bloco 4) |
| Como os melhores agem (3 hábitos) | percentil 80 do time | sai; vira 1 hábito |
| Seu 1:1 · acordos | `r.compromissos` (robô) + `pdi_compromissos` | sai; entra `um_a_um.combinados` |
| Seu jogo vs. os melhores | percentil 80 | sai |
| Meus PDIs (PDF) | anexo do gestor | sai (vazio para todos) |
| Entenda seus números (FAQ) | texto fixo | vira "Como contamos" |
| Conquistas do mês | `funilLeads` ganhos | sai (dizia 2 onde o resto diz 1) |
| Rodapé de fonte | `DATA` | fica, com a hora do app e do HubSpot |

Apago o markup e as funções que só ele usa, varrendo os usos antes (a guarda de ramo morto confere).

## 2. Os 4 números do topo: a mesma função da Pessoas v4
A Pessoas v4 monta tudo em `GV2.montar` (+ `GV2.disciplinaMontar`). Hoje ela **só roda para gestor**: 4 funções do banco recusam o executivo — `planejamento_do_time`, `gestor_v4_leituras`, `visitas_com_prova` e `ranking_do_time` checam `eh_gestor_cockpit`.

**Plano (sem conta nova):** essas funções passam a aceitar o executivo **só para ele mesmo** (`p_donos` vira `[meu_owner_hubspot()]`, o padrão que `rotas_da_semana` já usa). Aí a aba do executivo chama `GV2.montar` com a pessoa dele e os 4 números saem da mesma linha de código do gestor. As tabelas diretas já liberam o próprio dono: `client_meetings`, `fichas_de_rua`, `fila_feitas`, `dailies`, `playbook_progresso`, `pdi_compromissos`.

**Comparações com o time** ("decisor · time 20 de 81", o "Time" do hábito): o executivo não lê as fichas dos colegas. Uma RPC nova `medias_do_time_v4()` devolve **só totais** (o mesmo que o ranking já mostra, autorizado em 03/10). Nenhum nome, nenhum negócio de colega.

## 3. Os 2 itens novos de dado
1. **Leitura do próprio 1:1: já existe.** A policy `um_a_um_leitura` libera `owner_id = meu_owner_hubspot()`. O `CLAUDE.md` do app ("um_a_um é só gestor") está velho; corrijo junto.
2. **RPC `combinado_fiz_minha_parte(p_id uuid, p_indice int, p_feito boolean)`**: só grava `combinados[i].exec_fez_em` (agora ou null), só na linha do próprio dono, só em combinado manual. A conclusão continua do gestor. A Pessoas mostra "você fez".

## 4. O que o fixture inventou (medido)
| Item | Fixture | Banco |
|---|---|---|
| Combinados | 7 pessoas com combinados | **só a Kelly tem** (3, de 06/10); o André tem um 1:1 de 05/10 **sem combinado**; os outros 5 nunca tiveram 1:1 registrado → estado "primeiro 1:1" |
| Status dos combinados da Kelly | "0 de 3, 2 vencendo sexta" | os prazos são **07/10, 08/10 e 09/10** e o status não é gravado: é calculado na hora pela conferência da Pessoas. Uso o mesmo cálculo |
| Hora do 1:1 | 14:30, por pessoa | `GV2.PESSOAS.HORA_1A1` = **segunda 08:30 para todos**. Não existe hora por pessoa |
| Próxima venda | +R$ 250 | `GV2.variavel(fechados+1) − variavel(fechados)`, da tabela `DATA.comissionamento` (a mesma do Meu desempenho) |
| Hábito de cada um | escrito à mão | calculado: a leitura mais longe da média do time (disciplina, decisor, portas, plano) |

## 5. Conflitos
- **Sandro, reuniões sem desfecho (94 × 97):** nenhum dos dois. Desde hoje a cobrança conta **30 dias**: Sandro **16** (66 antigas à parte). O topo e o teste 1 usam o mesmo número da Pessoas.
- **Kelly, combinados:** ver tabela; estado real, não "2 de 3".
- **Marco, fechados (0 ou 2):** **2** (`vendasMes`, a mesma lista do placar e da variável).
- **Kelly, check-ins de 05/10 (6 ou 0):** **0** em 05/10; os 6 são de 06/10.
- **Exemplos do pedido × fixture:** uso o banco, não um nem outro.
- **Segunda 12/10 é feriado** (Nossa Senhora Aparecida). Ver D2.

## Decisões para você
- **D1 · hora do 1:1.** Hoje é "segunda 08:30" para todos. Mantenho assim (a prancha inventou 14:30 por pessoa)?
- **D2 · feriado.** Regra proposta: **1:1 em feriado vai para o próximo dia útil, mesma hora** (12/10 → terça 13/10 08:30). Mesma regra na Pessoas do gestor.
- **D3 · as 4 funções do banco aceitando o próprio executivo** (item 2). É o caminho para o "mesmo número" sem conta duplicada. Ok?

## Ordem de PRs (a do prompt)
1. RPC do "Fiz a minha parte" + as 4 funções aceitando o próprio dono + `medias_do_time_v4`.
2. Topo pelos números do `GV2.montar`, com o teste 1 nas 7 pessoas.
3. Combinados e disciplina (desfecho de reuniões pela `reuniao_desfecho`, que já aceita o dono).
4. Hábito, rodapé, "Como contamos"; apagar os 11 blocos.
5. Estados, 4 tamanhos, 2 temas, conferidos contra os 14 PNGs.
