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
    /* PAGA EM 02/09/26: o painel de endereco/CEP deixou de ancorar no palco do mapa (que
       saiu da tela quando a rota foi para o app de campo) e passou a nascer abaixo do
       resumo, que existe. A divida era exatamente esta: botao ligado, funcao voltando no
       primeiro if, e nenhum erro para investigar. */
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

/* == O MODO TV NAO PODE MIRAR MARCACAO INEXISTENTE (02/09/26) ========================
   Julyan: "a aba daily esta com um zoom gigante, n sei pq". Era o Modo TV, gravado em
   localStorage, com OITO seletores mortos no bloco `body.tv`: .tab-bar, .app-footer,
   .revbar, .health-badge, .gi-prom, .gi-plan, .daily-nav e .agenda-nav. Nenhum markup
   gera nenhum deles. Consequencia: a TV aumentava tudo e nao escondia NADA da moldura —
   e como ela tambem esconde `.gi-btn`, escondia o proprio botao de sair. Ligado e
   invisivel: para quem olha, e um zoom que apareceu sozinho.

   Ja tinha acontecido: o comentario do proprio bloco registra "duas das regras antigas
   miravam o hero que a etapa 2 substituiu". Duas vezes o mesmo mecanismo, no mesmo bloco.
   Nenhuma das outras guardas pega, porque checarSeletoresDeFiacao() olha so classe usada
   em querySelector — fiacao de JS —, e isto e CSS.

   POR QUE SO O body.tv, e nao o CSS todo: o arquivo tem 473 classes que aparecem apenas
   no CSS. A maioria e legitima (FullCalendar .fc-*, classe montada por interpolacao que
   nenhum extrator simples enxerga). Guardar tudo isso exigiria uma whitelist de centenas
   de itens que so cresce — que e o que o comentario da guarda acima chama de guarda morta.
   O body.tv e um conjunto FECHADO de ~40 regras cujo trabalho e esconder e aumentar
   elementos nomeados um por um: aqui alvo morto e sempre defeito. */
