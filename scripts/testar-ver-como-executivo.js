/* ══════════════════════════════════════════════════════════════════════════════════════
   "VER COMO EXECUTIVO" É A TELA DO EXECUTIVO — IGUAL (02/11/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   O gestor pediu "a mesma visão que o executivo tem" no item "Ver como executivo", para
   testar tudo como eles. O servidor já devolve a sessão com role 'rep' e a marca
   `visaoDeGestor`; o que esta suíte guarda é que a TELA não use essa marca para nada além
   da saída, e que o executivo não veja leitura de gestor nem jargão técnico.

   1. Monta o pedaço da casca que depende da sessão (aplicarVisaoPorPapel, a linha do topo,
      o rodapé, o papel e o menu do avatar) num DOM falso, três vezes: executivo de verdade,
      gestor no modo executivo e gestor. Executivo e "como executivo" têm de sair IGUAIS —
      as abas visíveis, os rótulos, a aba inicial, o topo e o rodapé —, com uma diferença
      só: a pílula do papel vira o botão "Voltar ao gestor".
   2. Por construção: `visaoDeGestor` e a chave `v6-visao` só podem ser lidas pela saída,
      pelo endereço dos dados e pela pré-leitura do time. Qualquer tela que passe a ler uma
      delas faria o gestor ver outra coisa — e cai aqui.
   3. Os textos técnicos que o executivo via (time ativo, meta do time, id do pipeline,
      nome do banco em aviso) não podem voltar.
   4. A casca do executivo usa os neutros do cockpit do gestor e alvo de 40 px.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const md = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8');
const api = fs.readFileSync(path.join(raiz, 'api', 'dados.js'), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) {
  if (cond) { ok += 1; return; }
  falhas.push(nome + (porque ? '\n      ' + porque : ''));
}
function recortar(fonte, nome) {
  const assinatura = 'function ' + nome + '(';
  const i = fonte.indexOf(assinatura);
  if (i < 0) { falhas.push(nome + ' não existe no template'); return ''; }
  let d = 0, j = i, viu = false;
  while (j < fonte.length) {
    const c = fonte[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return fonte.slice(i, j + 1);
}

/* ── o DOM falso: cada id e cada seletor vira um elemento que guarda o que a casca escreveu ── */
function novoDom() {
  const elementos = new Map();
  function classList() {
    const s = new Set();
    return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c),
      toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; if (on) s.add(c); else s.delete(c); return on; },
      lista: () => [...s].sort() };
  }
  function el(chave) {
    if (elementos.has(chave)) return elementos.get(chave);
    const e = { chave, style: {}, hidden: false, title: '', textContent: '', innerHTML: '', classList: classList(),
      attrs: {}, filhos: [],
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
      addEventListener() {}, appendChild(f) { this.filhos.push(f); }, insertAdjacentElement() {}, remove() {},
      insertBefore() {}, querySelector() { return null; }, querySelectorAll() { return []; }, parentNode: null };
    elementos.set(chave, e);
    return e;
  }
  const document = {
    body: el('body'), documentElement: el('html'),
    getElementById: (id) => el('#' + id),
    querySelector: (s) => (s === '.view.active' ? null : el(s)),
    querySelectorAll: () => [],
    createElement: (t) => el('nova:' + t + ':' + elementos.size),
  };
  function retrato() {
    const r = {};
    for (const [k, e] of elementos) {
      if (k.indexOf('nova:') === 0) continue;
      r[k] = { display: e.style.display || '', hidden: !!e.hidden, texto: e.textContent, html: e.innerHTML, classes: e.classList.lista() };
    }
    return r;
  }
  return { document, retrato, el };
}

const FUNCOES = ['esc', 'v5Iniciais', 'v5Icone', 'v5PintarConta', 'v5PintarMenu', 'linhaDeFrescorDoExecutivo',
  'preencherCabecalhoRodape', 'aplicarVisaoPorPapel'];
const codigo = FUNCOES.map((n) => recortar(tpl, n)).join('\n');

const DATA_BASE = {
  hubspotUpdatedAtFmt: '02/11/2026 às 16:34',
  usuarios: [{ role: 'rep', email: 'a@x' }, { role: 'rep', email: 'b@x', aComecar: true }, { role: 'manager', email: 'g@x' }],
  reps: [], kpisHub: { metaMensalFechados: 52, metasMes: '2026-11' },
  syncStatus: { conferencia: { em: '2026-11-02T19:30:00Z', itens: [] } },
  footerText: 'Fonte: HubSpot (pipeline 916011864, atualizado a cada 2h no horário comercial) + Daily (prometido/realizado) · Leads críticos = mais antigos sem avanço de etapa.',
  banner: '', supabase: { url: 'x' },
};

