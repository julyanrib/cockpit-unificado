// scripts/checar-time-nas-duas-fontes.js
//
// GUARDA 25 — O TIME ESTÁ EM DOIS LUGARES, E ELES TÊM QUE CONCORDAR (07/09/26).
//
// Os dois lugares são necessários, não é duplicação por descuido:
//   `data/usuarios.json`  o que a TELA sabe. É dele que sai "N executivos na rua" na
//                         tela de login, antes de qualquer login — o primeiro número
//                         que o executivo lê no produto.
//   `mapa_usuarios`       o que o BANCO deixa entrar. Toda política de RLS cruza o
//                         e-mail do JWT com essa tabela.
//
// QUANDO OS DOIS DIVERGEM, NINGUÉM RECLAMA — e é aí que dói:
//   no json e não no banco: a pessoa não alcança nem o próprio dado. A política não acha
//     o e-mail, o select devolve `[]`, e a tela mostra "não tem dado" em vez de erro.
//   no banco e não no json: acesso vivo para quem não está no time.
//
// Em 07/09/26 os dois divergiam em SETE pessoas: 4 reps em preparação sem acesso (um
// deles já lia o Playbook e não conseguiria salvar uma daily) e 3 que saíram do time com
// acesso vivo. Nenhum dos sete aparecia em log, tela de erro ou suite.
//
// Não toca no banco, pelo mesmo motivo das guardas 23 e 24: o build roda no CI sem
// credencial. O espelho vive em supabase/TIME.txt, gerado por scripts/ler-time-do-banco.js.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ARQ_TIME = path.join(root, 'supabase', 'TIME.txt');
const ARQ_JSON = path.join(root, 'data', 'usuarios.json');

/* LISTA VAZIA, que é o estado correto (07/09/26).

   Ela existiu por algumas horas com os 4 reps em preparação, que estavam no json e não
   no banco. O Julyan aplicou o insert e eles entraram — medido depois: os quatro gravam
   a própria daily (testado virando cada um deles, com rollback).

   Se voltar a ter item aqui, é dívida ESPERANDO uma mudança no banco. A checagem de
   dívida morta, mais abaixo, reprova o build quando o item deixa de ser verdade —
   dívida que fica na lista para sempre deixa de ser vista. */
const SEM_ACESSO_AINDA = [];

function lerEspelhoDoBanco() {
  if (!fs.existsSync(ARQ_TIME)) {
    console.error('GUARDA 25 REPROVADA: falta supabase/TIME.txt.');
    console.error('  rode: node scripts/ler-time-do-banco.js');
    process.exit(1);
  }
  const mapa = {};
  fs.readFileSync(ARQ_TIME, 'utf8').split('\n').forEach(function (linha) {
    const l = linha.trim();
    if (!l || l[0] === '#') return;
    const p = l.split('=');
    if (p.length !== 2) return;
    const dir = p[1].split(',');
    mapa[p[0].trim().toLowerCase()] = {
      role: dir[0].trim(),
      ownerId: (dir[1] || '').trim()
    };
  });
  return mapa;
}

function lerJson() {
  const bruto = JSON.parse(fs.readFileSync(ARQ_JSON, 'utf8'));
  const lista = Array.isArray(bruto) ? bruto : (bruto.usuarios || []);
  const mapa = {};
  lista.forEach(function (u) {
    if (!u || !u.email) return;
    mapa[String(u.email).trim().toLowerCase()] = {
      role: u.role,
      ownerId: u.ownerId,
      aComecar: !!u.aComecar,
      nome: u.nome
    };
  });
  return mapa;
}

const banco = lerEspelhoDoBanco();
const tela = lerJson();
const problemas = [];
const dividaVista = [];

/* A TERCEIRA FONTE NÃO PODE VOLTAR (07/09/26).

   `REPS` em scripts/fetch-hubspot.js era uma lista CRAVADA de seis ownerId, e é dela
   que sai todo filtro por owner nas consultas ao HubSpot — ou seja, o funil que a tela
   desenha. Foi ela que causou o defeito: mesmo depois de os cinco reps novos ganharem
   owner real e saírem do portão aComecar, `DATA.reps` não teria linha para eles, e o
   Julyan viu "nada liberado" no login da Renata.

   Agora ela é derivada de data/usuarios.json. Esta checagem existe para o dia em que
   alguém "resolver rápido" cravando um id de volta: uma lista de owners no robô passa a
   ser uma quarta fonte, e ninguém percebe até um rep novo abrir a tela vazia. */
/* A QUARTA FONTE, E A QUE DECIDE QUEM EXISTE (07/09/26).

   `montar-dados.js` monta DATA.reps de `Object.keys(narrativas.reps)` — não do HubSpot,
   não do json de usuários. Quem não está em data/narrativas.json NÃO EXISTE no cockpit:
   a tela responde "Não encontrei seu cadastro no cockpit. Fale com seu gestor.".

   Foi a causa final do que o Julyan viu no login da Renata. Ela já tinha owner real, já
   estava fora do portão aComecar, já estava em mapa_usuarios e já aparecia no snapshot
   do HubSpot — e ainda assim não existia, porque faltava aqui.

   Esta checagem compara as CHAVES de narrativas.reps com os ownerId de rep do json. O
   conteúdo (gargalo, boasPraticas, compromissos) é do robô semanal e não é cobrado — o
   que não pode faltar é a pessoa. */
