// scripts/testar-contato-cnpj.js
// Testa lib/contato-cnpj.js contra os FORMATOS plausíveis de resposta de Consulta CNPJ.
//
// POR QUE ESTE ARQUIVO EXISTE: a extração antiga fixava nomes de campo escolhidos por
// semelhança com outras APIs, nunca validados — e `socio` ficou em 0 de 869 contas-alvo.
// Descobrir o nome certo custa 1 crédito por tentativa, porque a Consulta CNPJ cobra por
// empresa. Então a extração passou a ser por FORMA, e estes testes são o que garante que
// ela aguenta variação de contrato sem gastar crédito para descobrir.
//
// Os formatos abaixo cobrem as convenções usuais das APIs de CNPJ brasileiras (todas
// espelham o mesmo dado-base da Receita Federal, com nomes diferentes).
//
// Uso: node scripts/testar-contato-cnpj.js   (da raiz do repositório)

const path = require('path');
const { extrairContato, pareceTelefone } = require(path.join(__dirname, '..', 'lib', 'contato-cnpj.js'));

let ok = 0, falhou = 0;
function checa(cond, msg) { if (cond) { ok++; console.log('  ok  ' + msg); } else { falhou++; console.log('  FALHA  ' + msg); } }
function igual(a, b, msg) { checa(JSON.stringify(a) === JSON.stringify(b), msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : `: esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`)); }

console.log('\n== Telefone: reconhecer pela FORMA, não pelo nome ==\n');

igual(pareceTelefone('+55 51 3392-7746'), true, 'fixo com +55 e máscara');
igual(pareceTelefone('5133927746'), true, '10 dígitos (fixo com DDD)');
igual(pareceTelefone('51993927746'), true, '11 dígitos (celular com DDD)');
igual(pareceTelefone('3392-7746'), false, '8 dígitos sem DDD não passa (ambíguo)');
igual(pareceTelefone('66750867000172'), false, 'CNPJ (14 dígitos) NÃO é telefone');
igual(pareceTelefone('90050170'), false, 'CEP (8 dígitos) não é telefone');
igual(pareceTelefone(null), false, 'nulo');
igual(pareceTelefone(''), false, 'vazio');

console.log('\n== Formatos de resposta ==\n');

// Formato A: campos numerados no topo (o que a rota antiga assumia)
const A = {
  razao_social: 'SUSHI SCHAEBERLE LTDA',
  telefone_1: '(11) 3456-7890', telefone_2: '(11) 98765-4321',
  email: 'contato@sushi.com.br',
  qsa: [{ nome_socio: 'MARIA SCHAEBERLE', qualificacao: '49-Sócio-Administrador' }],
  tipo_logradouro: 'RUA', logradouro: 'DAS FLORES', numero: '100',
  bairro: 'CENTRO', municipio: 'SAO PAULO', uf: 'SP'
};
const rA = extrairContato(A, '67734243000124');
igual(rA.telefone, '(11) 3456-7890', 'A · primeiro telefone');
igual(rA.telefone2, '(11) 98765-4321', 'A · segundo telefone');
igual(rA.email, 'contato@sushi.com.br', 'A · e-mail');
igual(rA.socio, 'MARIA SCHAEBERLE', 'A · sócio do QSA');
igual(rA.endereco, 'RUA DAS FLORES, 100, CENTRO, SAO PAULO, SP', 'A · endereço montado');
igual(rA.cnpj, '67734243000124', 'A · cnpj repassado');

// Formato B: lista de telefones com objetos, sócios em outra chave, endereço aninhado
const B = {
  nome: 'AURA ROMANA PIZZARIA',
  telefones: [{ ddd: '51', numero: '5133927746' }, { ddd: '51', numero: '51987654321' }],
  contato: { email_contato: 'aura@pizza.com' },
  socios: [{ nome: 'JOAO ROMANO' }],
  endereco: { logradouro: 'AV BOQUEIRAO', numero: '3469', bairro: 'ESTANCIA VELHA', cidade: 'CANOAS', estado: 'RS' }
};
const rB = extrairContato(B, '66776224000106');
igual(rB.telefone, '5133927746', 'B · telefone dentro de objeto na lista');
igual(rB.telefone2, '51987654321', 'B · segundo da lista');
igual(rB.email, 'aura@pizza.com', 'B · e-mail em objeto aninhado');
igual(rB.socio, 'JOAO ROMANO', 'B · sócio em "socios"');
igual(rB.endereco, 'AV BOQUEIRAO, 3469, ESTANCIA VELHA, CANOAS, RS', 'B · endereço do objeto aninhado');

// Formato C: nomes em inglês, sócio como string solta, QSA vazio
const C = {
  company_name: 'CHURRAS KELER LTDA',
  phone: '5133334444',
  socio_administrador: 'PEDRO KELER',
  quadro_societario: [],
  rua: 'BOA SAUDE', numero: '438', bairro: 'RIO BRANCO', municipio: 'CANOAS', uf: 'RS'
};
const rC = extrairContato(C, '66094240000100');
igual(rC.telefone, '5133334444', 'C · chave "phone"');
igual(rC.socio, 'PEDRO KELER', 'C · sócio como string solta (QSA vazio)');
igual(rC.endereco, 'BOA SAUDE, 438, RIO BRANCO, CANOAS, RS', 'C · endereço sem tipo_logradouro');

// Formato D: o CNPJ aparece num campo numérico próximo — não pode virar telefone
const D = {
  cnpj: '66750867000172', cnpj_raiz: '66750867', cep: '90050170',
  codigo_municipio: '4314902', capital_social: '10000',
  telefone_1: '', qsa: []
};
const rD = extrairContato(D, '66750867000172');
igual(rD.telefone, null, 'D · não inventa telefone a partir de CNPJ/CEP/código');
igual(rD.socio, null, 'D · QSA vazio devolve nulo, não erro');
igual(rD.email, null, 'D · sem e-mail');

// Formato E: resposta vazia ou inesperada
igual(extrairContato({}, '1').telefone, null, 'E · objeto vazio não quebra');
igual(extrairContato(null, '1').telefone, null, 'E · nulo não quebra');
igual(extrairContato(undefined, null).cnpj, null, 'E · undefined não quebra');

// Formato F: telefone existe mas com nome de chave inesperado
const F = { fone_comercial: '(51) 3392-7746', qsa: [{ nome: 'ANA' }] };
const rF = extrairContato(F, '1');
igual(rF.telefone, '(51) 3392-7746', 'F · chave "fone_comercial" é reconhecida pela forma');
igual(rF.socio, 'ANA', 'F · sócio com chave "nome"');

// Formato G: o valor com cara de telefone está numa chave que NÃO fala de telefone.
// Não pode ser pego — pegar seria trocar erro visível por errado silencioso.
const G = { inscricao_estadual: '5133927746', qsa: [] };
igual(extrairContato(G, '1').telefone, null, 'G · não varre valores fora de chave de telefone');

console.log('');
if (falhou) { console.error(`${falhou} falha(s), ${ok} ok.`); process.exit(1); }
console.log(`${ok} checagens ok.`);
