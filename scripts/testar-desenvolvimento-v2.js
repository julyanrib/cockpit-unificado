/* ══ SUÍTE DO DESENVOLVIMENTO v2, O JOGO DA CARREIRA (Desenvolvimento v2, 01/11/26) ══════════════
   A aba Desenvolvimento do executivo é o espelho do "Meu desempenho" do app: os dois leem
   desenvolvimento_quadro() (migração 0240 do app) e cada lado só formata. A regra 2 do handoff pede
   "uma função por bloco, usada pelo app e pelo Cockpit; prove com teste que os números são iguais".
   Os dois repositórios não importam um do outro, então a prova é esta: a fixture e a saída esperada
   de scripts/fixtures/desenvolvimento-v2/ são as MESMAS de src/utils/desenvolvimentoV2.*.json no app,
   onde a suíte desenvolvimentoV2.teste.ts formata os mesmos quadros com o TS. Aqui o DV2 (o JS do
   gv2-js) formata e tem de dar exatamente a mesma saída.

   Também protege as regras da tela, não o desenho: ninguém exposto como pior, novato em "você contra
   você", feriado não quebra, fonte fora é "—" com o nome, nada de emoji, a volta ao v1 pela chave
   local, e as entradas (selo no menu, pílula no Hoje, toast ao vivo, a linha do 1:1 na Pessoas).
   ══════════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };

const ini = tpl.indexOf('<script id="gv2-js">');
const fim = tpl.indexOf('</script><!-- /gv2-js -->');
const codigo = tpl.slice(ini + '<script id="gv2-js">'.length, fim).replace('GV2.instalar();', '');
checar('o bloco gv2 está no template e sem crase (guarda 26)', ini > 0 && fim > ini && codigo.indexOf('`') < 0);

/* o mínimo para o bloco carregar sem tela */
global.supa = null;
global.DATA = { reps: [] };
global.sessaoAtual = { role: 'rep', nome: 'Alfa Teste', ownerId: '101' };
global.esc = v => String(v == null ? '' : v);
global.document = { documentElement: { getAttribute: () => 'sol' }, addEventListener: () => {}, getElementById: () => null, querySelector: () => null };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
const GV2 = new Function(codigo + '\nreturn GV2;')();
const DV2 = GV2.DV2;
checar('o DV2 existe no gv2-js', !!(DV2 && DV2.montar));

/* ── a paridade com o app ── */
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'desenvolvimento-v2', 'fixture.json'), 'utf8'));
const esperado = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'desenvolvimento-v2', 'esperado.json'), 'utf8'));
/* "$base" herda o estado indicado (só o primeiro nível) e "$faixas" vira a tabela do variável — a MESMA
   resolução da suíte do app */
function resolver(nome) {
  const e = F.estados[nome];
  const base = e.$base ? resolver(String(e.$base)) : {};
  const q = Object.assign({}, base, e);
  delete q.$base;
  if (q.variavel && q.variavel.faixas === '$faixas') q.variavel = Object.assign({}, q.variavel, { faixas: F.faixas });
  return q;
}
/* igualdade de valor (a ordem das chaves não importa; a das listas, sim) */
function difere(a, b, onde) {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return onde + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b);
  if (Array.isArray(a) !== Array.isArray(b)) return onde + ': lista × objeto';
  const ks = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
  for (const k of ks) { const d = difere(a[k], b[k], onde + '.' + k); if (d) return d; }
  return null;
}
const saida = {};
Object.keys(F.estados).forEach(function (nome) {
  const q = resolver(nome);
  const vm = DV2.montar(q, F.capitulos);
  saida[nome] = { vm: vm, pushSegunda: DV2.pushSegunda(q), pushSexta: DV2.pushSexta(q), toasts: vm.novas.map(DV2.toastDaConquista) };
  const d = difere(JSON.parse(JSON.stringify(saida[nome])), esperado[nome], nome);
  checar('paridade app × Cockpit · ' + nome, !d, d);
});
checar('a esperada cobre os mesmos estados da fixture', Object.keys(esperado).sort().join() === Object.keys(F.estados).sort().join());
/* com o app ao lado (o checkout do dev), a fixture e a esperada são os mesmos bytes */
const app = path.join(raiz, '..', 'PWA-app-outbound', 'src', 'utils');
if (fs.existsSync(path.join(app, 'desenvolvimentoV2.esperado.json'))) {
  const n = s => s.replace(/\r\n/g, '\n');
  checar('a esperada do app é a mesma deste repositório',
    n(fs.readFileSync(path.join(app, 'desenvolvimentoV2.esperado.json'), 'utf8')) === n(fs.readFileSync(path.join(__dirname, 'fixtures', 'desenvolvimento-v2', 'esperado.json'), 'utf8')));
}

