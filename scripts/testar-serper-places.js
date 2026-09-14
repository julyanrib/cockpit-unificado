/* ============================================================================
   O COLETOR DE MAIS AVALIADOS: SERPER, E SÓ RESTAURANTE (14/09/26)

   DOIS PEDIDOS DO JULYAN NUM COMMIT SÓ:
     · "estou no serper.dev, para puxarmos os mais avaliados do google pra eles"
     · "vou precisar de toda a ajuda de configuração focada só em restaurante"

   O QUE ESTA SUÍTE PROTEGE, e por que cada regra existe:

   1. TRADUÇÃO CEGA. Eu escrevi o de/para dos campos do Serper sem poder testar contra a
      API — a chave não é minha para ter. O modo de falha desse tipo de código é o pior
      desta casa: a resposta chega, o código roda, e todo registro sai `null` sem ninguém
      reclamar. Por isso o adaptador é obrigado a JOGAR ERRO quando a página inteira vem
      sem nome ou sem contagem de avaliações — e é isso que se mede aqui.

   2. SÓ RESTAURANTE. A consulta de texto não basta: "restaurantes em Copacabana" no
      Google Maps devolve hotel com restaurante, shopping com praça de alimentação e
      mercado com rotisseria. Quem separa é a categoria de cada resultado, e o veto passa
      ANTES da aceitação — "Restaurante do Hotel X" tem as duas palavras e é hotel.

   3. QUEM BUSCA NÃO DECIDE. O corte de volume, o dedup, o teto por praça e a ordenação
      continuam no coletor. Se o adaptador começar a filtrar por nota ou a ordenar, passa
      a haver duas regras para a mesma coisa — e é assim que elas divergem em silêncio.
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const lib = require(path.join(raiz, 'lib', 'serper-places.js'));
const fonteLib = fs.readFileSync(path.join(raiz, 'lib', 'serper-places.js'), 'utf8');
const coletor = fs.readFileSync(path.join(raiz, 'scripts', 'backfill-google-places.js'), 'utf8');
const workflow = fs.readFileSync(path.join(raiz, '.github', 'workflows', 'google-places-mensal.yml'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, detalhe) => { if (cond) { ok++; return; } falhas.push(nome + (detalhe ? ' — ' + detalhe : '')); };

/* ── 1. SÓ RESTAURANTE ───────────────────────────────────────────────────────────── */

checar('restaurante e bar entram',
  ['Restaurante', 'Restaurant', 'Bar', 'Gastrobar', 'Churrascaria', 'Pizzaria',
    'Hamburgueria', 'Pub', 'Cervejaria', 'Bistrô', 'Restaurante japonês', 'Petiscaria']
    .every(c => lib.categoriaDeRestaurante(c).aceito),
  'a lista de aceitas perdeu um tipo de casa que é cliente Takeat');

checar('hotel, shopping e mercado NÃO entram',
  ['Hotel', 'Pousada', 'Shopping center', 'Supermercado', 'Grocery store', 'Farmácia',
    'Posto de gasolina', 'Academia', 'Escola'].every(c => !lib.categoriaDeRestaurante(c).aceito),
  'é isso que a consulta de texto sozinha deixa passar');

checar('o veto ganha da aceitação quando as duas palavras aparecem',
  !lib.categoriaDeRestaurante('Restaurante do Hotel Praia').aceito
    && !lib.categoriaDeRestaurante('Bar do Shopping Vitória').aceito,
  '"Restaurante do Hotel X" é hotel: quem decide compra de PDV ali é a rede, não o salão');

checar('padaria e cafeteria ficam de fora — decisão, não esquecimento',
  !lib.categoriaDeRestaurante('Padaria').aceito
    && !lib.categoriaDeRestaurante('Bakery').aceito
    && !lib.categoriaDeRestaurante('Sorveteria').aceito,
  'Julyan pediu "focada só em restaurante"; voltar atrás é uma linha em CATEGORIAS_VETADAS');

checar('categoria vazia não entra por omissão',
  !lib.categoriaDeRestaurante(null).aceito
    && !lib.categoriaDeRestaurante('').aceito
    && !lib.categoriaDeRestaurante('Point of interest').aceito,
  'aceitar o que não se sabe o que é enche a carteira de ruído com cara de lead');

checar('o descarte diz o motivo',
  (function () {
    const v = lib.categoriaDeRestaurante('Hotel');
    return v.motivo && v.motivo.indexOf('hotel') > -1;
  }()),
  'praça que rende pouco sem motivo escrito parece praça sem restaurante — e pode ser a '
    + 'lista de categorias cortando demais');

/* ── 2. A TRADUÇÃO NÃO PODE SER CEGA ─────────────────────────────────────────────── */

