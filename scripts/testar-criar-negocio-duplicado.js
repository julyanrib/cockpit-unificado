#!/usr/bin/env node
/* ============================================================================
   A ROTA QUE CRIA NEGÓCIO NÃO CRIA O QUE JÁ ESTÁ ABERTO (23/09/26)

   Julyan: "se o lead já foi criado e está na carteira, NÃO PODE CRIAR DE NOVO E DUPLICAR".

   `api/criar-negocio.js` já procurava o CONTATO por telefone antes de criar. O NEGÓCIO ela
   criava sempre. Medido pela assinatura que a própria rota escreve na descrição do negócio
   ("criado pelo cockpit direto em Prospecção"): 7 dos 19 pares duplicados do funil aberto
   têm os DOIS lados criados por ela.

   ESTA SUÍTE RODA A BUSCA DE VERDADE, em vm, com um HubSpot de mentira que responde o que
   o portal responde. O que precisa ser verdade não é que a função existe — é que ela acha
   o negócio aberto, ignora o fechado, e deixa passar o que é conta nova.

   Uso: node scripts/testar-criar-negocio-duplicado.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const rota = fs.readFileSync(path.join(raiz, 'api', 'criar-negocio.js'), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) {
  if (cond) { ok += 1; return; }
  falhas.push(nome + (porque ? '\n      ' + porque : ''));
}
function igual(nome, veio, esperado, porque) {
  checar(nome, JSON.stringify(veio) === JSON.stringify(esperado),
    (porque ? porque + ' · ' : '') + 'esperava ' + JSON.stringify(esperado)
      + ', veio ' + JSON.stringify(veio));
}

function recortar(fonte, nome) {
  const assinatura = fonte.indexOf('async function ' + nome + '(') > -1
    ? 'async function ' + nome + '(' : 'function ' + nome + '(';
  const i = fonte.indexOf(assinatura);
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe em api/criar-negocio.js.'); process.exit(1); }
  let d = 0, j = i, viu = false;
  while (j < fonte.length) {
    const c = fonte[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return fonte.slice(i, j + 1);
}

/* O PIPELINE E AS ETAPAS FECHADAS SAEM DO ARQUIVO, não de números repetidos aqui: se
   alguém mudar o pipeline, a suíte acompanha em vez de reprovar o valor novo. */
const mPipe = rota.match(/const PIPELINE_FIELD_SALES = '(\d+)';/);
if (!mPipe) { console.error('FALHA: não achei PIPELINE_FIELD_SALES.'); process.exit(1); }
const PIPELINE = mPipe[1];
const GANHO = '1396006162', PERDIDO = '1396006164', NEGOCIACAO = '1395880472';

/* ══ O HUBSPOT DE MENTIRA ════════════════════════════════════════════════════════════
   Responde como o portal: a busca por `celular` e por `dealname` devolve o que casar
   exatamente, e nada mais. A rota é quem tem de saber o que fazer com isso. */
