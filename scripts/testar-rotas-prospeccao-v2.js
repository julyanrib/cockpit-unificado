/* ══════════════════════════════════════════════════════════════════════════════════════
   A ABA ROTAS & PROSPECÇÃO v2 — a mesa do diretor (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "todo clique tem que ir a algum lugar, tem que registrar, tudo no cockpit, sem
   abrir nada em hubspot ou algo escondido". E, sobre as fontes: "mantenha as três com o
   motivo".

   ══ O QUE ESTA SUITE PROTEGE, E DE ONDE VEIO CADA CHECAGEM ══════════════════════════
   Nenhuma linha aqui é preventiva: cada uma existe porque o defeito ACONTECEU nesta
   conversão, e a maioria só apareceu DIRIGINDO A TELA no preview do gestor — build verde
   e 34 suites verdes com o defeito dentro.

   1. rt7Disparar CHAMADA E NÃO DECLARADA. Troquei a tela e esqueci a função: o botão
      "buscar" ia estourar na mão do gestor. Achou a varredura de nomes, não a leitura.
   2. rt7CarregarRadar DECLARADA E NUNCA CHAMADA. O radar nunca carregaria, e a aba
      mostraria para sempre "o job de segunda ainda não gravou nenhuma praça".
   3. O JOIN DE PRAÇA COMPARAVA TEXTO INTEIRO. leads-referencia.json tem "Vila Velha/ES"
      e "Vitória/ES" mas "Rio de Janeiro", "São Paulo", "Porto Alegre" — inconsistente NO
      PRÓPRIO ARQUIVO. Casava 2 de 6, e a manchete dizia "Ninguém está nessa praça ainda"
      sobre São Paulo, que tem executivo. Pior: eu tinha escrito num comentário que os
      nomes eram iguais "de propósito".
   4. rt7HoraDoSync LIA UM CAMPO QUE NÃO EXISTE (`DATA.updatedAt`). O nome canônico é
      `hubspotUpdatedAtFmt`. A faixa preta dizia "HubSpot sem hora" com o dado carregado.
   5. LEAD SEM NOME PASSAVA COMO "novo ✓", marcado por padrão, pronto para virar visita
      obrigatória de alguém sem endereço de chegada.
   6. O BLOCO ANTIGO APARECIA COLADO EMBAIXO. A regra "para o gestor, #rotasAntigo não
      aparece" morava SÓ no ouvinte de #tabBtnRotas, e há três outros caminhos para a aba.
   7. O ENVIO DIZIA "✓ 2 leads" SEM GRAVAR. Update que casa zero linhas volta com
      sucesso — é assim que o Postgres responde quando a RLS não deixa a linha passar.
   8. A ABA RECALCULAVA O FUNIL POR CONTA, em vez de ler tl5Medir. A suite do gestor
      pegou essa, e ela tem razão: duas telas do mesmo gestor discordando do mesmo número
      é pior que uma tela só.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
/* O TEMPLATE SEM AS MINHAS NOTAS. Três vezes nesta semana uma guarda leu o comentário
   que documenta o conserto e reprovou o conserto. Comentário de bloco só: o de linha
   dupla-barra quase não existe nos scripts inline daqui, e tirar `//` mataria os `//`
   de dentro de URL. */
