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
checar('o drop consulta fn3PodeMover ANTES de abrir o registro rápido',
  template.indexOf("if (!fn3PodeMover(voo.de, para)) {") > 0);
checar('soltar NÃO move: abre o registro rápido',
  template.indexOf("fn3AbrirRegistro(lead, para, redesenhar);") > 0);
/* A GUARDA QUE PEGOU O DEFEITO DE VERDADE (02/09/26). A primeira versão do registro
   rápido reimplementou a sequência inteira de escrita — PATCH da etapa, nota, tarefa,
   espelho local — e virou a terceira chamada de op:'mudar-etapa' no arquivo. Duas cópias
   da mesma sequência é como se perde a correção feita numa delas. Ficou uma função só,
   gravarPassagemDeEtapa, e as duas telas a chamam. */
checar('existe UMA função de escrita de passagem de etapa',
  template.indexOf("async function gravarPassagemDeEtapa(opts) {") > 0);
checar('as duas telas chamam a mesma função',
  (template.split("await gravarPassagemDeEtapa({").length - 1) === 2,
  'achado ' + (template.split("await gravarPassagemDeEtapa({").length - 1));
checar('nenhuma chamada nova a /api/negocio-acao foi criada no bloco do kanban',
  (template.match(/op: 'mudar-etapa'/g) || []).length === 2,
  'esperado 2 (edição inline + a função compartilhada), achado ' +
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
  template.indexOf("const exigePasso = para !== ETAPA_PERDIDO_ID;") > 0);
