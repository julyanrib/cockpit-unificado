# Decisões · Desenvolvimento v2, o jogo da carreira (01/11/26)

Handoff: `design_handoff_desenvolvimento_v2/` (README é a fonte da verdade). Este arquivo existe igual nos
dois repositórios (PWA-app-outbound e cockpit-unificado). Cada decisão abaixo foi tomada sem parar para
pedir aprovação, como o PROMPT manda, e é a mais simples que respeita as regras.

## 1. Paridade: uma função no banco, a formatação duplicada e testada com a mesma fixture

- **Os dois repositórios não importam um do outro.** Por isso a agregação de TODOS os blocos mora numa
  RPC só, `desenvolvimento_quadro(p_pessoa uuid default null, p_owner text default null)`
  (`supabase/migrations/0240_desenvolvimento_v2.sql`). O app e o Cockpit chamam a mesma função; sem
  parâmetro ela devolve a pessoa logada; com `p_pessoa`/`p_owner` só o gestor (`eh_gestor_cockpit()`).
- **O que cada lado faz é só texto e layout.** As funções puras do PROMPT (etapa 1) existem nos dois
  lados com o mesmo código:
  - app: `supabase/functions/_compartilhado/desenvolvimentoV2.ts` (usado pela tela, pelo toast, pela
    pílula e pelo `push-fila`);
  - Cockpit: `DV2.*` no bloco `gv2-js` do `template/cockpit.template.html`.
  Nomes: `semanaDoExecutivo`, `missaoDaSemana`, `sequencias`, `escadaDoVariavel`, `habilidadeDoMes`,
  `carreira` (com `criteriosDeLider`), `nivelPlaybook`, `colecao`, mais `umAUmLinha`, `vsVoce`,
  `pilula`, `pushSegunda`, `pushSexta`, `conquistasNovas`, `toastDaConquista` e `montar(Desenvolvimento)`.
- **A prova da paridade** é a mesma fixture (9 estados: quarta, missão cumprida, novato, segunda 8h,
  perto de líder, convites, feriado 2026, feriado 2025, fonte fora) e a mesma saída esperada, nos dois
  repositórios:
  - app: `src/utils/desenvolvimentoV2.fixture.json` + `desenvolvimentoV2.esperado.json`, suíte
    `src/utils/desenvolvimentoV2.teste.ts` (compara byte a byte);
  - Cockpit: `scripts/fixtures/desenvolvimento-v2/fixture.json` + `esperado.json`, suíte
    `scripts/testar-desenvolvimento-v2.js` (compara valor a valor e, com o app ao lado, os bytes).
  Mudar uma frase num lado sem o outro derruba uma das suítes. Para regravar a esperada:
  `GERAR=1 npx tsx src/utils/desenvolvimentoV2.teste.ts` no app e copiar os dois JSON para o Cockpit.

## 2. O banco (migração 0240, NÃO aplicada)

| Peça | O que é |
|---|---|
| `missoes_semana` | a missão da semana por pessoa, escolhida UMA vez (1ª leitura da semana) e fechada pela prova (`cumprida_em`). Guarda o porquê da escolha (`motivo`: as taxas minha e do time). |
| `conquistas_ganhas` | a medalha e o dia em que nasceu ("ganha em 24/10"). Gravada só pelo servidor, quando a prova aparece; nunca apagada (a sequência que quebra depois não tira a medalha). Gatilho manda o sinal ao vivo `conquista`. |
| `conquistas_vistas` | a pessoa viu (toast ou coleção). Desliga o selo "1 nova" do menu do Cockpit. RPC `marcar_conquistas_vistas(ids, onde)`. |
| `aberturas_de_tela` | pessoa, tela (`meu_desempenho` / `desenvolvimento`), quando, origem (`toast`, `pilula`, `push_seg`, `push_sex`, `menu`, `selo_menu`). RPC `registrar_abertura(tela, origem)`. |
| `_desenvolvimento_de(pessoa)` | o corpo do quadro (service role; o push-fila usa). |
| `_lider_pessoa(pessoa)` | o corpo do laço de `lider_quadro()` (0235); `lider_quadro()` passa a chamá-lo e devolve o mesmo de antes (só ganha `uteis` por mês). Assim os 4 critérios que o gestor vê são os mesmos que o executivo vê. |
| `_dv2_portas`, `_dv2_recorde_util`, `_dv2_dia_da_sequencia`, `_dv2_nome_feriado`, `_dv2_ganhar` | ajudantes. |
| cron | `push-desenvolvimento-seg` (seg 11:00 UTC = 08:00) e `push-desenvolvimento-sex` (sex 20:00 UTC = 17:00), pelo `invocar_push_fila` que já existe. |

