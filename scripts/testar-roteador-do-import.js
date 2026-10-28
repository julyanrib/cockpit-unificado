/* ══════════════════════════════════════════════════════════════════════════════════════
   O ROTEADOR DO IMPORT LÊ A DECLARAÇÃO (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "e pq nao ta puxando nada de guarulhos? guarulhos é gigante e tem o field".

   ══ TRÊS CAUSAS, TODAS MEDIDAS ANTES DE MEXER ═══════════════════════════════════════
   1. A BUSCA NUNCA RODOU COM GUARULHOS. Cron do backfill é segunda 01:00 UTC, a última
      rodada foi 07/09, e Guarulhos entrou na lista de cidades hoje. Zero lead de
      Guarulhos em leads_prospeccao — só as seis cidades antigas.

   2. E SE RODASSE, O LEAD VIRIA SEM DONO. `lib/territorios.js` era a QUARTA cópia da
      regra de território, e não conhecia nenhuma das nove cidades novas:

        guarulhos/centro SEM DONO · guarulhos/vila augusta SEM DONO · mogi SEM DONO
        duque de caxias SEM DONO · sao joao de meriti SEM DONO · nilopolis SEM DONO

   3. E AS ROTAS DE HOJE NÃO CHEGAVAM AQUI:
        copacabana -> André (a declaração diz Sandro) · cachambi -> Sandro (diz Luiz)
      Pior: quatro regras tinham `owner: 'pendente_*'` — id de espera que NINGUÉM resolve
      (o fetch-hubspot só sabe filtrá-lo). Lead roteado por elas gravaria id falso em
      responsavel_owner_id e ficaria invisível para todo mundo.

   ══ A ORDEM QUE ESTA SUITE PROTEGE ══════════════════════════════════════════════════
   Declaração primeiro (a decisão dele de hoje), listas largas depois (a cobertura de
   01/09 que ele nunca revogou), e só então zona escrita, coordenada e sobra. As listas
   antigas NÃO foram apagadas de propósito: elas têm ~30 bairros por pessoa contra os que
   ele nomeou, e trocar uma pela outra jogaria a maior parte do Rio na sobra — mover
   bairro que ele não citou é decisão de território, e é dele.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const raiz = path.join(__dirname, '..');
const terr = require(path.join(raiz, 'lib', 'territorios.js'));
const usuarios = require(path.join(raiz, 'data', 'usuarios.json'));
const decl = require(path.join(raiz, 'data', 'territorios.json'));

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}

const reps = (Array.isArray(usuarios) ? usuarios : (usuarios.usuarios || []))
  .filter(u => u.role === 'rep');
const primeiroNome = id => {
  const r = reps.find(x => String(x.ownerId) === String(id));
  return r ? String(r.nome).split(' ')[0] : (id || null);
};
const quem = (cidade, bairro) => primeiroNome(terr.rotearTerritorio(cidade, bairro, null, null));
const via = (cidade, bairro) => {
  const r = terr.regraDoTerritorio(cidade, bairro, null, null);
  if (!r) return 'sem dono';
  if (r.sobraDeclarada) return 'sobra declarada';
  if (r.declarado) return 'declarado';
  return r.sobra ? 'sobra' : 'lista antiga';
};

/* ══ O ROTEADOR SOBRE UMA DECLARAÇÃO SINTÉTICA (15/10/26) ════════════════════════════
   15/10/26: território refeito pelo Julyan. Com a rota enxuta, TRÊS mecanismos do
   roteador ficaram sem nenhum caso no dado real: a sobra automática da cidade de um dono
   só declarado por bairro (era Suzano/Mogi), a sobra escolhida a dedo com
   `sobraDoMunicipio` (era o Luiz no Rio) e o divisor por meridiano (era Guarulhos). O
   código continua lá e volta a valer na primeira linha que o Julyan escrever no JSON.

   Apagar as checagens deixaria esses mecanismos sem guarda; mantê-las sobre o dado real
   as deixaria verdes por vacuidade. Então elas rodam sobre uma CÓPIA da declaração real
   com as linhas de antes de 15/10 recolocadas (o divisor de Guarulhos copiado do
   JSON de antes de 15/10), carregando lib/territorios.js de novo com o JSON trocado SÓ no cache do
   require — nada em disco muda, e o roteador real é restaurado logo em seguida. */
const roteadorSobre = function (declSintetica) {
  const pJson = require.resolve(path.join(raiz, 'data', 'territorios.json'));
  const pLib = require.resolve(path.join(raiz, 'lib', 'territorios.js'));
  const modJson = require.cache[pJson];
  const libReal = require.cache[pLib];
  const exportsReais = modJson.exports;
  try {
    modJson.exports = declSintetica;
    delete require.cache[pLib];
    return require(pLib);
  } finally {
    modJson.exports = exportsReais;
    require.cache[pLib] = libReal;
  }
};
const declAntiga = JSON.parse(JSON.stringify(decl));
const pessoaAntiga = nome => declAntiga.territorios.find(x => x.rep === nome);
/*  A CÓPIA É A DECLARAÇÃO DE ONTEM, e nela quem saiu do time ainda andava. Em 28/10/26
    a Renata e o Fabio foram desligados (ativo: false) e o roteador real, com razão,
    passou a ignorá-los — mas esta cópia existe justamente para medir o MECANISMO do
    roteador (sobra do município, meridiano, bairro nomeado vs. trecho de nome) num
    território conhecido, não para dizer quem trabalha aqui hoje. Sem religá-los na
    cópia, oito checagens de mecanismo passavam a medir o vazio.  */
['Renata Pessoa', 'Fabio Aranha Panciera'].forEach((nome) => {
  const p = declAntiga.territorios.find(x => x.rep === nome);
  if (!p) throw new Error('a suíte precisa de ' + nome + ' na declaração: ela modela o território de antes');
  delete p.ativo; delete p.desligadoEm;
});
pessoaAntiga('Sérgio Caetano').areas.push({ municipio: 'Guarulhos', uf: 'SP', bairros: ['Vila Augusta'] });
pessoaAntiga('Renata Pessoa').areas.push({ municipio: 'Guarulhos', uf: 'SP', bairros: ['Macedo'] });
pessoaAntiga('Renata Pessoa').areas.push({ municipio: 'Suzano', uf: 'SP', bairros: ['Centro'] });
/* o Bruno leva a sobra do Rio aqui, como o Luiz levava até 11/09 */
pessoaAntiga('Bruno Martins').areas[0].sobraDoMunicipio = true;
/* e o André volta a ter Jacarepaguá, para a Freguesia (Jacarepaguá) ter um vizinho de
   nome contido nela */