function checarModoTv() {
  const arquivo = 'template/cockpit.template.html';
  const cru = fs.readFileSync(path.join(root, arquivo), 'utf8');
  /* LITERAL, nao string: '[\\s\\S]' dentro de aspas simples chega como '[sS]',
     e a guarda nascida assim nao tirava estilo nenhum — todo alvo 'existia' e ela dava verde. */
  const reEstilo = /<style[^>]*>[\s\S]*?<\/style>/g;
  const foraDoCss = cru.replace(reEstilo, '');
  const regras = cru.split(String.fromCharCode(10)).filter(l => /^\s*body\.tv/.test(l.replace(/\r$/, ''))).join(String.fromCharCode(10));
  if (!regras) {
    console.error('MODO TV: nenhuma regra body.tv encontrada — a guarda perdeu o alvo.');
    return false;
  }
  /* `.tv` e a propria classe do body; l/meta/sub sao classes filhas do hero, geradas
     por interpolacao dentro do gi-hero-kpi e por isso invisiveis para busca literal. */
  const IGNORAR = new Set(['.tv', '.l', '.meta', '.sub']);
  const alvos = new Set();
  let m;
  const re = /([.#])([A-Za-z][\w-]*)/g;
  while ((m = re.exec(regras))) alvos.add(m[1] + m[2]);
  const mortos = [...alvos].filter(t => !IGNORAR.has(t) && foraDoCss.indexOf(t.slice(1)) < 0);
  if (mortos.length) {
    console.error('MODO TV MIRANDO MARCACAO INEXISTENTE em ' + arquivo + ':');
    mortos.forEach(t => console.error('  ' + t + ' nao e gerada por nenhum markup — a regra e valida e sem efeito'));
    console.error('  Regra morta que ESCONDE e a pior: a TV aumenta o conteudo e deixa a moldura,');
    console.error('  e quem ligou ve um zoom que apareceu sozinho, sem botao de sair.');
    return false;
  }
  console.log('OK modo TV — os ' + alvos.size + ' alvos do bloco body.tv existem no markup.');
  return true;
}
if (!checarModoTv()) process.exit(1);

/* == O CARD QUE ESCREVE O PLANO DO DIA TEM QUE ESTAR ALCANCAVEL (03/09/26) ==========
   public.planos_diarios nao recebeu UMA LINHA entre 28/08 e 03/09. Ela e a unica fonte de
   CLIENTE NOMEADO: sem ela, a Daily do gestor diz "sem cliente nomeado" para o time
   inteiro, todo dia, e nao ha nada que o executivo possa fazer a respeito. O Julyan
   descobriu pela Kelly, que disse ter prometido e nao aparecer na tela dele.

   A CAUSA eram duas linhas do template que se anulavam: o slot #planoDoDiaSlot so era
   emitido quando (souRep && subview !== "semana"), e havia um desvio com a MESMA condicao
   que chamava renderProspeccaoExecutivo() e retornava antes de chegar nele. O slot era
   inalcancavel para um executivo nos dois estados possiveis de subview.

   E NADA QUEBROU: montarPlanoDoDia() abre com getElementById do slot e volta calada se
   ele nao existir. checarSeletoresDeFiacao() nao pega este caso porque ela le
   querySelector, e aqui e getElementById.

   Esta guarda e ESTREITA de proposito. Ela nao tenta cobrir todo getElementById do
   arquivo — guarda o caminho de escrita do PLANO DO DIA, que e o dado mais caro de
   perder nesta ferramenta, porque ele nao volta: um dia sem plano registrado e um dia que
   o gestor nunca vai poder ler. Duas afirmacoes: o slot e emitido na funcao que o
   executivo realmente abre, e alguem monta o card dentro dele. */
/* A guarda NAO CRAVA MAIS O NOME DA ABA (reescrita em 03/09/26).

   A versao anterior exigia o slot dentro de renderProspeccaoExecutivo. Estava certa no dia
   em que nasceu, e virou obstaculo no dia em que o Julyan decidiu mover o plano para a
   Minha Daily: ela reprovaria a mudanca CORRETA pelo motivo errado — o endereco, e nao a
   alcancabilidade, que e o que ela existe para proteger.

   Agora ela pergunta o que importa e nao muda: (1) alguem emite o slot, (2) quem o emite
   tambem chama a montagem, e (3) essa funcao e uma que o executivo de fato abre. O item 3
   e o que pegou o defeito original: o slot vivia em renderAgenda, atras de um early-return
   com a condicao identica a do proprio `mostrarHoje`, entao ele nunca era emitido. Slot em
   funcao inalcancavel nao da erro nenhum — da planos_diarios sem receber UMA LINHA por
   seis dias, e a Daily do gestor dizendo "sem cliente nomeado" para o time inteiro.

   Se o plano mudar de casa outra vez, o que se edita e a lista ABAS_DO_EXECUTIVO. Isso e
   proposital: obriga quem move a afirmar, por escrito, que a aba de destino e alcancavel. */
function checarPlanoAlcancavel() {
  const arquivo = 'template/cockpit.template.html';
  const cru = fs.readFileSync(path.join(root, arquivo), 'utf8');
  /* As funcoes que montam tela que o executivo abre por um clique de aba. renderAgenda NAO
     esta aqui de proposito: foi exatamente onde o plano ficou inalcancavel. */
  const ABAS_DO_EXECUTIVO = ['renderDaily', 'renderProspeccaoExecutivo'];

  /* COMENTARIO NAO E TELA (03/09/26).

     Eu achei que procurar a forma emitida (id=" com aspas duplas) ja separasse codigo de
     comentario. Nao separa: o comentario que documenta o defeito ANTIGO citava a linha
     textualmente, a busca encontrou a citacao primeiro — duas mil linhas antes do slot de
     verdade — e a guarda reportou VERDE em cima do plano inalcancavel.

     Entao mascaro comentarios antes de procurar. Preservo o COMPRIMENTO (troco cada byte
     por espaco em vez de remover) para os indices continuarem valendo no texto original:
     assim eu mascaro para decidir ONDE olhar, e leio o original para saber o que ha la.

     A mascara e conservadora e imperfeita — nao entende que /* dentro de string nao abre
     comentario. Nao importa aqui: o unico uso e localizar a emissao do slot e a
     declaracao de funcao na coluna zero, e nenhum dos dois vive dentro de string. */
  const mascararComentarios = t => t
    .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length))
    .replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length))
    .replace(/(^|\n)([ \t]*)\/\/[^\n]*/g, (m, a, b) => a + b + ' '.repeat(m.length - a.length - b.length));
  const semCom = mascararComentarios(cru);

  const alvo = "id=\"planoDoDiaSlot\"";
  const iSlot = semCom.indexOf(alvo);
  if (iSlot < 0) {
    console.error('PLANO DO DIA: ninguem emite #planoDoDiaSlot - o card que escreve');
    console.error('  planos_diarios nao existe em tela nenhuma.');
    return false;
  }

  /* De quem e esse pedaco: a ultima declaracao de funcao na coluna zero antes do slot.

     REGEX LITERAL, NUNCA STRING. Esta guarda nasceu quebrada duas vezes pelo mesmo motivo, e
     eu repeti o erro AQUI, reescrevendo-a: montada como new RegExp por um heredoc, `\s`
     chegou como `s` e `\(` como `(`, e o resultado foi "Unterminated group". Da vez anterior
     nao deu erro nenhum — `[\s\S]` virou `[sS]`, a guarda passou a nao encontrar nada e
     reportou VERDE em cima de um defeito real. Literal falha na hora; string mente. */
  const reDecl = /\n(?:async )?function ([a-zA-Z0-9_$]+)\s*\(/g;
  let dono = null, iDono = -1, m;
  while ((m = reDecl.exec(semCom)) !== null) {
    if (m.index > iSlot) break;
    dono = m[1]; iDono = m.index;
  }
  const proxima = reDecl.exec(semCom);
  /* O corpo vem do texto MASCARADO, e nao do cru: senao uma chamada a montarPlanoDoDia()
     mencionada em comentario contaria como fiacao. Ela existe — o comentario que explica
     por que o slot ausente nao dava erro cita a funcao pelo nome. */
  const corpo = semCom.slice(iDono < 0 ? 0 : iDono, proxima ? proxima.index : semCom.length);

  const falhas = [];
  if (!dono) {
    falhas.push('nao consegui dizer qual funcao emite o slot - a guarda perdeu o alvo');
  } else if (ABAS_DO_EXECUTIVO.indexOf(dono) < 0) {
    falhas.push('o slot e emitido em ' + dono + '(), que nao e uma aba que o executivo abre');
  }
  if (corpo.indexOf('montarPlanoDoDia(') < 0) {
    falhas.push('ninguem chama montarPlanoDoDia() em ' + dono + '() - o slot fica uma div vazia');
  }
  if (falhas.length) {
    console.error('PLANO DO DIA INALCANCAVEL em ' + arquivo + ':');
    falhas.forEach(f => console.error('  ' + f));
    console.error('  Sem este caminho, planos_diarios para de receber linha e a Daily do gestor');
    console.error('  diz "sem cliente nomeado" para o time inteiro, sem ninguem poder corrigir.');
    return false;
  }
  console.log('OK plano do dia - o card que escreve planos_diarios esta na tela do executivo.');
  return true;
}
if (!checarPlanoAlcancavel()) process.exit(1);

