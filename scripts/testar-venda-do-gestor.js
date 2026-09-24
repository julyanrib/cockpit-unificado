#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════════════════
   AS VENDAS DO GESTOR CONTAM NO PLACAR — E SÓ NO LUGAR CERTO (24/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "pode contar as vendas do Julyan, que sou eu, no placar geral, beleza? mesmo que
   foi de evento, mas eu q vendi pelo field sales".

   O QUE ISSO EXIGE, e é mais de uma coisa:
     · as vendas dele entram nos TOTAIS do mês (clientes, MRR, receita);
     · e NÃO entram em `porRep`, que é o pódio e a régua por pessoa — quem alimenta a
       rodada, a Daily, a aba Pessoas e a meta individual. Ele pediu que a venda conte,
       não virar executivo com plano de dia e cobrança de visita;
     · e a diferença entre o total e a soma do pódio precisa ter nome, senão a primeira
       pessoa a somar as linhas acha que o número está quebrado.

   POR QUE ESTA SUÍTE RODA O CÓDIGO em vez de procurar texto: o defeito que motivou tudo
   isso era uma LINHA QUE DESCARTAVA em silêncio —

       if (!d.ownerId || !narrativas.reps[d.ownerId]) return;   // dono fora do time ativo

   — quatro vendas sumindo sem log, sem aviso e sem aparecer em canto nenhum. Um teste que
   lesse o arquivo veria a linha e não veria o buraco. Então aqui o bloco de agregação é
   recortado do montar-dados.js e EXECUTADO com um mês inventado, e o que se mede é a
   resposta, não a redação.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const raiz = path.join(__dirname, '..');
/* CRLF NORMALIZADO ANTES DE PROCURAR ÂNCORA: scripts/ é CRLF neste repositório e as
   âncoras multilinha abaixo são escritas com quebra de linha simples. Sem esta linha, a
   âncora do FIM não casa e a suíte morre dizendo que o bloco sumiu — que foi exatamente o
   que ela fez na primeira execução. */
const fonte = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8')
  .split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10));