/* ── as regras, pelo lado do Cockpit ── */
const V = n => saida[n].vm;
checar('ninguém abaixo do 3º no pódio', Object.keys(saida).every(n => V(n).semana.podio.length <= 3));
checar('novato: você contra você, sem pódio', V('novato').semana.podio.length === 0 && /sua disputa é com você/.test(V('novato').semana.proximo));
checar('feriado não quebra: a nota em âmbar', V('feriado2025').sequencias.notaTom === 'av' && /qui 20\/11 \(Consciência Negra\)/.test(V('feriado2025').sequencias.nota));
checar('fonte fora: "—" e o nome da fonte', V('fora').semana.pts === '—' && /placar_da_semana/.test(V('fora').semana.posTexto) && /HubSpot/.test(V('fora').variavel.sub));
checar('nenhum texto diz "último" ou "pior"', !/último|pior/i.test(JSON.stringify(saida)));
checar('zero emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(JSON.stringify(saida)));

/* auditoria 02/11/26 · G7: sem meta no mês, a escada não diz "meta 0" nem "Faltam 0 vendas para a meta" */
{
  const q0 = resolver('quarta');
  const qSem = Object.assign({}, q0, { variavel: Object.assign({}, q0.variavel, { meta: 0, vendas: 40 }) });
  const E = DV2.escadaDoVariavel(qSem);
  checar('auditoria 02/11 · G7: escada sem meta diz "sem meta", nunca "meta 0" nem "Faltam 0"',
    /^sem meta/.test(E.meta) && !/Faltam 0/.test(E.sub) && !/meta 0/.test(JSON.stringify(E)), JSON.stringify({ meta: E.meta, sub: E.sub }));
}

/* ── a tela: a grade de 12 colunas, os blocos na ordem, a celebração e a volta ao v1 ── */
const html = DV2.html(V('quarta'));
const ordem = ['dv2-um', 'A SEMANA', 'MISSÃO DA SEMANA', 'Sequências', 'O mês · seu variável', 'o chefão', 'Sua carreira', 'id="dv2Colecao"', 'Você contra você'].map(t => html.indexOf(t));
checar('os 9 blocos na ordem do README', ordem.every((x, i) => x > 0 && (i === 0 || x > ordem[i - 1])), JSON.stringify(ordem));
const spans = Array.from(html.matchAll(/dv2-b dv2-s(\d+)/g)).map(m => m[1]).join(' ');
checar('os spans da grade: 12 · 5 · 4 · 3 · 7 · 5 · 6 · 6 · 12', spans === '12 5 4 3 7 5 6 6 12', spans);
checar('missão cumprida: o círculo entra com a escala e a coleção destaca a nova',
  /dv2-cel-c/.test(DV2.html(V('missao'))) && /dv2-med is-ganha is-nova/.test(DV2.html(V('missao'))));
checar('a celebração dura 0,6 s e some com "reduzir movimento"',
  /\.dv2-cel-c\{[^}]*animation:dv2-entra \.6s/.test(tpl) && /@media \(prefers-reduced-motion:reduce\)\{\.dv2-cel-c,\.dv2-toast,\.dv2-med\.is-nova \.dv2-med-c\{animation:none !important;\}\}/.test(tpl));
checar('alvo de clique ≥ 40 px nos botões da aba', /\.dv2-bt\{min-height:40px/.test(tpl) && /\.dv2-link\{min-height:40px/.test(tpl) && /\.dv2-pil\{min-height:40px/.test(tpl));
checar('nenhum bloco vazio: com tudo fora, cada bloco diz a fonte', ['placar_da_semana', 'HubSpot', 'rampa_quadro', 'conquistas'].every(f => DV2.html(V('fora')).indexOf(f) > 0));
checar('a volta ao v1: localStorage desenvolvimento-v1 = 1 desenha o DV antigo',
  /if \(GV2\.DV2 && !GV2\.DV2\.querV1\(\)\) return GV2\.DV2\.render\(el\);\n    return GV2\.DV\.render\(el\);/.test(tpl) && /localStorage\.getItem\('desenvolvimento-v1'\) === '1'/.test(codigo));

/* ── as entradas ── */
checar('selo no menu: "1 nova" ao lado de Desenvolvimento, e some quando a coleção grava a vista',
  /selo\.textContent = n === 1 \? '1 nova' : n \+ ' novas';/.test(codigo) && /marcar_conquistas_vistas/.test(codigo));
checar('pílula no Hoje do Cockpit: o lugar no topo do Hoje e a pintura depois da Hoje',
  tpl.indexOf('<span id="dv2PilHoje"></span>') > 0 && tpl.indexOf('GV2.DV2.pintarPilula();') > 0);
checar('toast ao vivo: o sinal do app chama o DV2, com 420 px no canto e 8 s',
  tpl.indexOf('GV2.DV2.aoVivo([String(s.tipo)]);') > 0 && /\.dv2-toast\{position:fixed;right:24px;bottom:24px;[^}]*width:420px/.test(tpl) && /setTimeout\(function \(\) \{ if \(el\.parentNode\) el\.remove\(\); \}, 8000\);/.test(codigo));
checar('a medição: a abertura grava a origem (menu, selo_menu, pílula ou toast)',
  /supa\.rpc\('registrar_abertura', \{ p_tela: 'desenvolvimento', p_origem: abertura \}\)/.test(codigo));
const g = DV2.htmlDoGestor(resolver('missao'), F.capitulos);
checar('Pessoas do gestor: "conquistou desde o último 1:1" com a data e o selo "abriu esta semana"',
  /Conquistou desde o último 1:1 \(03\/11\)/.test(g) && /Registro na hora \(11\/11\)/.test(g) && /abriu esta semana: não/.test(g), g);
const g2 = DV2.htmlDoGestor(Object.assign({}, resolver('quarta'), { aberturas: { semana: 2, ultima: '2026-11-10T12:00:00Z' } }), F.capitulos);
checar('abriu esta semana: sim, com a última abertura', /abriu esta semana: sim/.test(g2) && /última abertura 10\/11/.test(g2));

if (falhas.length) {
  console.log('desenvolvimento v2: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + ':');
  falhas.forEach(f => console.log('  · ' + f));
  process.exit(1);
}
console.log('desenvolvimento v2: ' + ok + ' verificações ok');
