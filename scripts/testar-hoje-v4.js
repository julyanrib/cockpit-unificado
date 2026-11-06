#!/usr/bin/env node
/* ============================================================================
   HOJE DO EXECUTIVO v4 (06/11/26) · o custo da abertura e as regras congeladas

   Medido em 06/11 na produção: o Hoje v3 abria com 30 leituras e 104 KB comprimidos (a
   montagem da Pessoas do gestor, GV2.montar, e as leituras do Desenvolvimento) mais o
   playbook. O v4 abre com UMA leitura nova (placar_da_semana, ~1 KB) e o funil que o
   Cockpit já carregou. Esta suíte trava isso: o módulo não pode voltar a chamar a montagem
   pesada nem o playbook, e o banco que ele toca é só o placar e o contador.

   Uso: node scripts/testar-hoje-v4.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');
let ok = 0;
const falhas = [];
function checar(nome, cond, porque) { if (cond) ok++; else falhas.push(nome + (porque ? '\n      ' + porque : '')); }

const ini = tpl.indexOf('const HJ4 = GV2.HJ4 = {};');
const fim = tpl.indexOf('/* DESENVOLVIMENTO v2 NA PESSOAS DO GESTOR', ini);
checar('o módulo HJ4 existe', ini > 0 && fim > ini);
/* sem comentários: a explicação do módulo cita as leituras que ele NÃO faz */
const mod = ini > 0 && fim > ini ? tpl.slice(ini, fim).replace(/\/\*[\s\S]*?\*\//g, ' ') : '';

/* ── 1 · o custo ── */
const pesadas = ['GV2.montar(', 'EXH.carregar(', 'DV.carregar(', 'DV2.carregar(', 'garantirBase(', 'carregarPlaybookProtegido(', 'recurso=playbook', 'carregarDailies(', 'carregarPdiCompromissos('];
const achou = pesadas.filter(function (x) { return mod.indexOf(x) >= 0; });
checar('a abertura não chama a montagem pesada nem o playbook', !achou.length,
  'achei ' + achou.join(', ') + ' · era o que custava 30 leituras e 104 KB a cada abertura');
const rpcs = (mod.match(/rpc\('([a-z_0-9]+)'/g) || []).map(function (x) { return x.slice(5, -1); });
const fora = rpcs.filter(function (x) { return ['placar_da_semana', 'registrar_abertura'].indexOf(x) < 0; });
checar('o banco que ele toca é só o placar e o contador', rpcs.indexOf('placar_da_semana') >= 0 && !fora.length,
  'rpc a mais: ' + fora.join(', '));
checar('e ele não lê tabela direto', !/supa\.from\(/.test(mod), 'leitura direta de tabela na abertura é custo que o orçamento não tem');

/* ── 2 · o mesmo número do Planejamento ── */
checar('leads saem da fila do Planejamento (PLV3.dados), não de uma conta própria', /PL\.dados\(rep\)/.test(mod) && /GV2\.semProximoPasso/.test(tpl.slice(tpl.indexOf('PLV3.dados = function'), tpl.indexOf('PLV3.dados = function') + 20000)));
checar('a base leve usa a mesma montagem do negócio que a base inteira',
  /const montarNegocio = function \(l, sid, idx\) \{ return GV2\.negocioDoFunil\(/.test(tpl) && /GV2\.baseLeve = function/.test(tpl) && /GV2\.negocioDoFunil\(l, sid, idx, ctx\)/.test(tpl),
  'duas montagens dariam dois "sem próximo passo" (o Hoje e o Planejamento discordando)');

/* ── 3 · o que é congelado ── */
checar('"Pôr em [dia]" grava pelo caminho do Planejamento (PLV3.porNoDia)', /PL\.porNoDia\(ref, di\)/.test(mod));
checar('o texto do botão é "Pôr em " + o dia', /'Pôr em ' \+ GV2\.PLV3\.rotCurto\(/.test(mod));
checar('o nome abre a gaveta do negócio de sempre', /GV2\.PLV3\.acao\('ficha', arg\)/.test(mod));
checar('o ranking não tem linha clicável', (function () {
  const a = mod.indexOf('const lin = function (x) {');
  const b = mod.indexOf('};', a);
  return a > 0 && mod.slice(a, b).indexOf('data-hj4') < 0;
}()), 'linha de colega clicável levaria a cliente de colega');
checar('os pesos vêm do banco (regra), nunca fixos', !/\* 100\b|× 100'|\b25 \*|\* 25\b/.test(mod) && /R\.venda/.test(mod) && /R\.reuniao/.test(mod) && /R\.visita/.test(mod));
checar('fonte fora mostra "—", nunca 0', /HJ4\.fora\(/.test(mod) && /Fonte fora · /.test(mod));
checar('desfazer só no "sem passo" (no vencido apagaria a tarefa antiga)', /if \(!pz \|\| pz\.vencido\) return;/.test(mod));

console.log('');
console.log('hoje v4: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
