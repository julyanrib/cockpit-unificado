/* ============================================================================
   TERRITÓRIO · O CHÃO (17/11/26, design_handoff_territorio_v7)

   O que esta guarda prova, num banco falso que conta cada pedido:
     · LEVE: a abertura lê duas somas guardadas (territorio_resumo e territorio_chao) e a medição; nenhuma
       tabela direto; trocar de praça, de leitura e ligar o calor não lê nada; as visitas só entram em
       "Onde rende" e na ficha; a lista por trás do número só no clique;
     · O DADO NOVO: cliente ativo, em queda, lead na base e ex-cliente por bairro, e o EX-CLIENTE NUNCA
       CONTA COMO ATIVO (o dossiê de 17/11 somou os dois e a tela nasceu para corrigir);
     · A ORDEM de "Onde atacar" (aprovada pelo Julyan): clientes + leads na base + leads novos; sem visita
       vale o dobro; até 2 visitas, uma vez e meia; acima de 20, metade;
     · CONGELADO: os botões que gravam continuam os de antes (mesmos comandos), "Abastecer a semana" é a
       mesma gaveta, e as réguas de distância são as do v5 (1,5 km · 4 km · 3 km);
     · A REGRA DE CLIQUE: linha de bairro e ponto abrem a ficha, nome de pessoa abre a ficha dela, a linha
       de pessoa filtra o mapa, número abre a lista;
     · UM SÓ VERMELHO por tela e por gaveta; "não medido" desenhado; fonte fora é "—", nunca zero;
     · todo ponto do mapa tem nome e área de clique de 36 px.
   E prova que ela mesma fica VERMELHA em três cópias sabotadas.
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + String(porque).slice(0, 300) : '')); };

const ini = tpl.indexOf('<script id="gv2-js">');
const fim = tpl.indexOf('</script><!-- /gv2-js -->');
const codigo = tpl.slice(ini + '<script id="gv2-js">'.length, fim).replace('GV2.instalar();', '');
checar('o chão é a aba terr: a última atribuição, e a tela antiga (render.tn) não existe mais', codigo.lastIndexOf('GV2.render.terr = ') === codigo.lastIndexOf('GV2.render.terr = GV2.render.tc;') && codigo.indexOf('GV2.render.tn = ') < 0);
const bloco = codigo.slice(codigo.indexOf('/* tc:js:ini */'), codigo.indexOf('/* tc:js:fim */'));
checar('o bloco novo só chama as duas leituras do chão (nenhuma função que grava)', (bloco.match(/supa\.rpc\('([a-z_]+)'/g) || []).join() === "supa.rpc('territorio_chao',supa.rpc('territorio_chao_lista'" && !/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(bloco), (bloco.match(/supa\.rpc\('([a-z_]+)'/g) || []).join());
checar('o bloco novo não lê nenhuma tabela direto', !/supa\.from\(/.test(bloco));

const R0 = Date;
global.Date = class extends R0 { constructor(...a) { super(...(a.length ? a : ['2026-11-17T15:00:00Z'])); } static now() { return new R0('2026-11-17T15:00:00Z').getTime(); } };
global.esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
global.document = undefined;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '', hash: '', pathname: '/gestao' };
global.sessaoAtual = { role: 'manager', ownerId: '99' };
global.DATA = { territorios: [{ rep: 'Sandro Souza', ativo: true, areas: [{ municipio: 'Rio de Janeiro', bairros: ['Méier'] }] },
  { rep: 'Rodrigo Brandão', ativo: true, areas: [{ municipio: 'Vitória', bairros: ['Jardim Camburi', 'Jardim da Penha'] }] }] };

/* um time pequeno com os casos do dossiê: dono longe (Júlio/Recreio, André perto), concentrado, quase não foi à rua, sem dono */
const P = (id, nome, praca, ramp, fila) => ({ owner_id: id, nome, praca, ramp, chegou: 30, sugerido: 2, na_rota: 2, visitado: 0, negocio: 0, negocio_sem_visita: 0, primeira_visita_mediana_d: 9, primeira_visita_n: 3, vence_semana: 4, fila, sug_pendentes: 0, sug_confirmados: 0 });
const ex = [P('11', 'Sandro Souza', 'rj', 'pleno', 6), P('12', 'André Gomes', 'rj', 'pleno', 59), P('13', 'Júlio Pinto da Silva', 'rj', 'preparacao', 42),
  P('21', 'Sérgio Lima', 'sp', 'pleno', 116), P('22', 'Allef Costa', 'sp', 'preparacao', 150), P('31', 'Rodrigo Brandão', 'vv', 'preparacao', 38), P('32', 'Jean Guerra', 'vv', 'preparacao', 19)];
const B = (k, nome, mun, uf, pk, lat, lng, ativos, vencem, cob, donoId, dono, chegaram, venceram) => [k, nome, mun, uf, pk, lat, lng, ativos, ativos, vencem, cob, donoId, dono, 0, chegaram, venceram];
const bairros = [
  B('rj|rio de janeiro|barra da tijuca', 'Barra da Tijuca', 'Rio de Janeiro', 'RJ', 'rj', -23.0012, -43.3662, 34, 3, 'ok', '12', 'André Gomes', 38, 49),
  B('rj|rio de janeiro|recreio dos bandeirantes', 'Recreio dos Bandeirantes', 'Rio de Janeiro', 'RJ', 'rj', -23.0144, -43.4587, 14, 2, 'parcial', '13', 'Júlio Pinto da Silva', 16, 21),
  B('rj|rio de janeiro|anil', 'Anil', 'Rio de Janeiro', 'RJ', 'rj', -22.9530, -43.3390, 6, 0, 'ok', '13', 'Júlio Pinto da Silva', 9, 2),
  B('rj|rio de janeiro|vila valqueire', 'Vila Valqueire', 'Rio de Janeiro', 'RJ', 'rj', -22.8829, -43.3664, 5, 0, 'ok', '11', 'Sandro Souza', 5, 1),
  B('sp|sao paulo|bras', 'Brás', 'São Paulo', 'SP', 'sp', -23.5450, -46.6160, 14, 5, 'sem_dono', null, null, 14, 30),
  B('sp|sao paulo|liberdade', 'Liberdade', 'São Paulo', 'SP', 'sp', -23.5580, -46.6330, 13, 4, 'sem_dono', null, null, 13, 20),
  B('sp|sao paulo|jardim japao', 'Jardim Japão', 'São Paulo', 'SP', 'sp', -23.5020, -46.5760, 8, 1, 'ok', '21', 'Sérgio Lima', 8, 3),
  B('vv|vitoria|jardim da penha', 'Jardim da Penha', 'Vitória', 'ES', 'vv', -20.2818, -40.2992, 9, 1, 'ok', '31', 'Rodrigo Brandão', 9, 4),
  B('vv|serra|lagoa de carapebus', 'Lagoa de Carapebus', 'Serra', 'ES', 'vv', -20.2300, -40.2100, 7, 2, 'ok', '32', 'Jean Guerra', 12, 6)
];
const V = (pk, id, k, nome, lat, lng, n) => [pk, id, k, nome, lat, lng, n];
const visitas = [
  V('rj', '11', 'rj|rio de janeiro|vila valqueire', 'Vila Valqueire', -22.8829, -43.3664, 38), V('rj', '11', 'rj|rio de janeiro|meier', 'Méier', -22.9026, -43.2854, 24),
  V('rj', '12', 'rj|rio de janeiro|anil', 'Anil', -22.9530, -43.3390, 18), V('rj', '12', 'rj|rio de janeiro|gardenia azul', 'Gardênia Azul', -22.9600, -43.3500, 12),
  V('rj', '12', 'rj|rio de janeiro|vargem pequena', 'Vargem Pequena', -22.9950, -43.4420, 9), V('rj', '12', 'rj|rio de janeiro|barra da tijuca', 'Barra da Tijuca', -23.0012, -43.3662, 30),
  V('rj', '13', 'rj|rio de janeiro|anil', 'Anil', -22.9530, -43.3390, 22), V('rj', '13', 'rj|rio de janeiro|jacarepagua', 'Jacarepaguá', -22.9400, -43.3600, 10),
  V('sp', '21', 'sp|sao paulo|jardim japao', 'Jardim Japão', -23.5020, -46.5760, 22), V('sp', '22', 'sp|guarulhos|macedo', 'Macedo', -23.4620, -46.5300, 12),
  V('vv', '31', 'vv|vitoria|jardim da penha', 'Jardim da Penha', -20.2818, -40.2992, 25), V('vv', '31', 'vv|vitoria|praia do canto', 'Praia do Canto', -20.2950, -40.2930, 7),
  V('vv', '32', 'vv|serra|lagoa de carapebus', 'Lagoa de Carapebus', -20.2300, -40.2100, 6)
];
const R = { lido_em: '2026-11-17T14:51:00Z', hoje: '2026-11-17', semana_plano: '2026-11-16', praca: 'todas', carga_gestor: 5,
  carga_de: { dia: '2026-11-16', n: 30, ultima: '2026-11-16T07:49:00Z', bairros: 23 },
  funil_30d: { chegou: 308, com_dono: 280, sugerido: 21, na_rota: 21, visitado: 3, negocio: 1, negocio_sem_visita: 0 },
  semanas_4: [], por_executivo: ex, primeira_visita_geral: { mediana_d: 12, n: 17 },
  resgate_14d: { vencem: 18, redistribuiveis: 9, sem_dono: 9, saem_ate: '2026-12-02' },
  sugestoes: { semana: '2026-11-16', vale_ate: '2026-11-20', sugeridos: 0, confirmados: 0, pendentes: 0 }, visitou_semana_passada: 1, saiu_sem_visita_semana: 20,
  bairros, contra_quem: [['colibri', 7, 2]], carteira_quem_saiu: [{ nome: 'Kelly Travieso', owner: '91', lp: 0, pinos: 234 }], ids: null,
  v5_ex: ex.map((e, i) => ({ owner_id: e.owner_id, ordem: i + 1, visitas: visitas.filter(v => v[1] === e.owner_id).reduce((a, v) => a + v[6], 0) })),
  v5_visitas: visitas,
  v5_pracas: [{ praca: 'rj', chegaram: 136, anda: 94, ativos: 132, venceram: 716 }, { praca: 'sp', chegaram: 110, anda: 23, ativos: 263, venceram: 1391 }, { praca: 'vv', chegaram: 62, anda: 10, ativos: 87, venceram: 135 }],
  v5_fichas: [['rj', 'colibri', 206, 115, 78], ['sp', 'saipos', 89, 53, 26], ['vv', '', 2, 1, 1]] };

const C = (k, nome, cid, pk, lat, lng, cli, queda, base, exc, ab) => [k, nome, cid, pk, lat, lng, cli, queda, base, exc].concat(ab || [0, 0, 0, 0, 0, 0]);
const CHAO = { lido_em: '2026-11-17T14:52:00Z', hoje: '2026-11-17', fora: { rj: { sem: 57, total: 1627 }, sp: { sem: 48, total: 1825 }, vv: { sem: 29, total: 1169, cli: 4, queda: 1, base: 8, ex: 17 } }, bairros: [
  C('vv|vitoria|jardim camburi', 'JARDIM CAMBURI', 'Vitória', 'vv', -20.2576, -40.2694, 22, 3, 35, 26),
  C('vv|vitoria|jardim da penha', 'Jardim da Penha', 'Vitória', 'vv', -20.2818, -40.2992, 15, 2, 53, 12, [1, 13, 4, 0, 1, 0]),
  C('vv|vila velha|centro', 'Centro', 'Vila Velha', 'vv', -20.3300, -40.2900, 4, 0, 24, 3),
  C('vv|vitoria|centro', 'Centro', 'Vitória', 'vv', -20.3200, -40.3400, 2, 0, 10, 1),
  C('vv|vila velha|jardim camburi', 'Jardim Camburi', 'Vila Velha', 'vv', null, null, 0, 0, 1, 0),
  C('rj|rio de janeiro|recreio dos bandeirantes', 'Recreio dos Bandeirantes', 'Rio de Janeiro', 'rj', -23.0144, -43.4587, 15, 1, 37, 10, [0, 2, 0, 0, 0, 0]),
  C('rj|rio de janeiro|barra da tijuca', 'Barra da Tijuca', 'Rio de Janeiro', 'rj', -23.0012, -43.3662, 24, 0, 138, 17),
  C('rj|rio de janeiro|campo grande', 'Campo Grande', 'Rio de Janeiro', 'rj', null, null, 12, 2, 53, 9),
  C('sp|sao paulo|bras', 'Brás', 'São Paulo', 'sp', -23.5450, -46.6160, 0, 0, 40, 2),
  C('sp|sao paulo|pinheiros', 'Pinheiros', 'São Paulo', 'sp', -23.5670, -46.7020, 12, 2, 33, 6)
] };
const abrir = async (cod, opcoes) => {
  const pedidos = [], tabelas = [];
  const resp = (data) => ({ then: (a, b) => Promise.resolve({ data, error: null }).then(a, b) });
  const consulta = () => { const o = resp([]); ['select', 'eq', 'is', 'gte', 'in', 'order', 'range', 'not', 'lte', 'limit'].forEach(k => { o[k] = () => o; }); return o; };
  const visProva = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ owner_id: '11', provada: true, client_id: 'c' + (i % 4), visited_at: '2026-11-1' + (i % 5) + 'T1' + (3 + i % 4) + ':20:00Z', dia: '2026-11-1' + (i % 5) }));
  global.supa = {
    rpc: (nome, args) => { pedidos.push(nome); return resp(nome === 'territorio_resumo' ? (opcoes && opcoes.fora ? null : R) : nome === 'visitas_com_prova' ? visProva : nome === 'territorio_chao' ? (opcoes && opcoes.semChao ? null : CHAO) : nome === 'territorio_chao_lista' ? { itens: [{ nome: 'Churrasquinho do Isac', queda: true, motivo: 'sem comanda há 12 dias', ultima: '2026-11-05', plano: 'Inovação' }], total: 1 } : nome === 'territorio_lista' ? { itens: [{ id: 1, nome: 'RESTAURANTE NOVO', bairro: 'Recreio', status: 'atribuido', chegou_ha_d: 12, vence_em_d: 9 }], total: 1 } : null); },
    from: (t) => { pedidos.push('from:' + t); tabelas.push(t); const o = consulta(); if (t === 'clients') o.then = (a, b) => Promise.resolve({ data: [0, 1, 2, 3].map(i => ({ id: 'c' + i, bairro: 'Vila Valqueire', cidade: 'Rio de Janeiro', latitude: -22.8829, longitude: -43.3664 })), error: null }).then(a, b); return o; }
  };
  const GV2 = new Function(cod + '\nreturn GV2;')();
  let pinturas = 0;
  GV2.pintar = function () { pinturas++; };
  GV2.toast = function () {};
  GV2.rpcTudo = async (nome, args) => global.supa.rpc(nome, args);
  const pessoas = ex.map(e => ({ id: e.owner_id, nome: e.nome, praca: { rj: 'Rio de Janeiro', sp: 'São Paulo', vv: 'Vila Velha/ES' }[e.praca], iniciais: 'E',
    negocios: e.owner_id === '11' ? [{ id: 'n1', nome: 'Bar do Zé', dono: '11', etapa_idx: 3, lead: { bairro: 'Vila Valqueire', lat: -22.88, lng: -43.36 } }, { id: 'n2', nome: 'Sem Bairro', dono: '11', etapa_idx: 1, lead: {} }, { id: 'n3', nome: 'Cantina', dono: '11', etapa_idx: 1, lead: { bairro: 'Todos os Santos', lat: -22.895, lng: -43.283 } }] : [],
    hoje: { status: 'sem', paradas_plano: 9, visitas_com_prova: 6, visitas_todas: 6, posicao: e.praca === 'rj' ? { lat: -22.9, lng: -43.3 } : null } }));
  GV2.base = { agora: { iso: '2026-11-17', min: 12 * 60, dow: 2 }, pessoas, porId: Object.fromEntries(pessoas.map(p => [p.id, p])), negocios: [], cru: { fichas: [] }, faltas: [] };
  GV2.estado = Object.assign(GV2.estado || {}, { aba: 'terr', cobrados: {} });
  GV2.render.terr();
  await new Promise(r => setTimeout(r, 5));
  await (GV2.t4 && GV2.t4.cache.todas && GV2.t4.cache.todas.lendo);
  GV2.render.terr();
  await new Promise(r => setTimeout(r, 5));
  await (GV2.tc && GV2.tc.C.lendo);
  const h = GV2.render.terr();
  const espera = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 3)); };
  return { GV2, pedidos, tabelas, h, espera, pinturas: () => pinturas };
};
const conta = (h, re) => (h.match(re) || []).length;
const clicar = (GV2, a) => { const p = a.split(':'); return GV2.tcComando(p[0], p) || GV2.tnComando(p[0], p) || GV2.t4Comando(p[0], p); };