function montar(sessao) {
  const dom = novoDom();
  const chamadas = [];
  const ctx = {
    document: dom.document, sessaoAtual: sessao, DATA: JSON.parse(JSON.stringify(DATA_BASE)),
    window: { v5Tema: () => 'aparelho' }, perfisCache: {}, console,
    setTimeout: () => 0, requestIdleCallback: () => 0, Date, JSON, String, Number, Math, Set, Map, Array, Object, RegExp,
    activateTab: (v) => chamadas.push('activateTab:' + v),
    renderMeuPainel: () => chamadas.push('renderMeuPainel'),
    restaurarPosicaoDeNavegacao: () => chamadas.push('restaurar'),
    viewsDesenhadas: new Set(), posicaoNavRestaurada: false,
  };
  ctx.window.requestIdleCallback = ctx.requestIdleCallback;
  vm.createContext(ctx);
  try {
    vm.runInContext(codigo + '\naplicarVisaoPorPapel();\nv5PintarMenu();', ctx, { timeout: 2000 });
  } catch (e) {
    falhas.push('a casca estourou montando ' + JSON.stringify(sessao.role) + (sessao.visaoDeGestor ? ' (como executivo)' : '') + ': ' + e.message);
  }
  return { r: dom.retrato(), chamadas, dom };
}

const PESSOA = { email: 'pessoa@takeat.app', nome: 'Pessoa Teste', ownerId: '123' };
const rep = montar(Object.assign({ role: 'rep' }, PESSOA));
const como = montar(Object.assign({ role: 'rep', visaoDeGestor: true }, PESSOA));
const gestor = montar(Object.assign({ role: 'manager' }, PESSOA));

// ── 1. a mesma casca ──────────────────────────────────────────────────────────────────
{
  const chaves = new Set([...Object.keys(rep.r), ...Object.keys(como.r)]);
  const difs = [];
  for (const k of chaves) {
    if (k === '#v5Papel' || k === '#v5Menu') continue; // comparados à parte, logo abaixo
    const a = JSON.stringify(rep.r[k] || null), b = JSON.stringify(como.r[k] || null);
    if (a !== b) difs.push(k + ': executivo ' + a.slice(0, 120) + ' × como executivo ' + b.slice(0, 120));
  }
  checar('a casca do "Ver como executivo" é a do executivo (abas, rótulos, topo, rodapé)', difs.length === 0, difs.join('\n      '));
  checar('a aba inicial e o que desenha no login são os mesmos', JSON.stringify(rep.chamadas) === JSON.stringify(como.chamadas),
    'executivo ' + JSON.stringify(rep.chamadas) + ' × como executivo ' + JSON.stringify(como.chamadas));
  checar('o executivo abre em Hoje', rep.chamadas.indexOf('activateTab:viewMeuPainel') >= 0, JSON.stringify(rep.chamadas));
  checar('o corpo leva a moldura do executivo nos dois', rep.r.body.classes.indexOf('exec-v3') >= 0 && como.r.body.classes.indexOf('exec-v3') >= 0);
}

// ── o papel: pílula para o executivo, a saída para o gestor ───────────────────────────
{
  const pr = rep.r['#v5Papel'] || {}, pc = como.r['#v5Papel'] || {};
  checar('o executivo vê a pílula "Executivo"', pr.texto === 'Executivo' && !pr.html, JSON.stringify(pr));
  checar('no modo executivo a pílula é o botão "Voltar ao gestor"',
    /<button[^>]*data-v5-menu="visao-gestor"[^>]*>[\s\S]*Voltar ao gestor<\/button>/.test(pc.html || ''), JSON.stringify(pc).slice(0, 300));
  checar('nada de "Visão de executivo" escrito como etiqueta', !/Visão de executivo/.test(pc.texto || '') && !/>\s*Visão de executivo/i.test(pc.html || ''));
  checar('o botão é marcado para perder o desenho de pílula', (pc.classes || []).indexOf('is-voltar') >= 0);
  checar('o executivo de verdade não tem botão de voltar', !/visao-gestor/.test(JSON.stringify(rep.r)));
}

