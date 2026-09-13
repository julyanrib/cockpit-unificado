// scripts/testar-css-morto.js
//
// O PISO É ZERO — e é zero de propósito, sem lista de dívida.
// ---------------------------------------------------------------------------------------
// Em 13/09/26 saíram 415 regras cujos seletores TODOS estavam mortos (55 KB brutos). Uma
// suíte que aceitasse "no máximo N" só adiaria o problema: whitelist que não encolhe é
// guarda morta, e esta casa já tem duas guardas dizendo isso (a 7 e a 21). Então o número
// é zero, e regra morta nova reprova na hora — quando quem a escreveu ainda lembra por quê.
//
// O CRITÉRIO DE "MORTA" É ESTREITO, e a estreiteza é a segurança (ver scripts/css-morto.js):
// só conta a regra cujos seletores são feitos SÓ de classe, e cuja classe não é citada em
// lugar nenhum do template fora do estilo, nem em data/, lib/ ou api/. Qualquer dúvida
// devolve "vive".
//
// SE ESTA SUÍTE REPROVAR e a regra for de uma tela que você está construindo: escreva o
// markup antes do CSS, ou cite a classe no código. Não existe lista para pendurá-la.
//
// O QUE ELA NÃO MEDE, dito para não virar promessa: regra dentro de @media, seletor de
// elemento/id/atributo, e propriedade morta dentro de regra viva. Mexer perto de
// fechamento de @media foi o que quebrou a produção em 12/09 — fica para quando houver um
// jeito de provar cada corte, e não por palpite.

const path = require('path');
const { analisar } = require(path.join(__dirname, 'css-morto.js'));

let falhas = 0;
function checar(nome, cond, detalhe) {
  if (cond) { console.log('  ok  ' + nome); return; }
  falhas++;
  console.log('  FALHA  ' + nome + (detalhe ? '  — ' + detalhe : ''));
}

const a = analisar();

checar('nenhuma regra de topo com TODOS os seletores mortos',
  a.mortas.length === 0,
  a.mortas.length + ' regra(s): ' + a.mortas.slice(0, 6).map(m => m.sels.join(', ')).join(' | '));

/* A ESTRUTURA DA FOLHA, medida pelo mesmo tokenizador que faz o corte. Estes dois números
   são os que ficaram errados em 12/09 e ninguém viu: comentário aberto e fechamento órfão.
   O `2` não é meta, é o que existe hoje — e a guarda 31 do build mede o mesmo saldo. */
const comentarios = a.nos.filter(x => x.tipo === 'comentario').length;
checar('todo comentário do estilo fecha',
  (a.css.split('/*').length - 1) === (a.css.split('*/').length - 1),
  'comentário aberto faz o navegador engolir tudo o que vem depois, sem uma linha no console');

checar('nenhum fechamento órfão novo',
  a.orfaos === 2,
  a.orfaos + ' fechamento(s) órfão(s) — eram 2, e cada um a mais é uma regra que virou filha de outra');

console.log('');
console.log('  (' + a.regras.length + ' regras de topo, ' + comentarios + ' comentários, '
  + a.geradas.size + ' nomes citados fora do estilo)');
console.log('');
if (falhas) {
  console.error(falhas + ' falha(s) — CSS descrevendo tela que não existe.');
  process.exit(1);
}
console.log('css morto: nenhuma regra de topo sem markup, e a folha fecha o que abre.');
