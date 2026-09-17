/* ══════════════════════════════════════════════════════════════════════════════════════
   AS NOTAS DO APP DE CAMPO — o que o PWA escreve e o que chegava ao cockpit (17/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "tudo o q os executivos fazem no pwa, vai algo pra hubspot? (follow, reunião,
   agendamento, etc) se sim, quero q o cockpit puxe tudo pra sincronizar tbm, se ele marcou
   follow up no pwa tem q ir pro cockpit deles esse dia".

   ══ MEDIDO NO HUBSPOT ANTES DE ESCREVER UMA LINHA ══════════════════════════════════
     · 492 tarefas "Visita - X" (check-in)             -> o robô JÁ buscava
     ·  62 notas "Follow Up - X / Agendado para: ..."  -> JÁ buscava, e o front JÁ punha
          no DIA PROMETIDO — provado com o texto real da nota 116599293440: escrita em
          09/09 08:48, cai na agenda em 09/09 14:00, dono resolvido pela assinatura
     · 275 notas "Negócio perdido — motivo: X"         -> o motivo também vive na
          propriedade `motivo_do_perdido` (66 mil negócios a têm), que o cockpit já lê
     · 281 notas de OBSERVAÇÃO LIVRE                   -> o buraco

   ══ O BURACO NÃO ERA FALTA DE CÓDIGO, ERA ORÇAMENTO DE CHAMADAS ════════════════════
   `buscarNotasDoLead` custava 1 chamada de associação + 1 por nota, com sleep(350) em
   cada. Por isso o robô só a chamava para ~74 leads de destaque: 222 chamadas e ~78s de
   espera, cobrindo uma fração do funil. Nos outros negócios a ficha abria SEM nada do que
   o executivo escreveu na rua — foi o que o Julyan viu quando 3 dos 15 negócios da etapa
   em que ele clicou não tinham registro nenhum.

   E ela cortava ERRADO: `.slice(0, limite)` na lista de ASSOCIAÇÕES, antes de ordenar por
   data. O comentário prometia "as 2 mais recentes"; o código pegava 2 em ordem arbitrária.
   Negócio com 5 notas podia mostrar a velha e esconder a nova — e "o último registro" é
   exatamente o que ele pediu para ver.

   A REDE NÃO É TOCADA AQUI: os dois buscadores entram por parâmetro e estas checagens
   usam dublês. Suíte que precisa do HUBSPOT_TOKEN (que vive só no GitHub Secrets) reprova
   por motivo que não é defeito nosso.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const fonte = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-hubspot.js'), 'utf8');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
function semProsa(txt) {
  return txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}
function corpoDe(txt, nome) {
  const i = txt.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let d = 0, j = i, viu = false;
  while (j < txt.length) {
    const c = txt[j];
    if (c === '{') { d++; viu = true; }
    else if (c === '}') { d--; if (viu && d === 0) return txt.slice(i, j + 1); }
    j++;
  }
  return '';
}

/* ══ O RECORTE: a função REAL do arquivo, rodada em vm ══════════════════════════════
   Recortar em vez de reimplementar: guarda que reescreve a regra mede a minha cópia e
   passa verde enquanto o original apodrece. */
const mFn = fonte.match(/const NOTAS_APP_POR_NEGOCIO = \d+;[\s\S]*?\nasync function buscarNotasDoAppEmLote[\s\S]*?\n\}/);
conferir('o buscador em lote existe, e o recorte acha',
  !!mFn,
  'sem o recorte as checagens abaixo medem um stub e passam sem medir nada');
if (!mFn) {
  console.log('FALHAS (' + falhas.length + '):');
  falhas.forEach(function (f) { console.log(f); });
  process.exit(1);
}

/* dublês: a busca devolve o que eu mandar, a associação idem */
function rodar(achadas, assoc) {
  const ctx = {
    console: { log: function () {} },
    hsSearchTipoAll: async function () { return achadas; },
    hsAssociacoesEmLote: async function (a, b, ids) {
      const m = {};
      ids.forEach(function (id) { if (assoc[id]) m[id] = assoc[id]; });
      return m;
    },
    String: String, Object: Object, Array: Array, Date: Date, Number: Number
  };
  vm.createContext(ctx);
  vm.runInContext(mFn[0] + '\nvar __p = buscarNotasDoAppEmLote(0, 1);', ctx);
  return ctx.__p;
}
const nota = function (id, texto, data) {
  return { id: String(id), properties: { hs_note_body: texto, hs_timestamp: data } };
};