const narrPath = path.join(root, 'data', 'narrativas.json');
if (!fs.existsSync(narrPath)) {
  problemas.push('falta data/narrativas.json — é dele que sai DATA.reps, e sem ele nenhum'
    + ' executivo existe no cockpit.');
} else {
  let narr = null;
  try { narr = JSON.parse(fs.readFileSync(narrPath, 'utf8')); }
  catch (e) { problemas.push('data/narrativas.json não é JSON válido: ' + e.message); }
  if (narr && narr.reps) {
    const noNarr = Object.keys(narr.reps);
    const repsDoJson = Object.keys(tela)
      .filter(function (e) { return tela[e].role === 'rep' && tela[e].ownerId; })
      .map(function (e) { return String(tela[e].ownerId); });
    repsDoJson.forEach(function (id) {
      if (noNarr.indexOf(id) > -1) return;
      problemas.push('o owner ' + id + ' está em data/usuarios.json e NÃO está em '
        + 'data/narrativas.json — DATA.reps sai das chaves de narrativas, então essa '
        + 'pessoa não existe no cockpit e a tela dela diz "não encontrei seu cadastro".');
    });
    noNarr.forEach(function (id) {
      if (repsDoJson.indexOf(id) > -1) return;
      problemas.push('o owner ' + id + ' está em data/narrativas.json e NÃO é rep em '
        + 'data/usuarios.json — ou é alguém que saiu, ou um placeholder que sobrou.');
    });
  } else if (narr) {
    problemas.push('data/narrativas.json não tem .reps — DATA.reps sai daí.');
  }
}

const robo = fs.readFileSync(path.join(root, 'scripts', 'fetch-hubspot.js'), 'utf8');
const iReps = robo.indexOf('const REPS =');
if (iReps < 0) {
  problemas.push('não achei a declaração de REPS em scripts/fetch-hubspot.js — se ela foi'
    + ' renomeada, esta checagem parou de medir e precisa de uma âncora nova.');
} else {
  const trecho = robo.slice(iReps, iReps + 900);
  if (trecho.indexOf('usuarios.json') < 0) {
    problemas.push('REPS em scripts/fetch-hubspot.js não vem mais de data/usuarios.json —'
      + ' lista de owner cravada no robô é uma quarta fonte do time, e é dela que sai o funil.');
  }
  const cravados = trecho.match(/ownerId: *['"][0-9]{6,}/g) || [];
  if (cravados.length) {
    problemas.push('achei ' + cravados.length + ' ownerId cravado(s) junto de REPS em '
      + 'scripts/fetch-hubspot.js — o time tem que sair de data/usuarios.json.');
  }
}

/* está na tela e não no banco: não alcança o próprio dado */
Object.keys(tela).forEach(function (email) {
  if (email in banco) return;
  if (SEM_ACESSO_AINDA.indexOf(email) > -1) { dividaVista.push(email); return; }
  problemas.push(email + ' está em data/usuarios.json e NÃO está em mapa_usuarios — a RLS '
    + 'não acha o e-mail dele, então ele não alcança nem o próprio dado, e a tela mostra '
    + '"não tem dado" em vez de erro.');
});

/* está no banco e não na tela: acesso vivo fora do time */
Object.keys(banco).forEach(function (email) {
  if (email in tela) return;
  problemas.push(email + ' está em mapa_usuarios e NÃO está em data/usuarios.json — '
    + 'acesso vivo para quem a tela não considera do time. Se saiu, o delete é uma linha; '
    + 'se entrou, falta no json (e no número da tela de login).');
});

/* o papel tem que ser o mesmo nos dois: rep que o banco acha manager vê o time inteiro */
Object.keys(tela).forEach(function (email) {
  if (!(email in banco)) return;
  if (tela[email].role !== banco[email].role) {
    problemas.push(email + ' tem papel diferente nos dois lugares: json diz "'
      + tela[email].role + '", banco diz "' + banco[email].role
      + '". Papel a mais no banco é acesso ao dado de todo mundo.');
  }
});

/* owner_id divergente aponta a linha errada do HubSpot para a pessoa certa — o placar
   dela passa a somar o funil de outro, sem nada quebrar. */
Object.keys(tela).forEach(function (email) {
  if (!(email in banco)) return;
  const doJson = tela[email].ownerId;
  const doBanco = banco[email].ownerId;
  if (!doJson && doBanco === '(sem owner)') return;
  if (String(doJson || '') !== String(doBanco === '(sem owner)' ? '' : doBanco)) {
    problemas.push(email + ' tem owner_id diferente nos dois lugares: json "'
      + (doJson || '(vazio)') + '", banco "' + doBanco
      + '". owner_id errado faz o placar dela somar o funil de outro.');
  }
});

const dividaMorta = SEM_ACESSO_AINDA.filter(function (e) { return dividaVista.indexOf(e) < 0; });
if (dividaMorta.length) {
  problemas.push('SEM_ACESSO_AINDA lista ' + dividaMorta.join(', ') + ', mas isso já não '
    + 'acontece — apague dessa lista (entraram no banco, ou saíram do json).');
}

if (problemas.length) {
  console.error('GUARDA 25 REPROVADA — o time nas duas fontes:');
  problemas.forEach(function (p) { console.error('  - ' + p); });
  console.error('');
  console.error('  Nada disso aparece como erro: quem falta no banco recebe vazio, e quem');
  console.error('  sobra no banco simplesmente entra. Se TIME.txt estiver velho, rode');
  console.error('  node scripts/ler-time-do-banco.js antes de concluir que é defeito.');
  process.exit(1);
}

const reps = Object.keys(banco).filter(function (e) { return banco[e].role === 'rep'; }).length;
console.log('OK time nas duas fontes - ' + Object.keys(banco).length + ' pessoas ('
  + reps + ' reps) com papel e owner_id iguais no json e no banco'
  + (dividaVista.length ? ' (' + dividaVista.length + ' em preparação sem acesso ainda, declarados)' : '') + '.');
