/* ══════════════════════════════════════════════════════════════════════════════════════
   A LUPA DO CNPJ EM AG. PAGAMENTO — o que quebra em silêncio (16/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "qdo o executivo preencher o campo cnpj em aguardando pagamento, ja puxar os
   dados de endereço, agilizando o processo".

   ESTA ETAPA É A QUE GERA COBRANÇA. `amount` e `mrr` são o que o RPA do Asaas lê, e esta
   base já parou o negócio uma vez mexendo neles — há um aviso de 15/08 no próprio
   template dizendo "automação real de RPA/ASAAS vive lá, nunca mexer". Então metade
   destas checagens não é sobre o que o recurso faz: é sobre o que ele NÃO pode tocar.

   ══ O QUE NÃO PODE ACONTECER, NUNCA ════════════════════════════════════════════════
     1. PREENCHER E-MAIL OU CELULAR. Na Receita esses dois campos são, com frequência, do
        CONTADOR — não do dono. Um link de pagamento do Asaas indo para o celular do
        contador é o defeito que só aparece quando o cliente diz que não recebeu.
     2. TOCAR `amount`, `mrr` OU `dealname`. Os dois primeiros viram cobrança; o terceiro
        é o nome do negócio no HubSpot, já preenchido desde o lead.
     3. SOBRESCREVER O QUE O EXECUTIVO DIGITOU. O endereço de entrega costuma diferir do
        cadastro da Receita, e quem está com o cliente na frente sabe mais que o cadastro.
     4. TRAVAR O FORMULÁRIO quando a consulta falhar. Digitar tudo à mão continua sendo
        um caminho inteiro — mesma regra da praça de novidades, onde a Casa dos Dados
        cair não derruba a rota do dia.

   A REDE NÃO É TOCADA AQUI: o `fetch` entra por parâmetro e estas checagens usam dublês.
   Suíte que depende da BrasilAPI de pé reprova por motivo que não é defeito nosso.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const rota = fs.readFileSync(path.join(raiz, 'api', 'novidades-mercado.js'), 'utf8');
const { buscarCnpjNaReceita, normalizar } = require('../lib/cnpj-lookup');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
function corpoDe(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let d = 0, j = i, viu = false;
  while (j < tpl.length) {
    const c = tpl[j];
    if (c === '{') { d++; viu = true; }
    else if (c === '}') { d--; if (viu && d === 0) return tpl.slice(i, j + 1); }
    j++;
  }
  return '';
}
function semProsa(txt) {
  return txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

/* dublê com a forma REAL da resposta, copiada da consulta ao vivo de 16/09/26 ao CNPJ
   00000000000191 — inclusive o `numero: "SN"`, que é o caso que quebraria um campo
   numérico e não quebra um de texto */
const RESPOSTA_REAL = {
  razao_social: 'BANCO DO BRASIL SA', nome_fantasia: 'DIRECAO GERAL',
  /* CEP PONTUADO DE PROPOSITO. A consulta ao vivo de 16/09 devolveu '70040912' limpo,
     e com ele a checagem de limpeza passava com ou sem a limpeza — guarda cega. O risco
     real e a Receita mudar o formato, entao o duble usa a forma que quebraria. */
  cep: '70040-912', logradouro: 'SAUN QUADRA 5 BLOCO B TORRE I, II, III',
  numero: 'SN', bairro: 'ASA NORTE', municipio: 'BRASILIA', uf: 'DF',
  descricao_situacao_cadastral: 'ATIVA',
  email: 'contador@escritorio.com.br', ddd_telefone_1: '6134939002'
};
const fetchFake = function (corpo, status) {
  return async function () {
    return { ok: (status || 200) < 400, status: status || 200,
      json: async function () { return corpo; } };
  };
};

/* ── 1. O CORTE DE CONTATO ESTÁ NO LIB, e não só na tela ─────────────────────────── */
/* No lib, e não na tela, de propósito: assim NENHUMA outra tela consegue pedir o
   telefone da Receita por engano — o dado não sai da porta. */
