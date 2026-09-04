// scripts/testar-pl6-contas.js
//
// AS FUNÇÕES DO PLANEJAMENTO SÃO EXECUTADAS DE VERDADE, CONTRA UM DADO DE MENTIRA.
// ---------------------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE, com o defeito que o produziu (04/09/26): reescrevendo a
// região, substituí o trecho de pl6Reciclagem que declarava `porPonto` e deixei o uso
// dela vivo doze linhas abaixo, em `km: porPonto ? porPonto.km : null`. A aba inteira
// morria com «ReferenceError: porPonto is not defined» — e isso passou por
//
//     node scripts/build.js      → OK
//     node scripts/check-scripts.js → 19 guardas verdes
//     as 19 suítes                  → verdes
//
// porque NENHUMA delas executa uma linha do template. Guarda estática não vê variável
// local: para ela o arquivo continua com a sintaxe perfeita. Foi a terceira vez que eu
// derrubei uma aba assim (é a nota "remover bloco exige varrer os usos" na memória), e as
// duas primeiras só apareceram porque eu abri a tela no navegador.
//
// O QUE ELE FAZ: extrai as funções puras da cadeia de contas do Planejamento, injeta um
// DATA/prospeccaoCache mínimo e CHAMA cada uma. Qualquer identificador solto vira falha
// aqui, em dois segundos, sem navegador.
//
// Ele NÃO substitui olhar a tela — mede comportamento de função, não de pixel.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const tpl = fs.readFileSync(T, 'utf8');

let falhas = 0;
function checar(nome, cond, detalhe) {
  if (cond) { console.log('  ok  ' + nome); return; }
  falhas++;
  console.log('  FALHA  ' + nome + (detalhe ? '  — ' + detalhe : ''));
}

/* ── extrai uma função (ou const) pelo nome, do próprio template ─────────────────── */
function pegarFn(nome) {
  const re = new RegExp('\\nfunction ' + nome + '\\([\\s\\S]*?\\n\\}');
  const m = re.exec(tpl);
  if (!m) { console.error('não achei function ' + nome + ' — a âncora deste teste se perdeu.'); process.exit(1); }
  return m[0];
}
function pegarConst(nome) {
  const re = new RegExp('\\nconst ' + nome + ' = [\\s\\S]*?;\\n');
  const m = re.exec(tpl);
  if (!m) { console.error('não achei const ' + nome + '.'); process.exit(1); }
  return m[0];
}

const CADEIA = ['pl6ChaveBairro', 'pl6RotuloBairro', 'pl6ChaveDeLugar', 'pl6RotuloDoGrupo',
  'pl6Km', 'pl6RegiaoDoLead', 'pl6Regioes', 'pl6Carteira', 'pl6Reciclagem', 'pl6GrupoDaFonte',
  'pl6Novos', 'pl6TodasAsContas'];

const fonte = CADEIA.map(pegarFn).join('\n');

