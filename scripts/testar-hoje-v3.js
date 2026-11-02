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

/* ── a tela: 3 blocos no lugar dos 5 números, das 5 regras, da fila e do "Pronto pra rua?" ── */
const html = HJ3.html();
checar('o Hoje v3 tem as 3 colunas na ordem: plano · sem próximo passo · placar',
  html.indexOf('id="hj3Plano"') > 0 && html.indexOf('id="hj3Plano"') < html.indexOf('id="hj3Sem"') && html.indexOf('id="hj3Sem"') < html.indexOf('id="hj3Placar"'));
/* 02/11/26 (auditoria): "o mesmo dia do app · ao vivo" era jargão de quem fez a tela; o selo diz o que importa */
checar('o selo do ao vivo diz "atualiza sozinho" (sem o jargão "o mesmo dia do app")', html.indexOf('atualiza sozinho') > 0 && html.indexOf('o mesmo dia do app') < 0);
/* ── auditoria 02/11/26 · G10: o acabamento do Cockpit (HJ3.ajustarCockpit), fora da paridade ── */
{
  const aj = n => HJ3.ajustarCockpit(HJ3.diaDoExecutivo(resolver(n)), resolver(n));
  const fer = aj('feriado').cockpit.plano;
  checar('auditoria 02/11 · G10: sem expediente, o plano não cobra "0 de 6 com prova" nem aponta "Próxima porta", e mostra o plano',
    fer.contagem === 'sem expediente · a meta não conta hoje' && !/Próxima porta/.test(fer.titulo) && /Feriado · Consciência Negra · 7 paradas no plano/.test(fer.titulo) && fer.linhas.length === 7 && !fer.linhas.some(l => l.proxima), JSON.stringify({ c: fer.contagem, t: fer.titulo }));
  const eFora = Object.assign({}, resolver('meioDia'), { foraComProva: 3 });
  const pf = HJ3.ajustarCockpit(HJ3.diaDoExecutivo(eFora), eFora).cockpit.plano;
  checar('auditoria 02/11 · G10: a visita com prova fora do plano soma no "com prova" (4 do plano + 3 fora = 7 de 6)', pf.contagem === '7 de 6 com prova · 3 fora do plano', pf.contagem);
  const md = aj('meioDia').cockpit;
  checar('auditoria 02/11 · G10: textos do Cockpit — missão do Desenvolvimento, sem "os 5 números do gestor" e sem "o mesmo componente"',
    md.placar.linhas[1].t === 'a missão da semana do Desenvolvimento' && md.placar.rodape === 'ponto só nasce de prova' && !/o mesmo componente|o mesmo número do app/.test(md.sem.sub), JSON.stringify([md.placar.linhas[1].t, md.placar.rodape, md.sem.sub]));
  checar('auditoria 02/11 · G10: o pintar do Cockpit passa pelo acabamento',
    codigo.indexOf('vm = HJ3.ajustarCockpit(HJ3.diaDoExecutivo(ent), ent);') > 0);
  const f2 = HJ3.faltam({ pts: 0, pos: 2, acima: { nome: 'Marco Teste', pts: 0 } }), f1 = HJ3.faltam({ pts: 0, pos: 1, acima: null });
  checar('auditoria 02/11 · G10: todo mundo com 0 é "a semana começou" (como no DV2), nunca "faltam 1" nem "você lidera"',
    f2.curto === 'a semana começou' && f1.curto === 'a semana começou' && /A semana começou: todo mundo com 0/.test(f2.longo) && HJ3.faltam({ pts: 37, pos: 3, acima: { nome: 'Marco', pts: 46 } }).n === 10, JSON.stringify([f1, f2]));
  const corpoPintar = codigo.slice(codigo.indexOf('HJ3.pintar = function'), codigo.indexOf('HJ3.planoHTML = function'));
  checar('auditoria 02/11 · G10: HJ3.pintar tem try/catch e o erro vira "Tentar de novo"', /try \{/.test(corpoPintar) && /catch \(er\)/.test(corpoPintar) && /Tentar de novo/.test(corpoPintar.slice(corpoPintar.indexOf('catch (er)'))));
  checar('auditoria 02/11 · G10: o Desenvolvimento não manda mais à "disputa completa" do Hoje antigo', codigo.indexOf('a disputa completa') < 0 && codigo.indexOf("a[0] === 'disputa'") < 0);
}
checar('saíram: os 5 números, as 5 regras, a fila e o "Pronto pra rua?"', !/exh4Regras|exhTopo|exhFilaCheia|Pronto pra rua|O que o seu gestor vê/.test(html));
const plano = HJ3.planoHTML(V('meioDia').cockpit.plano);
checar('o plano: a próxima porta, as paradas com a marca e "abrir no app"',
  /Próxima porta: Pizzaria Cerqueira/.test(plano) && (plano.match(/class="hj3-p[ "]/g) || []).length === 7 && /hj3-m is-ok/.test(plano) && /hj3-m is-av/.test(plano) && /data-exh="mapa"/.test(plano));
