/* ============================================================================
   O TIME DO GESTOR · HOJE · SEMANA · MÊS (revisão geral, 05/10/26)

   Esta suíte RODA as contas da tela (t10Hoje, t10Semana) com um time falso, em vez
   de procurar texto no template: "a função existe" passava verde com a tela dizendo
   "Hoje todos têm plano" sobre uma leitura vazia — foi o primeiro defeito que o
   preview mostrou. O que ela trava são as regras da prancha que não se veem num print:
     · leitura vazia vira estado, nunca 0 de 0;
     · cada pessoa aparece em UM item do "Agir hoje", e são no máximo 5;
     · demo com decisor sem leitura some (não vira 0);
     · coluna sem medida não aparece (Ganhos de semana fechada);
     · o Cobrar grava no sino do app (o "cobrado HH:MM" é lido de lá).
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const template = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, detalhe) => { if (cond) { ok++; return; } falhas.push(nome + (detalhe ? ' — ' + detalhe : '')); };

const ini = template.indexOf('const T10 = {');
const fim = template.indexOf('function t10Ligar()');
checar('o bloco do Time existe', ini > -1 && fim > ini);

/* ── o ambiente mínimo que as contas usam ─────────────────────────────────────── */
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const ELENCO = [
  { ownerId: '1', nome: 'Ana Souza' }, { ownerId: '2', nome: 'Beto Lima' },
  { ownerId: '3', nome: 'Caio Reis' }, { ownerId: '4', nome: 'Dani Melo' }
];
function montar(hora, pessoas, extra) {
  const amb = {
    addDays: addDays,
    h10HojeISO: function () { return '2026-10-06'; },            /* terça */
    h10HoraBRT: function () { return hora; },
    pt6Elenco: function () { return ELENCO; },
    pt6PrimeiroNome: function (n) { return String(n).split(' ')[0]; },
    pt6Lista: function (ns) { return ns.length < 2 ? ns.join('') : ns.slice(0, -1).join(', ') + ' e ' + ns[ns.length - 1]; },
    pt6DDMM: function (iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); },
    pt6Hora: function () { return '10:00'; },
    pt6Iniciais: function (n) { return n.slice(0, 2); },
    pt6Segunda: function () { return '2026-10-05'; },
    v5Esc: function (v) { return String(v == null ? '' : v); },
    tm10Rs: function (n) { return 'R$ ' + n; },
    tm10MrrDo: function () { return 0; },
    quentesNoRadar: function () { return { radar: [] }; },
    leadTemProximoPasso: function () { return true; },
    tl5Medir: function () { return { porRep: [] }; },
    DATA: (extra && extra.DATA) || { reps: [], resumoSemanal: {} },
    PT6: { semanaAtras: 0, dados: null, em: 0, dia: null },
    PT6_TIPOS_VIVOS: new Set(['visita']),
    supa: null, sessaoAtual: { role: 'manager' }
  };
  const nomes = Object.keys(amb);
  const corpo = template.slice(ini, fim) + '\nreturn { T10: T10, t10Hoje: t10Hoje, t10Semana: t10Semana, t10TelaHTML: t10TelaHTML };';
  /* o template guarda o JS com as aspas e barras do arquivo: o bloco roda como está */
  const f = new Function(nomes.join(','), corpo);
  const m = f.apply(null, nomes.map(function (k) { return amb[k]; }));
  /* a semana corrente (05 a 09/10), já lida */
  const dias = function (arr) { return arr.map(function (d, i) { return { dia: addDays('2026-10-05', i), planejadas: d[0], feitasDoPlano: d[1], feitas: d[2], provadas: d[3], meta: 6 }; }); };
  m.T10.semanas['2026-10-05'] = { em: Date.now(), d: { dia: '2026-10-06', mapa: {}, pessoas: pessoas.map(function (p) {
    return { ownerId: p.oid, seller: 's' + p.oid, demos: p.demos || 0, plano: p.plano || null, proxima: null, dias: dias(p.dias) };
  }) } };
  m.T10.fichas = (extra && 'fichas' in extra) ? extra.fichas : {};
  m.T10.fichasErro = !!(extra && extra.fichasErro);
  return m;
}
const vazio = [0, 0, 0, 0];

