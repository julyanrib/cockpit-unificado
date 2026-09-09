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
conferir('Guarulhos routeia, e para as duas metades certas',
  quem('guarulhos', 'vila augusta') === 'Sérgio' && quem('guarulhos', 'macedo') === 'Renata',
  'Guarulhos tem 14.172 CNPJs food e zero conta no CRM; sem dono o lead entra e desaparece');

conferir('a Baixada inteira vai para o Luiz',
  ['duque de caxias', 'sao joao de meriti', 'nilopolis', 'mesquita']
    .every(c => quem(c, 'centro') === 'Luiz'),
  'foram declarados como município inteiro porque o Julyan não nomeou bairro ali');

conferir('o Alto Tietê vai para a Renata',
  ['mogi das cruzes', 'suzano', 'salesopolis', 'biritiba mirim']
    .every(c => quem(c, 'centro') === 'Renata'),
  'cinco municípios que nunca foram buscados por ninguém antes de 09/09');

/* ── 3 · A DECLARAÇÃO GANHA DAS LISTAS ANTIGAS ──────────────────────────────────────
   As três trocas de hoje, uma a uma. Sem a precedência, o lead ia para quem saiu da zona. */
conferir('Copacabana é do Sandro, que mudou para a Zona Sul',
  quem('rio de janeiro', 'copacabana') === 'Sandro' && via('rio de janeiro', 'copacabana') === 'declarado',
  'a lista antiga a dava ao André, que saiu da Zona Sul hoje');

conferir('Cachambi é do Luiz',
  quem('rio de janeiro', 'cachambi') === 'Luiz' && via('rio de janeiro', 'cachambi') === 'declarado',
  'a lista antiga a dava ao Sandro, junto com a Grande Tijuca que ele deixou');

conferir('a Grande Tijuca é do Bruno',
  quem('rio de janeiro', 'tijuca') === 'Bruno' && quem('rio de janeiro', 'vila isabel') === 'Bruno',
  'era do Sandro até hoje; o Julyan passou para o Bruno junto com Taquara e região');

conferir('e Anil e Freguesia são do André',
  quem('rio de janeiro', 'anil') === 'André' && quem('rio de janeiro', 'freguesia') === 'André',
  'eram a sub-cota do Bruno; o André assumiu a parte de Jacarepaguá e Barra');

/* ── 4 · A COBERTURA ANTIGA NÃO FOI PERDIDA ─────────────────────────────────────────── */
conferir('bairro que o Julyan não citou continua com quem tinha',
  quem('rio de janeiro', 'olaria') === 'Luiz' && via('rio de janeiro', 'olaria') === 'lista antiga',
  'apagar as listas largas jogaria a maior parte do Rio na sobra — e mover bairro que ele não citou é decisão dele');

conferir('e a sobra do município continua existindo',
  !!quem('rio de janeiro', 'um bairro inventado qualquer'),
  'bairro novo sem regra tem que cair em alguém conhecido, senão fica invisível para sempre');

/* ── 5 · O CASAMENTO É POR BORDA DE PALAVRA ─────────────────────────────────────────
   Mesmo defeito que a derivação das sub-cotas do backfill pegou hoje: 'vila mariana'
   caindo em quem tem 'Vila Maria'. As duas são declaradas e são de pessoas diferentes. */
conferir('Vila Maria e Vila Mariana vão para pessoas diferentes',
  quem('sao paulo', 'vila maria') === 'Sérgio' && quem('sao paulo', 'vila mariana') === 'Renata',
  'substring manda as duas para o Sérgio e a Renata perde a rota dela em silêncio');

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

conferir('e o resto de Porto Alegre é do Ricardo',
  quem('porto alegre', 'farroupilha') === 'Ricardo' && quem('porto alegre', 'centro historico') === 'Ricardo',
  'ele é município inteiro menos os três da Kelly; sem a exceção funcionando, um dos dois perde a rua');

/* A EXCEÇÃO TAMBÉM É TESTADA NA REGRA, e não pela ordem. Medido: com o `exceto`
   desligado a Cidade Baixa AINDA cai na Kelly, porque as regras de bairro vêm antes das
   de município inteiro — o acerto vinha da ordem, não da exceção. Se um dia a Kelly sair
   de Porto Alegre, a Cidade Baixa passaria a ser do Ricardo sem ninguém decidir isso. */
const regraRicardo = (terr.DECLARADOS || []).find(r =>
  r.nome === 'Ricardo Antunes' && r.cidade === 'porto alegre');
conferir('a regra do Ricardo recusa a Cidade Baixa por si só',
  !!regraRicardo && regraRicardo.teste('porto alegre cidade baixa') === false
    && regraRicardo.teste('porto alegre farroupilha') === true,
  'o "só n pega cidade baixa" tem que estar NA REGRA dele, não depender de a Kelly vir antes na lista');

/* ── 7 · UMA FONTE SÓ ───────────────────────────────────────────────────────────────── */
conferir('o roteador lê data/territorios.json',
  (terr.DECLARADOS || []).length > 0,
  'era a quarta cópia da regra; sem ler a declaração ela volta a divergir na próxima rota nova');

conferir('e a declaração é consultada ANTES das listas antigas',
  via('rio de janeiro', 'copacabana') === 'declarado',
  'se a lista antiga vier primeiro, a decisão de hoje não chega ao lead');

/* ── 8 · A SOBRA DA CIDADE DE UM DONO SÓ (09/09/26) ─────────────────────────────────
   Julyan: "preciso que todos os executivos estejam com leads na carteira, todas as
   regiões". Medido: 301 leads sem dono nenhum, porque a rota é declarada por BAIRRO e a
   busca varre o MUNICÍPIO — Guarulhos 247 em 106 bairros que ninguém nomeou (a cidade
   tem ~140), Suzano 29, Mogi 19, Salesópolis 5. */
