// scripts/ler-politicas-do-banco.js
//
// REGENERA supabase/POLITICAS.txt A PARTIR DO BANCO (07/09/26).
//
// POR QUE NÃO FALA SOZINHO COM O POSTGRES: a REST do Supabase (`/rest/v1/`) só expõe o
// schema `public`. `pg_policies` vive em `pg_catalog`, fora do alcance dela. Chegar lá
// exigiria criar uma função RPC no banco — DDL, e DDL neste projeto não se aplica sem
// o Julyan mandar. Então este script faz as duas metades que dependem só dele: imprime
// a consulta exata, e transforma o resultado dela no manifesto.
//
//   1. node scripts/ler-politicas-do-banco.js --sql        (mostra a consulta)
//   2. rode a consulta no SQL Editor do Supabase, exporte JSON
//   3. node scripts/ler-politicas-do-banco.js politicas.json
//
// POR QUE NÃO EDITAR O MANIFESTO À MÃO: à mão ele passa a descrever o que eu queria e
// não o que o banco faz — e aí a guarda 24 fica verde medindo ficção. Já aconteceu
// neste projeto com uma guarda cravada num nome: verde idêntico ao legítimo, medindo
// outra coisa.

const fs = require('fs');
const path = require('path');

const SQL = [
  '-- Comandos que cada tabela com RLS ligada autoriza. Alimenta supabase/POLITICAS.txt.',
  '-- `ALL` conta para os quatro comandos; contar politicas nao serve, porque tres',
  '-- politicas de SELECT nao autorizam um DELETE.',
  'select',
  "  c.relname || ' = ' ||",
  "  coalesce(nullif(concat_ws(',',",
  "    case when bool_or(p.cmd in ('SELECT','ALL')) then 'select' end,",
  "    case when bool_or(p.cmd in ('INSERT','ALL')) then 'insert' end,",
  "    case when bool_or(p.cmd in ('UPDATE','ALL')) then 'update' end,",
  "    case when bool_or(p.cmd in ('DELETE','ALL')) then 'delete' end), ''), '(nenhuma)') as linha",
  'from pg_class c',
  'join pg_namespace n on n.oid = c.relnamespace',
  "left join pg_policies p on p.tablename = c.relname and p.schemaname = 'public'",
  "where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true",
  'group by c.relname',
  'order by c.relname;'
].join('\n');

const arg = process.argv[2];

if (!arg || arg === '--sql') {
  console.log(SQL);
  console.log('');
  console.log('-- depois: node scripts/ler-politicas-do-banco.js <arquivo.json>');
  process.exit(0);
}

let bruto;
try {
  bruto = JSON.parse(fs.readFileSync(arg, 'utf8'));
} catch (e) {
  console.error('não consegui ler ' + arg + ' como JSON: ' + e.message);
  process.exit(1);
}

/* Aceita as duas formas que o SQL Editor exporta: lista de {linha: "..."} ou lista de
   strings. Qualquer outra coisa é erro explícito — manifesto meio escrito é pior que
   manifesto ausente, porque a guarda 24 aprova o que não estiver nele. */
const linhas = (Array.isArray(bruto) ? bruto : []).map(function (r) {
  if (typeof r === 'string') return r;
  if (r && typeof r.linha === 'string') return r.linha;
  return null;
});
if (!linhas.length || linhas.indexOf(null) > -1) {
  console.error('formato inesperado: esperava lista de {"linha": "tabela = select,insert"}.');
  console.error('rode `node scripts/ler-politicas-do-banco.js --sql` e use aquela consulta.');
  process.exit(1);
}

/* QUEM ESTÁ SEM POLÍTICA, LIDO DO PRÓPRIO MANIFESTO que acabou de vir do banco.
   Ver a nota no parágrafo, mais abaixo, que usa esta lista. */
const semPolitica = linhas.filter(function (l) { return l.indexOf('= (nenhuma)') > -1; })
  .map(function (l) { return l.split('=')[0].trim(); });
function nomeDoNumero(n) {
  const nomes = ['nenhuma', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito'];
  return nomes[n] || String(n);
}

const cabecalho = [
  '# QUE COMANDO CADA TABELA AUTORIZA — o contrato que a guarda 24 cobra do front.',
  '#',
  '# POR QUE ESTE ARQUIVO EXISTE: sem política, o Postgres NÃO dá erro. Um select sem',
  '# política devolve `[]` e a tela mostra "não tem dado". Um delete sem política apaga',
  '# zero linhas e devolve sucesso, e a tela diz que apagou. Foi assim que dois botões',
  '# de apagar passaram meses mentindo (pdi_documentos e playbook_progresso, medidos no',
  '# banco com transação e rollback em 07/09/26).',
  '#',
  '# A guarda `checar-politica-do-front.js` lê este arquivo e o template, e reprova o',
  '# build quando o front usa um comando que a tabela não autoriza. Ela NÃO toca no',
  '# banco — build tem que rodar offline, no CI, sem credencial.',
  '#',
  '# COMO ATUALIZAR: `node scripts/ler-politicas-do-banco.js --sql`, rode a consulta,',
  '# e passe o JSON de volta para este script. Nunca edite à mão: à mão este arquivo',
  '# passa a descrever o que eu queria e não o que o banco faz.',
  '#',
  /* ESTA LISTA VEM DO DADO, E NÃO DA MINHA MEMÓRIA (08/09/26). O parágrafo estava
     cravado em "três tabelas: cockpit_snapshot, novidades_mercado e restaurantes_osm".
     O banco tem CINCO: webhook_cooldown e backup_donos_sp_20260901 entraram em 07/09/26,
     quando estavam com RLS DESLIGADA e grant ao anon — e a chave anon viaja dentro do
     bundle público. Quem corrigiu aquilo editou o ARQUIVO à mão e o gerador ficou com a
     frase velha, então rodar o gerador hoje DESFAZIA a correção e voltava a dizer três.
     É o mesmo defeito que este arquivo existe para impedir — descrever o que eu queria
     em vez do que o banco faz —, com o agravante de que prosa errada não reprova guarda
     nenhuma. */
  '# `(nenhuma)` é legítimo em ' + nomeDoNumero(semPolitica.length) + ' tabelas, lidas SÓ',
  '# pelo servidor (api/, com service_role): ' + semPolitica.join(', ') + '.',
  '# RLS ligada com zero política é exatamente a proteção que elas precisam —',
  '# cockpit_snapshot, por exemplo, guarda o CRM inteiro. Se o front passar a ler',
  '# qualquer uma delas, a guarda 24 reprova, e a resposta certa é uma rota em api/,',
  '# nunca uma política de leitura aqui.',
  '#',
  '# gerado por scripts/ler-politicas-do-banco.js em ' +
    new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  ''
];

const destino = path.join(__dirname, '..', 'supabase', 'POLITICAS.txt');
fs.writeFileSync(destino, cabecalho.concat(linhas).join('\n') + '\n');
console.log('supabase/POLITICAS.txt regenerado: ' + linhas.length + ' tabelas com RLS ligada.');
console.log('agora rode: node scripts/checar-politica-do-front.js');