/* 1 · LEITURA VAZIA VIRA ESTADO */
{
  const m = montar(10, []);
  const r = m.t10Hoje();
  checar('leitura sem ninguém vira estado de erro', !!r.erro, JSON.stringify(r).slice(0, 120));
  checar('e nunca a frase "todos têm plano"', !(r.manchete && /todos têm plano/.test(r.manchete)));
}

/* 2 · SEM PLANO, FUROU E A ORDEM DA RODADA */
{
  /* segunda (ontem) e terça (hoje) */
  const m = montar(12, [
    { oid: '1', dias: [[4, 4, 4, 4], [0, 0, 0, 0], vazio, vazio, vazio] },     /* Ana: sem plano hoje */
    { oid: '2', dias: [[5, 2, 2, 2], [6, 0, 0, 0], vazio, vazio, vazio] },     /* Beto: furou 3, nenhuma visita até 12h */
    { oid: '3', dias: [[3, 3, 3, 3], [5, 2, 3, 2], vazio, vazio, vazio] },     /* Caio: 1 sem prova */
    { oid: '4', dias: [[2, 2, 2, 2], [4, 1, 1, 1], [3, 0, 0, 0], vazio, vazio] } /* Dani: no ritmo */
  ]);
  const r = m.t10Hoje();
  checar('a manchete nomeia quem está sem plano', /Hoje, Ana está sem plano\./.test(r.manchete), r.manchete);
  checar('com o time todo planejando ontem, o verbo é do time', /o time planejou 14 visitas e provou 11/.test(r.manchete), r.manchete);
  checar('quem está sem plano abre a lista por pessoa', r.rows[0] && r.rows[0].oid === '1');
  checar('quem está no ritmo não é exceção', r.rows.filter(function (x) { return !x.excecao; }).map(function (x) { return x.oid; }).join() === '4');
  checar('o Agir hoje tem no máximo 5', r.agir.length <= 5);
  const quem = r.agir.map(function (a) { return a.titulo.split(/[: ]/)[0]; });
  checar('cada pessoa aparece em um item só', new Set(quem).size === quem.length, quem.join(' | '));
  checar('o primeiro item é o sem plano, com Cobrar', /sem plano para hoje/.test(r.agir[0].titulo) && /lote:semplano/.test(r.agir[0].acoes[0].v));
  checar('nenhuma visita até o meio-dia vira item com Mapa', r.agir.some(function (a) { return /^Beto: nenhuma visita/.test(a.titulo) && a.acoes.some(function (b) { return b.mapa; }); }));
  checar('visita sem prova vira item com 1:1', r.agir.some(function (a) { return /^Caio: 1 visita de hoje sem prova/.test(a.titulo); }));
  checar('o herói soma as provadas contra a meta', r.numeros[0].v === '3 de 24', r.numeros[0].v);
  checar('furos de ontem = planejadas − feitas do plano', r.numeros[r.numeros.length - 1].v === '3');
}

/* 3 · DEMO SEM LEITURA SOME (não vira zero) */
{
  const pessoas = [{ oid: '1', dias: [[1, 1, 1, 1], [2, 1, 1, 1], vazio, vazio, vazio] }];
  const sem = montar(10, pessoas, { fichas: null, fichasErro: true }).t10Hoje();
  checar('demos fora do herói quando a leitura falhou', !sem.numeros.some(function (n) { return /demos/.test(n.r); }));
  checar('e "—" na linha', sem.rows[0].celulas[3].v === '—');
  const com = montar(10, pessoas, { fichas: { s1: new Set(['a', 'b']) } }).t10Hoje();
  checar('demos contadas por cliente, pelo vendedor', com.rows[0].celulas[3].v === '2');
}