(async function () {
  const r = await buscarCnpjNaReceita('00000000000191', { fetch: fetchFake(RESPOSTA_REAL) });
  conferir('a consulta devolve os dados da empresa',
    !!(r.dados && r.dados.razaoSocial === 'BANCO DO BRASIL SA'),
    'sem isto o resto das checagens mede um objeto vazio e passa sem medir nada');
  const chaves = Object.keys(r.dados || {});
  conferir('o lib NÃO devolve e-mail',
    chaves.every(function (k) { return !/mail/i.test(k); }),
    'na Receita o e-mail é muitas vezes do contador, e esta etapa gera cobrança');
  conferir('o lib NÃO devolve telefone nem celular',
    chaves.every(function (k) { return !/(telefone|celular|phone|ddd)/i.test(k); }),
    'link de pagamento para o celular do contador é o defeito que ninguém percebe');
  conferir('o CEP sai só com dígitos',
    r.dados.cep === '70040912',
    'o HubSpot recusa a passagem inteira com CEP pontuado — ver PROPS_SO_DIGITOS');
  conferir('o número "SN" sobrevive',
    r.dados.numero === 'SN',
    'imóvel sem número é caso real da Receita; virar vazio faria o executivo achar que não veio');
  conferir('a situação cadastral vem junto',
    r.dados.situacao === 'ATIVA' && r.dados.ativa === true,
    'CNPJ baixado ou suspenso tem de aparecer ANTES de gerar cobrança, não depois');

  /* ── 2. A SITUAÇÃO NÃO-ATIVA ACENDE ───────────────────────────────────────────── */
  const baixada = await buscarCnpjNaReceita('00000000000191', {
    fetch: fetchFake(Object.assign({}, RESPOSTA_REAL,
      { descricao_situacao_cadastral: 'BAIXADA' }))
  });
  conferir('CNPJ baixado não passa por ativo',
    baixada.dados.ativa === false && baixada.dados.situacao === 'BAIXADA',
    'é o aviso que impede fechar contrato com empresa que a Receita já deu baixa');

  /* ── 3. AS FALHAS DEVOLVEM MENSAGEM, E NUNCA LANÇAM ───────────────────────────── */
  const casos = [
    ['CPF de 11 dígitos', '12345678901', fetchFake(RESPOSTA_REAL)],
    ['CNPJ com 13 dígitos', '0000000000019', fetchFake(RESPOSTA_REAL)],
    ['404 da Receita', '00000000000191', fetchFake({}, 404)],
    ['500 da Receita', '00000000000191', fetchFake({}, 500)],
    ['200 sem razão social', '00000000000191', fetchFake({ message: 'CNPJ inválido' })],
    ['resposta que não é objeto', '00000000000191', fetchFake('vazio')],
    ['rede caiu', '00000000000191', async function () { throw new Error('ECONNRESET'); }]
  ];
  for (const caso of casos) {
    let r2 = null, lancou = false;
    try { r2 = await buscarCnpjNaReceita(caso[1], { fetch: caso[2] }); }
    catch (e) { lancou = true; }
    conferir(caso[0] + ' devolve erro em texto, sem lançar',
      !lancou && !!(r2 && r2.erro) && !r2.dados,
      'exceção aqui sobe para o handler do clique e o formulário fica mudo');
  }

  /* ── 4. A TELA: A LUPA EXISTE, É LIGADA, E NÃO TOCA O QUE NÃO PODE ────────────── */
  conferir('a lupa só aparece no campo de CNPJ',
    corpoDe('campoPassagemHTML').indexOf("campo.prop === 'cnpj_cpf'") > -1,
    'em todo campo ela seria um botão sem função em quinze lugares');
  conferir('a lupa tem nome acessível',
    tpl.indexOf('aria-label="Buscar endereço na Receita"') > -1,
    'ícone sozinho não se explica, e este é o único botão de ícone do formulário');
  conferir('o clique na lupa tem leitor',
    tpl.indexOf("closest('[data-cnpjbuscar]')") > -1,
    'atributo desenhado sem leitor é clique morto — 28 de uma vez, nesta base');
  conferir('o clique na lupa não fecha o drawer',
    tpl.indexOf("ev.stopPropagation();\n  buscarCnpjNaReceitaDoCampo") > -1
      || semProsa(tpl).indexOf('ev.stopPropagation();') > -1,
    'o botão vive dentro do drawer de passagem, que tem os próprios ouvintes de clique');

  const busca = semProsa(corpoDe('buscarCnpjNaReceitaDoCampo'));
  conferir('a busca preenche CEP e número',
    busca.indexOf("preencher('cep'") > -1 && busca.indexOf("preencher('numero'") > -1,
    'são os dois campos de endereço que a etapa Ag. Pagamento tem');
  ['email', 'celular', 'amount', 'mrr', 'dealname'].forEach(function (proibido) {
    conferir('a busca NÃO escreve em ' + proibido,
      busca.indexOf("preencher('" + proibido + "'") < 0
        && busca.indexOf("peCampo_' + '" + proibido) < 0,
      proibido === 'amount' || proibido === 'mrr'
        ? 'é o que o RPA do Asaas lê — há um aviso no template dizendo nunca mexer'
        : 'instrução explícita do Julyan, e na Receita esse dado é muitas vezes do contador');
  });
  conferir('a busca não sobrescreve o que já está preenchido',
    busca.indexOf("if (String(alvo.value || '').trim()) { mantidos.push(rotulo); return; }") > -1,
    'o endereço de entrega difere do cadastro, e quem está com o cliente sabe mais');
  conferir('o campo preenchido dispara input, para validar e mascarar',
    busca.indexOf("dispatchEvent(new Event('input'") > -1,
    'atribuir `value` sem disparar deixa o campo preenchido e NÃO validado pela tela');
  conferir('o dígito verificador é conferido antes da rede',
    busca.indexOf('cnpjEhValido(digitos)') > -1,
    'o RPA do Asaas recusa CNPJ inválido horas depois; conferir aqui dá o aviso na hora');
  conferir('duas buscas simultâneas viram uma',
    busca.indexOf('if (peLupaEmVoo) return peLupaEmVoo;') > -1,
    '"trava depois do await não é trava": booleano no fim deixa passar os dois cliques');
  conferir('o botão desabilita durante a busca',
    busca.indexOf('botao.disabled = true') > -1 && busca.indexOf('botao.disabled = false') > -1,
    'sem isso o executivo clica três vezes achando que não pegou');
  conferir('o botão volta a funcionar mesmo se a busca explodir',
    busca.indexOf('} finally {') > -1,
    'reabilitar só no caminho felizde deixa a lupa morta depois do primeiro erro');
  conferir('a falha aparece na tela, e não só no console',
    busca.indexOf("dizer('A consulta falhou") > -1,
    'no console ninguém lê: o executivo tem de saber que precisa digitar à mão');
  conferir('situação não-ativa também avisa por toast',
    busca.indexOf('if (!r.ativa') > -1 && busca.indexOf('mostrarToast') > -1,
    'a linha embaixo do campo é discreta demais para "esse CNPJ está BAIXADO"');

  /* ── 5. A ROTA: SESSÃO, E SEM GASTAR CRÉDITO PAGO ─────────────────────────────── */
  /* SEM PROSA: a primeira versao usava  no arquivo cru, e
     o meu proprio comentario acima do ramo cita o nome. Sabotei o if do ramo para
     "if (false)" e a checagem continuou verde, achando a palavra no comentario. */
  const rotaSemProsa = semProsa(rota);
  /* O `if` INTEIRO, e não o nome da variável: ela também aparece DENTRO do ramo
     (`buscarCnpjNaReceita(req.body.cnpjReceita)`), então trocar o `if` por `if (false)`
     deixava a checagem verde achando a ocorrência de baixo. Terceira guarda cega desta
     suíte, e as três só apareceram na sabotagem. */
  const portaoDaReceita = rotaSemProsa.indexOf('if (req.body && req.body.cnpjReceita)');
  conferir('a rota da Receita fica DEPOIS da validação de sessão',
    portaoDaReceita > -1
      && portaoDaReceita > rotaSemProsa.indexOf('Sessão sem e-mail associado'),
    'rota aberta que chama terceiro é rota que alguém usa como proxy');
  conferir('a consulta de endereço não exige o token da Casa dos Dados',
    rota.indexOf('const exigirCasa') > -1
      && rota.indexOf('cnpjReceita') < rota.indexOf('const faltaCasa = exigirCasa();'),
    'a trava na porta devolvia 500 para uma consulta que não usa aquela credencial');
  conferir('os dois ramos pagos continuam exigindo o token',
    (rota.match(/exigirCasa\(\)/g) || []).length === 2,
    'sem a trava eles chamam a Casa dos Dados com token nulo e o 401 vira "nada encontrado"');
  conferir('nenhuma função serverless nova foi criada',
    fs.readdirSync(path.join(raiz, 'api')).filter(function (f) { return f.endsWith('.js'); }).length <= 12,
    'o Vercel Hobby aceita 12: a 13ª não quebra em teste, quebra no deploy');

  if (falhas.length) {
    console.log('FALHAS (' + falhas.length + '):');
    falhas.forEach(function (f) { console.log(f); });
    process.exit(1);
  }
  console.log('cnpj lookup: ' + ok + ' checagens ok — endereço sim, contato nunca, e nada '
    + 'do que o RPA do Asaas lê é tocado.');
}());
