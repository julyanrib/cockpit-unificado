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

