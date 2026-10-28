/* ══════════════════════════════════════════════════════════════════════════════════════
   A META É DO MÊS — e quem escolhe é o relógio (28/10/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Até 28/10 o arquivo tinha UM conjunto de metas e um campo "mes" que ninguém lia. Trocar
   a meta era trocar esse conjunto, e a meta nova passava a valer no INSTANTE DO MERGE.

   Naquele dia o preço quase foi cobrado: a meta de novembro entrou no main com três dias
   de outubro pela frente. A Kelly ficaria sem meta trabalhando até 31/10, quatro novatos
   ganhariam meta num mês em que o Julyan tinha dito que não teriam, e o time cairia de 52
   para 44 no meio da corrida. Deu tempo de reverter porque o robô não tinha rodado — por
   quatro minutos. O rito passou a depender de alguém lembrar a data.

   Esta suite existe para o calendário decidir no lugar da memória. Ela confere o que o
   robô faz de verdade: lê o arquivo pelo mesmo caminho (scripts/metas-do-mes.js) e exige
   que o bloco escolhido seja o do mês corrente em BRASÍLIA — o mesmo recorte que conta o
   que foi fechado no mês.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ARQUIVO = path.join(raiz, 'data', 'metas.json');
const { mesBrasiliaDe, conferirBloco, lerMetas, metasDoMes } = require(path.join(raiz, 'scripts', 'metas-do-mes.js'));
const robo = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-hubspot.js'), 'utf8');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
/** Roda `f` e devolve a mensagem do erro, ou null se não deu erro nenhum. */
function erroDe(f) {
  try { f(); return null; } catch (e) { return e.message; }
}

const bruto = lerMetas(ARQUIVO);
const meses = Object.keys(bruto.porMes).sort();

// ── 1. O formato ──────────────────────────────────────────────────────────────────────
conferir('porMes existe', meses.length >= 1, 'o arquivo não declara mês nenhum');
conferir('meses no formato AAAA-MM', meses.every(m => /^\d{4}-\d{2}$/.test(m)),
  'tem chave que não é mês: ' + meses.filter(m => !/^\d{4}-\d{2}$/.test(m)).join(', '));
conferir('o mês de hoje está declarado', !!bruto.porMes[mesBrasiliaDe()],
  'hoje é ' + mesBrasiliaDe() + ' e o arquivo só tem ' + meses.join(', ')
  + ' — o robô vai falhar alto na próxima rodada');
conferir('competência e vendas confirmadas ficam FORA do mês',
  Array.isArray(bruto.competencia) && Array.isArray(bruto.vendasConfirmadas),
  'são por NEGÓCIO, não por mês: cada linha já carrega o próprio contaEm');

// ── 2. A soma de cada mês ─────────────────────────────────────────────────────────────
meses.forEach((mes) => {
  const b = bruto.porMes[mes];
  const soma = conferirBloco(mes, b);
  conferir('soma de ' + mes, soma.clientes + (b.time.gordura.clientes || 0) === b.time.clientes,
    'as pessoas dão ' + soma.clientes + ' e o time diz ' + b.time.clientes);
});

/* A CONFERÊNCIA VALE PARA O MÊS QUE AINDA NÃO CHEGOU. Este é o ganho de ter os dois
   meses no arquivo: um erro de digitação na meta de novembro reprova HOJE, com tempo de
   corrigir, em vez de aparecer na tela do time no dia 1. */
const futuros = meses.filter(m => m > mesBrasiliaDe());
conferir('o mês futuro também é conferido', futuros.every(m => conferirBloco(m, bruto.porMes[m])),
  'algum mês futuro passou sem conferência');

// ── 3. A escolha pelo relógio ─────────────────────────────────────────────────────────
conferir('escolhe o bloco do mês pedido',
  meses.every(m => metasDoMes(bruto, m) === bruto.porMes[m]),
  'metasDoMes devolveu o bloco de outro mês');

/* A VIRADA É À MEIA-NOITE DE BRASÍLIA, não de UTC. Se a meta virasse por UTC e a venda
   contasse por Brasília, as três primeiras horas do dia 1 teriam a meta de um mês e as
   vendas do outro — divergência invisível, que só aparece na reunião. */
conferir('23:59 do dia 31 ainda é o mês velho', mesBrasiliaDe('2026-11-01T02:59:00Z') === '2026-10',
  'deu ' + mesBrasiliaDe('2026-11-01T02:59:00Z'));
conferir('00:01 do dia 1 já é o mês novo', mesBrasiliaDe('2026-11-01T03:01:00Z') === '2026-11',
  'deu ' + mesBrasiliaDe('2026-11-01T03:01:00Z'));
conferir('o deslocamento é o mesmo do robô', /valor\s*\)\s*-\s*3 \* 60 \* 60 \* 1000|ms - 3 \* 60 \* 60 \* 1000/.test(
  fs.readFileSync(path.join(raiz, 'scripts', 'metas-do-mes.js'), 'utf8')),
  'metas-do-mes.js não desloca 3 horas como diaBrasiliaDe() em fetch-hubspot.js');

// ── 4. Mês sem bloco é erro alto, não herança ─────────────────────────────────────────
const semBloco = erroDe(() => metasDoMes(bruto, '2027-07'));
conferir('mês não declarado falha alto', semBloco && /não existe meta para 2027-07/.test(semBloco),
  'devolveu algo em vez de gritar: ' + semBloco);
conferir('e o erro diz quais meses existem', semBloco && semBloco.includes(meses[0]),
  'o erro não ajuda a corrigir: ' + semBloco);

