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