/* == TODO PROXIMO PASSO SALVO APARECE NA AGENDA (03/09/26) ===========================
   Pedido do Julyan: "esse proximo passo, tem que ir pra agenda tbm". A tarefa datada vai
   pro HubSpot na hora, mas o DATA.agenda da tela e um SNAPSHOT da ultima carga do robo —
   entao quem salvava o passo ia olhar a Agenda, nao encontrava nada, e concluia (com
   razao) que o Cockpit nao gravou.

   O Cockpit salva proximo passo em CINCO lugares: desfecho de visita, ficha do negocio,
   passagem de etapa, remarcacao apos motivo, e o "datar tarefa" do painel de acao da
   Daily do gestor. Eu consertei UM na primeira passada e deixei quatro — inclusive o do
   gestor, que era justamente o que ele tinha pedido.

   Por isso a guarda, e nao a memoria: cada `tipoAcao: 'proximo-passo'` tem que ter uma
   chamada a espelharPassoNaAgenda por perto. A janela e generosa (40 linhas) porque o
   espelho vive no ramo de sucesso, que pode estar depois do tratamento de erro.

   O que esta guarda NAO faz: verificar que o espelho recebe os argumentos certos. Isso
   e o teste de tela — medido em 03/09 com o evento aparecendo as 09:00 como Follow-up e
   agendaContaComoCompromisso() devolvendo true. */
