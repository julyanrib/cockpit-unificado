/* ============================================================================
   FERIADO NA VISÃO DO EXECUTIVO (auditoria 01/11/26)

   Na véspera de Finados (segunda 02/11/26) o Planejamento do executivo pedia 30 visitas e
   "dias cobertos x de 5" numa semana de 4 dias úteis, e a régua da cadência contava o feriado
   como dia útil. O gestor já sabia dos feriados (GV2.feriadosDoAno); o executivo não. Esta suíte
   garante que:
     · o calendário do executivo (feriadosDoAnoBR) é o mesmo do gestor, ano a ano;
     · a régua (cadEhUtil, cadSomarUteis), o "fim de semana" (isWeekend) e os atalhos de data
       pulam o feriado;
     · a semana do Planejamento marca o feriado e a meta e os dias cobertos contam só os úteis.
   Rode com: node scripts/testar-feriados-executivo.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');
let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };

function recortar(fonte, nome) {
  const assinatura = 'function ' + nome + '(';
  const i = fonte.indexOf(assinatura);
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe.'); process.exit(1); }
  if (fonte.indexOf(assinatura, i + 1) > 0) { console.error('FALHA: ' + nome + ' aparece duas vezes.'); process.exit(1); }
  let d = 0, j = i, viu = false;
  while (j < fonte.length) {
    const c = fonte[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return fonte.slice(i, j + 1);
}

const ctx = {
  addDays: function (iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
  agendaP2: function (n) { return String(n).padStart(2, '0'); }
};
vm.createContext(ctx);
vm.runInContext('const FERIADOS_BR_CACHE = {};', ctx);
['feriadosDoAnoBR', 'ehFeriadoBR', 'isoLocalBR', 'cadEhUtil', 'cadSomarUteis', 'cadUteisEntre', 'isWeekend', 'pl6Dias', 'h10ProximoUtil', 'h10UtilAnterior']
  .forEach(function (f) { vm.runInContext(recortar(tpl, f), ctx); });

/* o calendário do gestor, do bloco gv2, para comparar */
const ini = tpl.indexOf('<script id="gv2-js">');
const fim = tpl.indexOf('</script><!-- /gv2-js -->');
const gv2 = tpl.slice(ini + '<script id="gv2-js">'.length, fim);
const ctxG = { GV2: {} };
vm.createContext(ctxG);
const pegaGV2 = function (nome) {
  const a = gv2.indexOf('GV2.' + nome + ' = function');
  let d = 0, j = gv2.indexOf('{', a), viu = false;
  while (j < gv2.length) { const c = gv2[j]; if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; } j++; }
  return gv2.slice(a, j + 1) + ';';
};
vm.runInContext(pegaGV2('somaDias') + pegaGV2('feriadosDoAno'), ctxG);

let iguais = true;
for (let y = 2025; y <= 2032; y++) {
  const a = ctx.feriadosDoAnoBR(y).slice().sort().join(), b = ctxG.GV2.feriadosDoAno(y).slice().sort().join();
  if (a !== b) { iguais = false; checar('o calendário de ' + y + ' é o mesmo do gestor', false, a + ' × ' + b); }
}
checar('o calendário do executivo é o mesmo do gestor de 2025 a 2032', iguais);
checar('Finados 02/11/26 e Consciência Negra 20/11/26 são feriado', ctx.ehFeriadoBR('2026-11-02') && ctx.ehFeriadoBR('2026-11-20') && !ctx.ehFeriadoBR('2026-11-03'));
checar('a régua não conta o feriado como dia útil', !ctx.cadEhUtil('2026-11-02') && ctx.cadEhUtil('2026-11-03'));
checar('1 dia útil depois da sexta 30/10 é a terça 03/11', ctx.cadSomarUteis('2026-10-30', 1) === '2026-11-03', ctx.cadSomarUteis('2026-10-30', 1));
checar('de sexta 30/10 a terça 03/11 há 1 dia útil', ctx.cadUteisEntre('2026-10-30', '2026-11-03') === 1);
checar('"fim de semana" inclui o feriado (próximo útil, sequência)', ctx.isWeekend('2026-11-02') && ctx.isWeekend('2026-11-01') && !ctx.isWeekend('2026-11-03'));
checar('o próximo dia útil depois de sábado 31/10 é terça 03/11', ctx.h10ProximoUtil('2026-10-31') === '2026-11-03');
checar('o dia útil antes de terça 03/11 é sexta 30/10', ctx.h10UtilAnterior('2026-11-03') === '2026-10-30');
const sem = ctx.pl6Dias('2026-11-02');
checar('a semana de 02/11 marca a segunda como feriado e tem 4 dias úteis', sem[0].feriado === true && sem.filter(function (d) { return !d.feriado; }).length === 4);
checar('a semana de 09/11 não tem feriado', ctx.pl6Dias('2026-11-09').every(function (d) { return !d.feriado; }));

/* as contas do Planejamento e da promessa (por texto: dependem do resto da tela) */
checar('a meta de visitas da semana é por dia útil', tpl.indexOf('const meta = pl6MetaVisitasDia() * diasUteisSemana;') > -1 && tpl.indexOf('pl6MetaVisitasDia() * 5') < 0);
checar('dias cobertos não contam o feriado', tpl.indexOf("grade.filter((col, i) => !(dias[i] && dias[i].feriado) && col.some(v => pl6SlotId(v))).length") > -1);
checar('a promessa da semana usa os dias úteis da semana', tpl.indexOf('fechamentos, visitas: metaDia * uteisSem, prospeccao: 4,') > -1);
checar('os atalhos de data pulam o feriado', /if \(w === 0 \|\| w === 6 \|\| ehFeriadoBR\(d\)\) continue;/.test(tpl));
checar('nenhuma conta de "dia útil" do executivo ficou sem o feriado', !/if \(w !== 0 && w !== 6\) n\+\+;/.test(tpl) && !/if \(dow !== 0 && dow !== 6\) n\+\+;/.test(tpl));

if (falhas.length) {
  console.log('FALHOU: ' + falhas.length);
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
}
console.log('feriados do executivo: ' + ok + ' verificações · tudo certo.');
