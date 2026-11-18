#!/usr/bin/env node
/* ============================================================================
   HOJE DO EXECUTIVO v5 (17/11/26, design_handoff_hoje_executivo) · o custo e as regras

   A tela nova (GV2.H5) mostra o dia, o dinheiro, a meta em ação, a missão, o que cobrar e
   a semana. Ela NÃO pode voltar a pesar a abertura: o que ela toca no banco é o contador
   de aberturas e UMA leitura pequena (as fichas de rua de hoje, só com visita no dia).
   Todo o resto é o que o Cockpit já tinha carregado e o placar do Hoje v4.

   As contas são funções puras do bloco; a suíte roda o bloco de verdade (recortado do
   template) com dado de teste igual ao da prancha (Marco, 17/11, 14h05) e confere os
   textos. No fim, três sabotagens: cada uma estraga uma regra e a suíte tem de acusar.

   Uso: node scripts/testar-hoje-v5.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');
let ok = 0;
const falhas = [];
function checar(nome, cond, porque) { if (cond) ok++; else falhas.push(nome + (porque ? '\n      ' + porque : '')); }
function recorte(a, b) { const i = tpl.indexOf(a), f = i < 0 ? -1 : tpl.indexOf(b, i); return i >= 0 && f > i ? tpl.slice(i, f + b.length) : ''; }

const js = recorte('/* h5:js:ini */', '/* h5:js:fim */');
const css = recorte('/* h5:css:ini */', '/* h5:css:fim */');
checar('o bloco do Hoje v5 existe (js e css)', js.length > 5000 && css.length > 3000);
const mod = js.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ── 1 · o custo ── */
const pesadas = ['GV2.montar(', 'EXH.carregar(', 'DV.carregar(', 'DV2.carregar(', 'garantirBase(', 'diaDoPlano(', 'carregarPlaybookProtegido(', 'recurso=playbook', 'carregarDailies(', 'carregarPdiCompromissos('];
const achou = pesadas.filter(function (x) { return mod.indexOf(x) >= 0; });
checar('a abertura não chama a montagem pesada, a base inteira nem o playbook', !achou.length, 'achei ' + achou.join(', '));
const rpcs = (mod.match(/rpc\('([a-z_0-9]+)'/g) || []).map(function (x) { return x.slice(5, -1); });
checar('rpc própria: só o contador de aberturas', rpcs.length === 1 && rpcs[0] === 'registrar_abertura', 'achei ' + rpcs.join(', '));
const tabelas = (mod.match(/supa\.from\('([a-z_0-9]+)'\)/g) || []).map(function (x) { return x.slice(11, -2); });
checar('tabela lida direto: só as fichas de rua de hoje, uma vez', tabelas.length === 1 && tabelas[0] === 'fichas_de_rua', 'achei ' + tabelas.join(', '));
checar('e essa leitura só sai com visita no dia e é guardada por 2 minutos', /if \(!v \|\| !v\.n\) return Promise\.resolve\(\);/.test(mod) && /st\.fichas\.em < 120000/.test(mod));
checar('o placar é o do Hoje v4 (a mesma leitura, a mesma guarda)', /HJ4\.lerPlacar\(\)/.test(mod) && mod.indexOf("rpc('placar_da_semana'") < 0);
checar('a grade da semana é a leitura leve do v4 (soGrade)', /pl6Carregar\(rep, pl6SegundaDaSemana\(\), \{ soGrade: true \}\)/.test(mod));
checar('o quadro do desempenho é lido de onde já está (DV2.estado.q), sem pedir de novo', /GV2\.DV2\.estado\.q \? GV2\.DV2\.vm\(\)/.test(mod));

/* ── 2 · a porta e o que é congelado ── */
checar('a porta do Hoje é uma só: o v5', /if \(typeof GV2 !== 'undefined' && GV2\.H5\) GV2\.H5\.render\(el, r\);\n\}/.test(tpl));
const velhos = ["getItem('hoje-v4')", "getItem('hoje-v3')", "getItem('hoje-v2')", 'HJ4.render', 'HJ3.', 'h8Fila', 'gatesDoDia(', 'data-exh=', 'id="hj4Raiz"', 'class="hj4', 'EXH.pintar'].filter(function (x) { return tpl.indexOf(x) >= 0; });
checar('os Hojes antigos (v2, v3 e v4) saíram do arquivo: nem tela, nem chave de volta', !velhos.length, 'achei ' + velhos.join(', '));
checar('"Pôr em [dia]" e o desfazer são os de sempre (HJ4.por, HJ4.desfazer)', /HJ4\.por\(arg\.slice\(0, u\), Number\(arg\.slice\(u \+ 1\)\)\)/.test(mod) && /HJ4\.desfazer\(/.test(mod));
checar('Comissão e Bônus abrem as gavetas de Minha conversão', /GV2\.MC\.gaveta\('comissao'\)/.test(mod) && /GV2\.MC\.gaveta\('bonus'\)/.test(mod));
checar('a parada abre a ficha do negócio de sempre', /GV2\.PLV3\.acao\('ficha', arg\)/.test(mod));
checar('a comissão é a da tabela (comissaoDe), sem faixa cravada aqui', /comissaoDe\(cli\)/.test(mod) && !/\b(250|300|400|500|550)\b/.test(mod));
checar('a parada da rota diz de que cliente é (o cruzamento com a ficha do dia)', /const info = \{ cid: st\.client_id \|\| null, pos:/.test(tpl));
checar('fonte fora mostra "—", nunca 0', /Fonte fora · /.test(mod) && /<b>—<\/b>/.test(mod));

/* ── 2b · os dados que vieram do v4 (GV2.HJ4): o custo e as regras que a suíte dele guardava ── */
const hIni = tpl.indexOf('const HJ4 = GV2.HJ4 = {};');
const hFim = tpl.indexOf('/* DESENVOLVIMENTO v2 NA PESSOAS DO GESTOR', hIni);
checar('o módulo de dados HJ4 existe', hIni > 0 && hFim > hIni);
const hj4 = hIni > 0 && hFim > hIni ? tpl.slice(hIni, hFim).replace(/\/\*[\s\S]*?\*\//g, ' ') : '';
const hPes = pesadas.filter(function (x) { return hj4.indexOf(x) >= 0; });
checar('HJ4 não chama a montagem pesada nem o playbook', !hPes.length, 'achei ' + hPes.join(', '));
const hRpc = (hj4.match(/rpc\('([a-z_0-9]+)'/g) || []).map(function (x) { return x.slice(5, -1); });
checar('o banco que o HJ4 toca é só o placar', hRpc.length === 1 && hRpc[0] === 'placar_da_semana' && !/supa\.from\(/.test(hj4), 'achei ' + hRpc.join(', '));
checar('HJ4 não pinta nada: quem grava avisa o v5', /HJ4\.pintarFunil = function \(\) \{ if \(GV2\.H5\) GV2\.H5\.pintar\(\); \};/.test(hj4) && /HJ4\.toast = function \(html, ms\) \{ if \(GV2\.H5\) GV2\.H5\.toast\(html, ms\); \};/.test(hj4) && !/innerHTML/.test(hj4));
checar('os leads saem da fila do Planejamento (PLV3.dados), não de uma conta própria', /PL\.dados\(rep\)/.test(hj4));
checar('"Pôr em [dia]" grava pelo caminho do Planejamento (PLV3.porNoDia)', /PL\.porNoDia\(ref, di\)/.test(hj4));
checar('desfazer só no "sem passo" (no vencido apagaria a tarefa antiga)', /if \(!pz \|\| pz\.vencido\) return;/.test(hj4));
checar('QUENTE é a regra do Planejamento (quenteCadencia), não o termômetro', /HJ4\.temp = function \(l\) \{ return l && l\.n && GV2\.quenteCadencia\(l\.n\)/.test(hj4) && !/tempFaixa/.test(hj4));

/* ── 3 · o visual que não pode escorregar ── */
checar('três colunas: 1fr · 370 · 370, e as de 370 encolhem até 300 antes de espremer a do dia', /\.h5-grade\{display:grid;grid-template-columns:minmax\(340px,1fr\) minmax\(300px,370px\) minmax\(300px,370px\);gap:12px;/.test(css));
checar('menos de 1050 vira duas, menos de 760 vira uma', /@media \(max-width:1050px\)\{\s*\.h5-grade\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);\}\s*\.h5-dia\{grid-column:1 \/ -1;\}/.test(css) && /@media \(max-width:760px\)\{[\s\S]*\.h5-grade\{grid-template-columns:minmax\(0,1fr\);\}/.test(css));
const hex = (css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(function (x) { return x.toLowerCase() !== '#fff'; });
checar('cor só pelos tokens (claro e escuro saem deles)', !hex.length, 'achei ' + hex.join(', '));
checar('no celular a parada tem 56 px e o botão 44', /\.h5-p\{min-height:56px;\}/.test(css) && /\.h5-bt,\.h5-bt\.is-p\{height:44px;/.test(css));

/* ── 4 · as contas, rodando o bloco de verdade ── */
const FERIADOS = ['2026-11-02', '2026-11-20'];
function mundo(codigo) {
  const GV2 = {
    pl: function (n, um, varios) { return n + ' ' + (n === 1 ? um : varios); },
    lista: function (xs) { return xs.length <= 1 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]; },
    prim: function (nome) { return String(nome || '').split(' ')[0]; },
    e: function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); },
    somaDias: function (iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
    dow: function (iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); },
    DIAS: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
    v6Fim: function (d) { return d.domingo; },
    PLV3: { pintar: function () {}, pintarComCalma: function () {},
      etapa: function (i) { return [['Prospecção', 'c0'], ['Visita', 'c1'], ['Conversa com Decisor', 'c2'], ['Demo/Proposta', 'c3'], ['Negociação', 'c4'], ['Ag. Pagamento', 'c5']][i]; },
      rotCurto: function (d) { return d.rot + ' ' + d.data.slice(0, 2); } }
  };
  GV2.util = function (iso) { const w = GV2.dow(iso); return w > 0 && w < 6 && FERIADOS.indexOf(iso) < 0; };
  const HJ4 = { st: { P: null }, pintarFunil: function () {}, toast: function () {}, MESES: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
    diaSem: function (iso) { return GV2.DIAS[GV2.dow(iso)]; }, ddmm: function (iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); },
    diaDoPor: function () { return 2; } };
  const faixa = function (n) { return n >= 15 ? 550 : n >= 10 ? 500 : n >= 8 ? 400 : n >= 6 ? 300 : 250; };
  const total = function (n) { return n * faixa(n); };
  const caixa = { GV2: GV2, HJ4: HJ4, console: console, Promise: Promise, Set: Set, Array: Array, Math: Math, Number: Number, String: String, Date: Date, Object: Object,
    comissaoRs: function (n) { return 'R$ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }, comissaoTotalDe: total, setTimeout: function () {}, clearTimeout: function () {} };
  vm.createContext(caixa);
  vm.runInContext(codigo.replace('const H5 = GV2.H5 = {};', 'var H5 = GV2.H5 = {};'), caixa);
  return { H5: caixa.GV2.H5, GV2: GV2, HJ4: HJ4, total: total, faixa: faixa };
}
/* o dia da prancha: Marco, ter 17/11, 14h05; 5 paradas, 2 feitas */
const PLANO = function () { return [
  { nome: 'Bar do Rocha', etapa: 'Demo/Proposta', bairro: 'Praia da Costa', feita: true, ref: 'c-1' },
  { nome: 'Ninho das Gaivotas Bar', etapa: 'Visita', bairro: 'Santa Mônica', feita: false, fixo: '16:00', ref: 'c-2' },
  { nome: 'JK Distribuidora', etapa: 'Negociação', bairro: '', feita: false, fixo: '14:30', ref: 'c-3' },
  { nome: 'Resplendor Distribuidora', etapa: 'Visita', bairro: 'Itapuã', feita: true, ref: 'c-4' },
  { nome: 'Royal Bebidas', etapa: 'Visita', bairro: 'Divino Espírito Santo', feita: false, ref: 'c-5' }
]; };
const PLACAR = function () { return { segunda: '2026-11-16', domingo: '2026-11-22', premio: 250, linhas: [
  { pos: 1, nome: 'Bruno Martins', pontos: 599, vendas: 2, reunioes: 5, visitas: 20 }, { pos: 2, nome: 'Rodrigo Caetano Brandão', pontos: 149, vendas: 0, reunioes: 2, visitas: 12 },
  { pos: 3, nome: 'André Gomes', pontos: 121, vendas: 0, reunioes: 1, visitas: 14 }, { pos: 4, nome: 'Marco Filho', pontos: 64, vendas: 0, reunioes: 0, visitas: 13, euMesmo: true },
  { pos: 5, nome: 'Júlio Pinto da Silva', pontos: 62, vendas: 0, reunioes: 1, visitas: 9 }, { pos: 6, nome: 'Larah', pontos: 40, vendas: 0, reunioes: 0, visitas: 8 }
] }; };
function provas(codigo) {
  const R = {};
  let M;
  try { M = mundo(codigo); } catch (er) { return { erro: String(er && er.message) }; }
  const H5 = M.H5;
  const p = function (nome, fn) { try { R[nome] = !!fn(); } catch (er) { R[nome] = false; } };

  p('hora: antes do 1º check-in, na rua até as 18h, fecho depois', function () {
    return H5.horaAuto(600, 0) === 'antes' && H5.horaAuto(600, 1) === 'rua' && H5.horaAuto(1079, 3) === 'rua' && H5.horaAuto(1080, 0) === 'fecho' && H5.horaAuto(1300, 5) === 'fecho';
  });
  p('"16:00" vira "16h" e "14:30" vira "14h30"', function () { return H5.hh('16:00') === '16h' && H5.hh('14:30:00') === '14h30' && H5.hh('') === ''; });
  p('o mês: 4 de 8 em 17/11 dá 8 dias úteis, esperado 5, abaixo do ritmo', function () {
    const m = H5.mes(4, 8, '2026-11-17');
    return m.falta === 4 && m.restam === 8 && m.esperado === 5 && m.ritmo.k === 'av' && m.pct === 50;
  });
  p('o mês: meta batida e sem meta', function () { return H5.mes(8, 8, '2026-11-17').ritmo.t === 'meta batida' && H5.mes(3, 0, '2026-11-17').ritmo === null; });

  p('antes de sair: ninguém é "a próxima"; o que tem hora diz "horário fixo"', function () {
    const ps = H5.paradas(PLANO(), 'antes', 480);
    return ps.every(function (x) { return x.est.k !== 'prox'; }) && ps[0].est.t === 'feita no app' && ps[1].est.t === 'horário fixo · 16h' && ps[2].est.t === 'horário fixo · 14h30' && ps[4].est.t === 'a fazer';
  });
  p('na rua: uma só "a próxima", e o horário fixo mais cedo fura a ordem (JK às 14h30)', function () {
    const ps = H5.paradas(PLANO(), 'rua', 845);
    return ps.filter(function (x) { return x.est.k === 'prox'; }).length === 1 && ps[2].est.t === 'a próxima · 14h30' && ps[1].est.t === 'horário fixo · 16h';
  });
  p('na rua: sem hora perto, a próxima é a primeira que falta na ordem', function () {
    const pl = [{ nome: 'A', feita: true }, { nome: 'B', feita: false }, { nome: 'C', feita: false, fixo: '16:00' }];
    return H5.proxima(pl, 540) === 1 && H5.proxima(pl, 905) === 2 && H5.proxima([{ nome: 'A', feita: true }], 540) === -1;
  });
  p('fecho: a que faltou "ficou para trás"; a feita sem ficha, sem "como foi"', function () {
    const pl = PLANO(); pl[3].comoFoi = true;
    const ps = H5.paradas(pl, 'fecho', 1100);
    return ps[1].est.t === 'ficou para trás' && ps[1].est.k === 'av' && ps[3].est.t === 'sem "como foi"' && ps[0].est.t === 'feita no app' && ps.every(function (x) { return x.est.k !== 'prox'; });
  });
  p('o rodapé: o que vence hoje, na ordem da hora', function () {
    const a = H5.rodape(H5.paradas(PLANO(), 'rua', 845), 'rua', []);
    const b = H5.rodape(H5.paradas(PLANO(), 'antes', 480), 'antes', []);
    const c = H5.rodape(H5.paradas([{ nome: 'A', feita: false }], 'antes', 480), 'antes', []);
    return a.rot === 'vence hoje' && a.t === 'JK Distribuidora às 14h30, horário fixo. Depois, Ninho das Gaivotas Bar às 16h.'
      && b.t === '2 horários fixos: JK Distribuidora às 14h30 e Ninho das Gaivotas Bar às 16h.' && c.t === 'Nenhum horário fixo hoje.';
  });
  p('o rodapé do fecho: o que registrar e o que volta para a fila', function () {
    const ps = H5.paradas(PLANO(), 'fecho', 1100);
    const a = H5.rodape(ps, 'fecho', ['Bar do Rocha', 'Resplendor', 'Outro', 'Mais um']);
    const b = H5.rodape(H5.paradas([{ nome: 'A', feita: true }], 'fecho', 1100), 'fecho', []);
    return a.rot === 'para fechar' && a.tom === 'av' && a.t === 'Registre o "como foi" de Bar do Rocha e mais 3. As 3 que ficaram para trás voltam para a fila de amanhã.' && b.t === 'Dia fechado: nada para registrar.';
  });

  p('o dinheiro: 4 clientes, meta 8 (a escada, a próxima, o salto, na meta)', function () {
    const n = 4, cm = { clientes: n, porCliente: M.faixa(n), total: M.total(n), proximaVenda: { clientes: 5, total: M.total(5), extra: M.total(5) - M.total(4) },
      degrau: { clientes: 6, porCliente: 300, total: M.total(6), faltam: 2, extra: M.total(6) - M.total(4) } };
    const x = H5.dinheiro(cm, 8, M.total);
    return x.total === 1000 && x.proxima === 250 && x.escada.length === 8 && x.escada.filter(function (g) { return g.k === 'feita'; }).length === 4 && x.escada[4].k === 'prox' && x.escada[7].k === 'futura'
      && x.naMeta.total === 3200 && x.naMeta.rende === 1100 && x.degrau.clientes === 6;
  });
  p('o dinheiro: acima da meta a escada segue até a próxima venda', function () {
    const cm = { clientes: 9, porCliente: 400, total: 3600, proximaVenda: { extra: 1400 }, degrau: null };
    const x = H5.dinheiro(cm, 8, M.total);
    return x.escada.length === 10 && x.naMeta === null && x.escada[9].k === 'prox';
  });

  p('o que cobrar: o dinheiro mais perto primeiro, até 4 linhas', function () {
    const leads = [{ ref: 'a', etapaIdx: 1, nome: 'V1' }, { ref: 'b', etapaIdx: 1, nome: 'V2' }, { ref: 'c', etapaIdx: 4, nome: 'N1' }, { ref: 'd', etapaIdx: 0, nome: 'P1' }, { ref: 'e', etapaIdx: 2, nome: 'D1' }, { ref: 'f', etapaIdx: 3, nome: 'M1' }, { ref: 'g', etapaIdx: 5, nome: 'fora' }];
    const c = H5.cobrar(leads, null);
    return c.total === 7 && c.linhas.map(function (x) { return x.idx; }).join(',') === '4,3,2,1' && c.mais === 1 && c.linhas[3].n === 2 && c.linhas[3].primeiro.nome === 'V1';
  });
  p('a semana: o degrau de cima (faltam 58 para passar o 3º), nunca o 1º', function () {
    const S = H5.semana(PLACAR());
    return S.eu.pos === 4 && S.acima.nome === 'André Gomes' && S.falta === 58 && S.linhas.length === 5 && !S.todosZero;
  });
  p('a semana: fora do top 5, ele entra como sexta linha', function () {
    const P = PLACAR(); P.linhas[3].euMesmo = false; P.linhas[5].euMesmo = true;
    const S = H5.semana(P);
    return S.linhas.length === 6 && S.linhas[5].nome === 'Larah' && S.acima.pos === 5 && S.falta === 23;
  });

  /* a tela inteira, com o dia da prancha */
  const tela = function (hora, muda) {
    const ps = H5.paradas(PLANO(), hora, 845);
    const n = 4;
    const V = { hoje: '2026-11-17', min: 845, nome: 'Marco Filho', hub: 'HubSpot atualizado às 20h06', hora: hora, temQuadro: true, placar: 'ok',
      dia: { semPlano: false, util: true, bairro: 'Itapuã', total: 5, feitas: 2, visitas: 2, meta: 6, demos: 0, metaDemo: 1, demosIds: [], visitasIds: [], semanaVis: 13, paradas: ps, rodape: H5.rodape(ps, hora, []), semFicha: [], fichasLidas: true },
      din: H5.dinheiro({ clientes: n, porCliente: 250, total: 1000, proximaVenda: { extra: 250 }, degrau: { clientes: 6, porCliente: 300, total: 1800 } }, 8, M.total),
      mes: H5.mes(4, 8, '2026-11-17'), J: { faltam: 4, portas: 30, demos: 7 }, semana: H5.semana(PLACAR()),
      bonus: { premio: 250, t: 'faltam 58 pts para passar André. Três demos passam.' },
      missao: { titulo: 'O "como foi" antes de ligar o carro', contagem: '0 de 2', alvo: 2, prazo: 'até qui 19/11', selo: 'Registro na hora' },
      seq: [{ id: 'rua', titulo: 'Na rua há 5 dias seguidos', sub: 'é o seu recorde' }, { id: 'fila', titulo: 'Fila zerada: 0 dias', sub: '' }],
      funilFora: false, E: { por: [], pior: null, abertos: 14, parados: 0 }, cobrar: { total: 0, linhas: [], mais: 0 }, gravando: false, D: { dias: [{}, {}, { rot: 'qua', data: '18/11' }] } };
    M.HJ4.st.P = PLACAR();
    if (muda) muda(V, H5);
    return { V: V, frase: H5.frase(V), html: H5.html(V) };
  };
  p('a frase antes de sair: o mês, a meta do dia e o valor da próxima venda', function () {
    const t = tela('antes', function (V) { V.dia.visitas = 0; V.dia.feitas = 0; });
    return t.frase === 'Faltam 4 clientes em 8 dias úteis. Hoje: 6 visitas e 1 demo. Sua próxima venda vale R$ 250.';
  });
  p('a frase na rua: a próxima parada e o que falta no dia', function () { return tela('rua').frase === 'A próxima é JK Distribuidora, às 14h30. Faltam 4 visitas e a demo de hoje.'; });
  p('a frase no fecho: como o dia fechou e o que falta registrar', function () {
    const t = tela('fecho', function (V) { V.dia.semFicha = ['Bar do Rocha']; });
    const u = tela('fecho', function (V) { V.dia.visitas = 12; V.dia.paradas.forEach(function (x) { x.feita = true; }); });
    return t.frase === 'O dia fechou com 2 de 6 visitas. Falta o "como foi" de 1 visita; 3 paradas ficaram para trás.' && u.frase === 'O dia fechou com 12 visitas, acima da meta de 6. Tudo registrado.';
  });
  p('a tela: os seis blocos, na ordem do celular', function () {
    const h = tela('rua').html;
    const pos = ['h5-frase', 'h5-card h5-dia', 'h5-card h5-din', 'h5-card h5-meta', 'h5-card h5-missao', 'h5-card h5-cobrar', 'h5-card h5-sem'].map(function (c) { return h.indexOf(c); });
    return pos.every(function (x, i) { return x > 0 && (i === 0 || x > pos[i - 1]); });
  });
  p('a tela: os textos da prancha', function () {
    const h = tela('rua').html;
    return ['5 paradas · 2 feitas no app', 'Visitas com prova', 'faltam 4 · semana: 13 com prova', 'a meta é 1 por dia', 'a próxima · 14h30', 'R$ 1.000', 'em novembro, até aqui', '4 clientes a R$ 250 · na 6ª a faixa sobe para todos',
      'A próxima venda', 'a 5ª do mês', '+ R$ 250', 'O salto da 6ª venda', '+ R$ 550', 'Na meta, com 8', 'a 8ª rende + R$ 1.100', 'R$ 3.200', 'Bônus da semana, R$ 250: faltam 58 pts para passar André. Três demos passam.',
      'Faltam 4 clientes em 8 dias úteis.', '<b>30 portas</b> e <b>7 demos</b>', 'abaixo do ritmo', '4 de 8 · o risco é o esperado até hoje (5)', 'Missão: o &quot;como foi&quot; antes de ligar o carro', '0 de 2 dias · até qui 19/11 · vale o selo Registro na hora',
      'Na rua há 5 dias seguidos', 'é o seu recorde · fila zerada: 0 dias', 'Nada para cobrar: funil em dia.', 'O que falta é porta: só 14 negócios abertos para 4 clientes que faltam.', '64 pts', '4º de 6 · o 3º é André, com 121', 'Marco Filho · você',
      'Etapa com acúmulo', 'nenhuma entupida · 14 abertos', 'HubSpot atualizado às 20h06', 'seg 16 a dom 22/11'].filter(function (t) { return h.indexOf(t) < 0; }).length === 0;
  });
  p('a tela: carteira em dia não tem botão vermelho; carteira cheia tem UM, na primeira linha', function () {
    const vazio = tela('rua').html;
    const cheio = tela('rua', function (V, H) {
      const leads = [{ ref: 'c-9', etapaIdx: 4, nome: 'N1' }, { ref: 'c-8', etapaIdx: 2, nome: 'D1' }, { ref: 'c-7', etapaIdx: 1, nome: 'V1' }, { ref: 'c-6', etapaIdx: 0, nome: 'P1' }];
      V.E = { por: [0, 1, 2, 3, 4, 5].map(function (i) { return { sid: 's' + i, idx: i, total: 3, parados: i === 4 ? 2 : 0, regua: 7 }; }), pior: 4, abertos: 74, parados: 2 };
      V.cobrar = H.cobrar(leads, V.E);
    }).html;
    return vazio.indexOf('is-verm') < 0 && cheio.split('h5-bt is-verm').length - 1 === 1 && cheio.indexOf('data-h5="por:c-9:2">Pôr em qua 18<') > 0 && cheio.indexOf('1 em Negociação, 2 parados') > 0
      && cheio.indexOf('data-h5="por:c-9:2"') < cheio.indexOf('>Ver<') && cheio.indexOf('4 para cobrar') > 0;
  });
  p('a tela: sem plano vira "Montar o dia"; a sexta parada em diante vira "+N no Planejamento"', function () {
    const sem = tela('antes', function (V) { V.dia.semPlano = true; V.dia.paradas = []; }).html;
    const muitas = tela('rua', function (V, H) { const pl = PLANO().concat(PLANO()); V.dia.paradas = H.paradas(pl, 'rua', 845); V.dia.total = 10; }).html;
    return sem.indexOf('Sem plano para hoje') > 0 && sem.indexOf('Montar o dia →') > 0 && muitas.indexOf('+5 no Planejamento') > 0 && muitas.split('class="h5-n').length - 1 === 5;
  });
  p('a tela: placar fora mostra "—" e a fonte, não zero', function () {
    const h = tela('rua', function (V) { V.semana = null; V.placar = 'fora'; V.bonus = null; }).html;
    return h.indexOf('Fonte fora · placar_da_semana') > 0 && h.indexOf('>0 pts<') < 0;
  });
  p('a tela: a chave de hora marca a hora em vigor', function () {
    const h = tela('fecho').html;
    return /aria-selected="true" class="is-on" data-h5="hora:fecho"/.test(h) && /aria-selected="false" class="" data-h5="hora:rua"/.test(h);
  });
  return R;
}

const real = provas(js);
if (real.erro) checar('o bloco roda sozinho', false, real.erro);
Object.keys(real).forEach(function (k) { if (k !== 'erro') checar(k, real[k]); });
checar('as contas rodaram (24 provas)', Object.keys(real).length === 24, 'rodaram ' + Object.keys(real).length);

/* ── 5 · sabotagem: a suíte tem de acusar ── */
const sabotagens = [
  ['inverter a ordem do que cobrar', '[4, 3, 2, 1, 0].filter(', '[0, 1, 2, 3, 4].filter(', 'o que cobrar: o dinheiro mais perto primeiro, até 4 linhas'],
  ['medir a distância sem o ponto que passa', "(Number(eu.pontos) || 0) + 1) : null", "(Number(eu.pontos) || 0)) : null", 'a semana: o degrau de cima (faltam 58 para passar o 3º), nunca o 1º'],
  ['fechar o dia só pela hora do check-in', "return min >= H5.FECHO_MIN ? 'fecho' : visitasHoje > 0 ? 'rua' : 'antes';", "return visitasHoje > 0 ? 'rua' : 'antes';", 'hora: antes do 1º check-in, na rua até as 18h, fecho depois']
];
sabotagens.forEach(function (s) {
  const n = js.split(s[1]).length - 1;
  if (n !== 1) { checar('sabotagem · ' + s[0], false, 'o trecho a sabotar aparece ' + n + ' vez(es): a sabotagem não mede mais nada'); return; }
  const r = provas(js.split(s[1]).join(s[2]));
  checar('sabotagem · ' + s[0] + ' · a suíte acusa', r[s[3]] === false, 'a prova "' + s[3] + '" continuou verde com a regra estragada');
});

console.log('');
console.log('hoje v5: ' + ok + ' verificações');
if (falhas.length) {
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('');
  console.log(falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('tudo certo.');
