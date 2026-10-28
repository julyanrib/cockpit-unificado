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
  /* 28/10/26: a zona leste passou do Fabio para o Allef (o Fabio saiu do time). O que este
     teste protege é a NORMALIZAÇÃO do nome do bairro — acento, caixa, parêntese colado —, não
     quem é o dono; o nome aqui é só o rótulo do caso. */
  ['Penha de Franca', 'Allef'], ['PENHA DE FRANCA', 'Allef'], ['Jardim Penha', 'Allef'], ['Jardim America da Penha', 'Allef'],
  ['Vila Carrao', 'Allef'], ['Jardim Vila Formosa', 'Allef'], ['Parque da Vila Prudente', 'Allef'], ['Parque da Mooca', 'Allef'],
  ['Vila Maria Baixa', 'Sérgio'], ['Parque Mandaqui', 'Sérgio'], ['Casa Verde Alta', 'Sérgio'], ['Jardim Cidade Pirituba', 'Sérgio'],
  ['Jardim Sao Paulo(Zona Norte)', 'Sérgio'],
]) ok((dono(b) || '').startsWith(quem), `${b} → ${quem} (veio ${dono(b)})`);

/* 'Alto do Pari' mudou de lado em 28/10/26: era da Renata, que saiu do time, e o CENTRO de São
   Paulo ficou SEM EXECUTIVO. Ele desce para a lista de baixo de propósito — enquanto estiver
   aqui, este teste é o lembrete de que o centro não tem dono. */
for (const b of ['Chacara Santana', 'CHACARA SANTANA', 'Jardim Sao Paulo(Zona Leste)', 'Vila Santana', 'Jardim Belem', 'Alto do Pari']) {
  ok(dono(b) === null, `${b} continua sem dono (fora dos bairros declarados)`);
}

// o robô usa a mesma regra para decidir o que importa (scripts/backfill-casa-dos-dados.js)
const fonte = require('fs').readFileSync(require('path').join(__dirname, 'backfill-casa-dos-dados.js'), 'utf8');
ok(/cfg\.bairroTemDono = b => \{ const r = regraDoTerritorio\(/.test(fonte), 'o filtro do robô é a regra do roteador (não o pedaço do nome)');

console.log(falhas ? `\n${falhas} falha(s)` : '\nvariantes de bairro: tudo certo');
process.exit(falhas ? 1 : 0);
