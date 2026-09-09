/* ══════════════════════════════════════════════════════════════════════════════════════
   DESFAZER O NEGÓCIO CRIADO POR ENGANO — A TRAVA (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "se eu coloquei sem querer o lead em prospecção no planejamento e retirei, ele
   tem que sair do funil, tem que ter uma trava, ele tem q confirmar, algo do tipo".

   ══ O QUE FOI MEDIDO ANTES DE ESCREVER A ROTA ══════════════════════════════════════
   Dez linhas de `leads_prospeccao` têm `hubspot_deal_id` — dez negócios que nasceram de um
   clique no Planejamento. O primeiro da lista é o do print dele: negócio 64905141165, "RSM
   ENCOMENDAS DE PAES ARTESANAIS", criado às 22:55 de 09/09, em Prospecção, sem valor e sem
   nenhuma atividade (conferido no CRM). O cartão saía do plano e o negócio ficava no funil
   para sempre.

   ══ POR QUE ESTA SUÍTE É MAIS DURA QUE AS OUTRAS ═══════════════════════════════════
   Esta é a única rota do produto que APAGA algo no HubSpot. Ela arquiva — lixeira,
   restaurável por 90 dias —, e ainda assim é a operação mais destrutiva que existe aqui.
   Cada uma das quatro travas do servidor tem uma checagem nesta suíte, porque perder uma
   delas não dá erro: dá um negócio arquivado que ninguém pediu para arquivar.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const rotaPath = path.join(raiz, 'api', 'desfazer-negocio.js');
const rota = fs.existsSync(rotaPath) ? fs.readFileSync(rotaPath, 'utf8') : '';
/* sem os comentários: seis vezes neste projeto uma guarda minha leu a nota que documenta
   o conserto e reprovou o conserto */
const semCom = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const codigo = semCom(tpl);
const rotaCod = semCom(rota);

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
function corpoDe(fonte, nome) {
  const i = fonte.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let d = 0, j = i, viu = false;
  while (j < fonte.length) {
    const c = fonte[j];
    if (c === '{') { d++; viu = true; }
    else if (c === '}') { d--; if (viu && d === 0) return fonte.slice(i, j + 1); }
    j++;
  }
  return '';
}

/* ── 1 · A ROTA EXISTE E É POST AUTENTICADO ──────────────────────────────────────── */
conferir('a rota de desfazer existe',
  rota.length > 1000,
  'o template chama /api/desfazer-negocio; sem o arquivo o botão da trava responde 404');

conferir('só POST, e só com sessão do Supabase',
  /req\.method !== 'POST'/.test(rotaCod) && /auth\/v1\/user/.test(rotaCod)
    && /Sem sessão/.test(rota),
  'rota que arquiva negócio sem checar sessão é a porta aberta mais óbvia do produto');

conferir('e quem não é gestor só desfaz o que é dele',
  /usuario\.role !== 'manager'\s*\n?\s*&& String\(linha\.responsavel_owner_id \|\| ''\) !== String\(usuario\.ownerId \|\| ''\)/.test(rotaCod),
  'quem não é dono não sabe o que está desfazendo');

/* ── 2 · AS QUATRO TRAVAS DO SERVIDOR ────────────────────────────────────────────── */
conferir('trava 1: o negócio tem de ter nascido AQUI',
  /String\(linha\.hubspot_deal_id \|\| ''\) !== String\(dealId\)/.test(rotaCod)
    && /nao-nasceu-aqui/.test(rotaCod),
  'sem a amarra do hubspot_deal_id esta rota vira um jeito de apagar qualquer negócio do'
  + ' pipeline a partir do navegador');

conferir('trava 2: ainda em Prospecção, no pipeline de Field Sales',
  /const ETAPA_PROSPECCAO = '1395880469';/.test(rotaCod)
    && /String\(props\.dealstage \|\| ''\) !== ETAPA_PROSPECCAO/.test(rotaCod)
    && /String\(props\.pipeline \|\| ''\) !== PIPELINE_FIELD_SALES/.test(rotaCod),
  'negócio que avançou de etapa é trabalho feito, e trabalho feito não se desfaz por um ✕'
  + ' de planejamento');

/* AS DUAS CHECAGENS ABAIXO NASCERAM CEGAS, e a sabotagem foi quem contou: eu media que a
   EXPRESSÃO existia (`dinheiro`, `ATIVIDADES`) e que o motivo estava escrito — e as duas
   coisas sobrevivem a `if (false)`. Trocar o `if` por `false` apagava a trava com as duas
   guardas verdes. Agora o que está pinado é o RAMO que recusa. */