pessoaAntiga('André Gomes').areas[0].bairros.push('Jacarepaguá');
declAntiga._divisores_de_cidade = [{
  municipio: 'Guarulhos', uf: 'SP', eixo: 'longitude', corte: -46.52224,
  oeste: 'Sérgio Caetano', leste: 'Renata Pessoa',
  caixa: { lat: [-23.56, -23.31], lng: [-46.63, -46.33] },
  porque: 'cópia do divisor de 09/09/26 para a suíte; não está no JSON real desde 15/10/26'
}];
const sint = roteadorSobre(declAntiga);
const quemSint = (cidade, bairro, la, lo) => primeiroNome(sint.rotearTerritorio(cidade, bairro,
  la === undefined ? null : la, lo === undefined ? null : lo));
const viaSint = (cidade, bairro) => {
  const r = sint.regraDoTerritorio(cidade, bairro, null, null);
  if (!r) return 'sem dono';
  if (r.sobraDeclarada) return 'sobra declarada';
  if (r.declarado) return 'declarado';
  return r.sobra ? 'sobra' : 'lista antiga';
};

/* A CÓPIA TEM DE SER OUTRA COISA. Se o truque do cache falhar em silêncio, `sint` seria o
   roteador real e as checagens abaixo comparariam o real com ele mesmo. */
conferir('a declaração sintética carregou de fato, e o roteador real ficou intacto',
  sint !== terr && (sint.DIVISORES || []).length === 1 && (terr.DIVISORES || []).length === 0
  && quemSint('guarulhos', 'vila augusta') === 'Sérgio' && quem('guarulhos', 'vila augusta') === null
  && require(path.join(raiz, 'lib', 'territorios.js')) === terr,
  'sem isso as checagens da declaração sintética mediriam o dado real e passariam por vacuidade');

/* ── 1 · NENHUM ID FALSO SAI DAQUI ───────────────────────────────────────────────────
   É o defeito mais silencioso dos três: o lead entra, tem dono no papel, e o dono não
   existe. Ele não aparece na Daily de ninguém nem como conta alvo no Expogo. */
const amostra = [
  ['rio de janeiro', 'copacabana'], ['rio de janeiro', 'olaria'], ['rio de janeiro', 'tijuca'],
  ['rio de janeiro', 'bairro que nao existe'], ['sao paulo', 'mooca'], ['sao paulo', 'santana'],
  ['sao paulo', 'bairro que nao existe'], ['guarulhos', 'centro'], ['duque de caxias', 'centro']
];
const comPlaceholder = amostra.filter(function (c) {
  const d = terr.rotearTerritorio(c[0], c[1], null, null);
  return d && String(d).startsWith('pendente_');
});
conferir('nenhum roteamento devolve id de espera',
  comPlaceholder.length === 0,
  'placeholder em: ' + comPlaceholder.map(c => c.join('/')).join(', ')
    + ' — lead com id falso não aparece na Daily de ninguém e ninguém descobre por quê');

/* TESTA O FILTRO, não só o resultado. A primeira versão só olhava se as regras de hoje
   têm id — e como TODOS os declarados têm, ela ficava verde mesmo quando eu removia o
   filtro. Sabotagem que passa é guarda que mede nada. */
const fonteRoteador = require('fs').readFileSync(path.join(raiz, 'lib', 'territorios.js'), 'utf8');
conferir('e nenhuma regra declarada nasce sem id',
  (terr.DECLARADOS || []).every(r => r.owner && !String(r.owner).startsWith('pendente_')) &&
  /return regras\.filter\(function \(r\) \{ return !!r\.owner; \}\);/.test(fonteRoteador),
  'regra sem id de gente real é pior que ausência de regra: ela captura o lead e o esconde');

conferir('todo executivo declarado e ativo tem id no roteador',
  (decl.territorios || []).filter(x => x && x.ativo !== false && (x.areas || []).length)
    .every(x => (terr.DECLARADOS || []).some(r => r.nome === x.rep)),
  'quem tem rota declarada e não aparece aqui recebe lead de ninguém');

/* ── 2 · AS NOVE CIDADES NOVAS TÊM DONO ─────────────────────────────────────────────── */
/* 15/10/26: território refeito pelo Julyan — "o resto podemos apagar, vamos buscar só a
   partir desses lugares". Guarulhos saiu da rota dos dois (era Sérgio a oeste, Renata a
   leste) e não foi para ninguém. Sem dono e VISÍVEL, nunca com o dono antigo. */
conferir('Guarulhos ficou sem dono, nas duas metades',
  quem('guarulhos', 'vila augusta') === null && quem('guarulhos', 'macedo') === null
  && quem('guarulhos', 'jardim cumbica') === null,
  'Guarulhos saiu da rota em 15/10; lead de lá com dono seria carga para quem não anda mais ali');

/* 11/09/26, Julyan: "do Luiz Pimentel, coloca só nova iguaçu por enquanto". As outras
   quatro cidades da Baixada saíram do território dele e não foram para ninguém — saem
   também da busca semanal, porque ela lê os municípios deste mesmo arquivo. O bloco
   inteiro (com os 94 bairros do Rio) está em _fora_de_rota_historico, para voltar num
   colar só quando ele quiser. */
/* 02/10/26: o Luiz saiu do time e o Julyan decidiu deixar o território SEM DONO até
   atribuir (territorios.json, ativo:false). Nova Iguaçu passa a cair em ninguém. */
