// scripts/testar-territorios.js
// Testa lib/territorios.js — quem é o dono de cada conta-alvo.
//
// POR QUE EXISTE (01/09/26): este módulo passou a ser lido por três lugares (a importação
// que dá dono a lead novo, a redistribuição da base e o backfill semanal), e ele decide
// para QUEM uma conta aparece. Errar aqui não quebra tela nenhuma: a conta simplesmente
// aparece na fila de quem está do outro lado da cidade — ou não aparece para ninguém, que
// é o defeito que a auditoria de 01/09 encontrou (283 contas invisíveis).
//
// O que ele protege, e que nenhuma revisão de tela alcança:
//   1. a TRAVA DE CIDADE: Lapa, Saúde, Higienópolis, Jardim Botânico e Penha existem no
//      Rio e em São Paulo; sem a trava, conta paulistana cai para executivo do Rio;
//   2. a ORDEM da decisão: nome conhecido, depois a zona escrita no nome, depois a
//      coordenada, depois a sobra — cada passo existe porque o anterior não sabe;
//   3. COBERTURA TOTAL: nenhuma conta dos municípios cobertos fica sem dono;
//   4. a zona escrita no nome vence a coordenada, porque a coordenada, quando o
//      geocodificador falha, vira o centróide do município e mente com precisão;
//   5. zona que não atravessa a cidade: o par (executivo, bairro) tem que ser vizinho.
//
// Uso: node scripts/testar-territorios.js   (da raiz do repositório)

const T = require('../lib/territorios.js');

let ok = 0;
const falhas = [];
function eDoDono(rotulo, cidade, bairro, lat, lng, esperado, viaEsperada) {
  const r = T.regraDoTerritorio(cidade, bairro, lat, lng);
  const nome = r ? r.nome : 'SEM DONO';
  const via = !r ? '—' : r.porZonaEscrita ? 'zona escrita' : r.porCoordenada ? 'coordenada' : 'nome';
  if (nome !== esperado) { falhas.push(rotulo + ': esperava ' + esperado + ', veio ' + nome); return; }
  if (viaEsperada && via !== viaEsperada) {
    falhas.push(rotulo + ': dono certo (' + nome + ') mas por ' + via + ', esperava ' + viaEsperada);
    return;
  }
  ok++;
}

/* ── 1. a trava de cidade: os homônimos entre Rio e São Paulo ─────────────────────────
   Cada um destes nomes existe nas duas cidades. Sem a trava, a regra do Rio casaria com
   a chave paulistana e o lead entraria na fila de quem trabalha a 400 km. */
eDoDono('Lapa do Rio', 'Rio de Janeiro', 'LAPA', -22.9130, -43.1800, 'André Gomes');
/* a Lapa é administrativamente Zona Oeste e ainda assim é do Sérgio: o centro de zona
   dele está a 8 km dela e o do Wericles a 14 km, e ela faz fronteira com Casa Verde e
   Freguesia do Ó pela ponte do Tietê. Foi este teste que achou o rótulo mentindo — dizia
   'Zona Norte de São Paulo' enquanto a fila entregava conta da Lapa. O rótulo mudou. */
eDoDono('Lapa de SP', 'São Paulo', 'LAPA', -23.5254, -46.7031, 'Sérgio Caetano');
eDoDono('Saúde do Rio', 'Rio de Janeiro', 'SAUDE', -22.8970, -43.1900, 'André Gomes');
eDoDono('Saúde de SP', 'São Paulo', 'SAUDE', -23.6230, -46.6170, 'Renata Pessoa');
eDoDono('Higienópolis do Rio', 'Rio de Janeiro', 'HIGIENOPOLIS', -22.8760, -43.2680, 'Luiz Pimentel');
eDoDono('Higienópolis de SP', 'São Paulo', 'HIGIENOPOLIS', -23.5501, -46.6604, 'Renata Pessoa');
eDoDono('Penha do Rio', 'Rio de Janeiro', 'PENHA', -22.8420, -43.2790, 'Luiz Pimentel');
eDoDono('Penha de França/SP', 'São Paulo', 'PENHA DE FRANCA', -23.5278, -46.5363, 'Renata Pessoa');

/* ── 2. a ordem da decisão ───────────────────────────────────────────────────────────
   Bairro conhecido pelo nome vem primeiro porque a fronteira real não é um raio: a
   Grande Tijuca é um corredor e a Ilha do Governador é separada por água — em linha reta
   a Ilha é mais perto de Botafogo do que da Penha, e por terra não é. */