// ── o menu do avatar: o mesmo, mais a saída ───────────────────────────────────────────
{
  const mr = (rep.r['#v5Menu'] || {}).html || '', mc = (como.r['#v5Menu'] || {}).html || '';
  const semVoltar = mc.replace(/<button[^>]*data-v5-menu="visao-gestor"[^>]*>[\s\S]*?<\/button>/, '');
  checar('o menu do avatar é o do executivo, com a saída a mais', mr && semVoltar === mr,
    'executivo: ' + mr.slice(0, 200) + '\n      como executivo sem a saída: ' + semVoltar.slice(0, 200));
  checar('o menu diz "Voltar ao gestor"', /Voltar ao gestor/.test(mc));
}

// ── a linha de cima e o rodapé ────────────────────────────────────────────────────────
{
  const vazio = { texto: '', hidden: false };
  ['#updatedLine', '#footerText'].forEach((k) => [rep, como, gestor].forEach((m) => { if (!m.r[k]) m.r[k] = vazio; }));
  const lr = rep.r['#updatedLine'].texto, lc = como.r['#updatedLine'].texto, lg = gestor.r['#updatedLine'].texto;
  checar('o executivo não vê o time nem a meta do time no topo', !/Time ativo|executivos|Meta de|em preparação/.test(lr), lr);
  checar('o topo diz de quando é o dado', /^HubSpot atualizado (hoje|em \d{2}\/\d{2}) às \d{2}:\d{2}$/.test(lr), lr);
  checar('a conferência automática não entra no topo do executivo', (rep.r['#updatedLine'] && rep.dom.el('#updatedLine').filhos.length === 0), 'apareceu botão de conferência');
  checar('topo igual nos dois', lr === lc, lr + ' × ' + lc);
  checar('o gestor continua com a linha dele', /Time ativo: \d+ executivos/.test(lg) && /Meta de novembro: 52 clientes/.test(lg), lg);
  const rr = rep.r['#footerText'];
  checar('o rodapé técnico sai da tela do executivo', rr.texto === '' && rr.hidden === true, JSON.stringify(rr));
  checar('o rodapé do gestor continua', /HubSpot/.test(gestor.r['#footerText'].texto));
}

// ── a hora do topo ────────────────────────────────────────────────────────────────────
{
  const sb = { }; vm.createContext(sb); vm.runInContext(recortar(tpl, 'linhaDeFrescorDoExecutivo'), sb);
  const agora = Date.parse('2026-11-02T20:00:00Z'); // 17:00 em Brasília
  const linha = (f) => (typeof sb.linhaDeFrescorDoExecutivo === 'function' ? sb.linhaDeFrescorDoExecutivo(f, agora) : '‹não existe›');
  checar('hoje', linha('02/11/2026 às 16:34') === 'HubSpot atualizado hoje às 16:34', linha('02/11/2026 às 16:34'));
  checar('outro dia', linha('01/11/2026 às 19:02') === 'HubSpot atualizado em 01/11 às 19:02', linha('01/11/2026 às 19:02'));
  checar('sem carimbo não inventa hora', !/\d{2}:\d{2}/.test(linha('')) && linha('') !== '‹não existe›');
}

// ── 2. por construção: só a saída lê o modo ───────────────────────────────────────────
{
  /* nomes das funções onde cada linha mora */
  const linhas = tpl.split('\n');
  let fn = '?';
  const donos = [];
  linhas.forEach((l, i) => {
    const m = l.match(/^(?:async\s+)?function\s+([\w$]+)|^([\w$]+\.[\w$]+)\s*=\s*(?:async\s*)?function/);
    if (m) fn = m[1] || m[2];
    const t = l.trim();
    if (/^(\/\/|\/\*|\*)/.test(t)) return;
    if (/visaoDeGestor|v5VisaoExecutivo\(\)|V5_VISAO_CHAVE|'v6-visao'/.test(l)) donos.push(fn + '@' + (i + 1));
  });
  const PERMITIDOS = ['v5PintarConta', 'v5PintarMenu', 'v5VisaoExecutivo', 'v5EnderecoDosDados', 'v5TrocarVisao', 'hidratarSessao', 'v5Iniciais', 'GV2.preler', 'GV2.pv2Acao'];
  const fora = donos.filter((d) => {
    const nome = d.split('@')[0];
    if (PERMITIDOS.indexOf(nome) >= 0) return false;
    /* a constante e a pré-leitura do fim do script do gestor moram fora de função */
    const linha = linhas[Number(d.split('@')[1]) - 1];
    return !(/^const V5_VISAO_CHAVE = 'v6-visao';/.test(linha.trim()) || /window\.__gv2PreEmail && GV2\.preler/.test(linha));
  });
  checar('nenhuma tela lê o modo "como executivo" (só a saída, os dados e a pré-leitura)', fora.length === 0,
    'leem o modo: ' + fora.join(', '));
  checar('o servidor entrega o modo como executivo de verdade (role rep)',
    /visaoExecutivo \? Object\.assign\(\{\}, usuario, \{ role: 'rep' \}\)/.test(api));
  checar('no modo executivo o time não é pré-lido', /!GV2\.preLeitura && !v5VisaoExecutivo\(\)\) GV2\.preler/.test(tpl)
    && /window\.__gv2PreEmail && GV2\.preler && !GV2\.preLeitura && !\(typeof v5VisaoExecutivo === 'function' && v5VisaoExecutivo\(\)\)/.test(tpl));
}

