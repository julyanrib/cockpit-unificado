// scripts/build.js
// Gera public/index.html — o arquivo que a Vercel publica.
//
// MUDANÇA DE ARQUITETURA (Etapa 1b, 07/08/26): antes, este build embutia o DATA COMPLETO
// (funil, clientes, notas, tudo) dentro do HTML público — qualquer visitante via o CRM
// inteiro no "ver código-fonte", sem logar. Agora o HTML publicado carrega só um DATA
// "casca": a config do Supabase (necessária pro login) + placeholders VAZIOS mas com o
// tipo certo, pra que o código de carregamento da página rode sem quebrar atrás da tela
// de login. Os dados reais chegam DEPOIS do login, via api/dados.js, já filtrados por
// papel no servidor (a montagem vive em scripts/montar-dados.js — fonte única pros dois).
//
// Os placeholders precisam existir E ter o tipo certo (array vazio, objeto vazio, null)
// porque o template tem código top-level síncrono que lê DATA no carregamento — antes do
// login. Vazio renderiza estado vazio invisível atrás do gate; ausente quebraria o script.

const fs = require('fs');
const path = require('path');
const { configSupabase, configMaptiler } = require('./montar-dados.js');
const { buildPlaybook } = require('./build-playbook.js');

const root = path.join(__dirname, '..');

/* ══ O TAMANHO DO TIME, PARA A TELA DE LOGIN (07/09/26) ═══════════════════════════════
   A tela 1b publica "N executivos na rua" antes do login, e `usuarios` e [] no DATA
   publico de proposito (ele carrega e-mails). Entao a contagem entra como DOIS INTEIROS.

   A REGRA E A DO CABECALHO, e nao uma minha: reps cadastrados menos os `aComecar`. O
   cabecalho publica o mesmo numero depois do login (preencherCabecalhoRodape) e as duas
   telas nao podem discordar — o primeiro numero que o executivo le e o do login.
   Ha uma checagem na suite comparando os dois, porque a regra existe em dois lugares
   por necessidade: aqui em Node, la no navegador. */
function contarTimeNoField() {
  let arq;
  try {
    arq = JSON.parse(fs.readFileSync(path.join(root, 'data', 'usuarios.json'), 'utf8'));
  } catch (e) {
    /* SEM O ARQUIVO, NAO INVENTA ZERO. Zero ali diria "nenhum executivo na rua" na
       primeira tela do produto. null faz a tela nao desenhar a metrica. */
    return null;
  }
  const lista = Array.isArray(arq) ? arq : (arq.usuarios || []);
  const reps = lista.filter(function (u) { return u && u.role === 'rep'; });
  const emPreparacao = reps.filter(function (u) { return u.aComecar; }).length;
  return { ativos: reps.length - emPreparacao, emPreparacao: emPreparacao };
}

const DATA_PUBLICO = {
  // Marca de arquitetura: o template usa isso pra saber que precisa hidratar via api/dados.
  shellProtegido: true,
  supabase: configSupabase(),
  maptiler: configMaptiler(),

  // ---- placeholders vazios, um por chave do DATA real (mesmos tipos) ----
  hubspotUpdatedAtFmt: '',
  hubspotUpdatedAtISO: null,
  versaoAnalise: 'v1',
  kpisHub: {},
  kpiDetalhe: { leadsCriados: [], perdidos: [] },
  kpiDeltas: null,
  funil: { labels: [], valores: [], cores: [] },
  funilLeads: {},
  vendasMes: null,
  temperatura: { quentes: [], frios: [] },
  stageMeta: { slaDays: {}, descriptions: {}, labels: {} },
  saude: null,
  reps: [],
  leadsReferencia: [],
  footerText: '',
  resumoSemanal: null,
  agenda: null,
  // Régua de cadência: null no shell público. O núcleo operacional do template trata
  // null como "régua não configurada" e não desenha recomendação de cadência — nunca
  // cai numa régua inventada em código.
  cadencias: null,
  syncStatus: null,
  usuarios: [],
  /* dois inteiros, para a tela de login — ver contarTimeNoField acima */
  timeNoField: contarTimeNoField()
};

const template = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');
const output = template.replace('{{DATA_JSON}}', JSON.stringify(DATA_PUBLICO));

const publicDir = path.join(root, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'index.html'), output);
buildPlaybook(root);

console.log('OK — public/index.html gerado com sucesso (shell protegido, sem dados do CRM).');

/* ============================================================================
   OS GUARDS RODAM AQUI, PORQUE É AQUI QUE O CI PASSA (29/08/26).
   ----------------------------------------------------------------------------
   Descoberto medindo: `scripts/check-scripts.js` NÃO estava em nenhum workflow.
   Os dois workflows que publicam (daily-refresh.yml e weekly-summary.yml) rodam
   `node scripts/build.js` e mais nada. Ou seja: a validação de sintaxe dos scripts
   inline, o guard da escala de breakpoints e o guard de variável CSS órfã só
   protegiam quem se lembrasse de rodar à mão.

   Eu tinha até escrito que "o guard quebra o build". Quebrava o MEU check, não o
   build automático. Agora quebra os dois: o build gera o arquivo e imediatamente o
   valida, na mesma execução. Se um guard reprovar, o processo sai com código != 0 e
   o deploy não acontece — que é o comportamento que eu já tinha atribuído a ele.

   Roda como processo separado de propósito: check-scripts valida no carregamento do
   módulo (process.exit dentro dele), então `require` teria efeito colateral. Assim o
   caminho de código exercitado é exatamente o mesmo de quando se roda à mão.
   ============================================================================ */
const { spawnSync } = require('child_process');
const verificacao = spawnSync(process.execPath, [path.join(__dirname, 'check-scripts.js')], {
  cwd: root,
  stdio: 'inherit'
});
if (verificacao.status !== 0) {
  console.error('BUILD REPROVADO pelos guards de check-scripts (acima). public/index.html foi gerado, mas NÃO deve ser publicado.');
  process.exit(verificacao.status || 1);
}
