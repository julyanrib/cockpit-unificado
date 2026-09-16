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
const { buscarCnpjNaReceita, PROVEDORES } = require('../lib/cnpj-lookup');

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

/* ══ UM DUBLÊ POR PROVEDOR, com a forma REAL de cada um ═════════════════════════════
   Colhidas ao vivo em 16/09/26. A primeira versão desta suíte servia a forma da BrasilAPI
   para os TRÊS provedores e media o normalizador errado — cada serviço tem o endereço num
   lugar diferente, e é exatamente aí que este recurso quebra em silêncio.

   Os dois dublês trazem e-mail e telefone de propósito: é assim que a checagem de "o lib
   NÃO devolve contato" tem o que recusar. Dublê sem o dado proibido não prova nada. */
const FORMA_CNPJWS = {
  razao_social: 'RESTAURANTE DO ZE LTDA',
  estabelecimento: {
    nome_fantasia: 'Zé Grill',
    /* CEP PONTUADO DE PROPÓSITO. Ao vivo ele veio limpo ('29100250'), e com ele a
       checagem de limpeza passava com ou sem a limpeza — guarda cega. O risco real é o
       provedor mudar o formato, então o dublê usa a forma que quebraria. */
    cep: '29100-250', numero: '680',
    tipo_logradouro: 'RUA', logradouro: 'DOM JORGE DE MENEZES',
    bairro: 'CENTRO DE VILA VELHA',
    cidade: { nome: 'Vila Velha' }, estado: { sigla: 'ES' },
    situacao_cadastral: 'Ativa',
    email: 'contador@escritorio.com.br', telefone1: '2733334444'
  }
};
/* a forma "plana", que a minhareceita e a BrasilAPI compartilham — com `numero: "SN"`,
   que é resposta real da Receita para imóvel sem número */
