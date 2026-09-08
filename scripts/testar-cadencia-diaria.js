// scripts/testar-cadencia-diaria.js
//
// A CADÊNCIA DIÁRIA, TESTADA COM O CÓDIGO DE PRODUÇÃO (08/09/26).
//
// A cadência (atividade por executivo por dia útil) alimenta o sparkline do cartão e o
// heatmap do time na aba Time v2 — e é a leitura que o gestor usa para dizer "a régua
// estoura porque o dia zera". Errar nela é cobrar a pessoa errada na frente do time.
//
// COMO FUNCIONA: `fetchCadenciaDiaria` vive em scripts/fetch-hubspot.js, que executa
// main() ao ser carregado (não dá para `require`). Então este teste RECORTA a função do
// arquivo, junto das duas auxiliares de data, e roda em `vm` com o entorno mínimo. É o
// código de produção, não uma cópia — o mesmo caminho de testar-nucleo.js.
//
// AS QUATRO ARMADILHAS QUE ELE GUARDA, e as quatro doem em silêncio:
//   1. a NOTA sem dono. 63 das 528 atividades da janela (12%) são notas do App Outbound,
//      que chegam sem hubspot_owner_id — o dono sai da associação com o negócio
//      (lead_owner_id). Perder essa linha tira um oitavo da cadência do time e ninguém vê.
//   2. dia de FIM DE SEMANA caindo em coluna de dia útil. A janela é de 10 dias úteis;
//      atividade de sábado não pertence a nenhuma coluna, e empurrá-la para a segunda
//      inflaria o dia de alguém.
//   3. item de quem NÃO é do time (marketing, dono de outra pipeline) contando na
//      cadência de alguém.
//   4. o RÓTULO DA FONTE prometendo o que não é contado. A primeira versão contava
//      `calls` e `emails` — dois objetos que este time não usa (medido: zero na janela) —
//      e ia escrever "conta ligações e e-mails" na tela. Este teste reprova se a promessa
//      voltar.
//
// Uso: node scripts/testar-cadencia-diaria.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const fonte = fs.readFileSync(path.join(root, 'scripts', 'fetch-hubspot.js'), 'utf8');

/* Recorta do começo do bloco da cadência até o fim da função. As âncoras são o comentário
   de cabeçalho e a próxima declaração — se alguém mover a função, isto FALHA em vez de
   testar outra coisa (a lição da guarda que perdeu a âncora e passou a medir a função
   vizinha, em silêncio, por uma semana). */
function recortar(ini, fim) {
  const a = fonte.indexOf(ini), b = fonte.indexOf(fim);
  if (a < 0 || b < 0 || b < a) {
    console.error('FALHA: âncoras da cadência não encontradas em fetch-hubspot.js');
    console.error('  início: ' + (a < 0 ? 'NÃO ACHOU' : 'ok') + ' · fim: ' + (b < 0 ? 'NÃO ACHOU' : 'ok'));
    process.exit(1);
  }
  return fonte.slice(a, b);
}
const codigo = recortar('const CADENCIA_DIAS_UTEIS', '// Visita/revisita no app agora vira TAREFA no HubSpot');

/* Entorno mínimo: o que a função consome de fora. REPS é o time; agoraBrasilia é a
   convenção -3h do arquivo. Congelo o "agora" numa terça para o teste não depender do dia
   em que roda — teste que passa hoje e falha na segunda não é teste. */
const AGORA = Date.parse('2026-09-08T15:00:00-03:00');   /* terça, 08/09/2026 */
const REPS = [{ ownerId: '111' }, { ownerId: '222' }];
const ctx = {
  REPS,
  agoraBrasilia: () => new Date(AGORA - 3 * 60 * 60 * 1000),
  console: { log: () => {} }
};
vm.createContext(ctx);
vm.runInContext(codigo + '\nthis.fetchCadenciaDiaria = fetchCadenciaDiaria;'
  + '\nthis.ultimosDiasUteisBrasilia = ultimosDiasUteisBrasilia;', ctx);

const { fetchCadenciaDiaria, ultimosDiasUteisBrasilia } = ctx;

let ok = 0;
const falhas = [];
function teste(nome, fn) {
  try { fn(); ok++; }
  catch (e) { falhas.push({ nome, erro: e.message }); }
}
function igual(a, b, msg) {
  if (a !== b) throw new Error((msg || 'esperava') + ': ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
}

const dias = ultimosDiasUteisBrasilia(10);
const meioDaJanela = dias[5];
const tarefa = (dia, dono, extra) => Object.assign({
  hs_object_id: String(Math.random()).slice(2),
  hs_task_subject: 'Visita - Cliente',
  hs_timestamp: dia + 'T14:00:00Z',
  hubspot_owner_id: dono
}, extra || {});

teste('a janela é de 10 dias úteis, em ordem, sem sábado nem domingo', () => {
  igual(dias.length, 10, 'quantidade de dias');
  igual(dias[dias.length - 1], '2026-09-08', 'o último dia é hoje');
  dias.forEach(d => {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) throw new Error(d + ' é fim de semana e entrou na janela');
  });
  for (let i = 1; i < dias.length; i++) {
    if (!(dias[i - 1] < dias[i])) throw new Error('a janela não está em ordem cronológica');
  }
});