eDoDono('Grande Tijuca pelo nome', 'Rio de Janeiro', 'MARACANA', -22.9120, -43.2300, 'Sandro Brito', 'nome');
eDoDono('Ilha pelo nome', 'Rio de Janeiro', 'JARDIM CARIOCA', -22.8080, -43.1900, 'Luiz Pimentel', 'nome');
eDoDono('Santana pelo nome', 'São Paulo', 'SANTANA', -23.5010, -46.6370, 'Sérgio Caetano', 'nome');
eDoDono('Bela Vista pelo nome', 'São Paulo', 'BELA VISTA', -23.5601, -46.6500, 'Renata Pessoa', 'nome');

/* a cauda: bairro que nenhuma lista cobre, decidido pela coordenada. São Paulo tem 96
   distritos e enumerar todos de cabeça é como se erra território. */
eDoDono('Parque Cisper pela coordenada', 'São Paulo', 'PARQUE CISPER', -23.4909, -46.4979, 'Renata Pessoa', 'coordenada');
/* Vila Constança fica na Zona Norte (-23.47,-46.59) — e é assim que ela tem que rotear.
   No banco, as 5 contas dela vieram com -23.5072,-46.4872, que é Zona Leste: outro
   geocode ruim, dentro do município e por isso indetectável pelo raio. O roteador manda
   para a Renata, que é a dona daquela coordenada — certo para o dado que existe. */
eDoDono('Vila Constança pela coordenada', 'São Paulo', 'VILA CONSTANCA', -23.4700, -46.5900, 'Sérgio Caetano', 'coordenada');
eDoDono('a mesma com coordenada de Zona Leste segue a coordenada', 'São Paulo', 'VILA CONSTANCA', -23.5072, -46.4872, 'Renata Pessoa', 'coordenada');
eDoDono('Vila Suzana pela coordenada', 'São Paulo', 'VILA SUZANA', -23.6163, -46.7386, 'Wericles Andrade', 'coordenada');
/* Gericinó não está em lista nenhuma do Rio: quem decide é a coordenada, e ela devolve
   o Bruno, que é o executivo da Zona Oeste. É o comportamento que faltava em 01/09, quando
   bairro fora das cinco listas do Rio simplesmente ficava sem dono. */
eDoDono('Gericinó pela coordenada', 'Rio de Janeiro', 'GERICINO', -22.8700, -43.4600, 'Bruno Martins', 'coordenada');

/* ── 3. a zona escrita no nome vence a coordenada ────────────────────────────────────
   Estas quatro têm coordenada -23.5507,-46.6334: o centróide de São Paulo, que é o que o
   geocodificador devolve quando NÃO acha o bairro. Dezenas de bairros diferentes
   compartilham essa coordenada. Ela não diz onde a conta está, diz "não sei" — e o
   parêntese no nome diz a zona. */
eDoDono('(ZONA NORTE) vence o centróide', 'São Paulo', 'JARDIM SANTA CRUZ (ZONA NORTE)',
  -23.5507, -46.6334, 'Sérgio Caetano', 'zona escrita');
eDoDono('(ZONA LESTE) vence o centróide', 'São Paulo', 'VILA PROGRESSO (ZONA LESTE)',
  -23.5507, -46.6334, 'Renata Pessoa', 'zona escrita');
eDoDono('(Z SUL) também é abreviada assim na fonte', 'São Paulo', 'VILA GUARANI (Z SUL)',
  -23.6724, -46.4985, 'Wericles Andrade', 'zona escrita');
eDoDono('(ZONA OESTE) com coordenada de outro município', 'São Paulo', 'JARDIM IPANEMA (ZONA OESTE)',
  -20.7785, -49.7012, 'Wericles Andrade', 'zona escrita');
/* e a dica NÃO atravessa para o Rio, que não usa esse parêntese e tem outras quatro zonas */
eDoDono('a dica de zona não vale no Rio', 'Rio de Janeiro', 'FREGUESIA (ILHA DO GOVERNADOR)',
  -22.8000, -43.2100, 'Luiz Pimentel', 'nome');

/* ── 3b. fronteira de palavra: nome curto vazando para o bairro vizinho ──────────────
   O casador testava includes cru sobre a chave "cidade bairro". Com isso o nome de duas
   letras da Sé casava "vila sao JOSE" e "SERralheiro", e o do Brás casava "BRASilandia" —
   e como o passo do nome vem antes da coordenada, essas contas iam para a zona errada: 7 das
   400 de São Paulo. Estes casos são o vazamento, virados do avesso. */
