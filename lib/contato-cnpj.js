// lib/contato-cnpj.js
// Extrai telefone, e-mail, sócio e endereço da resposta de uma Consulta CNPJ.
//
// POR QUE ISTO EXISTE, e por que não é uma lista de nomes de campo (28/08/26)
//
// A rota api/novidades-mercado.js montava o contato assim:
//
//   telefone: d.telefone_1 || d.telefone || (Array.isArray(d.telefones) ? ... )
//
// e o comentário dela admitia: "não testei esta chamada ao vivo — os nomes de campo
// abaixo são os mais comuns entre APIs de CNPJ brasileiras". O banco mostrou o
// resultado disso: `socio` preenchido em 0 das 869 contas-alvo.
//
// A tentação era pegar UMA resposta real e fixar os nomes que ela mostrasse. Isso
// resolveria hoje e voltaria a quebrar na próxima mudança de contrato — e cada
// descoberta custa 1 crédito da API, porque a Consulta CNPJ cobra por empresa.
//
// Então a extração passa a ser por FORMA, não por nome:
//   · telefone  -> chave cujo nome fala de telefone, com valor que TEM cara de telefone
//                  (10 a 13 dígitos, os do Brasil com DDD);
//   · e-mail    -> chave que fala de e-mail, com "@" no valor;
//   · sócio     -> primeiro item de um array que fale de QSA/sócios/quadro, pegando
//                  dentro dele a chave que fala de nome;
//   · endereço  -> montado das partes, aceitando as variações usuais.
//
// A busca é DELIBERADAMENTE rasa: nível de topo e um nível de aninhamento. Varredura
// profunda acharia telefone em qualquer lugar (inclusive do contador, do escritório de
// registro) e trocaria um erro visível por um errado silencioso.
//
// "Sócio majoritário" com percentual não é dado público da Receita (o QSA traz nome +
// qualificação), então devolvemos o PRIMEIRO da lista como proxy — geralmente o
// administrador — e a tela rotula só "Sócio", sem prometer o que o dado não é.

const RE_TELEFONE_CHAVE = /(telefone|phone|fone|celular|whats)/i;
const RE_EMAIL_CHAVE = /(e[-_]?mail)/i;
const RE_SOCIO_ARRAY = /(qsa|socio|sócio|quadro)/i;
const RE_NOME_CHAVE = /(nome|name|razao|razão)/i;

/* Telefone brasileiro com DDD tem 10 (fixo) ou 11 (celular) dígitos; com +55 vai a 12
   ou 13. Fora dessa faixa é CNPJ, CEP, código de município ou id — todos numéricos e
   todos presentes numa resposta de CNPJ. É este teste que evita pegar o campo errado. */
function pareceTelefone(valor) {
  if (valor == null) return false;
  const digitos = String(valor).replace(/\D/g, '');
  return digitos.length >= 10 && digitos.length <= 13;
}

function pareceEmail(valor) {
  return typeof valor === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
}

// Camadas onde vale procurar: o objeto e um nível de objetos-filhos.
function camadas(d) {
  if (!d || typeof d !== 'object') return [];
  const out = [d];
  Object.keys(d).forEach(k => {
    const v = d[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(v);
  });
  return out;
}

function acharTelefones(d) {
  const achados = [];
  camadas(d).forEach(obj => {
    Object.keys(obj).forEach(k => {
      if (!RE_TELEFONE_CHAVE.test(k)) return;
      const v = obj[k];
      if (Array.isArray(v)) {
        v.forEach(item => {
          if (pareceTelefone(item)) achados.push(String(item));
          else if (item && typeof item === 'object') {
            Object.keys(item).forEach(k2 => { if (pareceTelefone(item[k2])) achados.push(String(item[k2])); });
          }
        });
      } else if (pareceTelefone(v)) {
        achados.push(String(v));
      }
    });
  });
  // Sem duplicata, preservando a ordem de descoberta (chaves "_1" antes de "_2" na
  // prática, porque Object.keys respeita a ordem de inserção do JSON).
  return achados.filter((t, i) => achados.indexOf(t) === i);
}

function acharEmail(d) {
  let achado = null;
  camadas(d).forEach(obj => {
    if (achado) return;
    Object.keys(obj).forEach(k => {
      if (achado || !RE_EMAIL_CHAVE.test(k)) return;
      if (pareceEmail(obj[k])) achado = String(obj[k]).trim();
    });
  });
  return achado;
}

function acharSocio(d) {
  let achado = null;
  camadas(d).forEach(obj => {
    if (achado) return;
    Object.keys(obj).forEach(k => {
      if (achado || !RE_SOCIO_ARRAY.test(k)) return;
      const v = obj[k];
      if (Array.isArray(v) && v.length) {
        const primeiro = v[0];
        if (typeof primeiro === 'string' && primeiro.trim()) { achado = primeiro.trim(); return; }
        if (primeiro && typeof primeiro === 'object') {
          const chaveNome = Object.keys(primeiro).find(k2 => RE_NOME_CHAVE.test(k2) && typeof primeiro[k2] === 'string' && primeiro[k2].trim());
          if (chaveNome) achado = String(primeiro[chaveNome]).trim();
        }
      } else if (typeof v === 'string' && v.trim() && RE_NOME_CHAVE.test(k) === false) {
        // ex.: socio_administrador: "Maria Silva" — chave fala de sócio e o valor é o nome.
        achado = v.trim();
      }
    });
  });
  return achado;
}

function acharEndereco(d) {
  const fonte = (d && d.endereco && typeof d.endereco === 'object') ? d.endereco : d;
  if (!fonte || typeof fonte !== 'object') return null;
  const pega = (...nomes) => {
    for (const n of nomes) {
      const k = Object.keys(fonte).find(x => x.toLowerCase() === n);
      if (k && fonte[k] != null && String(fonte[k]).trim()) return String(fonte[k]).trim();
    }
    return null;
  };
  const via = [pega('tipo_logradouro'), pega('logradouro', 'rua', 'endereco')].filter(Boolean).join(' ');
  const partes = [
    via || null,
    pega('numero', 'number'),
    pega('bairro'),
    pega('municipio', 'cidade'),
    pega('uf', 'estado')
  ].filter(Boolean);
  return partes.length ? partes.join(', ') : null;
}

/* Recebe o registro já desaninhado (j.cnpj || j.data || j) e devolve o contato no
   formato que a tela espera. Nunca lança: resposta inesperada devolve nulos, e quem
   chama decide o que dizer. */
function extrairContato(d, cnpjLimpo) {
  const telefones = acharTelefones(d);
  return {
    cnpj: cnpjLimpo || null,
    telefone: telefones[0] || null,
    telefone2: telefones[1] || null,
    email: acharEmail(d),
    socio: acharSocio(d),
    endereco: acharEndereco(d)
  };
}

module.exports = { extrairContato, pareceTelefone, acharTelefones, acharEmail, acharSocio, acharEndereco };