// ── 3. jargão que não volta ───────────────────────────────────────────────────────────
{
  const footer = (md.match(/footerText:\s*`([^`]*)`/) || [])[1] || '';
  checar('o rodapé gerado não tem id de pipeline nem definição de termo', footer && !/9160|pipeline \d|Leads críticos =/.test(footer), footer);
  const proibidos = ['slot no Supabase', "· Supabase'", '✓ Supabase', "· Supabase —", 'próximo snapshot automático',
    'sessão \' + \'do Supabase', "'do Supabase para gravar", "'Visão de executivo'", 'Voltar para a visão de gestor',
    "'sem Supabase nesta sessão'", "'Supabase indisponível'", "'esta sessão está sem Supabase'", "'o Supabase recusou'"];
  const achados = proibidos.filter((p) => tpl.indexOf(p) >= 0);
  checar('avisos do executivo sem nome de banco nem "snapshot"', achados.length === 0, achados.join(' | '));
}

// ── 4. o mesmo produto ────────────────────────────────────────────────────────────────
{
  const gv2 = (tpl.match(/\.gv2,\.gv2-tokens\{([^}]*)\}/) || [])[1] || '';
  const tok = (bloco, nome) => ((bloco.match(new RegExp(nome + ':\\s*([^;]+);')) || [])[1] || '').trim();
  const exClaro = (tpl.match(/:root:not\(\[data-tema="escuro"\]\) body\.exec-v3\{([^}]*)\}/) || [])[1] || '';
  checar('a casca do executivo tem os tokens do gestor no claro', !!exClaro, 'bloco :root:not([data-tema="escuro"]) body.exec-v3 sumiu');
  [['--bg', '--gv2-bg'], ['--chip', '--gv2-chip'], ['--line', '--gv2-line'], ['--input', '--gv2-sub']].forEach(([a, b]) => {
    checar('claro: ' + a + ' do executivo = ' + b + ' do gestor', tok(exClaro, a) && tok(exClaro, a).toUpperCase() === tok(gv2, b).toUpperCase(),
      tok(exClaro, a) + ' × ' + tok(gv2, b));
  });
  const gv2Esc = (tpl.match(/:root\[data-tema="escuro"\] \.gv2,:root\[data-tema="escuro"\] \.gv2-tokens\{([^}]*)\}/) || [])[1] || '';
  const exEsc = (tpl.match(/:root\[data-tema="escuro"\] body\.exec-v3\{([^}]*)\}/) || [])[1] || '';
  checar('escuro: o fundo do executivo é o do gestor', tok(exEsc, '--bg') && tok(exEsc, '--bg').toUpperCase() === tok(gv2Esc, '--gv2-bg').toUpperCase(),
    tok(exEsc, '--bg') + ' × ' + tok(gv2Esc, '--gv2-bg'));
  const nav = (tpl.match(/\.gv2\{--nv-bg:[^}]*\}/) || [''])[0];
  checar('o item ativo do menu é o do gestor', tok(exClaro, '--ex-nav-ativo-bg').toUpperCase() === tok(nav, '--nv-acao-soft').toUpperCase()
    && tok(exClaro, '--ex-nav-ativo-tx').toUpperCase() === tok(nav, '--nv-acao-tx').toUpperCase());
  checar('as abas do topo têm 40 px', /\.tab-btn\{height:40px;min-height:40px;/.test(tpl));
  checar('o tema do avatar tem 40 px', /\.v5-seg button\{flex:1;height:40px;/.test(tpl));
  checar('o "Voltar ao gestor" tem 40 px', /\.v5-voltar-gestor\{height:40px;/.test(tpl));
  checar('Poppins nos dois', /--font-body:'Poppins'/.test(tpl) && /--gv2-font:Poppins/.test(tpl));
}

if (falhas.length) {
  console.error('Ver como executivo: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + ':');
  falhas.forEach((f) => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('Ver como executivo: ' + ok + ' ok.');