RLS: cada pessoa lê as suas linhas e grava as suas vistas/aberturas; o gestor lê todas
(`eh_gestor_cockpit()`). Missão e medalha não têm política de escrita para o cliente: só a função
(security definer) grava, com a prova na mão. TRUNCATE revogado como nas outras.

**Reuso, nada novo no cálculo:** placar = `pontos_da_semana()` (0191, a regra dos R$ 250 intacta);
sequência = `_sequencia_util()` e `fila_zerada_dias` (feriado pela 0239); habilidade =
`habilidade_quadro()` (0233); rampa = `rampa_quadro()` (0231/0239); variável = `vendasMes` do snapshot ×
`cockpit_config.comissionamento` (a conta do `meu_desempenho()`, 0159); quentes = `minhas_conquistas()`
(0154); Playbook = `playbook_progresso` tipo `prova`.

## 3. Escolhas de produto (onde o handoff deixou aberto)

1. **Missão da semana.** Escolhida entre os 4 hábitos com prova diária: `porta` (todas as visitas com
   GPS/foto, 3 dias), `fila` (fila zerada antes das 18h, 2 dias), `naHora` (100% das fichas em até 15
   min, 2 dias) e `dono` (volta marcada em toda ausência do dono, 2 dias). Ganha o de maior distância
   (pontos percentuais) entre o time (sem rampa) e a pessoa na semana anterior; sem dado ou ninguém
   abaixo do time, `naHora`. Novato: sempre a da fase ("4 visitas com prova por dia útil em 3 dias").
   `registro`, `plano` e `rituais` estão no catálogo de textos (README §6.1) mas ainda não entram na
   escolha: precisam de auditoria/plano/presença por dia, que não têm prova diária simples.
2. **Prazo da missão** = a sexta, ou o último dia útil da semana se a sexta for feriado (20/11/2026 cai
   numa sexta: o prazo vira qui 19/11, com 4 dias úteis). Feriado e fim de semana nunca contam.
3. **"até sex 07/11 17:00".** O placar do bônus vai até sexta 23:59 (0191). Para não inventar hora, a
   tela diz "até sex 13/11" (e "· 4 dias úteis" na semana com feriado).
4. **Nomes.** O texto usa só o primeiro nome e sem artigo ("para passar Gama"), porque o banco não sabe
   o gênero. Nenhum nome fica nos testes: a fixture usa nomes fictícios.
5. **O 1:1.** A data do próximo é a cadência do gestor (`GV2.PESSOAS.HORA_1A1` = segunda 08:30; o
   feriado empurra para o próximo dia útil). O "leve:" é o que a pessoa conquistou desde o último 1:1
   (medalhas, missão), porque o veredito dos combinados é calculado só no Cockpit do gestor
   (GV2.cbMedir) e não no banco. Sem 1:1: o convite do README, com "o seu gestor" no lugar do nome.
6. **Reconhecimento da sexta.** Calculado no banco para os combinados 1 (porta provada), 3 (ficha na
   hora) e 4 (dono), com as mesmas réguas do `GV2.rcDestaques` (mín. 10 visitas; 3 ausências no 4;
   maior taxa do time, empates incluídos; sem a rampa) e **só com a auditoria de sexta registrada**
   (`auditorias_semana`): reconhecimento é de número conferido. Vira medalha "Destaque da sexta".
7. **Playbook.** O nível é o capítulo em que a pessoa está (o mesmo "Nível N" da Pessoas do gestor):
   capítulo feito = quiz (`tipo = 'prova'`) em todas as páginas. Ler não sobe. Os capítulos vêm do
   Playbook de cada lado (categoria = capítulo, sem Liderança). A medalha "Playbook nível N" sai da
   data da última prova; ela não grava em `conquistas_ganhas` (o banco não conhece os capítulos), por
   isso não gera toast nem selo "nova".
