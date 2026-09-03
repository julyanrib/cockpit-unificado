// scripts/auditar-executivo.js
//
// AUDITORIA ESTATICA DA TELA DO EXECUTIVO.
//
// Pedido do Julyan em 03/09/26: "eu necessito de 100% da tela do executivo funcionando,
// tudo... nao pode ter NADA que nao seja conectado, ou que nao faca sentido... a ideia e ter
// menos gambiarra, fiacao solta, codigo morto".
//
// POR QUE UM SCRIPT E NAO UMA LEITURA: o template tem 49 mil linhas. Ler procurando codigo
// morto encontra o que se lembra de procurar. E as tres classes de defeito abaixo sao
// exatamente as que NAO dao erro nenhum — por isso sobrevivem a build, a teste e a olho.
//
//   FIACAO SOLTA   o JS procura um id/classe que markup nenhum gera. getElementById devolve
//                  null, o `if (!el) return` engole, e a funcao volta calada. Foi assim que
//                  o card do plano do dia ficou seis dias inalcancavel.
//   CODIGO MORTO   funcao declarada que ninguem chama, const declarada que ninguem le. Nao
//                  quebra nada; mente sobre o que a tela faz e cobra manutencao de graca.
//   GESTO ORFAO    data-* emitido no markup que despacho nenhum trata — o clique morto.
//
// Uso:  node scripts/auditar-executivo.js            (resumo)
//       node scripts/auditar-executivo.js --detalhe  (lista item por item)
//
// Sai com 0 sempre: e relatorio, nao guarda. As guardas de check-scripts.js e que barram o
// build; esta varredura serve para ACHAR o que ainda nao tem guarda.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const detalhe = process.argv.includes('--detalhe');
const cru = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');

/* Comentario nao e codigo. Mascaro preservando o COMPRIMENTO para os indices continuarem
   valendo no texto original — a licao que a guarda 10 me ensinou quando validou uma citacao
   dentro de um comentario e reportou verde em cima do defeito que existia para pegar. */
const { mascararComentarios } = require('./mascarar.js');
const cod = mascararComentarios(cru);
const linhaDe = i => cru.slice(0, i).split('\n').length;

const achados = { fiacao: [], morto: [], orfao: [], simetria: [] };

/* ══════════════════════════════════════════════════════════════════════════════════════
   1. IDS: emitidos vs procurados
   ══════════════════════════════════════════════════════════════════════════════════════
   Duas direcoes, e as duas doem:
     procurado e nao emitido  -> fiacao solta (a funcao volta calada)
     emitido e nao procurado  -> id decorativo; nao e defeito por si, mas costuma ser o
                                 rastro de um gesto que foi removido pela metade.
   Ids montados por interpolacao (id="x${i}") nao entram: nao da para decidir estaticamente
   e acusar viraria ruido, que e como uma guarda morre. */