function checarEspelhoDoProximoPasso() {
  const arquivo = 'template/cockpit.template.html';
  const cru = fs.readFileSync(path.join(root, arquivo), 'utf8');
  const linhas = cru.split(/\r?\n/);
  /* JANELA MEDIDA, NAO CHUTADA. As distancias reais entre o fetch e o espelho nos cinco
     sites, em 03/09: 9, 5, 50, 32 e 4 linhas. A da ficha e 50 porque o ramo de sucesso
     dela passa pelo tratamento de erro e pelo espelho da qualificacao antes. 80 da folga
     para um ramo crescer sem a guarda virar falso positivo, e continua curto o bastante
     para nao alcancar o site seguinte (o menor intervalo entre sites e ~1.100 linhas). */
  const JANELA = 80;
  const orfaos = [];
  let sites = 0;
  linhas.forEach((linha, i) => {
    if (linha.indexOf("tipoAcao: 'proximo-passo'") < 0) return;
    sites++;
    const trecho = linhas.slice(Math.max(0, i - 6), i + JANELA).join("\n");
    if (trecho.indexOf('espelharPassoNaAgenda') < 0) {
      orfaos.push((i + 1) + ": " + linha.trim().slice(0, 78));
    }
  });
  if (!sites) {
    console.error('PROXIMO PASSO: nenhum site de tipoAcao proximo-passo encontrado - a guarda perdeu o alvo.');
    return false;
  }
  if (cru.indexOf('function espelharPassoNaAgenda') < 0) {
    console.error('PROXIMO PASSO: espelharPassoNaAgenda() nao existe mais.');
    return false;
  }
  if (orfaos.length) {
    console.error('PROXIMO PASSO SEM ESPELHO NA AGENDA em ' + arquivo + ':');
    orfaos.forEach(o => console.error('  linha ' + o));
    console.error('  A tarefa vai pro HubSpot e a Agenda da tela e um snapshot: sem o espelho,');
    console.error('  quem salva o passo vai olhar a Agenda, nao encontra nada, e conclui que');
    console.error('  o Cockpit nao gravou. Chame espelharPassoNaAgenda no ramo de sucesso.');
    return false;
  }
  console.log('OK proximo passo - os ' + sites + ' sites que salvam passo espelham na agenda.');
  return true;
}
if (!checarEspelhoDoProximoPasso()) process.exit(1);

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

/* == 12. O ATO DO PLANO ESTA NA MONTAGEM QUE RODA (03/09/26) =========================
   Irma da guarda 10, e nascida do mesmo defeito visto de outro angulo.

   A guarda 10 cuida do CARD do Planejamento. Esta cuida do ATO: #compromissoDoDia, o
   unico lugar que grava planos_diarios (status plano_fechado, prioridades, contas_alvo)
   E os quatro dailies.prometido_* como soma derivada dos clientes marcados.

   O QUE ACONTECEU: buildCompromissoDoDiaHTML so era chamado por
   buildBriefingExecutivoHTML — o TERCEIRO fallback da Daily (v5 -> v4 -> briefing). A v5
   funciona, entao o briefing nunca renderiza. Nenhum erro, nenhum log: a Minha Daily
   simplesmente nao tinha o ato. planos_diarios ficou sem UMA LINHA desde 28/08, a Daily
   do gestor passou a dizer sem cliente nomeado para os sete todos os dias, e a Kelly
   avisou que prometeu e nao apareceu — ela estava certa e a tela a desmentia.

   POR QUE ELA NAO CRAVA O NOME DA v5: ela LE a cadeia de fallback. Descobre em renderDaily
   qual funcao e chamada primeiro (o `try { return X(r); }`) e exige o bloco NAQUELA. Numa
   v6 amanha, a guarda passa a exigir na v6 sozinha — e reprova se o ato ficar so na v5,
   que e exatamente o erro de hoje repetido um degrau acima.

   Cravar o nome seria refazer o defeito: quem substitui a montagem principal leva embora,
   calado, o que so a antiga emitia. Fallback que nunca roda e codigo morto, e aqui o
   codigo morto era o unico caminho do ritual das 8h30. */
