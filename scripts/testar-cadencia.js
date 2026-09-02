// scripts/testar-cadencia.js
// Testa a CADÊNCIA DE SINCRONIZAÇÃO: a grade de cron do robô, o portão da IA e a janela
// do webhook. Lê arquivos, não faz rede.
//
// POR QUE EXISTE (02/09/26): o Julyan pediu "pelo menos um intervalo de 2 em 2 horas no
// horário comercial, passou das 19 horas, só voltaria as 08:30". Isso vive em TRÊS lugares
// que precisam concordar, e nenhum deles reclama quando discordam:
//
//   1. a grade de cron em .github/workflows/daily-refresh.yml (em UTC);
//   2. o portão da IA no mesmo arquivo, que compara a STRING do cron da manhã — ao trocar
//      a grade eu deixei essa comparação apontando para "56 11 * * *", um cron que havia
//      deixado de existir. Efeito: nenhuma rodada agendada geraria mais o gargalo do dia
//      nem o compromisso da semana, EM SILÊNCIO. Pego a tempo, e é o motivo nº 1 deste
//      arquivo existir;
//   3. a janela de expediente em api/hubspot-webhook.js, que é o que faz o webhook parar
//      depois das 19h — sem ela ele disparava de hora em hora madrugada adentro (medido:
//      último disparo às 21:26 BRT).
//
// O que ele protege:
//   · nenhuma rodada fora de 08:30–19:00 nos dias úteis (o pedido);
//   · nenhum buraco maior que 2h dentro do expediente (o pedido);
//   · a rodada que gera IA existe na grade (o acoplamento silencioso);
//   · a janela do webhook usa os mesmos limites da grade.
//
// Uso: node scripts/testar-cadencia.js   (da raiz do repositório)

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const yml = fs.readFileSync(path.join(raiz, '.github', 'workflows', 'daily-refresh.yml'), 'utf8');
const webhook = fs.readFileSync(path.join(raiz, 'api', 'hubspot-webhook.js'), 'utf8');

let ok = 0;
const falhas = [];
const conferir = (rotulo, condicao, detalhe) => {
  if (condicao) { ok++; return; }
  falhas.push(rotulo + (detalhe ? ': ' + detalhe : ''));
};

/* Brasília = UTC−3, sem horário de verão desde 2019. A conversão é fixa, e é a mesma que
   os comentários da grade afirmam — se um dia o Brasil voltar a ter horário de verão, este
   teste é o lugar que vai gritar. */
const paraBRT = horaUTC => (Number(horaUTC) + 21) % 24;

const crons = [...yml.matchAll(/- cron: '([^']+)'/g)].map(m => m[1]);
conferir('a grade tem cron', crons.length > 0);

const ABRE = 8 * 60 + 30;
const FECHA = 19 * 60;

/* ── 1. nenhuma rodada de dia útil fora da janela ────────────────────────────────────── */
const uteis = [];
crons.forEach(c => {
  const [min, hora, , , dow] = c.split(/\s+/);
  const brt = paraBRT(hora) * 60 + Number(min);
  const hhmm = String(Math.floor(brt / 60)).padStart(2, '0') + ':' + String(brt % 60).padStart(2, '0');
  if (dow === '1-5') {
    uteis.push({ brt, hhmm, cron: c });
    conferir('rodada de dia útil dentro de 08:30–19:00', brt >= ABRE && brt <= FECHA,
      c + ' cai às ' + hhmm + ' BRT');
  } else {
    /* fim de semana tem UMA rodada por dia, de propósito (snapshot de sexta não pode
       envelhecer até segunda). Ela não precisa respeitar a janela do expediente, mas
       precisa ser de manhã — ninguém abre o cockpit às 4h. */
    conferir('rodada de fim de semana em horário civil', brt >= 6 * 60 && brt <= 12 * 60,
      c + ' cai às ' + hhmm + ' BRT');
  }
});

/* ── 2. nenhum buraco maior que 2h dentro do expediente ─────────────────────────────── */
uteis.sort((a, b) => a.brt - b.brt);
conferir('a primeira rodada do dia é 08:30', uteis.length && uteis[0].brt === ABRE,
  uteis.length ? 'é ' + uteis[0].hhmm : 'não há rodada de dia útil');
conferir('a última rodada do dia é 19:00', uteis.length && uteis[uteis.length - 1].brt === FECHA,
  uteis.length ? 'é ' + uteis[uteis.length - 1].hhmm : '—');
for (let i = 1; i < uteis.length; i++) {
  const buraco = uteis[i].brt - uteis[i - 1].brt;
  conferir('buraco de no máximo 2h no expediente', buraco <= 120,
    'entre ' + uteis[i - 1].hhmm + ' e ' + uteis[i].hhmm + ' há ' + buraco + ' min');
}

/* ── 3. O ACOPLAMENTO DO PORTÃO DA IA ────────────────────────────────────────────────
   Este é o teste que justifica o arquivo. O portão compara a string do cron da manhã; se
   ela não estiver na grade, nenhuma rodada agendada gera texto de IA e ninguém vê erro. */