/* ── o dado de mentira: um de cada caso que a cascata de lugar precisa cobrir ────── */
const CENARIO = `
  const STAGE_LABELS = { '1395880469': 'Prospecção', '1398311191': 'Reciclagem' };
  const DATA = {
    reps: [{ ownerId: '99', name: 'Teste Silva' }],
    leadsReciclagem60: [
      /* o caso REAL da tela: sem bairro, sem cidade, sem coordenada */
      { id: '900', ownerId: '99', name: 'SEM LUGAR NENHUM', dias: 130, stageId: '1398311191' },
      /* com CEP: tem de cair no mesmo grupo do 901 da carteira */
      { id: '901', ownerId: '99', name: 'RECIC COM CEP', dias: 140, cep: '21235-515',
        logradouro: 'Avenida Monsenhor Félix', cidade: 'Rio de Janeiro' },
      { id: '902', ownerId: '88', name: 'DE OUTRO REP', dias: 122 }
    ],
    funilLeads: {}
  };
  /* meusNegociosAbertos é a carteira. Três casos: bairro, CEP, e só cidade. */
  function meusNegociosAbertos(ownerId) {
    if (String(ownerId) !== '99') return [];
    return [
      { id: '1', name: 'COM BAIRRO', stageId: '1395880469', dias: 3, bairro: 'Praia da Costa',
        cidade: 'Vila Velha', lat: -20.33, lng: -40.29 },
      { id: '2', name: 'COM CEP A', stageId: '1395880469', dias: 9, cep: '21235280',
        logradouro: 'Avenida Monsenhor Félix', cidade: 'Rio de Janeiro', lat: -22.835, lng: -43.326 },
      { id: '3', name: 'COM CEP B', stageId: '1395880469', dias: 40, cep: '21235110',
        logradouro: 'Avenida Monsenhor Félix', cidade: 'Rio de Janeiro', lat: -22.842, lng: -43.325,
        slaBreach: true },
      { id: '4', name: 'SO CIDADE', stageId: '1395880469', dias: 1, cidade: 'Salvador' }
    ];
  }
  const prospeccaoCache = [
    { id: '50', responsavel_owner_id: '99', nome: 'CONTA ALVO', fonte: 'Casa dos Dados',
      cep: '21235999', logradouro: 'Rua Qualquer', cidade: 'Rio de Janeiro', lat: -22.84, lng: -43.32 }
  ];
`;

let api;
try {
  api = new Function(CENARIO + '\n' + fonte
    + '\nreturn { pl6Regioes, pl6Carteira, pl6Reciclagem, pl6Novos, pl6TodasAsContas,'
    + ' pl6ChaveDeLugar, pl6RotuloDoGrupo, DATA, meusNegociosAbertos };')();
} catch (e) {
  console.error('  FALHA  o bloco do Planejamento não avalia: ' + e.message);
  process.exit(1);
}

const rep = { ownerId: '99', name: 'Teste Silva' };

/* ── 1. cada função da cadeia RODA ───────────────────────────────────────────────── */
// Este é o teste que teria pego o `porPonto` solto: ele não olha o texto, ele chama.
let regioes = null, carteira = null, recic = null, novos = null, todas = null;
checar('pl6Regioes executa', (() => { try { regioes = api.pl6Regioes(rep); return true; }
  catch (e) { checar._e = e.message; return false; } })(), checar._e);
checar('pl6Carteira executa', (() => { try { carteira = api.pl6Carteira(rep, regioes || []); return true; }
  catch (e) { checar._e = e.message; return false; } })(), checar._e);
checar('pl6Reciclagem executa', (() => { try { recic = api.pl6Reciclagem(rep, regioes || []); return true; }
  catch (e) { checar._e = e.message; return false; } })(), checar._e);
checar('pl6Novos executa', (() => { try { novos = api.pl6Novos(rep, regioes || []); return true; }
  catch (e) { checar._e = e.message; return false; } })(), checar._e);
checar('pl6TodasAsContas executa', (() => { try { todas = api.pl6TodasAsContas(rep, regioes || []); return true; }
  catch (e) { checar._e = e.message; return false; } })(), checar._e);

if (falhas) {
  console.log('');
  console.error(falhas + ' falha(s) — a cadeia de contas do Planejamento não roda.');
  process.exit(1);
}

/* ── 2. a cascata de lugar cobre os três campos ──────────────────────────────────── */
checar('bairro vira chave quando existe',
  api.pl6ChaveDeLugar({ bairro: 'Praia da Costa', cep: '29101' }) === 'b:praia da costa',
  'o bairro tem precedência: é o campo mais específico');
checar('sem bairro, o CEP de 5 dígitos vira chave',
  api.pl6ChaveDeLugar({ cep: '21235-515' }) === 'z:21235',
  'e a pontuação do CEP não pode virar chave diferente');
checar('sem bairro e sem CEP, a cidade vira chave',
  api.pl6ChaveDeLugar({ cidade: 'Salvador' }) === 'c:salvador');
checar('sem nada, não há chave — e isso não é uma região chamada vazio',
  api.pl6ChaveDeLugar({}) === null,
  'chave vazia agruparia todas as contas sem endereço numa região fantasma');