conferir('Nova Iguaçu fica sem dono com a saída do Luiz, e o resto da Baixada segue fora da rota',
  quem('nova iguacu', 'centro') === null
  && ['duque de caxias', 'sao joao de meriti', 'nilopolis', 'mesquita']
    .every(c => quem(c, 'centro') === null),
  'território de quem saiu não pode cair em ninguém sozinho: é o gestor que atribui');

/* 15/10/26: território refeito pelo Julyan. A Renata ficou só com o Centro de São Paulo;
   o Alto Tietê, que era dela inteiro, ficou sem dono. */
conferir('o Alto Tietê ficou sem dono',
  ['mogi das cruzes', 'suzano', 'salesopolis', 'biritiba mirim']
    .every(c => quem(c, 'centro') === null),
  'a Renata saiu do Alto Tietê em 15/10; o lead de lá não pode continuar caindo na carteira dela');

/* ── 3 · A DECLARAÇÃO GANHA DAS LISTAS ANTIGAS ──────────────────────────────────────
   As três trocas de hoje, uma a uma. Sem a precedência, o lead ia para quem saiu da zona. */
/* 05/10/26: a rota do Sandro trocou de Zona Sul para Vila Valqueire, Cascadura, Méier, Engenho
   de Dentro, Piedade, Abolição e Madureira. Copacabana deixou de ter dono; Madureira prova a mesma
   coisa (estava na lista antiga do Luiz e a declaração a dá ao Sandro). */
/* 15/10/26: território refeito pelo Julyan. O Sandro ficou só com Vila Valqueire e
   Méier; Madureira saiu da rota dele e ficou sem dono — e a lista antiga (que a dava ao
   Luiz) não a reassume. Méier prova a precedência: está na declaração do Sandro. */
conferir('Méier e Vila Valqueire são do Sandro, e Madureira saiu da rota dele',
  quem('rio de janeiro', 'meier') === 'Sandro' && via('rio de janeiro', 'meier') === 'declarado'
  && quem('rio de janeiro', 'vila valqueire') === 'Sandro'
  && quem('rio de janeiro', 'madureira') === null,
  'a rota do Sandro de 15/10 é Vila Valqueire e Méier; Madureira com dono seria a rota velha ou a lista antiga decidindo');

/* Cachambi era do Luiz por declaração; com ele fora do Rio, ela não é de ninguém — e
   NÃO PODE voltar para o Sandro pela lista de 01/09, que é o mapa antigo. É isto que
   esta checagem protege agora: a lista velha não reassume o bairro órfão. */
conferir('Cachambi ficou sem dono, e a lista antiga não a reassume',
  quem('rio de janeiro', 'cachambi') === null,
  'a lista de 01/09 a dava ao Sandro; deixá-la reassumir poria o lead na carteira de quem não pediu');

/* 15/10/26: território refeito pelo Julyan. A Grande Tijuca saiu do Bruno e ficou sem
   dono. */
conferir('a Grande Tijuca ficou sem dono',
  quem('rio de janeiro', 'tijuca') === null && quem('rio de janeiro', 'vila isabel') === null,
  'o Bruno ficou só com Taquara e Freguesia (Jacarepaguá) em 15/10; Tijuca com dono seria a rota velha');

/* 15/10/26: território refeito pelo Julyan. O André ficou SÓ com Anil e Barra Olímpica
   (o eixo sudoeste inteiro saiu). Anil também prova a precedência: a lista antiga de
   01/09 o dá ao Bruno. */
conferir('Anil e Barra Olímpica são do André, e só eles',
  quem('rio de janeiro', 'anil') === 'André' && via('rio de janeiro', 'anil') === 'declarado'
  && quem('rio de janeiro', 'barra olimpica') === 'André'
  && quem('rio de janeiro', 'recreio dos bandeirantes') === null,
  'a rota do André de 15/10 é Anil e Barra Olímpica; o Recreio com dono seria a rota velha');

/* ── FREGUESIA E BARRA DA TIJUCA SÃO DO BRUNO ───────────────────────────────────────
   Julyan em 09/09, corrigindo: "FREGUESIA NO RIO DE JANEIRO É DO BRUNO, NAO DO ANDRE!!
   bruno: taquara, freguesia e barra da tijuca!!!". A lista que ele mesmo ditou para o
   André meia hora antes incluía "freguesia" — a correção é posterior e vence. */
/* 15/10/26: território refeito pelo Julyan. Taquara e Freguesia (Jacarepaguá) seguem
   do Bruno; a Barra da Tijuca saiu e ficou sem dono. */
conferir('Taquara e Freguesia (Jacarepaguá) são do Bruno, e a Barra da Tijuca ficou sem dono',
  quem('rio de janeiro', 'taquara') === 'Bruno'
  && quem('rio de janeiro', 'freguesia (jacarepagua)') === 'Bruno'
  && quem('rio de janeiro', 'barra da tijuca') === null,
  'a rota do Bruno de 15/10 é Taquara e Freguesia (Jacarepaguá); a Barra com dono seria a rota velha');

/* ══ FREGUESIA É DOIS BAIRROS COM O MESMO NOME ═══════════════════════════════════════
   Uma em Jacarepaguá (do Bruno) e uma na Ilha do Governador (do Luiz), a 30 km. MEDIDO no
   banco em 09/09: as duas existem no dado, grafadas "FREGUESIA (JACAREPAGUA)",
   "FREGUESIA (ILHA DO GOVERNADOR)" e "FREGUESIA (ILHA)". Casamento por trecho entrega as
   duas ao mesmo dono, e foi o que eu já paguei uma vez nesta base. */
/* A REGRA QUE IMPORTA AQUI NÃO É O DONO, É A DISTINÇÃO: Freguesia da Ilha e Freguesia de
   Jacarepaguá são dois bairros a 30 km, e casamento por trecho entrega os dois ao mesmo.
   Com o Luiz fora do Rio, a da Ilha ficou sem dono — e a de Jacarepaguá continua do
   Bruno. Se a distinção sumir, a da Ilha passa a cair no Bruno e a checagem reprova. */
conferir('a Freguesia da Ilha continua sendo outro bairro que a de Jacarepaguá',
  quem('rio de janeiro', 'freguesia (ilha do governador)') === null
  && quem('rio de janeiro', 'freguesia (ilha)') === null
  && quem('rio de janeiro', 'freguesia (jacarepagua)') === 'Bruno',
  'um nome, dois bairros, 30 km de distância — sem a distinção, a da Ilha cai no dono da outra');

