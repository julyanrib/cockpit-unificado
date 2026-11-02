# Decisões do Hoje v3 (app primeiro, Cockpit espelho)

Handoff `design_handoff_hoje_v3` (01/11/2026). O README do handoff é a fonte da verdade; aqui ficam as
escolhas feitas onde ele não decidia, ou onde o código existente mandou de outro jeito. O mesmo arquivo
está nos dois repositórios (cockpit-unificado e PWA-app-outbound).

## Etapa 1 · as funções e a paridade

1. **Uma montagem, duas línguas, uma fixture.** O dia do executivo (`diaDoExecutivo`) existe em TS
   (`supabase/functions/_compartilhado/hojeV3.ts`, app) e em JS (`HJ3` no gv2-js do Cockpit). As duas
   suítes (`src/utils/hojeV3.teste.ts` e `scripts/testar-hoje-v3.js`) formatam a mesma fixture e comparam
   com a mesma saída esperada, byte a byte quando o app está ao lado. É o padrão do Desenvolvimento v2.
2. **"Sem próximo passo" não ganhou uma terceira regra.** No app, a conta da aba Tarefas (passo vencido +
   nunca marcado, Ag. Pagamento fora) saiu da tela para `semProximoPassoDaFila`, e a tela, a folha da manhã
   e o push das 8h passaram a chamá-la. No Cockpit continua `GV2.semProximoPasso` (Planejamento v3). A
   paridade é provada com negócios e tarefas de verdade: no app pela `montarFila` (a regra da Edge
   fila-tarefas), no Cockpit pela regra da montagem (`proximo_passo` = tarefa, reunião ou dia no plano de
   hoje em diante). Os dois acham os mesmos 5 negócios dos 12 da fixture.
3. **A sugestão "Pôr em …" é a do Planejamento v3.** O app não tinha a regra; `sugestoes` em `hojeV3.ts`
   é a porta linha a linha de `PLV3.sugestoes`, e a suíte do Cockpit roda a ORIGINAL sobre a mesma fixture.
4. **Pontos na pílula e no placar são da semana, não "de hoje".** O README pede "37 pts hoje" e "faltam 10
   para passar o 2º". O único placar que existe (e que paga os R$ 250) é o da semana
   (`desenvolvimento_quadro().semana`), e "faltam N" compara totais da semana. Misturar pontos de hoje com a
   distância da semana daria uma conta que não fecha; ficou "37 pts na semana · faltam 10 para passar o 2º".
   Nenhuma regra de ponto mudou.
5. **"+3 pts" só quando o placar vai contar.** O toast pós-Cheguei recebe os pontos de fora: com prova e
   1ª visita ao restaurante na semana, +3; repetida na semana, "Check-in com prova" sem número (o placar
   conta cada restaurante uma vez por semana). Sem prova: "não conta ponto".
6. **Marcas sem símbolo.** As marcas da lista do plano (com prova, sem prova, não visitada) vão como
   `ok`/`av`/`x` no modelo e viram ícone SVG na tela: o caractere de check cai na faixa que a guarda de
   emoji das suítes vigia.
7. **A fila por dinheiro também é uma só.** Os "3 primeiros" da folha da manhã saem de `ordemPorDinheiro`
   (porta do `PLV3.ordemPorDinheiro`), e a paridade inclui a ordem.

## Etapas 2 a 5 · o dia no app

8. **A folha da manhã reaproveita a mecânica da FolhaPlanoDoDia** (a mesma chave `plano-do-dia-AAAA-MM-DD`
   por aparelho, a mesma 1ª abertura do mapa), mas sobe só até as 10h (antes: até as 19h) e só em dia
   útil. O push das 8h (`?hoje=manha`) abre a folha se ela ainda não subiu hoje; se já subiu, o toque
   leva ao mapa (no máximo 1 folha por momento por dia).
9. **"Pôr em …" no app = tarefa no HubSpot e depois a parada.** A ordem é a do handoff: primeiro
   `negocioAcao` (op nota / proximo-passo, tipo visita, a porta única de sempre); só com o HubSpot aceito
   a parada entra no plano daquele dia por `porNoPlano` sem hora (que, sem hora, não manda um segundo
   passo ao HubSpot). Os chips de 1 toque (toast, fecho, pendências de ontem) usam o mesmo corpo, tipo
   follow-up ("Ligar").
10. **A sugestão de dia no app olha os 5 dias úteis a partir de hoje.** O Planejamento olha a semana do
    plano (seg–sex); o app não tem a grade do Cockpit nem o bairro escolhido no Planejamento
    (`planos_semanais.regioes`), então o bairro do dia é o mais comum entre as paradas daquele dia
    (`field_route_stops` → `clients.bairro`) e nenhum dia tem bairro "escolhido". A regra (quentes
    primeiro, mesmo bairro, até 3 por dia, sem endereço nunca) é a mesma.