(async () => {
  /* ── a abertura ── */
  const A = await abrir(codigo), G = A.GV2;
  let h = A.h;
  checar('a abertura faz 3 pedidos ao banco: o resumo, o chão e a medição', A.pedidos.length === 3 && ['territorio_resumo', 'territorio_chao', 'registrar_abertura'].every(n => A.pedidos.filter(p => p === n).length === 1), A.pedidos.join(', '));
  checar('a abertura não lê nenhuma tabela direto nem as visitas', A.tabelas.length === 0 && A.pedidos.indexOf('visitas_com_prova') < 0, A.pedidos.join(', '));
  checar('a tela montou: frase, lista, mapa, chave de leitura do mapa e legenda', /class="tn-fr/.test(h) && /class="tc-lista"/.test(h) && /data-gv2-tnmapa="vv"/.test(h) && /class="tc-ov tc-m-topo"/.test(h) && /class="tc-ov tc-m-leg"/.test(h), h.slice(0, 200));
  const T = G.tc.M, M = G.tn.M;
  checar('abre na pior praça (o ES, "maior buraco") e o recorte traz o estado de cada uma', G.estado.tn.pr === 'vv' && /RJ<\/span><em> · bate/.test(h) && /SP<\/span><em> · sem dono/.test(h) && /ES<\/span><em> · maior buraco/.test(h), G.estado.tn.pr);
  checar('ex-cliente nunca conta como ativo: 47 clientes no ES (43 com bairro + 4 sem), 59 ex-clientes à parte', T.tot.vv.cli === 47 && T.tot.vv.cliSem === 4 && T.tot.vv.ex === 59 && T.tot.vv.queda === 6 && T.tot.vv.base === 131, JSON.stringify(T.tot.vv));
  checar('a frase lê o chão: clientes, bairros visitados de quantos', /No ES temos 47 clientes e o time visitou 3 de 7 bairros em 4 semanas\./.test(h), (h.match(/class="tn-fr[^>]*>([^<]*)/) || [])[1]);
  checar('o contexto traz clientes, leads na base, visitas e os bairros com 5 clientes ou mais e nenhuma visita', /47 clientes ativos · 131 leads na base · 38 visitas com prova · 1 bairro com 5 clientes ou mais e nenhuma visita/.test(h), (h.match(/<p>([^<]*clientes ativos[^<]*)/) || [])[1]);
  checar('a frase abre a ficha da praça e a faixa âmbar abre Abastecer a semana', /class="tn-fr[^"]*" data-gv2="tn:praca:vv"/.test(h) && /class="tn-faixa" data-gv2="tn:abastecer"/.test(h));
  checar('o cabeçalho traz Abastecer a semana, Pessoas e Rua', /data-gv2="tn:abastecer">/.test(h) && /data-gv2="aba:pessoas">Pessoas →/.test(h) && /data-gv2="aba:rua">Rua →/.test(h));
  /* a lista: a ordem aprovada */
  const ordem = (x) => (x.match(/class="tc-l" data-tc-b="([^"]+)"/g) || []).map(s => /data-tc-b="([^"]+)"/.exec(s)[1]);
  const esperada = ['vv|vitoria|jardim camburi', 'vv|vila velha|centro', 'vv|vitoria|jardim da penha', 'vv|vitoria|centro', 'vv|serra|lagoa de carapebus', 'vv|vila velha|jardim camburi'];
  checar('Onde atacar: (clientes + leads + novos) × 2 sem visita, × 0,5 acima de 20 visitas; quem não soma nada fica fora', ordem(h).join() === esperada.join(), ordem(h).join(' > '));
  checar('os pontos são os da regra: Jardim Camburi 114, Jardim da Penha 38,5', T.por['vv|vitoria|jardim camburi'].pts === 114 && T.por['vv|vitoria|jardim da penha'].pts === 38.5, T.por['vv|vitoria|jardim camburi'].pts + ' / ' + T.por['vv|vitoria|jardim da penha'].pts);
  checar('o motivo da linha são as parcelas da conta', /<small>22 clientes · 35 leads · nenhuma visita<\/small>/.test(h) && /<small>15 clientes · 53 leads · 25 visitas · 9 novos<\/small>/.test(h), (h.match(/<small>22 clientes[^<]*/) || [])[0]);
  checar('bairros de mesmo nome e de peso ganham o município (os dois Centros)', /<b>Centro · Vila Velha<\/b>/.test(h) && /<b>Centro · Vitória<\/b>/.test(h));
  checar('o homônimo de cadastro errado leva o município sozinho; o bairro de verdade fica com o nome limpo', /<b>Jardim Camburi<\/b>/.test(h) && /<b>Jardim Camburi · Vila Velha<\/b>/.test(h) && !/<b>Jardim Camburi · Vitória<\/b>/.test(h));
  checar('o nome do bairro em caixa alta é arrumado', /<b>Jardim Camburi<\/b>/.test(h));
  checar('sem visita, a barra de baixo é o contorno tracejado', conta(h, /class="tc-g-v is-nada"/g) === 4 && conta(h, /class="tc-g-v"><i/g) === 2, conta(h, /class="tc-g-v is-nada"/g));
  checar('o dono vem do território e a distância, das réguas do v5', /Rodrigo · (anda )?a [0-9,]+ km<\/em>/.test(h) && />sem dono<\/em>/.test(h), (h.match(/Rodrigo · [^<]*/) || [])[0]);
  checar('um só vermelho na primeira tela: a primeira ação da lista (Cobrar Rodrigo, em Jardim Camburi)', conta(h, /is-verm/g) === 1 && /class="tn-bt is-verm" data-gv2="tccobrar:tc:b:vv\|vitoria\|jardim camburi:2026-11-17">Cobrar Rodrigo</.test(h), (h.match(/class="tn-bt is-verm"[^>]*>[^<]*/g) || []).join(' | '));
  checar('a linha inteira abre a ficha do bairro e o pé traz a legenda e "Como a ordem é feita"', /class="tc-l-f" data-gv2="tn:b:vv\|vitoria\|jardim camburi"/.test(h) && /data-gv2="tn:conta:ordem">Como a ordem é feita</.test(h) && /class="tc-leg"/.test(h));
  /* trocar de praça, de leitura e ligar o calor não leem nada */
  const n0 = A.pedidos.length;
  ['tn:pr:rj', 'tn:pr:sp', 'tc:lei:dono', 'tc:mlei:temos', 'tc:mlei:dono', 'tc:calor', 'tc:calor', 'tc:lei:atacar', 'tc:todos', 'tc:mais', 'tc:todos', 'tn:pr:todas', 'tc:mapa', 'tc:mapa'].forEach(c => { clicar(G, c); G.render.terr(); });
  await A.espera();
  checar('trocar de praça, de leitura (lista e mapa), ligar o calor, "Ver todos" e o botão Mapa não leem nada', A.pedidos.length === n0, A.pedidos.slice(n0).join(', '));

  /* ── Todas ── */
  h = G.render.terr();
  checar('em Todas a lista mistura as praças, com a etiqueta de cada uma', /class="tc-l-pr">RJ</.test(h) && /class="tc-l-pr">SP</.test(h) && /class="tc-l-pr">ES</.test(h) && ordem(h).length === 8, ordem(h).length);
  checar('em Todas a frase soma as três praças e abre a conta', /Temos 110 clientes e o time visitou/.test(h) && /data-gv2="tn:conta:chao"/.test(h), (h.match(/class="tn-fr[^>]*>([^<]*)/) || [])[1]);
  let Mp = G.tn.mapa;
  checar('em Todas o mapa é um ponto por praça, com nome, e o clique entra na praça', Mp.k === 'todas' && Mp.pts.length === 3 && Mp.pts.every(p => /^tn:pr:(rj|sp|vv)$/.test(p.cmd) && /clientes?$/.test(p.rot)), Mp.pts.map(p => p.cmd + ' ' + p.rot).join(' | '));

  /* ── o mapa ── */
  const desenhar = (larg) => {
    const el = { clientWidth: larg || 800, clientHeight: 555, _tn: null, parentNode: null, getBoundingClientRect: () => ({ left: 0, top: 0 }), cam: { innerHTML: '' }, querySelector: () => el.cam };
    G.tnMapa.simples(el);
    return el.cam.innerHTML;
  };
  let m = desenhar();
  checar('o ponto da praça desenha com o comando dele (não abre ficha de bairro)', conta(m, /data-gv2="tn:pr:/g) === 3 && conta(m, /data-gv2="tn:b:/g) === 0, (m.match(/data-gv2="[^"]*"/g) || []).join());
  clicar(G, 'tn:pr:rj'); G.render.terr(); Mp = G.tn.mapa; m = desenhar();
  checar('O que temos: um ponto verde por bairro com cliente e ponto no mapa; todo ponto tem nome', Mp.pts.length === 2 && Mp.pts.every(p => p.rot && /is-temos/.test(p.h)) && /Barra da Tijuca · 24/.test(Mp.pts.map(p => p.rot).join()), Mp.pts.map(p => p.rot).join(' | '));
  checar('o bairro sem ponto próprio fica só na lista, e a legenda diz quantos', Mp.semPonto === 1 && /1 bairro sem ponto no mapa: está só na lista/.test(G.render.terr()), Mp.semPonto);
  checar('todo ponto tem área de clique de 36 px ou mais, abre a ficha do bairro e leva a chave para o destaque', (m.match(/class="tn-pt"[^>]*/g) || []).length === 2 && (m.match(/class="tn-pt"[^>]*/g) || []).every(s => /width:(3[6-9]|[4-9]\d)px;height:(3[6-9]|[4-9]\d)px/.test(s) && /data-gv2="tn:b:/.test(s) && /data-tck="rj\|/.test(s)), (m.match(/class="tn-pt"[^>]*/g) || [])[0]);
  checar('o calor é ligado por padrão: uma mancha por bairro visitado; desligado, some', conta(m, /class="tn-calor"/g) === 7 && (function () { clicar(G, 'tc:calor'); G.render.terr(); const x = desenhar(); clicar(G, 'tc:calor'); G.render.terr(); return conta(x, /class="tn-calor"/g) === 0; })(), conta(m, /class="tn-calor"/g));
  clicar(G, 'tc:mlei:dono'); G.render.terr(); Mp = G.tn.mapa; m = desenhar();
  checar('De quem é: borda na cor do dono (tracejada sem dono), o pontinho de estado, e o nome com o dono', Mp.pts.length >= 6 && Mp.pts.every(p => /is-dono/.test(p.h) && / · /.test(p.rot)) && /tn-dot is-ok/.test(m) && /tn-dot is-acao/.test(m) && /Recreio dos Bandeirantes · Júlio/.test(Mp.pts.map(p => p.rot).join()), Mp.pts.map(p => p.rot).join(' | '));
  checar('os rótulos não se sobrepõem e passam dos 8 do mapa antigo quando cabem', (function () { const rs = (m.match(/class="tn-rot[^"]*"[^>]*style="left:(-?\d+)px;top:(-?\d+)px">([^<]*)/g) || []).map(s => { const x = /left:(-?\d+)px;top:(-?\d+)px">([^<]*)/.exec(s); const w = Math.round(x[3].length * 6.4 + 18); return { a: +x[1], b: +x[1] + w, c: +x[2], d: +x[2] + 22 }; }); return rs.length >= 4 && rs.every((r, i) => rs.every((o, j) => i === j || !(r.a < o.b && r.b > o.a && r.c < o.d && r.d > o.c))); })());
  clicar(G, 'tc:mlei:temos');

  /* ── De quem é ── */
  clicar(G, 'tn:pr:todas'); clicar(G, 'tc:lei:dono'); h = G.render.terr();
  const pes = (h.match(/class="tc-l-f" data-gv2="tc:pes:(\d+)"/g) || []).map(s => /tc:pes:(\d+)/.exec(s)[1]);
  checar('De quem é: os 7, a fila mais longa primeiro (Allef 30 semanas, Sérgio 23)', pes.length === 7 && pes[0] === '22' && pes[1] === '21', pes.join(','));
  checar('a linha diz bairros que visitou, a fila em semanas e leads, e as visitas', /visitou 4 · é dono de/.test(h) && /30 semanas · 150 leads/.test(h) && /<s style="left:\d+%"><\/s>/.test(h), (h.match(/visitou [^<]*/g) || []).join(' | '));
  checar('a fila acima de 13 semanas é vermelha; a leitura do pé diz quem passou do limite', /class="tc-bar is-acao"/.test(h) && /Allef e Sérgio passaram das 13 semanas: o lead vence antes da vez\./.test(h), (h.match(/<p>[^<]*semanas[^<]*/) || [])[0]);
  checar('o nome abre a ficha da pessoa e a linha filtra o mapa (dois alvos, dois destinos)', /class="tn-nome" data-gv2="pessoa:22"/.test(h) && /class="tc-l-f" data-gv2="tc:pes:22"/.test(h) && /data-gv2="tn:comparar">Comparar</.test(h) && /data-gv2="t4donos">Dar dono</.test(h));
  checar('a mudança de leitura da lista leva a do mapa junto', G.estado.tn.mlei === 'dono');
  clicar(G, 'tc:pes:13'); G.render.terr(); Mp = G.tn.mapa;
  checar('a linha da pessoa mostra só os bairros dela no mapa (dona ou visitou); outro clique solta', Mp.k === 'rj' && Mp.pts.length > 0 && Mp.pts.every(p => { const b = T.por[p.k]; return b && (b.donoId === '13' || b.quem.some(q => q.id === '13')); }) && (function () { clicar(G, 'tc:pes:13'); return G.estado.tn.pes === null; })(), Mp.pts.map(p => p.rot).join(' | '));
  h = G.render.terr();
  checar('a legenda de pessoas fica à vista e cada uma filtra o mapa', (function () { clicar(G, 'tn:pr:rj'); const x = G.render.terr(); return conta(x, /class="tc-m-p[^"]*" aria-pressed="false" data-gv2="tc:pes:/g) === 3 && /class="tc-m-sd"/.test(x); })());

  /* ── Onde rende: é aqui que as visitas entram ── */
  const nv0 = A.pedidos.filter(p => p === 'visitas_com_prova').length;
  clicar(G, 'tc:lei:rende'); h = G.render.terr();
  checar('Onde rende pede as visitas e mostra carregando, sem número falso', nv0 === 0 && /aria-label="lendo as visitas"/.test(h) && !/class="tc-r"/.test(h));
  await A.espera(); await A.espera();
  h = G.render.terr();
  checar('Onde rende: a linha do bairro com a contagem ao lado, e o "não medido" de porta › cliente no pé', A.pedidos.filter(p => p === 'visitas_com_prova').length === 1 && /class="tc-r" data-tc-b="[^"]*vila valqueire"/.test(h) && /\d+ de \d+<\/span>/.test(h) && /data-gv2="tn:nm:porta"/.test(h), (h.match(/class="tc-r"[\s\S]{0,400}/) || [''])[0].replace(/<[^>]+>/g, ' ').slice(0, 120));
  clicar(G, 'tc:lei:atacar');

  /* ── as gavetas ── */
  const gav = () => G.rxGavConteudo();
  clicar(G, 'tn:pr:vv'); G.render.terr();
  clicar(G, 'tn:b:vv|vitoria|jardim camburi');
  let g = gav();
  checar('ficha do bairro: título, dono e se anda lá', g.rot === 'Ficha do bairro' && g.tit === 'Jardim Camburi · ES' && /^dono: Rodrigo · (longe: está|anda) a [0-9,]+ km/.test(g.sub) && G.estado.rxGav.t === 'tn6', g.tit + ' / ' + g.sub);
  checar('ficha do bairro: as cinco caixas do que temos, com os números do chão', conta(g.corpo, /class="tc-cx( [a-z-]+)?"/g) === 5 && />Clientes ativos<\/small><b class="num">22</.test(g.corpo) && />Em queda de uso<\/small><b class="num">3</.test(g.corpo) && />Leads na base<\/small><b class="num">35</.test(g.corpo) && />Ex-clientes<\/small><b class="num">26</.test(g.corpo) && /não é o tamanho do mercado/.test(g.corpo), conta(g.corpo, /class="tc-cx( [a-z-]+)?"/g));
  checar('ficha do bairro: "nenhuma" visita em vermelho, "sem conta" na conversão, e as visitas não são lidas à toa', /class="cv-fp-l tc-verm"><span>Visitas com prova<\/span><b class="num">nenhuma</.test(g.corpo) && />sem conta</.test(g.corpo) && /ninguém visitou, não há o que dividir/.test(g.corpo));
  checar('ficha do bairro: os quatro "não medido", o aviso do cadastro e um só vermelho (Cobrar Rodrigo)', conta(g.corpo, /class="tn-nm"/g) === 4 && /Meta do bairro/.test(g.corpo) && /perto de 1 em cada 40 não tem bairro/.test(g.corpo) && conta(g.corpo, /is-verm/g) === 1 && />Cobrar Rodrigo</.test(g.corpo) && />Ver a praça</.test(g.corpo) && /data-gv2="aba:pessoas">Pessoas →/.test(g.corpo));
  const nL = A.pedidos.filter(p => p === 'territorio_chao_lista').length;
  clicar(G, 'tn:lista:chao:cli:vv|vitoria|jardim camburi'); gav(); await A.espera(); await A.espera();
  g = gav();
  checar('o número abre a lista por trás dele, lida só no clique (50 por vez)', nL === 0 && A.pedidos.filter(p => p === 'territorio_chao_lista').length === 1 && /Churrasquinho do Isac/.test(g.corpo) && /em queda: sem comanda há 12 dias/.test(g.corpo) && G.estado.rxGav.t === 'tn8' && /tn:voltar/.test(g.acao) && /1 de 1 · até 50 por vez/.test(g.sub), g.sub);
  clicar(G, 'tn:voltar');
  checar('Voltar devolve a ficha do bairro', G.estado.rxGav.k === 'bairro');
  /* o bairro com lead novo e o dono longe mantém os botões de sempre */
  clicar(G, 'tn:b:rj|rio de janeiro|recreio dos bandeirantes'); g = gav();
  checar('com lead novo e o dono longe, o botão é o de sempre (Passar os 14 a André, pelo t5passar) e o Cobrar ao lado', conta(g.corpo, /is-verm/g) === 1 && /data-gv2="t5passar:rj\|rio de janeiro\|recreio dos bandeirantes:12"[^>]*>Passar os 14 a André</.test(g.corpo) && /data-gv2="t5cobrarb:t5:b:[^"]*">Cobrar Júlio</.test(g.corpo) && /tn:lista:leads:rj\|rio de janeiro\|recreio dos bandeirantes/.test(g.corpo), (g.corpo.match(/data-gv2="t5[^"]*"[^>]*>[^<]*/g) || []).join(' | '));
  checar('negócios abertos por etapa, com a lista atrás', />Negócios abertos<\/span><b class="num">2</.test(g.corpo) && /Visita 2/.test(g.corpo) && /tn:lista:chao:abertos:rj\|rio de janeiro\|recreio dos bandeirantes/.test(g.corpo));
  /* o Cobrar do chão manda o texto do chão, pelo mesmo aviso no app */
  let cobrado = null;
  G.cobrarNoApp = async (p, texto, chave) => { cobrado = { id: p.id, texto, chave }; G.estado.cobrados[chave] = true; return true; };
  G.tcComando('tccobrar', 'tccobrar:tc:b:vv|vitoria|jardim camburi:2026-11-17'.split(':')); await A.espera();
  checar('Cobrar no bairro sem lead novo: o aviso vai ao dono com o que temos lá e que ninguém foi', cobrado && cobrado.id === '31' && /em Jardim Camburi temos 22 clientes nossos e 35 leads na base\. Ninguém fez visita com prova lá em 4 semanas/.test(cobrado.texto) && /Põe um dia em Jardim Camburi no plano\?$/.test(cobrado.texto) && cobrado.chave === 'tc:b:vv|vitoria|jardim camburi:2026-11-17', cobrado && cobrado.texto);
  checar('depois de cobrado o botão vira "Cobrado" (não cobra duas vezes)', /Cobrado/.test(G.render.terr()) && (function () { const antes = cobrado; cobrado = null; G.tcComando('tccobrar', 'tccobrar:tc:b:vv|vitoria|jardim camburi:2026-11-17'.split(':')); return cobrado === null && !!antes; })());
  clicar(G, 'tn:praca:vv'); g = gav();
  checar('ficha da praça: o chão em cima e os blocos de sempre embaixo', g.rot === 'Ficha da praça' && g.corpo.indexOf('O chão · o que temos e o que fizemos') < g.corpo.indexOf('Leads novos') && />Clientes ativos<\/span><b class="num">47</.test(g.corpo) && /6 em queda de uso · 4 sem bairro no cadastro/.test(g.corpo) && />Bairros visitados<\/span><b class="num">3 de 7</.test(g.corpo) && /Caem onde o time anda/.test(g.corpo) && conta(g.corpo, /class="tn-passo"/g) === 5, g.corpo.slice(0, 160).replace(/<[^>]+>/g, ' '));
  clicar(G, 'tn:lista:chaob:vv'); g = gav();
  checar('"5 clientes ou mais e nenhuma visita" abre os bairros, e o bairro abre a ficha', /data-gv2="tn:b:vv\|vitoria\|jardim camburi"/.test(g.corpo) && conta(g.corpo, /class="tn-ll is-3" data-gv2/g) === 1);
  clicar(G, 'tn:conta:ordem'); g = gav();
  checar('"Como a ordem é feita" diz a regra aprovada', /clientes ativos \+ leads na base \+ leads novos esperando/.test(g.corpo) && /vale o dobro/.test(g.corpo) && /uma vez e meia/.test(g.corpo) && /metade/.test(g.corpo));
  clicar(G, 'tn:nm:meta'); g = gav();
  checar('"não medido" abre o porquê e o que falta para medir (a meta do bairro também)', g.rot === 'Não medido' && /Não existe meta por bairro/.test(g.corpo) && /O que falta para medir/.test(g.corpo));
  clicar(G, 'tn:comparar'); g = gav();
  checar('Comparar é a de sempre: 5 colunas e os executivos do recorte', conta(g.corpo, /class="tn-cmp"/g) === 2 && G.estado.rxGav.t === 'tn8', conta(g.corpo, /class="tn-cmp"/g));
  /* Abastecer a semana: igual, com os mesmos comandos e um vermelho */
  clicar(G, 'tn:abastecer'); g = gav();
  const cmds = ['t3carga:menos', 't3carga:mais', 't4plano', 't4previa', 't4eq', 't4redis', 't4sair', 't4donos', 'tn:comparar'];
  checar('Abastecer a semana traz os botões de sempre com os mesmos comandos', cmds.every(c => g.corpo.indexOf('data-gv2="' + c + '"') > 0), cmds.filter(c => g.corpo.indexOf('data-gv2="' + c + '"') < 0).join(', '));
  checar('um só vermelho na gaveta: Completar até 5', conta(g.corpo, /is-verm/g) === 1 && /class="tn-bt is-verm" data-gv2="t4plano">Completar até 5</.test(g.corpo));
  checar('os textos e os números do resumo: carga, o que vence e dono do bairro', /Vão 35 para o plano; chegam cerca de 72\./.test(g.corpo) && /Redistribuir 9</.test(g.corpo) && /Deixar sair 9</.test(g.corpo) && /Dar dono aos 2</.test(g.corpo) && /Repartir 234</.test(g.corpo), (g.corpo.match(/Vão[^<]*/) || [])[0]);
  checar('"Deixar sair" e "Passar N" pedem o segundo clique', (function () { G.t4Comando('t4sair', ['t4sair']); const a = gav().corpo; G.t4Comando('t4eq', ['t4eq']); const b = gav().corpo; return /data-gv2="t4sair:ok"[^>]*>Confirmar: deixar sair 9</.test(a) && /data-gv2="t4eq:ok"[^>]*>Confirmar: passar \d+ de /.test(b); })());
  checar('"Dar dono" fecha a gaveta de cima e deixa o comando original abrir a gaveta de dar dono', G.tnComando('t4donos', ['t4donos']) === false && !G.estado.rxGav);
  /* a ficha da pessoa chega ao Território filtrada, na leitura "De quem é" */
  clicar(G, 'tn:pessoa:13');
  checar('"Ver no mapa" da ficha da pessoa chega filtrado, em "De quem é"', G.estado.tn.pes === '13' && G.estado.tn.lei === 'dono' && G.estado.tn.mlei === 'dono' && G.estado.aba === 'terr');
  clicar(G, 'tc:pes:13'); clicar(G, 'tc:lei:atacar');

  /* ── o endereço ── */
  global.location.hash = '#/territorio?praca=rj&leitura=dono';
  const se = { pr: 'todas', lei: 'atacar', mlei: 'temos' };
  checar('o endereço guarda a praça e a leitura (e "es" é o ES)', G.tcEndereco.ler(se) === true && se.pr === 'rj' && se.lei === 'dono' && se.mlei === 'dono' && (function () { global.location.hash = '#/territorio?praca=es&leitura=atacar'; const x = { pr: 'todas' }; return G.tcEndereco.ler(x) && x.pr === 'vv'; })() && (function () { global.location.hash = '#/daily'; return G.tcEndereco.ler({}) === false; })());
  global.location.hash = '';

  /* ── estados ── */
  const F = await abrir(codigo, { fora: true });
  checar('fonte fora: "—" e o nome da fonte, com Tentar de novo; nenhum zero', /— · os números do Território estão fora agora/.test(F.h) && /Fonte fora · territorio_resumo/.test(F.h) && /data-gv2="tc:ler"/.test(F.h) && !/>0</.test(F.h));
  const SC = await abrir(codigo, { semChao: true });
  checar('só o chão fora: a tela segue com o que tem, mostra "—" no lugar dos clientes e diz o nome da fonte', /Fonte fora · territorio_chao/.test(SC.h) && /— clientes · — leads na base/.test(SC.h) && /<small>— clientes · /.test(SC.h) && !/temos 0 clientes/.test(SC.h) && /data-gv2="tc:ler"/.test(SC.h), (SC.h.match(/class="tc-fora"[^>]*>[^<]*/) || [])[0]);
  const vazio = G.render.tcAtacar(M, { B: { rj: [], sp: [], vv: [] }, tot: {}, semChao: false });
  checar('nada a fazer: "Nenhum bairro pede ataque.", sem botão vermelho', /Nenhum bairro pede ataque\./.test(vazio) && conta(vazio, /is-verm/g) === 0);
  checar('amostra pequena: com menos de 3 no divisor, só a contagem', G.tnTaxa(1, 2).pct === null && G.tnTaxa(1, 2).t === '1 de 2' && G.tnTaxa(3, 7).t === '43% · 3 de 7');

  /* ── o estilo ── */
  const css = tpl.slice(tpl.indexOf('/* tc:css:ini */'), tpl.indexOf('/* tc:css:fim */'));
  checar('a lista nunca corta uma linha: se não couber, rola por dentro', /\.tc-l-corpo\{[^}]*overflow-y:auto/.test(css));
  checar('a chave de leitura tem alvo de 36 px', /\.tc-chave button\{height:36px/.test(css));
  checar('a lista tem 680 px e o mapa fica com o resto', /\.tc-grade\{[^}]*grid-template-columns:680px minmax\(0,1fr\)/.test(css));
  checar('nenhum texto menor que 11 px no estilo novo', !(css.match(/font(?:-size)?:[^;]*?\b(\d+(?:\.\d+)?)px/g) || []).some(s => Number(/(\d+(?:\.\d+)?)px/.exec(s)[1]) < 11), (css.match(/font(?:-size)?:[^;]*?\b([0-9]|10)(\.\d+)?px[^;]*/g) || []).join(' | '));
  checar('no celular: a lista primeiro, o mapa no botão flutuante de 48 px e os alvos com 44 px', /@media \(max-width:760px\)\{[\s\S]*\.tc-mapa-w\{display:none;\}[\s\S]*\.tc-flut\{[^}]*height:48px/.test(css) && /\.tc-chave button\{height:44px/.test(css));
  checar('o calor é mancha contínua (degradê que some na borda), não disco', /\.tc \.tn-calor\{background:radial-gradient\(/.test(css) && /\.tc \.tn-calor > i\{display:none;\}/.test(css));

  /* ── a guarda fica vermelha: tabela lida na abertura, ex-cliente somado como ativo, segundo vermelho ── */
  const sab = codigo.replace('GV2.render.tc = function () {', "GV2.render.tc = function () { supa.from('clients').select('id');");
  checar('a sabotagem 1 foi aplicada', sab !== codigo);
  const S = await abrir(sab);
  checar('sabotada (clients lida na abertura), a guarda acusa', S.tabelas.indexOf('clients') >= 0);
  const sab2 = codigo.replace('b.cli = Number(a[6]) || 0;', 'b.cli = (Number(a[6]) || 0) + (Number(a[9]) || 0);');
  checar('a sabotagem 2 foi aplicada', sab2 !== codigo);
  const S2 = await abrir(sab2);
  checar('sabotada (ex-cliente somado como ativo), a conta de clientes acusa', S2.GV2.tc.M.tot.vv.cli === 89 && !/No ES temos 47 clientes/.test(S2.h));
  const sab3 = codigo.replace("class=\"tn-bt\" data-gv2=\"aba:pessoas\">Pessoas →</button>'\n", "class=\"tn-bt is-verm\" data-gv2=\"aba:pessoas\">Pessoas →</button>'\n");
  checar('a sabotagem 3 foi aplicada', sab3 !== codigo);
  const S3 = await abrir(sab3);
  checar('sabotada (um segundo vermelho na primeira tela), a contagem de vermelhos acusa', conta(S3.h, /is-verm/g) === 2);

  global.Date = R0;
  console.log(falhas.length ? '\nFALHOU (' + falhas.length + '):\n  ✗ ' + falhas.join('\n  ✗ ') : '');
  console.log('\n' + ok + ' conferências passaram' + (falhas.length ? ', ' + falhas.length + ' falharam' : ''));
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
