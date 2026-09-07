// scripts/ler-time-do-banco.js
//
// REGENERA supabase/TIME.txt A PARTIR DE mapa_usuarios (07/09/26).
//
// Diferente de ler-politicas-do-banco.js, este fala com o banco sozinho: `mapa_usuarios`
// vive no schema `public`, então a REST do Supabase alcança. (`pg_policies` não, e é por
// isso que o outro script pede uma execução manual da consulta.)
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/ler-time-do-banco.js
//
// Service key porque `mapa_usuarios` tem RLS e a política de leitura exige um JWT de
// usuário — um script não tem sessão. E a leitura tem que ser COMPLETA: se ela vier
// filtrada por política, o arquivo gerado descreve menos gente do que o banco deixa
// entrar, e a guarda 25 fica verde sem ver quem sobrou.
//
// NUNCA EDITAR TIME.txt À MÃO: à mão ele passa a descrever o time que eu queria e não
// quem o banco deixa entrar.

const fs = require('fs');
const path = require('path');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

if (!URL || !KEY) {
  console.error('faltam SUPABASE_URL e/ou SUPABASE_SERVICE_KEY no ambiente.');
  console.error('sem a service key a leitura vem filtrada por política e o arquivo sai incompleto —');
  console.error('o que é pior do que não gerar, porque a guarda 25 ficaria verde sem ver quem sobrou.');
  process.exit(1);
}

(async function () {
  const res = await fetch(URL + '/rest/v1/mapa_usuarios?select=email,role,owner_id&order=role,email', {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
  });
  if (!res.ok) {
    console.error('a leitura falhou: HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
    process.exit(1);
  }
  const linhas = await res.json();
  if (!Array.isArray(linhas) || !linhas.length) {
    console.error('mapa_usuarios voltou vazia. Gravar isso apagaria o espelho e deixaria a');
    console.error('guarda 25 sem referência — abortando de propósito.');
    process.exit(1);
  }

  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const cabecalho = [
    '# QUEM O BANCO DEIXA ENTRAR — espelho de public.mapa_usuarios.',
    '#',
    '# POR QUE ESTE ARQUIVO EXISTE: o time do Cockpit está escrito em DOIS lugares, e os dois',
    '# são necessários. `data/usuarios.json` é o que a tela sabe (é dele que sai "N executivos',
    '# na rua" na tela de login, antes de qualquer login). `mapa_usuarios` é o que o BANCO',
    '# deixa entrar — toda política de RLS cruza o e-mail do JWT com essa tabela.',
    '#',
    '# Quando os dois divergem, ninguém reclama. Quem está no json e não está no banco não',
    '# alcança nem o próprio dado: a política não acha o e-mail, o select devolve `[]`, e a',
    '# tela mostra "não tem dado" em vez de erro. Quem está no banco e não está no json tem',
    '# acesso vivo sem estar no time.',
    '#',
    '# Em 07/09/26 os dois divergiam em SETE pessoas, e as duas metades machucavam:',
    '#   - 4 reps em preparação (scaetano, renatapessoa, andregomes, luizpimentel) estavam no',
    '#     json e não no banco. scaetano já lia o Playbook (aquela tabela usa o e-mail do JWT',
    '#     direto) mas não conseguiria salvar uma daily.',
    '#   - 3 reps que saíram do time (michel, gleyson, ricardofiaes) estavam no banco e não no',
    '#     json, com acesso vivo. Removidos em 07/09/26.',
    '#',
    '# A guarda `checar-time-nas-duas-fontes.js` compara este arquivo com data/usuarios.json',
    '# no build. Ela NÃO toca no banco — build roda no CI sem credencial.',
    '#',
    '# COMO ATUALIZAR: `node scripts/ler-time-do-banco.js` (usa SUPABASE_URL e',
    '# SUPABASE_SERVICE_KEY). Nunca editar à mão: à mão este arquivo passa a descrever o time',
    '# que eu queria e não quem o banco deixa entrar, e a guarda fica verde medindo ficção.',
    '#',
    '# gerado por scripts/ler-time-do-banco.js em ' + hoje,
    ''
  ];

  const corpo = linhas.map(function (u) {
    return String(u.email).trim() + ' = ' + String(u.role).trim() + ' , '
      + (u.owner_id ? String(u.owner_id).trim() : '(sem owner)');
  });

  fs.writeFileSync(path.join(__dirname, '..', 'supabase', 'TIME.txt'),
    cabecalho.concat(corpo).join('\n') + '\n');
  const reps = linhas.filter(function (u) { return u.role === 'rep'; }).length;
  console.log('supabase/TIME.txt regenerado: ' + linhas.length + ' pessoas (' + reps + ' reps).');
  console.log('agora rode: node scripts/checar-time-nas-duas-fontes.js');
})().catch(function (e) {
  console.error('falhou: ' + (e && e.message));
  process.exit(1);
});
