/* ============================================================================
   A ROLAGEM DE DENTRO SOBREVIVE À REPINTURA (06/10/26)

   Medido na produção, como executivo: a fila da Hoje rola por dentro (48 itens), e a
   repintura depois de um Feito ou de um sinal ao vivo devolvia a fila ao 1º item. O vigia
   (ROLA) devolve a posição. Esta suíte trava as três travas que o impedem de brigar com a
   mão de quem rola — sem elas, ele puxaria a lista de volta enquanto a pessoa rola.
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };

const ini = tpl.indexOf('const ROLA = { pos: {}, voo: false };');
const fim = tpl.indexOf('async function redesenharPreservandoRolagem(', ini);
const bloco = ini > -1 && fim > ini ? tpl.slice(ini, fim) : '';
checar('o vigia existe, uma vez', ini > -1 && tpl.indexOf('const ROLA = {', ini + 1) < 0 && bloco.length > 500);

checar('anota a rolagem de QUALQUER caixa (escuta na captura)',
  /document\.addEventListener\('scroll', function \(ev\) \{[\s\S]*?\}, true\);/.test(bloco),
  'scroll não borbulha: sem a captura, só a rolagem da página seria vista');
checar('trava 1: a caixa viva nunca é mexida',
  /if \(p\.el && p\.el\.isConnected\) return;/.test(bloco),
  'sem isto, o vigia puxaria de volta a lista que a pessoa está rolando');
checar('trava 2: só caixa nova que nasceu no topo',
  /if \(!novo \|\| novo\.scrollTop \|\| novo\.scrollLeft\) return;/.test(bloco));
checar('trava 3: só até 3 s depois da troca',
  /if \(agora - p\.saiu > 3000\) \{ delete ROLA\.pos\[k\]; return; \}/.test(bloco),
  'voltar a uma tela minutos depois começa no topo; devolver posição velha confunde');
checar('devolve com setTimeout, não com requestAnimationFrame',
  /setTimeout\(rolaDevolver, 0\)/.test(bloco) && bloco.indexOf('requestAnimationFrame(rolaDevolver') < 0,
  'rAF não roda em aba escondida — medido: a fila não voltava no preview');
checar('observa o documento inteiro (dossiê e modais vivem fora do appRoot)',
  /\.observe\(document\.body, \{ childList: true, subtree: true \}\)/.test(bloco));

if (falhas.length) {
  console.log('FALHOU: ' + falhas.length);
  falhas.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('rolagem: ' + ok + ' verificações · tudo certo.');