/* ══ O BAIRRO QUE É SUFIXO DE OUTRO ══════════════════════════════════════════════════
   ESTE É O DEFEITO QUE PÔS 107 LEADS NA CARTEIRA ERRADA. "Barra da Tijuca" contém
   " tijuca " com espaço na frente: o casamento por trecho fazia o "Tijuca" do Bruno levar
   qualquer coisa terminada em Tijuca, e o `.find` entrega ao primeiro que casa — ou seja,
   a quem aparece antes no JSON. Mesma família do vila maria/vila mariana, no caso em que
   um bairro é o FIM do outro.

   HOJE OS DOIS SÃO DO BRUNO, então a checagem usa um par que NÃO é dele: Penha (do Luiz)
   e Penha Circular (do Luiz) provariam nada. Uso Jacarepaguá (André) contra
   Freguesia (Jacarepaguá) (Bruno) — se o casamento voltar a ser por trecho, a Freguesia
   cai no André pelo " jacarepagua " que está dentro do parêntese. */
/* 15/10/26: território refeito pelo Julyan. Ninguém tem mais "Jacarepaguá" sozinho, então
   o par Jacarepaguá (André) × Freguesia (Jacarepaguá) (Bruno) só existe na declaração
   sintética — e lá a checagem vai direto na regra do André, que tem de RECUSAR a
   Freguesia por si só (a ordem do JSON põe o Bruno antes e esconderia o defeito).
   No dado real, o mesmo defeito tem dois pares vivos: o Jacarepaguá sozinho não pode
   cair no Bruno pelo parêntese dele, e Brasilândia (Sérgio) começa com "Brás" (Fabio) —
   e o Fabio vem ANTES do Sérgio no JSON, então casamento por trecho a entregaria a ele. */
const regraAndreSint = (sint.DECLARADOS || []).find(r =>
  r.nome === 'André Gomes' && r.cidade === 'rio de janeiro' && !r.sobraDeclarada);
conferir('bairro não casa por pedaço do nome de outro',
  quem('rio de janeiro', 'freguesia (jacarepagua)') === 'Bruno'
  && quem('rio de janeiro', 'jacarepagua') === null
  && quem('sao paulo', 'brasilandia') === 'Sérgio' && quem('sao paulo', 'bras') === 'Fabio'
  && quemSint('rio de janeiro', 'jacarepagua') === 'André'
  && quemSint('rio de janeiro', 'freguesia (jacarepagua)') === 'Bruno'
  && !!regraAndreSint && regraAndreSint.teste('rio de janeiro jacarepagua') === true
  && regraAndreSint.teste('rio de janeiro freguesia (jacarepagua)') === false,
  'por trecho, a Freguesia (Jacarepaguá) cairia em quem tem "jacarepagua", e a Brasilândia no Fabio pelo "bras"');

/* ══ O BAIRRO DENTRO DO CAMPO SUJO ═══════════════════════════════════════════════════
   MEDIDO: a coluna `bairro` carrega endereço com o bairro no fim — "Lj B - Tijuca",
   "Loja A B C D - Barra da Tijuca", "SUC 0028 - Tijuca". Comparar a string inteira faria
   nenhum deles casar, e são 14 leads só no Rio. */
/* O terceiro exemplo era "Lj D - Rio Comprido" (do Luiz). Rio Comprido saiu com ele em
   11/09; troquei por Copacabana, que tem dono e prova a mesma coisa: o que vem depois do
   último " - " é o bairro. */
/* 15/10/26: território refeito pelo Julyan. Tijuca, Barra da Tijuca e Madureira ficaram
   sem dono; os três exemplos agora são bairros da rota nova, um de cada dono do Rio. */
conferir('o bairro é extraído do endereço grudado',
  quem('rio de janeiro', 'Lj B - Taquara') === 'Bruno'
  && quem('rio de janeiro', 'Loja A B C D - Barra Olimpica') === 'André'
  && quem('rio de janeiro', 'Lj D - Meier') === 'Sandro',
  'o que vem depois do último " - " é o bairro; o resto é número de loja');

/* ══ O EXTREMO OESTE SAIU DE NOVO, AGORA SEM FORA-DE-ROTA ════════════════════════════
   Em 08/09 ele disse "zona oeste no momento nao precisa"; em 09/09, "nao deixa sem dono",
   e a zona foi para o André. 15/10/26: território refeito pelo Julyan — o André ficou só
   com Anil e Barra Olímpica, e Campo Grande, Bangu e Santa Cruz ficaram SEM DONO (não
   em _fora_de_rota: estão fora da rota de todo mundo, visíveis como órfãos). */
conferir('o extremo oeste ficou sem dono',
  quem('rio de janeiro', 'campo grande') === null
  && quem('rio de janeiro', 'bangu') === null
  && quem('rio de janeiro', 'santa cruz') === null,
  'a rota do André de 15/10 não tem a Zona Oeste; lead de lá com dono seria a rota de 09/09 decidindo');

conferir('e o mecanismo de fora-de-rota continua vivo, só vazio',
  Array.isArray(terr.FORA_DE_ROTA) && typeof terr.estaForaDeRota === 'function',
  'ele revogou a zona, não o direito de tirar uma zona da rota — se quiser de novo, é uma '
  + 'linha em _fora_de_rota, sem deploy');

