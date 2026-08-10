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

const root = path.join(__dirname, '..');

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
  clientesAtivos: [],
  footerText: '',
  resumoSemanal: null,
  agenda: null,
  usuarios: []
};

const template = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');
const output = template.replace('{{DATA_JSON}}', JSON.stringify(DATA_PUBLICO));

const publicDir = path.join(root, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'index.html'), output);

console.log('OK — public/index.html gerado com sucesso (shell protegido, sem dados do CRM).');