checar('a seção do próximo passo só é renderizada quando exigePasso',
  /\$\{!exigePasso \? '' :/.test(template));
checar('a validação do próximo passo respeita exigePasso',
  /if \(exigePasso && \(!passoAcao \|\| !passoData\)\) \{/.test(template));
checar('a criação da tarefa respeita exigePasso (dentro da função compartilhada)',
  template.indexOf("const exigePasso = !!(opts.passoAcao && opts.passoData);") > 0 &&
  template.indexOf("tipoAcao: 'proximo-passo'") > 0);

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
/* PERDIDO DEIXOU DE SER COLUNA na v3: virou trilho de uma linha no rodapé. Coluna inteira
   para dizer "0" é a tela gritando o que NÃO aconteceu, no meio de seis que dizem o que
   aconteceu. O card perdido continua existindo — dentro do trilho, quando se abre.
   TODAS as checagens daqui usam indexOf literal, e não regex: escapar barra invertida
   dentro de patch é o erro que a memória do projeto já registra, e ele volta calado —
   a regex fica VÁLIDA e errada, e a guarda passa verde protegendo nada. */
const iGrade = template.indexOf('const FN3_COLUNAS = [');
const grade = iGrade > 0 ? template.slice(iGrade, template.indexOf('];', iGrade)) : '';
checar('a grade tem 7 colunas', (grade.match(/id: /g) || []).length === 7,
  'achado ' + (grade.match(/id: /g) || []).length);
checar('Perdido NÃO é coluna da grade', grade.length > 0 && grade.indexOf('1396006164') < 0);
checar('Enviado Onboarding é a última coluna da grade',
  grade.indexOf('onb: true') > grade.indexOf('pagto: true'));
checar('Perdido é trilho no rodapé, com o corte declarado',
  template.indexOf('function fn3Perdidos(perdidos) {') > 0 &&
  template.indexOf('nada saiu da sua carteira') > 0);
checar('o alternador Ativos/Perdidos existe',
  template.indexOf('data-fn3-aba="ativos"') > 0 && template.indexOf('data-fn3-aba="perdidos"') > 0);
checar('o card de Onboarding não se arrasta (o que saiu da sua mão não volta por gesto)',
  template.indexOf('const arrastavel = !e.onb;') > 0);
checar('o CTA do card perdido é reabrir, e cai no menu de etapas',
  template.indexOf("cta: 'Reabrir →', acao: 'mover'") > 0);

/* ── 10. a conversão: a correção que o Julyan pediu ─────────────────────────────── */
checar('fn2Conversao lê porOwner (dele) e agregado (do time)',
  template.indexOf('const doTime = h.agregado || [];') > 0);
checar('n pequeno é declarado em vez de virar porcentagem',
  template.indexOf('poucos: m.chegaram < FN2_N_MINIMO') > 0 &&
  template.indexOf("if (c.poucos) return 'passou '") > 0);
checar('o degrau do hero usa conversão, não estoque parado',
  template.indexOf('const pior = candidatos.slice().sort((a, b) => a.c.meu - b.c.meu)[0];') > 0);
checar('o degrau compara com o time para separar "etapa dura" de "minha passagem"',
  template.indexOf('a etapa não é o problema, a sua passagem por ela é') > 0);
checar('sem histórico suficiente o degrau não inventa etapa',
  template.indexOf('histórico curto para apontar onde o funil vaza') > 0);
/* A CONVERSÃO SAIU DO HEADER e foi para o title do hover: três linhas de estatística no
   header afogavam o nome da etapa, que é o defeito nº 2 do print que o Julyan mandou. */
checar('a conversão não ocupa linha do header — vive no title do hover',
  template.indexOf('const conv = (col.pagto || col.onb) ? null : fn2Conversao(col.id, fn2OwnerAtual);') > 0 &&
  template.indexOf('title="${dica}"') > 0);
/* O card de Perdido dizia "31/08 (segunda)" para uma perda de 01/09 (terça): 'YYYY-MM-DD'
   é meia-noite UTC pela especificação, e em Brasília (UTC−3) isso é o dia anterior. Errava
   a data e o dia da semana — que é a única coisa que o chip diz. */
/* Busca LITERAL, não regex: o padrão a verificar é ele mesmo uma expressão regular, e
   escapá-la dentro de outra só cria oportunidade de errar o escape (foi o que aconteceu na
   primeira tentativa desta checagem). indexOf não tem essa armadilha. */
checar('fn2Quando trata data só-dia sem converter fuso',
  template.indexOf("if (txt.length === 10 && txt.charAt(4) === '-' && txt.charAt(7) === '-') {") > 0);
/* E a checagem que faltava: a que teria pego o defeito de verdade. A primeira versão desta
   guarda procurava o padrão com barras invertidas e as perdeu no mesmo escape que o código
   perdeu — as duas mangleadas casaram, a guarda passou, e o bug subiu. Esta olha o
   RESULTADO em vez da forma: se sobrou regex de data neste caminho, ela reprova. */
checar('não há regex de data em fn2Quando (barra invertida some em patch e a regex fica válida e errada)',
  !/function fn2Quando\(d\) \{[\s\S]{0,900}?test\(txt\)/.test(template));
checar('fn2Quando ainda converte timestamp completo (ali a conversão é necessária)',
  template.indexOf('const iso = isoDate(new Date(d));') > 0);

/* ── 11. o comentário que declarava o limite não pode continuar mentindo ─────────── */
/* ── 11. o comentário que declarava o limite não pode continuar mentindo ─────────── */
checar('o "LIMITE DECLARADO" da fila foi corrigido (Perdido passou a ser aceito)',
  template.indexOf('LIMITE DECLARADO: "Perder com motivo" não é oferecido') < 0 &&
  template.indexOf('LIMITE LEVANTADO (01/09/26)') > 0);
checar('o comentário do topo do servidor não diz mais que Perdido ficou de fora',
  servidor.indexOf('Marcar como Perdido/Reciclagem ficou fora de propósito nesta rodada') < 0);

/* ── 12. ENVIADO ONBOARDING: clone, sem retroativo, sem escrever propriedade ──────
   Pedido do Julyan (02/09/26): "puxando do pipe do field com TODAS AS PROPRIEDADES pq
   quando eles enviam pra onboarding cria automações no whatsapp, cria outro card no pipe
   do onboarding e etc não é pra alterar NENHUMA propriedade do hubspot, apenas clonar e
   NÃO QUERO NENHUM RETROATIVO VAI SER A PARTIR DE HOJE TB".
   Medido antes: 431 negócios já estão na etapa — 391 de julho/26. Sem o corte, a coluna
   nasce com 431 cards. */
const ONB = '1396006163';
checar('robô: existe corte do onboarding, com data',
  (robo.match(/const CORTE_ONBOARDING_ISO = .[0-9]{4}-[0-9]{2}-[0-9]{2}./) || []).length === 1);
checar('robô: o corte usa a data de ENTRADA na etapa, não closedate nem lastmodified',
  robo.indexOf("const PROP_ENTRADA_ONBOARDING = 'hs_v2_date_entered_' + ETAPA_ONBOARDING;") > 0 &&
  robo.indexOf("propertyName: PROP_ENTRADA_ONBOARDING, operator: 'GTE'") > 0);
checar('robô: o corte é aplicado no FILTRO do HubSpot',
  robo.indexOf('value: String(inicioOnb)') > 0);
checar('robô: só os donos do time',
  robo.indexOf("propertyName: 'hubspot_owner_id', operator: 'IN', values: REPS.map(r => r.ownerId) },") > 0);
checar('robô: TODAS as propriedades vêm da API, não de uma lista escrita à mão',
  robo.indexOf('async function todasAsPropriedadesDeNegocio()') > 0 &&
  robo.indexOf("fetch('https://api.hubapi.com/crm/v3/properties/deals'") > 0);
checar('robô: as propriedades são pedidas em lotes (uma requisição gigante é recusada)',
  robo.indexOf('const LOTE = 120;') > 0);
checar('robô: só as propriedades PREENCHIDAS descem (nulo não vira snapshot)',
  robo.indexOf("if (v !== null && v !== undefined && String(v).trim() !== '') atual.properties[k] = v;") > 0);
checar('robô: o clone inteiro viaja no campo props',
  robo.indexOf('props: q') > 0);
checar('robô: a etapa NÃO entrou em OPEN_STAGES (não é degrau do funil aberto)',
  !/OPEN_STAGES = [[^]]*1396006163/.test(robo));
checar('robô: falhar o clone não derruba a rodada',
  robo.indexOf("console.error('Onboarding: não consegui clonar a etapa —', e.message);") > 0);
checar('robô: o corte desce no payload para a tela poder declarar a data',
  robo.indexOf('onboardingVisivel: {') > 0 && robo.indexOf('corte: CORTE_ONBOARDING_ISO') > 0);
checar('montar-dados: os dois papéis recebem onboardingVisivel',
  montar.indexOf('onboardingVisivel: hubspot.onboardingVisivel || null,') > 0 &&
  montar.indexOf('const onboardingVisivel = dados.onboardingVisivel || null;') > 0);

/* O COCKPIT NÃO ESCREVE PROPRIEDADE NESTA ETAPA. É a trava mais importante deste bloco:
   a etapa dispara automação de WhatsApp e cria card em outro pipe. A única escrita que
   pode existir é a da PASSAGEM (dealstage), e ela vai pela função compartilhada — que
   recebe {} de propriedades quando o destino é Onboarding, porque CAMPOS_POR_ETAPA não
   exige nada lá. O card não tem campo editável, e a coluna não é destino de gaveta. */
checar('template: a etapa Onboarding não exige propriedade nenhuma (nada a escrever)',
  template.indexOf("'" + ONB + "': [],") > 0);
checar('servidor: Onboarding continua destino permitido (a passagem é o que dispara)',
  servidor.indexOf(ONB) > 0);
checar('template: o card de Onboarding é espelho — nenhum campo editável',
  template.indexOf("esta coluna não edita nada") > 0);
checar('template: o registro rápido avisa o que a passagem dispara',
  template.indexOf('dispara a automação de WhatsApp e cria o card no pipe de Onboarding') > 0 ||
  (template.indexOf('automação de WhatsApp e cria o card no pipe de Onboarding') > 0 &&
   template.indexOf('Ao confirmar, o HubSpot') > 0));
checar('template: e avisa que o Cockpit grava só a etapa',
  template.indexOf('grava') > 0 && template.indexOf('só a etapa') > 0);
checar('template: Onboarding não pede próximo passo (o negócio saiu do funil de venda)',
  template.indexOf('const exigePasso = !paraOnb;') > 0);
checar('template: a coluna vazia declara o corte em vez de parecer defeito',
  template.indexOf('nada enviado para onboarding') > 0);

/* ── resultado ──────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('kanban e etapas: ' + ok + ' checagens ok — escada, porteira, motivo, isenções, corte e conversão batendo nos três arquivos.');
