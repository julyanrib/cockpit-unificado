#!/usr/bin/env node
/* ============================================================================
   O KANBAN E O PIPELINE OFICIAL — a guarda das listas de etapa (01/09/26)
   ----------------------------------------------------------------------------
   Pedido do Julyan: "esse kanban representa as mudanças de etapa do pipe oficial...
   quero ele perfeito, clivável e arrastável... criar a etapa perdido, mas sem puxar
   retroativo... eu nao quero que puxe nada, que continue no hubspot, só vai pra perdido
   a partir de hoje".

   O QUE ESTE ARQUIVO PROTEGE. Mover um negócio de etapa envolve QUATRO listas em três
   arquivos, e elas têm que concordar:
     lib/acoes-negocio/mudar-etapa-negocio.js — ETAPAS_ABERTAS (a escada) e ETAPAS_DESTINO
       (a porteira). É a fronteira de escrita: o que não está aqui não grava, e o navegador
       não tem como contornar;
     template/cockpit.template.html — ORDEM_ETAPAS_FUNIL (a escada do navegador),
       ETAPAS_DESTINO_FUNIL (o menu), FN2_ETAPAS (as colunas do kanban) e fn2PodeMover
       (a legalidade do arrasto);
     scripts/fetch-hubspot.js — o corte de Perdido.
   Quando divergem, o defeito é sempre da mesma família: a tela oferece um destino que o
   servidor recusa (clique morto com formulário em cima), ou esconde um destino que o
   servidor aceita — foi exatamente isso que aconteceu com Reciclagem entre 17/08 e hoje,
   oferecida apagada com a frase falsa "conclua a etapa anterior".

   NÃO testa a UI: testa que as listas batem e que as regras estão escritas nos dois lados.
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const servidor = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'), 'utf8');
const template = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const robo = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-hubspot.js'), 'utf8');
const montar = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, condicao, detalhe) => {
  if (condicao) { ok++; return; }
  falhas.push(nome + (detalhe ? ' — ' + detalhe : ''));
};

/* Lê um array literal de ids de etapa de um arquivo, pelo nome da constante. */
function lerLista(fonte, nome) {
  const re = new RegExp('const\\s+' + nome + '\\s*=\\s*\\[([^\\]]*)\\]');
  const m = fonte.match(re);
  if (!m) return null;
  return m[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

const PERDIDO = '1396006164';
const RECICLAGEM = '1398311191';
const PAGAMENTO = '1395880473';
const GANHO = '1396006162';

/* ── 1. a escada é a mesma nos dois lados ─────────────────────────────────────────── */
const escadaServidor = lerLista(servidor, 'ETAPAS_ABERTAS');
const escadaTela = lerLista(template, 'ORDEM_ETAPAS_FUNIL');
checar('servidor declara ETAPAS_ABERTAS', Array.isArray(escadaServidor) && escadaServidor.length > 0);
checar('template declara ORDEM_ETAPAS_FUNIL', Array.isArray(escadaTela) && escadaTela.length > 0);
if (escadaServidor && escadaTela) {
  checar('a escada do servidor e a da tela são idênticas, na mesma ordem',
    escadaServidor.join('|') === escadaTela.join('|'),
    'servidor=[' + escadaServidor.join(',') + '] tela=[' + escadaTela.join(',') + ']');
  checar('Perdido NÃO está na escada (senão viraria degrau e bloquearia como pulo de fase)',
    escadaServidor.indexOf(PERDIDO) < 0 && escadaTela.indexOf(PERDIDO) < 0);
  checar('Ganho continua fora da escada (quem move para lá é o ASAAS, não uma pessoa)',
    escadaServidor.indexOf(GANHO) < 0);
}

/* ── 2. a porteira aceita Perdido, dos dois lados ─────────────────────────────────── */
const porteiraServidor = servidor.match(/const\s+ETAPAS_DESTINO\s*=\s*ETAPAS_ABERTAS\.concat\(\[\s*ETAPA_PERDIDO\s*\]\)/);
checar('servidor: ETAPAS_DESTINO = escada + Perdido', !!porteiraServidor);
checar('servidor: a validação de destino usa ETAPAS_DESTINO, não ETAPAS_ABERTAS',
  /if \(!ETAPAS_DESTINO\.includes\(String\(novaEtapa\)\)\)/.test(servidor));
checar('servidor: ETAPA_PERDIDO é o id real do pipeline Field Sales',
  new RegExp("const ETAPA_PERDIDO = '" + PERDIDO + "'").test(servidor));
checar('template: ETAPAS_DESTINO_FUNIL = escada + Perdido',
  /const ETAPAS_DESTINO_FUNIL = ORDEM_ETAPAS_FUNIL\.concat\(\['1396006164'\]\)/.test(template));
checar('template: o menu de destinos itera ETAPAS_DESTINO_FUNIL (e não a escada)',
  /\$\{ETAPAS_DESTINO_FUNIL\.map\(sid => \{/.test(template));

/* ── 3. o motivo é obrigatório para entrar em Perdido, dos dois lados ─────────────── */
checar('servidor: motivo_do_perdido está na allowlist de propriedades',
  /'reuniao_agendada', 'description', 'motivo_do_perdido'\]/.test(servidor));
checar('servidor: Perdido exige motivo_do_perdido',
  new RegExp("'" + PERDIDO + "': \\['motivo_do_perdido'\\]").test(servidor));
checar('servidor: o motivo tem lista fechada de valores',
  /motivo_do_perdido: \['Preço', 'Funcionalidade', 'Sem retorno', 'Reembolso', 'Não quer mudar de sistema', 'Outros'\]/.test(servidor));
checar('template: o campo do motivo é obrigatório na etapa Perdido',
  new RegExp("'" + PERDIDO + "': \\[[\\s\\S]{0,240}?motivo_do_perdido[\\s\\S]{0,160}?obrigatorio: true").test(template));
checar('template: motivo_do_perdido está em PROPS_GRAVAVEIS (senão a gravação é recusada)',
  /'reuniao_agendada', 'description', 'motivo_do_perdido'\]/.test(template));

/* As seis opções da tela têm que ser as mesmas seis do servidor — e as duas listas têm
   que ser as da propriedade real no HubSpot. Ordem pode diferir (na tela as mais usadas
   vêm primeiro); o CONJUNTO, não. */
const opTela = lerLista(template, 'OP_MOTIVO_PERDA');
const opServidorM = servidor.match(/motivo_do_perdido: \[([^\]]*)\]/);
const opServidor = opServidorM ? opServidorM[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')) : null;
checar('template declara OP_MOTIVO_PERDA', Array.isArray(opTela) && opTela.length === 6);
if (opTela && opServidor) {
  checar('as opções de motivo são o mesmo conjunto nos dois lados',
    opTela.slice().sort().join('|') === opServidor.slice().sort().join('|'),
    'tela=[' + opTela.join(',') + '] servidor=[' + opServidor.join(',') + ']');
}

/* ── 4. as isenções da regra de pulo: Perdido e Reciclagem, nos dois sentidos ─────── */
checar('servidor: Reciclagem isenta da regra de pulo nos dois sentidos',
  /if \(String\(novaEtapa\) === ETAPA_RECICLAGEM \|\| atual === ETAPA_RECICLAGEM\) return null;/.test(servidor));
checar('servidor: Perdido isento da regra de pulo nos dois sentidos',
  /if \(String\(novaEtapa\) === ETAPA_PERDIDO \|\| atual === ETAPA_PERDIDO\) return null;/.test(servidor));
checar('template: o menu isenta Perdido E Reciclagem (o bug de 17/08 a 01/09 era este)',
  /const foraDaEscada = sid === ETAPA_PERDIDO_ID \|\| lead\.stageId === ETAPA_PERDIDO_ID[\s\S]{0,120}?'1398311191'/.test(template));
checar('template: a passagem de etapa isenta Perdido',
  /const ehPerdido = para === ETAPA_PERDIDO_ID \|\| de === ETAPA_PERDIDO_ID;/.test(template));

/* ── 5. o arrasto recusa exatamente o que o servidor recusaria ────────────────────── */
checar('template: fn2PodeMover existe e é o espelho de validarMovimentoEtapa',
  /function fn2PodeMover\(de, para\) \{/.test(template));
checar('fn2PodeMover libera Perdido nos dois sentidos',
  /if \(pr === FN2_ETAPA_PERDIDO \|\| d === FN2_ETAPA_PERDIDO\) return true;/.test(template));
checar('fn2PodeMover permite avançar só um degrau (e voltar para qualquer anterior)',
  /return iPara <= iDe \+ 1;/.test(template));
checar('o drop consulta fn2PodeMover ANTES de abrir formulário',
  /if \(!fn2PodeMover\(voo\.de, para\)\) \{/.test(template));
checar('o drop cai em abrirPassagemDeEtapa (a mesma porta), não numa escrita própria',
  /abrirPassagemDeEtapa\(lead, para, depoisDeMover\);/.test(template));
checar('nenhuma chamada nova a /api/negocio-acao foi criada no bloco do kanban',
  (template.match(/op: 'mudar-etapa'/g) || []).length === 2,
  'esperado 2 (edição inline de propriedade + a passagem de etapa), achado ' +
  (template.match(/op: 'mudar-etapa'/g) || []).length);

/* ── 6. as colunas são o pipeline oficial ────────────────────────────────────────── */
const idsColunas = (template.match(/const FN2_ETAPAS = \[([\s\S]*?)\n\];/) || [])[1] || '';
const colunas = (idsColunas.match(/id: '(\d+)'/g) || []).map(x => x.replace(/id: '|'/g, ''));
checar('o kanban tem 7 colunas', colunas.length === 7, 'achado ' + colunas.length);
checar('Pagamento é coluna do kanban (é onde o ASAAS cobra)', colunas.indexOf(PAGAMENTO) >= 0);
checar('Perdido é a última coluna', colunas[colunas.length - 1] === PERDIDO);
checar('Ganho NÃO é coluna (ninguém move para lá à mão)', colunas.indexOf(GANHO) < 0);
checar('FN2_ETAPAS_ABERTAS existe e exclui quem saiu do funil',
  /const FN2_ETAPAS_ABERTAS = FN2_ETAPAS\.filter\(e => !e\.saiu\);/.test(template));
/* A barra do hero, o Comando e a conta de "seca em N" NÃO podem iterar as 7: contariam
   negócio perdido como negócio em jogo. Foi o primeiro defeito que a coluna nova criou. */
['const maxN = Math.max(1, ...FN2_ETAPAS_ABERTAS', 'const segmentos = FN2_ETAPAS_ABERTAS',
 'const rotulos = FN2_ETAPAS_ABERTAS', 'const linhas = FN2_ETAPAS_ABERTAS'].forEach(trecho => {
  checar('leitura de funil itera as abertas: ' + trecho.slice(0, 34), template.indexOf(trecho) >= 0);
});
checar('o shell separa "todos" (colunas) de "itens" (o funil)',
  /const todos = fn2Leads\(r\);[\s\S]{0,220}?const itens = todos\.filter\(x => x\.stageId !== FN2_ETAPA_PERDIDO\);/.test(template));

/* ── 7. Perdido não pede próximo passo ───────────────────────────────────────────── */
checar('a bandeira exigePasso existe e exclui Perdido',
  /const exigePasso = para !== ETAPA_PERDIDO_ID;/.test(template));
checar('a seção do próximo passo só é renderizada quando exigePasso',
  /\$\{!exigePasso \? '' :/.test(template));
checar('a validação do próximo passo respeita exigePasso',
  /if \(exigePasso && \(!passoAcao \|\| !passoData\)\) \{/.test(template));
checar('a criação da tarefa respeita exigePasso',
  /let passoOk = !exigePasso, erroPasso = null;/.test(template));

/* ── 8. o corte: nada retroativo desce ──────────────────────────────────────────── */
checar('robô: existe um corte de Perdido, com data',
  /const CORTE_PERDIDO_ISO = '\d{4}-\d{2}-\d{2}';/.test(robo));
checar('robô: NÃO existe janela deslizante (o Julyan pediu corte único)',
  !/JANELA_PERDIDO_DIAS/.test(robo));
checar('robô: o corte é aplicado no FILTRO do HubSpot, não com .filter() depois',
  /propertyName: 'closedate', operator: 'GTE', value: String\(inicioPerdido\)/.test(robo));
checar('robô: o filtro pede a etapa Perdido e só os donos do time',
  /dealstage', operator: 'EQ', value: STAGES\.perdido[\s\S]{0,220}?hubspot_owner_id', operator: 'IN'/.test(robo));
checar('robô: a etapa Perdido NÃO entrou em OPEN_STAGES',
  !/OPEN_STAGES = \[[^\]]*perdido/.test(robo));
checar('robô: closedate e motivo_do_perdido são pedidos ao HubSpot',
  /'closedate', 'motivo_do_perdido',/.test(robo));
checar('robô: a coluna entra em funilLeads (para o corte por dono valer de graça)',
  /funilLeads\[STAGES\.perdido\] = perdidosRecentes\.map/.test(robo));
checar('robô: os perdidos são ordenados do mais recente para o mais antigo',
  /\}\)\.sort\(\(a, b\) => a\.dias - b\.dias\);/.test(robo));
checar('robô: o corte desce no payload, para a tela poder declarar a data',
  /perdidoVisivel: \{[\s\S]{0,200}?corte: CORTE_PERDIDO_ISO/.test(robo));
checar('montar-dados: o gestor recebe perdidoVisivel',
  /perdidoVisivel: hubspot\.perdidoVisivel \|\| null,/.test(montar));
checar('montar-dados: o executivo recebe perdidoVisivel',
  /const perdidoVisivel = dados\.perdidoVisivel \|\| null;/.test(montar) &&
  /^\s{4}perdidoVisivel,$/m.test(montar));
checar('a tela declara o corte na coluna Perdido vazia',
  /DATA\.perdidoVisivel && DATA\.perdidoVisivel\.corte/.test(template));

/* ── 9. Perdido não é tratado como pendência na tela ─────────────────────────────── */
checar('o estado de Perdido é decidido ANTES do bloco de "sem próximo passo"',
  template.indexOf('if (et === FN2_ETAPA_PERDIDO) {') > 0 &&
  template.indexOf('if (et === FN2_ETAPA_PERDIDO) {') < template.indexOf("/* SEM PASSO: o verbo vem da etapa"),
  'senão o kanban pediria em vermelho a próxima visita de um negócio morto');
checar('o card perdido não é arrastável pela borda (reabrir passa pelo menu)',
  /const arrastavel = item\.stageId !== FN2_ETAPA_PERDIDO;/.test(template));
checar('a coluna Perdido vazia tem texto próprio (vazio ali é boa notícia)',
  /if \(etapa\.saiu\) \{/.test(template));
checar('o CTA do card perdido é reabrir, e cai no menu de etapas',
  /cta: 'Reabrir →', acao: 'mover'/.test(template) &&
  /if \(acao === 'mover'\) \{ abrirEscolhaDeEtapa\(lead, depoisDeMover\); return; \}/.test(template));

/* ── 10. a conversão: a correção que o Julyan pediu ─────────────────────────────── */
checar('fn2Conversao lê porOwner (dele) e agregado (do time)',
  /const meu = \(\(h\.porOwner \|\| \{\}\)\[String\(ownerId\)\] \|\| \{\}\)\.etapas \|\| \[\];/.test(template) &&
  /const doTime = h\.agregado \|\| \[\];/.test(template));
checar('n pequeno é declarado em vez de virar porcentagem',
  /poucos: m\.chegaram < FN2_N_MINIMO/.test(template) &&
  /if \(c\.poucos\) return 'passou ' \+ c\.avancaram \+ ' de ' \+ c\.chegaram/.test(template));
checar('o degrau do hero usa conversão, não estoque parado',
  /const pior = candidatos\.slice\(\)\.sort\(\(a, b\) => a\.c\.meu - b\.c\.meu\)\[0\];/.test(template));
checar('o degrau compara com o time para separar "etapa dura" de "minha passagem"',
  /a etapa não é o problema, a sua passagem por ela é/.test(template));
checar('sem histórico suficiente o degrau não inventa etapa',
  /histórico curto para apontar onde o funil vaza/.test(template));
checar('a conversão não é calculada para Perdido (não se "passa" de perdido)',
  /const conv = etapa\.saiu \? null : fn2Conversao\(etapa\.id, fn2OwnerAtual\);/.test(template));

/* ── 11. data só-dia não pode passar por new Date() ─────────────────────────────── */
/* O card de Perdido dizia "31/08 (segunda)" para uma perda de 01/09 (terça): 'YYYY-MM-DD'
   é meia-noite UTC pela especificação, e em Brasília (UTC−3) isso é o dia anterior. Errava
   a data e o dia da semana — que é a única coisa que o chip diz. */
/* Busca LITERAL, não regex: o padrão a verificar é ele mesmo uma expressão regular, e
   escapá-la dentro de outra só cria oportunidade de errar o escape (foi o que aconteceu na
   primeira tentativa desta checagem). indexOf não tem essa armadilha. */
checar('fn2Quando trata data só-dia sem converter fuso',
  template.indexOf('if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) {') > 0);
checar('fn2Quando ainda converte timestamp completo (ali a conversão é necessária)',
  template.indexOf('const iso = isoDate(new Date(d));') > 0);

/* ── 11. o comentário que declarava o limite não pode continuar mentindo ─────────── */
checar('o "LIMITE DECLARADO" da fila foi corrigido (Perdido passou a ser aceito)',
  !/LIMITE DECLARADO: "Perder com motivo" não é oferecido/.test(template) &&
  /LIMITE LEVANTADO \(01\/09\/26\)/.test(template));
checar('o comentário do topo do servidor não diz mais que Perdido ficou de fora',
  !/Marcar como Perdido\/Reciclagem ficou fora de propósito nesta rodada/.test(servidor));

/* ── resultado ──────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('kanban e etapas: ' + ok + ' checagens ok — escada, porteira, motivo, isenções, corte e conversão batendo nos três arquivos.');
