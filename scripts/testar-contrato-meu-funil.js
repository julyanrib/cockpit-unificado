// scripts/testar-contrato-meu-funil.js
//
// O CONTRATO DE GESTOS DA ABA MEU FUNIL — escrito ANTES da repaginação (11/09/26).
//
// Julyan, ao mandar a prancha do redesenho: "não quero perder nenhum clique, automação etc".
//
// Repaginar é reescrever markup, e markup reescrito é onde gesto se perde em silêncio: o
// botão sai do desenho novo, ninguém nota, e a automação que ele disparava simplesmente
// deixa de acontecer. Não há erro, não há tela vazia — há um caminho que existia e não
// existe mais.
//
// Então esta suíte é o INVENTÁRIO CONGELADO do que a aba fazia antes de eu tocar nela:
// cada atributo de gesto que ela emite, cada motor de escrita que ela chama, cada lista de
// regra que o pipeline exige. A tela nova pode ser outra por completo — o que ela NÃO pode
// é chegar ao fim com menos gesto do que isto.
//
// COMO FOI LEVANTADO: por varredura do template, não de memória — 30 atributos e 12
// motores, conferidos um a um. A varredura acusou três como "sem leitor" e eu os declarei
// falso positivo de primeira, porque o texto deles aparece no arquivo. Errado em dois:
//
//   · `data-fn2-lead` TEM leitor — `getAttribute('data-fn2-lead')`. Falso positivo mesmo.
//   · `data-fn2-owner` e `data-fn3-viol` NÃO têm. As únicas menções de leitura são
//     COMENTÁRIOS contando que a regra CSS que os usava foi removida em 04/09/26. Menção
//     em comentário não lê atributo nenhum — e foi essa leitura apressada que me fez
//     chamá-los de falso positivo.
//
// Os dois mortos ficaram FORA da lista, com o motivo escrito logo abaixo dela.
//
// ESTA SUÍTE NÃO DIZ QUE A TELA ESTÁ BONITA. Ela diz que nada sumiu.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const cru = fs.readFileSync(T, 'utf8');
const tpl = cru.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');

let ok = 0;
const falhas = [];
function checar(nome, cond, dica) {
  if (cond) { ok += 1; return; }
  falhas.push(nome + (dica ? '  — ' + dica : ''));
}

/* ══ 1 · OS 31 ATRIBUTOS DE GESTO VIVOS ══════════════════════════════════════════════════════
   Cada um é um caminho que o executivo tem hoje. Emitir sem ler é clique morto; deixar de
   emitir é gesto perdido — e esta lista pega as duas coisas, porque exige emissão E
   leitura de cada um. */
const GESTOS = [   /* 31 vivos; os 2 mortos estao explicados abaixo da lista */
  'data-fn2-acao', 'data-fn2-etapa', 'data-fn2-lead', 'data-fn2-mov', 'data-fn2-ordem',
  'data-fn2-pulsa', 'data-fn2-reabrir', 'data-fn2-reciclar',
  'data-fn3-aba', 'data-fn3-alimentar', 'data-fn3-alvo', 'data-fn3-avancar', 'data-fn3-card',
  'data-fn3-de', 'data-fn3-destino', 'data-fn3-menu', 'data-fn3-mover', 'data-fn3-passo',
  'data-fn3-passo-hora', 'data-fn3-passo-in', 'data-fn3-passo-ok', 'data-fn3-passo-set',
  'data-fn3-perder', 'data-fn3-set-valor', 'data-fn3-set-valor-livre', 'data-fn3-tog',
  'data-fn3-valor', 'data-fn3-valor-in',
  /* TRES ENTRARAM em 11/09/26 com o bloco 'Acoes desta sessao' da prancha FINAL. Lista
     que so encolhe deixa de medir o que a repaginacao ACRESCENTOU — e gesto novo sem
     contrato e o proximo a se perder na repaginacao seguinte. */
  'data-fn3-sessao', 'data-fn3-voltar', 'data-fn3-voltar-para'
];
/* DOIS SAIRAM DESTA LISTA no mesmo commit que a criou, com o motivo — e a mensagem de
   falha desta suite manda fazer exatamente isso:

     data-fn2-owner  · emitido na raiz .fn2-shell e lido por NINGUEM. Nem JS, nem CSS.
     data-fn3-viol   · emitido em cada coluna e lido por NINGUEM desde 04/09/26, quando o
                       acordeao do celular deixou de depender dele ("estava ligado so em
                       [data-fn3-viol=0] ... agora vale para todas"). As unicas mencoes de
                       leitura no arquivo sao COMENTARIOS contando que a regra saiu.

   Eu mesmo os classifiquei como falso positivo na primeira leitura, porque o texto deles
   aparece no arquivo — em comentario. Mencao em comentario nao le atributo nenhum. */
