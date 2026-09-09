/* ══════════════════════════════════════════════════════════════════════════════════════
   QUEM COBRE O QUÊ — a declaração única de território (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   O Julyan ditou as rotas em 09/09 e elas revelaram que a mesma regra vivia em DOIS
   lugares:

     · a tela do gestor derivava a praça de cada executivo dos BAIRROS DOS LEADS DE
       EXEMPLO em data/leads-referencia.json — um arquivo de contas-modelo, não de
       território;
     · a busca semanal tinha a própria cópia, em regex escrita à mão (as metaBairros de
       scripts/backfill-casa-dos-dados.js).

   AS DUAS DIVERGIAM CALADA, e o preço foi medido: quatro dos onze executivos não
   apareciam em praça nenhuma na tela (e por isso não podiam receber carga), e cinco
   municípios de rota real — Mogi das Cruzes, Biritiba Mirim, Salesópolis, Suzano e
   Guarulhos — não eram buscados por ninguém. Gente com rota e sem munição.

   Agora a declaração é uma: data/territorios.json. Esta suite existe para ela continuar
   sendo uma, e para o que ficou sem dono continuar VISÍVEL em vez de virar silêncio.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const decl = require(path.join(raiz, 'data', 'territorios.json'));
const usuarios = require(path.join(raiz, 'data', 'usuarios.json'));
const { CIDADES } = require(path.join(raiz, 'scripts', 'backfill-casa-dos-dados.js'));
const backfill = fs.readFileSync(path.join(raiz, 'scripts', 'backfill-casa-dos-dados.js'), 'utf8');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const montar = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}

const chave = s => String(s || '').toLowerCase().normalize('NFD')
  .replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const TERR = decl.territorios || [];
const reps = (Array.isArray(usuarios) ? usuarios : (usuarios.usuarios || []))
  .filter(u => u.role === 'rep');

/* ── 1 · TODO EXECUTIVO ATIVO ESTÁ NA DECLARAÇÃO ──────────────────────────────────── */
const semLinha = reps.filter(u => !TERR.some(t => chave(t.rep) === chave(u.nome)));
conferir('todo executivo do time tem linha na declaração',
  semLinha.length === 0,
  'sem linha: ' + semLinha.map(u => u.nome).join(', ')
    + ' — quem não está aqui não aparece em praça nenhuma na aba Rotas e não pode receber carga');

/* ── 2 · E QUEM ESTÁ SEM ROTA DIZ QUE ESTÁ ────────────────────────────────────────── */
const vazios = TERR.filter(t => !(t.areas || []).length);
conferir('rota vazia vem com o motivo escrito',
  vazios.every(t => t._pendente),
  'sem motivo: ' + vazios.filter(t => !t._pendente).map(t => t.rep).join(', ')
    + ' — array vazio sem nota é indistinguível de esquecimento meu');

/* ── 3 · NINGUÉM DIVIDE BAIRRO COM NINGUÉM ────────────────────────────────────────── */
const dono = new Map();
const colisoes = [];
TERR.forEach(t => {
  if (t.ativo === false) return;
  (t.areas || []).forEach(a => {
    (a.bairros || []).forEach(b => {
      const k = (a.municipio || '') + '|' + chave(b);
      if (dono.has(k) && dono.get(k) !== t.rep) {
        colisoes.push(b + ' em ' + a.municipio + ': ' + dono.get(k) + ' e ' + t.rep);
      }
      dono.set(k, t.rep);
    });
  });
});
conferir('nenhum bairro tem dois donos',
  colisoes.length === 0,
  colisoes.join(' · ') + ' — dois executivos na mesma rua é visita repetida e cliente irritado');

/* ── 4 · O QUE FICOU SEM DONO NÃO ESTÁ TAMBÉM ATRIBUÍDO ───────────────────────────── */
/* DENTRO DO MUNICÍPIO, e isto foi um conserto: a primeira versão comparava só o nome do
   bairro e acusou "Centro está sem dono E com Renata Pessoa" — porque Centro existe em
   Mogi, Biritiba, Salesópolis, Suzano, Guarulhos E na lista órfã da capital. Comparação
   de bairro sem a cidade é comparação errada, e ela reprovava dado correto. */
