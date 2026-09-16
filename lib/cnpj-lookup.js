// lib/cnpj-lookup.js
// Consulta um CNPJ na Receita e devolve só o que o formulário de Ag. Pagamento precisa
// para se preencher sozinho.
//
// ══ POR QUE UMA CADEIA DE PROVEDORES, E NÃO UM (16/09/26) ═══════════════════════════
// A primeira versão chamava só a BrasilAPI. Em produção, na primeira busca de verdade,
// o Julyan levou:
//
//     "A consulta à Receita respondeu 403 — preencha à mão e siga."
//
// MEDIDO: o MESMO CNPJ responde 200 fora da Vercel. Ou seja, o 403 não é do número nem
// da nossa chamada — é do IP. A BrasilAPI limita IP de datacenter, e o IP de saída da
// Vercel é compartilhado entre muitos clientes, então ele já chega no teto sem a gente
// ter feito nada. Repetir a chamada não resolve: o que resolve é ter para onde ir.
//
// A ORDEM NÃO É ALFABÉTICA — é por COMPLETUDE, e isso foi medido no CNPJ dele:
//
//     publica.cnpj.ws    cep 29100250 · numero "680" · logradouro "RUA DOM JORGE..."
//     minhareceita.org   cep 29100250 · numero ""    · logradouro ""
//     brasilapi          cep 29100250 · numero ""    · logradouro ""   (e 403 da Vercel)
//
// Duas das três devolvem o CEP e deixam o NÚMERO vazio — e número é metade do que este
// recurso promete preencher. Por isso a cnpj.ws vem primeiro: quando ela responde, o
// executivo não digita nada.
//
// ══ O QUE ESTA FUNÇÃO NÃO DEVOLVE, DE PROPÓSITO ════════════════════════════════════
// E-MAIL E TELEFONE FICAM DE FORA mesmo quando o provedor os traz — e os três trazem. Na
// Receita esses dois campos são, com frequência, do CONTADOR, não do dono do
// restaurante. Preencher o celular do contador num formulário que gera cobrança no Asaas
// manda o link de pagamento para a pessoa errada, e ninguém percebe até o cliente
// reclamar que não recebeu. O corte fica AQUI, e não na tela, para nenhuma outra tela
// conseguir pedir diferente.
//
// SITUAÇÃO CADASTRAL VEM JUNTO: o formulário desta etapa existe para gerar cobrança, e
// CNPJ BAIXADO ou SUSPENSO é coisa que o executivo tem de ver ANTES de fechar.
//
// Nunca lança. Falha de rede, CNPJ inexistente, provedor fora do ar: devolve
// `{ erro: '...' }` e quem chama decide o que dizer. O formulário nunca trava — digitar
// tudo à mão continua sendo um caminho inteiro.

function digitosDoCnpj(bruto) {
  return String(bruto == null ? '' : bruto).replace(/\D/g, '');
}

function texto(v) {
  const s = String(v == null ? '' : v).trim();
  return s ? s : null;
}

function soDigitos(v) {
  return texto(String(v == null ? '' : v).replace(/\D/g, ''));
}

/* A FORMA ÚNICA que a tela consome, seja qual for o provedor. Cada normalizador abaixo
   devolve exatamente isto — e é isto que garante que trocar a ordem, tirar ou acrescentar
   provedor não muda uma linha da tela. */
function montar(campos) {
  const situacao = texto(campos.situacao);
  return {
    cnpj: campos.cnpj || null,
    razaoSocial: texto(campos.razaoSocial),
    nomeFantasia: texto(campos.nomeFantasia),
    /* o CEP vai só com dígitos porque é assim que o HubSpot aceita — ele recusa a
       passagem INTEIRA quando chega pontuado (ver PROPS_SO_DIGITOS no template) */
    cep: soDigitos(campos.cep),
    /* "SN" (sem número) é resposta real da Receita, e o campo do formulário é texto
       justamente por isso: virar vazio faria o executivo achar que a consulta não veio */
    numero: texto(campos.numero),
    logradouro: texto([texto(campos.tipoLogradouro), texto(campos.logradouro)]
      .filter(Boolean).join(' ')),
    bairro: texto(campos.bairro),
    municipio: texto(campos.municipio),
    uf: texto(campos.uf),
    situacao: situacao,
    /* sem caixa: a Receita escreve "ATIVA" num provedor e "Ativa" noutro, e o aviso que
       depende disto não pode falhar por causa de maiúscula */
    ativa: !!situacao && situacao.toUpperCase().indexOf('ATIVA') === 0,
    fonte: campos.fonte || null
  };
}

/* ══ OS PROVEDORES ══════════════════════════════════════════════════════════════════
   Todos públicos, todos sem chave, todos com a mesma origem de dado (a base da Receita).
   O que muda entre eles é quanto do endereço sobrevive ao caminho — e qual deles está
   disposto a atender um IP de datacenter no momento em que o executivo clica. */