const placar = HJ3.placarHTML(V('meioDia').cockpit.placar);
checar('o placar: pontos, "faltam", sequência, missão e o fecho de ontem', /Faltam 10 pts para passar Marco/.test(placar) && /Na rua há 5 dias/.test(placar) && /Missão 1 de 2/.test(placar) && /Fechou o dia ontem: sim/.test(placar));
global.GV2 = GV2;
const semZero = HJ3.semHTML(V('zerada').cockpit.sem);
checar('fila zerada: "Todo lead com próximo passo." em verde', /Todo lead com próximo passo\./.test(semZero) && /hj3-zero/.test(semZero));
const sem = HJ3.semHTML(V('meioDia').cockpit.sem);
checar('sem a semana do Planejamento carregada, a coluna avisa e manda ao Planejamento (não quebra)', /hj3-lista/.test(sem) && /data-exh="aba:viewAgenda"/.test(sem));
/* o renderMeuPainel desvia para o Hoje v3 antes de montar o anterior, e a chave local devolve o anterior */
const rmp = tpl.slice(tpl.indexOf('async function renderMeuPainel()'), tpl.indexOf('async function renderMeuPainel()') + 40000);
checar('o Hoje v3 é o padrão e localStorage[\'hoje-v2\'] = \'1\' devolve o anterior',
  rmp.indexOf('GV2.HJ3.usar()') > 0 && rmp.indexOf('GV2.HJ3.usar()') < rmp.indexOf('const metaMensal') && /localStorage\.getItem\('hoje-v2'\) === '1'/.test(codigo));
checar('a medição grava hoje_cockpit / aberto em aberturas_de_tela', /p_tela: 'hoje_cockpit', p_origem: 'menu', p_acao: 'aberto'/.test(codigo));
checar('as linhas do meio são as do Planejamento v3 (pv3LinhaHTML) e o clique vai para PLV3.acao', /GV2\.PLV3\.linhaHTML\(D, l\)/.test(codigo) && /GV2\.PLV3\.acao\(/.test(codigo));
/* na segunda (ou depois de feriado), o fecho lido é o do último dia útil, e a linha diz o dia */
const segunda = Object.assign({}, resolver(Object.keys(F.estados)[0]), { hoje: '2026-11-09', fechoDia: '2026-11-06', fechouOntem: true });
const terca = Object.assign({}, segunda, { hoje: '2026-11-10', fechoDia: '2026-11-09' });
checar('o placar diz "Fechou o dia sex 06/11" na segunda e "ontem" na terça',
  HJ3.diaDoExecutivo(segunda).cockpit.placar.linhas[2].v === 'Fechou o dia sex 06/11: sim' && HJ3.diaDoExecutivo(terca).cockpit.placar.linhas[2].v === 'Fechou o dia ontem: sim');

if (falhas.length) {
  console.log('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.log('  ✗ ' + f));
  console.log('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('Hoje v3: ' + ok + ' ok.');