const orfaos = decl._sem_dono || [];
const contradicao = [];
orfaos.forEach(o => {
  (o.bairros || []).forEach(b => {
    const k = (o.municipio || '') + '|' + chave(b);
    if (dono.has(k)) contradicao.push(b + ' em ' + o.municipio + ': sem dono E com ' + dono.get(k));
  });
});
conferir('bairro sem dono não aparece atribuído a alguém',
  contradicao.length === 0,
  contradicao.join(' · ') + ' — a lista de órfãos é para o Julyan reatribuir; ela mentindo é pior que não existir');

conferir('e cada bloco sem dono diz a cidade, os bairros e de onde veio',
  orfaos.length > 0 && orfaos.every(o => o.porque && o.municipio && o.bairros && o.bairros.length),
  'zona órfã sem cidade não dá para reatribuir, e sem motivo ninguém sabe se foi esquecida ou desativada de propósito');

/* ── 5 · EXCLUSÃO SÓ EXISTE COM O DONO DO EXCLUÍDO ────────────────────────────────── */
const semDestino = [];
TERR.forEach(t => {
  (t.areas || []).forEach(a => {
    (a.exceto || []).forEach(b => {
      const k = (a.municipio || '') + '|' + chave(b);
      if (!dono.has(k)) semDestino.push(b + ' em ' + a.municipio + ' (tirado de ' + t.rep + ')');
    });
  });
});
conferir('bairro excluído de uma rota é de outra pessoa, não de ninguém',
  semDestino.length === 0,
  semDestino.join(' · ') + ' — "só não pega X" só faz sentido se X for de alguém; senão é zona que ninguém visita e ninguém sabe');

/* ── 6 · A DERIVAÇÃO COBRE TODO MUNICÍPIO DECLARADO ──────────────────────────────── */
const municipios = new Set();
TERR.forEach(t => { if (t.ativo !== false) (t.areas || []).forEach(a => a.municipio && municipios.add(a.municipio)); });
const foraDaBusca = [...municipios].filter(m => !CIDADES.some(c => c.municipio === m));
conferir('todo município com rota entra na busca semanal',
  foraDaBusca.length === 0,
  'fora da busca: ' + foraDaBusca.join(', ') + ' — rota sem munição foi exatamente o buraco de 09/09');

conferir('e a cidade com mais de um dono ganha sub-cota por bairro',
  CIDADES.filter(c => c.metaBairros).every(c => c.metaBairros.length > 1) &&
  CIDADES.some(c => c.municipio === 'Guarulhos' && c.metaBairros && c.metaBairros.length === 2),
  'sem sub-cota a cidade cumpre a meta com contas de uma zona só e a zona do colega nasce vazia');

/* ══ OS DOIS DEFEITOS DO CASAMENTO DE BAIRRO (09/09/26) ═══════════════════════════════
   Os dois só apareceram quando eu derivei as sub-cotas da declaração e fui conferir
   bairro por bairro. A regex antiga tinha o primeiro e ninguém sabia.

   1. SUBSTRING CASAVA VIZINHO. 'vila mariana' — que está na lista de zonas SEM DONO da
      capital — caía na rota do Sérgio, porque ele tem 'Vila Maria' e uma é prefixo da
      outra. Terceira vez nesta semana que casamento solto me morde.
   2. O MESMO LEAD CONTAVA PARA DOIS DONOS. O CRM guarda "Freguesia (Jacarepaguá, entorno
      imediato de Taquara)"; aquilo casava com o André (Freguesia) e com o Bruno
      (Taquara), e as duas sub-cotas pareciam mais cheias do que estão. */
function donosDe(municipio, bairro) {
  const c = CIDADES.find(x => x.municipio === municipio);
  if (!c || !c.metaBairros) return [];
  return c.metaBairros.filter(m => m.teste(bairro)).map(m => m.nome.split(' (')[0]);
}

conferir('bairro de nome parecido não entra na rota do vizinho',
  donosDe('São Paulo', 'vila maria').join() === 'Sérgio Caetano' &&
  donosDe('São Paulo', 'vila mariana').length === 0,
  'Vila Mariana está sem dono e caía no Sérgio por causa de Vila Maria — substring casa vizinho, borda de palavra não');

