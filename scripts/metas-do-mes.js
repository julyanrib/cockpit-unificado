'use strict';
//  A META DO MÊS CORRENTE, ESCOLHIDA PELO CALENDÁRIO.
//
//  Até 28/10/26 o arquivo tinha UM conjunto de metas e um campo "mes" que ninguém lia.
//  Trocar a meta era trocar esse conjunto — e a meta nova passava a valer no instante do
//  merge, não no dia 1. Em 28/10 isso quase aconteceu: a meta de novembro entrou no main
//  com três dias de outubro pela frente (a Kelly ficaria sem meta trabalhando até 31/10,
//  quatro novatos ganhariam meta num mês em que o Julyan tinha dito que não teriam, e o
//  time cairia de 52 para 44 no meio da corrida). Foi revertida a tempo, mas o rito
//  passou a depender de alguém lembrar a data — e lembrar não é garantia.
//
//  Agora o arquivo guarda UM BLOCO POR MÊS em `porMes` e quem escolhe é o relógio. A meta
//  do mês que vem pode ser mergeada no dia em que for decidida: ela só entra em vigor
//  quando o mês virar.
const fs = require('fs');

/*  O MÊS EM BRASÍLIA, não em UTC. Tem de ser o MESMO recorte que o robô usa para contar
    o que foi fechado no mês (diaBrasiliaDe, em fetch-hubspot.js, desloca 3 horas). Se a
    meta virasse por UTC e a venda contasse por Brasília, as três primeiras horas do dia
    1 teriam a meta de um mês e as vendas do outro — divergência invisível e sazonal, do
    tipo que só aparece na reunião. */
function mesBrasiliaDe(valor) {
  const ms = valor == null ? Date.now() : Date.parse(valor);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/*  A SOMA TEM DE BATER COM O TOTAL DO TIME, com a gordura declarada. Guarda antiga, que
    existe porque em 10/09/26 a meta do time era 80 e ninguém sabia de onde vinha; a
    Amanda tinha saído da planilha e continuava somando 10. Agora ela roda em TODOS os
    meses do arquivo, não só no corrente: erro de digitação na meta de novembro falha em
    outubro, quando ainda dá para corrigir sem ninguém ver número errado na tela. */
function conferirBloco(mes, bloco) {
  if (!bloco || typeof bloco !== 'object') throw new Error('data/metas.json: o mês ' + mes + ' não tem bloco');
  if (!bloco.metas || !Object.keys(bloco.metas).length) throw new Error('data/metas.json: o mês ' + mes + ' não tem ninguém em metas');
  const soma = Object.values(bloco.metas).reduce(function (s, m) {
    return { clientes: s.clientes + (m.clientes || 0), mrr: s.mrr + (m.mrr || 0), receita: s.receita + (m.receita || 0) };
  }, { clientes: 0, mrr: 0, receita: 0 });
  ['clientes', 'mrr', 'receita'].forEach(function (k) {
    const esperado = (bloco.time || {})[k];
    const gordura = Number(((bloco.time || {}).gordura || {})[k]) || 0;
    if (esperado != null && soma[k] + gordura !== esperado) {
      throw new Error('data/metas.json (' + mes + '): a soma de ' + k + ' dá ' + soma[k]
        + (gordura ? ' + ' + gordura + ' de gordura' : '') + ' e o total do time diz ' + esperado);
    }
  });
  return soma;
}

/** Lê o arquivo e confere TODOS os meses. Devolve o bruto; quem escolhe o mês é metasDoMes. */
function lerMetas(arquivo) {
  const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const porMes = bruto.porMes;
  if (!porMes || !Object.keys(porMes).length) {
    throw new Error('data/metas.json: sem `porMes` — o formato de um mês só saiu em 28/10/26');
  }
  Object.keys(porMes).forEach(function (mes) {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('data/metas.json: "' + mes + '" não é um mês no formato AAAA-MM');
    conferirBloco(mes, porMes[mes]);
  });
  return bruto;
}

/*  Escolhe o bloco do mês pedido. Mês sem bloco é ERRO ALTO, não o bloco mais recente:
    meta errada em tela é pior que robô que não roda — se dezembro chegar sem meta
    declarada, o certo é o robô gritar, não herdar novembro em silêncio. */
function metasDoMes(bruto, mes) {
  const bloco = (bruto.porMes || {})[mes];
  if (!bloco) {
    throw new Error('data/metas.json: não existe meta para ' + mes
      + ' — declarados: ' + Object.keys(bruto.porMes || {}).sort().join(', '));
  }
  return bloco;
}

/*  O PRÓXIMO MÊS DECLARADO, PARA A TELA PODER MOSTRÁ-LO (28/10/26).
    Em 28/10 o Julyan olhou o Cockpit, viu 52 e disse que a meta de 44 "não foi atualizada".
    Ela estava: o arquivo já tinha novembro com 44 e o relógio é que ainda não tinha virado.
    O sistema estava certo e a tela não tinha como provar isso — e meta é o número que o time
    inteiro cobra, então "está lá, confia" não serve.

    Devolve o PRIMEIRO mês declarado depois do atual, com o dia em que ele começa a valer.
    Null quando não há nenhum — e aí a tela não promete mês que ninguém declarou. */
function proximoMesDeclarado(bruto, mes) {
  const seguintes = Object.keys((bruto && bruto.porMes) || {}).filter(function (m) { return m > mes; }).sort();
  if (!seguintes.length) return null;
  const alvo = seguintes[0];
  const b = bruto.porMes[alvo];
  return {
    mes: alvo,
    comecaEm: alvo + '-01',
    clientes: (b.time && b.time.clientes) || 0,
    mrr: (b.time && b.time.mrr) || 0,
    receita: (b.time && b.time.receita) || 0,
    pessoas: Object.keys(b.metas || {}).length,
  };
}

module.exports = { mesBrasiliaDe, conferirBloco, lerMetas, metasDoMes, proximoMesDeclarado };