let ok = 0;
const falhas = [];
const eIgual = (rotulo, veio, esperado) => {
  if (JSON.stringify(veio) === JSON.stringify(esperado)) { ok++; return; }
  falhas.push(rotulo + ': esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(veio));
};
const eVerdade = (rotulo, v) => eIgual(rotulo, !!v, true);

/* ── recortar os dois pedaços do montar-dados.js ────────────────────────────────────
   Pelo CONTEÚDO da âncora, não pela linha: renumerar o arquivo não pode calar o teste.
   E se a âncora sumir, aqui é vermelho — nunca verde medindo nada. */
function recortar(rotulo, inicio, fim) {
  const a = fonte.indexOf(inicio);
  if (a < 0) {
    console.error('X ' + rotulo + ': a âncora sumiu de montar-dados.js — "' + inicio.slice(0, 60) + '"');
    console.error('  Se o bloco foi renomeado, reaponte esta suíte. Teste sem âncora passa verde medindo o vazio.');
    process.exit(1);
  }
  const b = fonte.indexOf(fim, a);
  if (b < 0) {
    console.error('X ' + rotulo + ': achei o começo e não o fim ("' + fim.slice(0, 40) + '")');
    process.exit(1);
  }
  return fonte.slice(a, b + fim.length);
}

const blocoGestores = recortar('lista de gestores que vendem',
  'const GESTORES_QUE_VENDEM = (function () {', '}());');
const blocoAgregacao = recortar('agregação do mês',
  'const MESES_PT = [', '      ajustadas: ajustadas\n    };');

/* ── o mundo de mentira ─────────────────────────────────────────────────────────────
   Dois reps, um gestor que vende, e um dono que não é de ninguém do time — porque o
   quarto caso (venda de quem saiu) é o que sumia em silêncio e agora precisa ser contado. */
const MES = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
const NARRATIVAS = { reps: {
  '86100505': { name: 'Marco Filho', praca: 'Vitória' },
  '86100506': { name: 'Bruno Martins', praca: 'Vila Velha' }
} };
const USUARIOS = { usuarios: [
  { email: 'julyan.takeat@gmail.com', role: 'manager', ownerId: '339921752', nome: 'Julyan Ribeiro' },
  { email: 'luizpaulo@takeat.app', role: 'manager', ownerId: null, nome: 'Luiz Paulo' },
  { email: 'marco.takeat@gmail.com', role: 'rep', ownerId: '86100505', nome: 'Marco Filho' },
  { email: 'bruno.takeat@gmail.com', role: 'rep', ownerId: '86100506', nome: 'Bruno Martins' }
] };

function vender(nome, ownerId, mrr, receita, extra) {
  return Object.assign({ id: 'd-' + nome, nome, ownerId, mrr, receita, closedate: MES + '-22' }, extra || {});
}

function rodar(vendas, usuarios) {
  const ctx = {
    usuariosRaw: usuarios || USUARIOS,
    narrativas: NARRATIVAS,
    hubspot: { vendasMes: vendas },
    /* `vendasMes` nasce no contexto, e NÃO como `let` injetado: `let` dentro de
       runInContext fica no escopo léxico do script e nunca vira propriedade do contexto —
       o recorte rodava inteiro e a suíte lia `undefined` do lado de cá. */
    vendasMes: null,
    console
  };
  vm.createContext(ctx);
  vm.runInContext(blocoGestores + '\n{\n' + blocoAgregacao + '\n}\n', ctx,
    { filename: 'recorte-montar-dados.js' });
  return ctx.vendasMes;
}

/* ── 1. O TOTAL INCLUI O GESTOR ──────────────────────────────────────────────────── */
{
  const r = rodar([
    vender('Marco A', '86100505', 500, 1500),
    vender('Bruno A', '86100506', 300, 900),
    vender('TENNESSEE STEAK HOUSE', '339921752', 1056, 3168),
    vender('YURIA', '339921752', 969, 2907)
  ]);
  eIgual('o total de clientes soma time + gestor', r.totalClientes, 4);
  eIgual('o total de MRR soma time + gestor', r.totalMrr, 500 + 300 + 1056 + 969);
  eIgual('o total de receita soma time + gestor', r.totalReceita, 1500 + 900 + 3168 + 2907);
}

/* ── 2. E O PÓDIO CONTINUA SÓ DOS EXECUTIVOS ─────────────────────────────────────── */
{
  const r = rodar([
    vender('Marco A', '86100505', 500, 1500),
    vender('TENNESSEE STEAK HOUSE', '339921752', 1056, 3168)
  ]);
  eIgual('o pódio tem só os executivos', r.porRep.map(x => x.ownerId), ['86100505']);
  eIgual('o gestor não aparece no pódio nem com a maior venda do mês',
    r.porRep.filter(x => x.ownerId === '339921752').length, 0);
  /* a venda dele é a MAIOR da lista: se o critério fosse ordenação e não papel, ele
     estaria em primeiro lugar aqui. É por isso que este caso usa MRR maior que o do rep. */
  eIgual('e a soma do pódio é menor que o total, de propósito',
    r.porRep.reduce((s, x) => s + x.mrrTotal, 0), 500);
}

/* ── 3. A DIFERENÇA TEM NOME ─────────────────────────────────────────────────────── */
{
  const r = rodar([
    vender('Marco A', '86100505', 500, 1500),
    vender('TENNESSEE STEAK HOUSE', '339921752', 1056, 3168),
    vender('ALAMEDA 79', '339921752', 313, 939)
  ]);
  eVerdade('a parte do gestor viaja identificada', r.gestor);
  eIgual('com o nome dele', r.gestor.name, 'Julyan Ribeiro');
  eIgual('com o owner dele', r.gestor.ownerId, '339921752');
  eIgual('e a conta fecha: total − pódio = gestor',
    r.totalMrr - r.porRep.reduce((s, x) => s + x.mrrTotal, 0), r.gestor.mrrTotal);
  eIgual('quantos negócios foram dele', r.gestor.count, 2);
  eIgual('e quais foram, do maior para o menor',
    r.gestor.clientes.map(c => c.nome), ['TENNESSEE STEAK HOUSE', 'ALAMEDA 79']);
}

/* ── 4. MÊS SEM VENDA DELE NÃO DESENHA LINHA ─────────────────────────────────────── */
{
  const r = rodar([vender('Marco A', '86100505', 500, 1500)]);
  eIgual('sem venda do gestor, `gestor` é null e não zero', r.gestor, null);
  /* null e zero não são a mesma coisa na tela: zero vira "· inclui 0 de Julyan", que é uma
     frase dizendo que ele não vendeu — informação que ninguém pediu e que ocupa a linha. */
  eIgual('e o total continua sendo só o do time', r.totalMrr, 500);
}

/* ── 5. GESTOR SEM ownerId NÃO VIRA DONO DE NADA ─────────────────────────────────── */
{
  /* Luiz Paulo é manager e não tem ownerId. Sem esta regra, um `undefined` viraria chave e
     a venda de quem não tem dono cairia na conta dele. */
  const r = rodar([
    vender('Marco A', '86100505', 500, 1500),
    vender('venda sem dono', null, 700, 2100)
  ]);
  eIgual('venda sem dono não vira venda do gestor', r.gestor, null);
  eIgual('e não entra no total', r.totalMrr, 500);
}

/* ── 6. QUEM NÃO É DO TIME FICA FORA, MAS CONTADO ────────────────────────────────── */
{
  /* Este é o buraco original: a venda de um dono fora da lista sumia sem deixar rastro, e
     foi assim que quatro vendas do gestor ficaram um mês inteiro fora do placar sem
     ninguém ver. Fora do total continua certo; sumir sem registro, não. */
  const r = rodar([
    vender('Marco A', '86100505', 500, 1500),
    vender('venda de quem saiu', '11111111', 800, 2400)
  ]);
  eIgual('a venda de fora do time não entra no total', r.totalMrr, 500);
  eIgual('mas fica registrada', (r.foraDoTime || []).length, 1);
  eIgual('com o nome do negócio, para dar para procurar no CRM',
    (r.foraDoTime[0] || {}).nome, 'venda de quem saiu');
  eIgual('e com o owner que ninguém reconheceu',
    (r.foraDoTime[0] || {}).ownerId, '11111111');
}

/* ── 7. COMPETÊNCIA DE OUTRO MÊS NÃO ESTOURA COM A VENDA DO GESTOR ───────────────── */
{
  /* O caminho do ajuste lia `narrativas.reps[ownerId].name` direto. Para o gestor isso é
     leitura de undefined e derruba a montagem inteira do snapshot — build verde, robô
     morto. O caso existe porque eu quase publiquei assim. */
  const outroMes = (MES.slice(0, 4) - 1) + MES.slice(4);
  const r = rodar([
    vender('Marco A', '86100505', 500, 1500),
    vender('venda antiga do gestor', '339921752', 400, 1200, { mesDeCompetencia: outroMes })
  ]);
  eIgual('a venda do gestor em outro mês sai do total', r.totalMrr, 500);
  eIgual('e aparece na lista de ajustadas', r.ajustadas.length, 1);
  eIgual('com o nome dele, lido da fonte certa', r.ajustadas[0].name, 'Julyan Ribeiro');
}

/* ── 8. A LISTA DE GESTORES SAI DO CADASTRO, NÃO DE UM ID CRAVADO ────────────────── */
{
  /* Se o ownerId do Julyan estivesse escrito no código, trocar o cadastro não mudaria
     nada e o próximo gestor que vender precisaria de um deploy. Aqui o cadastro é outro e
     a resposta tem de acompanhar. */
  const outroCadastro = { usuarios: [
    { email: 'chefe@takeat.app', role: 'manager', ownerId: '99999999', nome: 'Outra Pessoa' },
    { email: 'marco.takeat@gmail.com', role: 'rep', ownerId: '86100505', nome: 'Marco Filho' }
  ] };
  const r = rodar([
    vender('Marco A', '86100505', 500, 1500),
    vender('venda do chefe novo', '99999999', 900, 2700),
    vender('venda do Julyan', '339921752', 100, 300)
  ], outroCadastro);
  eIgual('o gestor do cadastro novo conta', (r.gestor || {}).ownerId, '99999999');
  eIgual('e é o nome dele que viaja', (r.gestor || {}).name, 'Outra Pessoa');
  eIgual('o total é time + o gestor DESTE cadastro', r.totalMrr, 500 + 900);
  eIgual('e o gestor que não está mais no cadastro caiu para fora do time',
    (r.foraDoTime || []).map(x => x.ownerId), ['339921752']);
}

/* ── 9. ownerId "pendente_*" NÃO É OWNER ─────────────────────────────────────────── */
{
  /* `pendente_*` é a convenção que já existia no projeto para quem ainda não tem owner do
     HubSpot. Se ela passasse por owner válido, o gestor em onboarding começaria a receber
     as vendas de um id que não existe no CRM. */
  const cadastroPendente = { usuarios: [
    { email: 'novo@takeat.app', role: 'manager', ownerId: 'pendente_novo', nome: 'Gestor Novo' },
    { email: 'marco.takeat@gmail.com', role: 'rep', ownerId: '86100505', nome: 'Marco Filho' }
  ] };
  const r = rodar([
    vender('Marco A', '86100505', 500, 1500),
    vender('venda estranha', 'pendente_novo', 600, 1800)
  ], cadastroPendente);
  eIgual('owner pendente não vira gestor que vende', r.gestor, null);
  eIgual('e a venda dele não entra no total', r.totalMrr, 500);
}

/* ── 10. QUEM É REP E GESTOR AO MESMO TEMPO CONTA COMO REP ───────────────────────── */
{
  /* 24/09/26: o Julyan pediu um login de executivo com o ownerId dele para testar o
     funil, e passou a existir o mesmo ownerId como manager numa linha de usuarios.json e
     como rep em outra. Se `ehGestor` ganhasse, a venda dele iria para o balde do gestor e
     a aba DELE como executivo mostraria 0 clientes fechados no mês com venda fechada no
     CRM — o zero que tranquiliza, na tela de quem fez a venda.

     A regra: quem tem tela de pessoa precisa ver a própria venda nela. O balde do gestor
     é de quem é SÓ gestor. */
  const cadastroDuplo = { usuarios: [
    { email: 'julyan.takeat@gmail.com', role: 'manager', ownerId: '339921752', nome: 'Julyan Ribeiro' },
    { email: 'julyan.exec@takeat.app', role: 'rep', ownerId: '339921752', nome: 'Julyan Ribeiro (teste)' },
    { email: 'marco.takeat@gmail.com', role: 'rep', ownerId: '86100505', nome: 'Marco Filho' }
  ] };
  /* e ele precisa existir em narrativas tambem — e de la que sai DATA.reps */
  NARRATIVAS.reps['339921752'] = { name: 'Julyan Ribeiro (teste)', praca: '—' };
  const r = rodar([
    vender('Marco A', '86100505', 500, 1500),
    vender('TENNESSEE STEAK HOUSE', '339921752', 1056, 3168)
  ], cadastroDuplo);
  delete NARRATIVAS.reps['339921752'];

  eIgual('sendo rep, ele entra no pódio', r.porRep.map(x => x.ownerId).sort(), ['339921752', '86100505']);
  eIgual('e o balde do gestor fica vazio', r.gestor, null);
  /* o total nao muda um centavo: a venda so troca de balde */
  eIgual('o total continua o mesmo, a venda só trocou de balde', r.totalMrr, 500 + 1056);
  eIgual('e ninguém foi parar fora do time', (r.foraDoTime || []).length, 0);
  /* e o nome que aparece no podio e o do cadastro de rep, nao o do gestor */
  eIgual('com o nome de executivo dele',
    (r.porRep.find(x => x.ownerId === '339921752') || {}).name, 'Julyan Ribeiro (teste)');
}

/* ── resultado ──────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('venda do gestor: FALHAS (' + falhas.length + ')');
  falhas.forEach(f => console.error('  · ' + f));
  process.exit(1);
}
console.log('venda do gestor: ' + ok + ' checagens ok.');
