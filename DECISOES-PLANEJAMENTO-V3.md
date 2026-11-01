# Planejamento do executivo v3 · decisões tomadas na implementação (01/11/26)

Fonte: `design_handoff_planejamento_v3` (README + PROMPT). O que o handoff não decidiu, ou o que o código
pediu diferente, está aqui com o porquê. Código: `GV2.PLV3` no bloco `gv2-js` de
`template/cockpit.template.html`; testes: `scripts/testar-planejamento-v3.js`.

## Escopo e fallback

1. **A v3 é o padrão do executivo; a v2 fica inteira atrás de `localStorage['planejamento-v2'] = '1'`.**
   `renderProspeccaoExecutivo()` escolhe uma ou outra depois do `pl6Carregar`. Nenhuma função pl6/PL7 foi
   apagada: a Daily, a Rua e as telas do gestor continuam usando todas.
2. **Etapa 7 (virada da semana no app) não foi feita aqui**: já está feita no outro repositório. No Cockpit, a
   v3 usa a virada que `pl6SegundaDaSemana()` já faz (sex 17h). A v2 pulava para a "próxima" na sexta de manhã
   (`PL6_SEMANA = 1`); na v3 esse pulo foi desligado, porque depois das 17h ele adiantaria duas semanas.
   Com a semana virada, o segmentado mostra "esta semana" (a que acabou, `PL6_SEMANA = -1`, só leitura:
   todos os dias passaram) e "próxima" (aberta por padrão), com o selo "planejando: próxima semana".
3. **Nada novo no banco, no HubSpot ou nas rotas de API.** Nenhuma migration.

## "Sem próximo passo": uma função só

4. **`GV2.semProximoPasso(negocios, marcados)`** (ao lado de `GV2.textoSemPasso`): negócio aberto, fora de
   Ag. Pagamento, sem `proximo_passo` (tarefa/reunião de hoje em diante ou item no Planejamento de hoje em
   diante) e não marcado nesta sessão. Prospecção ENTRA; passo vencido conta como sem passo.
5. **Onde ela passou a valer:**
   - Hoje do executivo: `EXH4.semPasso` agora chama a função (mesmo resultado de antes).
   - Planejamento v3: o contador da faixa (`PLV3.contador`) e a fila.
   - Gestor: o filtro "Sem próximo passo" da tabela Negócios do Raio X (`GV2.filtroNegocios('sempasso')`).
     **Mudança de número visível ao gestor:** antes ele usava `n.semPasso` (`idx >= 1`, sem a Prospecção);
     agora conta também a Prospecção, igual à Hoje e ao app.
6. **O que NÃO mudou de propósito:** o campo `n.semPasso` da base continua com a regra antiga, porque ele
   alimenta outras lógicas do gestor (`puxar`, "quentes sem passo", `p.quentesSemPasso`, Daily). Não é a
   contagem "sem próximo passo" mostrada às pessoas, e trocar a regra ali mudaria "Negócios para puxar".
   A Pessoas do gestor não tem hoje um cartão "Sem próximo passo" por pessoa (o 5º cartão dela é "Sem
   desfecho"); o número equivalente que o gestor vê é o filtro do Raio X, que foi o alinhado.
7. **A fila da v3 lê a base do executivo (GV2.DV, a mesma da Hoje)**, e não `pl6TodasAsContas`: é o único jeito
   de o número ser literalmente o mesmo nos três lugares. Sem a base (lendo ou fora), o contador mostra "—" e
   "funil do HubSpot fora / lendo", nunca 0. O passo dado pela v3 entra em `EXH4.estado.marcados`, então o
   contador desce na hora também no card da Hoje.

## Dados e regras

8. **Bairro do dia: persistência em `planos_semanais.regioes`** (a que já existe e que o app já lê), gravada
   por `pl6Gravar` como o "bairro do dia" da v2. Sem schema novo em `field_routes`. Valor gravado = a chave de
   lugar do pl6 (`b:`, `z:`, `c:` ou `t:`). "Automático" grava `null`.
9. **Bairro automático:** escolhido > o mais comum entre as paradas do dia > para dia vazio, os bairros com
   mais quente sem passo (peso 3), sem passo e munição, um por dia, sem repetir. Não existe um "bairro da
   rota" separado em `field_routes`; o que existia como "bairro do dia" é o `regioes` da v2, que na v3 conta
   como ESCOLHIDO. O automático de um dia vazio fica estável na sessão.
10. **Lista de bairros do painel:** as regiões da carteira e da munição (`pl6Regioes`), ordenadas por quentes e
    depois por total; leads sem endereço não entram na conta. Até 40 opções no painel.
11. **Média:** visitas com prova (`b.cru.visitas4`, o RPC `visitas_com_prova` que a base da Hoje já lê) do
    executivo, da segunda de 3 semanas atrás até ontem, dividido pelos dias úteis da janela (feriado fora).
    Sem nenhuma visita com prova na janela vale a meta da fase (`rampDoOwner().alvo`, senão
    `meta_visitas_dia`), e a tela escreve "meta da fase N". Fonte fora: "média — · visitas_com_prova".
12. **Meta do dia** = `p.meta_visitas_dia` da base (a mesma da Hoje e da Pessoas); aviso de capacidade quando
    as paradas passam de 1,5 × a média (avisa, não trava; "manter" fica gravado só na sessão).
13. **Fechamentos da semana** = `ceil((meta do mês − fechados no mês) ÷ semanas que faltam no mês)`, contando a
    semana planejada (as segundas do mesmo mês a partir dela). Usa `p.resultado` da base. Sem meta: "—".
14. **"Na grade"** conta os cartões de visita e de bloco de rua dos dias úteis (a mesma regra do número do
    topo da v2: a "órfã", parada de negócio fora da carteira, não tem conta e não aparece), mais os cartões
    "fora do plano" (visita com prova fora do plano) dos dias que passaram; "feitas" = cartões com check-in.
15. **Feito / check-in:** item de `GV2.v5Dia` com prova (hora do check-in) ou parada `done` na rota do app
    (sem hora: "feito · no app"). Nenhuma hora inventada.
16. **Hoje recebe sugestão só antes das 10:00** (README). Já "Pôr num dia" e soltar aceitam hoje a qualquer
    hora (quem põe sabe que vai). Feriado e dia passado não aceitam.
17. **Sugestões e "Dar data a todos"** seguem o protótipo; onde ele divergia do README, valeu o README: dia
    com bairro ESCOLHIDO só recebe aquele bairro também na proposta do "Dar data a todos". As tarefas da
    proposta não caem em feriado.
18. **Perdido · motivo:** os 5 rótulos da prancha viram os valores que o HubSpot aceita (nenhum campo novo):
    preço → Preço; já tem sistema → Não quer mudar de sistema; fechou a casa / sem interesse / não é o
    decisor → Outros, com o rótulo na observação. O clique abre a passagem de etapa de sempre
    (`abrirPassagemDeEtapa`) já com o motivo marcado: as propriedades obrigatórias continuam sendo pedidas.
    Não usei `pl6MoverPelaFicha` porque o retorno dela chama um `redesenhar` que não existe no escopo global
    (defeito antigo da v2, não mexido).
19. **Reciclar · 30/60/90 d:** o mesmo `hubspot-sync create_task` do "reciclar" da munição v2, com o prazo
    escolhido. A etapa do negócio não muda (igual à v2).
20. **Ligar em / WhatsApp:** `EXH4.gravar` (o mesmo da Hoje: `hubspot-sync create_task` + espelho na agenda).
    Para conta da Reciclagem (fora da base), o mesmo `create_task` direto.
21. **"mover N para sex"**: a tarefa muda de data pelo `criarTarefaVisitaNoHubspot` (que reagenda a aberta) e
    só depois a grade é gravada.
22. **Conta sem endereço:** soltar no dia entra (avisa, não trava) com "sem lugar no mapa"; "gravar no
    cadastro" usa `gravarPropriedadesDoNegocio` (logradouro do negócio no HubSpot, o mesmo do formulário de
    endereço da v2). Só negócio da carteira tem onde gravar; conta-alvo mostra só o selo.
