// testar-planejamento-sem-limite.js
//
// O DIA DO PLANO NÃO TEM LIMITE DE VISITAS (16/10/26, Julyan: "não podemos limitar as visitas
// dele, pode ser ilimitadas, tanto no slot do planejamento também"). Roda as funções DO TEMPLATE
// (recortadas, não copiadas) e prova que a 16ª conta entra, que ler e gravar não cortam o dia em 15
// e que o item que outra tela gravou no dia cheio não some na mescla.
//
//   node scripts/testar-planejamento-sem-limite.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');
let ok = 0;
const falhas = [];
function checar(nome, cond, extra) { if (cond) ok++; else falhas.push(nome + (extra ? ' — ' + extra : '')); }

function recortarFuncao(fonte, nome) {
  const assinatura = 'function ' + nome + '(';
  const i = fonte.indexOf(assinatura);
  if (i < 0) { console.log('FALHOU: ' + nome + ' não existe no template.'); process.exit(1); }
  let d = 0, j = i, viu = false;
  while (j < fonte.length) {
    const c = fonte[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return fonte.slice(i, j + 1);
}
function constante(nome) {
  const m = tpl.match(new RegExp('const ' + nome + " = [^;]+;"));
  if (!m) { console.log('FALHOU: const ' + nome + ' não achada.'); process.exit(1); }
  return m[0];
}

const ctx = { JSON: JSON, Array: Array, Math: Math, Set: Set, String: String, Object: Object, pl6Plano: null };
vm.createContext(ctx);
['PL6_SLOTS', 'PL6_DIAS_UTEIS', 'PL6_BLOQUEADO', 'PL6_RUA', 'PL6_REL'].forEach(function (k) { vm.runInContext(constante(k), ctx); });
['pl6SlotId', 'pl6SlotRua', 'pl6SlotRel', 'pl6SlotBloqueado', 'pl6GradeVazia', 'pl6GradeDoPlano', 'pl6PrimeiraVaga', 'pl6MesclarGrade']
  .forEach(function (f) { vm.runInContext(recortarFuncao(tpl, f), ctx); });
vm.runInContext('globalThis.__f = { PL6_SLOTS, pl6GradeDoPlano, pl6PrimeiraVaga, pl6MesclarGrade, pl6GradeVazia };', ctx);
const F = ctx.__f;

const dia = function (n, pre) { const a = []; for (let i = 0; i < n; i++) a.push({ id: (pre || 'c-') + i }); return a; };
const cheio = [dia(15), [], [], [], []];

checar('a 1ª vaga do dia cheio é o fim da coluna (15), e não -1', F.pl6PrimeiraVaga(cheio, 0) === 15, String(F.pl6PrimeiraVaga(cheio, 0)));
checar('com casa vazia, a 1ª vaga continua sendo a vazia', F.pl6PrimeiraVaga([[{ id: 'c-a' }, null, { id: 'c-b' }], [], [], [], []], 0) === 1);

ctx.pl6Plano = { grade: [dia(18), [], [], [], []] };
const lida = F.pl6GradeDoPlano();
checar('ler o plano não corta o dia em 15 (18 continuam 18)', lida[0].length === 18 && lida[0][17] && lida[0][17].id === 'c-17', String(lida[0].length));
checar('dia vazio continua com as 15 casas mínimas', lida[1].length === F.PL6_SLOTS);

const base = [dia(15), [], [], [], []];
const nova = [dia(15).concat([{ id: 'c-nova' }]), [], [], [], []];
const fresca = [dia(15).concat([{ id: 'c-doapp' }]), [], [], [], []];
const m = F.pl6MesclarGrade(base, nova, fresca);
const ids = m[0].map(function (v) { return v && v.id; });
checar('gravar mantém a 16ª desta tela', ids.indexOf('c-nova') >= 0, ids.join());
checar('gravar não apaga a 16ª que o app pôs no meio tempo (dia cheio)', ids.indexOf('c-doapp') >= 0, ids.join());
checar('e as 15 de antes ficam', ids.slice(0, 15).every(function (x, i) { return x === 'c-' + i; }));

checar('o dia nunca fica "cheio" na tela', /const cheio = false; \/\/ sem limite de visitas/.test(tpl));
checar('o passo que chega por outra tela entra no fim do dia cheio', /if \(si < 0\) si = grade\[di\]\.length; \/\/ sem limite/.test(tpl));

if (falhas.length) {
  console.log('FALHOU: ' + falhas.length);
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
}
console.log('planejamento sem limite: ' + ok + ' checagens ok — a 16ª entra, e ler, gravar e mesclar não cortam o dia.');
