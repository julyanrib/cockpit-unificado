/* ============================================================================
   TERRITÓRIO DO GESTOR · v4 (06/11/26) — a suíte do Território (o nome de arquivo é o da v3)

   design_handoff_territorio_v4: a aba lê UMA coisa na abertura, territorio_resumo (migração 0258 do
   app), e o banco devolve as somas. Esta suíte roda o bloco gv2 do template de verdade num mundo falso
   (sexta 06/11/26, 12:00 em Brasília) com um banco falso que registra cada chamada, e prova:
     · o vocabulário único e a paridade: a linha "Total = funil" mostra o funil, e as linhas dos
       executivos somam o funil (sugerido, na rota, visitado, negócio; chegou = com dono);
     · o funil só desce; o gargalo é a menor passagem com base de 20 ou mais (sem a trava, ruído vira nó);
     · a frase do topo pela regra: gargalo chegou → sugerido, outro nó, dia da carga e semana boa;
     · Onde agir: a ordem (vence + 10 se tem na rota e ninguém visitado) e as três frases;
     · a fila: semanas = fila ÷ carga; "Passar N" só quando há fila > 10 semanas e folga na praça;
     · fonte fora: "—" e o nome da fonte em cada bloco, nunca 0;
     · os botões congelados chamam as MESMAS funções do v3 (sugerir_no_plano, retirar_sugestoes_territorio,
       redistribuir_recem_abertos, deixar_sair_recem_abertos com o 2º clique, dar_dono_bairro,
       definir_carga_territorio) e nenhuma escrita direta em tabela;
     · a lista é sob demanda, até 50 por vez, e a medição registra as ações novas;
     · um motor só: a sugestão do gestor passa na frente das contas-alvo no PLV3.sugestoes (Planejamento);
     · zero emoji; nada de "undefined" ou "NaN" na tela.
   O orçamento de leituras da abertura tem a suíte dele: scripts/testar-territorio-orcamento.js.
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + String(porque).slice(0, 400) : '')); };

const ini = tpl.indexOf('<script id="gv2-js">');
const fim = tpl.indexOf('</script><!-- /gv2-js -->');
checar('o bloco gv2 está no template', ini > 0 && fim > ini);
const codigo = tpl.slice(ini + '<script id="gv2-js">'.length, fim).replace('GV2.instalar();', '');
const v4 = codigo.slice(codigo.indexOf('/* ══ TERRITÓRIO v4 (06/11/26'), codigo.indexOf('GV2.render.terr = GV2.render.t4;'));
checar('o Território v4 está no bloco gv2 e é a aba terr', v4.length > 1000 && codigo.indexOf('GV2.render.terr = GV2.render.t4;') > 0);
checar('o bloco gv2 continua sem crase', codigo.indexOf('`') < 0);
checar('zero emoji no código da v4', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(v4));

/* ── o mundo falso: sexta 06/11/26, 12:00 em Brasília ── */
const R0 = Date;
global.Date = class extends R0 { constructor(...a) { super(...(a.length ? a : ['2026-11-06T15:00:00Z'])); } static now() { return new R0('2026-11-06T15:00:00Z').getTime(); } };
global.esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
global.document = undefined;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
global.sessaoAtual = { role: 'manager', ownerId: '99' };
global.DATA = { territorios: [] };

/* o resumo falso: o formato do territorio_resumo da 0258 */
const EX = (owner_id, nome, praca, ramp, c) => Object.assign({ owner_id, nome, praca, ramp, chegou: 0, sugerido: 0, na_rota: 0, visitado: 0, negocio: 0, negocio_sem_visita: 0,
  primeira_visita_mediana_d: null, primeira_visita_n: 0, vence_semana: 0, fila: 0, sug_pendentes: 0, sug_confirmados: 0 }, c);