teste('tarefa do time cai no dia certo', () => {
  const r = fetchCadenciaDiaria([tarefa(meioDaJanela, '111')]);
  igual(r.porOwner['111'][5], 1, 'a tarefa tem de cair na coluna 5');
  igual(r.porOwner['111'].reduce((a, b) => a + b, 0), 1, 'total do dono');
  igual(r.porTipo.tarefa, 1, 'contagem por tipo');
});

teste('NOTA SEM DONO conta pelo dono do negócio (lead_owner_id)', () => {
  const nota = {
    hs_object_id: '900',
    hs_note_body: 'Follow Up - Cliente<br>Agendado para: 08/09/2026, 16:00',
    hs_timestamp: meioDaJanela + 'T16:00:00Z',
    /* é assim que ela chega do HubSpot: sem hubspot_owner_id */
    lead_owner_id: '222'
  };
  const r = fetchCadenciaDiaria([nota]);
  igual(r.porOwner['222'][5], 1, 'a nota tem de entrar na cadência do dono do negócio');
  igual(r.porTipo.nota, 1, 'a nota tem de ser contada como nota');
  igual(r.semDono, 0, 'com lead_owner_id resolvido, ela não é "sem dono"');
});

teste('reunião usa a data da REUNIÃO, não a de criação', () => {
  const outroDia = dias[2];
  const reuniao = {
    hs_object_id: '901',
    hs_meeting_title: 'Demo',
    hs_meeting_start_time: outroDia + 'T13:00:00Z',
    hs_createdate: meioDaJanela + 'T09:00:00Z',
    hubspot_owner_id: '111'
  };
  const r = fetchCadenciaDiaria([reuniao]);
  igual(r.porOwner['111'][2], 1, 'a reunião tem de cair no dia em que ela acontece');
  igual(r.porOwner['111'][5], 0, 'e não no dia em que o registro foi criado');
});

teste('fim de semana não entra em coluna nenhuma', () => {
  /* 05/09/2026 é sábado e 06/09 é domingo */
  const r = fetchCadenciaDiaria([tarefa('2026-09-05', '111'), tarefa('2026-09-06', '111')]);
  const total = r.porOwner['111'].reduce((a, b) => a + b, 0);
  igual(total, 0, 'atividade de fim de semana não pertence a dia útil');
  igual(r.foraDaJanela, 2, 'e é contabilizada como fora da janela, não descartada em silêncio');
});

teste('quem não é do time não entra na cadência de ninguém', () => {
  const r = fetchCadenciaDiaria([tarefa(meioDaJanela, '999999')]);
  igual(Object.keys(r.porOwner).length, 2, 'só os donos do time têm série');
  igual(r.porOwner['111'].reduce((a, b) => a + b, 0), 0, 'nada foi somado ao 111');
  igual(r.semDono, 1, 'o item vira "sem dono no time", com número à vista');
});

teste('dia sem atividade é 0 no dono medido — e a série existe para todo o time', () => {
  const r = fetchCadenciaDiaria([tarefa(meioDaJanela, '111')]);
  igual(r.porOwner['222'].length, 10, 'quem não teve atividade ainda tem série de 10 dias');
  igual(r.porOwner['222'].reduce((a, b) => a + b, 0), 0, 'e ela é zero de verdade, não ausente');
  /* a diferença entre "zero medido" e "não medido" mora na AUSÊNCIA do objeto inteiro
     (cadenciaDiaria null, quando a agenda falha) — nunca numa série de zeros. */
});

teste('a fonte declarada NÃO promete ligação nem e-mail', () => {
  const r = fetchCadenciaDiaria([]);
  if (/liga[çc]|e-?mail/i.test(r.fonte)) {
    throw new Error('a fonte promete o que não é contado: "' + r.fonte + '"');
  }
  if (!/tarefa|visita|reuni|nota/i.test(r.fonte)) {
    throw new Error('a fonte tem de nomear o que É contado: "' + r.fonte + '"');
  }
  if (!/liga[çc]|e-?mail/i.test(r.naoConta || '')) {
    throw new Error('o que não é contado tem de estar dito em naoConta');
  }
});

teste('a lista vazia devolve estrutura, não null', () => {
  const r = fetchCadenciaDiaria([]);
  igual(r.dias.length, 10, 'dias');
  igual(Object.keys(r.porOwner).length, 2, 'séries por dono');
  /* null é reservado para "a agenda não veio" — quem decide isso é o main, não esta
     função. Se ela devolvesse null com lista vazia, a tela não saberia distinguir
     "ninguém fez nada" de "não medimos". */
});

console.log('cadência diária: ' + ok + ' teste(s) passaram' + (falhas.length ? ', ' + falhas.length + ' FALHARAM' : ''));
if (falhas.length) {
  falhas.forEach(f => console.error('  FALHOU: ' + f.nome + '\n    ' + f.erro));
  process.exit(1);
}
