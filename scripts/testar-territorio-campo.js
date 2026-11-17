/* ============================================================================
   TERRITÓRIO COMO ESTUDO DE CAMPO (17/11/26, design_handoff_territorio)

   O que esta guarda prova, num banco falso que conta cada pedido:
     · LEVE: a abertura lê só o territorio_resumo (todas as praças) e a medição; nenhuma tabela direto;
       trocar de praça, de camada e de aba do painel não lê nada; as visitas só entram quando uma camada
       ou aba precisa delas; a lista de leads só no clique;
     · CONGELADO: os botões que gravam continuam os de antes (mesmos comandos), e as réguas de distância
       são as do v5 (1,5 km · 4 km · 3 km);
     · A REGRA DE CLIQUE: nome abre a ficha, linha filtra, ponto abre o bairro, número abre a lista;
     · UM SÓ VERMELHO por tela e por gaveta; "não medido" desenhado; fonte fora é "—", nunca zero;
     · no máximo 8 rótulos no mapa, sem sobreposição; todo ponto com área de clique de 36 px.
   E prova que ela mesma fica VERMELHA numa cópia sabotada.
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
checar('o estudo de campo é a aba terr', codigo.indexOf('GV2.render.terr = GV2.render.tn;') > codigo.indexOf('GV2.render.terr = GV2.render.t4;'));
const bloco = codigo.slice(codigo.indexOf('/* tn:js:ini */'), codigo.indexOf('/* tn:js:fim */'));
checar('o bloco novo não chama nenhuma função do banco que grava (só as leituras de sempre)', !/supa\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(bloco), (bloco.match(/supa\.rpc\([^)]*|\.(insert|update|upsert|delete)\(/g) || []).join(' | '));
checar('a única leitura direta do bloco é o plano da semana (uma linha, na aba dele)', (bloco.match(/supa\.from\('([a-z_]+)'\)/g) || []).join() === "supa.from('planos_semanais')", (bloco.match(/supa\.from\('([a-z_]+)'\)/g) || []).join());

const R0 = Date;
global.Date = class extends R0 { constructor(...a) { super(...(a.length ? a : ['2026-11-17T15:00:00Z'])); } static now() { return new R0('2026-11-17T15:00:00Z').getTime(); } };
global.esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
global.document = undefined;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
global.sessaoAtual = { role: 'manager', ownerId: '99' };
global.DATA = { territorios: [{ rep: 'Sandro Souza', ativo: true, areas: [{ municipio: 'Rio de Janeiro', bairros: ['Méier'] }] }] };

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

const abrir = async (cod, opcoes) => {
  const pedidos = [], tabelas = [];
  const resp = (data) => ({ then: (a, b) => Promise.resolve({ data, error: null }).then(a, b) });
  const consulta = () => { const o = resp([]); ['select', 'eq', 'is', 'gte', 'in', 'order', 'range', 'not', 'lte', 'limit'].forEach(k => { o[k] = () => o; }); return o; };
  const visProva = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ owner_id: '11', provada: true, client_id: 'c' + (i % 4), visited_at: '2026-11-1' + (i % 5) + 'T1' + (3 + i % 4) + ':20:00Z', dia: '2026-11-1' + (i % 5) }));
  global.supa = {
    rpc: (nome, args) => { pedidos.push(nome); return resp(nome === 'territorio_resumo' ? (opcoes && opcoes.fora ? null : R) : nome === 'visitas_com_prova' ? visProva : nome === 'territorio_lista' ? { itens: [{ id: 1, nome: 'RESTAURANTE NOVO', bairro: 'Recreio', status: 'atribuido', chegou_ha_d: 12, vence_em_d: 9 }], total: 1 } : null); },
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
  const h = GV2.render.terr();
  const espera = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 3)); };
  return { GV2, pedidos, tabelas, h, espera, pinturas: () => pinturas };
};
const conta = (h, re) => (h.match(re) || []).length;
const clicar = (GV2, a) => GV2.tnComando(a.split(':')[0], a.split(':'));

