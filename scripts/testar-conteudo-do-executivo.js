/* ══════════════════════════════════════════════════════════════════════════════════════
   O CONTEÚDO DA TELA DO EXECUTIVO — os números que ela mostra (08/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "segue com a revisão de conteúdo aba por aba" — depois de a varredura de
   cliques ter dado 54 famílias vivas e nenhuma morta. A pergunta desta suite é outra:
   cada número que a tela mostra bate com a fonte?

   O MÉTODO que achou os três defeitos abaixo foi recalcular cada número por um caminho
   INDEPENDENTE, direto de DATA.funilLeads, e comparar com o texto na tela. Comparar uma
   função com ela mesma não prova nada.

   ══ OS TRÊS DEFEITOS, e o que cada um fazia ═════════════════════════════════════════
   1. O DENOMINADOR CONTAVA NEGÓCIO FECHADO. O tile do "Hoje" dizia "0/38 com próximo
      passo · Datar os 37 visitados" — 38 e 37 na mesma linha, se contradizendo. A causa é
      `meusNegociosAbertos`, que NÃO filtra etapa apesar do nome: ela varre todas as
      chaves de DATA.funilLeads, e ali estão Perdido, Ganho, Onboarding e Reciclagem.

   2. A FILA DO DIA OFERECIA NEGÓCIO PERDIDO. Pela mesma causa, o "UAU UNIDADE PENHA",
      perdido em 02/09, caía no balde "visitada e sem próximo passo" e aparecia na fila de
      trabalho. Não era número errado: era tarefa falsa no dia dele.

      O CORTE NÃO PODE SER NA FONTE, e isso foi medido: filtrando dentro de
      `meusNegociosAbertos`, o filtro "todas · 37" da fila virava 36 e a lista de perdidos
      do Meu funil ficava VAZIA — ela precisa dos fechados. São 23 pontos de chamada, e o
      experimento mostrou que só DOIS exibiam número inflado. Por isso o corte é nos dois.

   3. O DINHEIRO DO FUNIL IGNORAVA UM CAMPO E MISTURAVA UNIDADES. `fn2Valor` lia
      `valor || mrr || amount`, e as duas linhas que exibem esse número escrevem "/mês".
      Medido no snapshot ao vivo (158 abertos do time): 17 negócios têm `valor_de_mrr`, e
      8 deles não têm nenhum dos outros três — dinheiro invisível. E 5 têm `valor`
      (contrato) junto com `mrr` (mensal), com `valor` sendo lido primeiro: o "em jogo"
      somava contrato de uns com mensalidade de outros.

      Na carteira do Bruno: a tela dizia "R$ 1,2k em jogo (3 de 37 com valor)" e a conta
      independente dá R$ 1.703 em 4 negócios — a DONNA MARIA, de R$ 549 em `valor_de_mrr`,
      sumia. Depois do conserto a tela diz "R$ 1,7k (4 de 37)".
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
function corpoDe(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let d = 0, j = i, viu = false;
  while (j < tpl.length) {
    const c = tpl[j];
    if (c === '{') { d++; viu = true; }
    else if (c === '}') { d--; if (viu && d === 0) return tpl.slice(i, j + 1); }
    j++;
  }
  return '';
}

/* ── 1 · A FONTE CONTINUA INCLUINDO OS FECHADOS, e isso é deliberado ──────────────── */
conferir('meusNegociosAbertos não ganhou filtro de etapa',
  !/function meusNegociosAbertos[\s\S]{0,900}ETAPAS_ABERTAS/.test(tpl),
  'filtrar na fonte esvazia a lista de perdidos do Meu funil e erra o contador da fila — medido em 08/09');

