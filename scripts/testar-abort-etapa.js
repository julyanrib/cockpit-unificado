// scripts/testar-abort-etapa.js
//
// QUANDO A ESCRITA DA ETAPA É ABORTADA, A TELA NÃO PODE CHUTAR.
// ---------------------------------------------------------------------------------------
// O CASO (04/09/26, 11:03): a Kelly moveu "Guaruba Açaí" de Conversa com Decisor para
// Perdido, com motivo "Outros" e a frase do cliente. A tela mostrou
//   «Falha ao falar com o HubSpot: signal is aborted without reason»
// e o negócio ESTAVA em Perdido no CRM, com o motivo e a observação inteira, modificado às
// 14:03:28Z — o minuto exato do print dela.
//
// A tela afirmou FALHA sobre SUCESSO. Isso é pior que o defeito da véspera (a propriedade
// recusada): lá nada era escrito e a mensagem era honesta. Tela que erra nos dois sentidos
// não serve para decidir nada, e a saída natural do executivo — tentar de novo — escreve
// duas vezes.
//
// O QUE ESTE TESTE PROTEGE, e por que ele existe em vez de um comentário: a regra é uma
// máquina de três estados, e cada um tem uma frase diferente na tela. Se alguém colapsar
// dois deles (o mais tentador é tratar "não sei" como "falhou"), a tela volta a mentir —
// e isso não aparece em nenhuma outra checagem, porque a sintaxe fica válida e o caminho
// só acontece com o servidor lento.
//
// Ele lê a REGRA DO ARQUIVO (a função confirmarEtapaGravada e o bloco do abort dentro de
// gravarPassagemDeEtapa) e exercita os três desfechos.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const tpl = fs.readFileSync(T, 'utf8');

let falhas = 0;
function checar(nome, cond, detalhe) {
  if (cond) { console.log('  ok  ' + nome); return; }
  falhas++;
  console.log('  FALHA  ' + nome + (detalhe ? '  — ' + detalhe : ''));
}

/* ── 1. a função de confirmação existe e devolve os três estados ─────────────────── */
const iC = tpl.indexOf('async function confirmarEtapaGravada(');
checar('confirmarEtapaGravada existe', iC > 0,
  'sem ela o abort volta a ser tratado como falha');
const corpoC = iC > 0 ? tpl.slice(iC, tpl.indexOf('\n}', iC)) : '';
checar('ela distingue "não sei" de "não gravou"',
  /sabe:\s*false/.test(corpoC) && /sabe:\s*true/.test(corpoC),
  'um único booleano de erro não consegue dizer "a leitura também falhou"');
checar('ela compara a etapa lida com a de destino',
  /String\(d\.etapa\)\s*===\s*String\(etapaDestino\)/.test(corpoC),
  'sem comparar, "gravou" seria chute');
checar('ela usa a op ler-etapa', /'ler-etapa'/.test(corpoC));

/* ── 2. o bloco do abort dentro de gravarPassagemDeEtapa ─────────────────────────── */
const iG = tpl.indexOf('async function gravarPassagemDeEtapa(opts) {');
const corpoG = iG > 0 ? tpl.slice(iG, tpl.indexOf('\nasync function', iG + 10)) : '';
checar('gravarPassagemDeEtapa captura o abort em vez de deixar estourar',
  /abortou\s*=\s*true/.test(corpoG),
  'sem o catch, o abort sobe e a tela imprime "signal is aborted without reason"');
checar('gravou → segue como sucesso, marcado como demorado',
  /conf\.gravou[\s\S]{0,200}saida\.ok\s*=\s*true[\s\S]{0,120}saida\.demorou\s*=\s*true/.test(corpoG),
  'sem `demorou` a tela diria que foi instantâneo');
checar('não gravou → diz que o negócio segue na etapa anterior',
  /conf\.sabe[\s\S]{0,300}NÃO foi gravada/.test(corpoG),
  'este é o único caso em que "pode tentar de novo" é seguro');
checar('não sei → manda conferir ANTES de repetir',
  /não consegui confirmar[\s\S]{0,240}RECARREGUE/.test(corpoG),
  'repetir uma escrita que talvez tenha acontecido é o que grava duas vezes');

/* ── 3. o prazo da escrita da etapa ──────────────────────────────────────────────── */
const mPrazo = /'mudar-etapa', dealId: lead\.id[\s\S]{0,200}?\}\), (\d+), 'mudar-etapa-negocio'\)/.exec(corpoG);
checar('o prazo da escrita da etapa está declarado', !!mPrazo);
if (mPrazo) {
  const ms = Number(mPrazo[1]);
  /* 10s estourava no caminho NORMAL: duas idas ao HubSpot (o GET de autorização, que
     nunca confia na etapa que o navegador informou, e o PATCH) mais a partida a frio da
     função na Vercel. E este é o único passo que ESCREVE a etapa — o único que não dá
     para repetir sem risco. */
  checar('e é maior que os 10s que estouraram com a Kelly', ms > 10000,
    'está em ' + ms + 'ms');
}

/* ── 4. a op está registrada na rota ────────────────────────────────────────────── */
const rota = fs.readFileSync(path.join(__dirname, '..', 'api', 'negocio-acao.js'), 'utf8');
checar('a rota aceita a op ler-etapa', /'ler-etapa':\s*require/.test(rota),
  'sem o registro, a confirmação recebe "Ação desconhecida" e cai em "não sei"');

/* ── 5. e a leitura NÃO escreve ─────────────────────────────────────────────────── */
const ler = fs.readFileSync(path.join(__dirname, '..', 'lib', 'acoes-negocio', 'ler-etapa-negocio.js'), 'utf8');
checar('ler-etapa não faz PATCH nem POST no HubSpot',
  !/method:\s*'(PATCH|POST|PUT|DELETE)'/.test(ler.replace(/req\.method/g, '')),
  'uma rota de confirmação que escreve seria o oposto do que ela existe para fazer');
checar('ler-etapa passa pela mesma autorização das escritas',
  /buscarDealAutorizado/.test(ler),
  '"qual a etapa deste negócio" também é informação do CRM de alguém');

console.log('');
if (falhas) { console.error(falhas + ' falha(s) — a tela pode voltar a mentir sobre o Perdido.'); process.exit(1); }
console.log('abort da etapa: a tela confirma antes de afirmar, e os três desfechos têm frase própria.');
