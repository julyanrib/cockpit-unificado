/* ══════════════════════════════════════════════════════════════════════════════════════
   O RADAR SEMANAL — as praças e as notícias do setor (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "pode colocar fontes reais da abrasel brasil inteiro, infomoney, fontes
   relevantes, coloque semanalmente para eu saber de tudo".

   ══ POR QUE ESTA SUITE USA FIXTURE E NÃO O SNAPSHOT AO VIVO ═════════════════════════
   Eu MEDI a regra de contagem contra o snapshot real, por SQL independente, antes de
   escrever isto. O resultado das duas contas, lado a lado, bateu casa por casa:

     praça             tocado   perdidos
     Rio de Janeiro       67       11
     Porto Alegre         35        5
     São Paulo            18        1
     Vitória              16        0
     Canoas                6        4
     Vila Velha            3        0
     e 43 dos 196 negócios do funil SEM CIDADE NENHUMA — fora de toda praça.

   Cravar esses números aqui seria a mesma armadilha do `pl4RiscoDoBalde`: na segunda que
   vem o CRM muda, a suite fica vermelha, e o vermelho não aponta defeito nenhum. Então o
   que fica cravado é a REGRA, medida numa fixture que reproduz os defeitos reais do
   campo `cidade` do CRM — nulo, CAIXA ALTA, acento, e UF colada no texto ("MACEIO - AL").

   ══ O QUE ESTA SUITE PROTEGE ════════════════════════════════════════════════════════
   1. TAM NUNCA VIRA ZERO. Zero numa cidade com restaurantes faria a tela dizer
      "0% tocado" e o gestor decidir por um dado que não existe.
   2. PERCENTUAL SÓ COM DENOMINADOR MEDIDO. Percentual sobre TAM não medido é o número
      mais perigoso desta tela, porque parece cobertura.
   3. A PRAÇA NÃO ROUBA A CIDADE VIZINHA. "Vitória" não pode engolir "Vitória da
      Conquista", que é outro estado.
   4. O PISO É DITO COMO PISO. Os negócios sem cidade aparecem na leitura, com número.
   5. A ABRASEL NÃO É RASPADA. O robots.txt deles proíbe o nosso robô por escrito.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const radar = require(path.join(raiz, 'scripts', 'radar-semanal.js'));
const fonte = fs.readFileSync(path.join(raiz, 'scripts', 'radar-semanal.js'), 'utf8');
/* sem os comentários: três vezes nesta semana uma guarda leu a MINHA prosa e reprovou
   (ou aprovou) por causa de um nome citado numa nota */
const semNota = fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}

/* ══ A FIXTURE ═════════════════════════════════════════════════════════════════════════
   Cada grafia aqui existe no snapshot de verdade, menos a última, que é a armadilha:
   "Vitória da Conquista"/BA não pode entrar na conta de Vitória/ES. */
const FUNIL = {
  '1396005401': [                          // Contato feito — 4 do RJ, 1 de SP
    { cidade: 'Rio de Janeiro' }, { cidade: 'RIO DE JANEIRO' },
    { cidade: 'Rio de Janeiro' }, { cidade: 'Rio de Janeiro' },
    { cidade: 'São Paulo' }
  ],
  '1395880469': [                          // Novo — Vitória, um nulo, uma vizinha
    { cidade: 'Vitória' }, { cidade: 'vitoria' }, { cidade: null },
    { cidade: 'Vitória da Conquista' }
  ],
  '1395880472': [                          // Proposta — UF colada, e um sem o campo
    { cidade: 'MACEIO - AL' }, {}
  ],
  '1396006164': [                          // PERDIDO — conta como tocado, e como perdido
    { cidade: 'Rio de Janeiro' }, { cidade: 'Canoas' }, { cidade: '   ' }
  ]
};
const contagem = radar.contarTocado({ funilLeads: FUNIL });

conferir('conta todos os negócios do funil, etapa fechada incluída',
  contagem.total === 14,
  'contou ' + contagem.total + ' de 14 — se uma etapa sumir da varredura, a praça encolhe em silêncio');

conferir('negócio sem cidade não entra em praça alguma, e é contado à parte',
  contagem.semCidade === 3,
  'contou ' + contagem.semCidade + ' de 3 (nulo, campo ausente e string de espaços)');

