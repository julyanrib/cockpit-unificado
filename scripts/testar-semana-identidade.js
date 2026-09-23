#!/usr/bin/env node
/* ============================================================================
   A SEMANA DO GESTOR FALA A LÍNGUA DA CASA (23/09/26)

   Julyan: "a aba semana do gestor está desalinhada, acredito que voce consiga deixar mais
   bonita essa tela respeitando nossa identidade visual".

   MEDIDO NO NAVEGADOR antes de mexer, e não era opinião:
     · 172 elementos em DM Sans e 28 em Poppins, num produto que é Archivo + Manrope;
     · 267 hexadecimais no markup renderizado e ZERO var(--), com o mundo creme da prancha
       (#A2937A, #1A1613, #FDFBF0, #6E6558, #3D362E, #E4DBC6) no topo da lista;
     · e o hero escuro com o título em x=32 enquanto TODOS os cartões abaixo começam em
       x=94 — um degrau de 62px, que é o que se lê como "desalinhada".

   É a mesma correção que a Pessoas v6 recebeu em 20/09, quando ele disse "tudo tem que
   seguir a identidade visual do cockpit, o mockup é a ideia". Esta aba tinha ficado para
   trás, e o de-para de tons é o MESMO daquele dia — conferido contra o :root então, não
   re-derivado agora.

   Uso: node scripts/testar-semana-identidade.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) {
  if (cond) { ok += 1; return; }
  falhas.push(nome + (porque ? '\n      ' + porque : ''));
}

/* ══ O RECORTE ══════════════════════════════════════════════════════════════════════
   Só o bloco da Semana. Medir o arquivo inteiro acusaria as outras abas, que têm a
   própria história — e a âncora é checada ANTES de tudo, senão um rename deixa as
   checagens medindo o vazio e verdes para sempre. */
const INI = 'const SM9 = {';
const FIM = 'async function sm9Iniciar(';
const iIni = tpl.indexOf(INI);
const iFim = tpl.indexOf(FIM, iIni);
checar('o bloco da Semana foi encontrado', iIni > -1 && iFim > iIni,
  'sem o recorte, todas as checagens abaixo passam medindo nada');
const bloco = (iIni > -1 && iFim > iIni) ? tpl.slice(iIni, iFim) : '';
checar('e ele tem o tamanho de uma aba inteira', bloco.length > 100000,
  'recorte curto demais é âncora perdida disfarçada de verde · veio ' + bloco.length);

/* ══ 1. A FONTE ═════════════════════════════════════════════════════════════════════ */
checar('a raiz da aba usa a fonte da casa',
  /#sm9Raiz\{font-family:var\(--font-body\);/.test(tpl),
  'esta regra punha DM Sans na aba inteira — trocar de tipografia ao mudar de aba faz a '
    + 'tela parecer outro produto');
checar('nenhuma família da prancha sobrou no bloco',
  !/Poppins/.test(bloco) && !/DM Sans/.test(bloco),
  'Archivo e Manrope são as famílias da casa, e as duas já estão carregadas no <head>');

/* ══ 2. A PALETA ════════════════════════════════════════════════════════════════════
   O mundo creme da prancha não pode voltar. Os tons da CASA escritos por extenso
   (#2B3440, #7A8494, #E51A31...) continuam válidos: são a mesma cor que o token, e
   trocá-los seria mexer sem mudar pixel. */
const CREME = ['#EFE9DC', '#FDFBF0', '#E4DBC6', '#1A1613', '#3D362E', '#3E382F', '#A2937A',
  '#6E6558', '#5C554A', '#4A443B', '#8A8072', '#F4F1EA', '#FBF6EC', '#B0782A', '#1E7A63',
  '#57C29A', '#E7F3EE', '#FBEEF0', '#D9CDB2', '#C9BFA8', '#E3DDD0', '#F7F0E0'];
const sobraram = CREME.filter(function (c) {
  return new RegExp(c, 'i').test(bloco);
});
checar('nenhum tom do mundo creme sobrou na Semana', sobraram.length === 0,
  'estes vieram da prancha e têm token na casa: ' + sobraram.join(', '));

checar('e o bloco passou a usar os tokens',
  (bloco.match(/var\(--/g) || []).length > 100,
  'sem token a aba não acompanha a casa quando a casa muda — foi o que separou o que veio '
    + 'junto do #E9E5DC global do que ficou para trás · veio '
    + (bloco.match(/var\(--/g) || []).length);

/* ══ 3. O ALINHAMENTO DO HERO ═══════════════════════════════════════════════════════
   A faixa escura sangra até a borda (margem negativa) e devolve a goteira pela ESQUERDA,
   que é onde estava o degrau. À direita ela continua sangrando: é lá que o botão de
   compartilhar mora, e era assim que já estava certo. */
checar('o hero devolve a goteira da esquerda',
  /\.sm5-placar\{margin-left:-62px;margin-right:-62px;padding-left:62px;\}/.test(tpl),
  'sem isto o título do hero começa 62px à esquerda de todo o resto da página');

checar('e a fileira do hero continua sem quebrar',
  /display:flex;align-items:flex-start;gap:28px;min-width:max-content;/.test(tpl),
  'o comentário logo acima desta linha registra que flex-wrap já foi TENTADO e recusado: '
    + 'ele jogava o MRR para a segunda linha e desmanchava a faixa da prancha. Eu refiz '
    + 'esse erro hoje por não ler o comentário antes de mexer');

console.log('');
console.log('semana · identidade: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