const FORMA_PLANA = {
  razao_social: 'BANCO DO BRASIL SA', nome_fantasia: 'DIRECAO GERAL',
  cep: '70040-912', logradouro: 'SAUN QUADRA 5 BLOCO B TORRE I, II, III',
  descricao_tipo_de_logradouro: 'SAUN',
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
/* recorta UM provedor da cadeia, para medir o normalizador dele com a forma dele */
const soO = function (nome) {
  return PROVEDORES.filter(function (p) { return p.nome === nome; });
};

/* ── 1. O CORTE DE CONTATO ESTÁ NO LIB, e não só na tela ─────────────────────────── */
/* No lib, e não na tela, de propósito: assim NENHUMA outra tela consegue pedir o
   telefone da Receita por engano — o dado não sai da porta. */
(async function () {
  /* CADA PROVEDOR COM A FORMA DELE. É a checagem que a primeira versão desta suíte não
     fazia: ela servia a forma plana para os três e media o normalizador errado. */
  const porProvedor = [
    ['cnpj.ws', FORMA_CNPJWS, { razao: 'RESTAURANTE DO ZE LTDA', fantasia: 'Zé Grill',
      cep: '29100250', numero: '680', via: 'RUA DOM JORGE DE MENEZES',
      municipio: 'Vila Velha', uf: 'ES', situacao: 'Ativa' }],
    ['minhareceita.org', FORMA_PLANA, { razao: 'BANCO DO BRASIL SA', fantasia: 'DIRECAO GERAL',
      cep: '70040912', numero: 'SN', via: 'SAUN SAUN QUADRA 5 BLOCO B TORRE I, II, III',
      municipio: 'BRASILIA', uf: 'DF', situacao: 'ATIVA' }],
    ['brasilapi', FORMA_PLANA, { razao: 'BANCO DO BRASIL SA', fantasia: 'DIRECAO GERAL',
      cep: '70040912', numero: 'SN', via: 'SAUN SAUN QUADRA 5 BLOCO B TORRE I, II, III',
      municipio: 'BRASILIA', uf: 'DF', situacao: 'ATIVA' }]
  ];
  for (const [nome, forma, esperado] of porProvedor) {
    const r = await buscarCnpjNaReceita('00000000000191',
      { fetch: fetchFake(forma), provedores: soO(nome) });
    const d = r.dados || {};
    conferir(nome + ' devolve a razão social',
      d.razaoSocial === esperado.razao,
      'sem isto as checagens seguintes medem um objeto vazio e passam sem medir nada');
    conferir(nome + ' devolve o CEP só com dígitos',
      d.cep === esperado.cep,
      'o HubSpot recusa a passagem inteira com CEP pontuado — ver PROPS_SO_DIGITOS');
    conferir(nome + ' devolve o número',
      d.numero === esperado.numero,
      'número é metade do que este recurso promete preencher');
    conferir(nome + ' devolve a situação cadastral',
      d.situacao === esperado.situacao && d.ativa === true,
      'CNPJ baixado ou suspenso tem de aparecer ANTES de gerar cobrança, não depois');
    conferir(nome + ' diz quem respondeu',
      d.fonte === nome,
      'sem a fonte, ninguém sabe qual provedor atendeu nem qual precisa de atenção');
    const chaves = Object.keys(d);
    conferir(nome + ' NÃO devolve e-mail',
      chaves.every(function (k) { return !/mail/i.test(k); }),
      'na Receita o e-mail é muitas vezes do contador, e esta etapa gera cobrança');
    conferir(nome + ' NÃO devolve telefone nem celular',
      chaves.every(function (k) { return !/(telefone|celular|phone|ddd)/i.test(k); }),
      'link de pagamento para o celular do contador é o defeito que ninguém percebe');
  }

  /* ── 2. A SITUAÇÃO NÃO-ATIVA ACENDE ───────────────────────────────────────────── */
  const baixada = await buscarCnpjNaReceita('00000000000191', {
    fetch: fetchFake(Object.assign({}, FORMA_PLANA,
      { descricao_situacao_cadastral: 'BAIXADA' })),
    provedores: soO('brasilapi')
  });
  /*  E NAO  DIRETO: com o defeito injetado a consulta devolve erro, e ler
      LANCA — a suite morria com TypeError em vez de reprovar, e harness que
     ve a suite explodir nao consegue dizer qual checagem pegou o que. Guarda que nao
     consegue medir tem de REPROVAR, nunca quebrar. */
  conferir('CNPJ baixado não passa por ativo',
    (baixada.dados || {}).ativa === false && (baixada.dados || {}).situacao === 'BAIXADA',
    'é o aviso que impede fechar contrato com empresa que a Receita já deu baixa');

  /* ── 2b. A CADEIA: UM RECUSA, O SEGUINTE ATENDE ───────────────────────────────── */
  /* É O DEFEITO QUE O JULYAN VIU EM PRODUÇÃO, em 16/09: a BrasilAPI devolveu 403 do IP da
     Vercel — o MESMO CNPJ responde 200 fora dela. Com um provedor só, isso é um recurso
     morto; com a cadeia, é um segundo de atraso. */
  let pedidos = 0;
  const fetch403NoPrimeiro = async function (url) {
    pedidos++;
    if (pedidos === 1) return { ok: false, status: 403, json: async function () { return {}; } };
    return { ok: true, status: 200, json: async function () { return FORMA_PLANA; } };
  };
  const cadeia = await buscarCnpjNaReceita('00000000000191', { fetch: fetch403NoPrimeiro });
  conferir('403 no primeiro provedor não derruba a consulta',
    !!(cadeia.dados && cadeia.dados.razaoSocial === 'BANCO DO BRASIL SA'),
    'foi exatamente isto em produção: um provedor recusou e o recurso inteiro morreu');
  conferir('a tentativa que falhou fica registrada',
    Array.isArray(cadeia.tentativas) && cadeia.tentativas.length === 1
      && /403/.test(cadeia.tentativas[0]),
    '"a consulta falhou" sem dizer quem recusou é indistinguível de "a chamada está errada"');
  conferir('há mais de um provedor na cadeia',
    PROVEDORES.length >= 3,
    'com um só, o 403 de um IP compartilhado derruba o recurso — foi o que aconteceu');

  /* 404 é resposta, não falha: não adianta perguntar o mesmo aos outros */
  let pedidos404 = 0;
  const fetch404 = async function () {
    pedidos404++;
    return { ok: false, status: 404, json: async function () { return {}; } };
  };
  const inexistente = await buscarCnpjNaReceita('00000000000191', { fetch: fetch404 });
  conferir('404 para a cadeia na primeira resposta',
    pedidos404 === 1 && /não tem esse CNPJ/.test(inexistente.erro || ''),
    'a Receita não ter o número é resposta; perguntar aos outros gasta segundos para ouvir o mesmo');

  /* ── 3. AS FALHAS DEVOLVEM MENSAGEM, E NUNCA LANÇAM ───────────────────────────── */
  const casos = [
    ['CPF de 11 dígitos', '12345678901', fetchFake(FORMA_PLANA)],
    ['CNPJ com 13 dígitos', '0000000000019', fetchFake(FORMA_PLANA)],
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