// ── 5. O robô usa ESTE caminho ────────────────────────────────────────────────────────
conferir('o robô importa o seletor', /require\('\.\/metas-do-mes'\)/.test(robo),
  'fetch-hubspot.js não importa scripts/metas-do-mes.js');
conferir('o robô escolhe pelo relógio', /const mes = mesBrasiliaDe\(\);/.test(robo),
  'fetch-hubspot.js não chama mesBrasiliaDe()');
conferir('o robô não lê metas.json por fora', !/JSON\.parse\(fs\.readFileSync\([^)]*metas\.json/.test(robo),
  'sobrou uma leitura direta do arquivo, que escaparia da conferência');
conferir('METAS.mes é o mês escolhido, não o campo antigo', !/METAS\.mes \|\| null[\s\S]{0,40}bruto\.mes/.test(robo)
  && /metasMes: METAS\.mes \|\| null/.test(robo),
  'o snapshot não publica o mês que foi realmente usado');

// ── 6. A sabotagem: a guarda da soma precisa reprovar ─────────────────────────────────
/* Guarda que nunca viu vermelho não é guarda. Aqui a sabotagem é em memória, sobre uma
   cópia — o arquivo no disco não é tocado. */
const copia = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
const algumMes = meses[0];
const alguem = Object.keys(copia.porMes[algumMes].metas)[0];
copia.porMes[algumMes].metas[alguem].clientes += 1;
conferir('soma errada reprova', !!erroDe(() => conferirBloco(algumMes, copia.porMes[algumMes])),
  'mexi na meta de uma pessoa e a conferência passou verde');

const copia2 = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
copia2.porMes[algumMes].time.gordura.clientes += 1;
conferir('gordura errada reprova', !!erroDe(() => conferirBloco(algumMes, copia2.porMes[algumMes])),
  'mexi na gordura e a conferência passou verde');

const copia3 = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
delete copia3.porMes[algumMes].metas[alguem];
conferir('pessoa sumida reprova', !!erroDe(() => conferirBloco(algumMes, copia3.porMes[algumMes])),
  'tirei uma pessoa do mês e o total do time continuou batendo');

/* ── 7. O MÊS QUE VEM TEM DE APARECER NA TELA ──────────────────────────────────────────
   Em 28/10 o Julyan olhou o Cockpit, viu 52 e disse que a meta de 44 "não foi atualizada".
   Ela estava: novembro já estava no arquivo e o relógio é que não tinha virado. O sistema
   acertou e a TELA não tinha como provar — e meta é o número que o time inteiro cobra. */
const { proximoMesDeclarado } = require(path.join(raiz, 'scripts', 'metas-do-mes.js'));
{
  const p = proximoMesDeclarado(bruto, meses[0]);
  conferir('o próximo mês declarado é encontrado', p && p.mes === meses[1],
    'não achei o mês seguinte a ' + meses[0]);
  conferir('e vem com o dia em que começa', p && p.comecaEm === meses[1] + '-01',
    'sem a data a tela não sabe dizer a partir de quando vale');
  conferir('e com o número do time', p && p.clientes === bruto.porMes[meses[1]].time.clientes,
    'o número do próximo mês não bate com o arquivo');
  conferir('o último mês declarado não inventa um seguinte',
    proximoMesDeclarado(bruto, meses[meses.length - 1]) === null,
    'prometeu um mês que ninguém declarou');
  conferir('o robô publica o próximo mês', /metasProximo: METAS\.proximo \|\| null/.test(robo),
    'sem isto a tela não tem o dado e a dúvida de 28/10 volta no mês que vem');
  conferir('e o METAS do robô o calcula', /proximo: proximoMesDeclarado\(bruto, mes\)/.test(robo),
    'o campo é publicado vazio');
}
/* O DESENCONTRO TEM DE SER DITO. 01/11/26 cai num DOMINGO e o robô só roda às 09:00 no fim de
   semana: das 00:00 às 09:00 a tela mostraria a meta de outubro dentro de novembro. Pequeno,
   mas é a mesma família de defeito que a divergência calada entre meta e venda. */
{
  const tplTxt = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
  conferir('a tela mostra a meta do mês na linha de cima', /Meta de \$\{nomeDoMes\(k\.metasMes\)/.test(tplTxt),
    'a linha não diz a meta, e a dúvida de 28/10 não tem resposta na tela');
  conferir('a tela avisa quando o mês das metas não é o de hoje',
    /k\.metasMes !== hoje/.test(tplTxt) && /ainda não rodou neste mês/.test(tplTxt),
    'meta de outro mês em tela, calada — foi assim que 01/11 cairia num domingo sem ninguém ver');
  conferir('e mostra o mês que vem quando ele já está carregado',
    /j[áa] carregada, vale a partir de/.test(tplTxt),
    'a tela não prova que a meta nova já está no sistema');
  conferir('a linha é montada por função, não cravada',
    /\$\{metaNaLinha\(\)\}/.test(tplTxt), 'a chamada sumiu de updatedLine');
}

// ── saída ─────────────────────────────────────────────────────────────────────────────
if (falhas.length) {
  console.error('metas por mês: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + ':');
  falhas.forEach(f => console.error(f));
  process.exit(1);
}
console.log('metas por mês: ' + ok + ' checagens ok — ' + meses.length + ' mês(es) declarado(s) ('
  + meses.join(', ') + '), o de hoje é ' + mesBrasiliaDe()
  + ', a virada é meia-noite de Brasília e mês sem meta falha alto.');
