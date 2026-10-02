// scripts/testar-gaveta-fora-do-time.js
//
// A VISÃO DE EXECUTIVO DE QUEM ESTÁ FORA DO TIME (02/10/26): o funil do Julyan vem numa
// gaveta à parte (funilForaDoTime). Só a visão dele a recebe, costurada em funilLeads;
// o gestor e os outros executivos nunca. Sabotada na criação: sem o corte no recorte do
// executivo, a gaveta inteira descia para todo mundo.

const path = require('path');
const m = require(path.join(__dirname, 'montar-dados.js'));
const fs = require('fs');
const hub = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hubspot.json'), 'utf8'));
const narr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'narrativas.json'), 'utf8'));
hub.funilForaDoTime = { '339921752': { '1395880469': [{ id: 'G1', name: 'Escritório da Takeat', ownerId: '339921752', dias: 3 }], '1396005401': [{ id: 'G2', name: 'Bar Teste', ownerId: '339921752', dias: 1 }] } };
narr.reps['339921752'] = { name: 'Julyan Ribeiro', praca: '—' };
m.usarSnapshot({ hubspot: hub, narrativas: narr });
const c = m.montarDadosCompletos();
const gestor = m.filtrarParaPapel(c, { role: 'manager', ownerId: '339921752' });
const julyanExec = m.filtrarParaPapel(c, { role: 'rep', ownerId: '339921752', nome: 'Julyan' });
const bruno = m.filtrarParaPapel(c, { role: 'rep', ownerId: '86100506', nome: 'Bruno' });
const conta = d => Object.values(d.funilLeads || {}).reduce((t, l) => t + l.filter(x => String(x.ownerId) === '339921752').length, 0);
const casos = [
  ['gestor não recebe a gaveta', !('funilForaDoTime' in gestor)],
  ['gestor não vê negócio do Julyan no funil do time', conta(gestor) === 0],
  ['visão do Julyan tem os 2 da gaveta', conta(julyanExec) === 2],
  ['o negócio da gaveta vem com a etapa', (julyanExec.funilLeads['1395880469'] || []).some(l => l.id === 'G1' && String(l.stageId) === '1395880469')],
  ['Bruno: funil sem o Julyan', conta(bruno) === 0],
  ['Bruno: sem a gaveta', !bruno.funilForaDoTime],
  ['Julyan: a gaveta não desce crua', !julyanExec.funilForaDoTime],
];
casos.forEach(c => console.log((c[1] ? 'ok   ' : 'FALHA') + ' ' + c[0]));
process.exit(casos.every(c => c[1]) ? 0 : 1);
