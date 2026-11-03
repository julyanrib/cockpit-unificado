/* ============================================================================
   PLANEJAMENTO v3 · PARIDADE COM A v2 (03/11/26)

   O dono: "a ideia era mudar o estilo, deixar mais bonito, mas deixar funcional; não posso
   travar eles; preciso que eles busquem, que os quentes sem próximo passo estejam lá".
   Esta suíte roda o bloco gv2 do template de verdade num vm, com uma carteira de exemplo e
   as funções da v2 (pl6*) no lugar, e prova cada item do inventário v2 → v3:
     · a saída visível para a tela anterior (e a volta, na v2);
     · a busca acha a carteira inteira, mostra o que já está num dia e explica o vazio;
     · os quentes sem próximo passo aparecem em QUALQUER filtro e com busca, todos, com gesto;
     · Todo o funil, os recortes (faixas), lead novo, bloco de rua, hora opcional, ficha,
       mudar o cartão de dia (com a tarefa junto), bloqueio visível, trava do negócio nascido
       aqui, bairro escrito à mão, mapa do dia, toques, "mostrar mais" e os vazios com saída;
     · todo data-pv3-acao desenhado tem quem o escute (nada morto) e nenhum emoji na tela.
   Uso: node scripts/testar-planejamento-v3-paridade.js [caminho do template]
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const T = process.argv[2] || path.join(__dirname, '..', 'template', 'cockpit.template.html');
const tpl = fs.readFileSync(T, 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };

const ini = tpl.indexOf('<script id="gv2-js">');
const fim = tpl.indexOf('</script><!-- /gv2-js -->');
const codigo = tpl.slice(ini + '<script id="gv2-js">'.length, fim).replace('GV2.instalar();', '');
checar('o bloco gv2 continua sem crase (guarda 26)', codigo.indexOf('`') < 0);

/* ── o mundo: a semana de 09 a 13/11, hoje é 03/11 (todos os dias no futuro) ── */
const chamadas = [];
const reg = (nome, args) => chamadas.push({ nome: nome, args: args });
const ultima = (nome) => chamadas.filter((c) => c.nome === nome).pop();
let LS = {};
let lsQuebrado = false;
global.esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
global.document = undefined;
global.localStorage = {
  getItem: (k) => (k in LS ? LS[k] : null),
  setItem: (k, v) => { if (lsQuebrado) throw new Error('quota'); LS[k] = String(v); },
  removeItem: (k) => { if (lsQuebrado) throw new Error('quota'); delete LS[k]; }
};
global.location = { search: '' };
global.DATA = { reps: [], kpisHub: {}, hubspotUpdatedAtFmt: '03/11 08:00', stageMeta: { slaDays: { '1395880473': 2 } } };
global.STAGE_LABELS = { '1395880469': 'Prospecção', '1396005401': 'Visita', '1395880470': 'Conversa com Decisor', '1395880471': 'Demo/Proposta', '1395880472': 'Negociação', '1395880473': 'Ag. Pagamento', '1398311191': 'Reciclagem' };
global.PL6_RUA = '__rua';
global.PL6_HORAS = ['09:00', '10:30', '12:00', '14:00', '15:30', '17:00', '18:00'];
global.PL6_SEMANA = 1;
global.PL6_ROTA = { segunda: null, dias: null, lendo: false, em: 0 };
global.PL6_SEM_PINO = null;
global.agendaAgora = () => 'agora';
global.agendaChave = () => '2026-11-03';
global.pl6SegundaEmFoco = () => '2026-11-09';
global.pl6SegundaDaSemana = () => '2026-11-02';
const ISOS = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
const ROT = ['seg', 'ter', 'qua', 'qui', 'sex'];
global.pl6Dias = () => ISOS.map((iso, i) => ({ iso: iso, rot: ROT[i], data: iso.slice(8, 10) + '/' + iso.slice(5, 7), feriado: false }));
global.pl6Regioes = () => [{ chave: 'b:tijuca', nome: 'Tijuca', contas: 4 }, { chave: 'b:madureira', nome: 'Madureira', contas: 2 }];
global.pl6RotuloBairro = (k) => k;
global.pl6Prioridade = () => 0;
global.pl6ReguaDaEtapa = () => 3;
global.pl6AcimaDaRegua = (l) => (l.dias || 0) > 3;
global.pl6PassoFuturo = (l) => !!l.proximaAtividade;
global.pl6CarregarRotaDaSemana = () => {};
global.pl6PrimeiraVaga = (g, di) => { const k = g[di].findIndex((v) => v == null); return k < 0 ? g[di].length : k; };
global.pl6SlotId = (v) => { const id = v && typeof v === 'object' ? v.id : v; return id && String(id).indexOf('__') !== 0 ? String(id) : null; };
global.pl6HoraDaFaixa =(si) => global.PL6_HORAS[si] || null;