function montar(negocios, opcoes) {
  const chamadas = [];
  const ctx = {
    PIPELINE_FIELD_SALES: PIPELINE,
    console: { error: function () { chamadas.push({ log: Array.from(arguments).join(' ') }); } },
    JSON: JSON, String: String, Number: Number, Array: Array, Object: Object,
    fetch: async function (url, init) {
      const corpo = JSON.parse(init.body);
      /* LÊ OS FILTROS PELO NOME, e não pela posição: por posição, tirar o filtro de dono
         quebraria o portal de mentira em vez de mudar a resposta — e a sabotagem que
         remove o escopo passaria por "erro de teste" em vez de defeito. */
      const f = corpo.filterGroups[0].filters;
      const doNome = function (n) {
        const x = f.filter(function (y) { return y.propertyName === n; })[0];
        return x ? x.value : undefined;
      };
      const alvo = f.filter(function (y) {
        return ['celular', 'dealname'].indexOf(y.propertyName) >= 0;
      })[0] || {};
      const campo = alvo.propertyName, valor = alvo.value;
      const dono = doNome('hubspot_owner_id'), pipe = doNome('pipeline');
      chamadas.push({ campo: campo, valor: valor, dono: dono, pipe: pipe });
      if (opcoes && opcoes.quebrar) throw new Error('rede caiu');
      if (opcoes && opcoes.http500) return { ok: false, status: 500, json: async () => ({}) };
      const results = negocios.filter(function (n) {
        /* filtro ausente = portal não filtra por aquilo, que é o que acontece de verdade */
        if (dono !== undefined && String(n.dono) !== String(dono)) return false;
        if (pipe !== undefined && String(n.pipeline || PIPELINE) !== String(pipe)) return false;
        const p = campo === 'celular' ? n.celular : n.nome;
        return String(p || '') === String(valor);
      }).map(function (n) {
        return { id: n.id, properties: { dealname: n.nome, dealstage: n.etapa, celular: n.celular } };
      });
      return { ok: true, status: 200, json: async () => ({ results: results }) };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(rota.match(/const ETAPAS_FECHADAS = \[[^\]]*\];/)[0], ctx);
  vm.runInContext(recortar(rota, 'negocioJaAberto'), ctx);
  return { fn: vm.runInContext('negocioJaAberto', ctx), chamadas: chamadas };
}

const DONO = '86100506';
const CARTEIRA = [
  { id: '65074212374', nome: 'NA BRASA', etapa: NEGOCIACAO, dono: DONO, celular: '21999199791' },
  { id: '64999999999', nome: 'Boteco Perdido', etapa: PERDIDO, dono: DONO, celular: '21988887777' },
  { id: '64888888888', nome: 'Cliente Fechado', etapa: GANHO, dono: DONO, celular: '21977776666' },
  { id: '65000000000', nome: 'Lugar do Colega', etapa: NEGOCIACAO, dono: '99999999', celular: '21966665555' }
];

(async function () {
  /* ══ 1. O CASO REAL ════════════════════════════════════════════════════════════════
     "na brasa" foi criado em Prospecção em 21/09 com o mesmo telefone do negócio que já
     estava em Negociação desde 16/09. É o duplicado que ele viu na tela. */
  (function () {}());
  const m1 = montar(CARTEIRA);
  const r1 = await m1.fn('token', DONO, 'na brasa', '21999199791');
  checar('acha o negócio aberto pelo telefone', !!r1 && r1.id === '65074212374',
    'é o caso do "Na Brasa": Negociação desde 16/09, criado de novo em 21/09 · veio '
      + JSON.stringify(r1));
  igual('e diz que casou pelo telefone', r1 && r1.por, 'telefone',
    'a tela precisa dizer POR QUE recusou — "já existe" sem o motivo manda procurar no escuro');
  igual('e devolve a etapa em que ele está', r1 && r1.etapa, NEGOCIACAO);

  /* O MESMO NÚMERO EM OUTRO FORMATO. O portal guarda "21999199791" e "+55-21999199791";
     a rota busca as duas formas que ela conhece. */
  const m2 = montar([{ id: '1', nome: 'X', etapa: NEGOCIACAO, dono: DONO, celular: '21999199791' }]);
  const r2 = await m2.fn('token', DONO, 'Outro Nome', '21999199791');
  checar('acha mesmo com o nome escrito diferente', !!r2 && r2.id === '1',
    'o telefone é a chave forte: o mesmo lugar cadastrado com outro nome só casa por ele');

  /* ══ 2. PELO NOME, quando não há telefone — 47% da Prospecção não tem ═══════════════ */
  const m3 = montar(CARTEIRA);
  const r3 = await m3.fn('token', DONO, 'NA BRASA', null);
  checar('acha pelo nome quando não há telefone', !!r3 && r3.id === '65074212374',
    'medido em 10/09: 40 dos 85 negócios de Prospecção não têm celular');
  igual('e diz que casou pelo nome', r3 && r3.por, 'nome');

  /* ══ 3. O QUE NÃO PODE BLOQUEAR ════════════════════════════════════════════════════ */
  const m4 = montar(CARTEIRA);
  igual('negócio PERDIDO não impede de trabalhar o lugar de novo',
    await m4.fn('token', DONO, 'Boteco Perdido', '21988887777'), null,
    'é exatamente para isso que a reciclagem existe');
  const m5 = montar(CARTEIRA);
  igual('negócio GANHO também não',
    await m5.fn('token', DONO, 'Cliente Fechado', '21977776666'), null,
    'cliente fechado que quer uma segunda loja não pode esbarrar no próprio contrato');
  const m6 = montar(CARTEIRA);
  igual('negócio de OUTRO executivo não impede',
    await m6.fn('token', DONO, 'Lugar do Colega', '21966665555'), null,
    'a carteira é dele, não do time — travar aqui tiraria conta de rua de quem chegou primeiro');
  const m7 = montar(CARTEIRA);
  igual('conta nova de verdade passa',
    await m7.fn('token', DONO, 'Boteco que nunca existiu', '21900000000'), null,
    'Julyan: "quando eu falo obrigatório, é deixar eles ciente disso, não travar nada"');

  /* AS TRÊS UNIDADES DO CACHORRO DO BONFA são negócios legítimos e têm nomes diferentes —
     o casamento por nome exato não as alcança. */
  const bonfa = [{ id: 'b1', nome: 'Cachorro do Bonfa - Cidade Baixa', etapa: NEGOCIACAO, dono: DONO, celular: '' }];
  const m8 = montar(bonfa);
  igual('a segunda loja da mesma rede passa',
    await m8.fn('token', DONO, 'Cachorro do Bonfa - Redenção', ''), null,
    'três unidades reais no funil do Kelly hoje — nome exato não as confunde');

  /* ══ 4. A BUSCA VAI AO PIPELINE CERTO ══════════════════════════════════════════════ */
  const m9 = montar(CARTEIRA);
  await m9.fn('token', DONO, 'NA BRASA', '21999199791');
  checar('a busca é escopada por dono e por pipeline',
    m9.chamadas.length > 0 && m9.chamadas.every(function (c) {
      return String(c.dono) === DONO && String(c.pipe) === PIPELINE;
    }),
    'sem o escopo ela acharia negócio de outro time e recusaria criação legítima');

  /* ══ 5. A FALHA DA BUSCA NÃO TRAVA O EXECUTIVO, MAS APARECE ════════════════════════
     A busca de contato desta mesma rota engolia o erro em silêncio, sem log — e foi assim
     que o contato do Salseiro virou três registros sem ninguém saber por quê. */
  const m10 = montar(CARTEIRA, { quebrar: true });
  igual('busca que cai deixa criar', await m10.fn('token', DONO, 'NA BRASA', '21999199791'), null,
    'recusar por causa de uma busca que caiu deixaria o executivo sem cadastrar na rua');
  checar('mas a falha vai para o log',
    m10.chamadas.some(function (c) { return c.log && c.log.indexOf('busca de duplicado falhou') > -1; }),
    'duplicado sem rastro é o que a rota de contato produziu por semanas');

  const m11 = montar(CARTEIRA, { http500: true });
  igual('HTTP de erro também deixa criar',
    await m11.fn('token', DONO, 'NA BRASA', '21999199791'), null);

  /* ══ 6. O CANO: a rota chama a busca ANTES de criar ════════════════════════════════ */
  const iBusca = rota.indexOf('negocioJaAberto(token, ownerId');
  const iCria = rota.indexOf("fetch('https://api.hubapi.com/crm/v3/objects/deals'");
  checar('a rota consulta antes de gravar', iBusca > 0 && iCria > 0 && iBusca < iCria,
    'conferir depois de criar não conserta nada');
  checar('e a recusa devolve o negócio que já existe',
    /jaExiste: \{ id: jaAberto\.id/.test(rota),
    '"já existe" sem dizer qual manda ele procurar no escuro — e foi procurar no escuro '
      + 'que produziu o duplicado');
  checar('a saída para a loja de verdade existe',
    /permitirDuplicado !== true/.test(rota),
    'duas unidades com o mesmo telefone existem; a tela pergunta e ele confirma');

  console.log('');
  console.log('criar-negócio · duplicado: ' + ok + ' verificações');
  if (falhas.length) {
    console.log('');
    falhas.forEach(function (f) { console.log('  ✗ ' + f); });
    console.log('');
    console.log('FALHOU: ' + falhas.length);
    process.exit(1);
  }
  console.log('tudo certo.');
}());