/* ── 4 · A COBERTURA ANTIGA NÃO FOI PERDIDA ─────────────────────────────────────────── */
/* ══ ESTA DECISÃO MUDOU EM 09/09, E O MOTIVO FOI MEDIÇÃO DELE ════════════════════════
   "hoje na aba planejhamento deles está puxando os leads errados."

   As listas largas de 01/09 dizem "André = Zona Sul e Centro" e "Bruno = Jacarepaguá e
   Zona Oeste" — o INVERSO do mapa que ele ditou depois. Elas eram cobertura para bairro
   que ele não tinha nomeado; quando ele nomeou bairro em todas as praças do Rio,
   "cobertura" virou "atribuição errada com cara de regra". Provado antes do conserto:
     CENTRO       -> André  (regra "RJ · Zona Sul e Centro", de quando ele era da Zona Sul)
     OLARIA       -> Luiz   (regra "RJ · Zona Norte e Ilha")
     CAMPO GRANDE -> Bruno  (regra "RJ · Jacarepaguá e Zona Oeste")
   E o resultado no banco: 107 leads de Copacabana, Botafogo e Centro na carteira do André,
   que trabalha na Barra.

   E A GUARDA ANTIGA ESTAVA COM O NÚMERO ERRADO. Ela dizia "apagar as listas jogaria a
   MAIOR PARTE do Rio na sobra". Medido nos 553 leads do Rio depois do conserto: 553 têm
   dono e ZERO ficam sem. Eu tinha SUPOSTO a magnitude em vez de medi-la, e a suposição
   sustentou a decisão errada por um dia. */
conferir('numa cidade com bairro nomeado, as listas antigas não decidem mais',
  via('rio de janeiro', 'centro') !== 'lista antiga'
  && via('rio de janeiro', 'olaria') !== 'lista antiga',
  'elas são o mapa de 01/09 e dizem o inverso do de hoje — foi o que pôs 107 leads na carteira errada');

/* ══ NADA SEM DONO — E ISSO É REGRA, NÃO LISTA COMPLETA ══════════════════════════════
   Julyan em 09/09: "nao deixa sem dono". O Rio tem 163 bairros oficiais e o dado real traz
   grafia livre, inclusive endereço puro no lugar do bairro ("Av. Lúcio Costa",
   "R. Des. Izidro" — 14 casos medidos). Enquanto a garantia dependesse de eu ter listado
   tudo, ela era promessa. `sobraDoMunicipio: true` na área do Luiz a torna regra. */
/* ══ "NAO DEIXA SEM DONO" (Julyan, 09/09) × "SÓ NOVA IGUAÇU" (Julyan, 11/09) ═══════
   As duas frases são dele e hoje elas se cruzam: a sobra do Rio era do Luiz, e o Luiz
   saiu do Rio. Quem herda o resto de uma cidade é decisão DELE — o código escolhendo
   sozinho escolhe pela ordem do laço, ou seja por acidente.

   Então esta checagem não afirma um herdeiro nem finge que o buraco não existe: ela
   EXIGE que toda cidade sem herdeiro esteja nesta lista, com data e motivo. Cidade que
   perder o dono e não for declarada aqui reprova — que é o alarme que eu quero. */
const SEM_HERDEIRO_DECLARADO = [
  { cidade: 'rio de janeiro',
    desde: '11/09/2026',
    porque: 'a sobra era do Luiz e ele passou a cobrir só Nova Iguaçu. Bruno, André e '
      + 'Sandro continuam com os bairros nomeados deles; os 94 do Luiz e qualquer bairro '
      + 'novo ficam SEM DONO e visíveis na aba Rotas (card de território órfão), onde o '
      + 'Julyan distribui. Uma linha em territorios.json fecha isso quando ele decidir.' }
];
conferir('cidade sem herdeiro para o bairro não nomeado está declarada',
  (function () {
    const semDono = quem('rio de janeiro', 'um bairro inventado qualquer') === null;
    const declarada = SEM_HERDEIRO_DECLARADO.some(x => x.cidade === 'rio de janeiro');
    /* ou tem herdeiro, ou está declarada — nunca as duas nem nenhuma */
    return semDono === declarada;
  }()),
  'cidade que perdeu o dono da sobra sem ser declarada aqui esconde a consequência de uma '
  + 'troca de território; e declarar uma que TEM dono deixa a lista mentir ao contrário');

/* 15/10/26: território refeito pelo Julyan. Nenhuma cidade real tem mais sobra escolhida
   a dedo (`sobraDoMunicipio`), então a regra é medida na declaração sintética, onde o
   Bruno leva a sobra do Rio como o Luiz levava: o bairro inventado cai nele, e os
   bairros NOMEADOS do André e do Sandro continuam deles. */
conferir('e a sobra NÃO atropela o bairro nomeado de ninguém',
  (sint.SOBRAS_DE_MUNICIPIO || []).some(s => s.nome === 'Bruno Martins' && s.cidade === 'rio de janeiro')
  && quemSint('rio de janeiro', 'um bairro inventado qualquer') === 'Bruno'
  && quemSint('rio de janeiro', 'meier') === 'Sandro'
  && quemSint('rio de janeiro', 'anil') === 'André'
  && quemSint('rio de janeiro', 'taquara') === 'Bruno',
  'se a sobra entrasse antes do bairro nomeado, o dono dela levaria a cidade inteira');

conferir('a sobra é declarada no JSON, não escolhida pelo código',
  Array.isArray(terr.SOBRAS_DE_MUNICIPIO)
  && terr.SOBRAS_DE_MUNICIPIO.every(s => !!s.nome && !!s.cidade),
  'quem herda o resto de uma cidade é decisão do Julyan; código que escolhe sozinho escolhe '
  + 'pela ordem do laço, ou seja por acidente');

/* A COBERTURA CONTINUA VALENDO ONDE ELE NÃO DETALHOU: Vila Velha, Vitória, Canoas e Porto
   Alegre são declaradas por MUNICÍPIO inteiro e ali nada mudou. Sem esta checagem, o
   conserto do Rio teria orfanado o ES e o RS de calado. */
/* CANOAS (15/10/26): saiu da declaração da Kelly — o território refeito pelo Julyan não
   a tem. Ela ainda responde "Kelly" pela LISTA ANTIGA de 01/09 em lib/territorios.js
   (Canoas não é cidade com bairro declarado, então as listas largas ainda valem lá). A
   busca semanal não traz mais Canoas; só lead entrado à mão cai neste fallback. A
   checagem crava o comportamento ATUAL para que uma mudança nele seja vista — se o
   Julyan quiser Canoas sem dono, o conserto é na lista antiga, não aqui. */