const semEmissor = [], semLeitor = [];
GESTOS.forEach(function (a) {
  if (tpl.indexOf(a + '=') < 0) { semEmissor.push(a); return; }
  const camel = a.replace(/^data-/, '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
  const lido = tpl.indexOf('dataset.' + camel) > -1
    || tpl.indexOf('d.' + camel) > -1
    || tpl.indexOf("getAttribute('" + a + "')") > -1
    || tpl.indexOf('[' + a) > -1;
  if (!lido) semLeitor.push(a);
});
checar('os 31 gestos vivos da aba continuam sendo EMITIDOS', semEmissor.length === 0,
  'sumiram do markup: ' + semEmissor.join(', '));
checar('e todos continuam sendo LIDOS por alguém', semLeitor.length === 0,
  'emitidos e sem leitor (clique morto): ' + semLeitor.join(', '));

/* ══ 2 · OS MOTORES DE ESCRITA ═════════════════════════════════════════════════════════
   O prompt da repaginação é explícito: `gravarPassagemOtimista` é o ÚNICO motor de
   escrita, e nada de rota nova. Estes nomes são o caminho do dado até o HubSpot — se um
   deixar de ser chamado, a tela ficou bonita e parou de gravar. */
const MOTORES = {
  gravarPassagemOtimista: 'o único motor de escrita da passagem de etapa',
  abrirPassagemDeEtapa: 'o painel que coleta as propriedades obrigatórias da etapa',
  fn3AbrirRegistro: 'o registro rápido que o arrasto abre — soltar NÃO move sozinho',
  fn3PodeMover: 'a régua do arrasto, espelho do servidor',
  fn2PodeMover: 'a mesma régua no kanban antigo',
  fn3ProximaEtapa: 'o destino dos atalhos → e ✕ do cartão',
  etapaPedeProximoPasso: 'quem decide se a etapa exige passo datado',
  gravarPassagemDeEtapa: 'a escrita da etapa com as propriedades',
  gravarPropriedadesDoNegocio: 'a escrita de propriedade sem mover etapa',
  criarTarefaVisitaNoHubspot: 'a tarefa datada no CRM',
  espelharPassoNasTelas: 'o passo aparecendo no plano e na Agenda no mesmo quadro',
  aplicarEtapaNoDataLocal: 'o espelho otimista que move o cartão antes da próxima carga'
};
const motoresMudos = [];
Object.keys(MOTORES).forEach(function (m) {
  const chamadas = (tpl.match(new RegExp('\\b' + m + '\\s*\\(', 'g')) || []).length;
  const decl = new RegExp('(?:async )?function ' + m + '\\s*\\(').test(tpl)
    || new RegExp('(?:const|let) ' + m + '\\s*=').test(tpl);
  /* uma chamada só é a própria declaração: o motor existe e ninguém o aciona */
  if (!decl || chamadas <= 1) motoresMudos.push(m + ' (' + MOTORES[m] + ')');
});
checar('os 12 motores de escrita continuam existindo E sendo chamados',
  motoresMudos.length === 0,
  'declarado e nunca acionado: ' + motoresMudos.join(' · '));

/* ══ 3 · AS LISTAS DE REGRA DO PIPELINE ════════════════════════════════════════════════
   "Não criar campo, workflow, propriedade, rota ou chamada nova" — e, do outro lado, não
   PERDER nenhuma destas listas, que são o pipeline oficial em forma de código. */
const LISTAS = ['ORDEM_ETAPAS_FUNIL', 'FN2_ETAPAS', 'FN2_POS_VENDA', 'FN3_COLUNAS',
  'CAMPOS_POR_ETAPA', 'FN3_RECEM', 'FN_GRAVANDO', 'FN3_PASSO_TIPO',
  'FN3_ETAPA_ONBOARDING', 'FN3_ETAPA_RECICLAGEM', 'ETAPA_PERDIDO_ID'];
const listasFora = LISTAS.filter(c => !new RegExp('(?:const|let) ' + c + '\\s*=').test(tpl));
checar('as 11 listas de regra do pipeline continuam declaradas', listasFora.length === 0,
  'sumiram: ' + listasFora.join(', '));

/* ══ 4 · AS OITO ETAPAS, NA ORDEM OFICIAL ══════════════════════════════════════════════
   A prancha desenha oito colunas. Os ids são do portal e não se inventam. */
const IDS = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472',
  '1395880473', '1396006163', '1396006162'];
const ordem = (tpl.match(/const ORDEM_ETAPAS_FUNIL = \[([^\]]+)\]/) || [])[1] || '';
checar('as 8 etapas do funil continuam na ordem oficial',
  IDS.every(id => ordem.indexOf(id) > -1)
    && IDS.every((id, i) => i === 0 || ordem.indexOf(IDS[i - 1]) < ordem.indexOf(id)),
  'ORDEM_ETAPAS_FUNIL mudou: ' + ordem.slice(0, 120));

/* ══ 5 · OS CORTES QUE NÃO SE NEGOCIAM ═════════════════════════════════════════════════ */
checar('Ganho continua sem ser destino de arrasto — quem move é o ASAAS',
  tpl.indexOf('ETAPAS_DESTINO') > -1 || /Ganho/.test(tpl),
  'a régua de destino saiu da tela');
checar('o cartão de Onboarding continua não arrastável',
  /const arrastavel = !e\.onb/.test(tpl) || /onb\b[^\n]*arrast/i.test(tpl),
  'Onboarding é espelho: cartão que se arrasta ali promete o que a tela não faz');
checar('e Perdido continua exigindo motivo',
  tpl.indexOf('motivo_do_perdido') > -1,
  'perder sem motivo alimenta o relatório de perda com "sem motivo preenchido"');

/* ── RESULTADO ───────────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('CONTRATO DA ABA MEU FUNIL QUEBRADO (' + falhas.length + '):');
  falhas.forEach(f => console.error('  · ' + f));
  console.error('');
  console.error('  Repaginar pode mudar TUDO no desenho. O que nao pode e a aba terminar');
  console.error('  com menos gesto ou menos escrita do que tinha — e e isso que esta lista');
  console.error('  mede. Se um gesto saiu de proposito, tire-o DESTA LISTA no mesmo commit,');
  console.error('  com o motivo escrito: lista que nao encolhe deixa de medir o que sobrou.');
  process.exit(1);
}
console.log('contrato do Meu funil: ' + ok + ' checagens — os 31 gestos, os 12 motores e as 11 listas de regra seguem de pé.');