const emitidos = new Set();
for (const m of cod.matchAll(/\bid="([A-Za-z][A-Za-z0-9_-]*)"/g)) emitidos.add(m[1]);
for (const m of cod.matchAll(/\bid='([A-Za-z][A-Za-z0-9_-]*)'/g)) emitidos.add(m[1]);
/* setAttribute('id', ...) e .id = '...' tambem criam id */
for (const m of cod.matchAll(/\.id\s*=\s*['"]([A-Za-z][A-Za-z0-9_-]*)['"]/g)) emitidos.add(m[1]);

const procurados = new Map();
const guardaId = (nome, i) => {
  if (!nome || /\$\{/.test(nome)) return;
  if (!procurados.has(nome)) procurados.set(nome, linhaDe(i));
};
for (const m of cod.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) guardaId(m[1], m.index);
for (const m of cod.matchAll(/querySelector(?:All)?\(\s*['"]#([A-Za-z][A-Za-z0-9_-]*)['"]\s*\)/g)) guardaId(m[1], m.index);

for (const [nome, linha] of procurados) {
  if (!emitidos.has(nome)) {
    achados.fiacao.push({ o_que: 'id #' + nome, linha, por_que: 'o JS procura e markup nenhum gera' });
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   2. GESTOS ORFAOS: data-* emitido que ninguem despacha
   ══════════════════════════════════════════════════════════════════════════════════════
   Um botao com data-foo que nenhum listener le e um clique que nao responde. So conto os
   data-* que aparecem em MARKUP (dentro de atributo) e verifico se o nome aparece tambem em
   posicao de LEITURA (getAttribute, dataset, querySelector com [data-...]).

   CSS CONTA COMO LEITOR, e ignorar isso me deu 20 falsos positivos na primeira rodada:
   metade dos data-* deste arquivo nao e gesto, e ESTADO consumido por seletor de atributo —
   `.agdx-t[data-tone="red"]{--tone:var(--red-dk);}`. Eu procurava `[data-tone]` sem valor e
   nao achava `[data-tone="red"]`, entao acusava de clique morto uma variavel de cor.

   Guarda que acusa o que nao e defeito e guarda que alguem desliga; a partir dali ela
   protege zero. Por isso o criterio e `[data-x` (qualquer seletor de atributo), e nao a
   forma exata. */
const camelDe = s => s.replace(/-([a-z])/g, (x, c) => c.toUpperCase());
const dataEmitidos = new Map();
for (const m of cod.matchAll(/\b(data-[a-z0-9-]+)\s*=/g)) {
  if (!dataEmitidos.has(m[1])) dataEmitidos.set(m[1], linhaDe(m.index));
}
for (const [attr, linha] of dataEmitidos) {
  const sufixo = attr.slice(5);
  const camel = camelDe(sufixo);
  const lido = cod.indexOf("getAttribute('" + attr + "')") >= 0
    || cod.indexOf('getAttribute("' + attr + '")') >= 0
    || cod.indexOf('.dataset.' + camel) >= 0
    || cod.indexOf('dataset[') >= 0 && cod.indexOf("'" + camel + "'") >= 0
    || cod.indexOf('[' + attr) >= 0        /* seletor de atributo: CSS ou querySelector */
    || cod.indexOf('closest(\'[' + attr) >= 0;
  if (!lido) {
    achados.orfao.push({ o_que: attr, linha, por_que: 'emitido no markup e nunca lido — clique sem despacho' });
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   3. CODIGO MORTO: funcao declarada que ninguem chama
   ══════════════════════════════════════════════════════════════════════════════════════
   Conto as ocorrencias do NOME no codigo. Uma unica ocorrencia = so a propria declaracao,
   logo ninguem chama. Duas ou mais podem ser chamada de verdade ou mencao — e por isso o
   corte e conservador: acuso apenas o caso de UMA ocorrencia, que nao tem interpretacao.
   (A licao veio da guarda 14: nome mencionado nao e funcao chamada, e o inverso tambem
   vale — nao da para afirmar uso a partir da mencao.)

   AS SUITES SAO CHAMADORAS, e ignorar isso me custou uma limpeza revertida em 03/09/26.
   scripts/testar-nucleo.js extrai funcoes do template e as executa; o template nao as chama
   em lugar nenhum, entao pelo template elas parecem mortas — e nao estao. Apaguei
   rotuloDeRegistroDaVisita e derrubei tres testes:
     "visita passada sem fechamento = registro incompleto, nao realizada"
     "agendado no futuro nao conta como realizado"
     "visita sem associacao de negocio no HubSpot e nao confirmada"
   Aquelas tres frases sao a especificacao de uma regra comercial. A funcao nao e usada pela
   TELA e e usada pela REGRA — e a regra e o motivo de ela existir.

   Entao a varredura le scripts/ e lib/ tambem. Se um nome aparece la, ele nao e morto: ou o
   teste o usa, ou uma rota do servidor. */
/* Todo o codigo de fora que pode chamar o template: as suites e as rotas. */
const foraDoTemplate = ['scripts', 'lib'].flatMap(dir => {
  const d = path.join(root, dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d)
    .filter(f => f.endsWith('.js') && f !== 'auditar-executivo.js' && f !== 'mascarar.js')
    .map(f => fs.readFileSync(path.join(d, f), 'utf8'));
}).join('\n');
const usadoFora = nome => new RegExp('\\b' + nome.replace(/\$/g, '\\$') + '\\b').test(foraDoTemplate);

const declaradas = new Map();
for (const m of cod.matchAll(/\n(?:async )?function ([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) {
  declaradas.set(m[1], linhaDe(m.index + 1));
}
for (const [nome, linha] of declaradas) {
  const re = new RegExp('\\b' + nome.replace(/\$/g, '\\$') + '\\b', 'g');
  const usos = (cod.match(re) || []).length;
  if (usos <= 1 && !usadoFora(nome)) {
    achados.morto.push({ o_que: 'function ' + nome + '()', linha, por_que: 'declarada e nunca chamada' });
  }
}

/* const/let de escopo de modulo (coluna zero) que ninguem le */
for (const m of cod.matchAll(/\n(?:const|let) ([A-Z][A-Z0-9_]{2,})\s*=/g)) {
  const nome = m[1];
  const re = new RegExp('\\b' + nome + '\\b', 'g');
  const usos = (cod.match(re) || []).length;
  if (usos <= 1 && !usadoFora(nome)) {
    achados.morto.push({ o_que: 'const ' + nome, linha: linhaDe(m.index + 1), por_que: 'declarada e nunca lida' });
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   4. SIMETRIA EXECUTIVO x GESTOR
   ══════════════════════════════════════════════════════════════════════════════════════
   O pedido do Julyan: "todas as correcoes que fizemos do gestor sao espelhadas do
   executivo". A checagem possivel estaticamente e a das TABELAS: se o executivo ESCREVE
   numa coluna que a tela do gestor nunca le, ele preenche no vazio; se o gestor LE uma
   coluna que ninguem escreve, ele cobra o que a tela nao permite registrar. As duas doem, e
   em direcoes opostas. */
const colunasEscritas = new Set();
const colunasLidas = new Set();
/* escrita: chaves de objeto passadas a upsert/update/insert nas tabelas do plano/daily */
for (const m of cod.matchAll(/\b(prometido_[a-z]+|prioridades|contas_alvo|local_atuacao|bloqueios|observacao|status|fechado_em|agenda_resumo|daily_snapshot)\s*:/g)) {
  colunasEscritas.add(m[1]);
}
for (const m of cod.matchAll(/\.(prometido_[a-z]+|prioridades|contas_alvo|local_atuacao|bloqueios|observacao|fechado_em|agenda_resumo|daily_snapshot)\b/g)) {
  colunasLidas.add(m[1]);
}
for (const c of colunasEscritas) {
  if (!colunasLidas.has(c)) {
    achados.simetria.push({ o_que: c, linha: 0, por_que: 'gravada e nunca lida — o executivo preenche no vazio' });
  }
}
for (const c of colunasLidas) {
  if (!colunasEscritas.has(c)) {
    achados.simetria.push({ o_que: c, linha: 0, por_que: 'lida e nunca gravada — a tela cobra o que ninguem registra' });
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════ */
const titulos = {
  fiacao: 'FIACAO SOLTA — o JS procura, o markup nao gera',
  orfao: 'GESTO ORFAO — data-* emitido e nunca despachado',
  morto: 'CODIGO MORTO — declarado e nunca usado',
  simetria: 'ASSIMETRIA EXECUTIVO x GESTOR — coluna gravada sem leitor, ou lida sem escritor'
};
let total = 0;
for (const chave of ['fiacao', 'orfao', 'morto', 'simetria']) {
  const lista = achados[chave];
  total += lista.length;
  console.log('');
  console.log('== ' + titulos[chave] + ': ' + lista.length);
  const mostrar = detalhe ? lista : lista.slice(0, 12);
  mostrar.forEach(a => console.log('   ' + (a.linha ? String(a.linha).padStart(6) : '     -') + '  ' + a.o_que + '  —  ' + a.por_que));
  if (!detalhe && lista.length > mostrar.length) console.log('   ... e mais ' + (lista.length - mostrar.length) + ' (use --detalhe)');
}
console.log('');
console.log('TOTAL: ' + total + ' item(ns) para decidir.');
console.log('Relatorio, nao guarda: nada aqui barra o build. Serve para achar o que ainda nao tem guarda.');