conferir('a praça declarada por município inteiro não foi afetada',
  quem('vila velha', 'praia da costa') === 'Marco'
  && quem('vitoria', 'jardim da penha') === 'Marco'
  && quem('canoas', 'um bairro qualquer de canoas') === 'Kelly'
  && via('canoas', 'um bairro qualquer de canoas') === 'lista antiga',
  'o corte é só onde ele nomeou BAIRRO; município inteiro continua respondendo por tudo');

/* A GARANTIA CONTINUA ONDE ELA PODE EXISTIR. 15/10/26: território refeito pelo Julyan —
   Mogi das Cruzes (Renata) saiu da rota. No dado real, a cidade de um dono só agora é
   declarada por MUNICÍPIO INTEIRO (Porto Alegre da Kelly, Vila Velha e Vitória do
   Marco), e o bairro inventado cai no dono pela regra de município inteiro. A sobra
   automática da cidade de um dono só declarado por BAIRRO não tem caso real e é medida
   na declaração sintética (Suzano, Renata, só "Centro" nomeado). */
conferir('e a sobra do município continua existindo onde há um dono só',
  quem('porto alegre', 'um bairro inventado qualquer') === 'Kelly'
  && quem('vila velha', 'um bairro inventado qualquer') === 'Marco'
  && quem('vitoria', 'um bairro inventado qualquer') === 'Marco'
  && quemSint('suzano', 'um bairro inventado qualquer') === 'Renata',
  'bairro novo sem regra tem que cair em alguém conhecido, senão fica invisível para sempre');

/* ── 5 · O CASAMENTO É POR BORDA DE PALAVRA ─────────────────────────────────────────
   Mesmo defeito que a derivação das sub-cotas do backfill pegou hoje: 'vila mariana'
   caindo em quem tem 'Vila Maria'. As duas são declaradas e são de pessoas diferentes. */
/* 15/10/26: território refeito pelo Julyan. A Vila Mariana saiu da Renata e ficou sem
   dono; a regra protegida continua: ela não pode cair no Sérgio, que tem a Vila Maria. */
conferir('Vila Maria é do Sérgio e Vila Mariana não cai nele',
  quem('sao paulo', 'vila maria') === 'Sérgio' && quem('sao paulo', 'vila mariana') === null,
  'substring manda as duas para o Sérgio, e ele recebe lead de um bairro que ninguém lhe deu');

/* E ISSO NÃO PODE DEPENDER DA ORDEM DA DECLARAÇÃO. Medido: com substring o par acima
   ACERTA por acidente, porque a Renata está declarada antes do Sérgio e a chave dela
   ('vila mariana') casa primeiro. Se alguém trocar a ordem das pessoas no JSON, o
   acidente desaparece. Então a checagem vai direto na regra do Sérgio e exige que ela
   RECUSE 'vila mariana' — isso é a borda de palavra, e não a sorte. */
const regraSergioSP = (terr.DECLARADOS || []).find(r =>
  r.nome === 'Sérgio Caetano' && r.cidade === 'sao paulo');
conferir('a regra do Sérgio recusa "vila mariana" por si só',
  !!regraSergioSP && regraSergioSP.teste('sao paulo vila mariana') === false
    && regraSergioSP.teste('sao paulo vila maria') === true,
  'sem borda de palavra a regra dele captura a rua da Renata, e a ordem do JSON é que decide quem perde');

/* ── 6 · A EXCLUSÃO DO RICARDO VALE ─────────────────────────────────────────────────── */
conferir('a Cidade Baixa é da Kelly, não do Ricardo',
  quem('porto alegre', 'cidade baixa') === 'Kelly' && quem('porto alegre', 'moinhos de vento') === 'Kelly',
  'foi o "só n pega cidade baixa" dele que definiu isso por exclusão');

/* ══ O RICARDO SAIU EM 19/09/26, E PORTO ALEGRE NÃO MUDOU DE DONO SOZINHA ══════════
   Ele cobria o município inteiro menos os três bairros da Kelly. Saiu por motivo
   pessoal e o território dele ficou com `ativo: false` em data/territorios.json.

   ESTA É A CHECAGEM QUE IMPORTA AGORA, e ela substitui a que dizia "o resto de Porto
   Alegre é do Ricardo": quando alguém sai, o território dele tem de ficar SEM DONO e
   VISÍVEL, nunca escorregar para o vizinho. A Kelly é a única outra pessoa em Porto
   Alegre; se a saída dele entregasse a cidade a ela, seria o Cockpit decidindo carga de
   trabalho no lugar do Julyan — e ela já tem 19 negócios abertos, 15 sem um toque. */
const regraRicardo = (terr.DECLARADOS || []).find(r =>
  r.nome === 'Ricardo Antunes' && r.cidade === 'porto alegre');
conferir('o território de quem saiu não é mais roteado',
  !regraRicardo,
  'territorio.ativo:false tem de tirar a regra do roteador; deixá-la viva mandaria lead '
    + 'para quem não entra mais no Cockpit');

/* E AQUI ESTÁ A CONSEQUÊNCIA QUE EU NÃO TINHA VISTO, cravada para ninguém a descobrir
   por acidente: com o Ricardo fora, a Kelly vira a ÚNICA dona declarada de Porto Alegre,
   e a regra da "sobra do município" (bloco 8, pedida pelo Julyan em 09/09 — "preciso que
   todos os executivos estejam com leads na carteira, todas as regiões") entrega a cidade
   INTEIRA para ela. Automaticamente, sem ninguém decidir.

   Eu escrevi a primeira versão desta checagem exigindo o contrário — "fica sem dono" — e
   ela reprovou. O código não está errado: a regra existe para que lead nenhum fique
   órfão. O que estava errado era eu achar que tirar alguém do time é uma operação sem
   efeito no território do vizinho. Fica a verdade medida, e o aviso vai para o Julyan. */
/* 15/10/26: território refeito pelo Julyan. O aviso acima foi respondido: Porto Alegre
   INTEIRA passou a ser da Kelly por DECLARAÇÃO (todoOMunicipio), não mais pela sobra
   automática. A checagem agora exige que venha da regra de município inteiro — se ela
   voltar a sair da sobra, alguém tirou o todoOMunicipio e a decisão dele sumiu. */