const mPortao = yml.match(/github\.event\.schedule\s*\}\}"\s*!=\s*"([^"]+)"/);
conferir('o portão da IA declara um cron', !!mPortao);
if (mPortao) {
  const cronDaIA = mPortao[1];
  conferir('o cron do portão da IA EXISTE na grade', crons.indexOf(cronDaIA) >= 0,
    'o portão espera "' + cronDaIA + '" e a grade tem [' + crons.join(' | ') + ']');
  const [minIA, horaIA] = cronDaIA.split(/\s+/);
  const brtIA = paraBRT(horaIA) * 60 + Number(minIA);
  conferir('o texto de IA é gerado na rodada da MANHÃ', brtIA === ABRE,
    'o portão aponta para ' + String(Math.floor(brtIA / 60)).padStart(2, '0') + ':' + String(brtIA % 60).padStart(2, '0') + ' BRT');
}

/* ── 4. a janela do webhook TEM QUE CONTER a grade ───────────────────────────────────
   A invariante era IGUALDADE, e fazia sentido quando o webhook existia so para acelerar
   entre os horarios fixos. Em 02/09/26 a janela passou a 07:00-22:00 (Julyan: "das 22h
   até as 07:00 ngm mexe no hubspot") e ficou MAIOR que a grade, de proposito: acao das
   19h30 esperava 13 horas pela rodada das 08:30, e e o fim de tarde que o executivo usa
   para registrar a rua.
   O que nao pode continua guardado, e e o que importa: nenhum horario em que a grade roda
   pode cair FORA da janela do webhook - senao existiria um pedaco do dia em que o robo
   roda sozinho e o evento do HubSpot e descartado. Janela maior e seguro; menor, nao. */
const mAbre = webhook.match(/const ABRE = (\d+) \* 60(?: \+ (\d+))?;/);
const mFecha = webhook.match(/const FECHA = (\d+) \* 60(?: \+ (\d+))?;/);
conferir('o webhook declara a hora de abrir', !!mAbre);
conferir('o webhook declara a hora de fechar', !!mFecha);
if (mAbre) {
  const abreWebhook = Number(mAbre[1]) * 60 + Number(mAbre[2] || 0);
  conferir('a janela do webhook abre antes da grade, ou junto', abreWebhook <= ABRE,
    'webhook abre ' + abreWebhook + ' min e a grade abre ' + ABRE + ' — haveria rodada com evento descartado');
}
if (mFecha) {
  const fechaWebhook = Number(mFecha[1]) * 60 + Number(mFecha[2] || 0);
  conferir('a janela do webhook fecha depois da grade, ou junto', fechaWebhook >= FECHA,
    'webhook fecha ' + fechaWebhook + ' min e a grade fecha ' + FECHA + ' — haveria rodada com evento descartado');
  conferir('a faixa de silencio declarada e 22h-07h', fechaWebhook === 22 * 60 && mAbre && Number(mAbre[1]) === 7,
    'a faixa de silencio combinada com o Julyan e 22h as 07h');
}
/* fora da janela ele tem que responder 200 — erro faria o HubSpot reenviar e, com falha
   repetida, desativar a subscrição */
conferir('fora da janela o webhook responde 200',
  /fora da janela de expediente[\s\S]{0,400}?status\(200\)/.test(webhook)
  || /status\(200\)[\s\S]{0,400}?fora da janela de expediente/.test(webhook),
  'não achei o 200 junto do motivo "fora da janela"');
/* O CORTE POR DIA DA SEMANA SAIU DA JANELA (02/09/26). O webhook so aceitava evento em
   dia util, e acao feita no sabado esperava ate segunda - mesmo com a grade tendo cron de
   fim de semana. A faixa de silencio combinada e por HORA, nao por dia. O dia da semana
   continua sendo calculado e registrado no log, para o disparo ser rastreavel. */
conferir('a janela do webhook nao e mais limitada a dia util',
  !/naJanela = ehDiaUtil/.test(webhook) && /const naJanela = MIN_DO_DIA >= ABRE/.test(webhook));
conferir('o fim de semana tem rodada agendada como piso',
  /cron: '0 12 \* \* 6,0'/.test(yml));

/* ── 5. a publicação do snapshot não pode voltar a morrer por árvore suja ───────────── */
conferir('o rebase do robô usa --autostash', /rebase --autostash origin\/main/.test(yml),
  'sem autostash, modificação não preparada aborta o rebase e o snapshot do dia é perdido — '
  + 'aconteceu 6 vezes em 2 dias (issues #161 #170 #172 #181 #192 #200)');
conferir('o robô prepara data/ e public/ inteiros', /git add -A data public/.test(yml),
  'lista à mão envelhece: era data/field-sales-playbook.compiled.json que ficava de fora — '
  + 'o catálogo do playbook é gerado do dado do CRM, então o compilado muda em quase toda rodada');
/* A LISTA DE AUTO-RESOLUCAO E A SEGUNDA LISTA A MAO DO ROBO, e envelheceu igual a
   primeira: faltava o playbook compilado, o mesmo arquivo que ja havia ficado de fora
   do `git add`. Duas rodadas simultaneas (19:53 manual e 19:54 agendada, 02/09/26)
   abortaram a segunda com "conflito em arquivo que nao e gerado por este job" sobre um
   arquivo gerado por ele. A lista continua explicita de proposito - em data/ tambem
   vivem arquivos editados a mao, e conflito neles TEM que parar - entao a guarda checa
   que os derivados estao todos lá, um por um. */
/* SEM REGEX AQUI, DE PROPOSITO: a linha do yml E um padrao de grep -E, com barra
   invertida antes do ponto. Comparar regex contra regex foi o meu primeiro erro nesta
   guarda - ela deu vermelho num arquivo que estava na lista. Substring resolve. */
{
  const linhaInesperados = yml.split(String.fromCharCode(10))
    .find(function (l) { return l.indexOf('INESPERADOS=') >= 0; }) || '';
  ['hubspot', 'weekly-raw', 'sync-status', 'resumo-semanal', 'field-sales-playbook']
    .forEach(function (arq) {
      conferir('a auto-resolucao de conflito cobre data/' + arq + '.json',
        linhaInesperados.indexOf(arq) >= 0,
        'arquivo 100% derivado fora da lista: duas rodadas simultaneas abortam a segunda '
        + 'acusando conflito em arquivo que o proprio job gera');
    });
}

conferir('rebase que falha SEM conflito para e diz por quê',
  /Rebase falhou SEM conflito/.test(yml),
  'o handler antigo tratava tudo como conflito e chamava rebase --continue sem rebase em andamento');

/* ── 6. nenhum texto do produto pode fixar os horários à mão ─────────────────────────
   Doze lugares do template escreviam "08:56, 13h e 19h", quatro deles em texto que o
   usuário lê (o aviso de leitura recalculada do gestor, o do histórico de etapa e o toast
   de mudança de etapa). Mudar a grade fez os doze mentirem de uma vez. Agora existe
   SYNC_CADENCIA, e este teste impede a volta do horário escrito à mão. */
{
  const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
  const linhas = tpl.split(String.fromCharCode(10)).map(function (x) { return x.replace(String.fromCharCode(13), ''); });
  const suspeitas = [];
  /* PRECISA RASTREAR BLOCO DE COMENTÁRIO, não só o começo da linha: a nota histórica que
     explica esta mudança cita "08:56, 13h e 19h" na CONTINUAÇÃO de um /* ... *​/, e a
     primeira versão desta checagem acusou o próprio texto que documenta a correção. É o
     mesmo tropeço que o guard de breakpoint já teve (está registrado em check-scripts). */
  let dentroDeBloco = false;
  linhas.forEach((l, i) => {
    const t = l.trim();
    const abre = l.indexOf('/*'), fecha = l.indexOf('*/');
    const eraBloco = dentroDeBloco;
    if (!dentroDeBloco && abre >= 0 && (fecha < 0 || fecha < abre)) dentroDeBloco = true;
    else if (dentroDeBloco && fecha >= 0) dentroDeBloco = false;
    if (eraBloco || dentroDeBloco) return;
    if (t.indexOf('//') === 0) return;
    const fixou = ['0' + '8:56', '8h56', '13h' + '/19h'].some(x => l.indexOf(x) >= 0);
    if (fixou) suspeitas.push((i + 1) + ': ' + t.slice(0, 70));
  });
  conferir('nenhum código do template fixa os horários da grade', suspeitas.length === 0,
    suspeitas.join(' | '));
  conferir('a constante SYNC_CADENCIA existe', tpl.indexOf('const SYNC_CADENCIA = ') >= 0);
  /* o RODAPÉ é gerado no servidor (scripts/montar-dados.js) e aparece em toda tela — ele
     também citava "atualizado 08:56, 13:00 e 19:00" à mão. Foi o último que sobrou, e só
     apareceu lendo o texto RENDERIZADO no navegador, não o template. */
  {
    const md = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8');
    const fixou = ['0' + '8:56', '13:00 e 19:00'].some(x => md.indexOf(x) >= 0);
    conferir('o rodapé não fixa os horários da grade', !fixou,
      'scripts/montar-dados.js volta a escrever o horário à mão no footerText');
  }
  conferir('o limite de dado velho olha a hora', tpl.indexOf('syncDentroDoExpediente()') >= 0,
    'sem isso, um limite fixo confunde "rodada falhou" com "é sábado de manhã"');
  conferir('o limite do expediente é menor que o de fora',
    tpl.indexOf('SYNC_LIMITE_EXPEDIENTE_MIN = 150') >= 0
    && tpl.indexOf('SYNC_LIMITE_FORA_MIN = 26 * 60') >= 0);
}

if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  · ' + f));
  process.exit(1);
}
console.log('cadência: ' + ok + ' checagens ok — '
  + uteis.map(u => u.hhmm).join(' · ') + ' nos dias úteis.');