const resumo = (mud) => Object.assign({
  lido_em: '2026-11-06T15:00:00Z', hoje: '2026-11-06', semana_plano: '2026-11-02', praca: 'todas', carga_gestor: 5,
  carga_de: { dia: '2026-11-04', n: 24, ultima: '2026-11-04T16:41:00Z', bairros: 16 },
  funil_30d: { chegou: 120, com_dono: 100, sugerido: 40, na_rota: 30, visitado: 9, negocio: 1, negocio_sem_visita: 4 },
  semanas_4: [{ semana: '2026-10-12', chegou: 60, sugerido: 0, na_rota: 0, visitado: 2, negocio: 0 }, { semana: '2026-10-19', chegou: 5, sugerido: 0, na_rota: 9, visitado: 3, negocio: 1 },
    { semana: '2026-10-26', chegou: 30, sugerido: 0, na_rota: 12, visitado: 3, negocio: 0 }, { semana: '2026-11-02', chegou: 25, sugerido: 40, na_rota: 9, visitado: 2, negocio: 0 }],
  por_executivo: [
    EX('1', 'Ana Lima', 'rj', 'pleno', { chegou: 50, sugerido: 20, na_rota: 13, visitado: 0, negocio: 0, vence_semana: 9, fila: 80, sug_pendentes: 4, sug_confirmados: 1 }),
    EX('2', 'Beto Reis', 'rj', 'pleno', { chegou: 30, sugerido: 12, na_rota: 9, visitado: 6, negocio: 1, primeira_visita_mediana_d: 9.6, primeira_visita_n: 3, vence_semana: 11, fila: 20, sug_pendentes: 5 }),
    EX('3', 'Caio Melo', 'vv', 'preparacao', { chegou: 20, sugerido: 8, na_rota: 8, visitado: 3, negocio: 0, primeira_visita_mediana_d: 16.2, primeira_visita_n: 7, vence_semana: 2, fila: 10 })],
  primeira_visita_geral: { mediana_d: 10.9, n: 10 },
  resgate_14d: { vencem: 30, redistribuiveis: 22, sem_dono: 8, saem_ate: '2026-11-20' },
  sugestoes: { semana: '2026-11-02', vale_ate: '2026-11-06', sugeridos: 10, confirmados: 1, pendentes: 9 },
  visitou_semana_passada: 7, saiu_sem_visita_semana: 300,
  bairros: [['rj|rio de janeiro|taquara', 'Taquara', 'Rio de Janeiro', 'RJ', 'rj', -22.92, -43.37, 30, 28, 4, 'ok', '1', 'Ana Lima', 6],
    ['rj|rio de janeiro|meier', 'Méier', 'Rio de Janeiro', 'RJ', 'rj', -22.90, -43.28, 20, 18, 2, 'parcial', '2', 'Beto Reis', 1],
    ['rj|rio de janeiro|madureira', 'MADUREIRA', 'Rio de Janeiro', 'RJ', 'rj', -22.87, -43.34, 18, 18, 3, 'sem_dono', null, null, 0],
    ['vv|vila velha|itapua', 'Itapuã', 'Vila Velha', 'ES', 'vv', -20.35, -40.29, 9, 9, 1, 'parcial', '3', 'Caio Melo', 0]],
  contra_quem: [['', 60, 20], ['nenhum', 20, 8], ['saipos', 12, 4], ['colibri', 6, 2]],
  carteira_quem_saiu: [{ nome: 'Gil Saiu', owner: '77', lp: 0, pinos: 12 }],
  ids: null
}, mud || {});
let R = resumo();
const IDS = { carga: { '1': ['a1', 'a2'], '3': ['c1'] }, redistribuir: [{ para: '1', nome: 'Ana Lima', ids: ['v1', 'v2'] }, { para: '2', nome: 'Beto Reis', ids: ['v3'] }], sair: ['s1', 's2'] };