const regraKellyPOA = (terr.DECLARADOS || []).find(r =>
  r.nome === 'Kelly Travieso Di Domenico' && r.cidade === 'porto alegre');
conferir('Porto Alegre inteira é da Kelly, por declaração de município inteiro',
  quem('porto alegre', 'farroupilha') === 'Kelly'
    && quem('porto alegre', 'centro historico') === 'Kelly'
    && via('porto alegre', 'farroupilha') === 'declarado'
    && !!regraKellyPOA && regraKellyPOA.todoOMunicipioDeclarado === true,
  'a decisão de 15/10 é "Porto Alegre inteira para a Kelly" escrita no JSON; vir pela sobra '
    + 'automática quer dizer que a declaração voltou a ser por bairro');

conferir('e os três bairros que já eram dela continuam dela',
  quem('porto alegre', 'cidade baixa') === 'Kelly'
    && quem('porto alegre', 'moinhos de vento') === 'Kelly'
    && quem('porto alegre', 'auxiliadora') === 'Kelly',
  'a troca de bairro nomeado para município inteiro não pode encolher o que já era dela');

/* ── 7 · UMA FONTE SÓ ───────────────────────────────────────────────────────────────── */
conferir('o roteador lê data/territorios.json',
  (terr.DECLARADOS || []).length > 0,
  'era a quarta cópia da regra; sem ler a declaração ela volta a divergir na próxima rota nova');

/* 15/10/26: território refeito pelo Julyan. Madureira ficou sem dono; os dois casos
   agora são bairros em que a lista antiga de 01/09 diz OUTRA pessoa: Mooca (lista:
   Renata; declaração: Fabio) e Anil (lista: Bruno; declaração: André). */
conferir('e a declaração é consultada ANTES das listas antigas',
  via('sao paulo', 'mooca') === 'declarado' && quem('sao paulo', 'mooca') === 'Fabio'
  && via('rio de janeiro', 'anil') === 'declarado' && quem('rio de janeiro', 'anil') === 'André'
  && terr.TERRITORIOS.some(x => x.nome === 'Renata Pessoa' && !x.sobra && x.teste('sao paulo mooca'))
  && terr.TERRITORIOS.some(x => x.nome === 'Bruno Martins' && !x.sobra && x.teste('rio de janeiro anil')),
  'se a lista antiga vier primeiro, a decisão de hoje não chega ao lead');

/* ── 8 · A SOBRA DA CIDADE DE UM DONO SÓ (09/09/26) ─────────────────────────────────
   Julyan: "preciso que todos os executivos estejam com leads na carteira, todas as
   regiões". Medido: 301 leads sem dono nenhum, porque a rota é declarada por BAIRRO e a
   busca varre o MUNICÍPIO — Guarulhos 247 em 106 bairros que ninguém nomeou (a cidade
   tem ~140), Suzano 29, Mogi 19, Salesópolis 5. */
/* 15/10/26: território refeito pelo Julyan. O Alto Tietê saiu da rota e NENHUMA cidade
   real tem mais um dono só declarado por bairro — o dado real não gera nenhuma regra de
   sobra automática (a checagem abaixo exige isso, para o dia em que gerar ser visto).
   O mecanismo é medido na declaração sintética: Suzano com a Renata e só "Centro"
   nomeado, como era antes de 15/10. */
conferir("cidade com um dono só entrega a sobra a ele",
  !(terr.DECLARADOS || []).some(r => r.sobraDeclarada) &&
  quem("suzano", "jardim cacique") === null &&
  quemSint("suzano", "jardim cacique") === "Renata" &&
  viaSint("suzano", "jardim cacique") === "sobra declarada",
  "a Renata é a única pessoa que anda em Suzano na declaração sintética; bairro que ela não nomeou é dela de qualquer jeito");

/* O MECANISMO, E NÃO O RESULTADO. A primeira versão só comparava os dois roteamentos, e
   passava mesmo com o filtro removido — porque as regras de sobra entram no FIM do array
   e o .find() acha as nomeadas antes de qualquer jeito. O acerto vinha da ordem do push,
   não da regra. Então a checagem exige as DUAS garantias: o filtro no código e a sobra
   depois das nomeadas no array. */
/* 15/10/26: território refeito pelo Julyan — mesma checagem, sobre a declaração
   sintética (no dado real não há sobra para vir antes ou depois de nada). */
conferir("e o bairro NOMEADO ainda vem antes da sobra",
  viaSint("suzano", "centro") === "declarado" && viaSint("suzano", "jardim cacique") === "sobra declarada"
  && fonteRoteador.indexOf('!x.sobraDeclarada && cid.includes(x.cidade)') > -1
  && (sint.DECLARADOS || []).some(function (r) { return r.sobraDeclarada; })
  && (function () {
       const rs = sint.DECLARADOS || [];
       const primeiraSobra = rs.findIndex(function (r) { return r.sobraDeclarada; });
       const ultimaNomeada = rs.reduce(function (a, r, i) { return r.sobraDeclarada ? a : i; }, -1);
       return primeiraSobra === -1 || primeiraSobra > ultimaNomeada;
     }()),
  "consultar a sobra primeiro faria a cidade inteira cair no primeiro dono mesmo onde outro tem bairro nomeado");

/* E A CIDADE DE DOIS DONOS NÃO GANHA SOBRA AUTOMÁTICA. Dividir 247 leads em 106 bairros
   entre a Renata e o Sérgio é decisão de território, e ela é do Julyan. Até ele dizer,
   aqueles leads ficam SEM DONO e visíveis na fila da praça, onde ele distribui — sem
   dono e visível é melhor que com dono errado. */
/* 15/10/26: território refeito pelo Julyan. Guarulhos saiu da rota; no dado real as
   cidades de mais de um dono são o Rio e São Paulo (três cada) — bairro que ninguém
   nomeou lá fica sem dono. Guarulhos de dois donos continua medida na sintética, sem
   coordenada (com coordenada, quem decide é o meridiano do bloco 9). */