function checarAtoDoPlanoNaDaily() {
  const arquivo = 'template/cockpit.template.html';
  const cru = fs.readFileSync(path.join(root, arquivo), 'utf8');

  /* Quem e a montagem PRIMARIA da Daily: a primeira do try dentro de renderDaily. */
  const iRD = cru.indexOf('async function renderDaily()');
  if (iRD < 0) {
    console.error('ATO DO PLANO: renderDaily nao existe mais - a guarda perdeu o alvo.');
    return false;
  }
  const mPrim = /try \{ return ([a-zA-Z0-9_$]+)\(r\); \}/.exec(cru.slice(iRD));
  if (!mPrim) {
    console.error('ATO DO PLANO: nao achei a cadeia de fallback da Daily em renderDaily.');
    console.error('  A guarda le `try { return X(r); }` para descobrir a montagem primaria.');
    return false;
  }
  const primaria = mPrim[1];

  /* O corpo dessa funcao: da declaracao dela ate a proxima na coluna zero. */
  const iF = cru.indexOf('function ' + primaria + '(');
  if (iF < 0) {
    console.error('ATO DO PLANO: ' + primaria + '() e chamada mas nao esta declarada.');
    return false;
  }
  const depois = cru.slice(iF + 8);
  const fim = depois.search(/\n(?:async )?function /);
  const corpo = fim > 0 ? depois.slice(0, fim) : depois;

  if (corpo.indexOf('buildCompromissoDoDiaHTML(') < 0) {
    console.error('ATO DO PLANO AUSENTE em ' + arquivo + ':');
    console.error('  ' + primaria + '() e a montagem que a Daily usa de verdade, e ela nao');
    console.error('  emite #compromissoDoDia. O executivo abre a Minha Daily e nao tem como');
    console.error('  fechar o plano: nem os nomes em planos_diarios, nem a soma em');
    console.error('  dailies.prometido_*. Nao da erro nenhum - so seca as duas tabelas.');
    console.error('  Emitir apenas num fallback NAO conta: eles so rodam se esta falhar.');
    return false;
  }
  console.log('OK ato do plano - ' + primaria + '() emite o bloco que fecha o plano do dia.');
  return true;
}
if (!checarAtoDoPlanoNaDaily()) process.exit(1);

/* == 13. A HORA DA TRAVA E O TEXTO NAO PODEM DIVERGIR (03/09/26) =====================
   O Julyan mudou a trava da promessa de 9h30 para 13h. A regra vive em UMA constante,
   PROMESSA_TRAVA_MINUTOS, mas a hora aparece escrita em 32 textos de TELA — e esses
   textos sao o contrato que o executivo le: "trave até as 13h", "a promessa fechou às 13h
   e não se mexe mais hoje".

   Mudar a constante e esquecer os textos nao quebra nada e nao aparece em teste: a trava
   funciona no horario novo e a tela promete o antigo. O executivo perde a janela
   confiando no que leu, e o gestor cobra dele um prazo que a tela nunca disse. Custo alto,
   defeito invisivel — o par exato que pede guarda.

   POR QUE LITERAL E NAO INTERPOLACAO: os 32 vivem em contextos de aspas diferentes
   (template literal, aspas simples, atributo). Reescrever os 32 a mao num arquivo de 45
   mil linhas era o risco maior. Mesmo arranjo do ESCALA_BREAKPOINTS, pelo mesmo motivo:
   quando o valor nao pode ser um token, a checagem e o que o mantem verdadeiro.

   COMENTARIO NAO CONTA. Os comentarios deste arquivo contam a HISTORIA da mudanca, e a
   historia diz 9h30 com razao. Mascarar comentario aqui nao e conveniencia: e a licao que
   a guarda 10 me ensinou hoje, quando validou uma citacao dentro de um comentario e
   reportou verde em cima do defeito que existia para pegar. */