/* 4 · COLUNA SEM MEDIDA NÃO APARECE (Semana) */
{
  const m = montar(10, ELENCO.map(function (e) { return { oid: e.ownerId, dias: [[5, 5, 5, 5], [5, 5, 5, 5], vazio, vazio, vazio] }; }),
    { DATA: { reps: [], resumoSemanal: { janela: { atual: '28/09–02/10/2026' } } } });
  m.T10.semAtras = 0;
  const r = m.t10Semana();
  checar('semana corrente mede ganhos (HubSpot ao vivo)', r.colunas.indexOf('Ganhos') > -1);
  const m2 = montar(10, [], { DATA: { reps: [], resumoSemanal: { janela: { atual: '21/09–25/09/2026' } } } });
  m2.T10.semAtras = 1;
  m2.T10.semanas['2026-09-28'] = { em: Date.now(), d: { pessoas: ELENCO.map(function (e) {
    return { ownerId: e.ownerId, seller: 's', demos: 0, dias: [0, 1, 2, 3, 4].map(function (i) { return { dia: addDays('2026-09-28', i), planejadas: 3, feitasDoPlano: 3, feitas: 3, provadas: 3, meta: 6 }; }) };
  }) } };
  const r2 = m2.t10Semana();
  checar('semana fechada sem o resumo dela não mostra a coluna Ganhos', r2.colunas && r2.colunas.indexOf('Ganhos') < 0, JSON.stringify(r2.colunas || r2.erro));
  checar('nem o número de ganhos no herói', r2.numeros && !r2.numeros.some(function (n) { return n.r === 'ganhos'; }));
}

/* 5 · O QUE NÃO SE VÊ NA CONTA */
checar('o Cobrar grava no sino do app (pt6EnviarRecado → sugestoes_planos)',
  /async function t10Registrar[\s\S]{0,400}pt6EnviarRecado\(/.test(template));
checar('o "cobrado HH:MM" é lido do banco, não da memória da aba',
  /from\('sugestoes_planos'\)\.select\('owner_id, created_at'\)/.test(template));
checar('Planejamento e Semana saem da barra (abrem pelo Time)',
  template.indexOf("document.getElementById('tabBtnResumo').style.display = 'none';") > -1);
checar('a tela v10 só aparece no Mês, em Mais leituras',
  template.indexOf('<div id="tm2Raiz" data-tm2-raiz="1" hidden') > -1);

/* 6 · O DIA NO MAPA ABRE NA SEMANA DELE (05/10/26). O dossiê pinta com a semana carregada
   no Planejamento do time: a sexta aberta numa segunda mostrava a semana errada, e sem
   semana nenhuma a gaveta abria vazia. */
{
  const ab = template.slice(template.indexOf('async function t10AbrirDia('), template.indexOf('function t10UmAUm('));
  checar('o Mapa passa pela porta que carrega a semana do dia',
    /verbo === 'mapa'\) \{[^}]*t10AbrirDia\(/.test(template));
  checar('e a porta lê a semana do DIA, e não a corrente',
    /const seg = t10Seg\(dia\);/.test(ab) && /await t10Ler\(seg\)/.test(ab) && /PT6\.dados = d;/.test(ab)
      && ab.indexOf('pt6AbrirDossie(oid, dia)') > ab.indexOf('PT6.dados = d;'));
}

/* 7 · O LINK ANTIGO DO APP CONTINUA CHEGANDO (05/10/26). /gestao/#/daily escolhia a aba pelo
   botão, e o botão saiu da barra: sem isto, o link do app abria a última aba usada. */
checar('#/daily e #/semana abrem o Time no modo certo',
  /base === '#\/daily' \|\| base === '#\/semana'\) && typeof T10 !== 'undefined'\) \{\s*T10\.modo = base === '#\/daily' \? 'hoje' : 'semana';/.test(template));

console.log('');
console.log('time do gestor: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
}
console.log('tudo certo.');
