// scripts/checar-politica-do-front.js
//
// GUARDA 24 — TODO COMANDO QUE O FRONT USA TEM QUE TER POLÍTICA (07/09/26).
//
// O DEFEITO QUE ELA EXISTE PARA PEGAR, medido no banco com transação e rollback:
// `pdi_documentos` e `playbook_progresso` têm RLS ligada e NÃO têm política de DELETE.
// Um delete barrado por RLS **não é erro** no Postgres — apaga zero linhas e devolve
// sucesso. Então `if (error)` nunca dispara e a tela reporta que apagou. No PDI era
// pior: o arquivo do storage era removido antes, o cartão saía da tela, e a linha
// ficava no banco apontando para um arquivo que já não existia.
//
// A MESMA ARMADILHA NA LEITURA: select sem política devolve `[]`, e a tela mostra
// "não tem dado". É o caminho mais curto para um número errado chegar na tela em
// silêncio — e contraria a regra de que "não medido" nunca é zero.
//
// COMO ELA MEDE, e por que não toca no banco: o build roda no CI, sem credencial de
// banco. Então o contrato vive versionado em `supabase/POLITICAS.txt` (gerado por
// `scripts/ler-politicas-do-banco.js`, que é quem fala com o Postgres). Esta guarda
// compara o template com esse arquivo. Mesma divisão da guarda 23.
//
// UPSERT CONTA COMO INSERT **E** UPDATE: `insert ... on conflict do update` precisa
// das duas políticas. Ter só a de insert faz o upsert falhar na segunda gravação —
// exatamente quando o executivo corrige um número que ele já havia salvo.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ARQ_POLITICAS = path.join(root, 'supabase', 'POLITICAS.txt');
const ARQ_TEMPLATE = path.join(root, 'template', 'cockpit.template.html');

/* Tabelas que o front NÃO alcança de propósito: são lidas só pelo servidor, com
   service_role. RLS ligada com zero política é a proteção delas. Se o front começar a
   usar uma destas, a guarda reprova — e a resposta é uma rota em api/, nunca uma
   política de leitura no banco. */
const SO_DO_SERVIDOR = ['cockpit_snapshot', 'novidades_mercado', 'restaurantes_osm',
  'webhook_cooldown', 'backup_donos_sp_20260901'];

/* LISTA VAZIA, que é o estado correto (07/09/26).

   Ela teve `pdi_documentos:delete` por algumas horas: a tabela tinha botão de apagar na
   tela e nenhuma política de DELETE. A migration 20260907233441 criou a política, e o
   mesmo teste que provou o defeito foi refeito esperando o oposto — o gestor vê a linha
   e apaga de verdade.

   Se voltar a ter item aqui, é dívida ESPERANDO uma mudança no banco. A checagem de
   dívida morta, mais abaixo, reprova o build quando o item deixa de ser verdade —
   dívida que fica na lista para sempre deixa de ser vista. */
const DIVIDA_CONHECIDA = [];

function lerPoliticas() {
  if (!fs.existsSync(ARQ_POLITICAS)) {
    console.error('GUARDA 24 REPROVADA: falta supabase/POLITICAS.txt.');
    console.error('  rode: node scripts/ler-politicas-do-banco.js');
    process.exit(1);
  }
  const mapa = {};
  fs.readFileSync(ARQ_POLITICAS, 'utf8').split('\n').forEach(function (linha) {
    const l = linha.trim();
    if (!l || l[0] === '#') return;
    const p = l.split('=');
    if (p.length !== 2) return;
    const cmds = p[1].trim();
    mapa[p[0].trim()] = cmds === '(nenhuma)' ? [] : cmds.split(',').map(function (x) { return x.trim(); });
  });
  return mapa;
}

/* Que comando o front usa em cada tabela. Para cada `.from('tabela')`, olha o trecho
   seguinte procurando o método do supabase-js. Não é parser — é o bastante porque a
   cadeia sempre vem junto do .from() nesta base, e erra para o lado seguro: se não
   reconhecer nenhum método, AVISA em vez de aprovar em silêncio. */
