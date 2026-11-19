// scripts/testar-reparar-pinos.js — as regras do reparador de pinos (scripts/reparar-pinos.js).
// Uso: node scripts/testar-reparar-pinos.js
const { decidir, nivelPhoton, nivelNominatim, numeroLimpo } = require('./reparar-pinos.js');

let ok = 0; const falhas = [];
function conferir(nome, cond, porque) { if (cond) ok++; else falhas.push(nome + ' — ' + porque); }

const centroRio = [-22.9129, -43.2003];
const porta = { lat: -22.9035, lon: -43.1780, nivel: 'porta' };
const rua = { lat: -22.9035, lon: -43.1780, nivel: 'rua' };

conferir('acertou a porta: move e vira preciso', decidir(...centroRio, 64, porta, null) === 'porta', 'porta é o único caso que afirma precisão');
conferir('acertou a rua com o pino empilhado no centro: move, segue aproximado', decidir(...centroRio, 64, rua, null) === 'rua', 'rua certa é melhor que a praça da cidade');
conferir('acertou a rua e o pino já é único: não mexe', decidir(...centroRio, 1, rua, null) === 'fica', 'pino já espalhado pode estar melhor que a rua');
conferir('acertou a rua com pilha de 2: não mexe', decidir(...centroRio, 2, rua, null) === 'fica', 'pilha de 2 pode ser vizinho de verdade; o centro da cidade é 3+');
conferir('resultado a mais de 60 km: não mexe', decidir(...centroRio, 64, { lat: -23.55, lon: -46.63, nivel: 'porta' }, null) === 'longe', 'cidade homônima ou erro do provedor');
conferir('impreciso (bairro/cidade): não mexe', decidir(...centroRio, 64, { lat: -22.91, lon: -43.2, nivel: 'impreciso' }, null) === 'nada', 'bairro não é reparo');
conferir('nada achado e provedor respondeu: nada', decidir(...centroRio, 64, null, null) === 'nada', 'endereço que não existe no mapa');
conferir('nada achado e provedor caiu: falha (segue na fila)', decidir(...centroRio, 64, null, 403) === 'falha', 'o bloqueio não pode virar "não achei" — foi o defeito de 27/10 a 19/11');

conferir('Photon com número da casa é porta', nivelPhoton({ housenumber: '120', type: 'house' }) === 'porta', 'housenumber');
conferir('Photon rua é rua', nivelPhoton({ type: 'street', osm_key: 'highway' }) === 'rua', 'street');
conferir('Photon cidade é impreciso', nivelPhoton({ type: 'city', osm_key: 'place' }) === 'impreciso', 'city');
conferir('Nominatim com house_number é porta', nivelNominatim({ addresstype: 'road', class: 'highway', address: { house_number: '10' } }) === 'porta', 'house_number');
conferir('Nominatim bairro é impreciso', nivelNominatim({ addresstype: 'suburb', class: 'place' }) === 'impreciso', 'suburb');

conferir('S/N vira sem número', numeroLimpo('S/N') === null && numeroLimpo('s/nº') === null, 's/n');
conferir('zeros à esquerda saem', numeroLimpo('00264') === '264', '00264');
conferir('só zeros vira sem número', numeroLimpo('00') === null, '00');

if (falhas.length) { console.log('reparar pinos: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length)); falhas.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
console.log('reparar pinos: ' + ok + ' verificações ok');