const conta = (id, nome, extra) => Object.assign({ id: id, tipo: id.indexOf('n-') === 0 ? 'n' : 'c', dealId: id.indexOf('n-') === 0 ? null : id.slice(2), nome: nome, stageId: '1396005401', dias: 2, regiao: 'b:tijuca', regiaoNome: 'Tijuca', semEndereco: false, lat: -22.92, lng: -43.23 }, extra || {});
let TODOS = [
  conta('c-101', 'Bar Quente Sem Mapa', { stageId: '1395880472', dias: 5, semEndereco: true, lat: null, lng: null }),
  conta('c-102', 'Bistrô Quente da Tijuca', { stageId: '1395880471', dias: 4, lat: -22.921, lng: -43.231 }),
  conta('c-103', 'Lanchonete Madureira', { regiao: 'b:madureira', regiaoNome: 'Madureira' }),
  conta('c-104', 'Restaurante Coliseu', { stageId: '1395880470', dias: 9, proximaAtividade: '2026-11-12' }),
  conta('c-105', 'Barraca Dubiel', { stageId: '1395880469', dias: 1 }),
  conta('n-201', 'Sunomono', { leadId: '201', grupo: 'casa', nota: null }),
  conta('n-202', 'Cantina Boa', { leadId: '202', grupo: 'aval', nota: 4.7 }),
  conta('c-301', 'Cliente Antigo', { base: true, emQueda: true, stageId: '1396006162' }),
  conta('c-401', 'Pagador Atrasado', { stageId: '1395880473', dias: 6 }),
  conta('r-501', 'Parado Há Tempo', { reciclagem: true, stageId: '1398311191', dias: 130, semEndereco: true, lat: null, lng: null })
];
for (let k = 0; k < 130; k++) TODOS.push(conta('n-9' + String(k).padStart(2, '0'), 'Alvo Extra ' + k, { leadId: '9' + k, grupo: 'casa' }));
global.pl6TodasAsContas = () => TODOS;
let GRADE;
const gradeNova = () => [[], ['c-105', '__b', { id: '__rua', regiao: 'Centro', duracao: '2h', hora: '14:00' }], [], [], []];
global.pl6GradeDoPlano = () => GRADE.map((c) => c.slice());
let REGS = [null, null, null, null, null];
global.pl6RegioesDoPlano = () => REGS.slice();
global.pl6ItensDoDia = (col, porId) => (col || []).map((v, si) => {
  if (v === '__b') return { si: si, tipo: 'bloqueado', hora: '12:00' };
  if (v && typeof v === 'object' && v.id === '__rua') return { si: si, tipo: 'rua', regiao: v.regiao, hora: v.hora };
  const id = v && typeof v === 'object' ? v.id : v;
  if (!id) return null;
  const l = porId.get(id) || null;
  return { si: si, id: id, tipo: l ? 'visita' : 'orfa', lead: l, hora: v && v.hora ? v.hora : null };
}).filter(Boolean);
/* a ordem do dia, a hora a acertar e a régua de dias úteis são as funções DE VERDADE da v2, tiradas do template */
const corpoDe = (nome) => { const a = tpl.indexOf(String.fromCharCode(10) + 'function ' + nome + '('); if (a < 0) return null; let i = tpl.indexOf('{', a), n = 0; for (; i < tpl.length; i++) { if (tpl[i] === '{') n++; else if (tpl[i] === '}' && --n === 0) break; } return tpl.slice(a + 1, i + 1); };
global.ehFeriadoBR = (iso) => iso === '2026-11-02';
['pl6MinDe', 'pl6Duracao', 'pl6HHMM', 'pl6OrdemDoDia', 'pl6AvisosDaHora', 'cadEhUtil', 'cadUteisEntre'].forEach((nome) => { const c = corpoDe(nome); if (c) (0, eval)(c); });
if (typeof global.pl6OrdemDoDia !== 'function') global.pl6OrdemDoDia = (itens) => itens.map((it, k) => ({ it: it, st: null, fixo: null, n: k + 1 }));
/* as escritas da v2, registradas */
global.pl6Gravar = async (rep, campos) => { reg('pl6Gravar', [campos]); if (campos.grade) GRADE = campos.grade.map((c) => c.slice()); if (campos.regioes) REGS = campos.regioes.slice(); return { error: null }; };
global.pl6AgendarNoSlot = async (rep, id, di, si, gk) => { reg('pl6AgendarNoSlot', [id, di, si, gk]); const g = global.pl6GradeDoPlano(); g[di][si] = gk.hora ? { id: id, hora: gk.hora } : id; await gk.mutar({ grade: g }); };
global.criarTarefaVisitaNoHubspot = async (lead, owner, hora, op, iso) => { reg('criarTarefaVisitaNoHubspot', [lead, owner, hora, op, iso]); };
global.registrarAgendamentoLocal = (...a) => reg('registrarAgendamentoLocal', a);
global.pl6CriarLead = async (rep, campos) => { reg('pl6CriarLead', [Object.assign({}, campos)]); return campos.nome === 'Duplicado' ? { erro: 'já está na carteira' } : { lead: { nome: campos.nome }, cidade: 'Rio de Janeiro' }; };
global.farolBuscarEAplicar = async () => reg('farolBuscarEAplicar', []);
global.pl6GravarRegiaoDigitada = (rep, di, texto, mutar) => { reg('pl6GravarRegiaoDigitada', [di, texto]); const n = REGS.slice(); n[di] = 't:' + texto; return mutar({ regioes: n }, 'ok'); };
global.pl6NegocioNascidoAqui = (v) => (v === 'c-105' ? { nome: 'Barraca Dubiel' } : null);
global.abrirModalConfirmacao = () => {};
global.pl6TravaDoNascido = (nascido, di, si, mutar) => reg('pl6TravaDoNascido', [nascido, di, si, typeof mutar]);
global.pl6FichaCamposFinal = (l) => [{ rot: 'telefone', v: '<a href="tel:21999">21 999</a>', cor: '' }, { rot: 'endereço', v: '<input data-pl6-end-rua="1"><button data-pl6-end-gravar="1">gravar</button>', cor: '' }];
global.renderProspeccaoExecutivo = async () => reg('renderProspeccaoExecutivo', []);
global.mostrarToast = (t, tipo) => reg('toast', [t, tipo]);
global.v5NoPwa = () => true;