conferir("cidade com um dono só entrega a sobra a ele",
  quem("suzano", "jardim cacique") === "Renata" &&
  quem("mogi das cruzes", "jundiapeba") === "Renata" &&
  quem("salesopolis", "fartura") === "Renata",
  "a Renata é a única pessoa que anda nessas cidades; bairro que ela não nomeou é dela de qualquer jeito");

/* O MECANISMO, E NÃO O RESULTADO. A primeira versão só comparava os dois roteamentos, e
   passava mesmo com o filtro removido — porque as regras de sobra entram no FIM do array
   e o .find() acha as nomeadas antes de qualquer jeito. O acerto vinha da ordem do push,
   não da regra. Então a checagem exige as DUAS garantias: o filtro no código e a sobra
   depois das nomeadas no array. */
conferir("e o bairro NOMEADO ainda vem antes da sobra",
  via("suzano", "centro") === "declarado" && via("suzano", "jardim cacique") === "sobra declarada"
  && fonteRoteador.indexOf('!x.sobraDeclarada && cid.includes(x.cidade)') > -1
  && (function () {
       const rs = terr.DECLARADOS || [];
       const primeiraSobra = rs.findIndex(function (r) { return r.sobraDeclarada; });
       const ultimaNomeada = rs.reduce(function (a, r, i) { return r.sobraDeclarada ? a : i; }, -1);
       return primeiraSobra === -1 || primeiraSobra > ultimaNomeada;
     }()),
  "consultar a sobra primeiro faria a cidade inteira cair no primeiro dono mesmo onde outro tem bairro nomeado");

/* E A CIDADE DE DOIS DONOS NÃO GANHA SOBRA AUTOMÁTICA. Dividir 247 leads em 106 bairros
   entre a Renata e o Sérgio é decisão de território, e ela é do Julyan. Até ele dizer,
   aqueles leads ficam SEM DONO e visíveis na fila da praça, onde ele distribui — sem
   dono e visível é melhor que com dono errado. */
conferir("cidade com dois donos NÃO ganha sobra automática",
  !quem("guarulhos", "jardim cumbica"),
  "escolher entre a Renata e o Sérgio para 106 bairros é decisão de território, não de código");

conferir("e os bairros nomeados de Guarulhos continuam certos",
  quem("guarulhos", "vila augusta") === "Sérgio" && quem("guarulhos", "macedo") === "Renata",
  "a sobra não pode atropelar quem nomeou o bairro");

/* ── 9 · A CIDADE DIVIDIDA POR MERIDIANO (09/09/26) ─────────────────────────────────
   Julyan: "pode dividir de acordo com a proximidade dos bairros... ja pode colocar que
   vou importar tudo". Guarulhos tem DOIS donos e ~140 bairros, dos quais 18 nomeados —
   sem esta regra, 83% do que a busca traz volta a cair sem dono na próxima importação.

   NÃO usei donoPorProximidade, que já existia: MEDIDO, os centróides dos dois estão a
   1,8 km um do outro e os órfãos a ~12 km de ambos. Proximidade a centróides colados é
   moeda ao ar com cara de critério. O eixo vem de onde cada um já trabalha (Sérgio a
   oeste, Renata a leste) e o corte é a mediana dos órfãos, que equilibra 154 x 145. */
const q = function (c, b, la, lo) { return primeiroNome(terr.rotearTerritorio(c, b, la, lo)); };

conferir("bairro NOMEADO ganha do meridiano",
  q("guarulhos", "vila augusta", -23.45, -46.50) === "Sérgio" &&
  q("guarulhos", "macedo", -23.47, -46.56) === "Renata",
  "quem nomeou a rua manda; o meridiano é para o bairro que ninguém nomeou");

conferir("e bairro novo cai pelo lado do meridiano",
  q("guarulhos", "jardim cumbica", -23.43, -46.45) === "Renata" &&
  q("guarulhos", "vila rosalia", -23.46, -46.55) === "Sérgio",
  "sem isso a próxima importação de Guarulhos volta a ser 83% de lead sem dono");

/* A COORDENADA MENTIROSA NÃO DECIDE TERRITÓRIO. Medido: 38 dos 247 leads de Guarulhos
   tinham ponto entre -51,4 e -45,6 de longitude, para uma cidade de 30 km — o
   geocodificador falha e devolve outra cidade, às vezes outro estado. */
conferir("ponto fora da caixa da cidade não decide nada",
  !q("guarulhos", "bairro x", -24.2, -51.4) && !q("guarulhos", "bairro y", null, null),
  "coordenada de outro estado escolhendo dono é o pior caso: o lead entra com dono errado e ninguém percebe");

conferir("e o divisor não vaza para outras cidades",
  q("sao paulo", "mooca", -23.55, -46.60) === "Renata" &&
  q("suzano", "jardim cacique", null, null) === "Renata" &&
  q("guarulhos", "vila augusta", -23.55, -46.60) === "Sérgio",
  "o meridiano de Guarulhos aplicado em São Paulo cortaria a cidade errada");

conferir("o divisor mora na declaração, não cravado no código",
  (terr.DIVISORES || []).length > 0 &&
  (terr.DIVISORES || []).every(function (d) { return d.municipio && d.corte && d.oeste && d.leste && d.caixa && d.porque; }),
  "divisor sem o porque escrito é numero que ninguem sabe de onde veio");

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('roteador do import: ' + ok + ' checagens ok — as nove cidades novas têm dono, a'
  + ' declaração ganha das listas antigas, e nenhum id de espera sai daqui.');