/* ── 2 · OS DOIS CONSUMIDORES QUE PRECISAM DO CORTE ───────────────────────────────── */
conferir('o tile do próximo passo conta só as seis etapas abertas',
  /const FUNIL_ETAPAS_ABERTAS = \[/.test(tpl) &&
  /meusNegociosAbertos\(r\.ownerId\)\s*\n\s*\.filter\(l => FUNIL_ETAPAS_ABERTAS\.indexOf\(String\(l\.stageId\)\) > -1\)/.test(tpl),
  'sem o corte a tela dizia "0/38" com 37 abertos, cobrando próximo passo de um negócio perdido');

conferir('a fila do dia não recebe negócio fechado',
  /const FILA_ETAPAS_ABERTAS = \[/.test(tpl) &&
  /meusNegociosAbertos\(ownerId\)\s*\n\s*\.filter\(l => FILA_ETAPAS_ABERTAS\.indexOf\(String\(l\.stageId\)\) > -1\)/.test(tpl),
  'o perdido caía no balde "visitada e sem próximo passo" — tarefa falsa no dia do executivo');

conferir('as duas listas de etapa aberta têm as seis, e só elas',
  (tpl.match(/'1395880469', '1396005401', '1395880470',\s*\n\s*'1395880471', '1395880472', '1395880473'/g) || []).length >= 2,
  'etapa a mais ou a menos aqui muda silenciosamente todos os números da tela');

/* ── 3 · O DINHEIRO ───────────────────────────────────────────────────────────────── */
const valor = corpoDe('fn2Valor');
conferir('o dinheiro do funil lê os dois campos de mensalidade',
  /lead\.mrr \|\| lead\.valor_de_mrr/.test(valor),
  'são 17 negócios com valor_de_mrr no snapshot, 8 deles sem nenhum outro campo — dinheiro invisível');

conferir('e NÃO soma total de contrato como se fosse mensalidade',
  !/lead\.valor\b/.test(valor) && !/lead\.amount\b/.test(valor),
  'as duas linhas que exibem este número escrevem "/mês"; contrato somado ali mistura unidades');

conferir('o total de contrato não se perdeu: tem leitor próprio',
  /function fn2ValorContrato\(lead\)/.test(tpl) &&
  /lead\.valor \|\| lead\.amount/.test(corpoDe('fn2ValorContrato')),
  'os 5 negócios com contrato e sem mensalidade não podem sumir da tela — só sair do "em jogo"');

conferir('e ele aparece dito como contrato, não como /mês',
  (tpl.match(/' contrato'/g) || []).length >= 2,
  'a palavra é o que separa R$ 8.000 de contrato de R$ 8.000 por mês');

/* ── 4 · O PASSO VENCIDO ACESO (08/09/26) ─────────────────────────────────────────
   Julyan: "acende o passo vencido". O comportamento está provado em testar-nucleo.js,
   que RODA a fila com um lead de tarefa vencida; aqui ficam as três propriedades de
   TELA, que aquele harness não vê. */
const insight = corpoDe('h8Insight');
conferir('o selo de prazo diz que venceu, em vez de "sem prazo marcado"',
  /est\.passoVencido && !est\.temProximoPasso/.test(insight) && /venceu '/.test(insight),
  'a linha da DONNA MARIA dizia "sem prazo marcado" com tarefa datada 03/09 — verdadeiro pela definição e enganoso para quem lê');

conferir('e a frase da ação não repete a data que o selo já deu',
  !/você marcou ' \+/.test(insight),
  'a primeira versão punha data e atraso duas vezes na mesma linha, roubando o espaço do que fazer');

conferir('a frase segue o telefone, como a estrela segue',
  /const temTelAqui = /.test(insight) &&
  /temTelAqui \? 'ligar' : 'visitar'/.test(insight),
  'sem número o código rebaixa a ★ para visita; a frase dizia "ligar hoje" ao lado de um botão escrito "agendar visita"');

/* ── 5 · O DECK ÓRFÃO DA FILA SAIU, E OS CTAs LEVAM PARA A FILA QUE EXISTE ─────────
   `filaDeFollowUpHTML` e `wireFilaDeFollowUp` desenhavam chips de balde e só se chamavam
   entre si; `pl4RiscoDoBalde` e `pl4RotuloDoBalde` apareciam uma única vez no arquivo — a
   própria definição. Três CTAs vivos ("Fazer follow-ups pendentes", "Proteger meus
   quentes", "Confirmar próximo contato") chamavam `irParaFila`, que rolava até
   `#filaFollowUp` e clicava em `[data-fila-balde]`: os dois nós nunca existiram. O clique
   ia para o kanban do Meu funil, sem rolagem e sem foco. */
['filaDeFollowUpHTML', 'wireFilaDeFollowUp', 'pl4RiscoDoBalde', 'pl4RotuloDoBalde',
 'pl4NotaDoDossie', 'pl4BaseDosBaldes', 'pl4BaldeAberto', 'pl4TodasAsLinhas',
 'PL4_LINHAS_VISIVEIS', 'filaFocoInicial'].forEach(nome => {
  /* fora de comentário: as notas desta mudança citam os nomes de propósito */
  const semNota = tpl.replace(/\/\*[\s\S]*?\*\//g, ' ');
  conferir('o deck órfão não voltou: ' + nome,
    (semNota.match(new RegExp('\\b' + nome + '\\b', 'g')) || []).length === 0,
    'ele desenhava uma tela sem chamador, e três CTAs vivos apontavam para ela');
});

const ir = corpoDe('irParaFila');
conferir('irParaFila leva para a fila VIVA, na aba Hoje',
  /activateTab\('viewMeuPainel'\)/.test(ir) && /data-h8-filtro="/.test(ir),
  'ela ia para o Meu funil e procurava #filaFollowUp, que nunca existiu');

/* COBRA O CONTEÚDO DO MAPA, e não só o fallback: a primeira versão desta checagem
   aprovou uma sabotagem que acrescentou `hoje: 'sla'` — um mapeamento que ESCONDE item,
   porque um follow-up de hoje que não estourou a régua não aparece no filtro `sla`.
   Mapear balde em filtro é decisão de produto e cada entrada nova pede revisão. */
conferir('e não promete recorte que possa esconder o item',
  /FILTRO_DO_BALDE\[String\(balde \|\| ''\)\] \|\| 'todas'/.test(ir) &&
  /const FILTRO_DO_BALDE = \{ quente_sem_tarefa: 'quente' \};/.test(ir),
  'a categoria da linha é por NEGÓCIO (sla/quente/follow); balde não mapeia 1-para-1 nela');

conferir('a rolagem acontece DEPOIS do filtro',
  ir.indexOf('chip.click()') < ir.indexOf('smoothScrollTo'),
  'clicar repinta a fila; rolar antes aterrissa onde o cartão estava');

/* ESTA CHECAGEM DIZIA O CONTRÁRIO, e estava errada desde que foi escrita.
   Ela exigia que `.fila-cta` SOBREVIVESSE "porque tem uso vivo" — e os usos que ela
   contava estavam todos dentro de `itemDaFilaHTML`, uma função que nenhum caminho da tela
   chamava. Contar `class="..."` não distingue markup vivo de markup de código morto, e é
   assim que uma guarda passa a proteger justamente o que deveria acusar.
   Com a função fora (11/09/26), a regra correta é a oposta: classe sem emissor não fica no
   CSS — muito menos nas listas de piso de toque, que são o que diz se dá para usar isto na
   rua, com o celular na mão. Eram três listas citando este botão. */
conferir('a CTA da fila saiu do CSS junto com quem a desenhava',
  !/\.fila-cta\{/.test(tpl) && (tpl.match(/class="[^"]*fila-cta/g) || []).length === 0
    && !/\.fila-cta,/.test(tpl),
  'itemDaFilaHTML saiu; classe sem emissor no piso de 44px reserva dedo para botão que não existe');

/* ── 6 · O QUE NÃO SE TOCA ────────────────────────────────────────────────────────── */
conferir('nada foi escrito no HubSpot por causa disto',
  !/from\(['"]?hubspot/.test(valor) && !/api\/criar/.test(valor),
  'amount e mrr são o que o RPA/ASAAS lê para gerar o link de cobrança: aqui só se lê');

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('conteúdo do executivo: ' + ok + ' checagens ok — o denominador não conta negócio fechado, a fila não oferece perdido, e o dinheiro é mensal com os dois campos.');
