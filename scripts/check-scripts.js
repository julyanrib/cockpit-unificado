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
