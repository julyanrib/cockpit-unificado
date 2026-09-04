/* A COORDENADA DO HUBSPOT SOBREVIVE AO MAPEAMENTO — teste da transformacao pura.

   Nao tenho o token do HubSpot nesta maquina, entao nao posso rodar o fetch inteiro. Mas o
   que eu consertei e uma TRANSFORMACAO PURA: dado o objeto que a API devolve, o mapeamento
   tem de carregar lat/lng. Isso se prova aqui, com a resposta real da API que eu li pelo
   MCP (SALHO GASTRONOMIA, latitude -23.62510762, longitude -46.69902112).

   Extraio o trecho do mapeamento do proprio arquivo e o executo — assim a prova e sobre o
   CODIGO QUE ESTA NO DISCO, e nao sobre uma copia minha dele. */
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, 'fetch-hubspot.js');
const s = fs.readFileSync(P, 'utf8');

const i = s.indexOf('  const leadsReciclagem60 = reciclagemDealsRaw');
if (i < 0) { console.error('nao achei o mapeamento'); process.exit(1); }
const fim = s.indexOf('.sort((a, b) => b.dias - a.dias);', i);
if (fim < 0) { console.error('nao achei o fim'); process.exit(1); }
const trecho = s.slice(i, fim) + ';';

/* as dependencias que o trecho usa. coordenadaValida vem DO PROPRIO ARQUIVO, extraida
   como o mapeamento: assim o teste prova o codigo do disco, e nao uma copia minha dele. */
const iC = s.indexOf('function coordenadaValida(valor) {');
if (iC < 0) { console.error('nao achei coordenadaValida'); process.exit(1); }
eval(s.slice(iC, s.indexOf('\n}', iC) + 2));
const ownerNameById = { '86100506': 'Bruno Martins' };
const daysInCurrentStage = () => 140;
const reciclagemDealsRaw = [
  { id: '64201989892', properties: {
      dealname: 'SALHÔ GASTRONOMIA', hubspot_owner_id: '86100506',
      latitude: '-23.62510762', longitude: '-46.69902112',
      cidade: 'São Paulo', bairro: null, cep: '04578-000',
      logradouro: 'Av. das Nações Unidas', numero: '12901',
      dealstage: '1398311191', amount: '1490' } },
  /* e uma SEM coordenada, para provar que null continua null e nao vira 0 */
  { id: '54421227526', properties: {
      dealname: 'FRANGO CHIC', hubspot_owner_id: '86100506',
      dealstage: '1398311191', amount: '0' } },
  /* e uma com coordenada INVALIDA, que nao pode virar pino no Atlantico */
  { id: '99999999999', properties: {
      dealname: 'COORDENADA PODRE', hubspot_owner_id: '86100506',
      latitude: 'nao-e-numero', longitude: '', dealstage: '1398311191' } }
];

let leadsReciclagem60;
eval(trecho.replace('  const leadsReciclagem60 =', 'leadsReciclagem60 ='));

const porNome = {};
leadsReciclagem60.forEach(l => { porNome[l.name] = l; });

const casos = [
  ['SALHÔ GASTRONOMIA · lat', porNome['SALHÔ GASTRONOMIA'].lat, -23.62510762],
  ['SALHÔ GASTRONOMIA · lng', porNome['SALHÔ GASTRONOMIA'].lng, -46.69902112],
  ['SALHÔ GASTRONOMIA · cep', porNome['SALHÔ GASTRONOMIA'].cep, '04578-000'],
  ['SALHÔ GASTRONOMIA · logradouro', porNome['SALHÔ GASTRONOMIA'].logradouro, 'Av. das Nações Unidas'],
  ['SALHÔ GASTRONOMIA · stageId', porNome['SALHÔ GASTRONOMIA'].stageId, '1398311191'],
  ['FRANGO CHIC · sem coordenada continua null', porNome['FRANGO CHIC'].lat, null],
  ['COORDENADA PODRE · NaN não passa', porNome['COORDENADA PODRE'].lat, null],
  ['COORDENADA PODRE · vazio não passa', porNome['COORDENADA PODRE'].lng, null]
];

let falhou = 0;
casos.forEach(function (c) {
  const ok = c[1] === c[2];
  if (!ok) falhou++;
  console.log('  ' + (ok ? 'ok  ' : 'FALHA  ') + c[0] + '  → ' + JSON.stringify(c[1])
    + (ok ? '' : ' (esperado ' + JSON.stringify(c[2]) + ')'));
});
console.log('');
if (falhou) { console.error(falhou + ' falha(s)'); process.exit(1); }
console.log('a coordenada do HubSpot sobrevive ao mapeamento, e o que não é número continua null.');