23. **Ficha do negócio:** a v2 abria a ficha clicando no cartão. Na v3 o cartão de negócio da grade continua
    abrindo a ficha, e o menu Decidir ganhou "abrir a ficha do negócio".

## Ao vivo

24. **"Refetch só do dia":** o sinal de `sinais_ao_vivo` não traz o dia (é tipo + ids). A v3 relê a linha da
    semana em `planos_semanais` e a rota da semana (duas leituras pequenas), compara por parada (o id do item)
    com o que está na tela e repinta **só as colunas que mudaram** (e a faixa), preservando a rolagem.
    Entrou pelo app (item com origem `app*`), saiu (riscado 2 s, depois volta à fila com "tirado do plano no
    app"), check-in, reordenado no app (só hoje).
25. **Espera:** arrastando, com menu da fila aberto, com o painel de bairro aberto ou gravando em lote, o
    evento vai para a fila local; a pílula do topo fica âmbar. Ao soltar/fechar, a releitura entra e os
    destaques aparecem em sequência, 300 ms entre eles.
26. **A pílula** fica no topo do app, à esquerda do sino/avatar, só com a aba aberta. Sem canal de realtime
    na sessão, ela diz "sem ao vivo nesta sessão" (não promete o que não está acontecendo).
27. **O aviso "dados novos do time · atualizar" sai desta aba:** com a v3 aberta, `aoVivoRepintarComCalma`
    consome o sinal sem aviso (a v3 já aplicou). Nas outras telas de planejar (Daily, Rotas) ele continua.
28. Um evento que chega com o executivo digitando num campo espera como antes (`farolPodeAplicar`).

## Layout

29. Fila 264 px; a partir de 1366 px de janela, 340 px (o build só aceita breakpoints da escala do projeto:
    1366 é o mais perto dos 1536 do print). Colunas `minmax(150px, 1fr)` com rolagem horizontal abaixo disso.
30. A altura da tela é calculada pelo lugar real onde a aba começa (`PLV3.ajustarAltura`), para caber sem
    rolar a página em 1280 × 800 (a faixa "HubSpot atualizado…" do app fica acima).
31. Toasts usam o toast da Hoje (`EXH.toast`) para sucesso e `mostrarToast` para erro/atenção.

## O que ficou de fora ou parcial (ver também o relatório)

- Etapa 7 (app) fora de escopo deste repositório.
- O "reordenado no app" depende de a rota do dia ter posição; sem rota lida, não há diff de ordem.
- Latência ≤ 3 s não foi medida em produção (não houve acesso ao realtime de produção); no código, o sinal
  entra em ~0,8 s (o temporizador que já existia) + duas leituras pequenas.