conferir('trava 3: sem valor e sem mensalidade',
  /Number\(props\.amount \|\| 0\) \+ Number\(props\.mrr \|\| 0\) \+ Number\(props\.valor_de_mrr \|\| 0\)/.test(rotaCod)
    && /if \(dinheiro > 0\) \{[\s\S]{0,320}tem-valor/.test(rotaCod),
  'valor preenchido é alguém negociando — e amount e mrr são o que o RPA lê para gerar o'
  + ' link de pagamento');

conferir('trava 4: sem nota, tarefa, ligação, reunião ou e-mail',
  /const ATIVIDADES = \['notes', 'tasks', 'calls', 'meetings', 'emails'\];/.test(rotaCod)
    && /associations=' \+ ATIVIDADES\.join\(','\)/.test(rotaCod)
    && /if \(comAtividade\.length\) \{[\s\S]{0,400}tem-atividade/.test(rotaCod),
  'uma nota é uma conversa que aconteceu; arquivar levaria o registro dela');

conferir('e a recusa vem com motivo, não com "não deu"',
  (rota.match(/motivo: '/g) || []).length >= 4,
  '"não deu" sem dizer por que é o que faz a pessoa tentar de novo até conseguir');

/* ── 3 · ARQUIVA, NÃO APAGA ──────────────────────────────────────────────────────── */
conferir('arquiva pelo DELETE da v3 (lixeira, restaurável por 90 dias)',
  /method: 'DELETE'/.test(rotaCod) && /crm\/v3\/objects\/deals\//.test(rotaCod),
  'desfazer tem de ter volta; apagar em definitivo não é desfazer');

conferir('404 do HubSpot não é erro para quem clicou',
  /if \(r\.status === 404\) \{/.test(rotaCod) && /jaNaoExistia: true/.test(rotaCod),
  'negócio já arquivado antes é o resultado que ele queria — reclamar disso faria ele'
  + ' procurar defeito onde já está resolvido');

conferir('e a fila é limpa para a conta poder ser criada de novo',
  /hubspot_deal_id: null/.test(rotaCod) && /Prefer: 'return=representation'/.test(rotaCod)
    && /filaLimpa/.test(rotaCod),
  'sem limpar a marca a conta fica "já criada" para sempre, sem botão de criar; e sem o'
  + ' return=representation o PATCH que muda zero linhas volta com sucesso');

/* ── 4 · O ✕ DA TELA ─────────────────────────────────────────────────────────────── */
const nascido = corpoDe(codigo, 'pl6NegocioNascidoAqui');

conferir('a tela sabe dizer se o negócio nasceu no Planejamento',
  nascido.length > 200
    && /id\.indexOf\('n-'\) === 0/.test(nascido) && /id\.indexOf\('c-'\) === 0/.test(nascido),
  'o slot chega como "n-<uuid>" ou "c-<dealId>" e os dois apontam para a mesma conta —'
  + ' olhar um lado só faria o desfazer funcionar na metade dos casos');

conferir('e devolve null quando não há o que desfazer',
  /if \(!lead \|\| !lead\.hubspot_deal_id\) return null;/.test(nascido),
  'cartão da carteira que veio do robô não tem o que desfazer, e o ✕ dele tem de'
  + ' continuar sendo um clique só');

conferir('o ✕ abre a trava só quando há negócio nascido aqui',
  /const nascido = \(typeof pl6NegocioNascidoAqui === 'function'\) \? pl6NegocioNascidoAqui\(era\) : null;/.test(codigo)
    && /if \(nascido && typeof abrirModalConfirmacao === 'function'\) \{/.test(codigo),
  'trava em todo ✕ transforma o gesto mais comum da tela em duas perguntas');

/* TAMBÉM NASCEU CEGA: eu media o id do botão e a frase dele, e as duas sobrevivem a um
   `display:none` no próprio botão — a saída ficava invisível com a guarda verde. Agora
   mede as três coisas que fazem a saída EXISTIR: o botão, o ouvinte dele, e o fato de
   ele limpar o slot. E que o style não o esconda. */
conferir('a trava oferece as duas saídas, e a de sair só do plano é a de antes',
  /id="pl6SoDoPlano"/.test(codigo)
    && !/id="pl6SoDoPlano"[\s\S]{0,200}display:none/.test(codigo)
    && /so\.addEventListener\('click', async function \(\) \{[\s\S]{0,400}g3\[di\]\[si\] = null;/.test(codigo)
    && /o negócio continua no funil, em Prospecção/.test(codigo),
  'trava que só oferece o gesto novo obriga a escolher entre confirmar o que ele não quer'
  + ' e desistir do que queria');

conferir('recusa do servidor NÃO tira o cartão do plano',
  /if \(!r\.ok\) \{[\s\S]{0,400}ok\.disabled = false;[\s\S]{0,120}return;/.test(codigo),
  'se o negócio continua no funil, o cartão continua no dia: tirar o cartão esconderia da'
  + ' tela dele um negócio que existe e é dele');

conferir('e o texto diz que a lixeira tem volta',
  /restaurável por 90 dias/.test(tpl),
  'ele precisa saber que o gesto é reversível ANTES de confirmar — é o que separa desfazer'
  + ' de destruir');

/* ── 5 · TODA ROTA QUE A TELA CHAMA EXISTE ───────────────────────────────────────── */
/* Esta é barata e cobre uma família inteira: o template chamando /api/x que ninguém
   escreveu responde 404, e a tela mostra "erro de rede" — a mensagem que manda procurar
   defeito no lugar errado. */
const rotasChamadas = [...new Set([...codigo.matchAll(/fetch\('\/api\/([a-z0-9-]+)'/g)].map(m => m[1]))];
const semArquivo = rotasChamadas.filter(r => !fs.existsSync(path.join(raiz, 'api', r + '.js')));
conferir('toda rota /api que a tela chama existe como arquivo',
  rotasChamadas.length > 3 && semArquivo.length === 0,
  'sem arquivo: ' + semArquivo.join(', ') + ' — 404 chega na tela como "erro de rede"');

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('desfazer negócio: ' + ok + ' checagens ok — a trava pergunta, o servidor'
  + ' recusa explicando, e o que ele arquiva tem volta (' + rotasChamadas.length
  + ' rotas /api conferidas).');