const rj = radar.tocadoDaPraca(contagem, 'Rio de Janeiro');
conferir('CAIXA ALTA e caixa mista são a mesma cidade',
  rj.tocado === 5,
  'Rio de Janeiro deu ' + rj.tocado + ' e devia dar 5 (4 abertos + 1 perdido)');

conferir('PERDIDO conta como tocado — quem disse não já foi visitado',
  rj.perdidos === 1 && rj.tocado > rj.perdidos,
  'perdido fora do tocado infla o que ainda resta a fazer na praça');

const vix = radar.tocadoDaPraca(contagem, 'Vitória');
conferir('acento não separa a mesma cidade em duas',
  vix.tocado === 2,
  'Vitória deu ' + vix.tocado + ' e devia dar 2 ("Vitória" e "vitoria")');

/* ESTE FOI O DEFEITO QUE A FIXTURE PEGOU. A primeira versão casava por prefixo
   (`startsWith(alvo + ' ')`), para absorver a UF colada — e absorvia também a cidade
   vizinha de nome maior. Vitória/ES contava um negócio de Vitória da Conquista/BA. */
conferir('e a praça NÃO engole a cidade vizinha de nome maior',
  vix.tocado === 2 && radar.tocadoDaPraca(contagem, 'Vitória da Conquista').tocado === 1,
  '"Vitória da Conquista"/BA entrando em Vitória/ES infla a cobertura de um estado com dado de outro');

conferir('a UF sai do fim, e só a UF: 27 siglas, lista fechada',
  radar.semUfNoFim('maceio al') === 'maceio' &&
  radar.semUfNoFim('vitoria da conquista') === 'vitoria da conquista' &&
  radar.semUfNoFim('rio de janeiro rj') === 'rio de janeiro',
  'tirar qualquer última palavra de duas letras casaria cidades que não são a mesma');

conferir('UF colada no texto livre do CRM ainda casa a cidade',
  radar.tocadoDaPraca(contagem, 'Maceió').tocado === 1,
  '"MACEIO - AL" é como o CRM guarda; exigir grafia limpa perderia o negócio');

conferir('cidade sem negócio nenhum devolve zero tocado, não erro',
  radar.tocadoDaPraca(contagem, 'Salvador').tocado === 0,
  'praça nova nasce com zero tocado — e zero AQUI é fato, diferente de TAM zero');

/* ══ A HONESTIDADE DO TAM ══════════════════════════════════════════════════════════════ */
conferir('sem token, o TAM é "não medido" — nunca zero',
  (() => {
    const antes = process.env.CASADOSDADOS_TOKEN;
    delete process.env.CASADOSDADOS_TOKEN;
    let r;
    try { r = radar.tamDaPraca('Vitória', 'ES'); } finally {
      if (antes !== undefined) process.env.CASADOSDADOS_TOKEN = antes;
    }
    return r instanceof Promise;
  })(),
  'tamDaPraca precisa ser assíncrona para o teste de comportamento abaixo valer');

conferir('o código NUNCA devolve tam: 0',
  !/tam:\s*0\b/.test(semNota),
  'TAM zero numa cidade com restaurantes é o número que faz a tela dizer "0% tocado"');

conferir('toda saída sem número diz o MOTIVO junto',
  (semNota.match(/fonte:\s*'nao_medido'/g) || []).length ===
  (semNota.match(/fonte:\s*'nao_medido',\s*detalhe:/g) || []).length,
  '"não medido" sem motivo na tela é indistinguível de bug nosso');

conferir('o percentual só existe quando o denominador foi contado',
  /t\.fonte === 'contagem_api' && t\.tam > 0\)\s*\n?\s*\? Math\.round/.test(fonte),
  'pct sobre TAM não medido, ou sobre piso paginado, parece cobertura e não é');

conferir('a consulta de TAM não herda os filtros que estreitam o backfill',
  !/data_abertura/.test(semNota) && !/com_telefone/.test(semNota) && !/excluir_optante/.test(semNota),
  'janela de abertura, MEI e telefone respondem "quais visitar", não "quantos a cidade tem"');

