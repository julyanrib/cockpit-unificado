#!/usr/bin/env node
/* ============================================================================
   NO PLANO É PRÓXIMO PASSO (14/10/26)

   Julyan: "se está no planejamento tem próximo passo, quero isso corrigido em tudo".
   A regra mora em proximoPassoDoLead (template), que todas as telas antigas usam, e
   em dataDoProximoPasso, que substituiu as leituras diretas de `proximaAtividade`.
   Esta suíte roda as funções DE VERDADE, tiradas do template, e confere:
     1. negócio no plano de hoje em diante tem próximo passo, com o rótulo 'no plano';
     2. plano que já passou não conta;
     3. no mesmo dia, a tarefa do HubSpot vem antes do plano;
     4. sem o registro (antes do login), tudo como era;
     5. nenhuma tela decide "sem próximo passo" lendo `proximaAtividade` sozinha.

   Uso: node scripts/testar-plano-e-passo.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) { if (cond) { ok += 1; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); }

function fatia(ini, fim) {
  const i = tpl.indexOf(ini);
  const j = tpl.indexOf(fim, i);
  if (i < 0 || j < 0) throw new Error('não achei no template: ' + ini);
  return tpl.slice(i, j + fim.length);
}
const codigo = [
  fatia('function isoDate(d) {', '\n}'),
  fatia('function addDays(dateISO, n) {', '\n}'),
  fatia('var PLANO_POR_NEGOCIO = {};', 'function dataDoProximoPasso(lead) { const p = proximoPassoDoLead(lead); return p ? p.data : null; }')
].join('\n');
const M = new Function(codigo + '\nreturn { proximoPassoDoLead, leadTemProximoPasso, dataDoProximoPasso, isoDate, addDays, plano: function (m) { PLANO_POR_NEGOCIO = m; } };')();

const hoje = M.isoDate(new Date());
const depois = M.addDays(hoje, 2), ontem = M.addDays(hoje, -1);

/* 4. sem registro: nada muda */
M.plano({});
checar('sem plano e sem tarefa: sem próximo passo', M.proximoPassoDoLead({ id: '1' }) === null && !M.leadTemProximoPasso({ id: '1' }));

/* 1. no plano de hoje em diante */
M.plano({ '1': depois, '2': ontem, '3': hoje });
const p1 = M.proximoPassoDoLead({ id: '1' });
checar('no plano depois de amanhã: tem próximo passo, rótulo "no plano"', !!p1 && p1.plano === true && p1.rotulo === 'no plano' && M.isoDate(new Date(p1.data)) === depois, JSON.stringify(p1));
checar('no plano hoje: tem próximo passo o dia inteiro', M.leadTemProximoPasso({ id: '3' }));
checar('dataDoProximoPasso devolve a data do plano', !!M.dataDoProximoPasso({ id: '1' }));

/* 2. plano que passou não conta */
checar('plano de ontem não é próximo passo', !M.leadTemProximoPasso({ id: '2' }));

/* 3. mesmo dia: HubSpot antes; tarefa mais cedo que o plano vence; plano mais cedo vence */
const mesmoDia = M.proximoPassoDoLead({ id: '3', proximaAtividade: hoje + 'T12:00:00Z' });
checar('mesmo dia: a atividade do HubSpot vem antes do plano', mesmoDia && !mesmoDia.plano && mesmoDia.rotulo === 'atividade', JSON.stringify(mesmoDia));
const planoAntes = M.proximoPassoDoLead({ id: '3', proximaAtividade: M.addDays(hoje, 5) + 'T12:00:00Z' });
checar('o plano mais cedo que a tarefa é o próximo passo', planoAntes && planoAntes.plano, JSON.stringify(planoAntes));

/* 5. nenhuma tela decide "sem passo" lendo proximaAtividade sozinha (fora do bloco gv2 e
      das cargas, que só copiam o campo) */
const semGv2 = tpl.replace(/<script id="gv2-js">[\s\S]*?<\/script>/, '');
const sozinhas = [
  '!l.proximaAtividade).length',
  "prox: l.proximaAtividade ?",
  'dlProx: lSel.proximaAtividade',
  "if (!l.proximaAtividade) return 'sem próximo passo datado'",
  "pfCampo('próximo passo', l.proximaAtividade",
  'if (d.proximaAtividade) return false;'
].filter(s => semGv2.indexOf(s) >= 0);
checar('nenhuma leitura direta de proximaAtividade decide "sem próximo passo"', !sozinhas.length, sozinhas.join(' | '));

/* a carga existe, roda depois do login e de cada gravação do plano */
checar('carregarPlanoDosNegocios roda depois do login (reidratarPosLogin)',
  /if \(typeof carregarAgendaDoApp === 'function'\) await carregarAgendaDoApp\(\);\s*if \(typeof carregarPlanoDosNegocios === 'function'\) await carregarPlanoDosNegocios\(\);/.test(tpl));
checar('o plano gravado (semana e dia) recarrega o registro',
  (tpl.match(/if \(typeof carregarPlanoDosNegocios === 'function'\) carregarPlanoDosNegocios\(\);/g) || []).length === 2);
checar('a carga lê esta semana e a próxima',
  tpl.indexOf("supa.rpc('rotas_da_semana', { p_segunda: seg, p_donos: p_donos })") > 0 && tpl.indexOf("supa.rpc('rotas_da_semana', { p_segunda: prox, p_donos: p_donos })") > 0);

if (falhas.length) {
  console.log('FALHOU: ' + falhas.length);
  falhas.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('no plano é próximo passo: ' + ok + ' verificações · tudo certo.');