conferir('e o bairro com apêndice do CRM continua casando',
  donosDe('Rio de Janeiro', 'tijuca shopping 45').join() === 'Bruno Martins' &&
  donosDe('Rio de Janeiro', 'curicica entorno imediato de taquara').join() === 'Bruno Martins',
  'o CRM guarda bairro com contexto digitado à mão; igualdade pura perderia esses leads');

conferir('nenhum bairro conta para dois donos',
  ['taquara', 'freguesia jacarepagua entorno imediato de taquara', 'tijuca shopping 45',
    'anil', 'copacabana', 'cachambi'].every(b => donosDe('Rio de Janeiro', b).length <= 1) &&
  ['vila maria', 'santana', 'lapa', 'morumbi'].every(b => donosDe('São Paulo', b).length <= 1),
  'lead contado em duas sub-cotas faz as duas parecerem cheias e a busca para antes de trazer o que falta');

conferir('e quem ganha é o bairro que vem primeiro no texto',
  donosDe('Rio de Janeiro', 'freguesia jacarepagua entorno imediato de taquara').join() === 'André Gomes',
  'o bairro é o que vem primeiro; o resto é contexto que alguém digitou — Freguesia é do André, Taquara é do Bruno');

/* ── 7 · UMA FONTE SÓ ─────────────────────────────────────────────────────────────── */
const semNota = backfill.replace(/\/\*[\s\S]*?\*\//g, ' ');
conferir('o backfill NÃO tem mais lista de bairro escrita à mão',
  !/teste: b => \//.test(semNota) && !/copacabana\|ipanema/.test(semNota),
  'a regex por rep aqui era a segunda cópia da mesma regra, e foi ela que divergiu da tela');

conferir('e as cidades dele saem da declaração',
  /require\('\.\.\/data\/territorios\.json'\)/.test(semNota) && /const CIDADES = \(\(\) => \{/.test(semNota),
  'lista de cidade cravada aqui volta a divergir na primeira rota nova');

conferir('a tela do gestor lê a MESMA declaração',
  /DATA\.territorios \|\| \[\]/.test(tpl) && /function rt7PracaDoRep\(u\)/.test(tpl),
  'a tela derivava a praça dos bairros dos leads de exemplo, que não são território de ninguém');

conferir('e a declaração chega às duas telas pelo montador',
  /require\('\.\.\/data\/territorios\.json'\)/.test(montar) &&
  /territorios: territorios\.territorios \|\| \[\]/.test(montar),
  'sem passar pelo payload, DATA.territorios fica undefined e a tela cai no fallback em silêncio');

/* ── 8 · PRIVACIDADE: A ROTA DO COLEGA NÃO VAZA ──────────────────────────────────── */
conferir('o executivo recebe só a própria rota',
  /const meuTerritorio = \(dados\.territorios \|\| \[\]\)\.filter\(x => x && x\.rep === meuNome\)/.test(montar) &&
  /territorios: meuTerritorio,/.test(montar),
  'o mapa inteiro diz por onde cada colega anda — mesma regra que cortou snapshotReps em 07/08');

/* ── 9 · QUEM SAIU DE CAMPO NÃO RECEBE CARGA, E A PRAÇA DELE NÃO SECA ────────────── */
const amanda = TERR.find(t => chave(t.rep) === chave('Amanda Pardim'));
conferir('quem está em transição para Inside fica marcado como inativo',
  amanda && amanda.ativo === false && amanda._nota,
  'rt7Ativos() já a exclui pelo fieldStatus; a declaração precisa concordar, senão Vitória aparece com dona que não trabalha ali');

conferir('e a praça sem dono continua sendo buscada',
  CIDADES.some(c => c.municipio === 'Vitória'),
  'praça sem executivo não pode secar em silêncio enquanto o Julyan não reatribui');

/* ── 10 · O CUSTO ESTÁ ESCRITO ────────────────────────────────────────────────────── */
conferir('o custo dos municípios novos está dito no próprio arquivo',
  decl._municipios_sem_busca && decl._municipios_sem_busca.custo &&
  /consulta paga/.test(decl._municipios_sem_busca.custo),
  'cinco municípios novos são dez consultas pagas a mais por semana; quem decide cortar precisa ver o número');

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('territórios: ' + ok + ' checagens ok — ' + TERR.length + ' executivos declarados, '
  + municipios.size + ' municípios, ' + (decl._sem_dono || []).length + ' zonas sem dono ditas em voz alta.');
