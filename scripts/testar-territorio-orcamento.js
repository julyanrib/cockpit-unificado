/* ============================================================================
   TERRITÓRIO v4 · O ORÇAMENTO DE LEITURAS DA ABERTURA (06/11/26)

   Por quê: a v3 fazia 23 leituras e baixava 759 KB comprimidos por abertura (leads_prospeccao e clients
   inteiros) e, no mesmo dia, o banco Nano ficou sem CPU. O aceite da v4 é: até 3 leituras e até 50 KB
   comprimidos na abertura, nenhuma de leads_prospeccao nem de clients direto; lista só sob demanda.
   Esta guarda abre a aba num banco falso que conta cada pedido e reprova se:
     · a abertura fizer mais de 3 pedidos (hoje: territorio_resumo + registrar_abertura);
     · qualquer tabela for lida direto na abertura (supa.from), em especial leads_prospeccao e clients;
     · repintar (o que acontece a cada clique) ler de novo antes de 5 minutos;
     · trocar de praça fizer mais de 1 leitura;
     · a medição registrar a abertura mais de uma vez no dia.
   E prova que ela mesma fica VERMELHA numa cópia sabotada (uma leitura de leads_prospeccao na abertura):
   guarda que só passa não guarda nada.
   O peso de verdade (KB) se mede na produção; aqui, o resumo de um time de 10 com 180 bairros no
   formato da 0258 tem de caber em 50 KB crus (o comprimido é ~4 vezes menor).
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + String(porque).slice(0, 300) : '')); };

const ini = tpl.indexOf('<script id="gv2-js">');
const fim = tpl.indexOf('</script><!-- /gv2-js -->');
const codigo = tpl.slice(ini + '<script id="gv2-js">'.length, fim).replace('GV2.instalar();', '');
checar('o Território v4 é a aba terr', codigo.indexOf('GV2.render.terr = GV2.render.t4;') > 0);

const R0 = Date;
global.Date = class extends R0 { constructor(...a) { super(...(a.length ? a : ['2026-11-06T15:00:00Z'])); } static now() { return new R0('2026-11-06T15:00:00Z').getTime(); } };
global.esc = v => String(v == null ? '' : v);
global.document = undefined;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
global.sessaoAtual = { role: 'manager', ownerId: '99' };
global.DATA = { territorios: [] };

/* um resumo do tamanho de produção: 10 executivos, 180 bairros, 40 sistemas */
const ex = Array.from({ length: 10 }, (x, i) => ({ owner_id: String(100000000 + i), nome: 'Executivo Número ' + i + ' da Silva', praca: ['rj', 'sp', 'vv'][i % 3], ramp: 'pleno', chegou: 200, sugerido: 20, na_rota: 10, visitado: 3, negocio: 1,
  negocio_sem_visita: 2, primeira_visita_mediana_d: 10.9, primeira_visita_n: 3, vence_semana: 9, fila: 160, sug_pendentes: 5, sug_confirmados: 0 }));
const R = { lido_em: '2026-11-06T15:00:00Z', hoje: '2026-11-06', semana_plano: '2026-11-02', praca: 'todas', carga_gestor: 5,
  carga_de: { dia: '2026-11-04', n: 24, ultima: '2026-11-04T16:41:00Z', bairros: 16 },
  funil_30d: { chegou: 2000, com_dono: 2000, sugerido: 200, na_rota: 100, visitado: 30, negocio: 10, negocio_sem_visita: 20 },
  semanas_4: [0, 1, 2, 3].map(i => ({ semana: '2026-10-1' + i, chegou: 100, sugerido: 10, na_rota: 9, visitado: 3, negocio: 1 })),
  por_executivo: ex, primeira_visita_geral: { mediana_d: 12, n: 17 },
  resgate_14d: { vencem: 104, redistribuiveis: 53, sem_dono: 51, saem_ate: '2026-11-20' },
  sugestoes: { semana: '2026-11-02', vale_ate: '2026-11-06', sugeridos: 44, confirmados: 1, pendentes: 43 }, visitou_semana_passada: 7, saiu_sem_visita_semana: 2158,
  bairros: Array.from({ length: 180 }, (x, i) => ['sp|sao paulo|bairro numero ' + i, 'Bairro Número ' + i, 'São Paulo', 'SP', ['rj', 'sp', 'vv'][i % 3], -23.5 + i / 1000, -46.6 + i / 1000, 20, 18, 3, ['ok', 'parcial', 'sem_dono'][i % 3], '97978276', 'Sérgio Caetano', 4]),
  contra_quem: Array.from({ length: 40 }, (x, i) => ['sistema ' + i, 10, 3]),
  carteira_quem_saiu: [{ nome: 'Kelly Travieso Di Domenico', owner: '91477292', lp: 0, pinos: 223 }], ids: null };