conferir("cidade com dois donos NÃO ganha sobra automática",
  quem("sao paulo", "bairro que nao existe") === null &&
  quem("rio de janeiro", "bairro que nao existe") === null &&
  !quemSint("guarulhos", "jardim cumbica"),
  "escolher entre dois ou três executivos para o bairro que ninguém nomeou é decisão de território, não de código");

conferir("e os bairros nomeados de Guarulhos continuam certos",
  quemSint("guarulhos", "vila augusta") === "Sérgio" && quemSint("guarulhos", "macedo") === "Renata",
  "a sobra não pode atropelar quem nomeou o bairro");

/* ── 9 · A CIDADE DIVIDIDA POR MERIDIANO (09/09/26) ─────────────────────────────────
   Julyan: "pode dividir de acordo com a proximidade dos bairros... ja pode colocar que
   vou importar tudo". Guarulhos tem DOIS donos e ~140 bairros, dos quais 18 nomeados —
   sem esta regra, 83% do que a busca traz volta a cair sem dono na próxima importação.

   NÃO usei donoPorProximidade, que já existia: MEDIDO, os centróides dos dois estão a
   1,8 km um do outro e os órfãos a ~12 km de ambos. Proximidade a centróides colados é
   moeda ao ar com cara de critério. O eixo vem de onde cada um já trabalha (Sérgio a
   oeste, Renata a leste) e o corte é a mediana dos órfãos, que equilibra 154 x 145. */
/* 15/10/26: território refeito pelo Julyan. Guarulhos saiu da rota e
   `_divisores_de_cidade` ficou VAZIO: no dado real não há meridiano nenhum, e a primeira
   checagem abaixo crava isso (com coordenada, Guarulhos e São Paulo não ganham dono por
   corte). As regras do meridiano continuam medidas na declaração sintética, com o
   divisor de Guarulhos de 09/09 recolocado — é o que volta a valer se ele reescrever um. */
const q = function (c, b, la, lo) { return primeiroNome(terr.rotearTerritorio(c, b, la, lo)); };
const qs = function (c, b, la, lo) { return primeiroNome(sint.rotearTerritorio(c, b, la, lo)); };

conferir("no dado real não há divisor de cidade, e a coordenada não inventa dono",
  Array.isArray(decl._divisores_de_cidade) && decl._divisores_de_cidade.length === 0 &&
  (terr.DIVISORES || []).length === 0 &&
  q("guarulhos", "jardim cumbica", -23.43, -46.45) === null &&
  q("guarulhos", "vila rosalia", -23.46, -46.55) === null &&
  q("sao paulo", "vila mariana", -23.59, -46.63) === null &&
  terr.donoPorMeridiano("sao paulo", -23.55, -46.60) === null,
  "Guarulhos saiu da rota em 15/10; um meridiano sobrando daria a cidade de volta a quem não anda mais lá");

conferir("bairro NOMEADO ganha do meridiano",
  qs("guarulhos", "vila augusta", -23.45, -46.50) === "Sérgio" &&
  qs("guarulhos", "macedo", -23.47, -46.56) === "Renata",
  "quem nomeou a rua manda; o meridiano é para o bairro que ninguém nomeou");

conferir("e bairro novo cai pelo lado do meridiano",
  qs("guarulhos", "jardim cumbica", -23.43, -46.45) === "Renata" &&
  qs("guarulhos", "vila rosalia", -23.46, -46.55) === "Sérgio",
  "sem isso a próxima importação de uma cidade dividida volta a ser 83% de lead sem dono");

/* A COORDENADA MENTIROSA NÃO DECIDE TERRITÓRIO. Medido: 38 dos 247 leads de Guarulhos
   tinham ponto entre -51,4 e -45,6 de longitude, para uma cidade de 30 km — o
   geocodificador falha e devolve outra cidade, às vezes outro estado. */
conferir("ponto fora da caixa da cidade não decide nada",
  !qs("guarulhos", "bairro x", -24.2, -51.4) && !qs("guarulhos", "bairro y", null, null),
  "coordenada de outro estado escolhendo dono é o pior caso: o lead entra com dono errado e ninguém percebe");

/* 15/10/26: território refeito pelo Julyan. A Vila Mariana ficou sem dono em São Paulo,
   então o vazamento agora apareceria como DONO onde não há nenhum: com ponto dos dois
   lados do corte de Guarulhos (-46,50 leste, -46,63 oeste) ela tem de continuar sem
   dono. Mooca segue do Fabio. */
conferir("e o divisor não vaza para outras cidades",
  qs("sao paulo", "vila mariana", -23.50, -46.50) === null &&
  qs("sao paulo", "vila mariana", -23.59, -46.63) === null &&
  /^Fabio/.test(qs("sao paulo", "mooca", -23.55, -46.60) || "") &&
  qs("suzano", "jardim cacique", null, null) === "Renata" &&
  qs("guarulhos", "vila augusta", -23.55, -46.60) === "Sérgio",
  "o meridiano de Guarulhos aplicado em São Paulo cortaria a cidade errada");

/* 15/10/26: território refeito pelo Julyan. Sem divisor no dado real, "mora na
   declaração" se mede de dois lados: o roteador real tem exatamente o que o JSON tem
   (zero), o sintético tem o que a cópia tem (um, com o porquê) — e a fonte do roteador
   não traz o corte de 09/09 cravado nem deixa de ler _divisores_de_cidade. */
conferir("o divisor mora na declaração, não cravado no código",
  (terr.DIVISORES || []).length === (decl._divisores_de_cidade || []).length &&
  (sint.DIVISORES || []).length === 1 &&
  (sint.DIVISORES || []).every(function (d) { return d.municipio && d.corte && d.oeste && d.leste && d.caixa && d.porque; }) &&
  /_divisores_de_cidade/.test(fonteRoteador) && fonteRoteador.indexOf('46.52224') === -1 &&
  fonteRoteador.indexOf('46,52224') === -1,
  "divisor sem o porque escrito é numero que ninguem sabe de onde veio");

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('roteador do import: ' + ok + ' checagens ok — a rota de 15/10 chega ao lead, a'
  + ' declaração ganha das listas antigas, e nenhum id de espera sai daqui.');