function checarHoraDaTrava() {
  const arquivo = 'template/cockpit.template.html';
  const cru = fs.readFileSync(path.join(root, arquivo), 'utf8');

  const mDef = /const PROMESSA_TRAVA_MINUTOS = (\d+) \* 60(?:\s*\+\s*(\d+))?;/.exec(cru);
  if (!mDef) {
    console.error('HORA DA TRAVA: nao achei PROMESSA_TRAVA_MINUTOS - a guarda perdeu o alvo.');
    return false;
  }
  const h = Number(mDef[1]);
  const m = Number(mDef[2] || 0);
  const esperado = m === 0 ? h + 'h' : h + 'h' + String(m).padStart(2, '0');

  /* So texto de tela: comentario /* *\/ e <!-- --> saem. */
  const semCom = cru
    .replace(/\/\*[\s\S]*?\*\//g, x => x.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, x => x.replace(/[^\n]/g, ' '));

  /* Uma hora "de trava" e uma hora que aparece a <=48 caracteres de uma palavra do ritual.
     O raio evita acusar horario que nao e este — a cadencia (08:30, 10:30...), o fecho das
     19h, um "13h" de agenda. Sem esse recorte a guarda viraria ruido e alguem a desligaria. */
  /* "trava" SOZINHO nao entra, e isso me custou um falso positivo na primeira execucao:
     `Math.min(9 * 60 + ordemHoje * 45, 17 * 60); // trava em 17h` e um teto de agendamento,
     outra regra, legitimamente 17h. Guarda que acusa o que nao e defeito e guarda que alguem
     desliga — e a partir do dia em que e desligada ela protege zero.

     As formas que ficaram sao as que so o ritual usa: `promessa` (que cobre "promessa das
     13h ainda aberta", sem verbo de trava) mais as conjugacoes aplicadas a ela. */
  const GATILHOS = /(promessa|travad|travou|trave |fecha às|fechou às|fecha as|fechou as)/i;
  const erradas = new Map();
  const linhas = semCom.split('\n');
  linhas.forEach((linha, i) => {
    const reHora = /\b(\d{1,2})h(\d{2})?\b/g;
    let mh;
    while ((mh = reHora.exec(linha)) !== null) {
      const texto = mh[0];
      if (texto === esperado) continue;
      const ini = Math.max(0, mh.index - 48);
      const volta = linha.slice(ini, mh.index + texto.length + 48);
      if (!GATILHOS.test(volta)) continue;
      /* O fecho do dia (19h) e outra regra, e legitimamente diferente da trava. */
      if (texto === '19h') continue;
      erradas.set((i + 1) + ': ' + texto, linha.trim().slice(0, 92));
    }
  });

  if (erradas.size) {
    console.error('HORA DA TRAVA DIVERGENTE em ' + arquivo + ' (a constante diz ' + esperado + '):');
    erradas.forEach((linha, onde) => console.error('  linha ' + onde + '  ' + linha));
    console.error('  A trava funcionaria em ' + esperado + ' e a tela prometeria outra hora.');
    console.error('  Isso nao quebra nada e nao aparece em teste: o executivo perde a janela');
    console.error('  confiando no que leu, e o gestor cobra dele um prazo que a tela nao disse.');
    return false;
  }
  console.log('OK hora da trava - a constante diz ' + esperado + ' e nenhum texto de tela discorda.');
  return true;
}
if (!checarHoraDaTrava()) process.exit(1);
