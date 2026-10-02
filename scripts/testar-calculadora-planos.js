#!/usr/bin/env node
/* Calculadora de Planos (aba Propostas, 02/10/26).

   1. Os 18 testes ORIGINAIS do pacote do Takeat OS (precificacao-para-replicar/referencia/
      precificacao.test.js), sem reescrever nenhum, rodam contra o motor do template: o
      bloco entre PC9-MOTOR-INICIO e PC9-MOTOR-FIM é extraído e as funções dele recebem os
      nomes que o teste importa. Se estes números batem, o cálculo é o do Takeat OS.
   2. A ponte para os extras (WhatsApp, Registrar no HubSpot, mensagem) devolve o mesmo
      mensal, total e economia que o motor, em todas as combinações de tipo × plano ×
      periodicidade, com e sem adicionais.

   A tabela de preços e os testes com preços NÃO estão no git (o repositório é público):
   moram em scripts/fixtures/calculadora/, ignorada. Sem eles, a suíte diz PULADO com
   todas as letras e sai com erro, para ninguém ler o pulo como verde. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const dir = path.join(__dirname, 'fixtures', 'calculadora');
const arqConfig = path.join(dir, 'pricing_config.json');
const arqTestes = path.join(dir, 'precificacao.test.js');

let falhas = 0, passou = 0;
function checar(nome, ok, extra) {
  if (ok) { passou++; console.log('  ok   ' + nome); }
  else { falhas++; console.log('  FALHA ' + nome + (extra ? ' — ' + extra : '')); }
}

function bloco(ini, fim) {
  const a = template.indexOf(ini), b = template.indexOf(fim);
  if (a < 0 || b < 0 || b < a) throw new Error('marcadores ' + ini + ' / ' + fim + ' não encontrados no template');
  return template.slice(a + ini.length, b);
}

if (!fs.existsSync(arqConfig) || !fs.existsSync(arqTestes)) {
  console.log('PULADO: faltam scripts/fixtures/calculadora/pricing_config.json e precificacao.test.js');
  console.log('(copie do pacote precificacao-para-replicar: dados/ e referencia/). Nada foi medido.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(arqConfig, 'utf8'));

/* o motor do template, num contexto isolado */
const ctx = { console: console };
vm.createContext(ctx);
vm.runInContext(bloco('/* PC9-MOTOR-INICIO */', '/* PC9-MOTOR-FIM */')
  + ';this.M={estadoInicial:pc9EstadoInicial,tierValido:pc9TierValido,situacaoDoAdicional:pc9SituacaoDoAdicional,'
  + 'calcularProposta:pc9Calcular,funcionalidadesDoPlano:pc9FuncionalidadesDoPlano,dividirEmColunas:pc9DividirEmColunas,'
  + 'alertasDaProposta:pc9Alertas,textoDoInvestimento:pc9TextoDoInvestimento,precoComDesconto:pc9PrecoComDesconto,'
  + 'quantidadeDe:pc9QuantidadeDe,formatarBRL:pc9BRL};', ctx);
const M = ctx.M;

/* ── 1 · os 18 testes do pacote, com um vitest de bolso ─────────────────────────── */
console.log('1 · testes originais do Takeat OS');
function igual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function contem(obj, parcial) {
  if (parcial === null || typeof parcial !== 'object') return obj === parcial;
  if (obj === null || typeof obj !== 'object') return false;
  return Object.keys(parcial).every(function (k) { return contem(obj[k], parcial[k]); });
}
function expect(v) {
  const falha = function (m) { throw new Error(m + ' (recebido: ' + JSON.stringify(v).slice(0, 200) + ')'); };
  const sim = matchers(v, falha);
  /* .not inverte cada matcher: passa quando o original reprovaria */
  sim.not = {};
  Object.keys(sim).forEach(function (k) {
    if (k === 'not') return;
    sim.not[k] = function () {
      let reprovou = false;
      try { sim[k].apply(null, arguments); } catch (e) { reprovou = true; }
      if (!reprovou) falha('esperava que NÃO ' + k + ' ' + JSON.stringify(arguments[0]));
    };
  });
  return sim;
}
function matchers(v, falha) {
  return {
    toBe: function (x) { if (v !== x) falha('esperava ' + JSON.stringify(x)); },
    toEqual: function (x) { if (!igual(v, x)) falha('esperava ' + JSON.stringify(x).slice(0, 200)); },
    toMatchObject: function (x) { if (!contem(v, x)) falha('não contém ' + JSON.stringify(x).slice(0, 200)); },
    toContain: function (x) { if (!(v && v.indexOf && v.indexOf(x) >= 0)) falha('não contém ' + JSON.stringify(x)); },
    toMatch: function (x) { if (!(typeof x === 'string' ? String(v).indexOf(x) >= 0 : x.test(String(v)))) falha('não casa ' + x); },
    toBeNull: function () { if (v !== null) falha('esperava null'); },
    toHaveLength: function (n) { if (!v || v.length !== n) falha('esperava tamanho ' + n); }
  };
}
const casos = [];
let prefixo = '';
function describe(nome, fn) { const antes = prefixo; prefixo = nome + ' · '; fn(); prefixo = antes; }
function it(nome, fn) { casos.push({ nome: prefixo + nome, fn: fn }); }

