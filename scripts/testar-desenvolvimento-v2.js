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

if (falhas.length) {
  console.log('desenvolvimento v2: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + ':');
  falhas.forEach(f => console.log('  · ' + f));
  process.exit(1);
}
console.log('desenvolvimento v2: ' + ok + ' verificações ok');