const abrir = async (cod) => {
  const pedidos = [], tabelas = [];
  const resp = (data) => ({ then: (a, b) => Promise.resolve({ data, error: null }).then(a, b) });
  const consulta = () => { const o = resp([]); ['select', 'eq', 'is', 'gte', 'in', 'order', 'range', 'not', 'lte'].forEach(k => { o[k] = () => o; }); return o; };
  global.supa = {
    rpc: (nome, args) => { pedidos.push(nome + (args && args.p_praca ? ':' + args.p_praca : '')); return resp(nome === 'territorio_resumo' ? R : null); },
    from: (t) => { pedidos.push('from:' + t); tabelas.push(t); return consulta(); }
  };
  const GV2 = new Function(cod + '\nreturn GV2;')();
  GV2.pintar = function () {};
  GV2.toast = function () {};
  const pessoas = ex.map(e => ({ id: e.owner_id, nome: e.nome, praca: 'Rio de Janeiro', iniciais: 'E' }));
  GV2.base = { agora: { iso: '2026-11-06', min: 12 * 60, dow: 5 }, pessoas, porId: Object.fromEntries(pessoas.map(p => [p.id, p])), negocios: [], cru: { fichas: [] }, faltas: [] };
  GV2.estado = Object.assign(GV2.estado || {}, { aba: 'terr', cobrados: {} });
  GV2.render.terr();
  await new Promise(r => setTimeout(r, 5));
  await (GV2.t4 && GV2.t4.cache.todas && GV2.t4.cache.todas.lendo);
  const h = GV2.render.terr();
  return { GV2, pedidos, tabelas, h };
};

(async () => {
  /* ── a abertura ── */
  const A = await abrir(codigo);
  checar('a abertura faz no máximo 3 pedidos ao banco', A.pedidos.length <= 3, A.pedidos.join(', '));
  checar('a abertura lê o territorio_resumo uma vez', A.pedidos.filter(p => p === 'territorio_resumo').length === 1, A.pedidos.join(', '));
  checar('a abertura não lê nenhuma tabela direto (nem leads_prospeccao, nem clients)', A.tabelas.length === 0, A.tabelas.join(', '));
  checar('a medição registra a abertura (uma vez)', A.pedidos.filter(p => p === 'registrar_abertura').length === 1, A.pedidos.join(', '));
  checar('a tela montou com o resumo', /4 · GERIR O TERRITÓRIO/.test(A.h));
  /* repintar (cada clique repinta) não relê */
  const n0 = A.pedidos.length;
  for (let i = 0; i < 5; i++) A.GV2.render.terr();
  await new Promise(r => setTimeout(r, 5));
  checar('repintar 5 vezes não lê de novo (cache de 5 minutos) nem mede de novo no mesmo dia', A.pedidos.length === n0, A.pedidos.slice(n0).join(', '));
  /* trocar de praça: uma leitura, só dela */
  A.GV2.t4Comando('t4pr', ['t4pr', 'sp']);
  A.GV2.render.terr();
  await new Promise(r => setTimeout(r, 5));
  await (A.GV2.t4.cache.sp && A.GV2.t4.cache.sp.lendo);
  checar('trocar para SP faz 1 leitura (territorio_resumo de SP) e nenhuma tabela', A.pedidos.slice(n0).join() === 'territorio_resumo:sp' && A.tabelas.length === 0, A.pedidos.slice(n0).join(', '));
  /* o mapa da praça vem no resumo: trocar RJ/SP/ES no cartão não lê */
  const n1 = A.pedidos.length;
  A.GV2.t4Comando('t4pr', ['t4pr', 'todas']); A.GV2.t4Comando('t4mp', ['t4mp', 'vv']); A.GV2.render.terr();
  await new Promise(r => setTimeout(r, 5));
  checar('voltar para Todas e trocar o mapa para ES não lê nada (está no cache e no resumo)', A.pedidos.length === n1, A.pedidos.slice(n1).join(', '));

  /* ── o peso: o resumo de produção cabe ── */
  const cru = Buffer.byteLength(JSON.stringify(R));
  const gz = zlib.gzipSync(JSON.stringify(R)).length;
  checar('o resumo de um time de 10 com 180 bairros cabe em 50 KB crus', cru <= 50 * 1024, Math.round(cru / 1024) + ' KB');
  checar('e comprimido fica bem abaixo dos 50 KB do aceite', gz <= 15 * 1024, Math.round(gz / 1024) + ' KB');

  /* ── a guarda fica vermelha quando alguém volta a ler a tabela na abertura ── */
  const sab = codigo.replace('GV2.render.t4 = function () {', "GV2.render.t4 = function () { supa.from('leads_prospeccao').select('id');");
  checar('a sabotagem foi aplicada', sab !== codigo);
  const S = await abrir(sab);
  checar('PROVA: numa cópia que lê leads_prospeccao na abertura, a guarda reprova', S.tabelas.indexOf('leads_prospeccao') >= 0 && !(S.tabelas.length === 0));
  const sab2 = codigo.replace("const r = await supa.rpc('territorio_resumo', { p_praca: pr === 'todas' ? null : pr });", "await supa.rpc('territorio_resumo', {}); await supa.rpc('territorio_resumo', {}); await supa.rpc('territorio_resumo', {}); const r = await supa.rpc('territorio_resumo', { p_praca: pr === 'todas' ? null : pr });");
  checar('a sabotagem 2 foi aplicada', sab2 !== codigo);
  const S2 = await abrir(sab2);
  checar('PROVA: numa cópia com 5 pedidos na abertura, a guarda reprova', S2.pedidos.length > 3, S2.pedidos.join(', '));

  fechar();
})().catch(e => { falhas.push('erro: ' + (e && e.stack || e)); fechar(); });

function fechar() {
  if (falhas.length) {
    console.log('território · orçamento: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + ':');
    falhas.forEach(f => console.log('  · ' + f));
    console.log('FALHOU: ' + falhas.length);
    process.exit(1);
  }
  console.log('território · orçamento: ' + ok + ' de ' + ok + ' ok');
  process.exit(0);
}