(async function () {
  /* ── 1. A OBSERVAÇÃO LIVRE CHEGA, e é o que faltava ─────────────────────────────── */
  /* Texto REAL, da nota 116993669712 do HubSpot. */
  const umaSo = await rodar(
    [nota(1, 'Usa PDV legal e não tá satisfeito. Fazer contato no insta<br><br>— Bruno Martins (via App Outbound)', '2026-09-16T17:52:56Z')],
    { 1: '62660618019' });
  conferir('a observação livre do app chega ao negócio',
    !!(umaSo['62660618019'] && umaSo['62660618019'].length === 1),
    'são 281 das 618 notas do time, e é o que o executivo de fato escreveu na rua');
  conferir('o markup do HubSpot sai do texto',
    umaSo['62660618019'][0].texto === 'Usa PDV legal e não tá satisfeito. Fazer contato no insta — Bruno Martins (via App Outbound)',
    'a nota vem com <br> porque é o HubSpot que formata; a tela mostraria a tag literal');

  /* ── 2. AS TRÊS VARIEDADES ENTRAM, e não só a de follow-up ──────────────────────── */
  const tresTipos = await rodar([
    nota(1, 'Follow Up - Beco do Gato<br>Agendado para: 09/09/2026, 14:00<br>— Kelly (via App Outbound)', '2026-09-09T11:48:00Z'),
    nota(2, 'Negócio perdido — motivo: Sem retorno<br><br>— Sandro Brito (via App Outbound)', '2026-09-17T13:18:00Z'),
    nota(3, 'Margarida passou meu contato para o Rodrigo<br><br>— Sandro Brito (via App Outbound)', '2026-09-17T13:17:00Z')
  ], { 1: 'd1', 2: 'd1', 3: 'd1' });
  conferir('follow-up, perda e observação chegam juntos',
    (tresTipos.d1 || []).length === 3,
    'o filtro antigo era "Agendado para", que pegava SÓ o follow-up — 556 notas ficavam fora');

  /* ── 3. A ORDEM É POR DATA, E O CORTE VEM DEPOIS ────────────────────────────────── */
  /* O DEFEITO DA FUNÇÃO ANTIGA, virado checagem: ela cortava a lista de associações antes
     de ordenar. Aqui a nota mais nova é a ÚLTIMA da entrada, de propósito — se o corte
     acontecer antes da ordenação, ela desaparece. */
  const seis = [];
  for (let i = 1; i <= 6; i++) {
    seis.push(nota(i, 'obs ' + i + ' (via App Outbound)', '2026-09-0' + i + 'T10:00:00Z'));
  }
  const cortada = await rodar(seis, { 1: 'd1', 2: 'd1', 3: 'd1', 4: 'd1', 5: 'd1', 6: 'd1' });
  conferir('o teto por negócio é respeitado',
    (cortada.d1 || []).length === 5,
    'sem teto, um negócio muito tocado leva o snapshot de 1 MB sozinho');
  conferir('a nota MAIS RECENTE sobrevive ao corte',
    cortada.d1[0].texto.indexOf('obs 6') === 0,
    'era o defeito da função antiga: cortava as associações ANTES de ordenar por data');
  conferir('a mais antiga é a que cai fora',
    cortada.d1.every(function (n) { return n.texto.indexOf('obs 1') !== 0; }),
    'o corte tem de comer o fim da fila, nunca o começo');

  /* ── 4. NOTA SEM NEGÓCIO NÃO VIRA NOTA DE OUTRO ─────────────────────────────────── */
  const semDono = await rodar([
    nota(1, 'obs de ninguém (via App Outbound)', '2026-09-16T10:00:00Z'),
    nota(2, 'obs com dono (via App Outbound)', '2026-09-16T11:00:00Z')
  ], { 2: 'd1' });
  conferir('nota sem negócio associado é descartada, não adotada',
    Object.keys(semDono).length === 1 && semDono.d1.length === 1,
    'casar por nome aqui poria a observação de um restaurante na ficha de outro');

  /* ── 5. NADA DE EXPLODIR COM RESPOSTA VAZIA OU ESTRANHA ─────────────────────────── */
  const vazio = await rodar([], {});
  conferir('busca vazia devolve objeto vazio, sem lançar',
    vazio && Object.keys(vazio).length === 0,
    'exceção aqui derruba o robô inteiro e o cockpit congela sem erro na tela');
  const semTexto = await rodar([nota(1, '   ', '2026-09-16T10:00:00Z')], { 1: 'd1' });
  conferir('nota de corpo vazio não entra como registro',
    Object.keys(semTexto).length === 0,
    'linha em branco na ficha lê como "o executivo escreveu algo" quando não escreveu');

  /* ══ 6. O QUE O ROBÔ BUSCA, E PARA QUANTOS LEADS ═════════════════════════════════ */
  const semProsaFonte = semProsa(fonte);
  conferir('o filtro é a assinatura do app, não "Agendado para"',
    corpoDe(semProsaFonte, 'buscarNotasDoAppEmLote').indexOf('via App Outbound') > -1,
    '"Agendado para" pega só o follow-up e deixa 556 das 618 notas fora');
  conferir('as notas são aplicadas ao FUNIL INTEIRO',
    semProsaFonte.indexOf('...Object.values(funilLeads || {}).flat()') > -1,
    'o laço antigo cobria ~74 leads de destaque; nos outros a ficha abria sem registro');
  conferir('e em todo objeto que referencia o mesmo negócio',
    /todosOsLeads = \[[\s\S]{0,400}repsData[\s\S]{0,200}funilLeads/.test(semProsaFonte),
    'o mesmo lead existe como objetos separados em 4 listas: atribuir num só deixa a '
      + 'ficha com nota numa tela e sem nota na outra');
  /* A FUNÇÃO DE 3-CHAMADAS-POR-LEAD SAIU, e a guarda cobra isso: deixá-la declarada e
     sem chamador é deixar uma armadilha com o defeito do corte-antes-de-ordenar dentro. */
  conferir('a busca por lead, de 3 chamadas, não existe mais',
    fonte.indexOf('async function buscarNotasDoLead(') < 0,
    'órfã com defeito dentro é o que a próxima mão reusa sem saber');
  conferir('e a remoção deixou o motivo escrito',
    fonte.indexOf('`buscarNotasDoLead` FOI REMOVIDA') > -1,
    'quem for procurar por ela precisa achar o porquê, não um vazio');

  /* ══ 7. O FOLLOW-UP CONTINUA CAINDO NO DIA PROMETIDO ═════════════════════════════ */
  /* Era o pedido explícito — "se ele marcou follow up no pwa tem q ir pro cockpit deles
     esse dia" — e JÁ funcionava. Esta checagem existe para não parar de funcionar quando
     alguém mexer no parser: a data tem de sair do TEXTO ("Agendado para: ..."), nunca do
     `hs_timestamp`, que é quando a nota foi escrita. */
  /* SEM PROSA, E SEM `||` FROUXO. A primeira versão destas três aceitava "ou o comentário
     que explica, ou o código" — e o comentário fica no arquivo quando o código sai.
     Sabotei o `Date.UTC` por `agendaParaBRT(it.hs_timestamp)` (que é literalmente o
     defeito: o follow-up voltar a cair no dia em que foi escrito) e a checagem ficou
     VERDE, lendo a frase "SEM o desconto de 3h" que sobrou logo acima. Quarta vez hoje
     que a mesma cegueira aparece nesta base. */
  const parser = semProsa(corpoDe(tpl, 'agendaDoHubspotNota'));
  conferir('o follow-up lê a data prometida de dentro do texto',
    parser.indexOf('agendado\\s+para') > -1 && parser.indexOf('mData') > -1,
    'sem isso o compromisso cai no dia em que foi ESCRITO, não no dia prometido');
  conferir('e a data do corpo não leva o desconto de UTC',
    parser.indexOf('Date.UTC(+mData[3], +mData[2] - 1, +mData[1], +mData[4], +mData[5])') > -1
      && parser.indexOf('agendaParaBRT(it.hs_timestamp)') < 0,
    'o app grava horário local; descontar 3h joga o follow-up das 14h para as 11h — e ler '
      + 'o hs_timestamp joga para o dia em que a nota foi escrita');
  conferir('o dono sai da assinatura quando o HubSpot não manda',
    parser.indexOf('via\\s+app\\s+outbound') > -1 && /DATA\.reps\.find/.test(parser),
    'a nota do app chega SEM hubspot_owner_id; sem o rodapé assinado ela fica órfã');

  if (falhas.length) {
    console.log('FALHAS (' + falhas.length + '):');
    falhas.forEach(function (f) { console.log(f); });
    process.exit(1);
  }
  console.log('notas do app: ' + ok + ' checagens ok — as três variedades chegam, o funil '
    + 'inteiro é coberto, a mais recente sobrevive ao corte e o follow-up segue caindo no '
    + 'dia prometido.');
}());