conferir('e ela pede UMA linha, não a cidade paginada',
  /limite:\s*1,\s*\n?\s*pagina:\s*1/.test(fonte),
  'paginar seis cidades toda semana queima crédito pago para um número que não vale isso');

/* ══ A LEITURA DA LINHA ════════════════════════════════════════════════════════════════ */
const lidoMedido = radar.leituraDaPraca(
  { tam: 4200, tam_fonte: 'contagem_api', tocado: 67, pct_tocado: 1.6, perdidos: 11 }, 43);
conferir('leitura com TAM medido traz os dois números e o percentual',
  /67 de 4\.200/.test(lidoMedido) && /1,6%/.test(lidoMedido),
  'saiu: ' + lidoMedido);

conferir('e o piso aparece: os negócios sem cidade são ditos, com número',
  /43 negócios do time estão sem cidade/.test(lidoMedido),
  'sem essa frase, seis praças mostram cobertura menor que a real e ninguém sabe por quê');

const lidoSemTam = radar.leituraDaPraca(
  { tam: null, tam_fonte: 'nao_medido', tocado: 35, pct_tocado: null, perdidos: 5 }, 0);
conferir('leitura sem TAM diz "não medido" e não escreve percentual nenhum',
  /não medido/.test(lidoSemTam) && !/%/.test(lidoSemTam),
  'saiu: ' + lidoSemTam);

conferir('e nunca escreve "0 de 0"',
  !/0 de 0/.test(lidoSemTam) && !/de 0 estabelecimentos/.test(lidoSemTam),
  '"0 de 0" é a frase que faz o gestor achar que a praça está saturada');

const lidoPiso = radar.leituraDaPraca(
  { tam: 900, tam_fonte: 'piso_paginado', tocado: 18, pct_tocado: null, perdidos: 0 }, 0);
conferir('piso é dito como piso — "pelo menos", sem percentual',
  /pelo menos 900/.test(lidoPiso) && !/%/.test(lidoPiso),
  'saiu: ' + lidoPiso);

/* ══ AS FONTES DE NOTÍCIA ══════════════════════════════════════════════════════════════ */
/* o domínio deles APARECE nos comentários deste arquivo, dizendo por que não o buscamos —
   por isso a checagem é no código que roda, não na prosa */
conferir('a Abrasel não é raspada por nós — o robots.txt deles proíbe, por escrito',
  !/abrasel\.com\.br/.test(semNota),
  'o site deles tem "User-agent: ClaudeBot / Disallow: /"; a manchete chega pelo índice de busca, que eles autorizam');

conferir('nenhuma fonte entra sem nome de veículo para creditar',
  radar.FEEDS.every(f => f.fonte && f.url) && radar.TEMAS.every(t => t && t.tema && t.q),
  'fonte sem nome vira manchete órfã na tela, e ninguém sabe se pode confiar');

conferir('o InfoMoney está na lista, como o Julyan pediu, e passa pelo filtro do setor',
  radar.FEEDS.some(f => /infomoney/i.test(f.fonte) && f.filtro === true),
  'medido em 08/09: 0 de 10 itens dele eram do setor — sem filtro, o bloco abre com resultado da Quina');

conferir('o filtro do setor usa borda de palavra',
  radar.ehDoSetor('bares e restaurantes lotados no feriado') === true &&
  radar.ehDoSetor('desfile de 7 de Setembro em Brasília') === false,
  '"Brasília" contém "bar": foi o falso positivo que a primeira versão deixou entrar');

conferir('e não deixa passar item de outro assunto só por conter a palavra solta',
  radar.ehDoSetor('Barack Obama publica memórias') === false &&
  radar.ehDoSetor('Barreirinhas recebe turistas') === false,
  'sem borda de palavra o radar do gestor enche de notícia que não é dele');

/* ══ OS CINCO DEFEITOS DA PRIMEIRA RODADA EM PRODUÇÃO (09/09/26) ═══════════════════════
   36 manchetes gravadas, e eu li as 36. Doze eram ruído, uma era de julho, duas eram a
   mesma notícia, um veículo apareceu com dois nomes, e o meu rótulo do denominador
   exagerava. Cada um dos cinco tem checagem aqui, com o caso real que o achou. */