/* ── 3. o mesmo lugar junta contas de fontes diferentes ──────────────────────────── */
// É o ponto da mudança: a região existe porque o território é a soma das três fontes.
const zona = (regioes || []).find(r => r.chave === 'z:21235');
checar('a faixa de CEP junta carteira, reciclagem e lote novo', !!zona
  && zona.porFonte.carteira === 2 && zona.porFonte.reciclagem === 1 && zona.porFonte.novo === 1,
  zona ? JSON.stringify(zona.porFonte) : 'a região z:21235 não se formou');
checar('e ela se chama pela via mais frequente, não pelo número do CEP',
  !!zona && /Monsenhor/.test(zona.nome), zona ? zona.nome : '');
checar('o grupo declara por qual campo se formou',
  !!zona && zona.via === 'CEP 21235', zona ? String(zona.via) : '');

/* ── 4. o centroide não é contaminado por quem não tem ponto ─────────────────────── */
// Média com zero dentro joga a região para o meio do Atlântico.
checar('o centroide sai só das contas com coordenada',
  !!zona && zona.comCoordenada === 3 && zona.lat < -22 && zona.lat > -23,
  zona ? ('comCoordenada=' + zona.comCoordenada + ' lat=' + zona.lat) : '');
const semPonto = (regioes || []).find(r => r.chave === 'c:salvador');
checar('região sem nenhuma coordenada tem centroide null, não 0,0',
  !!semPonto && semPonto.lat === null && semPonto.lng === null,
  semPonto ? JSON.stringify([semPonto.lat, semPonto.lng]) : 'c:salvador não se formou');

/* ── 5. TODAS as contas da tela são alcançáveis ──────────────────────────────────── */
// O defeito de origem: 48 dos 86 cards do Bruno eram renderizados e não estavam em
// nenhuma lista que os cliques consultavam.
const ids = new Set((todas || []).map(x => x.id));
checar('a reciclagem está em pl6TodasAsContas',
  ids.has('r-900') && ids.has('r-901'),
  'era exatamente isto que faltava: card na tela, ausente da busca do clique');
checar('a carteira está', ids.has('c-1') && ids.has('c-4'));
checar('o lote novo está', ids.has('n-50'));
checar('e conta de OUTRO rep não entra', !ids.has('r-902'),
  'carteira de colega na tela dele é vazamento de dado');
checar('o total é a soma das três fontes',
  (todas || []).length === (carteira || []).length + (recic || []).length + (novos || []).length);

/* ── 6. a região de um lead é a DELE ────────────────────────────────────────────── */
// Antes vinha do centroide mais próximo: um lead de Salvador podia sair como "Monsenhor
// Félix" se aquela fosse a única região com coordenada.
const salvador = (todas || []).find(x => x.id === 'c-4');
checar('o lead que só tem cidade cai na região da cidade dele',
  !!salvador && salvador.regiao === 'c:salvador',
  salvador ? String(salvador.regiao) : '');
const semLugar = (todas || []).find(x => x.id === 'r-900');
checar('e o lead sem nenhum campo de lugar fica SEM região',
  !!semLugar && !semLugar.regiao,
  'sem isso ele seria agendado numa região onde não está');
checar('quem não tem coordenada tem km null, não 0',
  !!semLugar && semLugar.km === null && semLugar.semEndereco === true);

/* ── 7. e a única fonte é a única fonte ─────────────────────────────────────────── */
// Se alguém voltar a montar "todas as contas" na mão, some uma fonte de novo.
const naMao = (tpl.match(/pl6Carteira\(rep, regioes\)\s*\n?\s*\.concat\(pl6Novos/g) || []).length;
checar('ninguém monta "todas as contas" na mão',
  naMao === 0,
  naMao + ' lugar(es) concatenando carteira+novos direto — quem quer todas chama pl6TodasAsContas');

console.log('');
if (falhas) {
  console.error(falhas + ' falha(s) — a cadeia de contas do Planejamento está errada.');
  process.exit(1);
}
console.log('planejamento: a cadeia de contas roda, o território sai das três fontes, e todo card é alcançável.');