let fonte = fs.readFileSync(arqTestes, 'utf8');
/* tira os imports (vitest, fs, o motor) e a leitura do JSON: entram pelo contexto */
fonte = fonte.replace(/^import[\s\S]*?from\s+'[^']+'\s*$/gm, '')
  .replace(/^const config = JSON\.parse\([^\n]*$/m, '');
const nomes = Object.keys(M);
const fn = new Function('describe', 'it', 'expect', 'config', nomes.join(','), fonte);
fn.apply(null, [describe, it, expect, config].concat(nomes.map(function (n) { return M[n]; })));
checar('o arquivo de testes do pacote tem os 18 casos', casos.length === 18, 'achei ' + casos.length);
casos.forEach(function (c) {
  try { c.fn(); checar(c.nome, true); } catch (e) { checar(c.nome, false, e.message); }
});

/* ── 2 · a ponte dos extras devolve os números do motor ──────────────────────────── */
console.log('2 · a ponte para WhatsApp / Registrar / mensagem');
const ctx2 = { console: console };
vm.createContext(ctx2);
vm.runInContext(bloco('/* PC9-MOTOR-INICIO */', '/* PC9-MOTOR-FIM */')
  + bloco('/* PC9-PONTE-INICIO */', '/* PC9-PONTE-FIM */')
  + ';this.P={calc:pc9Calcular,ponte:pc9ResultadoNoFormatoAntigo,cache:pc9ParaCacheAntigo};', ctx2);
const P = ctx2.P;
let combos = 0, divergencias = [];
const cache = P.cache(config);
checar('a tabela antiga tem os tipos e os adicionais da nova',
  cache.tipos.length === Object.keys(config.planos).length && cache.adicionais.length === config.adicionais.length);
checar('Delivery, Balcão e Mesas vira o tipo "mesas" (o HubSpot depende do id)', cache.tipos[0].id === 'mesas');
Object.keys(config.planos).forEach(function (tipo) {
  config.planos[tipo].tiers.forEach(function (t) {
    config.periodicidades.forEach(function (per) {
      [{}, { todos: true }].forEach(function (op) {
        const ativos = {}, qtd = {};
        if (op.todos) config.adicionais.forEach(function (a, i) { ativos[a.id] = true; if (a.perUnit) qtd[a.id] = 1 + (i % 3); });
        const e = { tipoPlano: tipo, tier: t.id, periodicidade: per.id, adicionaisAtivos: ativos, quantidades: qtd };
        const novo = P.calc(config, e);
        const velho = P.ponte(config, e);
        combos++;
        if (velho.mensal !== novo.totalMonthly || velho.total !== novo.totalContract || velho.economia !== novo.economia
          || velho.planoMensal !== novo.planMonthly) divergencias.push(tipo + '/' + t.id + '/' + per.id);
      });
    });
  });
});
checar(combos + ' combinações: mensal, total, economia e plano iguais ao motor', divergencias.length === 0, divergencias.slice(0, 3).join(', '));
const exemplo = P.ponte(config, { tipoPlano: 'delivery', tier: 'basico', periodicidade: 'per_1776194515296',
  adicionaisAtivos: { totem: true, ad_1785521517589: true }, quantidades: { totem: 2 } });
checar('caso do pacote pela ponte: R$ 830/mês, R$ 4.980, economia R$ 876',
  exemplo.mensal === 830 && exemplo.total === 4980 && exemplo.economia === 876, JSON.stringify([exemplo.mensal, exemplo.total, exemplo.economia]));
checar('o plano Inovação chega ao HubSpot como "inovacao"', P.ponte(config, { tipoPlano: 'completo', tier: 'intermediario',
  periodicidade: 'mensal', adicionaisAtivos: {}, quantidades: {} }).plano.id === 'inovacao');

console.log('\n' + passou + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
