/* ============================================================================
   A HORA LIVRE, IGUAL NO PLANEJAMENTO E NO PRÓXIMO PASSO (06/10/26)

   Julyan: "isso tem que se conversar ... e pode colocar um horário livre, onde o executivo
   pode digitar e selecionar facilmente". Uma regra de leitura (horaLivre) e o mesmo jeito
   de escolher nas duas telas: botões de hora e minuto + "ou digite".
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };
function recortar(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let n = 0, j = tpl.indexOf('{', i);
  for (; j < tpl.length; j++) { if (tpl[j] === '{') n++; else if (tpl[j] === '}') { n--; if (!n) break; } }
  return tpl.slice(i, j + 1);
}

const fonte = recortar('horaLivre');
checar('a regra de leitura existe uma vez', fonte.length > 100 && tpl.indexOf('function horaLivre(', tpl.indexOf('function horaLivre(') + 1) < 0);
const horaLivre = new Function(fonte + '; return horaLivre;')();
const casos = {
  '9': '09:00', '9h': '09:00', '9:40': '09:40', '9h40': '09:40', '940': '09:40', '0940': '09:40',
  '1430': '14:30', '14.30': '14:30', '14h': '14:00', ' 7:05 ': '07:05', '20h10': '20:10', '19:45': '19:45'
};
Object.keys(casos).forEach(function (c) {
  checar('"' + c + '" vira ' + casos[c], horaLivre(c) === casos[c], 'veio ' + horaLivre(c));
});
['25', '9:61', 'abc', '', '12345', '24:00'].forEach(function (c) {
  checar('"' + c + '" é recusado', horaLivre(c) === null, 'hora inventada num compromisso com cliente é pior que hora nenhuma');
});

/* o Planejamento: campo no relógio, verbo próprio, aplica no Enter/saída (não a cada tecla) */
const relogio = recortar('pfRelogioHTML');
checar('o relógio do Planejamento tem o campo "ou digite"', /data-relogio-livre="' \+ attr \+ '"/.test(relogio));
checar('o Planejamento entende a hora digitada',
  /if \(verbo === 'horalivre'\) \{\s*const hm = horaLivre\(arg\);/.test(tpl));
checar('aplica ao sair do campo, não a cada tecla',
  /document\.addEventListener\('change', function \(ev\) \{\s*const el = ev\.target && ev\.target\.closest \? ev\.target\.closest\('\[data-relogio-livre\]'\)/.test(tpl),
  'a tela repinta ao escolher; a cada tecla o campo perderia o foco');

/* a ficha: UM campo de hora ("precisa de tanto relógio assim?", Julyan) — digita ou escolhe
   da lista que abre no campo; os atalhos de DIA ficam, porque são data, não relógio */
checar('a ficha tem os atalhos de dia', tpl.indexOf('${fpAtalhosHTML()}') > -1 && /data-fp-dia=/.test(recortar('fpAtalhosHTML')));
checar('e um campo de hora só, com a lista para escolher',
  tpl.indexOf('class="ficha-passo-hora" list="fpHorasLista"') > -1
    /* a lista é UMA na página, criada uma vez; o Meu funil aponta para a mesma */
    && /dl\.id = 'fpHorasLista';/.test(tpl)
    && tpl.indexOf('list="fpHorasLista" inputmode="numeric" autocomplete="off" placeholder="hora" class="fn3-passo-in fn3-passo-hora"') > -1
    && tpl.indexOf('data-fp-h=') < 0 && tpl.indexOf('class="fp-livre"') < 0,
  'três jeitos de escolher a mesma hora foi o que ele reprovou');
checar('a hora digitada na ficha passa pela mesma regra, no campo e no salvar',
  /const v = horaLivre\(t\.value\);/.test(recortar('fpLigar'))
    && /const horaCrua = \(typeof horaLivre === 'function' && horaLivre\(horaDigitada\)\) \|\| horaDigitada;/.test(tpl));
checar('e os campos de data e hora continuam (quem usa não perde nada)',
  tpl.indexOf('class="ficha-passo-data"') > -1 && tpl.indexOf('class="ficha-passo-hora"') > -1);
checar('os atalhos estão ligados ao salvar da ficha', /if \(typeof fpLigar === 'function'\) fpLigar\(container\);/.test(tpl));

if (falhas.length) {
  console.log('FALHOU: ' + falhas.length);
  falhas.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('hora livre: ' + ok + ' verificações · tudo certo.');