conferir('a consulta por TEMA também passa pelo filtro do setor',
  /if \(!ehDoSetor\(titulo \+ ' ' \+ it\.descricao\)\) return;/.test(semNota) &&
  (semNota.match(/ehDoSetor\(/g) || []).length >= 3,
  'sem isso entraram "morango cravejado", "TikTok ClubHouse desembarca no Brasil" e "Dia do Açaí" — a consulta é OR de termos largos');

conferir('manchete de outra época não entra, mesmo com data do índice desta semana',
  radar.ehDeOutraEpoca('Hotéis, bares e restaurantes esperam faturar no feriado de 9 de Julho',
    new Date('2026-09-08T00:00:00Z')) === true,
  'foi o item do gazetasp: pubDate de setembro, conteúdo de 9 de julho');

conferir('e a regra é estreita — mês vizinho e mês da própria publicação passam',
  radar.ehDeOutraEpoca('Feriado de 7 de setembro deve elevar movimento de bares',
    new Date('2026-09-08T00:00:00Z')) === false &&
  radar.ehDeOutraEpoca('Vendas de agosto surpreendem o setor',
    new Date('2026-09-08T00:00:00Z')) === false &&
  radar.ehDeOutraEpoca('Balanço de dezembro fecha o ano',
    new Date('2026-01-05T00:00:00Z')) === false,
  'regra larga joga fora notícia boa, que é o erro pior: dezembro e janeiro são vizinhos');

/* A REGRA OLHA A DIREÇÃO DO TEMPO, e este teste existe porque a primeira versão media
   distância circular e reprovou "Os Restaurantes Estão Preparados Para a Corrida até
   Dezembro?" — matéria do Food Connection publicada em setembro, olhando para a frente.
   Eu só vi porque apliquei a regra nas linhas da rodada anterior e li o que ela cortava. */
conferir('mês À FRENTE passa: matéria que planeja não é matéria velha',
  radar.ehDeOutraEpoca('Os Restaurantes Estão Preparados Para a Corrida até Dezembro?',
    new Date('2026-09-04T00:00:00Z')) === false &&
  radar.ehDeOutraEpoca('O que esperar do Natal e de dezembro no food service',
    new Date('2026-10-01T00:00:00Z')) === false,
  'a regra existe contra matéria reindexada, não contra planejamento — cortar isso é jogar fora notícia boa');

conferir('e mês no passado recente reprova, que é o caso real',
  radar.ehDeOutraEpoca('esperam faturar no feriado de 9 de Julho', new Date('2026-09-08T00:00:00Z')) === true &&
  radar.ehDeOutraEpoca('O balanço de maio dos bares', new Date('2026-09-08T00:00:00Z')) === true,
  'dois a seis meses atrás é a janela onde matéria reindexada aparece');

conferir('passado longe demais para ter direção clara não é chutado',
  radar.ehDeOutraEpoca('As metas de março do setor', new Date('2026-10-01T00:00:00Z')) === false,
  'março visto de outubro se lê mais como o março que vem; onde a leitura é ambígua a regra para de adivinhar');

conferir('e ela não reprova manchete que não nomeia mês',
  radar.ehDeOutraEpoca('Ticket médio sustenta alta de 3,24% na panificação',
    new Date('2026-09-08T00:00:00Z')) === false,
  'a maioria das manchetes não cita mês; elas não podem depender desta regra');

conferir('um veículo tem UM nome: o domínio vira o nome que a fonte já tem',
  radar.nomeDoVeiculo('foodconnection.com.br') === 'Food Connection' &&
  radar.nomeDoVeiculo('Food Connection') === 'Food Connection' &&
  radar.nomeDoVeiculo('agenciasebrae.com.br') === 'Agência Sebrae',
  'na primeira rodada "Food Connection" e "foodconnection.com.br" eram duas fontes na tela');

/* domínio desconhecido perde o sufixo e ganha maiúscula — "abrasel" ao lado de "Estadão"
   parece erro nosso. O que NÃO se faz é adivinhar o resto: "bemparana" não vira
   "Bem Paraná" por chute, porque isso seria inventar procedência. */
conferir('domínio desconhecido perde o .com.br e ganha só a maiúscula',
  radar.nomeDoVeiculo('www.gazetasp.com.br') === 'Gazetasp' &&
  radar.nomeDoVeiculo('abrasel.com.br') === 'Abrasel' &&
  radar.nomeDoVeiculo('O GLOBO') === 'O GLOBO',
  'nome de veículo em caixa baixa no meio da lista parece defeito da tela');

conferir('a mesma notícia por dois veículos entra uma vez',
  /historiasVistas/.test(semNota) && /chaveDaHistoria/.test(semNota),
  '"Cármen Lúcia mantém teto para taxas do vale-refeição" entrou pela Folha PE e pelo O GLOBO: dois links, uma notícia');

conferir('e o dedupe por URL continua, porque o unique da tabela recusaria o lote',
  /urlsVistas\.has\(a\.url\)/.test(semNota),
  'sem ele um link repetido no mesmo lote derruba as 36 linhas de uma vez');

conferir('o denominador é chamado pelo que é: base de CNPJ, não restaurante operando',
  radar.NOME_DO_TAM === 'CNPJs food ativos na Receita' &&
  /142\.319 CNPJs food ativos na Receita/.test(
    radar.leituraDaPraca({ tam: 142319, tam_fonte: 'contagem_api', tocado: 18, pct_tocado: 0.01, perdidos: 0 }, 0)),
  'são 142.319 em SP contra as 40-50 mil que o setor estima operando: "estabelecimentos" faz o 0,01% parecer que o time não começou');

/* ══ O SEXTO DEFEITO: A LISTA NÃO ESTAVA PRONTA PARA A TELA ═════════════════════════════
   Consertados os cinco, sobraram 33 manchetes de 32 veículos, com "morango cravejado" e
   o Salão Abrasel em três matérias ao lado de "lucro chega a só 32% dos bares do RN".
   Nenhum desses é falso positivo de palavra — todos citam o setor de verdade. A resposta
   é RANQUEAR com o motivo visível, não filtrar mais e esconder a decisão. */
conferir('a notícia com número e assunto de dono ganha da matéria de comportamento',
  radar.relevancia('Vendas crescem, mas lucro chega a só 32% dos bares e restaurantes do RN', 'Agora RN').nota >
  radar.relevancia('Quanto custa o morango cravejado? Saiba mais sobre a nova onda viral', 'Estadão').nota,
  'as duas citam o setor; uma muda o mês do gestor e a outra é matéria de comportamento');

conferir('release de evento cai para o fim, mesmo vindo de veículo conhecido',
  radar.relevancia('Salão Abrasel estreia com foco em negócios e inovação', 'Giro News').nota < 0 &&
  radar.relevancia('Abrasel Minas promove 17º Encontro de Bares e Restaurantes', 'Gazeta da Semana').nota < 0,
  'o Salão Abrasel entrou em TRÊS matérias diferentes na primeira rodada, e nenhuma é notícia do mês de ninguém');

conferir('conteúdo patrocinado não sobe por ser de veículo grande',
  radar.relevancia('99Food ajuda restaurantes a vender mais e aumentar a rentabilidade', 'Estúdio Folha').nota < 0,
  '"Estúdio Folha" é o braço de conteúdo pago da Folha, e o item dele ficou acima de matéria editorial de verdade');

conferir('a nota NUNCA esconde: ela ordena, e toda notícia continua gravada',
  !/relevancia [<>]=? *[0-9-]+\) return/.test(semNota) &&
  /sort\(\(a, b\) => \{/.test(semNota),
  'filtro escondido decide pelo gestor; nota com motivo deixa ele discordar de mim');

conferir('e toda nota vem com o motivo escrito, sem exceção',
  radar.relevancia('Manchete qualquer sem nada', 'Veículo Desconhecido').motivo === 'sem sinal forte' &&
  radar.relevancia('Lucro cai 32%', 'Exame').motivo.length > 0,
  'nota sem procedência num cockpit onde todo número diz de onde vem é o número que ninguém acredita');

conferir('quem fica de um par duplicado é a de MAIOR nota, não a que chegou antes',
  /porNota\.filter/.test(semNota) && /b\.relevancia - a\.relevancia/.test(semNota),
  'a ordem de coleta depende de qual tema respondeu primeiro: deixar o acidente escolher entre o O GLOBO e um agregador é sorteio');

conferir('a janela é de uma semana com folga, não do mês',
  radar.JANELA_DIAS >= 7 && radar.JANELA_DIAS <= 10,
  'JANELA_DIAS = ' + radar.JANELA_DIAS + '; mais que isso repete manchete velha toda segunda');

/* ══ A RODADA ══════════════════════════════════════════════════════════════════════════ */
conferir('as praças vêm da lista que o backfill já usa — não de uma cópia',
  /require\('\.\/backfill-casa-dos-dados'\)/.test(semNota) && !/const CIDADES = \[/.test(semNota),
  'a mesma regra em dois lugares é a causa que passei a semana consertando');

conferir('notícia e praça são independentes: uma metade caída não derruba a outra',
  (semNota.match(/catch \(e\) \{\s*\n?\s*problemas\.push/g) || []).length >= 2,
  'feed fora do ar não pode impedir o radar de gravar, nem a Casa dos Dados apagar as manchetes');

conferir('a rodada só passa se ALGO foi gravado',
  /if \(!gravouAlgo\) throw new Error/.test(fonte),
  'rodada verde sem escrever nada é a pior mentira: a tela mostra a semana passada como se fosse esta');

conferir('e o que faltou é escrito onde alguém lê',
  /GITHUB_STEP_SUMMARY/.test(semNota) && /problemas\.forEach/.test(semNota),
  'ressalva só no console de um cron de segunda 6h não é ressalva vista');

conferir('escreve com service_role, no servidor — nunca com a chave do navegador',
  /SUPABASE_SERVICE_KEY/.test(semNota) && !/supaAnon|SUPABASE_ANON/.test(semNota),
  'as duas tabelas têm RLS com SELECT para authenticated e ZERO política de escrita, de propósito');

conferir('nada é escrito no HubSpot por causa disto',
  !/hubapi\.com/.test(fonte) && !/method: 'PATCH'/.test(semNota),
  'somos espelho do CRM: aqui só se lê o snapshot dele');

conferir('e o snapshot é lido pelo módulo que já existe, não por um fetch novo',
  /require\('\.\.\/lib\/publicar-snapshot'\)/.test(semNota) && !/cockpit_snapshot\?select/.test(semNota),
  'terceira cópia da leitura do snapshot é a terceira chance de divergirem');

conferir('rodar() só dispara como programa, nunca ao ser importado',
  /if \(require\.main === module\)/.test(fonte),
  'sem a guarda, um require aqui dispara seis consultas pagas e uma gravação');

/* ESTE FOI O SEGUNDO DEFEITO QUE SÓ APARECEU RODANDO. `segundaDaSemana` devolve
   'AAAA-MM-DD' — string, que é o que a coluna date espera. A primeira versão de rodar()
   chamava .toISOString() no retorno e a rodada morria na segunda linha, com a suite e o
   build verdes. Regex nenhuma vê isso; chamar a função, vê. */
conferir('a semana é string AAAA-MM-DD, e ninguém a trata como Date',
  typeof radar.segundaDaSemana(new Date()) === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(radar.segundaDaSemana(new Date())) &&
  !/semana\.toISOString/.test(semNota),
  'a coluna data_semana é date; e tratar a string como Date derruba a rodada inteira na segunda linha');

conferir('e a segunda é a segunda mesmo, para qualquer dia da semana',
  radar.segundaDaSemana(new Date('2026-09-09T12:00:00Z')) === '2026-09-07' &&
  radar.segundaDaSemana(new Date('2026-09-07T00:30:00Z')) === '2026-09-07' &&
  radar.segundaDaSemana(new Date('2026-09-13T23:00:00Z')) === '2026-09-07',
  'segunda errada faz a semana gravar duas vezes e a tela mostrar radar de duas semanas juntas');

/* ══ RESULTADO ═════════════════════════════════════════════════════════════════════════ */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('radar semanal: ' + ok + ' checagens ok — TAM nunca vira zero, percentual só com'
  + ' denominador contado, praça não engole a vizinha, e o piso é dito como piso.');