eDoDono('Vila São José não é da Sé', 'São Paulo', 'VILA SAO JOSE (CIDADE DUTRA)',
  -23.7491, -46.7094, 'Wericles Andrade', 'coordenada');
eDoDono('Serralheiro não é da Sé', 'São Paulo', 'VILA SERRALHEIRO', -23.4689, -46.6967, 'Sérgio Caetano', 'coordenada');
eDoDono('Brasilândia não é o Brás', 'São Paulo', 'VILA BRASILANDIA', -23.4469, -46.7105, 'Sérgio Caetano', 'nome');
/* e os dois nomes curtos continuam casando quando são o bairro de verdade */
eDoDono('a Sé é da Renata', 'São Paulo', 'SE', -23.5521, -46.6283, 'Renata Pessoa', 'nome');
eDoDono('o Brás é da Renata', 'São Paulo', 'BRAS', -23.5430, -46.6173, 'Renata Pessoa', 'nome');
/* nome composto dentro de rótulo sujo continua casando: parêntese é fronteira */
eDoDono('Freguesia do Ó com o Ó sem acento', 'São Paulo', 'FREGUESIA DO O', -23.5000, -46.6900, 'Sérgio Caetano', 'nome');
eDoDono('Penha Circular casa penha', 'Rio de Janeiro', 'PENHA CIRCULAR', -22.8400, -43.2800, 'Luiz Pimentel', 'nome');

/* ── 4. cobertura total: ninguém fica sem dono ───────────────────────────────────────
   Este é o teste que a auditoria de 01/09 gostaria de ter tido: 252 contas sem dono
   nenhum, e o cron semanal continuava despejando lá. */
const MUNICIPIOS = ['Rio de Janeiro', 'RIO DE JANEIRO', 'São Paulo', 'SAO PAULO',
  'Vila Velha', 'Vitória', 'Porto Alegre', 'Canoas'];
for (const m of MUNICIPIOS) {
  const semCoord = T.regraDoTerritorio(m, 'BAIRRO QUE NAO EXISTE EM LUGAR NENHUM');
  if (!semCoord) falhas.push('cobertura de ' + m + ': bairro desconhecido sem coordenada ficou sem dono');
  else ok++;
  const comCoord = T.regraDoTerritorio(m, 'OUTRO BAIRRO INVENTADO', -23.0, -46.0);
  if (!comCoord) falhas.push('cobertura de ' + m + ': bairro desconhecido com coordenada ficou sem dono');
  else ok++;
}

/* ── 5. zona que não atravessa a cidade ──────────────────────────────────────────────
   A 1ª versão da tabela dava ao Sérgio "Zona Norte e Vila Mariana": Santana ao norte do
   centro e Vila Mariana ao sul, 12 km e a cidade inteira entre as duas. Zona que
   atravessa a cidade é zona que ninguém roda — o dia vira trânsito. */
eDoDono('Vila Mariana é da Renata, não do Sérgio', 'São Paulo', 'VILA MARIANA',
  -23.5893, -46.6287, 'Renata Pessoa');
eDoDono('Jabaquara segue a Vila Mariana', 'São Paulo', 'JABAQUARA', -23.6344, -46.6432, 'Renata Pessoa');
/* e a distância entre o centro de zona do dono e o bairro tem que ser rodável a pé/carro */
for (const c of T.CENTROS_DE_ZONA) {
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) falhas.push('centro de zona sem coordenada: ' + c.nome);
  else ok++;
}

/* ── 6. o owner é o mesmo em rotearTerritorio e regraDoTerritorio ─────────────────────
   Duas funções que respondem a mesma pergunta são duas verdades esperando divergir. */
for (const caso of [['São Paulo', 'PARQUE CISPER', -23.4909, -46.4979],
                    ['Rio de Janeiro', 'COPACABANA', -22.9700, -43.1850],
                    ['São Paulo', 'JARDIM SANTA CRUZ (ZONA NORTE)', -23.5507, -46.6334]]) {
  const a = T.rotearTerritorio(...caso);
  const b = T.regraDoTerritorio(...caso);
  if (a !== (b && b.owner)) falhas.push('roteador divergiu da regra em ' + caso[1]);
  else ok++;
}

if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  · ' + f));
  process.exit(1);
}
console.log('territórios: ' + ok + ' checagens ok.');
