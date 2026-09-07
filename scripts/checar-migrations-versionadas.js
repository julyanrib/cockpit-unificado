// scripts/checar-migrations-versionadas.js
//
// TODA MIGRATION APLICADA TEM ARQUIVO NO REPO (07/09/26)
// -----------------------------------------------------------------------------
// Esta guarda nasceu de um achado: o banco de produção tinha **20 migrations
// aplicadas** e o repositório tinha **5 arquivos**. Quinze foram aplicadas direto
// (pelo painel ou pelo MCP) e nunca commitadas — e as tabelas base, criadas antes
// de existir histórico, não tinham CREATE TABLE em lugar nenhum.
//
// A CONSEQUÊNCIA, que é o que importa: não havia como recriar o banco. Se o
// projeto fosse perdido, ou se alguém quisesse um ambiente de teste, o schema
// teria de ser reconstruído de memória a partir do que o código lê.
//
// O QUE ELA MEDE, e o que ela não mede: ela roda no CI, sem credencial de banco,
// então NÃO consulta o Supabase. Ela compara supabase/migrations/APLICADAS.txt
// (a lista do que o banco tem, atualizada à mão junto com cada migration) com os
// arquivos do diretório. Se alguém aplicar uma migration e esquecer o arquivo — ou
// o contrário — a lista e o diretório divergem e isto reprova.
//
// Não substitui olhar o banco de vez em quando: se alguém aplicar uma migration E
// esquecer as duas coisas, nada aqui percebe. O que ela garante é que as duas
// metades do trabalho andem juntas.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const manifesto = path.join(dir, 'APLICADAS.txt');

let falhou = false;
function reprovar(titulo, linhas) {
  falhou = true;
  console.error('  ✗ ' + titulo);
  (linhas || []).forEach(function (l) { console.error('      ' + l); });
}

/* ── 1. o manifesto existe e é legível ────────────────────────────────────── */
if (!fs.existsSync(manifesto)) {
  reprovar('não achei supabase/migrations/APLICADAS.txt',
    ['sem ele não há com o que comparar os arquivos — a guarda perde o alvo']);
  process.exit(1);
}
const aplicadas = fs.readFileSync(manifesto, 'utf8').split(/\r?\n/)
  .map(function (l) { return l.trim(); })
  .filter(function (l) { return l && l.charAt(0) !== '#'; })
  .map(function (l) {
    const p = l.split(/\s+/);
    return { versao: p[0], nome: p.slice(1).join(' ') };
  });

if (!aplicadas.length) {
  reprovar('APLICADAS.txt não tem nenhuma migration listada', ['arquivo vazio mede nada']);
  process.exit(1);
}

/* ── 2. os arquivos ───────────────────────────────────────────────────────── */
const arquivos = fs.readdirSync(dir).filter(function (f) { return /\.sql$/.test(f); });

/* o baseline é o único arquivo que não corresponde a uma migration aplicada */
const BASELINE = '20260724000000_baseline_do_que_veio_antes_do_historico.sql';

/* ── 3. convenção de nome: <14 dígitos>_<nome>.sql ────────────────────────── */
const foraDaConvencao = arquivos.filter(function (f) { return !/^\d{14}_[a-z0-9_]+\.sql$/.test(f); });
if (foraDaConvencao.length) {
  reprovar('arquivo fora da convenção <versão de 14 dígitos>_<nome>.sql', foraDaConvencao);
}

/* ── 4. toda aplicada tem arquivo ─────────────────────────────────────────── */
const semArquivo = aplicadas.filter(function (m) {
  return !arquivos.some(function (f) { return f.indexOf(m.versao + '_') === 0; });
});
if (semArquivo.length) {
  reprovar('migration aplicada no banco e SEM arquivo no repo',
    semArquivo.map(function (m) { return m.versao + ' ' + m.nome + '  — o schema desta mudança só existe no Supabase'; }));
}

/* ── 5. todo arquivo é uma aplicada (ou o baseline) ───────────────────────── */
const semRegistro = arquivos.filter(function (f) {
  if (f === BASELINE) return false;
  const v = f.slice(0, 14);
  return !aplicadas.some(function (m) { return m.versao === v; });
});
if (semRegistro.length) {
  reprovar('arquivo no repo que não consta como aplicado',
    semRegistro.concat(['se ele já foi aplicado, acrescente a linha em APLICADAS.txt; se não foi, ele é uma migration pendente e isso precisa estar dito']));
}

/* ── 6. o nome do arquivo bate com o nome registrado ─────────────────────── */
const nomeDivergente = [];
aplicadas.forEach(function (m) {
  const f = arquivos.find(function (x) { return x.indexOf(m.versao + '_') === 0; });
  if (!f) return;
  const noArquivo = f.slice(15, -4);
  if (noArquivo !== m.nome) nomeDivergente.push(m.versao + ': banco diz "' + m.nome + '", arquivo diz "' + noArquivo + '"');
});
if (nomeDivergente.length) {
  reprovar('o nome do arquivo não bate com o nome registrado no banco', nomeDivergente);
}

/* ── 7. o baseline existe ─────────────────────────────────────────────────── */
if (!arquivos.includes(BASELINE)) {
  reprovar('o baseline desapareceu',
    ['sem ele as 17 tabelas criadas antes do histórico voltam a não ter CREATE TABLE em lugar nenhum',
     'e o banco deixa de ser recriável a partir do repositório']);
}

if (falhou) {
  console.error('\nmigrations versionadas: reprovado.');
  process.exit(1);
}
console.log('migrations versionadas: ' + aplicadas.length + ' aplicadas, ' + arquivos.length
  + ' arquivos (as ' + aplicadas.length + ' + o baseline) — o schema do banco está no git.');