const PROVEDORES = [
  {
    /* PRIMEIRO PORQUE É O MAIS COMPLETO: é o único dos três que trouxe o NÚMERO no CNPJ
       que o Julyan testou. O endereço fica em `estabelecimento`, e cidade/estado são
       objetos aninhados. */
    nome: 'cnpj.ws',
    url: function (c) { return 'https://publica.cnpj.ws/cnpj/' + c; },
    normalizar: function (j, c) {
      const e = (j && j.estabelecimento) || {};
      return montar({
        cnpj: c, fonte: 'cnpj.ws',
        razaoSocial: j && j.razao_social,
        nomeFantasia: e.nome_fantasia,
        cep: e.cep, numero: e.numero,
        tipoLogradouro: e.tipo_logradouro, logradouro: e.logradouro,
        bairro: e.bairro,
        municipio: e.cidade && e.cidade.nome,
        uf: e.estado && e.estado.sigla,
        situacao: e.situacao_cadastral
      });
    }
  },
  {
    /* MESMO FORMATO DA BRASILAPI (mesma base por trás), mas é um serviço pensado para uso
       programático e não recusou o nosso IP nos testes. */
    nome: 'minhareceita.org',
    url: function (c) { return 'https://minhareceita.org/' + c; },
    normalizar: function (j, c) { return planoDaReceita(j, c, 'minhareceita.org'); }
  },
  {
    /* ÚLTIMO PORQUE FOI ELE QUE DEU 403 DA VERCEL. Continua na fila: 403 por IP vai e
       volta, e no dia em que os dois de cima estiverem fora ele pode ser quem atende. */
    nome: 'brasilapi',
    url: function (c) { return 'https://brasilapi.com.br/api/cnpj/v1/' + c; },
    normalizar: function (j, c) { return planoDaReceita(j, c, 'brasilapi'); }
  }
];

/* o formato "plano" da Receita, que a BrasilAPI e a minhareceita compartilham */
function planoDaReceita(j, c, fonte) {
  return montar({
    cnpj: c, fonte: fonte,
    razaoSocial: j && j.razao_social,
    nomeFantasia: j && j.nome_fantasia,
    cep: j && j.cep, numero: j && j.numero,
    tipoLogradouro: j && j.descricao_tipo_de_logradouro,
    logradouro: j && j.logradouro,
    bairro: j && j.bairro,
    municipio: j && j.municipio,
    uf: j && j.uf,
    situacao: j && j.descricao_situacao_cadastral
  });
}

/* PRAZO POR PROVEDOR, e não só para o conjunto: a função da Vercel morre em 10s, e um
   provedor pendurado levaria os outros dois junto — o executivo veria "a consulta
   falhou" quando havia dois caminhos livres que ninguém tentou. */
const PRAZO_MS = 3500;

async function tentar(prov, cnpjLimpo, f) {
  const ac = (typeof AbortController === 'function') ? new AbortController() : null;
  const relogio = ac ? setTimeout(function () { ac.abort(); }, PRAZO_MS) : null;
  try {
    const r = await f(prov.url(cnpjLimpo), {
      headers: { Accept: 'application/json' },
      signal: ac ? ac.signal : undefined
    });
    if (r.status === 404) return { naoExiste: true, fonte: prov.nome };
    if (!r.ok) return { recusou: r.status, fonte: prov.nome };
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || typeof j !== 'object') return { recusou: 'formato', fonte: prov.nome };
    const dados = prov.normalizar(j, cnpjLimpo);
    /* SEM RAZÃO SOCIAL NÃO HOUVE CONSULTA. Estes serviços devolvem 200 com `{message}`
       em alguns erros, e sem esta trava o formulário se preencheria com nulos e o
       executivo acharia que a Receita não tinha endereço. */
    if (!dados.razaoSocial) return { recusou: 'sem razão social', fonte: prov.nome };
    return { dados: dados };
  } catch (e) {
    return { recusou: (e && e.name === 'AbortError') ? 'tempo' : 'rede', fonte: prov.nome };
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

async function buscarCnpjNaReceita(cnpjBruto, opcoes) {
  const op = opcoes || {};
  const f = op.fetch || (typeof fetch === 'function' ? fetch : null);
  const cnpjLimpo = digitosDoCnpj(cnpjBruto);

  if (cnpjLimpo.length === 11) {
    return { erro: 'Isso é um CPF — a consulta de endereço na Receita só existe para CNPJ.' };
  }
  if (cnpjLimpo.length !== 14) {
    return { erro: 'CNPJ precisa ter 14 dígitos para a consulta — você digitou ' + cnpjLimpo.length + '.' };
  }
  if (!f) return { erro: 'Sem fetch disponível neste ambiente.' };

  const lista = op.provedores || PROVEDORES;
  const tentativas = [];
  for (const prov of lista) {
    const r = await tentar(prov, cnpjLimpo, f);
    if (r.dados) return { dados: r.dados, tentativas: tentativas };
    /* 404 É RESPOSTA, E NÃO FALHA: o provedor consultou e a Receita não tem o número.
       Perguntar o mesmo aos outros dois gastaria dois segundos para ouvir o mesmo. */
    if (r.naoExiste) {
      return { erro: 'A Receita não tem esse CNPJ. Confira o número.', tentativas: tentativas };
    }
    tentativas.push(prov.nome + ': ' + r.recusou);
  }
  /* A LISTA DE QUEM RECUSOU VAI JUNTO. Sem ela, "a consulta falhou" é indistinguível de
     "a nossa chamada está errada" — e foi justamente isso que custou tempo no 403. */
  return {
    erro: 'Nenhuma consulta à Receita respondeu agora — preencha à mão e siga.',
    tentativas: tentativas
  };
}

module.exports = {
  buscarCnpjNaReceita, montar, planoDaReceita, digitosDoCnpj, PROVEDORES, PRAZO_MS
};