(async () => {
  /* ── a abertura ── */
  const A = await abrir(codigo), G = A.GV2;
  checar('a abertura faz no máximo 3 pedidos ao banco', A.pedidos.length <= 3, A.pedidos.join(', '));
  checar('a abertura lê o territorio_resumo uma vez e mede a abertura uma vez', A.pedidos.filter(p => p === 'territorio_resumo').length === 1 && A.pedidos.filter(p => p === 'registrar_abertura').length === 1, A.pedidos.join(', '));
  checar('a abertura não lê nenhuma tabela direto nem as visitas', A.tabelas.length === 0 && A.pedidos.indexOf('visitas_com_prova') < 0, A.pedidos.join(', '));
  checar('a tela montou: frase, mapa, camadas e painel', /class="tn-fr"/.test(A.h) && /data-gv2-tnmapa="vv"/.test(A.h) && /class="tn-cam"/.test(A.h) && /class="tn-painel"/.test(A.h), A.h.slice(0, 200));
  checar('Todas abre na pior praça (a menor taxa de "caem onde o time anda") e diz qual', /o mapa abre na pior praça: Vitória, Vila Velha e Serra/.test(A.h));
  checar('a frase lê o time com os números do resumo', /O time fez 235 visitas em 12 bairros\./.test(A.h), (A.h.match(/class="tn-fr"[^>]*>([^<]*)/) || [])[1]);
  checar('o recorte traz o estado de cada praça: RJ bate, SP sem dono, ES maior buraco', /RJ<\/span><em> · bate/.test(A.h) && /SP<\/span><em> · sem dono/.test(A.h) && /ES<\/span><em> · maior buraco/.test(A.h), (A.h.match(/class="tn-rec"[\s\S]*?<\/div>/) || [''])[0].replace(/<[^>]+>/g, ' '));
  checar('carga nova na segunda: a faixa âmbar e o ponto em Abastecer; nenhum vermelho na primeira tela', /class="tn-faixa"/.test(A.h) && /tn-dot is-ambar/.test(A.h) && conta(A.h, /is-verm/g) === 0);
  checar('as seis camadas e os dois "+" estão na barra', ['dono', 'anda', 'quem', 'conv', 'leads', 'cart'].every(c => A.h.indexOf('data-gv2="tn:cam:' + c + '"') > 0) && /tn:mais"/.test(A.h) && /tn:agora"/.test(A.h));
  /* quem eu ajudo: a ordem da regra */
  const linhas = (A.h.match(/data-gv2="tn:pes:(\d+)"/g) || []).map(x => x.split(':')[2].replace(/\D/g, ''));
  checar('quem mais precisa primeiro: quase não foi à rua (Jean, depois Allef) › fila › dono longe', linhas[0] === '32' && linhas[1] === '22', linhas.join(','));
  checar('em Todas aparecem só 5 e o botão "Ver os 7"; "Comparar" ao lado', linhas.length === 5 && /Ver os 7</.test(A.h) && /tn:comparar/.test(A.h), linhas.length);
  checar('a leitura do dono longe diz o bairro e a distância', /dono de Recreio dos Bandeirantes, a [0-9,]+ km de onde anda/.test(A.h), (A.h.match(/dono de [^<]*/) || [])[0]);
  checar('o nome abre a ficha da pessoa e a linha filtra (dois alvos, dois destinos)', /class="tn-nome" data-gv2="pessoa:32"/.test(A.h) && /class="tn-pl-f" data-gv2="tn:pes:32"/.test(A.h));
  /* repintar e trocar de praça, camada e aba não leem nada */
  const n0 = A.pedidos.length;
  ['tn:pr:rj', 'tn:pr:sp', 'tn:cam:dono', 'tn:cam:quem', 'tn:cam:leads', 'tn:aba:atacar', 'tn:aba:ajudo', 'tn:mais', 'tn:agora', 'tn:pr:todas'].forEach(c => { clicar(G, c); G.render.terr(); });
  await A.espera();
  checar('trocar de praça, de camada (Anda × é dono, De quem é, Leads novos), de aba e ligar os "+" não lê nada', A.pedidos.length === n0, A.pedidos.slice(n0).join(', '));

  /* ── as camadas no mapa ── */
  const desenhar = (larg) => {
    const el = { clientWidth: larg || 1314, clientHeight: 555, _tn: null, parentNode: null, getBoundingClientRect: () => ({ left: 0, top: 0 }), cam: { innerHTML: '' }, querySelector: () => el.cam };
    G.tnMapa.simples(el);
    return el.cam.innerHTML;
  };
  const rects = (h) => (h.match(/class="tn-rot[^"]*" style="left:(-?\d+)px;top:(-?\d+)px">([^<]*)/g) || []).map(s => { const m = /left:(-?\d+)px;top:(-?\d+)px">([^<]*)/.exec(s); const w = Math.round(m[3].length * 6.4 + 18); return { a: +m[1], b: +m[1] + w, c: +m[2], d: +m[2] + 22 }; });
  const semColisao = (rs) => rs.every((r, i) => rs.every((o, j) => i === j || !(r.a < o.b && r.b > o.a && r.c < o.d && r.d > o.c)));
  clicar(G, 'tn:pr:rj'); G.estado.tn.mais = false; G.estado.tn.agora = false;
  clicar(G, 'tn:cam:anda'); G.render.terr();
  let m = desenhar();
  checar('Onde anda: um calor (três discos) e um ponto por bairro visitado', conta(m, /class="tn-calor"/g) === 7 && conta(m, /class="tn-centro"/g) === 7, conta(m, /class="tn-calor"/g));
  checar('todo ponto do mapa tem área de clique de 36 px ou mais e abre a ficha do bairro', (m.match(/class="tn-pt"[^>]*/g) || []).every(s => /width:(3[6-9]|[4-9]\d)px;height:(3[6-9]|[4-9]\d)px/.test(s) && /data-gv2="tn:b:/.test(s)), (m.match(/class="tn-pt"[^>]*/g) || [])[0]);
  checar('no máximo 8 rótulos, sem sobreposição', rects(m).length <= 8 && rects(m).length >= 3 && semColisao(rects(m)), rects(m).length);
  clicar(G, 'tn:mais'); G.render.terr(); m = desenhar();
  checar('"+ Leads novos" põe os círculos de lead por cima do calor', conta(m, /class="tn-lead/g) === 4 && conta(m, /class="tn-calor"/g) === 7, conta(m, /class="tn-lead/g));
  clicar(G, 'tn:cam:dono'); G.render.terr(); m = desenhar();
  checar('Anda × é dono: mancha na cor de quem visitou, anel na cor do dono e o pontinho de estado', conta(m, /class="tn-mancha"/g) === 8 && conta(m, /class="tn-anel/g) >= 7 && /tn-dot is-ok/.test(m) && /tn-dot is-acao/.test(m), conta(m, /class="tn-mancha"/g) + ' / ' + conta(m, /class="tn-anel/g) + ' / ' + (m.match(/tn-dot is-[a-z]+/g) || []).join());
  checar('o bairro só com visita ganha o dono pelo território (Méier é do Sandro)', G.tn.M.B.rj.por['rj|rio de janeiro|meier'].donoId === '11' && G.tn.M.B.rj.por['rj|rio de janeiro|meier'].dd === 0);
  clicar(G, 'tn:cam:quem'); G.render.terr(); m = desenhar();
  checar('De quem é: só o ponto, na cor do dono; sem manchas', conta(m, /class="tn-cheio/g) >= 7 && conta(m, /tn-mancha|tn-calor/g) === 0);
  clicar(G, 'tn:cam:leads'); G.render.terr(); m = desenhar();
  checar('Leads novos: círculo com a contagem de 30 dias', />38<\/i>/.test(m) && />16<\/i>/.test(m));
  clicar(G, 'tn:pr:sp'); G.render.terr(); m = desenhar();
  checar('em SP o bairro sem dono tem a borda tracejada (classe is-sem)', conta(m, /class="tn-lead is-sem"/g) === 2);
  clicar(G, 'tn:pr:rj'); clicar(G, 'tn:cam:anda'); clicar(G, 'tn:agora'); G.render.terr(); m = desenhar();
  checar('"+ Agora": as iniciais de quem fez check-in hoje, com "6 de 9", e o clique abre a ficha da pessoa', conta(m, /class="tn-pt is-agora"/g) === 3 && /· 6 de 9</.test(m) && /data-gv2="pessoa:11"/.test(m), conta(m, /is-agora/g));
  clicar(G, 'tn:agora');

  /* ── Onde atacar ── */
  clicar(G, 'tn:pr:todas'); clicar(G, 'tn:aba:atacar');
  let h = G.render.terr();
  checar('Onde atacar troca o mapa para Anda × é dono', G.estado.tn.cam === 'dono');
  checar('em Todas: uma recomendação por praça que tem o que atacar (o ES do teste bate: nenhuma), com a etiqueta e o motivo', conta(h, /class="tn-ct"/g) === 2 &&/RJ · Recreio dos Bandeirantes: 16 leads novos, o dono está a [0-9,]+ km\./.test(h) && /SP · Brás: 14 leads novos e ninguém é dono\./.test(h), (h.match(/class="tn-ct-t"[^>]*>[^<]*/g) || []).join(' | '));
  checar('o botão é o de sempre (Passar a André pelo t5passar) e só o primeiro é vermelho', /class="tn-bt is-verm" data-gv2="t5passar:rj\|rio de janeiro\|recreio dos bandeirantes:12">Passar os 14 a André</.test(h) && conta(h, /is-verm/g) === 1, (h.match(/class="tn-bt[^"]*" data-gv2="t[45][^"]*"[^>]*>[^<]*/g) || []).join(' | '));
  checar('sem dono abre a gaveta de dar dono que já existe (t4donos)', /data-gv2="t4donos">Dar dono</.test(h));
  checar('"Passar a" segue a régua do v5: dono a mais de 4 km e o outro a menos de 3 km', G.T5.PERTO === 4 && G.T5.PASSAR === 3 && G.T5.ANDA === 1.5 && G.tn.M.B.rj.por['rj|rio de janeiro|recreio dos bandeirantes'].dd > 4 && G.tn.M.B.rj.por['rj|rio de janeiro|recreio dos bandeirantes'].best.km < 3);
  checar('o texto da recomendação leva o mapa ao bairro', /class="tn-ct-t" data-gv2="tn:foco:rj\|rio de janeiro\|recreio dos bandeirantes"/.test(h));
  clicar(G, 'tn:aba:ajudo');
  checar('voltar a Quem eu ajudo devolve o calor', G.estado.tn.cam === 'anda');

  /* ── filtrado numa pessoa ── */
  clicar(G, 'tn:pes:13');
  h = G.render.terr();
  checar('filtrado em Júlio: a frase vira a leitura dele e a pílula diz "voltar ao time"', /Júlio é dono de Recreio dos Bandeirantes, e o lugar mais perto onde visitou fica a [0-9,]+ km\./.test(h) && /Filtrado em Júlio<button type="button" data-gv2="tn:time">voltar ao time/.test(h), (h.match(/class="tn-fr"[^>]*>([^<]*)/) || [])[1]);
  checar('o contexto traz o nome (abre a ficha), o papel e as visitas', /data-gv2="pessoa:13">Júlio Pinto da Silva<\/button> · em rampa · RJ · 32 visitas com prova em 2 bairros · 4 semanas/.test(h));
  checar('Como ajudar: o cartão do Recreio com o botão de hoje, um só vermelho', /Recreio dos Bandeirantes: 16 leads novos, o dono está a/.test(h) && /André anda a [0-9,]+ km daqui\./.test(h) && conta(h, /is-verm/g) === 1 && /t5passar:/.test(h));
  m = desenhar();
  checar('o mapa mostra só os bairros que ele visitou ou de que é dono, com a borda do dono', conta(m, /class="tn-pt"/g) === 3 && conta(m, /class="tn-calor"/g) === 2, conta(m, /class="tn-pt"/g) + '/' + conta(m, /class="tn-calor"/g));
  const n1 = A.pedidos.length;
  clicar(G, 'tn:pab:sug'); h = G.render.terr();
  checar('Sugerida: "não medido" desenhado, clicável, sem número inventado; nada lido', /class="tn-nm" data-gv2="tn:nm:sugerida"/.test(h) && A.pedidos.length === n1);
  clicar(G, 'tn:pab:horas'); h = G.render.terr();
  await new Promise(r => setTimeout(r, 1));
  checar('Horários pede as visitas (uma vez) e mostra carregando, sem número falso', A.pedidos.filter(p => p === 'visitas_com_prova').length === 1 && /tn-esqs/.test(h) && !/class="tn-q"/.test(h), A.pedidos.slice(n1).join(', ') + ' # ' + h.slice(h.indexOf('tn-painel'), h.indexOf('tn-painel') + 400));
  await A.espera(); await A.espera();
  clicar(G, 'tn:pes:11'); clicar(G, 'tn:pab:horas'); h = G.render.terr();
  checar('Horários: a grade seg a sex × 8h às 18h e os quatro números com a comparação do time', /class="tn-hg"/.test(h) && conta(h, /class="tn-hg-d"/g) === 5 && conta(h, /class="tn-q"/g) === 4 && /o time faz/.test(h), conta(h, /class="tn-q"/g));
  const nPlano = A.tabelas.filter(t => t === 'planos_semanais').length;
  clicar(G, 'tn:pab:plano'); h = G.render.terr(); await A.espera(); h = G.render.terr();
  checar('Plano × feito lê uma linha de planos_semanais (só nesta aba) e mostra os cinco dias', A.tabelas.filter(t => t === 'planos_semanais').length === nPlano + 1 && conta(h, /class="tn-pd"/g) === 5 && /O plano contra o feito/.test(h), conta(h, /class="tn-pd"/g));
  checar('sem plano gravado, diz isso em palavras', /não gravou plano nesta semana/.test(h));
  clicar(G, 'tn:time');

  /* ── as gavetas ── */
  const gav = () => G.rxGavConteudo();
  clicar(G, 'tn:b:rj|rio de janeiro|recreio dos bandeirantes');
  let g = gav();
  checar('ficha do bairro: título, dono e distância', g.rot === 'Ficha do bairro' && g.tit === 'Recreio dos Bandeirantes · RJ' && /^dono: Júlio · longe: está a [0-9,]+ km$/.test(g.sub) && G.estado.rxGav.t === 'tn6', g.tit + ' / ' + g.sub);
  checar('ficha do bairro: os quatro "não medido", a lista de leads e um só vermelho (Passar os 14 a André)', conta(g.corpo, /class="tn-nm"/g) === 4 && /tn:lista:leads:rj\|rio de janeiro\|recreio dos bandeirantes/.test(g.corpo) && conta(g.corpo, /is-verm/g) === 1 && />Passar os 14 a André</.test(g.corpo) && />Cobrar Júlio</.test(g.corpo) && />Ver a praça</.test(g.corpo));
  const nL = A.pedidos.filter(p => p === 'territorio_lista').length;
  clicar(G, 'tn:lista:leads:rj|rio de janeiro|recreio dos bandeirantes'); await A.espera();
  g = gav();
  checar('a lista de leads só é lida no clique, e o nome abre a ficha do lead', nL === 0 && A.pedidos.filter(p => p === 'territorio_lista').length === 1 && /data-gv2="t4lead:1"/.test(g.corpo) && G.estado.rxGav.t === 'tn8' && /tn:voltar/.test(g.acao), A.pedidos.filter(p => p === 'territorio_lista').length);
  clicar(G, 'tn:voltar');
  checar('Voltar devolve a ficha do bairro', G.estado.rxGav.k === 'bairro');
  clicar(G, 'tn:b:rj|rio de janeiro|vila valqueire'); g = gav();
  checar('onde converte na ficha: a contagem ao lado; com menos de 3 no divisor, só a contagem e "amostra pequena"', /Converte · aproximação · amostra pequena<\/small><b class="num">1 de 1</.test(g.corpo) || /Converte · aproximação<\/small><b class="num">\d+% · \d+ de \d+</.test(g.corpo), (g.corpo.match(/Converte[^<]*<\/small><b class="num">[^<]*/) || [])[0]);
  checar('a ficha diz quantos negócios ficaram de fora por não ter bairro', /Dos 3 negócios abertos do time, 1 não têm bairro no cadastro/.test(g.corpo), (g.corpo.match(/Dos \d+ negócios[^<]*/) || [])[0]);
  clicar(G, 'tn:praca:sp'); g = gav();
  checar('ficha da praça: leads novos, o caminho em cinco passos e o que a praça ensina', g.tit === 'São Paulo e Guarulhos' && /Caem onde o time anda/.test(g.corpo) && conta(g.corpo, /class="tn-passo"/g) === 5 && /Falou com o decisor/.test(g.corpo) && /Sem dono<\/span><b class="num">2</.test(g.corpo), g.tit);
  checar('"0 visitado" nunca parece tranquilo: a faixa diz em palavras', /Nenhum lead novo foi visitado nesta praça em 30 dias\./.test(g.corpo));
  checar('toda porcentagem anda com a contagem', /21% · 23 de 110/.test(g.corpo) && /60% · 53 de 89/.test(g.corpo));
  clicar(G, 'tn:praca:vv'); g = gav();
  checar('amostra pequena (2 fichas): só a contagem, sem porcentagem', /Falou com o decisor<\/span><b class="num">1 de 2</.test(g.corpo), (g.corpo.match(/Falou com o decisor<\/span><b class="num">[^<]*/) || [])[0]);
  clicar(G, 'tn:comparar'); g = gav();
  checar('Comparar: 5 colunas, os 7, e a linha filtra o Território na pessoa', conta(g.corpo, /class="tn-cmp"/g) === 7 && conta((g.corpo.match(/class="tn-cmp is-cab"[^>]*>(.*?)<\/div>/) || ['', ''])[1], /<span>/g) === 5 && /data-gv2="tn:pes:22"/.test(g.corpo) && G.estado.rxGav.t === 'tn8', conta(g.corpo, /class="tn-cmp"/g));
  checar('a fila acima de 13 semanas leva o ponto vermelho ("150 · 30 semanas")', /tn-dot is-acao"><\/i><b class="num">150<\/b> · 30 semanas/.test(g.corpo));
  /* Abastecer a semana: todos os botões da seção 4, os mesmos comandos, um vermelho */
  clicar(G, 'tn:abastecer'); g = gav();
  const cmds = ['t3carga:menos', 't3carga:mais', 't4plano', 't4previa', 't4eq', 't4redis', 't4sair', 't4donos', 'tn:comparar'];
  checar('Abastecer a semana traz os botões de sempre com os mesmos comandos', cmds.every(c => g.corpo.indexOf('data-gv2="' + c + '"') > 0), cmds.filter(c => g.corpo.indexOf('data-gv2="' + c + '"') < 0).join(', '));
  checar('um só vermelho na gaveta: Completar até 5', conta(g.corpo, /is-verm/g) === 1 && /class="tn-bt is-verm" data-gv2="t4plano">Completar até 5</.test(g.corpo));
  checar('os textos e os números do resumo: carga, fila, o que vence e dono do bairro', /Vão 35 para o plano; chegam cerca de 72\./.test(g.corpo) && /0 sugeridos · 0 confirmaram/.test(g.corpo) && /Redistribuir 9</.test(g.corpo) && /Deixar sair 9</.test(g.corpo) && /Dar dono aos 2</.test(g.corpo) && /Repartir 234</.test(g.corpo), (g.corpo.match(/Vão[^<]*/) || [])[0]);
  checar('"Deixar sair" e "Passar N" pedem o segundo clique', (function () { G.t4Comando('t4sair', ['t4sair']); const a = gav().corpo; G.t4Comando('t4eq', ['t4eq']); const b = gav().corpo; return /data-gv2="t4sair:ok"[^>]*>Confirmar: deixar sair 9</.test(a) && /data-gv2="t4eq:ok"[^>]*>Confirmar: passar \d+ de /.test(b); })());
  clicar(G, 'tn:rep'); g = gav();
  checar('Repartir avisa antes de trocar de aba, e o segundo clique é o comando de hoje (menu:acessos)', /Repartir fica na aba Acessos/.test(g.corpo) && /data-gv2="menu:acessos">Ir para Acessos/.test(g.corpo));
  /* depois de completar: pendentes */
  R.sugestoes = { semana: '2026-11-16', vale_ate: '2026-11-20', sugeridos: 35, confirmados: 4, pendentes: 31 }; G.tn.M = null; G.render.terr(); clicar(G, 'tn:abastecer'); g = gav();
  checar('depois de completar: o vermelho some e entram Retirar as pendentes e Cobrar quem não confirmou', conta(g.corpo, /is-verm/g) === 0 && /data-gv2="t4retirar"[^>]*>Retirar as 31 pendentes</.test(g.corpo) && /data-gv2="t4cobrartodos">Cobrar quem não confirmou</.test(g.corpo));
  R.sugestoes = { semana: '2026-11-16', vale_ate: '2026-11-20', sugeridos: 0, confirmados: 0, pendentes: 0 }; G.tn.M = null; G.render.terr();
  /* dar dono e Planejamento fecham a gaveta de cima e seguem para o comando original */
  clicar(G, 'tn:abastecer');
  checar('"Dar dono" fecha a gaveta de cima e deixa o comando original abrir a gaveta de dar dono', G.tnComando('t4donos', ['t4donos']) === false && !G.estado.rxGav);
  /* os comandos velhos têm casa nova */
  G.tnComando('t4b', ['t4b', 'rj|rio de janeiro|anil']);
  checar('o comando antigo do bairro (t4b) abre a ficha nova', G.estado.rxGav && G.estado.rxGav.k === 'bairro');
  G.tnFecharGav();
  /* não medido e conta */
  clicar(G, 'tn:nm:porta'); g = gav();
  checar('"não medido" abre o porquê e o que falta para medir', g.rot === 'Não medido' && /Por quê/.test(g.corpo) && /O que falta para medir/.test(g.corpo));
  clicar(G, 'tn:conta:converte'); g = gav();
  checar('a taxa abre como a conta é feita, e de quando é o dado', /Negócios do bairro em demo ou adiante ÷ restaurantes visitados/.test(g.corpo) && /dado de /.test(g.sub));
  G.tnFecharGav();

  /* ── a ficha única da pessoa ganha o bloco de campo ── */
  const ficha0 = G.v8GavPessoa;
  checar('a ficha da pessoa é embrulhada (o bloco de campo entra sem trocar a ficha)', typeof ficha0 === 'function' && /O campo · 4 semanas/.test(bloco) && /Ver ' \+ prim \+ ' no mapa/.test(bloco));
  clicar(G, 'tn:pessoa:13');
  checar('"Território →" da ficha chega filtrado na pessoa', G.estado.tn.pes === '13' && G.estado.aba === 'terr');
  clicar(G, 'tn:time');

  /* ── estados ── */
  const F = await abrir(codigo, { fora: true });
  checar('fonte fora: "—" e o nome da fonte, com Tentar de novo; nenhum zero', /— · os números do Território estão fora agora/.test(F.h) && /Fonte fora · territorio_resumo/.test(F.h) && /tn:ler/.test(F.h) && !/>0</.test(F.h));
  /* nada a fazer */
  const R2 = JSON.parse(JSON.stringify(R));
  R2.por_executivo = [P('11', 'Sandro Souza', 'rj', 'pleno', 6)]; R2.bairros = [bairros[3]]; R2.v5_visitas = visitas.filter(v => v[1] === '11'); R2.v5_ex = [{ owner_id: '11', ordem: 1, visitas: 62 }]; R2.carga_de = null; R2.resgate_14d = { vencem: 0 };
  const cod2 = codigo.replace("rpc('territorio_resumo', { p_praca: pr === 'todas' ? null : pr })", "rpc('territorio_resumo_2', { p_praca: null })");
  const resumo0 = R.por_executivo;
  const N = await (async () => { const sup = global.supa; const r = await abrir(cod2.replace('territorio_resumo_2', 'territorio_resumo')); return r; })();
  N.GV2.t4.cache.todas.r = R2; N.GV2.tn.M = null;
  h = N.GV2.render.terr();
  checar('nada a fazer: a linha verde, e nenhum vermelho', /Nada pede você agora\. O time anda onde é dono\./.test(h) && conta(h, /is-verm/g) === 0 && !/class="tn-faixa"/.test(h), (h.match(/class="tn-okl"[^>]*>[^<]*/) || [])[0]);
  checar('o resumo de teste não foi alterado pelo estado', resumo0 === R.por_executivo);

  /* ── o estilo: tokens, gavetas de 600 e 860 e celular ── */
  const css = tpl.slice(tpl.indexOf('/* tn:css:ini */'), tpl.indexOf('/* tn:css:fim */'));
  checar('as gavetas têm 600 e 860 px e a de dar dono acompanha', /is-tn6[^{]*\{width:min\(600px,100vw\)/.test(css) && /is-tn8[^{]*\{width:min\(860px,100vw\)/.test(css));
  checar('nenhum texto menor que 11 px no estilo novo', !(css.match(/font:[^;]*?\b(\d+(?:\.\d+)?)px/g) || []).some(s => Number(/(\d+(?:\.\d+)?)px/.exec(s)[1]) < 11), (css.match(/font:[^;]*?\b([0-9]|10)(\.\d+)?px[^;]*/g) || []).join(' | '));
  checar('no celular o painel vira a folha de baixo e os alvos têm 44 px', /@media \(max-width:760px\)\{[\s\S]*\.tn-painel\{left:0;right:0;top:auto;bottom:0/.test(css) && /\.tn-pt\{min-width:44px;min-height:44px/.test(css));

  /* ── a guarda fica vermelha quando alguém volta a ler tabela na abertura ── */
  const sab = codigo.replace('GV2.render.tn = function () {', "GV2.render.tn = function () { supa.from('leads_prospeccao').select('id');");
  checar('a sabotagem foi aplicada', sab !== codigo);
  const S = await abrir(sab);
  checar('sabotada (leads_prospeccao na abertura), a guarda acusa', S.tabelas.indexOf('leads_prospeccao') >= 0 && S.tabelas.length > 0);
  /* e quando um segundo vermelho aparece na primeira tela */
  const sab2 = codigo.replace("'<button type=\"button\" class=\"tn-bt\" data-gv2=\"aba:rua\">Rua →</button>", "'<button type=\"button\" class=\"tn-bt is-verm\" data-gv2=\"aba:rua\">Rua →</button>");
  checar('a segunda sabotagem foi aplicada', sab2 !== codigo);
  const S2 = await abrir(sab2);
  checar('sabotada (um vermelho na primeira tela), a contagem de vermelhos acusa', conta(S2.h, /is-verm/g) === 1);

  global.Date = R0;
  console.log(falhas.length ? '\nFALHOU (' + falhas.length + '):\n  ✗ ' + falhas.join('\n  ✗ ') : '');
  console.log('\n' + ok + ' conferências passaram' + (falhas.length ? ', ' + falhas.length + ' falharam' : ''));
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
