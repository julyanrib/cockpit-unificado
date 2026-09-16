// lib/cnpj-lookup.js
// Consulta um CNPJ na Receita (via BrasilAPI) e devolve só o que o formulário de
// Ag. Pagamento precisa para se preencher sozinho.
//
// ══ POR QUE BRASILAPI E NÃO A CASA DOS DADOS, QUE JÁ ESTÁ AQUI (16/09/26) ═══════════
// A Casa dos Dados já consulta CNPJ nesta base (api/novidades-mercado.js), e a tentação
// era reusá-la. Duas razões para não:
//
//   1. ELA COBRA POR EMPRESA. Cada consulta é 1 crédito, e o endereço da Receita é dado
//      PÚBLICO — gastar crédito pago para preencher CEP seria queimar a cota que existe
//      para achar telefone e sócio, que é o que ela sabe fazer e a BrasilAPI não.
//   2. O contrato dela é instável. `lib/contato-cnpj.js` existe inteiro porque os nomes
//      de campo mudavam, e ele extrai POR FORMA em vez de por nome. A BrasilAPI devolve
//      o registro da Receita com nomes estáveis e documentados.
//
// As duas continuam: esta para endereço (grátis, pública), aquela para contato (paga,
// sob demanda). Cada uma no que é boa.
//
// ══ O QUE ESTA FUNÇÃO NÃO DEVOLVE, DE PROPÓSITO ════════════════════════════════════
// E-MAIL E TELEFONE FICAM DE FORA mesmo quando a Receita os traz. Na Receita esses dois
// campos são, com frequência, do CONTADOR — não do dono do restaurante. Preencher o
// celular do contador num formulário que gera cobrança no Asaas manda o link de
// pagamento para a pessoa errada, e ninguém percebe até o cliente reclamar que não
// recebeu. Os dois continuam digitados à mão, obrigatórios, sem prefill.
//
// SITUAÇÃO CADASTRAL VEM JUNTO, e não estava no pedido: o formulário desta etapa existe
// para gerar cobrança, e CNPJ BAIXADO ou SUSPENSO é coisa que o executivo tem de ver
// ANTES de fechar, não depois. Custa um campo.
//
// Nunca lança: falha de rede, CNPJ inexistente ou resposta estranha devolvem
// `{ erro: '...' }` e quem chama decide o que dizer. O formulário nunca trava — digitar
// tudo à mão continua sendo um caminho inteiro.

const URL_BASE = 'https://brasilapi.com.br/api/cnpj/v1/';

/* CNPJ tem 14 dígitos. O campo do formulário se chama `cnpj_cpf` e aceita os dois
   (11 = CPF), mas a consulta à Receita só existe para pessoa jurídica — com 11 dígitos
   a resposta é "não dá para buscar", e não um erro. */
function digitosDoCnpj(bruto) {
  return String(bruto == null ? '' : bruto).replace(/\D/g, '');
}

function texto(v) {
  const s = String(v == null ? '' : v).trim();
  return s ? s : null;
}

/* O número da Receita vem como "SN" quando o imóvel não tem número — medido na consulta
   ao vivo. O campo `numero` do formulário é texto justamente por isso, então "SN" passa
   inteiro em vez de virar vazio. */
function normalizar(j, cnpjLimpo) {
  const situacao = texto(j.descricao_situacao_cadastral);
  return {
    cnpj: cnpjLimpo,
    razaoSocial: texto(j.razao_social),
    nomeFantasia: texto(j.nome_fantasia),
    /* o CEP da BrasilAPI já vem só com dígitos ("70040912"), que é exatamente a forma
       que o HubSpot aceita — ver PROPS_SO_DIGITOS no template. Limpo mesmo assim, porque
       depender do formato de terceiro é como esta base já se queimou antes. */
    cep: texto(String(j.cep == null ? '' : j.cep).replace(/\D/g, '')),
    numero: texto(j.numero),
    logradouro: texto([texto(j.descricao_tipo_de_logradouro), texto(j.logradouro)]
      .filter(Boolean).join(' ')),
    bairro: texto(j.bairro),
    municipio: texto(j.municipio),
    uf: texto(j.uf),
    situacao: situacao,
    /* comparação sem acento e sem caixa: a Receita escreve "ATIVA", mas já escreveu
       "Ativa" — e o alerta que depende disto não pode falhar por causa de maiúscula */
    ativa: !!situacao && situacao.toUpperCase().indexOf('ATIVA') === 0
  };
}

/* `buscar` recebe o fetch por parâmetro em vez de usar o global: assim o teste roda sem
   rede e sem mock global, e a rota passa o fetch dela. */
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

  let r;
  try {
    r = await f(URL_BASE + cnpjLimpo, {
      headers: { Accept: 'application/json' },
      signal: op.signal || undefined
    });
  } catch (e) {
    /* rede caiu, DNS, timeout do lado de quem chama: o formulário continua inteiro */
    return { erro: 'Não consegui falar com a Receita agora — preencha à mão e siga.' };
  }

  if (r.status === 404) {
    return { erro: 'A Receita não tem esse CNPJ. Confira o número.' };
  }
  if (!r.ok) {
    return { erro: 'A consulta à Receita respondeu ' + r.status + ' — preencha à mão e siga.' };
  }

  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  if (!j || typeof j !== 'object') {
    return { erro: 'A Receita respondeu num formato que eu não sei ler — preencha à mão.' };
  }
  /* SEM RAZÃO SOCIAL NÃO HOUVE CONSULTA. A BrasilAPI devolve 200 com `{message: ...}` em
     alguns casos de erro, e sem esta trava o formulário se preencheria com nulos e o
     executivo acharia que a Receita não tinha endereço. */
  if (!texto(j.razao_social)) {
    return { erro: texto(j.message) || 'A Receita não devolveu os dados desse CNPJ.' };
  }
  return { dados: normalizar(j, cnpjLimpo) };
}

module.exports = { buscarCnpjNaReceita, normalizar, digitosDoCnpj, URL_BASE };
