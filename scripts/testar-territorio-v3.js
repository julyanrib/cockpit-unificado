/* ============================================================================
   TERRITÓRIO DO GESTOR · v5 (11/11/26) — a suíte do Território (o nome de arquivo é o da v3)

   design_handoff_territorio_v5: a aba responde, por praça, onde cada executivo anda, onde chegam os leads
   que o gestor abastece e o que a praça ensina; embaixo, gerir. Tudo sai do territorio_resumo guardado
   (0259/0260). Esta suíte roda o bloco gv2 do template de verdade num mundo falso (sexta 06/11/26, 12:00
   em Brasília) com um banco falso que registra cada chamada, e prova:
     · as distâncias da regra: o dono "anda lá" até 1,5 km, "anda a N km" até 4, "longe" acima, "não
       visitou ainda" sem visita; "Passar a X" só quando o dono está a mais de 4 km E X visitou a menos de 3;
     · "caem onde anda" é o mesmo número na frase, na faixa, no quadro e no cartão da praça;
     · a frase do topo pela regra (o buraco = o bairro que mais recebe longe do dono) e a de Todas
       (a praça com o pior % é o maior buraco);
     · Onde cada um atua: "anda em", o alerta de dono longe, "EM RAMPA", "CHEGA ONDE ANDA" e o Cobrar;
     · o que a praça ensina: decisor, ausente, contra quem (sistema normalizado) e o programa;
     · os botões congelados chamam as MESMAS funções do v3 e o "Passar a X" usa a redistribuir_recem_abertos
       de hoje com os ativos do bairro (territorio_lista, de 50 em 50); nenhuma escrita direta;
     · a gaveta do bairro lê sob demanda; a do executivo não lê nada (as visitas vêm no resumo);
     · fonte fora: "—" e o nome da fonte, nunca 0; zero emoji; nada de undefined/NaN na tela;
     · um motor só: a sugestão do gestor passa na frente das contas-alvo no PLV3.sugestoes (Planejamento).
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
const v5 = codigo.slice(codigo.indexOf('/* ══ TERRITÓRIO v5 (11/11/26'), codigo.indexOf('GV2.render.terr = GV2.render.t4;'));
checar('o Território v5 está no bloco gv2 e é a aba terr', v5.length > 1000 && codigo.indexOf('GV2.render.terr = GV2.render.t4;') > 0);
checar('o bloco gv2 continua sem crase', codigo.indexOf('`') < 0);
checar('zero emoji no código do Território', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(v5));

/* ── o mundo falso: sexta 06/11/26, 12:00 em Brasília ── */
const R0 = Date;
global.Date = class extends R0 { constructor(...a) { super(...(a.length ? a : ['2026-11-06T15:00:00Z'])); } static now() { return new R0('2026-11-06T15:00:00Z').getTime(); } };
global.esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
global.document = undefined;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
global.sessaoAtual = { role: 'manager', ownerId: '99' };
global.DATA = { territorios: [] };

/* o resumo falso, no formato do territorio_resumo (0260). A geografia:
   Ana visita Taquara (-22.92,-43.37); Beto visita o Méier e a Barra Olímpica (-22.98,-43.38); Dani ainda não visitou.
   A Barra da Tijuca (-23.00,-43.37) é da Ana, a ~8,9 km da Taquara; o Beto visitou a ~2,4 km dela → "Passar a Beto".
   O Recreio (-23.015,-43.46) é da Ana e fica a mais de 3 km de todo mundo → longe, sem "Passar". */
const EX = (owner_id, nome, praca, ramp, c) => Object.assign({ owner_id, nome, praca, ramp, chegou: 0, sugerido: 0, na_rota: 0, visitado: 0, negocio: 0, negocio_sem_visita: 0,
  primeira_visita_mediana_d: null, primeira_visita_n: 0, vence_semana: 0, fila: 0, sug_pendentes: 0, sug_confirmados: 0 }, c);
