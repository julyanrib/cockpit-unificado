// AS VARIAÇÕES DE NOME DE BAIRRO DA CASA DOS DADOS (15/10/26).
//
// A carga de 15/10 trouxe 540 recém-abertos e 47 ficaram sem dono: "Penha de França", "Vila
// Carrão", "Vila Maria Baixa", "Jardim Sao Paulo(Zona Norte)"… O roteador casa o bairro exato e o
// filtro do robô casava por pedaço do nome — e o pedaço também trazia "Chácara Santana" (Zona Sul)
// por causa de "Santana" (Zona Norte). Este teste guarda os dois lados: a variação conferida cai
// no dono certo, e o bairro de fora continua sem dono (e o robô nem o importa).
//
// Rode com: node scripts/testar-variantes-bairro.js
const { regraDoTerritorio } = require('../lib/territorios.js');

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const dono = (b) => { const r = regraDoTerritorio('São Paulo', b); return r && r.owner ? r.nome : null; };

for (const [b, quem] of [
  ['Penha de Franca', 'Fabio'], ['PENHA DE FRANCA', 'Fabio'], ['Jardim Penha', 'Fabio'], ['Jardim America da Penha', 'Fabio'],
  ['Vila Carrao', 'Fabio'], ['Jardim Vila Formosa', 'Fabio'], ['Parque da Vila Prudente', 'Fabio'], ['Parque da Mooca', 'Fabio'],
  ['Vila Maria Baixa', 'Sérgio'], ['Parque Mandaqui', 'Sérgio'], ['Casa Verde Alta', 'Sérgio'], ['Jardim Cidade Pirituba', 'Sérgio'],
  ['Jardim Sao Paulo(Zona Norte)', 'Sérgio'], ['Alto do Pari', 'Renata'],
]) ok((dono(b) || '').startsWith(quem), `${b} → ${quem} (veio ${dono(b)})`);

for (const b of ['Chacara Santana', 'CHACARA SANTANA', 'Jardim Sao Paulo(Zona Leste)', 'Vila Santana', 'Jardim Belem']) {
  ok(dono(b) === null, `${b} continua sem dono (fora dos bairros declarados)`);
}

// o robô usa a mesma regra para decidir o que importa (scripts/backfill-casa-dos-dados.js)
const fonte = require('fs').readFileSync(require('path').join(__dirname, 'backfill-casa-dos-dados.js'), 'utf8');
ok(/cfg\.bairroTemDono = b => \{ const r = regraDoTerritorio\(/.test(fonte), 'o filtro do robô é a regra do roteador (não o pedaço do nome)');

console.log(falhas ? `\n${falhas} falha(s)` : '\nvariantes de bairro: tudo certo');
process.exit(falhas ? 1 : 0);
