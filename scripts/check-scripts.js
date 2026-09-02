// scripts/check-scripts.js
// Verificação de sintaxe dos <script> inline do template e do HTML publicado.
//
// POR QUE ISSO EXISTE: o cockpit é um arquivo único de ~24 mil linhas com quase toda a
// lógica num <script> inline. Um erro de sintaxe em qualquer ponto não quebra "uma
// função" — quebra o arquivo inteiro, e a tela abre em branco atrás do login. Não havia
// nenhuma checagem automática disso: o build só fazia string replace e escrevia o
// arquivo, feliz da vida com JavaScript inválido dentro.
//
// Uso: node scripts/check-scripts.js
// Sai com código 1 e aponta arquivo + linha do primeiro erro encontrado.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const alvos = [
  path.join(root, 'template', 'cockpit.template.html'),
  path.join(root, 'public', 'index.html')
].filter(fs.existsSync);

// Captura <script ...>...</script> preservando o offset de linha, pra que o número de
// linha do erro seja o número de linha NO ARQUIVO, não dentro do bloco.
const RE_SCRIPT = /<script([^>]*)>([\s\S]*?)<\/script>/gi;

let falhas = 0;

alvos.forEach(arquivo => {
  const html = fs.readFileSync(arquivo, 'utf8');
  const rel = path.relative(root, arquivo);
  let m, blocos = 0;
  RE_SCRIPT.lastIndex = 0;
  while ((m = RE_SCRIPT.exec(html)) !== null) {
    const attrs = m[1] || '';
    const corpo = m[2] || '';
    // src externo não tem corpo; JSON de dados não é JavaScript.
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (/type\s*=\s*["']application\/json["']/i.test(attrs)) {
      const jsonBruto = corpo.trim();
      // No template o corpo é o placeholder {{DATA_JSON}} — não é JSON válido ainda.
      if (jsonBruto && jsonBruto !== '{{DATA_JSON}}') {
        try { JSON.parse(jsonBruto); }
        catch (e) { console.error(`FALHA ${rel}: bloco JSON inválido — ${e.message}`); falhas++; }
      }
      continue;
    }
    blocos++;
    const linhaInicial = html.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length;
    try {
      // new vm.Script faz o parse completo sem executar nada — é exatamente a
      // checagem que queremos (o script referencia document/window, que não
      // existem aqui, mas isso é runtime, não parse).
      new vm.Script(corpo, { filename: rel, lineOffset: linhaInicial - 1 });
    } catch (e) {
      console.error(`FALHA ${rel}: ${e.message}`);
      if (e.stack) {
        const linha = (e.stack.split('\n')[0] || '').trim();
        if (linha) console.error(`  em ${linha}`);
      }
      falhas++;
    }
  }
  if (!falhas) console.log(`OK ${rel} — ${blocos} bloco(s) de script com sintaxe válida.`);
});

// Os JSONs de dados também entram: o build faz require() neles e uma vírgula sobrando
// derruba o build inteiro com um stack trace que não diz qual arquivo era.
fs.readdirSync(path.join(root, 'data'))
  .filter(f => f.endsWith('.json'))
  .forEach(f => {
    try { JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8')); }
    catch (e) { console.error(`FALHA data/${f}: ${e.message}`); falhas++; }
  });

if (falhas > 0) {
  console.error(`\n${falhas} falha(s) de sintaxe.`);
  process.exit(1);
}
console.log('Todos os scripts inline e JSONs de dados passaram.');

/* ============================================================================
   BREAKPOINT FORA DA ESCALA (28/08/26, BLOCO 7 da revisão de identidade)
   ----------------------------------------------------------------------------
   O arquivo tinha 15 valores de max-width diferentes, cada um nascido de um conserto
   pontual. Isso não é só desarrumação: é a causa-raiz de duas classes de bug que este
   projeto já pagou — regra que cai no @media errado (os chips de Ligar/WhatsApp, que
   ficaram sem estilo no desktop) e sticky desligado num corte que ninguém lembrava (a
   bandeja indo para 83% da página no notebook).

   @media não aceita var(), então a escala não pode ser um token. A única forma de ela
   se manter é uma checagem que quebra o build. É esta.
   ============================================================================ */
const ESCALA_BREAKPOINTS = [420, 640, 760, 900, 1050, 1240];

/* ============================================================================
   GUARD DE VARIÁVEL CSS ÓRFÃ — a terceira vez que este defeito acontece.
   ----------------------------------------------------------------------------
   `var(--x)` sem fallback, com --x nunca definida, NÃO dá erro visível: a
   declaração fica inválida e o navegador cai no valor herdado (em `color`) ou no
   inicial (em `background`, que é transparent). Nada quebra no build, nada aparece
   no console, e a tela mente.

   Histórico neste arquivo:
     · 28/08 — `--body` (21 usos) e `--dark-line` (6): bordas caíram em currentColor,
       quase brancas no painel escuro.
     · 29/08 — `--paper` (4 usos, meu): o nome da operação selecionada e o nome do
       adicional selecionado ficaram tinta-escura-sobre-fundo-escuro, invisíveis; e o
       fundo da tela cheia virou transparent. O Julyan viu na tela antes de mim.

   As definições são varridas no ARQUIVO INTEIRO, não só nos blocos <style>: o JS monta
   `style="--stage-color:..."` em vários lugares, e essas variáveis são definidas no
   elemento. Sem isso o guard acusaria uma dúzia de falsos positivos.

   Só falha quando NÃO HÁ FALLBACK. `var(--talvez, #fff)` é intencional e passa.
   ============================================================================ */
function conferirVariaveisCss(arquivo, cru) {
  /* Comentário não conta, nem como definição nem como uso: o :root deste arquivo
     explica ESTE defeito escrevendo `var(--x) sem definição`, e a primeira versão do
     guard acusou o próprio texto. Mesmo erro que já pegou o guard de breakpoint. */
  const semComentario = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const estilos = semComentario([...cru.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n'));
  if (!estilos.trim()) return [];
  const definidas = new Set();
  for (const m of semComentario(cru).matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) definidas.add(m[1]);
  const orfas = new Map();
  for (const m of estilos.matchAll(/var\((--[a-zA-Z0-9-]+)([^)]*)\)/g)) {
    const nome = m[1];
    const temFallback = /^\s*,/.test(m[2]);
    if (temFallback || definidas.has(nome)) continue;
    orfas.set(nome, (orfas.get(nome) || 0) + 1);
  }
  return [...orfas.entries()].map(([nome, usos]) =>
    'VARIÁVEL CSS NUNCA DEFINIDA: ' + nome + ' (' + usos + (usos === 1 ? ' uso' : ' usos') + ', sem fallback)' +
    '\n  Sem fallback a declaração morre em silêncio: em color o texto herda, em background cai para transparent.' +
    '\n  Defina no :root, ou escreva var(' + nome + ', <valor>) se a intenção é opcional.');
}
function checarBreakpoints() {
  const fsb = require('fs');
  const alvo = 'template/cockpit.template.html';
  const cru = fsb.readFileSync(alvo, 'utf8');
  /* Comentario NAO conta. Um comentario deste arquivo documenta a remocao de um
     "@media max-width:1280px" que nao existe mais, e a primeira versao desta guarda
     acusou esse texto como regra viva. Mesmo tipo de erro que ja me pegou duas vezes
     hoje: varredura que le comentario como codigo. */
  const txt = cru.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const fora = [];
  /* MAX-WIDTH E MIN-WIDTH (30/08/26 — Bloco 7 da prancha: "adicionar ao check-scripts.js:
     falhar se @media usar valor fora de {1240,1000,720,420}").

     A versão anterior olhava só max-width, e um @media (min-width:1051px) passava limpo.
     Não havia nenhum no arquivo — medido, os 222 "min-width:" de lá são propriedades CSS,
     não media queries — mas guarda existe para o commit de amanhã, não para o estado de
     hoje. Feature query (hover, prefers-reduced-motion) não tem largura e continua fora da
     conta, como deve.

     Duas passadas de propósito: uma @media pode declarar DUAS larguras (faixa com min e max
     no mesmo bloco), e um laço que casa uma vez por bloco deixaria a segunda escapar. */
  for (const bloco of txt.matchAll(/@media[^{]*/g)) {
    for (const w of bloco[0].matchAll(/(?:max|min)-width:\s*(\d+)px/g)) {
      const v = Number(w[1]);
      if (!ESCALA_BREAKPOINTS.includes(v)) fora.push(v);
    }
  }
  /* Mantido: o laço antigo, que casa a forma canônica e serve de rede se alguém mexer no
     regex de cima. Duplicar o mesmo valor em `fora` não muda o relatório — ele deduplica. */
  for (const m of txt.matchAll(/@media\s*\(?\s*max-width:\s*(\d+)px/g)) {
    const v = Number(m[1]);
    if (!ESCALA_BREAKPOINTS.includes(v)) fora.push(v);
  }
  if (fora.length) {
    const unicos = [...new Set(fora)].sort((a, b) => b - a);
    console.error('BREAKPOINT FORA DA ESCALA: ' + unicos.join('px, ') + 'px');
    console.error('  A escala é ' + ESCALA_BREAKPOINTS.join(' · ') + '. Use o menor corte que ainda cobre o seu caso.');
    console.error('  Colapsar mais cedo nunca estoura; colapsar mais tarde estoura.');
    return false;
  }
  return true;
}
if (!checarBreakpoints()) process.exit(1);

function checarVariaveisCss() {
  const alvo = 'template/cockpit.template.html';
  const problemas = conferirVariaveisCss(alvo, require('fs').readFileSync(alvo, 'utf8'));
  if (!problemas.length) return true;
  problemas.forEach(m => console.error(m));
  return false;
}
if (!checarVariaveisCss()) process.exit(1);

/* ── TRAVA DE DESTINO ──────────────────────────────────────────────────────────────
   Existe porque em 30/08/26 eu mesmo deixei três botões apontando para viewCockpit
   depois de mover o conteúdo deles para a Daily. Nenhum estava "morto": a view existia,
   o clique respondia, a auditoria de clique passava. O destino é que estava errado.

   Pega a parte mecânica: view que não existe, âncora de rolagem que não existe, aba sem
   view e view de aba sem botão. Conteúdo que mudou de aba com destino ainda válido não
   dá para pegar assim — isso continua sendo leitura de tela. */
function checarDestinos() {
  const arquivo = 'template/cockpit.template.html';
  const cru = fs.readFileSync(arquivo, 'utf8');
  const erros = [];

  const ids = new Set();
  let m;
  const reId = /\bid="([A-Za-z][\w-]*)"/g;
  while ((m = reId.exec(cru))) ids.add(m[1]);

  /* views declaradas e botões de aba que as abrem */
  const views = new Set();
  const reView = /<div class="view" id="(view[\w-]*)"/g;
  while ((m = reView.exec(cru))) views.add(m[1]);
  const abas = new Set();
  const reAba = /class="tab-btn"[^>]*data-view="(view[\w-]*)"/g;
  while ((m = reAba.exec(cru))) abas.add(m[1]);

  /* Uma view é alcançável por BOTÃO DE ABA ou por activateTab no código. viewOnboarding é
     do segundo tipo de propósito: é a tela de primeiro acesso do executivo (role rep com
     aComecar), e dar aba no topo para ela seria pior — apareceria para quem já entrou. */
  const abertasPorCodigo = new Set();
  const reAbrir = /activateTab\(\s*'(view[\w-]*)'/g;
  while ((m = reAbrir.exec(cru))) abertasPorCodigo.add(m[1]);
  views.forEach(v => {
    if (!abas.has(v) && !abertasPorCodigo.has(v)) erros.push('  view que ninguém abre — nem aba no topo, nem activateTab: ' + v);
  });
  abas.forEach(v => { if (!views.has(v)) erros.push('  botão de aba para uma view que não existe: ' + v); });

  /* destinos escritos como literal em qualquer lugar do código */
  const destinos = new Map();   // destino -> quantas vezes
  const registrar = (d, ctx) => { if (!destinos.has(d)) destinos.set(d, ctx); };
  const reAtivar = /activateTab\(\s*'(view[\w-]*)'/g;
  while ((m = reAtivar.exec(cru))) registrar(m[1], 'activateTab');
  const reRolar = /'rolar:([\w-]+)'/g;
  while ((m = reRolar.exec(cru))) registrar('rolar:' + m[1], 'rolar');
  const reFaixa = /data-(?:faixa-ir|ir-para)="(view[\w-]*)"/g;
  while ((m = reFaixa.exec(cru))) registrar(m[1], 'atributo');

  destinos.forEach((ctx, d) => {
    if (d.indexOf('rolar:') === 0) {
      const id = d.slice(6);
      if (!ids.has(id)) erros.push('  destino "' + d + '" (' + ctx + ') rola até um id que não existe no template');
      return;
    }
    if (!views.has(d)) erros.push('  destino "' + d + '" (' + ctx + ') aponta para uma view que não existe');
  });

  if (!erros.length) {
    console.log('OK destinos — ' + views.size + ' views, ' + destinos.size + ' destino(s) literal(is), todos existem.');
    return true;
  }
  console.error('\nDESTINO INVÁLIDO em ' + arquivo + ':');
  erros.forEach(e => console.error(e));
  console.error('  Um clique pode responder e ainda assim levar para o lugar errado. Confira também, na mão, se o CONTEÚDO prometido ainda está na aba de destino.');
  return false;
}
if (!checarDestinos()) process.exit(1);

/* ══════════════════════════════════════════════════════════════════════════════════════
   FUNÇÃO CHAMADA QUE NÃO EXISTE (01/09/26)
   --------------------------------------------------------------------------------------
   NASCEU DE UM DEFEITO MEU, EM PRODUÇÃO, com 15 minutos no ar: o card de conta-alvo
   chamava `pl4SlotSugerido()` e a função nunca entrou no arquivo — o script de patch
   escreveu o template ANTES de aplicar os últimos passos, e o passo perdido era justamente
   a declaração. Sintaxe válida, build verde, 102 testes verdes, os outros guards verdes.

   E o pior: o erro só aparecia COM DADO. O card só é renderizado quando existe conta-alvo
   na fila, e o preview local zera o Supabase — então a aba abria limpa aqui e quebrava lá,
   mostrando a tela antiga da semana no lugar do ritual. ReferenceError em render é aba
   morta silenciosa: quem usa não vê erro, vê a tela errada.

   O que este guard faz: para os prefixos que ESTE projeto criou, toda chamada `nome(`
   precisa ter uma declaração no mesmo arquivo. Restrito aos nossos prefixos de propósito —
   verificar todo identificador acusaria cada método de biblioteca, e guard que grita demais
   é guard que ninguém lê. Comentários são removidos antes da varredura: a 1ª versão acusou
   duas funções que existem só na NOTA que explica por que foram removidas.
   ══════════════════════════════════════════════════════════════════════════════════════ */
function checarChamadasSemDeclaracao() {
  const PREFIXOS = /^(pl4|xv3|gx|gi|d4|gd|gs|mf|kb|tp|prosp2|prospeccao|agenda|fila|cadencia|daily|frescor|render|abrir|wire|ligar|build|montar|checar|buscar|carregar|salvar|atualizar|desenhar|irPara)[A-Z]/;
  let falhou = false;
  alvos.forEach(arquivo => {
    const html = fs.readFileSync(arquivo, 'utf8');
    const rel = path.relative(root, arquivo);
    let codigo = '';
    RE_SCRIPT.lastIndex = 0;
    let mm;
    while ((mm = RE_SCRIPT.exec(html)) !== null) {
      const attrs = mm[1] || '';
      if (/\bsrc\s*=/i.test(attrs)) continue;
      if (/type\s*=\s*["']application\/json["']/i.test(attrs)) continue;
      codigo += '\n' + (mm[2] || '');
    }
    /* comentário não é chamada */
    codigo = codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

    const declaradas = new Set();
    const guarda = re => { (codigo.match(re) || []).forEach(m => {
      const nome = (m.match(/[A-Za-z_$][\w$]*/g) || []).filter(x => !/^(function|const|let|var|async|window)$/.test(x))[0];
      if (nome) declaradas.add(nome);
    }); };
    guarda(/function\s+[A-Za-z_$][\w$]*\s*\(/g);
    guarda(/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?function/g);
    guarda(/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\(/g);
    /* seta de um parâmetro sem parênteses: `const buscarLead = id => ...` */
    guarda(/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g);
    guarda(/window\.[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function|\()/g);
    guarda(/[A-Za-z_$][\w$]*\s*:\s*(?:async\s*)?function/g);

    const chamadas = new Set();
    (codigo.match(/\b[A-Za-z_$][\w$]*\s*\(/g) || []).forEach(m => {
      const nome = m.replace(/\s*\($/, '').trim();
      if (PREFIXOS.test(nome)) chamadas.add(nome);
    });
    const faltando = [...chamadas].filter(n => !declaradas.has(n)).sort();
    if (faltando.length) {
      falhou = true;
      console.error('\nCHAMADA SEM DECLARAÇÃO em ' + rel + ':');
      faltando.forEach(n => console.error('  ' + n + '() é chamada e não existe neste arquivo'));
      console.error('  ReferenceError em render não mostra erro para quem usa: mostra a tela errada.');
      console.error('  E costuma aparecer só COM DADO — o preview local zera o Supabase e esconde o caso.');
    }
  });
  if (!falhou) console.log('OK referências — toda função dos nossos prefixos que é chamada existe.');
  return !falhou;
}
if (!checarChamadasSemDeclaracao()) process.exit(1);

/* ══════════════════════════════════════════════════════════════════════════════════════
   O PLACAR DO EXECUTIVO NÃO PODE COMPARAR DADO QUE CHEGA ZERADO (01/09/26)

   POR QUE ESTA GUARDA EXISTE: montei o placar do time da Minha Daily v2 três vezes, e as
   duas primeiras comparavam número que, na sessão de um EXECUTIVO, é sempre zero para o
   colega — não por ele não ter feito, mas porque a sessão não recebe o dado:

     · pontos da semana (d4PontosDaSemana / getDaily): a política de RLS da tabela dailies
       entrega ao executivo SÓ a própria linha. Medido em produção: o card dizia
       "1º você 400 · 2º Bruno 0" e o Bruno tinha fechado 2 contratos no dia anterior;
     · visitasHubspotHoje e companhia: resumoDeColega, em scripts/montar-dados.js, zera
       esses quatro campos para colega de propósito.

   Nenhum teste pegava, porque o código está correto — ele soma o que recebe. O defeito é
   de PROCEDÊNCIA do dado, e só aparece olhando a linha de outra pessoa.

   Se um dia o produto decidir abrir esses dados para o executivo (RLS ou resumoDeColega),
   esta guarda tem que cair junto com a decisão — e aí ela força a conversa, que é o ponto.
   ══════════════════════════════════════════════════════════════════════════════════════ */
function checarPlacarDoExecutivo() {
  const ZERADOS = ['d4PontosDaSemana', 'visitasHubspotHoje', 'avancosHubspotHoje',
    'propostasHubspotHoje', 'fechamentosHubspotHoje'];
  let falhou = false;
  alvos.forEach(caminho => {
    const rel = path.relative(root, caminho);
    const src = fs.readFileSync(caminho, 'utf8');
    const linhas = src.split(/\r?\n/);
    const ini = linhas.findIndex(l => l.startsWith('function dl2PlacarTime('));
    if (ini < 0) return;
    let fim = ini;
    while (fim < linhas.length && linhas[fim] !== '}') fim++;
    const corpo = linhas.slice(ini, fim + 1)
      .filter(l => !/^\s*(\/\*|\*|\/\/)/.test(l))
      .join('\n');
    const usados = ZERADOS.filter(n => corpo.indexOf(n) >= 0);
    if (usados.length) {
      falhou = true;
      console.error('\nPLACAR COM DADO ZERADO em ' + rel + ':');
      usados.forEach(n => console.error('  dl2PlacarTime usa ' + n + ', que chega ZERO para colega na sessão do executivo'));
      console.error('  O placar mostraria todo colega em zero — e diria ao executivo que ele é o primeiro, sempre.');
      console.error('  O que a sessão recebe de verdade sobre colega: ganhosSemana, fechadosNoMes, metaMensal.');
    }
  });
  if (!falhou) console.log('OK placar — o placar do executivo compara dado que a sessão dele recebe.');
  return !falhou;
}
if (!checarPlacarDoExecutivo()) process.exit(1);

/* ══ FIAÇÃO PRESA A CLASSE QUE NENHUM MARKUP GERA (02/09/26) ══════════════════════════
   Na Agenda/Planejamento eu achei quatro filtros de visão inertes: o ouvinte fazia
   querySelectorAll('.pl4-niveis [data-v]') e .pl4-niveis existe SÓ no CSS — nenhum markup
   a produz. O seletor casava zero, os quatro botões nunca receberam ouvinte, e as pílulas
   declaravam "6 / 3 / 3 / 0" enquanto a grade renderizava 6 em todas.
   O que torna isto caro: não é erro de sintaxe, não é referência a função inexistente, não
   quebra nada em tempo de execução e não aparece em nenhuma das outras guardas. O clique
   simplesmente não faz nada. Foi a MESMA falha do nível Sinal da v4, pelo mesmo mecanismo,
   sob o comentário que mandava não amarrar o ouvinte ao desenho — porque quem renomeia o
   container não vai ler o ouvinte.
   Esta guarda compara as classes usadas dentro de querySelector/querySelectorAll com as
   classes que o arquivo realmente produz (class="...", classList.add/remove/toggle,
   className=). Classe usada em seletor e nunca gerada = fiação que não alcança nada.
   A DÍVIDA CONHECIDA é lista fechada e tem que ficar EXATA: item novo reprova, e item
   consertado que não sai da lista também reprova. Whitelist que só cresce é guarda morta. */
function checarSeletoresDeFiacao() {
  const arquivo = 'template/cockpit.template.html';
  const cru = fs.readFileSync(path.join(root, arquivo), 'utf8');

  /* Dívida herdada, cada uma com a aba que resolve. Não reprova hoje; reprova se mudar. */
  const DIVIDA = {
    'plano-map-stage': 'Rotas — "Adicionar por endereco ou CEP" tem botao ligado e abrirAdicionarManual sai no if (!stage) return: o painel nunca abre',
    'd-prom': 'Minha Daily — fiacao orfa de desenho aposentado',
    'd-salvar': 'Minha Daily — fiacao orfa de desenho aposentado',
    'prospeccao-btn-rota': 'Prospeccao — fiacao orfa de desenho aposentado',
    'prospeccao-btn-semfit': 'Prospeccao — fiacao orfa de desenho aposentado',
    'prospeccao-btn-criar': 'Prospeccao — fiacao orfa de desenho aposentado',
    'fn2-esteira': 'Meu Funil — atalho reserva ficou no nome antigo depois da Esteira v3 (.fn3-); o caminho principal (.fn2-gaveta) existe'
  };

  const geradas = new Set();
  let m;
  const reClass = /class="([^"]*)"/g;
  while ((m = reClass.exec(cru))) {
    String(m[1]).split(/[\s${}()?:'"+]+/).forEach(t => { if (t) geradas.add(t.replace(/^\./, '')); });
  }
  const reLista = /classList\.(?:add|remove|toggle|contains)\(\s*'([^']+)'/g;
  while ((m = reLista.exec(cru))) geradas.add(m[1]);
  const reCn = /className\s*=\s*'([^']*)'/g;
  while ((m = reCn.exec(cru))) String(m[1]).split(/\s+/).forEach(t => { if (t) geradas.add(t); });

  /* A classe só conta quando o ponto abre um seletor — sem esta borda, "wa.me" e
     "google.com" dentro de a[href*="..."] entram como classes .me e .com. */
  const achados = new Map();
  const reQ = /querySelector(?:All)?\(\s*'([^']+)'/g;
  while ((m = reQ.exec(cru))) {
    const sel = m[1];
    const reCls = /(?:^|[\s,>+~([])\.([A-Za-z][\w-]*)/g;
    let c;
    while ((c = reCls.exec(sel))) {
      if (!geradas.has(c[1]) && !achados.has(c[1])) achados.set(c[1], sel);
    }
  }

  const novas = [...achados.keys()].filter(c => !DIVIDA[c]);
  const resolvidas = Object.keys(DIVIDA).filter(c => !achados.has(c));
  if (!novas.length && !resolvidas.length) {
    console.log('OK fiação — toda classe usada em seletor é gerada por algum markup (' +
      Object.keys(DIVIDA).length + ' de dívida conhecida, inalterada).');
    return true;
  }
  console.error('\nFIAÇÃO QUE NÃO ALCANÇA NADA em ' + arquivo + ':');
  novas.forEach(c => {
    console.error('  .' + c + ' não é gerada por nenhum markup — o seletor casa ZERO');
    console.error('     em: ' + achados.get(c));
    console.error('     Nada quebra: o forEach itera zero e o clique não faz nada.');
  });
  resolvidas.forEach(c => {
    console.error('  .' + c + ' está na lista de dívida e JÁ NÃO aparece — tire da lista');
    console.error('     (' + DIVIDA[c] + ')');
  });
  return false;
}
if (!checarSeletoresDeFiacao()) process.exit(1);

/* ══ PISO DE DESKTOP QUE VIRA TETO NO TOQUE (02/09/26) ═══════════════════════════════
   Em 01/09 eu subi quatro campos para o piso de desktop com seletor de ID
   (#prosp2Ordenar, #devPdiData, #prcCliente, #prcTelefone -> min-height:38px). ID é
   (1,0,0) e vence classe (0,1,1) INCLUSIVE dentro de @media — então essas linhas anularam
   em silêncio os pisos de 44px que já existiam para o toque (.p4-campo input,
   .um-next input[type=date], .prosp2-ordenar select). O desktop melhorou e o celular
   piorou, na mesma linha, sem aviso.
   É a segunda vez que um piso de toque cai sem ninguém ver (a primeira foi uma limpeza de
   CSS que apagou a regra dos 44px porque ela começava com uma classe aposentada).
   A regra da casa é: 38px no desktop, 44px em <=760px. Então todo ID que recebe piso de
   38 tem que ter o par de 44 dentro do breakpoint de 760 — e o par tem que ser por ID
   também, senão perde a especificidade de novo. */
function checarPisoDeToque() {
  const arquivo = 'template/cockpit.template.html';
  const cru = fs.readFileSync(path.join(root, arquivo), 'utf8');
  const linhas = cru.split('\n');

  const de38 = new Set();
  const de44 = new Set();
  linhas.forEach(l => {
    const corpo = l.trim();
    if (corpo.indexOf('//') === 0 || corpo.indexOf('*') === 0) return;
    const ids = corpo.match(/#[A-Za-z][\w-]*/g);
    if (!ids) return;
    /* SELETOR e DECLARACAO separados. Na primeira versao eu varri a linha inteira e
       #fff (uma cor) entrou como id — falso vermelho no primeiro uso da guarda. */
    const chave = corpo.indexOf('{');
    if (chave < 0) return;
    const seletor = corpo.slice(0, chave);
    const decl = corpo.slice(chave);
    const doSeletor = ids.filter(i => seletor.indexOf(i) >= 0);
    if (!doSeletor.length) return;
    if (decl.indexOf('min-height:38px') >= 0) doSeletor.forEach(i => de38.add(i));
    if (decl.indexOf('min-height:44px') >= 0) doSeletor.forEach(i => de44.add(i));
  });

  const semPar = [...de38].filter(i => !de44.has(i));
  if (!semPar.length) {
    console.log('OK piso de toque — os ' + de38.size + ' ID(s) com piso de 38px têm o par de 44px para <=760px.');
    return true;
  }
  console.error('\nPISO DE DESKTOP SEM PAR NO TOQUE em ' + arquivo + ':');
  semPar.forEach(i => {
    console.error('  ' + i + ' recebe min-height:38px por ID e não tem min-height:44px por ID');
    console.error('     Seletor de ID vence classe inclusive dentro de @media: se havia regra de 44px');
    console.error('     por classe para este controle, ela está anulada e o alvo fica 38px no celular.');
  });
  return false;
}
if (!checarPisoDeToque()) process.exit(1);

/* ══ VARIÁVEL DECLARADA ONDE O MARKUP NÃO CHEGA (02/09/26) ═══════════════════════════
   A página de leitura do Playbook tinha 46 usos de var(--v6-*) e a paleta inteira estava
   INALCANÇÁVEL: os tokens eram declarados só em .pbv6, e nenhum markup gera essa classe
   desde que o shell do leitor virou .pb7-lendo. Medido no navegador:
   getPropertyValue("--v6-dark") devolvia VAZIO — então todo bloco escuro de fala pronta
   era desenhado transparente, o cartão âmbar do "O que fazer agora" ficava sem fundo e o
   cabeçalho de tabela sem cor. O desenho existia e não chegava.
   A guarda de variável-nunca-definida não pegou porque a variável ESTAVA definida; o que
   faltava era ALCANCE. Foi o terceiro caso da mesma família na mesma tela (os outros: o
   container .pl4-niveis do filtro de visão e o id #playbookToc do scrollspy) — alguém
   renomeia o markup e o CSS/JS segue apontando para o nome antigo, sem erro nenhum.

   ESCOPO: só o bloco <style>. A primeira versão varria o arquivo inteiro e tratou linhas
   de JS como seletor ("const tituloEv = ..." tem chave), acusando --alt e --agm-nd, que
   são declaradas INLINE no style= do elemento. Declaração inline sempre alcança, porque
   mora no próprio nó — então ela também entra na conta. */
function checarAlcanceDasVariaveis() {
  const arquivo = 'template/cockpit.template.html';
  const cru = fs.readFileSync(path.join(root, arquivo), 'utf8');

  /* so o CSS */
  const ini = cru.indexOf(String.fromCharCode(60) + 'style');
  const fim = cru.indexOf('</style>');
  if (ini < 0 || fim < 0) { console.log('OK alcance — sem bloco de estilo para conferir.'); return true; }
  const css = cru.slice(cru.indexOf('>', ini) + 1, fim);

  const geradas = new Set();
  let m;
  const reClass = /class="([^"]*)"/g;
  while ((m = reClass.exec(cru))) {
    String(m[1]).split(/[\s${}()?:'"+]+/).forEach(t => { if (t) geradas.add(t.replace(/^\./, '')); });
  }
  const reLista = /classList\.(?:add|remove|toggle)\(\s*'([^']+)'/g;
  while ((m = reLista.exec(cru))) geradas.add(m[1]);
  const reCn = /className\s*=\s*'([^']*)'/g;
  while ((m = reCn.exec(cru))) String(m[1]).split(/\s+/).forEach(t => { if (t) geradas.add(t); });

  /* variável declarada inline no elemento: style="--x:algo" — alcança sempre */
  const inline = new Set();
  const reInline = /style="[^"]*?(--[A-Za-z][\w-]*)\s*:/g;
  while ((m = reInline.exec(cru))) inline.add(m[1]);

  const declaradaEm = new Map();
  let seletorAtual = '';
  css.split(/\r?\n/).forEach(linha => {
    const t = linha.trim();
    if (t.indexOf('*') === 0 || t.indexOf('/*') === 0) return;
    const abre = t.indexOf('{');
    if (abre > 0 && t.indexOf('@') !== 0) seletorAtual = t.slice(0, abre).trim();
    const vars = t.match(/--[A-Za-z][\w-]*(?=\s*:)/g);
    if (!vars) return;
    vars.forEach(v => {
      if (!declaradaEm.has(v)) declaradaEm.set(v, new Set());
      declaradaEm.get(v).add(seletorAtual);
    });
  });

  /* Classe gerada por BIBLIOTECA, nao pelo nosso markup: o FullCalendar cria .fc no
     runtime. Lista fechada e pequena de proposito — cada nome aqui e uma excecao que
     alguem teve que justificar. */
  const DE_BIBLIOTECA = ['fc'];
  const alcanca = (sel) => {
    if (!sel) return false;
    if (DE_BIBLIOTECA.some(c => sel.indexOf('.' + c) >= 0)) return true;
    if (/(^|,)\s*(:root|\*|html|body)\s*(,|$)/.test(sel)) return true;
    return sel.split(',').map(x => x.trim()).filter(Boolean).some(parte => {
      const classes = parte.match(/\.[A-Za-z][\w-]*/g);
      if (!classes) return true;
      return classes.every(c => geradas.has(c.slice(1)));
    });
  };

  const usadas = new Set();
  const reUso = /var\(\s*(--[A-Za-z][\w-]*)/g;
  while ((m = reUso.exec(css))) usadas.add(m[1]);

  const mortas = [];
  usadas.forEach(v => {
    if (inline.has(v)) return;
    const onde = declaradaEm.get(v);
    if (!onde || !onde.size) return;   /* nunca definida é outra guarda */
    if (![...onde].some(alcanca)) mortas.push(v + '  declarada só em: ' + [...onde].join(' | ').slice(0, 80));
  });

  if (!mortas.length) {
    console.log('OK alcance — as ' + usadas.size + ' variáveis do CSS são declaradas em seletor que o markup gera.');
    return true;
  }
  console.error('\nVARIÁVEL DECLARADA ONDE O MARKUP NÃO CHEGA em ' + arquivo + ':');
  mortas.forEach(x => console.error('  ' + x));
  console.error('  Sem markup para o seletor, var(...) cai em inválido: fundo transparente,');
  console.error('  cor herdada, borda nenhuma — e nada disso dá erro de sintaxe.');
  return false;
}
if (!checarAlcanceDasVariaveis()) process.exit(1);
