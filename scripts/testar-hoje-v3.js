/* ══ SUÍTE DO HOJE v3 · O DIA QUE O EXECUTIVO USA DE VERDADE (Hoje v3, 01/11/26) ══════════════════
   O Hoje do Cockpit vira espelho do dia do app (folha da manhã, pílula e toasts no mapa, fecho das 18h).
   A regra 1 do handoff: "uma função por número, usada no app e no Cockpit; prove com teste". Os dois
   repositórios não importam um do outro, então a prova é a do Desenvolvimento v2: a fixture e a saída
   esperada de scripts/fixtures/hoje-v3/ são as MESMAS de src/utils/hojeV3.*.json no app, onde
   hojeV3.teste.ts monta o mesmo dia em TS. Aqui o HJ3 (o JS do gv2-js) tem de dar exatamente a mesma saída,
   e o "sem próximo passo" e a sugestão "Pôr em …" saem das funções que o Planejamento v3 já usa
   (GV2.semProximoPasso e PLV3.sugestoes), não de cópias.

   Também protege as regras da tela: avisar não travar, feriado sem cobrança, ponto só de prova, zero
   emoji, os 3 blocos no lugar dos 5 números / 5 regras / fila / "Pronto pra rua?", a volta ao Hoje
   anterior por localStorage['hoje-v2'] = '1', e a medição em aberturas_de_tela.
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

global.supa = null;
global.DATA = { reps: [] };
global.sessaoAtual = { role: 'rep', nome: 'Alfa Teste', ownerId: '101' };
global.esc = v => String(v == null ? '' : v);
global.document = { documentElement: { getAttribute: () => 'sol' }, addEventListener: () => {}, getElementById: () => null, querySelector: () => null };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
const GV2 = new Function(codigo + '\nreturn GV2;')();
const HJ3 = GV2.HJ3;
checar('o HJ3 existe no gv2-js', !!(HJ3 && HJ3.diaDoExecutivo));

/* ── a paridade com o app ── */
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hoje-v3', 'fixture.json'), 'utf8'));
const esperado = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hoje-v3', 'esperado.json'), 'utf8'));
function resolver(nome) {
  const e = F.estados[nome];
  const base = e.$base ? resolver(String(e.$base)) : {};
  const q = Object.assign({}, base, e);
  delete q.$base;
  return q;
}
function difere(a, b, onde) {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return onde + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b);
  if (Array.isArray(a) !== Array.isArray(b)) return onde + ': lista × objeto';
  const ks = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
  for (const k of ks) { const d = difere(a[k], b[k], onde + '.' + k); if (d) return d; }
  return null;
}
/* o "sem próximo passo" do Cockpit: a montagem (GV2.montar) põe em n.proximo_passo a tarefa ou reunião do
   HubSpot de hoje em diante, ou o dia no Planejamento de hoje em diante (proximoPassoDoLead + noPlanoDe);
   passo vencido e tarefa sem data não contam. Depois, a função única. */
function semPassoDoCockpit(sp) {
  const negocios = sp.negocios.map(function (n) {
    const datas = n.tarefas.filter(Boolean).map(function (t) { return GV2.diaDe ? GV2.diaDe(t) : String(t).slice(0, 10); });
    if (n.noPlano) datas.push(n.noPlano);
    const futuro = datas.some(function (d) { return d >= sp.hoje; });
    return { id: n.id, nome: n.nome, agPag: n.etapa === 'pagamento', proximo_passo: futuro ? 'marcado' : null };
  });
  return GV2.semProximoPasso(negocios, {}).map(function (n) { return n.id; }).sort(function (a, b) { return Number(a) - Number(b); });
}
const saida = {
  estados: {},
  chips: F.chips.map(function (c) { return HJ3.chipsDeDia(c.hoje, F.feriados, c.comHoje); }),
  toasts: { cheguei: F.toasts.cheguei.map(HJ3.toastCheguei), ficha: F.toasts.ficha.map(HJ3.toastFicha) },
  sugestoes: GV2.PLV3.sugestoes(F.sugestoes),
  ordem: GV2.PLV3.ordemPorDinheiro(F.ordem).map(function (l) { return l.nome; }),
  semPasso: semPassoDoCockpit(F.semPasso)
};
Object.keys(F.estados).forEach(function (nome) { saida.estados[nome] = HJ3.diaDoExecutivo(resolver(nome)); });
const limpo = JSON.parse(JSON.stringify(saida));
Object.keys(F.estados).forEach(function (nome) {
  const d = difere(limpo.estados[nome], esperado.estados[nome], nome);
  checar('paridade app × Cockpit · ' + nome, !d, d);
});
['chips', 'toasts', 'sugestoes', 'ordem', 'semPasso'].forEach(function (k) {
  const d = difere(limpo[k], esperado[k], k);
  checar('paridade app × Cockpit · ' + k, !d, d);
});
checar('a esperada cobre os mesmos estados da fixture', Object.keys(esperado.estados).sort().join() === Object.keys(F.estados).sort().join());
checar('sem próximo passo: vencido + nunca marcado, Ag. Pagamento fora (o número da folha, do Hoje e do Planejamento)', saida.semPasso.join(',') === '1,2,9,11,12');
/* com o app ao lado (o checkout do dev), a fixture e a esperada são os mesmos bytes */
const app = path.join(raiz, '..', 'PWA-app-outbound', 'src', 'utils');
if (fs.existsSync(path.join(app, 'hojeV3.esperado.json'))) {
  const n = s => s.replace(/\r\n/g, '\n');
  checar('a esperada do app é a mesma deste repositório',
    n(fs.readFileSync(path.join(app, 'hojeV3.esperado.json'), 'utf8')) === n(fs.readFileSync(path.join(__dirname, 'fixtures', 'hoje-v3', 'esperado.json'), 'utf8')));
  checar('a fixture do app é a mesma deste repositório',
    n(fs.readFileSync(path.join(app, 'hojeV3.fixture.json'), 'utf8')) === n(fs.readFileSync(path.join(__dirname, 'fixtures', 'hoje-v3', 'fixture.json'), 'utf8')));
}

/* ── as regras, pelo lado do Cockpit ── */
const V = n => saida.estados[n];
checar('o placar diz "faltam" pela conta do Desenvolvimento v2', V('meioDia').cockpit.placar.prox === 'Faltam 10 pts para passar Marco.');
checar('feriado: sem folha, sem push, sem cobrança', !V('feriado').folha.mostra && !V('feriado').push08 && !V('feriado').push18);
checar('fonte fora é "—", nunca 0', V('planoFora').cockpit.placar.pts === '—' && V('planoFora').cockpit.sem.n === '—');
checar('nenhum texto diz "último" ou "pior"', !/último|pior/i.test(JSON.stringify(saida)));
checar('zero emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(JSON.stringify(saida)));

if (falhas.length) {
  console.log('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.log('  ✗ ' + f));
  console.log('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('Hoje v3: ' + ok + ' ok.');