checar('a tradução aceita os apelidos conhecidos de cada campo',
  (function () {
    const a = lib.normalizarLugar({ title: 'X', ratingCount: 10, rating: 4.1, latitude: -20, longitude: -40,
      placeId: 'p1', phoneNumber: '27999', address: 'rua 1', category: 'Restaurante' });
    const b = lib.normalizarLugar({ name: 'X', reviews: 10, stars: 4.1, lat: -20, lng: -40,
      cid: 'c1', phone: '27999', address: 'rua 1', type: 'Restaurante' });
    return a && b && a.avaliacoes === 10 && b.avaliacoes === 10
      && a.nota === 4.1 && b.nota === 4.1 && a.lat === -20 && b.lat === -20
      && a.telefone === '27999' && b.telefone === '27999';
  }()),
  'eu não pude conferir a grafia contra a API; ler os dois apelidos custa nada e evita o '
    + 'pior caso desta casa — campo que chega e ninguém lê');

checar('sem nome o registro é descartado, não vira linha vazia',
  lib.normalizarLugar({ ratingCount: 900 }) === null
    && lib.normalizarLugar({}) === null
    && lib.normalizarLugar(null) === null,
  'conta sem nome na carteira do executivo é uma linha que ele não consegue nem abrir');

checar('avaliações ausente vira null, e nunca zero',
  (function () {
    const l = lib.normalizarLugar({ title: 'X', category: 'Restaurante' });
    return l && l.avaliacoes === null && l.nota === null;
  }()),
  'zero por falta de medição lê como "ninguém avaliou" e é o zero que tranquiliza');

checar('sem placeId a chave de dedup ainda existe, e o registro se declara',
  (function () {
    const l = lib.normalizarLugar({ title: 'Bar do Zé', address: 'Rua A, 10', category: 'Bar' });
    return l && l.place_id && l.place_id.indexOf('serper:') === 0 && l.semPlaceId === true;
  }()),
  'sem chave nenhuma o dedup do coletor para de funcionar e a mesma casa entra toda rodada');

/* A TRAVA PRINCIPAL: página inteira ilegível tem de VIRAR ERRO, não lista de nulls. */
checar('página inteira sem nome joga erro com a amostra crua',
  /NENHUM tinha nome/.test(fonteLib) && /JSON\.stringify\(bruto\[0\]\)/.test(fonteLib),
  'sem isto, formato mudado vira "a praça não tem restaurante" — e ninguém contesta esse zero');

checar('página inteira sem contagem de avaliações também',
  /Nenhum resultado trouxe contagem de avaliacoes/.test(fonteLib),
  'sem a contagem o corte "mais avaliados" não existe, e a rodada importaria qualquer coisa');

checar('forma de resposta desconhecida joga erro dizendo o que chegou',
  /devolveu uma forma que eu nao reconheco/.test(fonteLib)
    && /Object\.keys\(dados \|\| \{\}\)/.test(fonteLib),
  '"places" pode se chamar outra coisa; a mensagem tem de trazer as chaves reais');

/* ── 3. QUEM BUSCA NÃO DECIDE ────────────────────────────────────────────────────── */

checar('o adaptador não filtra por nota nem ordena',
  !/AVALIACOES_MINIMAS|sort\(/.test(fonteLib),
  'o corte de volume e a ordenação são do coletor; duas regras para a mesma coisa é como '
    + 'elas divergem em silêncio');

checar('o corte de volume continua no coletor',
  /const AVALIACOES_MINIMAS = \d+;/.test(coletor)
    && coletor.indexOf('.sort((a, b) => (b.avaliacoes || 0) - (a.avaliacoes || 0))') > -1,
  'se ele sair daqui, "os MAIS avaliados" deixa de ser literalmente verdade');

/* ── 4. A CHAVE ──────────────────────────────────────────────────────────────────── */

checar('o coletor e o workflow pedem a MESMA chave',
  coletor.indexOf('process.env.SERPER_API_KEY') > -1
    && workflow.indexOf('SERPER_API_KEY: ${{ secrets.SERPER_API_KEY }}') > -1,
  'nome divergente entre os dois é rodada que falha por motivo que ninguém entende');

checar('sem chave o script falha e diz onde pôr, em vez de rodar em silêncio',
  /SERPER_API_KEY ausente/.test(coletor)
    && /serper\.dev → API keys/.test(coletor)
    && coletor.indexOf('process.exit(1)') > -1,
  'rodada silenciosa que não importa nada é pior que rodada que falha e avisa');

checar('nenhuma chave foi escrita no código',
  !/[A-Za-z0-9]{32,}/.test(fonteLib.replace(/https?:\/\/\S+/g, '')),
  'chave de API mora em Secret, nunca no repositório — que é público');

/* ── 5. O MODO AMOSTRA ───────────────────────────────────────────────────────────── */

checar('existe um modo que mostra o registro cru sem importar nada',
  coletor.indexOf("process.argv.includes('--amostra')") > -1
    && coletor.indexOf('REGISTRO CRU') > -1
    && coletor.indexOf('nada foi importado') > -1,
  'a primeira rodada tem de provar a grafia dos campos ANTES de gravar na carteira de '
    + 'alguém — é o que separa "integrei" de "achei que integrei"');

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('serper/places: ' + ok + ' checagens ok — só restaurante, tradução que grita quando não entende, e a chave fora do código.');
