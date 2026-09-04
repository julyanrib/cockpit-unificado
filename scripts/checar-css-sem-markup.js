// scripts/checar-css-sem-markup.js
//
// GUARDA 21 — REGRA DE CSS PARA CLASSE QUE NENHUM MARKUP GERA.
// ---------------------------------------------------------------------------------------
// O CASO QUE A PRODUZIU (04/09/26): a prancha 6c mudou o agendar do Planejamento para
// dentro da ficha do lead, e o painel empilhado do card saiu. Com ele saíram os gestos e o
// estado — mas ficaram 40 linhas de CSS descrevendo `.pl6-card-cta`, `.pl6-sel*` e
// `.pl6-end*`: uma tela que não existe mais.
//
// POR QUE ISSO NÃO É SÓ FEIURA, e por que ganhou guarda:
//
//   · CSS órfão MENTE sobre o desenho. Quem abrir este arquivo para mexer na munição lê
//     `.pl6-card-cta.is-fraco` com o comentário "a saída de emergência não disputa com o
//     caminho bom" e conclui que o card ainda tem dois botões. Comentário bom sobre código
//     morto é pior que código morto sem comentário.
//   · e ele ESCONDE perda de qualidade real. A lista de `min-height:44px` do bloco
//     `@media (max-width:760px)` — o piso de dedo, para quem usa isto na rua — continuava
//     listando os quatro botões mortos e não listava nenhum botão da ficha nova. A tela
//     nova nasceu com alvos de 30px no celular, e a lista parecia preenchida.
//
// A IRMÃ DELA MEDE A DIREÇÃO OPOSTA: `checarSeletoresDeFiacao` (guarda 7) pega classe usada
// em querySelector e nunca gerada — fiação que não alcança nada. Esta pega regra de estilo
// sem markup. São os dois lados do mesmo desalinho, e nenhuma das duas cobre o outro lado.
//
// COMO ELA DECIDE QUE UMA CLASSE É GERADA: exatamente como a guarda 7, porque o arquivo
// gera classe de quatro formas e ignorar uma delas é falso positivo em série —
// `class="..."` (inclusive concatenado, `class="a' + (x ? '' : ' b')`), `classList.add`,
// `classList.toggle` e `className = '...'`.
//
// O QUE ELA NÃO COBRE, dito para não virar promessa: seletor de elemento, de atributo e
// pseudo-elemento. Só classe. E ela olha só os prefixos declarados abaixo — o arquivo tem
// anos de telas e varrer tudo de uma vez transformaria a guarda numa lista de dívida que
// ninguém lê. Prefixo novo entra quando a tela dele nascer.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const cru = fs.readFileSync(T, 'utf8');

// AS FAMILIAS VIGIADAS: as telas vivas, cujo desenho ainda muda. É onde CSS órfão nasce.
const PREFIXOS = ['pl6-', 'fn2-', 'fn3-', 'd7-', 'hist-'];

/* DÍVIDA CONHECIDA — lista fechada, e tem que ficar EXATA: item novo reprova, e item que
   saiu da lista sem sair do arquivo também reprova. Whitelist que só cresce é guarda morta
   (é a mesma regra da guarda 7, e por isso o mesmo formato). */
const DIVIDA = {
  /* ACHADAS PELA PRIMEIRA EXECUCAO desta guarda, em 04/09/26 — e nenhuma delas eu conhecia.
     As duas sao do Meu funil, que e a proxima aba na fila do Julyan; entram aqui nomeando
     quem as resolve em vez de eu meio-consertar uma tela que vai ser refeita em seguida.

     `.fn3-cta` e o caso mais caro dos dois, e pelo mesmo motivo que produziu esta guarda:
     ela aparece na lista de `min-height:44px` do bloco de celular. Ou seja, o piso de dedo
     do Meu funil pode estar na mesma situacao em que o do Planejamento estava — lista cheia
     de botao que nao existe. Isso se mede quando a aba for revista, nao por palpite. */
  'fn3-cta': 'Meu funil — CTA do card antigo; ainda citada no piso de 44px do celular',
  'fn3-card-valor': 'Meu funil — o chip de MRR nasceu com outro nome de classe (fn3-chip-*)'
};

/* As classes que o arquivo REALMENTE gera. Mesmo levantamento da guarda 7 — as quatro
   formas. O split largo em class="..." existe porque o markup é montado por concatenação:
   `class="pl6-regiao' + (rotaNome ? '' : ' pl6-regiao-vazia')` tem que render as duas. */
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

/* Só o CSS: o <style> do arquivo. Procurar classe no documento inteiro faria o nome citado
   dentro de um comentário de JS contar como regra — e é exatamente o falso positivo que
   derrubou a primeira versão da guarda 10 e a primeira do "hoje da agenda". */
const estilos = [];
const reStyle = /<style[^>]*>([\s\S]*?)<\/style>/g;
while ((m = reStyle.exec(cru))) estilos.push(m[1]);
if (!estilos.length) {
  console.error('NAO ACHEI NENHUM BLOCO <style> no template — esta guarda parou de medir o');
  console.error('  que devia, e dar OK aqui seria pior que reprovar.');
  process.exit(1);
}
/* comentários de CSS fora: eles citam nomes de classe ao explicar o desenho */
const css = estilos.join('\n').replace(/\/\*[\s\S]*?\*\//g, x => x.replace(/[^\n]/g, ' '));

const achadas = new Map();
/* a classe só conta quando o ponto ABRE um seletor — sem a borda, `a[href*=".com"]` e
   `font:800 8.5px` viram classes. Mesma borda da guarda 7. */
const reCls = /(?:^|[\s,>+~([])\.([A-Za-z][\w-]*)/g;
let c;
while ((c = reCls.exec(css))) {
  const nome = c[1];
  if (!PREFIXOS.some(p => nome.indexOf(p) === 0)) continue;
  if (geradas.has(nome)) continue;
  if (!achadas.has(nome)) {
    const linha = css.slice(0, c.index).split('\n').length;
    achadas.set(nome, linha);
  }
}

const novas = [...achadas.keys()].filter(n => !DIVIDA[n]);
const resolvidas = Object.keys(DIVIDA).filter(n => !achadas.has(n));

if (novas.length) {
  console.error('CSS PARA CLASSE QUE NENHUM MARKUP GERA:');
  novas.sort().forEach(n => console.error('  .' + n + '  (regra por volta da linha '
    + achadas.get(n) + ' do <style>)'));
  console.error('');
  console.error('  Regra de estilo sem markup descreve uma tela que nao existe: quem for mexer');
  console.error('  nela acredita no que le. E foi assim que a lista de min-height:44px do');
  console.error('  celular ficou cheia de botao morto e vazia dos botoes da tela nova.');
  console.error('  Se a classe e gerada de uma forma que esta guarda nao ve, a forma entra no');
  console.error('  levantamento — nao na dívida.');
  process.exit(1);
}
if (resolvidas.length) {
  console.error('DIVIDA DE CSS QUE JA FOI PAGA E CONTINUA NA LISTA:');
  resolvidas.forEach(n => console.error('  .' + n + ' — tire da lista DIVIDA desta guarda'));
  console.error('  Whitelist que nao encolhe deixa de medir o que sobrou.');
  process.exit(1);
}

const vigiadas = [...new Set((css.match(reCls) || [])
  .map(x => x.replace(/^[\s,>+~([]*\./, ''))
  .filter(n => PREFIXOS.some(p => n.indexOf(p) === 0)))].length;
console.log('OK css sem markup - as ' + vigiadas + ' classes das ' + PREFIXOS.length
  + ' familias vigiadas sao geradas por algum markup.');
