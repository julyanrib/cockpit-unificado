/* ══════════════════════════════════════════════════════════════════════════════════════
   QUEM PÔS A PORTA NO PLANO (28/10/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   O plano é UM só: o Planejamento do Cockpit (planos_semanais.grade) e a rota do app
   (field_route_stops) são espelhados pelo banco nos dois sentidos. O que se gravava até
   hoje era POR QUAL TELA o item entrou, nunca por QUAL PESSOA — medido em 28/10:

       origem  (nulo)   6185   posto à mão no Planejamento do Cockpit
               app       471   mapa / Agenda do app
               passo     326   próximo passo datado na ficha
               app-agenda 44
               territorio 30

   E o executivo TAMBÉM planeja pelo Cockpit (decisão do Julyan, 06/10/26). Então o app não
   tem como distinguir "Plano de hoje · feito no Cockpit" de "Plano do gestor · montado às
   09:12" — e dizer a segunda quando é a primeira faz o executivo acordar achando que
   mexeram no dia dele sem ninguém ter mexido.

   O CARIMBO TEM DOIS JEITOS DE SAIR CARO, e esta suíte existe pelos dois:

   1. CARIMBAR DEMAIS. Marcar a grade inteira a cada gravação faria os 6.185 itens que já
      existem virarem "de quem salvou a semana". Um gestor que abre o Planejamento de
      alguém e salva sem mexer em nada passaria a ser dono do dia inteiro da pessoa.
   2. CARIMBAR DE MENOS. Sem o carimbo o app não escreve a frase, e a folha de abrir do
      §2.3 fica sem o selo GESTOR nas portas que o gestor realmente trocou.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}

/** Recorta uma função do template pelo nome, com o corpo inteiro (chaves balanceadas). */
function recortarFn(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe no template.'); process.exit(1); }
  let d = 0, j = i, viu = false;
  while (j < tpl.length) {
    const c = tpl[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return tpl.slice(i, j + 1);
}

// ── a função de verdade, rodando ──────────────────────────────────────────────────────
const caixa = { sessaoAtual: null, console: console };
vm.createContext(caixa);
vm.runInContext(recortarFn('pl6CarimbarQuem'), caixa);

const REP = { ownerId: '12345' };
const EU_MESMO = { ownerId: '12345', role: 'rep', nome: 'Marco' };
const O_GESTOR = { ownerId: '99999', role: 'manager', nome: 'Julyan' };

const col = (...itens) => itens;
const grade = (...cols) => { const g = [[], [], [], [], []]; cols.forEach((c, i) => { g[i] = c; }); return g; };
function carimbar(g, fresca, sessao) {
  caixa.sessaoAtual = sessao;
  return caixa.pl6CarimbarQuem(g, fresca, REP);
}
const quemDe = (g, d, i) => (g[d] && g[d][i] ? g[d][i].quem : undefined);

// ── 1 · porta nova ────────────────────────────────────────────────────────────────────
{
  const g = grade(col({ id: 'c-1', p: 'funil' }));
  conferir('o gestor carimba a porta que ele pôs',
    quemDe(carimbar(g, [[], [], [], [], []], O_GESTOR), 0, 0) === 'gestor',
    'a porta nova saiu sem `quem`, e o app não vai saber dizer de quem é o plano');
  conferir('o executivo carimba a dele',
    quemDe(carimbar(g, [[], [], [], [], []], EU_MESMO), 0, 0) === 'executivo',
    'o próprio dono salvando pelo Cockpit devia sair como executivo');
}

// ── 2 · porta que já existia NÃO vira de quem salvou ──────────────────────────────────
/* O defeito caro. O gestor abre o Planejamento do Marco para olhar, salva (ou qualquer
   gravação dispara), e sem esta regra as 6 portas que o MARCO montou passariam a ser do
   gestor — e amanhã o app diria "Plano do gestor" para um dia que o Marco montou sozinho. */
{
  const jaLa = grade(col({ id: 'c-1', p: 'funil' }, { id: 'c-2', p: 'funil' }));
  const g = grade(col({ id: 'c-1', p: 'funil' }, { id: 'c-2', p: 'funil' }, { id: 'c-3', p: 'funil' }));
  const out = carimbar(g, jaLa, O_GESTOR);
  conferir('o que já estava no banco fica sem carimbo',
    quemDe(out, 0, 0) === undefined && quemDe(out, 0, 1) === undefined,
    'o gestor salvou e virou dono de porta que não foi ele que pôs');
  conferir('só a porta nova é carimbada', quemDe(out, 0, 2) === 'gestor',
    'a porta que o gestor acabou de pôr saiu sem carimbo');
}

// ── 3 · o que veio do app não se toca ─────────────────────────────────────────────────
/* `origem` preenchido quer dizer que o item entrou pelo mapa, pela Agenda do app, pelo
   próximo passo da ficha ou pelo território — caminhos em que quem põe é sempre o dono da
   rota. A dúvida existe só na gravação do Cockpit, onde as duas pessoas escrevem pela
   mesma porta. */
{
  const out = carimbar(grade(col(
    { id: 'c-1', p: 'funil', origem: 'app' },
    { id: 'c-2', p: 'funil', origem: 'passo' },
    { id: 'c-3', p: 'funil', origem: 'territorio' },
    { id: 'c-4', p: 'funil' },
  )), [[], [], [], [], []], O_GESTOR);
  conferir('item com origem não é carimbado',
    quemDe(out, 0, 0) === undefined && quemDe(out, 0, 1) === undefined && quemDe(out, 0, 2) === undefined,
    'carimbou por cima de um caminho que já se sabe de quem é');
  conferir('e o vizinho sem origem é', quemDe(out, 0, 3) === 'gestor', 'parou de carimbar o que precisava');
}

// ── 4 · carimbo que já existe não se reescreve ────────────────────────────────────────
{
  const out = carimbar(grade(col({ id: 'c-1', quem: 'executivo' })), [[], [], [], [], []], O_GESTOR);
  conferir('carimbo existente é respeitado', quemDe(out, 0, 0) === 'executivo',
    'o gestor sobrescreveu um carimbo que já dizia outra coisa');
}

// ── 5 · a primeira gravação da semana ─────────────────────────────────────────────────
/* Semana nova: não há linha no banco, `fresca` vem null. Tudo ali é novo mesmo. */
{
  const out = carimbar(grade(col({ id: 'c-1' }, { id: 'c-2' })), null, O_GESTOR);
  conferir('semana sem linha no banco: tudo é novo',
    quemDe(out, 0, 0) === 'gestor' && quemDe(out, 0, 1) === 'gestor',
    'na primeira gravação da semana nada foi carimbado');
}

// ── 6 · o que não é item não quebra ───────────────────────────────────────────────────
{
  const g = [[null, 'c-velho', { id: 'c-1' }], null, [], [], []];
  let out = null;
  let estourou = null;
  try { out = carimbar(g, [[{ id: 'c-9' }]], O_GESTOR); } catch (e) { estourou = e.message; }
  conferir('buraco, string antiga e coluna nula não derrubam a gravação', !estourou,
    'estourou: ' + estourou);
  conferir('o buraco continua buraco', out && out[0][0] === null, 'o null virou objeto');
  conferir('a string antiga fica como está', out && out[0][1] === 'c-velho', 'mexeu no formato antigo');
  conferir('e o objeto ao lado é carimbado', out && out[0][2].quem === 'gestor', 'parou no primeiro buraco');
  conferir('coluna nula sobrevive', out && out[1] === null, 'a coluna nula virou outra coisa');
}

// ── 7 · não muda a grade que recebeu ──────────────────────────────────────────────────
/* `pl6Gravar` mescla antes e usa o resultado depois; se o carimbo mutasse o objeto de
   entrada, a tela passaria a mostrar um carimbo que o banco talvez tenha recusado. */
{
  const entrada = grade(col({ id: 'c-1' }));
  carimbar(entrada, [[], [], [], [], []], O_GESTOR);
  conferir('a grade de entrada não é mexida', entrada[0][0].quem === undefined,
    'o carimbo mutou o objeto que a tela está mostrando');
}

// ── 8 · a fiação ──────────────────────────────────────────────────────────────────────
conferir('pl6Gravar carimba antes de gravar',
  /grade = pl6CarimbarQuem\(grade, fresca, rep\);/.test(tpl),
  'a função existe e ninguém a chama — carimbo que não é chamado é código morto');
/* A CHAMADA, não a declaração: a função é declarada ACIMA de pl6Gravar, então procurar o
   nome cru acha a declaração e a ordem daria certo sem provar nada. */
conferir('o carimbo vem DEPOIS da mescla',
  tpl.indexOf('grade = pl6MesclarGrade(base, grade, fresca);') > 0
  && tpl.indexOf('grade = pl6MesclarGrade(base, grade, fresca);') < tpl.indexOf('grade = pl6CarimbarQuem(grade, fresca, rep);'),
  'carimbar antes de mesclar deixaria a mescla jogar o carimbo fora');
conferir('a lista é fechada', !/it\.quem\s*=\s*[^'"]*\bsessaoAtual\.(role|nome|email)/.test(tpl),
  'o valor tem de ser `executivo` ou `gestor`, que é o que a ponte aceita');

/* A PONTE PRECISA LEVAR O VALOR. Carimbo que fica só na grade não chega ao celular: quem
   cria a parada é plano_para_rota, e é lá que o `quem` vira field_route_stops.posto_por. */
{
  const mig = path.join(raiz, '..', 'PWA-app-outbound', 'supabase', 'migrations', '0225_quem_pos_a_porta_no_plano.sql');
  const temMig = fs.existsSync(mig);
  conferir('a migration 0225 existe', temMig, 'sem ela o carimbo morre na grade e não chega na rota');
  if (temMig) {
    const sql = fs.readFileSync(mig, 'utf8');
    conferir('a ponte lê o `quem` do item', /r\.slot ->> 'quem'/.test(sql), 'plano_para_rota não lê o carimbo');
    conferir('e sanea a lista fechada', /in \('executivo', 'gestor'\)/.test(sql),
      'palavra estranha vinda do navegador entraria na coluna');
    conferir('nunca apaga o que já se sabia',
      /posto_por = coalesce\(excluded\.posto_por, field_route_stops\.posto_por\)/.test(sql),
      'uma gravação sem carimbo zeraria o carimbo que já existia');
    conferir('a coluna é anulável e sem padrão',
      /add column if not exists posto_por text;/.test(sql) && !/posto_por text[^;]*default/i.test(sql),
      'um padrão faria 2.257 linhas antigas afirmarem algo que ninguém sabe');
  }
}

// ── 9 · a sabotagem: a guarda precisa reprovar ────────────────────────────────────────
/* Guarda que nunca viu vermelho não é guarda. Refaço aqui a versão ingênua — a que carimba
   tudo — e exijo que ela DISCORDE da função de verdade no caso que mais dói. */
{
  const ingenua = (g, _fresca, rep) => g.map((c) => (Array.isArray(c) ? c.map((it) => (
    it && typeof it === 'object' && it.id ? Object.assign({}, it, { quem: 'gestor' }) : it)) : c));
  const jaLa = grade(col({ id: 'c-1' }, { id: 'c-2' }));
  const g = grade(col({ id: 'c-1' }, { id: 'c-2' }, { id: 'c-3' }));
  const ruim = ingenua(g, jaLa, REP);
  const bom = carimbar(g, jaLa, O_GESTOR);
  conferir('sabotagem: carimbar tudo marcaria porta alheia, e a função não marca',
    ruim[0][0].quem === 'gestor' && bom[0][0].quem === undefined,
    'a função de verdade está carimbando como a versão ingênua — o gestor virou dono do dia do colega');
}

// ── saída ─────────────────────────────────────────────────────────────────────────────
if (falhas.length) {
  console.error('quem pôs a porta: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + ':');
  falhas.forEach((f) => console.error(f));
  process.exit(1);
}
console.log('quem pôs a porta: ' + ok + ' checagens ok — só a porta nova é carimbada, o que veio do app'
  + ' não se toca, e a ponte leva o valor para field_route_stops.posto_por.');