const B = (k, nome, pk, lat, lng, ativos, chegaram, venceram, donoId, dono) => [k, nome, 'Rio de Janeiro', 'RJ', pk, lat, lng, ativos, ativos, 0, donoId ? 'parcial' : 'sem_dono', donoId, dono, 0, chegaram, venceram];
const resumo = (mud) => Object.assign({
  lido_em: '2026-11-06T15:00:00Z', hoje: '2026-11-06', semana_plano: '2026-11-02', praca: 'todas', carga_gestor: 5,
  carga_de: { dia: '2026-11-04', n: 24, ultima: '2026-11-04T16:41:00Z', bairros: 16 },
  funil_30d: { chegou: 120, com_dono: 100, sugerido: 40, na_rota: 30, visitado: 9, negocio: 1, negocio_sem_visita: 4 },
  semanas_4: [],
  por_executivo: [
    EX('1', 'Ana Lima', 'rj', 'pleno', { chegou: 50, vence_semana: 9, fila: 80, sug_pendentes: 4, sug_confirmados: 1 }),
    EX('2', 'Beto Reis', 'rj', 'pleno', { chegou: 30, vence_semana: 11, fila: 20, sug_pendentes: 5 }),
    EX('4', 'Dani Souza', 'rj', 'preparacao', { chegou: 12, fila: 12 }),
    EX('3', 'Caio Melo', 'vv', 'pleno', { chegou: 20, vence_semana: 2, fila: 10 })],
  primeira_visita_geral: { mediana_d: 10.9, n: 10 },
  resgate_14d: { vencem: 30, redistribuiveis: 22, sem_dono: 8, saem_ate: '2026-11-20' },
  sugestoes: { semana: '2026-11-02', vale_ate: '2026-11-06', sugeridos: 10, confirmados: 1, pendentes: 9 },
  visitou_semana_passada: 7, saiu_sem_visita_semana: 30,
  bairros: [
    B('rj|rio de janeiro|taquara', 'Taquara', 'rj', -22.92, -43.37, 28, 30, 6, '1', 'Ana Lima'),
    B('rj|rio de janeiro|barra da tijuca', 'Barra da Tijuca', 'rj', -23.00, -43.37, 22, 25, 40, '1', 'Ana Lima'),
    B('rj|rio de janeiro|recreio', 'Recreio', 'rj', -23.015, -43.46, 14, 16, 20, '1', 'Ana Lima'),
    B('rj|rio de janeiro|tijuca', 'Tijuca', 'rj', -22.926, -43.236, 12, 12, 25, '4', 'Dani Souza'),
    B('rj|rio de janeiro|meier', 'Méier', 'rj', -22.90, -43.28, 9, 10, 3, '2', 'Beto Reis'),
    B('rj|rio de janeiro|madureira', 'MADUREIRA', 'rj', -22.87, -43.34, 8, 8, 4, null, null),
    B('vv|vila velha|itapua', 'Itapuã', 'vv', -20.35, -40.29, 9, 20, 5, '3', 'Caio Melo')],
  v5_pracas: [{ praca: 'rj', chegaram: 100, anda: 70, ativos: 93, venceram: 700 }, { praca: 'vv', chegaram: 20, anda: 4, ativos: 9, venceram: 119 }],
  v5_ex: [{ owner_id: '1', visitas: 30, ordem: 1 }, { owner_id: '2', visitas: 20, ordem: 2 }, { owner_id: '4', visitas: 0, ordem: 3 }, { owner_id: '3', visitas: 8, ordem: 4 }],
  v5_visitas: [['rj', '1', 'rj|rio de janeiro|taquara', 'Taquara', -22.92, -43.37, 30], ['rj', '2', 'rj|rio de janeiro|meier', 'Méier', -22.90, -43.28, 12],
    ['rj', '2', 'rj|rio de janeiro|barra olimpica', 'Barra Olímpica', -22.98, -43.38, 8], ['vv', '3', 'vv|vila velha|itapua', 'Itapuã', -20.35, -40.29, 8]],
  v5_fichas: [['rj', '', 30, 10, 8], ['rj', 'saipos', 10, 5, 3], ['rj', 'nenhum', 5, 2, 2], ['vv', '', 5, 1, 1]],
  contra_quem: [], carteira_quem_saiu: [{ nome: 'Gil Saiu', owner: '77', lp: 0, pinos: 12 }], ids: null
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
      const itens = Array.from({ length: off ? 20 : 50 }, (x, i) => ({ id: 'l' + (off + i), nome: 'RESTAURANTE ' + (off + i), bairro: 'TAQUARA', status: 'atribuido', chegou_ha_d: 10 + i, vence_em_d: 5 + i, sugerido_ate: null, negocio: false }));
      return resp({ total: 70, offset: off, por_vez: 50, itens });
    }
    if (nome === 'territorio_equilibrar') return resp({ '2': 4 });
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
  const pessoas = [P('1', 'Ana Lima', 'Rio de Janeiro'), P('2', 'Beto Reis', 'Rio de Janeiro'), P('4', 'Dani Souza', 'Rio de Janeiro'), P('3', 'Caio Melo', 'Vila Velha/ES')];
  GV2.base = { agora: { iso: '2026-11-06', min: 12 * 60, dow: 5 }, pessoas, porId: Object.fromEntries(pessoas.map(p => [p.id, p])), negocios: [], cru: { fichas: [] }, faltas: [] };
  GV2.estado = Object.assign(GV2.estado || {}, { aba: 'terr', cobrados: {} });
  checar('as funções da v5 existem', ['t4Ler', 't4Modelo', 't5Praca', 't5Frase', 't5Passar', 't4Comando', 't4PorNoPlano', 't4Redistribuir', 't4Sair', 't4DarDono', 't4Equilibrar', 't4Abrir'].every(k => typeof GV2[k] === 'function'));

  /* ── 0 · a abertura: esqueleto, uma leitura, Todas ── */
  let h = GV2.render.terr();
  checar('antes da leitura: esqueleto por bloco, nunca número', /gv2-t4-lendo/.test(h) && !/class="num"/.test(h));
  await espera(5);
  await (GV2.t4.cache.todas && GV2.t4.cache.todas.lendo);
  h = GV2.render.terr();
  checar('Todas: um cartão por praça (RJ e ES) e o gerir de todas', (h.match(/class="card gv2-t4-card gv2-t5-pc/g) || []).length === 2 && /4 · GERIR O TERRITÓRIO · TODAS AS PRAÇAS/.test(h), h.slice(0, 300));
  checar('Todas: a praça com o pior "caem onde anda" ganha o selo MAIOR BURACO (ES 20%)', /<section class="card gv2-t4-card gv2-t5-pc is-ruim"><div class="gv2-t5-pch"><b>ES<\/b>/.test(h) && (h.match(/MAIOR BURACO/g) || []).length === 1);
  checar('Todas: a frase soma as praças e aponta o buraco', /Dos 120 recém-abertos de 30 dias, 62% caem onde o time anda\. ES é o maior buraco/.test(h), (h.match(/gv2-t5-frase[\s\S]{0,400}/) || [''])[0]);
  checar('Todas: "Abrir RJ ›" leva à praça', /data-gv2="t4pr:rj"[^>]*>Abrir RJ ›</.test(h));
  checar('nada de undefined, NaN ou null na tela', !/undefined|NaN|>null</.test(h), (h.match(/.{60}(undefined|NaN|>null<).{60}/) || [''])[0]);

  /* ── 1 · a praça ── */
  GV2.t4Comando('t4pr', ['t4pr', 'rj']);
  GV2.render.terr(); await espera(5); await (GV2.t4.cache.rj && GV2.t4.cache.rj.lendo);
  h = GV2.render.terr();
  const M = GV2.t4M, Pr = M.P;
  checar('a praça lê o resumo dela (p_praca rj)', chamadas.some(c => c.nome === 'territorio_resumo' && c.args.p_praca === 'rj'));
  checar('os 4 blocos e o gerir da praça', ['1 · O MAPA DA PRAÇA', '1 · ONDE CADA UM ATUA', '2 · ONDE CHEGAM OS LEADS QUE EU ABASTEÇO', '3 · O QUE A PRAÇA ENSINA', '4 · GERIR O TERRITÓRIO · RJ'].every(k => h.indexOf(k) >= 0));
  checar('nada de undefined, NaN ou null na praça', !/undefined|NaN|>null</.test(h), (h.match(/.{60}(undefined|NaN|>null<).{60}/) || [''])[0]);
  checar('zero emoji na tela', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(h));
  checar('a frase: % que cai onde anda + o buraco (o bairro que mais recebe longe do dono) e onde o dono anda',
    /No RJ, 70% dos leads caem onde o time anda\. O buraco é Barra da Tijuca: 25 chegaram em 30 dias, 40 venceram, e Ana anda em Taquara\./.test(h), (h.match(/gv2-t5-frase[\s\S]{0,500}/) || [''])[0]);
  checar('"caem onde anda" é o mesmo 70% na frase, na faixa e no quadro', (h.match(/70%/g) || []).length >= 3 && /dos 100 que chegaram caem num bairro onde o time visitou/.test(h) && /70 de 100 em 30 dias/.test(h));
  const linha = (nome) => (h.match(new RegExp('<div class="gv2-t5-tr"><button[^>]*>' + nome + '</button>[\\s\\S]*?</div>')) || [''])[0];
  checar('o dono anda lá (Taquara, 0 km): verde', /t-ok">anda lá</.test(linha('Taquara')), linha('Taquara'));
  checar('o dono longe (Barra, ~8,9 km) e o Beto visitou a menos de 3 km: "Passar a Beto"', /longe · 8,9 km/.test(linha('Barra da Tijuca')) && /data-gv2="t5passar:rj\|rio de janeiro\|barra da tijuca:2"[^>]*>Passar a Beto</.test(linha('Barra da Tijuca')), linha('Barra da Tijuca'));
  checar('longe e ninguém a menos de 3 km (Recreio): sem "Passar"', /longe ·/.test(linha('Recreio')) && !/t5passar/.test(linha('Recreio')), linha('Recreio'));
  checar('dono sem visita em 4 semanas (Tijuca): "não visitou ainda"', /t-acao">não visitou ainda</.test(linha('Tijuca')));
  checar('bairro sem dono (Madureira): "sem dono"', /sem dono/.test(linha('Madureira')));
  checar('a tabela mostra 6 bairros, os que mais recebem', (h.match(/<div class="gv2-t5-tr"><button/g) || []).length === 6);
  checar('venceram 10 ou mais em vermelho', /t-acao" data-r="venceram">40</.test(linha('Barra da Tijuca')));
  const ex = (nome) => (h.match(new RegExp('<div class="gv2-t5-ex">(?:(?!<div class="gv2-t5-ex">)[\\s\\S])*?>' + nome + '</button>[\\s\\S]*?(?=<div class="gv2-t5-ex">|</div></section>)')) || [''])[0];
  checar('Onde cada um atua: Ana anda em Taquara, é dona da Barra e do Recreio onde não anda, e tem Cobrar', /Anda em Taquara/.test(ex('Ana Lima')) && /Dono de Barra da Tijuca \(25\) e Recreio \(16\): não anda lá/.test(ex('Ana Lima')) && /data-gv2="t4cobrar:t5:ex:1:/.test(ex('Ana Lima')), ex('Ana Lima'));
  checar('Onde cada um atua: Beto, dono do Méier onde anda, leva "CHEGA ONDE ANDA" e não é cobrado', /CHEGA ONDE ANDA/.test(ex('Beto Reis')) && !/t4cobrar/.test(ex('Beto Reis')), ex('Beto Reis'));
  checar('Onde cada um atua: Dani em rampa, sem visita, com Cobrar', /EM RAMPA/.test(ex('Dani Souza')) && /Nenhuma visita com prova em 4 semanas/.test(ex('Dani Souza')) && /t4cobrar/.test(ex('Dani Souza')), ex('Dani Souza'));
  checar('a cor de cada executivo sai da ordem em equipe_cockpit (Ana 1ª, Beto 2ª)', Pr.cores['1'] === GV2.T5.cores[0] && Pr.cores['2'] === GV2.T5.cores[1]);
  checar('O que a praça ensina: decisor 37,8%, ausente 28,9%, contra quem Saipos e o programa', /37,8%/.test(h) && /28,9%/.test(h) && /<b class="num">Saipos<\/b>/.test(h) && /Programa:/.test(h));
  checar('o mapa: um círculo por bairro com coordenada e uma mancha por bairro visitado', GV2.t4.mapa.k === 'rj' && GV2.t4.mapa.leads.length === 6 && GV2.t4.mapa.manchas.length === 3 && /data-gv2-t4mapa="rj"/.test(h));
  checar('a legenda: "visitou:" com cada um e "leads · borda = dono"', /visitou:/.test(h) && /leads · borda = dono/.test(h));

  /* ── 2 · os botões: as mesmas funções do v3; o "Passar a" pela de hoje ── */
  let n0 = chamadas.length;
  GV2.t4Comando('t5passar', ['t5passar', 'rj|rio de janeiro|barra da tijuca', '2']); await espera(30);
  const listas = chamadas.slice(n0).filter(c => c.nome === 'territorio_lista');
  const red = chamadas.slice(n0).filter(c => c.nome === 'redistribuir_recem_abertos');
  checar('Passar a Beto: lê os ativos do bairro de 50 em 50 e grava com redistribuir_recem_abertos para o Beto',
    listas.length === 2 && listas[0].args.p_bairro === 'rj|rio de janeiro|barra da tijuca' && listas[1].args.p_offset === 50 && red.length === 1 && red[0].args.p_para === '2' && red[0].args.p_leads.length === 70, JSON.stringify({ listas: listas.length, red }));
  checar('Passar a Beto: a linha mostra "passados ✓" e o novo dono', /passados ✓/.test(GV2.render.t5Chegam(GV2.t4M, GV2.t4M.P)) && GV2.estado.t5movidos['rj|rio de janeiro|barra da tijuca'] === 'Beto');
  n0 = chamadas.length;
  GV2.t4Comando('t4plano', ['t4plano']); await espera(20);
  const sug = chamadas.slice(n0).filter(c => c.nome === 'sugerir_no_plano').pop();
  checar('Completar: os ids no clique (resumo com ids) e sugerir_no_plano, origem carga', sug && sug.args.p_origem === 'carga' && sug.args.p_leads.join() === 'a1,a2,c1');
  GV2.t4Comando('t4retirar', ['t4retirar']); await espera(20);
  checar('Retirar: retirar_sugestoes_territorio da semana do plano', chamadas.some(c => c.nome === 'retirar_sugestoes_territorio' && c.args.p_semana === '2026-11-02'));
  GV2.t4Comando('t4redis', ['t4redis']); await espera(20);
  checar('Redistribuir: uma chamada por destino', chamadas.filter(c => c.nome === 'redistribuir_recem_abertos' && (c.args.p_para === '1' || c.args.p_leads.join() === 'v3')).length === 2);
  GV2.estado.t4res = null;
  n0 = chamadas.length;
  GV2.t4Comando('t4sair', ['t4sair']); await espera(5);
  checar('Deixar sair: o 1º clique só pede a confirmação', !chamadas.slice(n0).some(c => c.nome === 'deixar_sair_recem_abertos'));
  GV2.t4Comando('t4sair', ['t4sair', 'ok']); await espera(20);
  checar('Deixar sair: o 2º clique grava', chamadas.some(c => c.nome === 'deixar_sair_recem_abertos' && c.args.p_leads.join() === 's1,s2'));
  GV2.t4Comando('t4dono', ['t4dono', 'rj|rio de janeiro|madureira', '2']); await espera(20);
  const dd = chamadas.filter(c => c.nome === 'dar_dono_bairro').pop();
  checar('dar dono: dar_dono_bairro com o bairro, o município, a UF e o executivo', dd && dd.args.p_bairro === 'Madureira' && dd.args.p_municipio === 'Rio de Janeiro' && dd.args.p_uf === 'RJ' && dd.args.p_rep === 'Beto Reis', JSON.stringify(dd));
  n0 = chamadas.length;
  GV2.t4Comando('t4eq', ['t4eq']); await espera(5);
  checar('Passar N (a fila): o 1º clique só pede a confirmação', !chamadas.slice(n0).some(c => c.nome === 'territorio_equilibrar'));
  GV2.t4Comando('t4eq', ['t4eq', 'ok']); await espera(20);
  const eq = chamadas.filter(c => c.nome === 'territorio_equilibrar').pop();
  checar('Passar N (a fila): territorio_equilibrar da Ana (fila 16 sem) para o Beto (4 sem, fora da rampa)', eq && eq.args.p_de === '1' && eq.args.p_para.join() === '2' && eq.args.p_n === 30, JSON.stringify(eq));
  if (GV2.t3Comando) GV2.t3Comando('t3carga', ['t3carga', 'mais']);
  await espera(1100);
  checar('a carga: o + do v3 grava com definir_carga_territorio', chamadas.some(c => c.nome === 'definir_carga_territorio' && c.args.p_carga >= 6));
  GV2.estado.cobrados = {};
  await GV2.t4Cobrar('t5:ex:1:2026-11-06');
  checar('Cobrar (onde cada um atua): o recado diz os bairros dela onde ela não anda', recados.length === 1 && recados[0].id === '1' && /Barra da Tijuca \(25\)/.test(recados[0].texto), JSON.stringify(recados));
  await GV2.t4Cobrar('t5:b:rj|rio de janeiro|recreio:2026-11-06');
  checar('Cobrar o dono pelo bairro: o recado diz o bairro, quantos esperam e onde ela anda', recados.length === 2 && recados[1].id === '1' && /em Recreio/.test(recados[1].texto) && /Taquara/.test(recados[1].texto), JSON.stringify(recados[1]));
  checar('nenhuma escrita direta em tabela', escritas.length === 0, JSON.stringify(escritas));
  checar('a medição registra as ações (pos_no_plano, redistribuiu, deixou_sair, deu_dono, equilibrou, definiu_carga)',
    ['pos_no_plano', 'redistribuiu', 'deixou_sair', 'deu_dono', 'equilibrou', 'definiu_carga'].every(a => chamadas.some(c => c.nome === 'registrar_abertura' && c.args.p_acao === a)));

  /* ── 3 · as gavetas ── */
  GV2.estado.t5movidos = {};
  n0 = chamadas.length;
  GV2.t4Comando('t4b', ['t4b', 'rj|rio de janeiro|barra da tijuca']); await espera(10);
  let g = GV2.render.t4Gav();
  checar('a gaveta do bairro lê a lista dele sob demanda e mede abriu_lista_bairro', chamadas.slice(n0).some(c => c.nome === 'territorio_lista' && c.args.p_bairro === 'rj|rio de janeiro|barra da tijuca') && chamadas.slice(n0).some(c => c.nome === 'registrar_abertura' && c.args.p_acao === 'abriu_lista_bairro'));
  checar('a gaveta do bairro: dono, a distância de onde ele anda, quem anda perto e "Passar os N a X"',
    /dono Ana · o lugar mais perto onde ele visitou fica a 8,9 km \(Taquara\) · Beto visitou a 2,4 km/.test(g) && /chegaram · 30 d/.test(g) && /Passar os 22 a Beto/.test(g), g.slice(0, 900));
  GV2.estado.cobrados = {};
  GV2.t4Comando('t4b', ['t4b', 'rj|rio de janeiro|recreio']); await espera(10);
  g = GV2.render.t4Gav();
  checar('a gaveta do bairro sem ninguém perto: "Cobrar Ana por Recreio"', /data-gv2="t5cobrarb:t5:b:rj\|rio de janeiro\|recreio:/.test(g) && /Cobrar Ana por Recreio/.test(g), g.slice(-700));
  n0 = chamadas.length;
  GV2.t4Comando('t4ex', ['t4ex', '2']); await espera(10);
  g = GV2.render.t4Gav();
  checar('a gaveta do executivo mostra onde ele visitou, sem ler nada', /Méier/.test(g) && /Barra Olímpica/.test(g) && /bairros/.test(g) && !chamadas.slice(n0).some(c => c.nome === 'territorio_lista'), g.slice(0, 600));
  GV2.t4Comando('t4fechar', ['t4fechar']);
  checar('fechar tira a gaveta', GV2.render.t4Gav() === '');
  GV2.t4Comando('t4previa', ['t4previa']); await espera(20);
  checar('a prévia do Planejamento só lê quando a gaveta abre', froms.indexOf('planos_semanais') >= 0 && chamadas.some(c => c.nome === 'registrar_abertura' && c.args.p_acao === 'abriu_previa'));
  GV2.t4Comando('t4fechar', ['t4fechar']);

  /* ── 4 · dia da carga ── */
  const Mc = GV2.t4Modelo(resumo({ carga_de: { dia: '2026-11-06', n: 197, ultima: '2026-11-06T06:10:00Z', bairros: 23 }, sugestoes: { semana: '2026-11-02', sugeridos: 0, confirmados: 0, pendentes: 0 } }), 'rj');
  Mc.P5 = { rj: GV2.t5Praca(Mc, 'rj') }; Mc.P = Mc.P5.rj;
  checar('dia da carga: selo CARGA NOVA e "comece pela carga"', /CARGA NOVA/.test(GV2.render.t5Frase(Mc)) && /Chegaram 197 recém-abertos hoje/.test(GV2.render.t5Frase(Mc)) && /comece pela carga/.test(GV2.render.t5Frase(Mc)));

  /* ── 5 · fonte fora: "—" e o nome da fonte, nunca 0 ── */
  fora = true;
  GV2.t4.cache = {};
  GV2.render.terr(); await espera(5); await (GV2.t4.cache.rj && GV2.t4.cache.rj.lendo);
  h = GV2.render.terr();
  checar('fonte fora: cada bloco com "—" e "Fonte fora · territorio_resumo"', (h.match(/Fonte fora · territorio_resumo/g) || []).length >= 8 && /FONTE FORA/.test(h), h.slice(0, 400));
  checar('fonte fora: nenhum número zero na tela', !/class="num[^"]*">0</.test(h));
  fora = false;

  /* ── 6 · um motor só: a sugestão do gestor entra no PLV3.sugestoes, pelo bairro do dia (Planejamento) ── */
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
    console.log('território v5: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + ':');
    falhas.forEach(f => console.log('  · ' + f));
    console.log('FALHOU: ' + falhas.length);
    process.exit(1);
  }
  console.log('território v5: ' + ok + ' de ' + ok + ' ok');
  process.exit(0);
}