/* o banco falso: registra TODA chamada; nenhuma escrita direta é permitida */
const chamadas = [], froms = [], escritas = [];
let fora = false;
const resp = (data, error) => ({ then: (a, b) => Promise.resolve({ data: error ? null : data, error: error || null }).then(a, b) });
const consulta = (t) => { const o = { then: (a, b) => Promise.resolve({ data: t === 'leads_prospeccao' ? [{ id: 'a1', nome: 'X' }] : [], error: null }).then(a, b) }; ['select', 'eq', 'is', 'gte', 'in', 'order', 'range'].forEach(k => { o[k] = () => o; }); o.maybeSingle = () => resp({ id: 'a1', nome: 'X' }); return o; };
global.supa = {
  rpc: (nome, args) => {
    chamadas.push({ nome, args: args || {} });
    if (nome === 'territorio_resumo') {
      if (fora) return resp(null, { message: 'statement timeout' });
      return resp(args && args.p_com_ids ? Object.assign({}, R, { ids: IDS }) : R);
    }
    if (nome === 'territorio_lista') {
      const off = (args && args.p_offset) || 0;
      const itens = Array.from({ length: off ? 20 : 50 }, (x, i) => ({ id: 'l' + (off + i), nome: 'RESTAURANTE ' + (off + i), bairro: 'TAQUARA', status: 'atribuido', chegou_ha_d: 10 + i, vence_em_d: 5 + i, sugerido_ate: null }));
      return resp({ total: 70, offset: off, por_vez: 50, itens });
    }
    if (nome === 'territorio_equilibrar') return resp({ '2': 4, '3': 3 });
    if (nome === 'registrar_abertura') return resp(null);
    return resp(args && args.p_leads ? args.p_leads.length : 1);
  },
  from: (t) => {
    froms.push(t);
    const w = (op) => (c) => { escritas.push({ t, op, c }); return consulta(t); };
    const o = consulta(t); o.update = w('update'); o.insert = w('insert'); o.upsert = w('upsert'); o.delete = w('delete');
    return o;
  }
};
const espera = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const GV2 = new Function(codigo + '\nreturn GV2;')();
  GV2.pintar = function () {};
  const toasts = [], recados = [];
  GV2.toast = function (t) { toasts.push(String(t)); };
  GV2.cobrarNoApp = async function (p, texto, chave) { recados.push({ id: p.id, texto, chave }); GV2.estado.cobrados[chave] = '12:00'; return true; };
  const P = (id, nome, praca) => ({ id, nome, praca, iniciais: nome[0], fase: 'Rua' });
  const pessoas = [P('1', 'Ana Lima', 'Rio de Janeiro'), P('2', 'Beto Reis', 'Rio de Janeiro'), P('3', 'Caio Melo', 'Vila Velha/ES')];
  GV2.base = { agora: { iso: '2026-11-06', min: 12 * 60, dow: 5 }, pessoas, porId: Object.fromEntries(pessoas.map(p => [p.id, p])), negocios: [], cru: { fichas: [] }, faltas: [] };
  GV2.estado = Object.assign(GV2.estado || {}, { aba: 'terr', cobrados: {} });
  checar('as funções da v4 existem', ['t4Ler', 't4Modelo', 't4Comando', 't4PorNoPlano', 't4Redistribuir', 't4Sair', 't4DarDono', 't4Equilibrar', 't4Abrir'].every(k => typeof GV2[k] === 'function') && typeof GV2.render.t4 === 'function');

  /* ── 0 · a abertura: esqueleto, uma leitura, a tela ── */
  let h = GV2.render.terr();
  checar('antes da leitura: esqueleto por bloco (carregando), nunca número', /gv2-t4-lendo/.test(h) && !/class="num"/.test(h));
  await espera(5);
  await (GV2.t4.cache.todas && GV2.t4.cache.todas.lendo);
  h = GV2.render.terr();
  checar('depois da leitura: os 4 blocos e a régua de cada um', ['1 · O FUNIL DO PROGRAMA', '1 · ONDE NO MAPA', '2 · POR EXECUTIVO', '3 · ONDE AGIR', '3 · O QUE VENCE', '3 · ARGUMENTO', '4 · A CARGA', '4 · A FILA', '4 · DONO DO BAIRRO'].every(k => h.indexOf(k) >= 0), h.slice(0, 300));
  checar('nada de undefined, NaN ou null na tela', !/undefined|NaN|>null</.test(h), (h.match(/.{60}(undefined|NaN|>null<).{60}/) || [''])[0]);
  checar('zero emoji na tela', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(h));

  /* ── 1 · o funil e a paridade ── */
  const M = GV2.t4M, f = M.f;
  const soma = (k) => M.ex.reduce((a, e) => a + e[k], 0);
  checar('as linhas somam o funil (sugerido, na rota, visitado, negócio) e chegou das linhas = com dono',
    ['sugerido', 'na_rota', 'visitado', 'negocio'].every(k => soma(k) === f[k]) && soma('chegou') === f.com_dono);
  const tot = (h.match(/<div class="gv2-t4-tr is-tot"[\s\S]*?<\/div>/) || [''])[0];
  checar('a linha "Total = funil" mostra o funil (chegou inclui os sem dono)', /Total = funil/.test(tot) && ['120', '40', '30', '9', '1'].every(n => tot.indexOf('>' + n + '<') >= 0), tot);
  checar('o funil só desce', f.chegou >= f.sugerido && f.sugerido >= f.na_rota && f.na_rota >= f.visitado && f.visitado >= f.negocio);
  checar('vocabulário único no funil: chegou · sugerido · na rota · visitado · negócio · saíram sem visita', ['CHEGOU', 'SUGERIDO', 'NA ROTA', 'VISITADO', 'NEGÓCIO', 'SAÍRAM SEM VISITA'].every(k => h.indexOf('<small>' + k + '</small>') >= 0));
  checar('chegou tem o selo "com dono" e o negócio sem visita vira a nota do rodapé', /100 com dono/.test(h) && /\+4 com negócio sem visita/.test(h));
  checar('o gargalo é a menor passagem com base de 20 ou mais: visitado → negócio (9) fica fora; o nó é na rota → visitado', M.gi === 3 && /O nó é na rota → visitado: só 30% passam\./.test(h), String(M.gi));
  const M1 = GV2.t4Modelo(resumo({ funil_30d: { chegou: 200, com_dono: 180, sugerido: 20, na_rota: 18, visitado: 10, negocio: 1 } }), 'todas');
  checar('gargalo chegou → sugerido: "Chegam ~N por semana e a carga põe C no plano"', M1.gi === 1 && /Chegam ~47 recém-abertos por semana e a carga põe 15 no plano: o nó é chegou → sugerido\./.test(GV2.render.t4Funil(M1)), GV2.render.t4Funil(M1).slice(0, 600));
  const M2 = GV2.t4Modelo(resumo({ funil_30d: { chegou: 15, com_dono: 12, sugerido: 9, na_rota: 5, visitado: 1, negocio: 0 } }), 'todas');
  checar('sem base de 20 em nenhuma passagem, não aponta nó', M2.gi === -1 && /nenhuma passagem tem a base de 20/.test(GV2.render.t4Funil(M2)));
  const Mc = GV2.t4Modelo(resumo({ carga_de: { dia: '2026-11-06', n: 197, ultima: '2026-11-06T06:10:00Z', bairros: 23 }, sugestoes: { semana: '2026-11-02', sugeridos: 0, confirmados: 0, pendentes: 0 } }), 'todas');
  checar('dia da carga: "Chegaram 197 hoje e ninguém recebeu sugestão ainda"', /Chegaram 197 hoje e ninguém recebeu sugestão ainda\. Primeiro passo da semana: a carga\./.test(GV2.render.t4Funil(Mc)) && /em 23 bairros/.test(GV2.render.t4Funil(Mc)));
  const exBoa = resumo().por_executivo.map(e => Object.assign({}, e, { vence_semana: 0 }));
  const Mb = GV2.t4Modelo(resumo({ por_executivo: exBoa, resgate_14d: { vencem: 0, redistribuiveis: 0, sem_dono: 0 } }), 'todas');
  checar('semana boa: frase verde e Onde agir "Ninguém deixando lead morrer"', /EM DIA/.test(GV2.render.t4Funil(Mb)) && /Ninguém deixando lead morrer\./.test(GV2.render.t4Agir(Mb)) && !/data-gv2="t4redis"/.test(GV2.render.t4Vence(Mb)));

  /* ── 2 · por executivo ── */
  checar('a linha inteira é o botão que abre a lista do executivo', (h.match(/<button type="button" class="gv2-t4-tr" data-gv2="t4ex:/g) || []).length === 3);
  checar('1ª visita: "9,6 d (3)" com n < 5; acima de 14 d em atenção; sem visita, "—"', /9,6 d \(3\)/.test(h) && /t-av" data-r="1ª visita">16,2 d</.test(h) && /data-r="1ª visita">—</.test(h));
  checar('vence: 5 ou mais em vermelho, 0 em verde', /t-acao" data-r="vence">11</.test(h) && /t-acao" data-r="vence">9</.test(h));
  checar('visitado 0 com na rota > 0 em atenção', /t-av" data-r="visitado">0</.test(h));
  checar('fila acima de 13 semanas em vermelho (Ana: 80 ÷ 5 = 16)', /t-acao" data-r="fila">80</.test(h));

  /* ── 3 · Onde agir, o que vence, argumento ── */
  checar('Onde agir: a ordem é vence + 10 se tem na rota e ninguém visitado (Ana 19 antes de Beto 11)', M.agir[0].owner_id === '1' && M.agir[1].owner_id === '2');
  checar('Onde agir: as frases', /Ana: 13 na rota, nenhum visitado\./.test(h) && /Beto: 11 vencem esta semana\./.test(h) && /leva 9,6 d até a 1ª visita/.test(h));
  checar('O que vence: o número, até quando, e os dois botões', /class="num t-acao">30</.test(h) && /saem do mapa até 20\/11/.test(h) && /Redistribuir 22/.test(h) && /Deixar sair 8/.test(h));
  checar('Argumento: o sistema normalizado e o "sem sistema" da nota', /<b>Nenhum<\/b>/.test(h) && /<b>Saipos<\/b>/.test(h) && /61,2% das fichas sem sistema/.test(h));

  /* ── 4 · carga, fila, dono ── */
  checar('a carga: − 5 +, vão 15 · chegam ≈ 28 · visitou 7, sugeridos e confirmados, e os botões', /data-gv2="t3carga:menos"/.test(h) && /vão 15 para o plano · chegam ≈ 28 · o time visitou 7/.test(h) && /10 sugeridos/.test(h) && /1 confirmou/.test(h) && /Retirar as 9 pendentes/.test(h) && /Completar até 5/.test(h) && /Cobrar quem não confirmou/.test(h));
  checar('a fila: semanas = fila ÷ carga, e acima de 13 vence antes da vez', /16 sem/.test(h) && /~15 vão vencer assim/.test(h));
  checar('Passar N: some sem folga na praça (Beto tem 4 semanas mas é Ana quem tem 16: aparece)', !!M.eq && M.eq.de.owner_id === '1' && M.eq.para[0].owner_id === '2' && M.eq.n === 30 && /Passar 30 de Ana para Beto/.test(h), JSON.stringify(M.eq && { de: M.eq.de.owner_id, n: M.eq.n }));
  const Mr = GV2.t4Modelo(resumo({ por_executivo: resumo().por_executivo.map(e => Object.assign({}, e, { ramp: 'preparacao' })) }), 'todas');
  checar('Passar N: quem está em rampagem não recebe', !Mr.eq);
  checar('dono do bairro: os sem dono e a carteira de quem saiu (o Repartir do Hoje, Acessos)', /Dar dono aos 1/.test(h) && /contas na carteira de quem saiu: Gil 12/.test(h) && /data-gv2="menu:acessos"[^>]*>Repartir/.test(h));
  checar('o mapa: um ponto por bairro, só a praça escolhida (RJ por padrão em Todas), nome do bairro capitalizado', GV2.t4.mapa.k === 'rj' && GV2.t4.mapa.bs.length === 3 && GV2.t4.mapa.bs.some(b => b.nome === 'Madureira') && /data-gv2-t4mapa="rj"/.test(h));

  /* ── 5 · os botões congelados: as mesmas funções do v3, nenhuma escrita direta ── */
  const desde = () => { const n = chamadas.length; return () => chamadas.slice(n).map(c => c.nome); };
  let d = desde();
  GV2.t4Comando('t4plano', ['t4plano']); await espera(20);
  const sug = chamadas.filter(c => c.nome === 'sugerir_no_plano').pop();
  checar('Completar: lê os ids no clique (resumo com ids) e grava com sugerir_no_plano, origem carga', d().indexOf('territorio_resumo') >= 0 && sug && sug.args.p_origem === 'carga' && sug.args.p_leads.join() === 'a1,a2,c1' && chamadas.find(c => c.nome === 'territorio_resumo' && c.args.p_com_ids === true && c.args.p_carga === 5), JSON.stringify(sug));
  d = desde();
  GV2.t4Comando('t4retirar', ['t4retirar']); await espera(20);
  checar('Retirar: retirar_sugestoes_territorio da semana do plano', chamadas.some(c => c.nome === 'retirar_sugestoes_territorio' && c.args.p_semana === '2026-11-02'), d().join());
  d = desde();
  GV2.t4Comando('t4redis', ['t4redis']); await espera(20);
  const red = chamadas.filter(c => c.nome === 'redistribuir_recem_abertos');
  checar('Redistribuir: uma chamada por destino, com os ids do resgate', red.length === 2 && red[0].args.p_para === '1' && red[0].args.p_leads.join() === 'v1,v2' && red[1].args.p_para === '2', JSON.stringify(red));
  GV2.estado.t4res = null;
  d = desde();
  GV2.t4Comando('t4sair', ['t4sair']); await espera(5);
  checar('Deixar sair: o 1º clique só pede a confirmação', d().indexOf('deixar_sair_recem_abertos') < 0 && /Confirmar: deixar sair 8/.test(GV2.render.t4Vence(GV2.t4M)));
  GV2.t4Comando('t4sair', ['t4sair', 'ok']); await espera(20);
  checar('Deixar sair: o 2º clique grava com deixar_sair_recem_abertos', chamadas.some(c => c.nome === 'deixar_sair_recem_abertos' && c.args.p_leads.join() === 's1,s2'));
  GV2.t4Comando('t4dono', ['t4dono', 'rj|rio de janeiro|madureira', '2']); await espera(20);
  const dd = chamadas.filter(c => c.nome === 'dar_dono_bairro').pop();
  checar('dar dono: dar_dono_bairro com o bairro, o município, a UF e o executivo', dd && dd.args.p_bairro === 'Madureira' && dd.args.p_municipio === 'Rio de Janeiro' && dd.args.p_uf === 'RJ' && dd.args.p_rep === 'Beto Reis', JSON.stringify(dd));
  d = desde();
  GV2.t4Comando('t4eq', ['t4eq']); await espera(5);
  checar('Passar N: o 1º clique só pede a confirmação', d().indexOf('territorio_equilibrar') < 0);
  GV2.t4Comando('t4eq', ['t4eq', 'ok']); await espera(20);
  const eq = chamadas.filter(c => c.nome === 'territorio_equilibrar').pop();
  checar('Passar N: territorio_equilibrar de quem tem a fila longa para quem tem folga', eq && eq.args.p_de === '1' && eq.args.p_para.join() === '2' && eq.args.p_n === 30, JSON.stringify(eq));
  GV2.t4Comando('t3carga', ['t3carga', 'mais']);
  if (GV2.t3Comando) GV2.t3Comando('t3carga', ['t3carga', 'mais']);
  await espera(1100);
  checar('a carga: o + do v3 grava com definir_carga_territorio', chamadas.some(c => c.nome === 'definir_carga_territorio' && c.args.p_carga >= 6));
  GV2.estado.cobrados = {};
  await GV2.t4Cobrar('t4:ag:1:2026-11-06');
  checar('Cobrar: recado no app de quem tem na rota sem visita, com a frase dele', recados.length === 1 && recados[0].id === '1' && /13 recém-abertos na rota e nenhum visitado/.test(recados[0].texto), JSON.stringify(recados));
  await GV2.t4CobrarTodos();
  checar('Cobrar quem não confirmou: um recado para cada um com sugestão pendente', recados.filter(r => /no seu Planejamento desta semana/.test(r.texto)).length === 2);
  checar('nenhuma escrita direta em tabela: tudo passa pelas funções do servidor', escritas.length === 0, JSON.stringify(escritas));
  checar('a medição registra as ações (pos_no_plano, redistribuiu, deixou_sair, deu_dono, equilibrou, definiu_carga)',
    ['pos_no_plano', 'redistribuiu', 'deixou_sair', 'deu_dono', 'equilibrou', 'definiu_carga'].every(a => chamadas.some(c => c.nome === 'registrar_abertura' && c.args.p_acao === a)),
    chamadas.filter(c => c.nome === 'registrar_abertura').map(c => c.args.p_acao).join());

  /* ── 6 · as gavetas: lista sob demanda, até 50 por vez ── */
  GV2.t4Comando('t4ex', ['t4ex', '1']); await espera(10);
  const li = chamadas.filter(c => c.nome === 'territorio_lista').pop();
  let g = GV2.render.t4Gav();
  checar('a gaveta do executivo lê territorio_lista dele, do começo', li && li.args.p_owner === '1' && li.args.p_offset === 0 && /50 de 70 \(até 50 por vez\)/.test(g), g.slice(-400));
  checar('a medição registra abriu_lista_exec', chamadas.some(c => c.nome === 'registrar_abertura' && c.args.p_acao === 'abriu_lista_exec'));
  checar('a gaveta tem KPIs, Cobrar e fecha (× e Fechar)', /chegaram · 30 d/.test(g) && /data-gv2="t4fechar"[^>]*aria-label="Fechar"/.test(g) && />Fechar</.test(g));
  GV2.t4Comando('t4maislista', ['t4maislista', 'ex§1']); await espera(10);
  checar('"mais" lê os próximos 50 (offset 50) e soma', chamadas.filter(c => c.nome === 'territorio_lista').pop().args.p_offset === 50 && /70 de 70/.test(GV2.render.t4Gav()));
  GV2.t4Comando('t4b', ['t4b', 'rj|rio de janeiro|madureira']); await espera(10);
  g = GV2.render.t4Gav();
  checar('a gaveta do bairro sem dono: lista pela chave, "sem dono · o motor não sugere aqui" e dar dono a quem roda perto',
    chamadas.filter(c => c.nome === 'territorio_lista').pop().args.p_bairro === 'rj|rio de janeiro|madureira' && /sem dono · o motor não sugere aqui/.test(g) && /data-gv2="t4dono:rj\|rio de janeiro\|madureira:/.test(g), g.slice(0, 500));
  checar('a medição registra abriu_lista_bairro', chamadas.some(c => c.nome === 'registrar_abertura' && c.args.p_acao === 'abriu_lista_bairro'));
  GV2.t4Comando('t4previa', ['t4previa']); await espera(20);
  checar('a prévia do Planejamento só lê quando a gaveta abre, e mede abriu_previa', froms.indexOf('planos_semanais') >= 0 && chamadas.some(c => c.nome === 'registrar_abertura' && c.args.p_acao === 'abriu_previa'));
  GV2.t4Comando('t4fechar', ['t4fechar']);
  checar('fechar tira a gaveta', GV2.render.t4Gav() === '');

  /* ── 7 · fonte fora: "—" e o nome da fonte, nunca 0 ── */
  fora = true;
  GV2.t4.cache = {};
  GV2.render.terr(); await espera(5); await (GV2.t4.cache.todas && GV2.t4.cache.todas.lendo);
  h = GV2.render.terr();
  checar('fonte fora: cada bloco com "—" e "Fonte fora · territorio_resumo"', (h.match(/Fonte fora · territorio_resumo/g) || []).length >= 8 && /FONTE FORA/.test(h), h.slice(0, 400));
  checar('fonte fora: nenhum número zero na tela', !/class="num[^"]*">0</.test(h));
  fora = false;

  /* ── 8 · um motor só: a sugestão do gestor entra no PLV3.sugestoes, pelo bairro do dia (Planejamento) ── */
  const PL = GV2.PLV3;
  if (PL && PL.alvosDoGestor) {
    const alvos = [{ ref: 'n-x', leadId: 'x', nome: 'X', bairro: 'b:taquara' }, { ref: 'n-y', leadId: 'y', nome: 'Y', bairro: 'b:taquara' }, { ref: 'n-z', leadId: 'z', nome: 'Z', bairro: 'b:meier' }];
    const ord = PL.alvosDoGestor(alvos, [{ lead_id: 'y', origem: 'carga', semana: '2026-11-02' }, { lead_id: 'z', origem: 'carga', semana: '2026-11-09' }], '2026-11-02');
    checar('a sugestão do gestor desta semana passa na frente; a de outra semana não muda nada', ord[0].ref === 'n-y' && ord[0].gestor === 'carga' && !ord.find(a => a.ref === 'n-z').gestor);
    const dias = [0, 1, 2, 3, 4].map(i => ({ iso: '2026-11-0' + (2 + i), feriado: '', passou: false, hoje: false }));
    const s = PL.sugestoes({ meta: 6, dias, cont: [5, 5, 5, 5, 5], bDia: ['b:taquara', 'b:meier', null, null, null], bSel: [null, null, null, null, null], fila: [], alvos: ord });
    checar('o motor é o mesmo: no dia do bairro, a vaga vai para a sugestão do gestor; Méier não recebe Taquara', s.deLead['n-y'] && s.deLead['n-y'].dia === 0 && !s.deLead['n-x'] && s.porDia[1].every(x => x.bairro === 'b:meier'), JSON.stringify(s.deLead));
  } else checar('o Planejamento v3 (PLV3) está no bloco', false);
  const dia = codigo.slice(codigo.indexOf('PLV3.diaHTML = function'), codigo.indexOf('PLV3.cartaoHTML = function'));
  checar('na grade do executivo a sugestão do gestor leva o selo RECÉM-ABERTO e só o "Pôr" dele grava', /tagHTML\('RECÉM-ABERTO', 'is-rota'\)/.test(dia) && /data-pv3-acao="por:/.test(dia));
  const por = codigo.slice(codigo.indexOf('PLV3.porNoDia = async function'), codigo.indexOf('PLV3.porVarios = async function'));
  checar('confirmar na grade anota a sugestão como confirmada (depois que a grade gravou)', /const ok = await PLV3\.mutar\(campos\)[\s\S]{0,200}if \(ok && alvo\)[\s\S]{0,200}PLV3\.confirmarGestor\(alvo\.leadId\)/.test(por));

  fechar();
})().catch(e => { falhas.push('erro: ' + (e && e.stack || e)); fechar(); });

function fechar() {
  if (falhas.length) {
    console.log('território v4: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + ':');
    falhas.forEach(f => console.log('  · ' + f));
    console.log('FALHOU: ' + falhas.length);
    process.exit(1);
  }
  console.log('território v4: ' + ok + ' de ' + ok + ' ok');
  process.exit(0);
}