let GV2;
try { GV2 = new Function(codigo + '\nreturn GV2;')(); } catch (er) { console.error('o bloco gv2 não carregou: ' + er.message); process.exit(1); }
GV2.pintar = function () {};
GV2.EXH.toast = (t) => reg('toast', [t]);
const P = GV2.PLV3, PL7 = GV2.PL7;
const rep = { ownerId: '1', name: 'Exec' };
P.rep = rep;
/* a base do funil do executivo (a mesma da Hoje): os negócios dele */
const neg = (id, idx, nome, pp) => ({ id: id, dono: '1', etapa_idx: idx, agPag: idx === 5, proximo_passo: pp || null, nome: nome, dias: 3, lead: {} });
const BASE = { negocios: [neg('101', 4, 'Bar Quente Sem Mapa'), Object.assign(neg('102', 3, 'Bistrô Quente da Tijuca'), { lead: { tarefas: [{ timestamp: '2026-10-30T15:00:00Z', subject: 'Follow-up - Bistrô' }] } }), Object.assign(neg('103', 1, 'Lanchonete Madureira'), { lead: { tarefas: [{ timestamp: '2026-10-20T15:00:00Z', subject: 'Follow-up - Lanchonete' }] } }), neg('104', 2, 'Restaurante Coliseu', 'qui 12/11'), neg('105', 0, 'Barraca Dubiel', 'no plano · ter 10/11')], agora: { iso: '2026-11-03', min: 600 }, cru: {} };
const comBase = (sim, erro) => { GV2.DV.estado.base = sim ? BASE : null; GV2.DV.estado.p = sim ? { id: '1', meta_visitas_dia: 6 } : null; GV2.DV.estado.erro = erro || null; };
const ESTADO0 = JSON.stringify(P.st);
const zerar = () => { const s0 = JSON.parse(ESTADO0); Object.keys(P.st).forEach((k) => delete P.st[k]); Object.assign(P.st, s0); GRADE = gradeNova(); REGS = [null, null, null, null, null]; chamadas.length = 0; comBase(true); Object.keys(GV2.EXH4.estado.marcados).forEach((k) => delete GV2.EXH4.estado.marcados[k]); };
const D = () => (P.D = P.dados(rep));
const html = () => P.html(D());
const fila = () => P.blocoFilaHTML(D());
const acao = async (v, a) => { D(); await P.acao(v, a || ''); };
/* toda ação desenhada tem quem a escute: junta os verbos de cada tela pintada */
const verbos = new Set();
const colher = (h) => { (h.match(/data-pv3-acao="[^"]*"/g) || []).forEach((m) => { const v = m.slice(15, -1); verbos.add(v.indexOf(':') < 0 ? v : v.slice(0, v.indexOf(':'))); }); return h; };

(async function () {
  zerar();
  checar('o modelo da v3 monta com a carteira de exemplo', !!D() && D().semL.length === 3, D().semL.map((l) => l.ref).join(','));

  /* ── 1 · a saída à vista: v3 → v2 e de volta ── */
  {
    const h = colher(html());
    checar('o cabeçalho da v3 tem o link "Usar o planejamento anterior"', /data-pv3-acao="usarv2"[^>]*>Usar o planejamento anterior</.test(h));
    LS = {};
    await acao('usarv2');
    checar('o link grava planejamento-v2 = 1 e repinta a aba', LS['planejamento-v2'] === '1' && !!ultima('renderProspeccaoExecutivo') && P.usar() === false);
    chamadas.length = 0;
    checar('a volta tira a chave e repinta', P.trocarVersao(false) === true && !('planejamento-v2' in LS) && !!ultima('renderProspeccaoExecutivo') && P.usar() === true);
    lsQuebrado = true; chamadas.length = 0;
    const r = P.trocarVersao(true);
    lsQuebrado = false;
    checar('navegador que não deixa guardar: a tela diz e não finge que trocou', r === false && !ultima('renderProspeccaoExecutivo') && !!ultima('toast'));
    const tela2 = tpl.slice(tpl.indexOf('function pl6TelaFinalHTML'), tpl.indexOf('function renderPlanejamento6a'));
    checar('a v2 tem o link "Voltar ao planejamento novo"', /data-pl6-acao="voltarv3"[^>]*>Voltar ao planejamento novo</.test(tela2));
    checar('e o ouvinte da v2 chama GV2.PLV3.trocarVersao(false)', /verbo === 'voltarv3'[\s\S]{0,300}GV2\.PLV3\.trocarVersao\(false\)/.test(tpl));
    checar('a chave de reserva continua sendo a mesma (localStorage planejamento-v2)', /localStorage\.getItem\('planejamento-v2'\) === '1'/.test(codigo) && /renderPlanejamento6a\(meuRep6a\)/.test(tpl));
  }

  /* ── 2 · a busca: carteira inteira, o que já está num dia, o vazio com saída ── */
  {
    zerar();
    P.st.q = 'coliseu';
    const h = colher(fila());
    checar('a busca acha o negócio que JÁ tem passo marcado (fora da fila sem passo)', /data-pv3-arraste="c-104"/.test(h) && /Pôr num dia/.test(h));
    P.st.q = 'dubiel';
    const h2 = colher(fila());
    checar('a busca diz "já no seu plano" com o dia e o gesto de ir até ele', /já no seu plano/.test(h2) && /data-pv3-acao="irdia:1:c-105"/.test(h2) && !/Nenhum lead, cliente/.test(h2));
    P.st.q = 'zzz inexistente';
    const h3 = colher(fila());
    checar('busca sem resultado explica a carga e oferece buscar dado novo, criar o lead e limpar', /carga de 03\/11 08:00/.test(h3) && /data-pv3-acao="dadonovo"/.test(h3) && /data-pv3-acao="novo:busca"/.test(h3) && /data-pv3-acao="limparbusca"/.test(h3));
    await acao('dadonovo');
    checar('"buscar dado novo" usa o mesmo farolBuscarEAplicar da v2', !!ultima('farolBuscarEAplicar'));
    await acao('novo', 'busca');
    checar('"criar lead novo com este nome" abre o formulário já com o nome', P.st.novo && P.st.novo.nome === 'zzz inexistente');
    zerar(); comBase(false, 'tempo esgotado');
    P.st.q = 'coliseu';
    checar('com o funil do HubSpot fora, a busca continua achando a carteira', /data-pv3-arraste="c-104"/.test(fila()));
    P.st.q = '';
    const h4 = colher(fila());
    checar('funil fora: a fila explica e oferece tentar de novo, Todo o funil e contas-alvo', /data-pv3-acao="relerbase"/.test(h4) && /data-pv3-acao="filtro:funil"/.test(h4) && /data-pv3-acao="filtro:alvo"/.test(h4));
  }

  /* ── 3 · os quentes sem próximo passo: em qualquer filtro, com busca, todos, com gesto ── */
  {
    const filtros = ['sem', 'quentes', 'alvo', 'funil', 'venc', 'mapa', 'cnpj', 'recicl', 'cobrar', 'relac'];
    let todos = true, qual = '';
    for (const f of filtros) {
      zerar(); P.st.filtro = f;
      const h = colher(fila());
      if (!/data-pv3-quente="c-101"/.test(h) || !/data-pv3-quente="c-102"/.test(h)) { todos = false; qual = f; }
    }
    checar('o bloco Quentes aparece em todos os filtros, com os 2 quentes', todos, 'faltou em ' + qual);
    zerar(); P.st.q = 'cantina'; P.st.filtro = 'alvo';
    const hq = fila();
    checar('e com busca digitada', /data-pv3-quente="c-101"/.test(hq) && /data-pv3-quente="c-102"/.test(hq));
    zerar();
    const h = colher(fila());
    checar('o quente SEM lugar no mapa não some do bloco (antes sumia) e diz por quê', /data-pv3-quente="c-101"[\s\S]{0,300}sem lugar no mapa/.test(h));
    checar('o quente com sugestão tem "Pôr em" o dia sugerido', /data-pv3-quente="c-102"[\s\S]{0,400}data-pv3-acao="por:c-102:\d"/.test(h));
    await acao('menu', 'c-101:qdia');
    const h2 = colher(fila());
    checar('o quente sem sugestão abre os dias para visita e para ligar', /data-pv3-acao="por:c-101:0"/.test(h2) && /data-pv3-acao="ligarem:c-101:0"/.test(h2));
    await acao('por', 'c-101:2');
    checar('e pôr no dia passa pelo pl6AgendarNoSlot (a tarefa no HubSpot antes da grade)', ultima('pl6AgendarNoSlot') && ultima('pl6AgendarNoSlot').args[0] === 'c-101' && ultima('pl6AgendarNoSlot').args[1] === 2);
    zerar(); comBase(false, null);
    checar('funil ainda lendo: o bloco diz que os quentes estão a caminho (não some calado)', /data-pv3-quentes="1"[\s\S]{0,200}lendo o seu funil/.test(fila()));
  }

  /* ── 4 · Todo o funil e os recortes (as faixas da munição da v2) ── */
  {
    zerar(); P.st.filtro = 'funil';
    const h = colher(fila());
    checar('Todo o funil traz o negócio com passo futuro e o sem passo, e não o que já está num dia', /data-pv3-arraste="c-104"/.test(h) && /data-pv3-arraste="c-103"/.test(h) && !/data-pv3-arraste="c-105"/.test(h));
    checar('Todo o funil tem os recortes da v2: régua, passo e etapa, cada um com o número', /data-pv3-acao="faixa:futuro"[^>]*>com passo futuro <b>1<\/b>/.test(h) && /data-pv3-acao="faixa:acima"/.test(h) && /data-pv3-acao="faixa:st:1395880470"/.test(h));
    await acao('faixa', 'futuro');
    const linhas = P.linhasDoFiltro(D()).map((l) => l.ref);
    checar('o recorte "com passo futuro" deixa só o Coliseu', linhas.join(',') === 'c-104', linhas.join(','));
    zerar(); P.st.filtro = 'alvo';
    const ha = colher(fila());
    checar('contas-alvo se recortam pela nota e pela fonte', /faixa:estrela/.test(ha) && /faixa:g:casa/.test(ha) && /faixa:g:aval/.test(ha));
    P.st.faixa = 'estrela';
    checar('"nota 4,5 ou mais" deixa só a Cantina Boa', P.linhasDoFiltro(D()).map((l) => l.ref).join(',') === 'n-202');
    zerar(); P.st.filtro = 'relac'; P.st.faixa = 'queda';
    checar('relacionamento recorta o cliente em queda', P.linhasDoFiltro(D()).map((l) => l.ref).join(',') === 'c-301');
    zerar(); P.st.filtro = 'cobrar'; P.st.faixa = 'acima';
    checar('cobrar recorta acima da régua do Ag. Pagamento', P.linhasDoFiltro(D()).map((l) => l.ref).join(',') === 'c-401');
    zerar(); P.st.filtro = 'mapa';
    checar('o filtro "sem lugar no mapa" (o chip da cadência) mostra quem não tem endereço', P.linhasDoFiltro(D()).map((l) => l.ref).join(',') === 'c-101');
    zerar(); P.st.cadAberta = true;
    const hc = colher(html());
    checar('a cadência mostra a % da carteira com passo e o chip do mapa leva ao filtro certo', /da carteira com próximo passo datado/.test(hc) && /data-pv3-acao="filtro:mapa"/.test(hc));
  }

  /* ── 5 · lead novo e bloco de rua ── */
  {
    zerar();
    const h0 = colher(fila());
    checar('a fila tem "+ lead novo" e "+ bloco de rua"', /data-pv3-acao="novo:"/.test(h0) && /data-pv3-acao="ruaabrir"/.test(h0));
    await acao('novo', '');
    const h = colher(fila());
    checar('o formulário do lead novo tem nome, bairro, telefone e a fonte (Instagram, Maps, rua)', /data-pv3-novo="nome"/.test(h) && /data-pv3-novo="bairro"/.test(h) && /data-pv3-novo="telefone"/.test(h) && /novofonte:instagram/.test(h) && /novofonte:mapa/.test(h));
    P.st.novo.nome = 'Pizzaria Nova'; P.st.novo.fonte = 'instagram';
    await acao('novogravar');
    const c = ultima('pl6CriarLead');
    checar('criar usa o pl6CriarLead da v2 com os campos', c && c.args[0].nome === 'Pizzaria Nova' && c.args[0].fonte === 'instagram');
    checar('e a conta criada aparece na busca para pôr num dia', P.st.novo === null && P.st.q === 'Pizzaria Nova');
    await acao('novo', ''); P.st.novo.nome = 'Duplicado';
    await acao('novogravar');
    checar('recusa (já está na carteira) aparece no formulário, que continua aberto', P.st.novo && P.st.novo.erro === 'já está na carteira' && /já está na carteira/.test(fila()));
    zerar();
    await acao('ruaabrir');
    const hr = colher(fila());
    checar('o bloco de rua pede onde, quanto tempo e o dia', /data-pv3-rua="regiao"/.test(hr) && /ruadur:3h/.test(hr) && /data-pv3-acao="rua:2"/.test(hr));
    P.st.rua.regiao = 'Grajaú';
    await acao('ruadur', '3h');
    await acao('rua', '2');
    const g = ultima('pl6Gravar');
    const slot = g && g.args[0].grade[2].filter((v) => v && v.id === '__rua')[0];
    checar('o bloco grava na grade como na v2 (id __rua, p rua, onde e duração), sem tarefa no HubSpot', slot && slot.p === 'rua' && slot.regiao === 'Grajaú' && slot.duracao === '3h' && !ultima('criarTarefaVisitaNoHubspot'));
  }

  /* ── 6 · pôr num dia com hora, ficha, toques ── */
  {
    zerar();
    await acao('menu', 'c-103:dia');
    const h = colher(fila());
    checar('o "Pôr num dia" tem o horário opcional', /data-pv3-hora="c-103"/.test(h));
    P.st.hora['c-103'] = '14:30';
    await acao('por', 'c-103:3');
    const a = ultima('pl6AgendarNoSlot');
    checar('a hora escolhida vai para o pl6AgendarNoSlot (o relógio da v2)', a && a.args[3].hora === '14:30');
    zerar();
    await acao('menu', 'c-101:fic');
    const hf = colher(fila());
    checar('a linha tem a Ficha: os campos da ficha da v2 (telefone)', /pv3-ficha/.test(hf) && /tel:21999/.test(hf));
    checar('sem o formulário de endereço da v2 (que aqui ficaria morto) e com o da v3', !/data-pl6-end/.test(hf) && /data-pv3-end="c-101"/.test(hf) && /gravarend:c-101/.test(hf));
    checar('e o botão da ficha completa do negócio', /data-pv3-acao="ficha:c-101"/.test(hf));
    zerar();
    PL7.toques.cache['102'] = [1, 0, 1, 1, 0, 1];
    checar('os toques das 6 semanas aparecem na linha (PL7.toquesHTML)', /data-pv3-arraste="c-102"[\s\S]{0,900}pl7-toques/.test(fila()));
    zerar(); P.st.filtro = 'alvo';
    const hm = colher(fila());
    checar('lista longa não trava: "mostrar mais" no fim', /data-pv3-acao="maislinhas"/.test(hm));
    await acao('maislinhas');
    checar('e mostrar mais aumenta a lista', P.st.limite === 240 && !/data-pv3-acao="maislinhas"/.test(fila()));
    zerar(); P.st.filtro = 'cnpj';
    const hv = colher(fila());
    checar('filtro vazio explica e oferece Todo o funil, contas-alvo e lead novo', /Nenhum CNPJ novo/.test(hv) && /filtro:funil/.test(hv) && /novo:/.test(hv));
  }

  /* ── 7 · a grade: bloqueio visível, mudar de dia, arrastar, trava, bairro escrito, mapa ── */
  {
    zerar();
    const h = colher(html());
    const dia1 = P.diaHTML(D(), 1);
    checar('o bloqueio e o bloco de rua aparecem no dia', /Bloqueado/.test(dia1) && /Prospecção de rua/.test(dia1));
    /* PROSPECÇÃO DE RUA ALIMENTA A CARTEIRA (03/11/26): no dia futuro o bloco promete; no dia que passou ele conta
       as contas novas do dono naquele dia (de outro dono e de outro dia não), e nunca diz "ficou para trás" */
    checar('dia futuro: a prospecção de rua diz que a conta nova entra na carteira', /contas novas entram na sua carteira/.test(dia1));
    {
      const agendaAntes = global.agendaChave;
      global.agendaChave = () => '2026-11-11';
      DATA.kpiDetalhe = { leadsCriados: [
        { ownerId: '1', criadoEm: '2026-11-10T15:00:00Z' }, { ownerId: '1', criadoEm: '2026-11-10T20:30:00Z' },
        { ownerId: '2', criadoEm: '2026-11-10T15:00:00Z' }, { ownerId: '1', criadoEm: '2026-11-11T03:30:00Z' }, { ownerId: '1', criadoEm: '2026-11-10T02:30:00Z' },
      ] };
      const passado = P.diaHTML(D(), 1);
      checar('dia que passou: conta as 2 contas novas do dono no dia (BRT: 20h30 UTC é do dia; outro dono, 00h30 BRT do dia seguinte e 23h30 BRT da véspera ficam fora)', /2 contas novas na carteira/.test(passado), passado.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300));
      checar('e a prospecção de rua nunca vira "ficou para trás"', !/Prospecção de rua[^]*?ficou para trás/.test(passado.split('Bloqueado')[0] + passado.split('Bloqueado').slice(1).join('').split('</article>')[0]));
      DATA.kpiDetalhe = { leadsCriados: [] };
      checar('dia que passou sem conta nova: diz que não cadastrou nenhuma', /nenhuma conta nova cadastrada/.test(P.diaHTML(D(), 1)));
      delete DATA.kpiDetalhe;
      global.agendaChave = agendaAntes;
    }
    checar('o bloqueio não conta na meta (2 de 6: a visita e a rua)', D().cont[1] === 2, String(D().cont[1]));
    checar('o cartão tem "mudar de dia" e se arrasta para outro dia', /data-pv3-acao="cmenu:1:0"/.test(dia1) && /draggable="true" data-pv3-arraste="g:1:0"/.test(dia1));
    await acao('cmenu', '1:0');
    checar('mudar de dia abre os outros dias', /data-pv3-acao="moverum:1:0:3"/.test(colher(P.diaHTML(D(), 1))));
    chamadas.length = 0;
    await acao('moverum', '1:0:3');
    const t = ultima('criarTarefaVisitaNoHubspot');
    checar('mudar de dia leva a tarefa do HubSpot para a data nova antes da grade', t && t.args[4] === '2026-11-12' && t.args[3].dealId === '105');
    checar('e a grade muda de dia', GRADE[1][0] == null && GRADE[3].indexOf('c-105') >= 0);
    zerar();
    await acao('tirar', '1:0');
    checar('tirar negócio nascido aqui passa pela trava da v2 (pl6TravaDoNascido)', !!ultima('pl6TravaDoNascido') && !ultima('pl6Gravar'));
    zerar();
    await acao('tirar', '1:1');
    checar('tirar o resto continua um clique só', !ultima('pl6TravaDoNascido') && ultima('pl6Gravar') && GRADE[1][1] == null);
    checar('a trava da v2 é a mesma função nas duas telas', /return pl6TravaDoNascido\(nascido, di, si, mutar\);/.test(tpl) && /^function pl6TravaDoNascido\(nascido, di, si, mutar\)/m.test(tpl));
    zerar();
    await acao('bairro', '2');
    checar('o painel do bairro tem o campo para escrever um bairro', /data-pv3-btxt="2"/.test(colher(html())));
    P.st.bTxt[2] = 'Grajaú';
    await acao('bairrotxt', '2');
    const b = ultima('pl6GravarRegiaoDigitada');
    checar('o bairro escrito grava pelo pl6GravarRegiaoDigitada da v2', b && b.args[0] === 2 && b.args[1] === 'Grajaú' && REGS[2] === 't:Grajaú');
    zerar();
    await acao('pl7mapa', '1');
    const hm = colher(html());
    checar('a rota do dia abre o mapa da v2 (PL7.mapaDiaHTML) com as paradas e o link para o app', /pl7-md/.test(hm) && /Rota de ter 10\/11/.test(hm) && /href="\/\?agenda=2026-11-10"/.test(hm));
    checar('com os botões desta tela (por perto · encaixar e fechar)', /data-pv3-acao="pl7encaixar:c-102\|1"/.test(hm) && /data-pv3-acao="pl7mapafechar"/.test(hm) && !/data-pl6-acao/.test(hm));
    checar('a v2 continua desenhando o mesmo mapa com os botões dela', /data-pl6-acao="pl7mapafechar"/.test(PL7.mapaDiaHTML({ dias: [{ rot: 'seg', data: '09/11', pl7Mapa: { di: 0, iso: '2026-11-09', rot: 'seg', data: '09/11', paradas: [] } }] })));
    await acao('pl7encaixar', 'c-102|1');
    checar('encaixar "por perto" põe no dia pelo pl6AgendarNoSlot', ultima('pl6AgendarNoSlot') && ultima('pl6AgendarNoSlot').args[0] === 'c-102' && ultima('pl6AgendarNoSlot').args[1] === 1);
    const cart = P.cartaoHTML(D(), 2, { ref: 'c-103', si: 0, nome: 'Lanchonete', etapaIdx: 1, repetido: true, comoFoi: '/?pino=1' }, null);
    checar('o cartão diz "repetido no dia" e leva o "como foi?" para o app', /repetido no dia/.test(cart) && /href="\/\?pino=1"[^>]*>como foi\?/.test(cart));
  }

  /* ── 7b · a hora a acertar e o conflito de hora fixa (pl6AvisosDaHora, a mesma conta da v2) ── */
  {
    checar('a conta da hora a acertar é UMA função, e a v2 passou a usá-la', typeof global.pl6AvisosDaHora === 'function'
      && /const pl6Av = pl6AvisosDaHora\(ordem\);/.test(tpl) && /const horaAcertar = pl6Av\.doItem\(it, ox, passou\);/.test(tpl) && /conflito: conflito \? esc\(pl6Av\.conflito\)/.test(tpl));
    zerar();
    /* qua 11/11: a rota do app tem duas paradas com hora fixa colada (09:00 e 09:05): a 2ª chega atrasada */
    global.sessaoAtual = { ownerId: '1' };
    global.PL6_ROTA = { segunda: '2026-11-09', em: Date.now(), lendo: false, dias: { '2026-11-11': new Map([
      ['c-104', { pos: 0, fixo: '09:00', lat: -22.92, lng: -43.23 }], ['n-202', { pos: 1, fixo: '09:05', lat: -22.921, lng: -43.231 }]]) } };
    GRADE[2] = ['c-104', 'n-202'];
    /* qui 12/11: dois na mesma hora, e um depois das 18h */
    GRADE[3] = [{ id: 'c-103', hora: '18:30' }, { id: 'c-401', hora: '10:00' }, { id: 'c-301', hora: '10:00' }];
    const d2 = colher(P.diaHTML(D(), 2));
    checar('o cabeçalho do dia avisa o conflito da hora fixa, com a conta da v2', /data-pv3-conflito="2"[\s\S]{0,200}09:05 fixo em 2ª: chega \d+ min atrasado/.test(d2), d2.slice(d2.indexOf('pv3-aviso'), d2.indexOf('pv3-aviso') + 300));
    checar('e dá as saídas: mudar a hora ou o dia, ver a rota, acertar no app', /data-pv3-acao="cmenu:2:1"/.test(d2) && /data-pv3-acao="pl7mapa:2"/.test(d2) && /href="\/\?agenda=2026-11-11"[^>]*>acertar no app/.test(d2));
    checar('o cartão atrasado leva o selo "hora a acertar" com o fixo e o atraso', /hora a acertar · 09:05 fixo, chega \d+ min atrasado/.test(d2));
    const d3 = colher(P.diaHTML(D(), 3));
    checar('hora marcada depois das 18h vira "hora a acertar · depois das 18h"', /hora a acertar · depois das 18h/.test(d3));
    checar('dois cartões na mesma hora: "mesmo horário de"', /mesmo horário de Cliente Antigo/.test(d3) && /mesmo horário de Pagador Atrasado/.test(d3));
    const v2txt = global.pl6AvisosDaHora(global.pl6OrdemDoDia(global.pl6ItensDoDia(GRADE[2], D().porId), global.PL6_ROTA.dias['2026-11-11'])).conflito;
    checar('o texto da v3 é exatamente o da função da v2', !!v2txt && d2.indexOf(v2txt) >= 0, v2txt);
    await acao('cmenu', '3:0');
    const m3 = colher(P.diaHTML(D(), 3));
    checar('"mudar a hora ou o dia" abre a hora nova e os outros dias', /data-pv3-hora="g:3:0"/.test(m3) && /data-pv3-acao="mudarhora:3:0"/.test(m3) && /data-pv3-acao="moverum:3:0:4"/.test(m3));
    chamadas.length = 0;
    P.st.hora['g:3:0'] = '11:00';
    await acao('mudarhora', '3:0');
    const t = ultima('criarTarefaVisitaNoHubspot');
    checar('mudar a hora remarca a tarefa do HubSpot no mesmo dia e grava a hora no slot', t && t.args[2] === '11:00' && t.args[4] === '2026-11-12' && GRADE[3][0] && GRADE[3][0].hora === '11:00');
    checar('e o aviso some do cartão', !/hora a acertar · depois das 18h/.test(P.diaHTML(D(), 3)));
    chamadas.length = 0;
    await acao('mudarhora', '3:1');
    checar('sem hora escolhida, não grava e avisa', !ultima('pl6Gravar') && !!ultima('toast'));
    global.sessaoAtual = undefined;
    global.PL6_ROTA = { segunda: null, dias: null, lendo: false, em: 0 };
  }

  /* ── 7c · os recortes por dias de atraso no follow-up vencido (a data do selo "venceu") ── */
  {
    zerar(); P.st.filtro = 'venc';
    const h = colher(fila());
    const at103 = D().semL.filter((l) => l.ref === 'c-103')[0].atraso;
    const at102 = D().semL.filter((l) => l.ref === 'c-102')[0].atraso;
    checar('o atraso sai da data de EXH4.vencida, em dias úteis pela régua da v2 (cadUteisEntre)', typeof global.cadUteisEntre === 'function' && at103 === global.cadUteisEntre('2026-10-20', '2026-11-03') && at103 === 9 && at102 === 1, at103 + ' / ' + at102);
    checar('o follow-up vencido tem os recortes 15 d+, 8 a 14 d, 1 a 7 d com o número', /data-pv3-acao="faixa:8-14"[^>]*>8 a 14 d <b>1<\/b>/.test(h) && /data-pv3-acao="faixa:1-7"[^>]*>1 a 7 d <b>1<\/b>/.test(h) && !/faixa:15\+/.test(h));
    checar('o selo da linha diz a mesma data e os dias', /venceu ter 20\/10 · há 9 dias úteis/.test(h));
    await acao('faixa', '8-14');
    checar('o recorte "8 a 14 d" deixa só o vencido há 9 dias úteis', P.linhasDoFiltro(D()).map((l) => l.ref).join(',') === 'c-103');
    await acao('faixa', '1-7');
    checar('o recorte "1 a 7 d" deixa só o de 1 dia útil', P.linhasDoFiltro(D()).map((l) => l.ref).join(',') === 'c-102');
    checar('a soma dos recortes bate com a lista do filtro', P.faixas(D(), 'venc').reduce((s, x) => s + x.n, 0) === P.linhasBase(D(), 'venc').length);
  }

  /* ── 8 · nada morto, nada de emoji ── */
  {
    const fonteAcao = codigo.slice(codigo.indexOf('PLV3.acao = async function'), codigo.indexOf('PLV3.ligar = pv3Ligar'));
    const mortos = [...verbos].filter((v) => fonteAcao.indexOf("verbo === '" + v + "'") < 0);
    checar('todo data-pv3-acao desenhado nesta suíte tem quem o escute em PLV3.acao', verbos.size > 30 && mortos.length === 0, 'sem ouvinte: ' + mortos.join(', '));
    zerar(); P.st.cadAberta = true;
    const tudo = html() + fila();
    checar('nenhum emoji na tela', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(tudo));
  }

  if (falhas.length) {
    console.error('FALHAS (' + falhas.length + ' de ' + (ok + falhas.length) + '):');
    falhas.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
  console.log('OK planejamento v3 · paridade com a v2 — ' + ok + ' conferências: saída para a tela anterior e volta, busca na carteira inteira, quentes sempre à vista, Todo o funil e faixas, lead novo, bloco de rua, hora, ficha, mudar de dia, trava, bairro escrito, mapa do dia, e nenhuma ação sem ouvinte.');
})().catch((er) => { console.error('a suíte quebrou: ' + (er && er.stack || er)); process.exit(1); });