11. **A ficha "como foi" não mudou.** O README pede 3 opções de resultado e 4 chips de dia na ficha; a
    ficha que existe já tem o resultado e o próximo passo (com mais opções, ligadas a etapa e reunião), e
    redesenhá-la arriscaria o que ela grava no HubSpot e no Cockpit. O que entrou foi o depois: ao fechar a
    ficha salva, "Passo em sex 13 · salvo no HubSpot" (2,6 s) ou "{nome} ficou sem próximo passo" com os
    chips amanhã · sex 13 · seg 16 · depois. "Sem interesse" é decisão e não pede passo.
12. **A pílula-placar mora na faixa da vez.** O topo do mapa tem uma posição só ("Mapa limpo", 29/10): a
    pendência (Cheguei sem Como foi) e a hora das ligações têm verbo e prazo e ganham dela; quando a faixa
    está livre, a pílula aparece. O toque abre o Meu desempenho (origem pílula).
13. **O fecho não sobe mais sozinho às 18h.** Com o Hoje v3 ligado, a folha antiga que subia quando o app
    voltava para a frente depois das 18h não sobe: o fecho vem do push das 18h (`?hoje=fecho`) ou do
    "fechar o dia" que a pílula ganha depois das 17h, para quem tem porta feita e ainda não fechou.
14. **A sequência do toast pós-Cheguei** é a de `desenvolvimento_quadro()` (na rua), com +1 quando é a 1ª
    visita com prova do dia. É texto de comemoração; o número oficial continua no Meu desempenho.
15. **Volta ao anterior no app:** `localStorage['hoje-v2'] = '1'` (a mesma chave do Cockpit) devolve a
    FolhaPlanoDoDia, a FolhaFechoDoDia antiga (que volta a subir às 18h) e tira a pílula e os toasts.
16. **O selo "vence hoje" no pino não entrou.** O handoff permite tocar no pino só para esse selo, mas os
    pinos são desenhados pela camada do mapa (lentes, famílias, halo) e o selo pediria mexer nela. O "vence
    hoje" aparece no cartão da próxima porta, na folha da manhã (linha 2) e na lista do plano do Cockpit.

## Etapas 6 e 8 · os pushes e a medição

17. **Os pushes das 8h e das 18h são momentos novos do push-fila** (`manha0800`, `fecho1800`), com cron
    de segunda a sexta (11:00 e 21:00 UTC) pela `invocar_push_fila` de sempre (0241). Feriado: a Edge não
    manda (a mesma `ehDiaUtil` com `feriadosNacionais`). 1 por momento por dia: `push_enviados` com tipo
    `hoje` e o momento como ref (a chave primária recusa o segundo). Não gastam o limite de 4 da fila, como
    os da semana do Desenvolvimento v2.
18. **O "Feche o dia" das 18h toma o lugar do "ainda dá tempo" das 18:05** para quem o recebeu: os dois
    diriam a mesma coisa com cinco minutos de diferença. O das 8h não mexe no das 8:30 (que é um quente).
19. **O push das 18h só vai para quem foi à rua e não fechou** (sem porta, `push18` é nulo; com
    `fecho_do_dia` de hoje, pula), a mesma regra que a folha antiga já seguia.
20. **A medição usa a aberturas_de_tela** (0241): 4 telas e 3 origens novas e a coluna `acao`.
    `registrar_abertura` ganha `p_acao` (opcional) e a versão de 2 argumentos sai, para a chamada não ficar
    ambígua. O selo "abriu esta semana" do gestor passa a contar só as telas do Desenvolvimento (a função
    `_desenvolvimento_de` da 0240 foi copiada inteira com essa única troca). Enquanto a 0241 não for
    aplicada, as chamadas novas são recusadas pelo banco e a tela não percebe (fogo e esquece).

## Etapa 7 · o Hoje do Cockpit (espelho)

21. **Os 3 blocos não leem dado novo.** O plano de hoje e a prova de cada parada saem de `EXH.dia`
    (`GV2.v5Dia`, a mesma conta da Rua do gestor e do Planejamento); "sem próximo passo" é
    `GV2.semProximoPasso` sobre a base do executivo; o placar é `desenvolvimento_quadro()` (DV2);
    "Fechou o dia ontem" lê `fecho_do_dia` da pessoa logada.
22. **A coluna do meio é o componente do Planejamento v3, não uma cópia.** As linhas são
    `PLV3.dados` + `pv3LinhaHTML` (o atalho "+ Pôr em …", Pôr num dia, Ligar em, Decidir) e o clique vai
    para `PLV3.acao`, que grava pelos caminhos dela (tarefa no HubSpot antes da grade). A Hoje só se
    repinta depois. Sem a semana do Planejamento carregada, a coluna avisa e manda ao Planejamento.
23. **A Hoje anterior continua inteira** atrás de `localStorage['hoje-v2'] = '1'` (o `renderMeuPainel`
    desvia para o `GV2.HJ3` antes de montá-la). O `EXH.pintar` foi envolvido para repintar a Hoje v3 quando
    algo ao vivo repinta a anterior (check-in do app, leitura da semana, gravação).
24. **Os pontos no placar são "pts na semana"** (decisão 4) e o botão "abrir a Desenvolvimento" leva aos
    5 números do gestor, que saíram daqui.
25. **Uma coluna abaixo de 1240 px** (a escala de cortes da guarda de CSS; 1100 px não é um corte dela).