8. **Medalhas (14 no catálogo, nada escondido):** na rua 5, 1º contrato do mês, destaque da sexta,
   porta provada, Playbook, registro na hora, fila zerada 5, fila zerada na semana, volta marcada,
   4 contatos em todos os quentes, demo 3 dias, habilidade batida, padrinho de um formado e, para o
   novato, primeira semana no ritmo. A bloqueada mostra o progresso real.
9. **Quentes vistos pelo gestor.** `minhas_conquistas()` só sabe da própria pessoa; quando o gestor
   pede o quadro de outra, o progresso dos quentes vem `null` e a tela diz "—".
10. **Variável.** Faixas sempre do `comissionamento` (modelo retroativo). "A próxima venda vale" é
    `total(v+1) − total(v)`, a mesma conta do `proxima_venda` de `meu_desempenho()`. Meta = `metaMensal`
    do snapshot (planilha); sem ela, 8 (pleno) ou 3 (novato).
11. **Você contra você.** Melhor semana = maior pontuação da pessoa nas linhas gravadas em
    `bonus_semanal.detalhe` (e a passada). "N × M" de vendas usa contrato − estorno em `pontos_eventos`
    até o mesmo dia do mês.
12. **Toast "mudança de faixa"** no app: quando, na sessão, a venda leva a pessoa a uma faixa maior.
    Não grava medalha (é o variável).
13. **Fonte fora:** cada bloco do quadro roda num `begin/exception`; o que cair vem `null` e a fonte em
    `fontes`. A tela mostra "—" e o nome (placar_da_semana, HubSpot, habilidade_quadro, rampa_quadro…),
    nunca 0.
14. **Celebração:** 0,6 s com overshoot (`cubic-bezier(.2,1.6,.4,1)`), ≤ 2 s no total; com "reduzir
    movimento" o círculo aparece direto (CSS `prefers-reduced-motion` no Cockpit; `AccessibilityInfo` /
    `matchMedia` no app).
15. **Ícones:** os do kit com o mesmo nome; o kit do app não tem chama, raio, alvo e escudo — foram
    desenhados em `src/components/icons.tsx` no mesmo contrato do `IconBook`.
16. **Breakpoints do Cockpit:** a guarda do build só aceita a escala 420 · 640 · 760 · 900 · 1050 · 1240 ·
    1366: a grade de 12 vira 2 colunas abaixo de 1240 e 1 abaixo de 760.

## 4. Entradas e medição

- App: toast (sinal ao vivo `visita`/`foto`/`ficha`/`negocio-meu`/`conquista` relê
  `['desenvolvimento_quadro']`), pílula fixa no topo do Hoje (aba Tarefas), pushes seg 08:00 e sex
  17:00 (`push-fila`, momentos `seg0800`/`sex1700`, url `/?desenvolvimento=seg|sex`, não gastam o
  limite de 4 da fila, não saem em feriado, seguem `cockpit_config.push_fila`).
- Cockpit: selo "1 nova" no menu Desenvolvimento (lido 4 s depois do login e a cada 10 min), toast ao
  vivo no canto (420 px, 8 s) pelo `sinais_ao_vivo`, pílula no topo do Hoje, e na Pessoas do gestor a
  primeira linha "Conquistou desde o último 1:1 (dd/mm)" com o selo "abriu esta semana: sim/não".
- "Viu a missão" (README §7, "quando for barato") não foi feito: exigiria registrar a rolagem até o
  bloco.

## 5. Volta para a v1

- App: `localStorage['meu-desempenho-v1'] = '1'` desenha o Meu desempenho de antes (inteiro).
- Cockpit: `localStorage['desenvolvimento-v1'] = '1'` desenha o espelho do 1:1 de 07/10 (GV2.DV).

## 6. Como conferir o banco depois de aplicar (só leitura)

```sql
-- feriado não quebra: 20/11/2026 (sexta) e 20/11/2025 (quinta)
select public.eh_dia_util('2026-11-20'), public.eh_dia_util('2025-11-20');            -- false, false
select public._dv2_recorde_util(array['2025-11-14','2025-11-17','2025-11-18','2025-11-19','2025-11-21']::date[]); -- 5
select public._dv2_dia_da_sequencia(array['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-23']::date[], 5); -- 2026-11-23
select public._dv2_nome_feriado('2026-11-20');                                         -- Consciência Negra
-- o quadro da própria pessoa (logado no app)
select public.desenvolvimento_quadro();
```
A mesma régua da sequência está em TS (`sequenciaUtil`/`recordeUtil`) e é testada com esses casos.