const codigo = tpl.replace(/\/\*[\s\S]*?\*\//g, ' ');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
function corpoDe(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let d = 0, j = i, viu = false;
  while (j < tpl.length) {
    const c = tpl[j];
    if (c === '{') { d++; viu = true; }
    else if (c === '}') { d--; if (viu && d === 0) return tpl.slice(i, j + 1); }
    j++;
  }
  return '';
}

/* ── 1 · NADA CHAMADO SEM EXISTIR, NADA EXISTINDO SEM SER CHAMADO ─────────────────── */
const declaradas = [...tpl.matchAll(/^(?:async )?function (rt7[A-Za-z0-9_]+)/gm)].map(m => m[1]);
const chamadas = [...tpl.matchAll(/\b(rt7[A-Za-z][A-Za-z0-9_]*)\s*\(/g)].map(m => m[1]);
const semDeclaracao = [...new Set(chamadas)].filter(n => declaradas.indexOf(n) < 0);
conferir('toda função rt7 chamada existe',
  semDeclaracao.length === 0,
  'chamada sem declaração: ' + semDeclaracao.join(', ') + ' — foi assim que o botão "buscar" ficou sem rt7Disparar');

const orfas = declaradas.filter(n => (tpl.match(new RegExp('\\b' + n + '\\b', 'g')) || []).length <= 1);
conferir('nenhuma função rt7 nasce órfã',
  orfas.length === 0,
  'órfã(s): ' + orfas.join(', ') + ' — rt7CarregarRadar ficou assim e o radar nunca carregaria');

conferir('rt7Iniciar carrega a fila E o radar',
  /rt7Carregar\(\), rt7CarregarRadar\(\)/.test(corpoDe('rt7Iniciar')),
  'sem a segunda leitura a aba mostra "o job de segunda ainda não gravou nenhuma praça" para sempre');

/* ── 2 · TODO CLIQUE COM DESTINO ──────────────────────────────────────────────────── */
const exec = corpoDe('rt7Executar');
const verbos = [...exec.matchAll(/verbo === '([a-z]+)'/g)].map(m => m[1]);
const literais = [...new Set([...tpl.matchAll(/data-rt7-acao="([a-z]+)"/g)].map(m => m[1]))];
const mortos = literais.filter(l => verbos.indexOf(l) < 0);
conferir('nenhuma ação do markup fica sem ramo',
  mortos.length === 0,
  'clique morto: ' + mortos.join(', '));

/* os verbos que a lista emite por variável, conferidos um a um contra o que rt7Dados monta */
['praca', 'fonte', 'fonteoff', 'marcar', 'sujo', 'exec', 'carteira', 'noticia'].forEach(v => {
  conferir('o verbo "' + v + '" é emitido e tratado',
    verbos.indexOf(v) > -1 && new RegExp("'" + v + ":'").test(tpl),
    'verbo tratado que ninguém emite é ramo morto; emitido e não tratado é clique morto');
});

conferir('o botão desabilitado de enviar TAMBÉM responde, dizendo o que falta',
  verbos.indexOf('enviarbloq') > -1 && /enviarbloq/.test(tpl),
  'botão cinza que não diz nada é clique morto com aparência de proibição');

conferir('o cartão descartado explica por que está apagado',
  /verbo === 'sujo'/.test(exec) && /já está no CRM/.test(exec) && /sem telefone válido/.test(exec),
  'é a única linha da lista que não muda estado — então ela tem que responder a pergunta');

conferir('o clique na carteira leva a pessoa para o passo 2 E rola até lá',
  /_rolarPara = 'rt7Passo2'/.test(exec) && /id="rt7Passo2"/.test(tpl),
  'selecionar fora da tela é indistinguível de clique morto');

conferir('e a rolagem acontece DEPOIS do render',
  exec.indexOf('renderRotasProspeccao();') < exec.lastIndexOf('_rolarPara'),
  'o nó do passo 2 é recriado a cada desenho; rolar antes aterrissa onde ele estava');

/* ── 3 · AS TRÊS FONTES, COM O MOTIVO (decisão do Julyan, 06/09 e 09/09) ──────────── */
conferir('as três fontes continuam na tela, e as apagadas dizem por quê',
  /const RT7_FONTES = \[/.test(tpl) &&
  /id: 'casa_dos_dados'[\s\S]{0,60}ativa: true/.test(tpl) &&
  /id: 'google_places'[\s\S]{0,40}ativa: false[\s\S]{0,200}GOOGLE_PLACES_API_KEY/.test(tpl) &&
  /id: 'tripadvisor'[\s\S]{0,40}ativa: false[\s\S]{0,200}ToS proíbe/.test(tpl),
  'mostrar as três com o motivo é decisão dele; esconder as que não funcionam é o que ele recusou');

conferir('fonte apagada nunca dispara busca',
  /if \(!fonte\.ativa\) \{ s\.toast = fonte\.rot \+ ': ' \+ fonte\.porque; return; \}/.test(corpoDe('rt7Disparar')),
  'chip apagado que dispara gasta consulta paga e devolve erro');

conferir('escolher a fonte NÃO dispara a busca — são dois cliques',
  !/verbo === 'fonte'[\s\S]{0,120}rt7Disparar/.test(exec),
  'cada rodada da Casa dos Dados é consulta paga: clique de "escolher" que gasta é clique que não se desfaz');

/* ── 4 · O NÚMERO NUNCA MENTE ─────────────────────────────────────────────────────── */
const dados = corpoDe('rt7Dados');
conferir('TAM não medido não vira zero na tela',
  /medido \? Number\(r\.tam\)\.toLocaleString\('pt-BR'\) : 'não medido'/.test(dados),
  'TAM zero numa cidade com restaurantes faz a tela dizer "0% tocado"');

conferir('o percentual só existe com denominador contado',
  /const pct = r\.pct_tocado == null \? null : Number\(r\.pct_tocado\)/.test(dados) &&
  /pct == null \? '—'/.test(dados),
  'percentual sobre TAM não medido parece cobertura e não é');

conferir('o rótulo de território também espera o denominador',
  /const st = !medido \? 'não medido'/.test(dados),
  '"território virgem" sobre TAM não medido manda o time para a rua por um número que não existe');

/* A checagem procurava `clientes: null` NO TEMPLATE. Aquele literal é do COLETOR
   (scripts/radar-semanal.js): a tela só lê o que a linha do radar trouxe. Cobrar do
   template o que é do job é cobrar no lugar errado — e reprovava código correto. */
conferir('clientes fica "não medido" — não existe base de clientes no cockpit',
  /r\.clientes == null \? 'não medido'/.test(dados),
  'o mais perto de cliente no snapshot é Enviado Onboarding, com 6 no Brasil inteiro: escrever 6 numa praça é inventar');

conferir('a barra da praça não usa o percentual cru',
  /largura: Math\.round/.test(dados) && /maiorToc/.test(dados),
  '0,09% de barra é zero pixel, e barra vazia ao lado de "67 no CRM" parece defeito da tela');

/* NO CÓDIGO QUE RODA, não na minha prosa: o comentário que documenta este conserto cita
   DATA.updatedAt, e a primeira versão desta checagem reprovava por causa da nota que a
   explica. Quarta vez nesta semana que uma guarda mede o meu texto. */
conferir('a hora do sync sai do campo que existe',
  /hubspotUpdatedAtFmt/.test(corpoDe('rt7HoraDoSync')) && !/DATA\.updatedAt\b/.test(codigo),
  'eu li DATA.updatedAt, que não existe no front, e a faixa preta dizia "HubSpot sem hora" com o dado carregado');

/* ── 5 · A PRAÇA CASA POR MUNICÍPIO ───────────────────────────────────────────────── */
conferir('o casamento de praça é por município, não pelo texto inteiro',
  /function rt7MunicipioDaPraca\(nome\)/.test(tpl) &&
  /const k = p \? rt7MunicipioDaPraca\(p\.nome\) : ''/.test(tpl),
  'leads-referencia.json tem "Vila Velha/ES" e "Rio de Janeiro" no mesmo arquivo: comparar o texto casava 2 de 6');

conferir('e a seleção visual da praça também',
  /rt7MunicipioDaPraca\(r\.praca\) === rt7MunicipioDaPraca\(pracaSel\)/.test(dados),
  'clicar na carteira punha "Rio de Janeiro" e nenhum cartão acendia, porque eles se chamam "Rio de Janeiro/RJ"');

conferir('quem não tem rota declarada aparece com nome na tela',
  /function rt7SemPraca\(\)/.test(tpl) && /sem rota declarada em data\/territorios\.json/.test(tpl),
  'em 09/09 eram quatro dos onze; depois das rotas do Julyan sobrou o Bruno. Quem não tem rota NÃO recebe carga, e calar sobre isso é o defeito');

/* ESTA CHECAGEM NASCEU DO CONSERTO ANTERIOR. Passei a declaração para
   data/territorios.json e as cinco cidades da Renata mais a metade de Guarulhos do
   Sérgio ficaram com rota e SEM linha no radar — então simplesmente não apareciam no
   bloco 1. Ausência é o mesmo silêncio que deixou quatro executivos invisíveis. */
conferir('praça com rota e sem linha no radar aparece dizendo isso',
  /pracasSemRadar/.test(tpl) && /ainda SEM linha no radar/.test(tpl),
  'rota que o radar não mediu não aparece no bloco 1 e não recebe carga — e some da tela sem avisar');

/* ── 6 · O ANTI-SUJEIRA ───────────────────────────────────────────────────────────── */
const sujeira = corpoDe('rt7Sujeira');
conferir('lead sem nome não é lead limpo',
  /if \(!rt7ChaveNome\(l\.nome\)\)/.test(sujeira) && /'sem nome'/.test(sujeira),
  'passava como "novo ✓" e marcado por padrão: visita obrigatória sem endereço de chegada');

conferir('o veredito do servidor é LIDO, não redecidido aqui',
  /l\.ja_existe_hubspot \|\| achado/.test(sujeira),
  'o dedupe contra o CRM inteiro roda em api/importar-leads.js; a tela explica, não julga de novo');

conferir('o índice do CRM lê os campos que o negócio TEM',
  /rt7ChaveNome\(l\.name \|\| l\.dealname\)/.test(tpl),
  'o negócio do snapshot tem name e dealname, e NÃO tem nome — medido em 09/09');

conferir('"perdido" só ganha prazo quando a data existe',
  /dias == null \? 'perdido' : 'perdido há '/.test(sujeira),
  'escrever "< 90d" sem saber quando é a mesma família de erro do "não medido = 0"');

conferir('e o dono do negócio que já existe aparece — ou nada aparece',
  /dono: achado \? achado\.dono : null/.test(sujeira),
  'inventar dono é pior que não ter: o gestor decidiria território olhando o nome errado');

conferir('descartado não é selecionável',
  /cursor: 'default'/.test(dados) && /on: 'sujo:' \+ j\.tipo/.test(dados),
  'checkbox em linha descartada é convite a mandar sujeira para a carteira de alguém');

/* ── 7 · O TETO DA CARTEIRA ───────────────────────────────────────────────────────── */
const enviar = corpoDe('rt7Enviar');
conferir('o teto de 75% é checado DENTRO do envio, não só no botão',
  /c\.ativas \/ c\.cap >= RT7_TETO/.test(enviar) && /bloqueado: a carteira de/.test(enviar),
  'botão desabilitado é aparência; a regra de não sujar carteira vale por qualquer caminho');

conferir('o envio confirma antes — ele muda o trabalho de outra pessoa',
  /confirm\(/.test(enviar) && /nada foi enviado/.test(enviar),
  'é a única ação desta tela que cria visita obrigatória na semana de alguém');

conferir('a carteira ativa lê o MOTOR, e não varre o funil por conta',
  /function rt7Carteira\(ownerId, medicao\)/.test(tpl) &&
  /const m = medicao \|\| tl5Medir\(\)/.test(tpl) &&
  !/RT7_ETAPAS_ABERTAS/.test(tpl),
  'duas telas do mesmo gestor discordando do mesmo número é pior que uma tela só');

conferir('e o motor é medido UMA vez por render',
  (dados.match(/tl5Medir\(\)/g) || []).length === 1 && /rt7Carteira\(u\.ownerId, medicao\)/.test(dados),
  'tl5Medir varre o funil inteiro: dentro do laço das carteiras são 11 varreduras por desenho');

conferir('conta aberta sem data de interação é dita, não somada',
  /semMedida > 0 \? ' · ' \+ c\.semMedida \+ ' aberta\(s\) sem data de interação, fora desta conta'/.test(dados),
  'sem essa frase o "espaço até o teto" parece exato quando não é');

/* ── 8 · A ESCRITA CONTA O QUE VOLTOU ─────────────────────────────────────────────── */
conferir('o envio conta as linhas gravadas, não o silêncio do banco',
  /\.select\('id'\)/.test(enviar) && /if \(n === 0\)/.test(enviar) &&
  /nada foi gravado: o banco aceitou o pedido e não mudou nenhuma linha/.test(enviar),
  'update que casa zero volta com sucesso — foi assim que dois botões de apagar deste produto mentiram por meses');

conferir('escrita parcial é dita, e o "✓" não a apaga',
  /atenção: pedi/.test(enviar) && /s\.toast\.indexOf\('atenção:'\) !== 0/.test(enviar),
  'dizer 12 quando o banco mudou 9 é o número que ninguém confere');

conferir('e só as linhas confirmadas mudam de estado na tela',
  /const confirmadas =/.test(enviar) && /confirmadas\.indexOf\(String\(l\.id\)\) >= 0/.test(enviar),
  'marcar as 12 esconde as 3 que continuam sem dono e precisam ficar na fila');

/* ── 9 · O QUE NÃO SE TOCA ────────────────────────────────────────────────────────── */
conferir('nada é escrito no HubSpot por esta aba',
  !/hubapi\.com/.test(enviar) && !/hubapi\.com/.test(corpoDe('rt7Disparar')) &&
  !/criar-negocio/.test(enviar),
  'somos espelho do CRM: a aba põe dono em leads_prospeccao, e quem materializa negócio é api/criar-empresa-prospeccao.js quando alguém confirma');

conferir('a aba desenha só para o gestor',
  /role !== 'manager'/.test(corpoDe('renderRotasProspeccao')) &&
  /role !== 'manager'/.test(corpoDe('rt7Iniciar')),
  'TAM, carteira do time e radar são leitura de gestor');

conferir('e o bloco antigo do executivo some por QUALQUER caminho para a aba',
  /getElementById\('rotasAntigo'\)/.test(corpoDe('renderRotasProspeccao')),
  'a regra morava só no ouvinte do botão, e há três outros caminhos para viewRotas — 222px de tela de outra pessoa colados embaixo');

/* ── 10 · AS NOTÍCIAS ─────────────────────────────────────────────────────────────── */
conferir('a manchete mostra a nota E o motivo dela',
  /n\.motivo/.test(tpl) && /relevancia_motivo/.test(tpl),
  'nota sem procedência num cockpit onde todo número diz de onde vem é o número que ninguém acredita');

conferir('o link abre a matéria no veículo, com noopener, e só se for http',
  /\^https\?:\\\/\\\//.test(exec) && /'noopener,noreferrer'/.test(exec),
  'guardamos manchete e link, nunca o texto: ler é ir na fonte, e a Abrasel autoriza o índice de busca, não a coleta');

conferir('e a tela diz por que o link sai daqui',
  /é o único link para fora desta tela/.test(tpl) && /proíbe coleta automatizada no robots\.txt/.test(tpl),
  'link para fora sem explicação, numa tela cuja regra é "tudo no cockpit", parece descuido');

conferir('as duas tabelas do radar são só LIDAS pela tela',
  /from\('radar_pracas'\)[\s\S]{0,200}\.select\(/.test(tpl) &&
  /from\('noticias_setor'\)[\s\S]{0,200}\.select\(/.test(tpl) &&
  !/from\('radar_pracas'\)[\s\S]{0,200}\.(insert|update|delete)\(/.test(tpl) &&
  !/from\('noticias_setor'\)[\s\S]{0,200}\.(insert|update|delete)\(/.test(tpl),
  'as duas têm RLS com SELECT para authenticated e ZERO política de escrita, de propósito: só o job escreve');

conferir('a semana mostrada é a mais recente que EXISTE, não a de hoje',
  /const semana = \(pr && pr\.length\) \? pr\[0\]\.data_semana : null/.test(tpl),
  'se o job de segunda falhar, mostrar em branco pareceria que a praça não tem mercado');

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('rotas & prospecção v2: ' + ok + ' checagens ok — todo clique com destino, as três'
  + ' fontes com o motivo, TAM não medido não vira zero, e a escrita conta o que voltou.');