function lerUsosDoFront() {
  const t = fs.readFileSync(ARQ_TEMPLATE, 'utf8');
  const re = /\.from\('([a-z_]+)'\)/g;
  const usos = {};
  const semMetodo = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const tabela = m[1];
    /* `supa.storage.from('bucket')` é storage, não tabela — tem política própria. */
    if (t.slice(Math.max(0, m.index - 40), m.index).indexOf('storage') > -1) continue;

    const trecho = t.slice(m.index, m.index + 400);
    const linha = t.slice(0, m.index).split('\n').length;
    const ops = [];
    if (/\.select\(/.test(trecho)) ops.push('select');
    if (/\.upsert\(/.test(trecho)) { ops.push('insert'); ops.push('update'); }
    if (/\.insert\(/.test(trecho)) ops.push('insert');
    if (/\.update\(/.test(trecho)) ops.push('update');
    if (/\.delete\(/.test(trecho)) ops.push('delete');
    if (!ops.length) { semMetodo.push(tabela + ' (L' + linha + ')'); continue; }
    if (!usos[tabela]) usos[tabela] = {};
    ops.forEach(function (o) {
      if (!usos[tabela][o]) usos[tabela][o] = [];
      usos[tabela][o].push(linha);
    });
  }
  return { usos: usos, semMetodo: semMetodo };
}

const politicas = lerPoliticas();
const usados = lerUsosDoFront();
const usos = usados.usos;

const problemas = [];
const dividaVista = [];

Object.keys(usos).sort().forEach(function (tabela) {
  if (SO_DO_SERVIDOR.indexOf(tabela) > -1) {
    problemas.push('o front usa `' + tabela + '`, que é só do servidor (RLS ligada, zero política '
      + 'de propósito). A leitura tem que passar por uma rota em api/, com service_role.');
    return;
  }
  if (!(tabela in politicas)) {
    problemas.push('o front usa `' + tabela + '`, que não está em POLITICAS.txt — tabela nova '
      + 'sem RLS, ou o manifesto está velho (rode ler-politicas-do-banco.js).');
    return;
  }
  const tem = politicas[tabela];
  Object.keys(usos[tabela]).sort().forEach(function (op) {
    if (tem.indexOf(op) > -1) return;
    if (DIVIDA_CONHECIDA.indexOf(tabela + ':' + op) > -1) { dividaVista.push(tabela + ':' + op); return; }
    problemas.push('`' + tabela + '` não tem política de ' + op.toUpperCase()
      + ', e o front faz ' + op + ' em L' + usos[tabela][op].join(', L')
      + ' — o Postgres não vai dar erro: devolve vazio/zero linha e a tela mente.');
  });
});

if (usados.semMetodo.length) {
  problemas.push('não reconheci o método em ' + usados.semMetodo.length + ' uso(s) de .from(): '
    + usados.semMetodo.slice(0, 5).join(', ') + ' — a guarda não sabe o que cobrar, confira à mão.');
}

/* Dívida que sumiu do código tem que sumir da lista. Senão a lista protege um defeito
   que já não existe, e a próxima pessoa confia nela — foi assim que uma guarda passou
   a medir outra função em silêncio. */
const dividaMorta = DIVIDA_CONHECIDA.filter(function (d) { return dividaVista.indexOf(d) < 0; });
if (dividaMorta.length) {
  problemas.push('DIVIDA_CONHECIDA lista ' + dividaMorta.join(', ') + ', mas isso já não '
    + 'acontece — apague dessa lista (política criada, ou o front parou de usar).');
}

if (problemas.length) {
  console.error('GUARDA 24 REPROVADA — política do banco x uso do front:');
  problemas.forEach(function (p) { console.error('  - ' + p); });
  console.error('');
  console.error('  Nenhum desses aparece como erro em produção: sem política, o Postgres devolve');
  console.error('  vazio ou zero linha, com sucesso. A tela é que mostra o número errado.');
  process.exit(1);
}

console.log('OK política do front - as ' + Object.keys(usos).length + ' tabelas que a tela toca '
  + 'autorizam os comandos que ela usa'
  + (dividaVista.length ? ' (' + dividaVista.length + ' de dívida declarada, aguardando DDL)' : '') + '.');
