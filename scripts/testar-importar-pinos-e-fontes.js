/* ══ SUÍTE DA AUDITORIA DO SERVIDOR NA IMPORTAÇÃO (02/11/26) ══════════════════════════════════════
   Protege quatro regras novas de api/importar-leads.js e lib/territorios.js:
     1. uma grafia por origem: a fonte do lote e as partes de `fonte` gravam o rótulo de FONTES_ROTULO;
     2. o lead que já é pino no mapa (clients) não entra de novo: telefone normalizado, ou nome a até 30 m;
     3. quem saiu do time não recebe lead nem pela declaração (ehDono em todas as regras);
     4. a carteira de quem saiu segue o território (planejarRedistribuicao): sem destino fica pendente,
        com negócio no HubSpot fica de fora, destino fora do time ativo não recebe.
   Sem rede e sem banco: só as funções puras.
   ══════════════════════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const raiz = path.resolve(__dirname, '..');
const imp = require(path.join(raiz, 'api', 'importar-leads.js'));
const T = require(path.join(raiz, 'lib', 'territorios.js'));
const { leadsDaEntrada } = require(path.join(raiz, 'scripts', 'redistribuir-leads-de-quem-saiu.js'));

let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };

/* 1 · fonte */
checar('fonte: "Casa dos Dados" do lote vira casa_dos_dados', imp.normalizarFonte('Casa dos Dados') === 'casa_dos_dados');
checar('fonte: "google-places" e "Google Places" são a mesma', imp.normalizarFonte('google-places') === 'google_places' && imp.normalizarFonte('Google Places') === 'google_places');
checar('fonte: desconhecida continua recusada', imp.normalizarFonte('planilha') === null && imp.normalizarFonte('') === null);
checar('fonte: a fusão não cola a chave crua com o rótulo', imp.juntarFontes('google_places + Google Places', 'outscraper') === 'Google Places + Outscraper',
  imp.juntarFontes('google_places + Google Places', 'outscraper'));
checar('fonte: a do app (rua) passa como está', imp.juntarFontes('rua', 'Casa dos Dados') === 'rua + Casa dos Dados');

/* 2 · o lead que já é pino */
const indice = imp.indiceDePinos([
  { id: 'p1', nome: 'Bar do Zé', empresa: null, telefone: '+55 (21) 99876-5432', latitude: -22.9000, longitude: -43.2000 },
  { id: 'p2', nome: 'Cantina Sole', empresa: 'Cantina Sole Mare', telefone: null, latitude: -22.9100, longitude: -43.2100 }
]);
checar('pino: mesmo telefone (com e sem DDI) é o mesmo restaurante',
  (imp.pinoDoMesmoRestaurante({ nome: 'Outro nome', telefone: '21998765432', lat: -23, lng: -46 }, indice) || {}).id === 'p1');
checar('pino: mesmo nome a 20 m é o mesmo restaurante',
  (imp.pinoDoMesmoRestaurante({ nome: 'Cantina Sole Mare', lat: -22.91018, lng: -43.2100 }, indice) || {}).id === 'p2');
checar('pino: mesmo nome a 60 m NÃO é (pode ser a filial do outro lado da rua)',
  imp.pinoDoMesmoRestaurante({ nome: 'Cantina Sole Mare', lat: -22.91054, lng: -43.2100 }, indice) === null);
checar('pino: sem telefone e sem coordenada não casa por nome',
  imp.pinoDoMesmoRestaurante({ nome: 'Bar do Zé', lat: null, lng: null }, indice) === null);

/* 3 · quem saiu não recebe nem pela declaração */
/* a regra declarada de São Paulo que cobre um bairro conhecido (lida de data/territorios.json, não cravada) */
const declarado = T.DECLARADOS.find(d => !d.sobraDeclarada && !d.todoOMunicipioDeclarado && d.cidade === 'sao paulo'
  && ['mooca', 'tatuape', 'bras'].some(b => d.teste('sao paulo ' + b)));
if (declarado) {
  const bairro = ['mooca', 'tatuape', 'bras', 'vila prudente', 'penha de franca'].find(b => declarado.teste('sao paulo ' + b)) || null;
  if (bairro) {
    T.definirDesligados([]);
    const antes = T.regraDoTerritorio('São Paulo', bairro, null, null);
    T.definirDesligados([declarado.owner]);
    const depois = T.regraDoTerritorio('São Paulo', bairro, null, null);
    T.definirDesligados([]);
    checar('declaração: o bairro declarado vai para o dono dele', antes && antes.owner === declarado.owner);
    checar('declaração: dono desativado não recebe o bairro declarado', !depois || depois.owner !== declarado.owner, depois && depois.owner);
  } else checar('declaração: há bairro declarado em São Paulo para testar', false);
} else checar('declaração: há bairro declarado em São Paulo para testar', false);

/* 4 · a carteira de quem saiu */
const dono = declarado ? declarado.owner : '1';
const bairroDeclarado = declarado ? (['mooca', 'tatuape', 'bras'].find(b => declarado.teste('sao paulo ' + b)) || 'mooca') : 'mooca';
const plano = T.planejarRedistribuicao([
  { id: 'a', cidade: 'São Paulo', bairro: bairroDeclarado, responsavel_owner_id: 'saiu', status: 'atribuido' },
  { id: 'b', cidade: 'São Paulo', bairro: 'Bairro Que Ninguém Declarou', responsavel_owner_id: 'saiu', status: 'na_rota' },
  { id: 'c', cidade: 'São Paulo', bairro: bairroDeclarado, responsavel_owner_id: 'saiu', status: 'atribuido', hubspot_deal_id: '123' },
  { id: 'd', cidade: 'São Paulo', bairro: bairroDeclarado, responsavel_owner_id: 'saiu', status: 'atribuido', pinoComNegocio: true },
  { id: 'e', cidade: 'São Paulo', bairro: bairroDeclarado, responsavel_owner_id: 'ficou', status: 'atribuido' },
  { id: 'f', cidade: 'São Paulo', bairro: bairroDeclarado, responsavel_owner_id: 'saiu', status: 'criado_hubspot' }
], { desligados: ['saiu'], ativos: [dono] });
const de = id => plano.itens.find(i => i.id === id);
checar('redistribuir: o lead vai para o dono do território', de('a') && de('a').para === dono, JSON.stringify(de('a')));
checar('redistribuir: sem território fica pendente, sem dono inventado', de('b') && de('b').para === null);
checar('redistribuir: negócio no lead ou no pino fica de fora (o dono é o do HubSpot)', !de('c') && !de('d') && plano.pulados.comNegocio === 2);
checar('redistribuir: lead de quem não saiu e status fora não entram', !de('e') && !de('f'));
checar('redistribuir: o resumo é por ownerId', plano.resumo['saiu -> ' + dono] === 1 && plano.resumo['saiu -> pendente'] === 1, JSON.stringify(plano.resumo));
const semAtivo = T.planejarRedistribuicao([{ id: 'a', cidade: 'São Paulo', bairro: bairroDeclarado, responsavel_owner_id: 'saiu', status: 'atribuido' }],
  { desligados: ['saiu'], ativos: ['outra-pessoa'] });
checar('redistribuir: destino fora do time ativo não recebe', semAtivo.itens[0].para === null && semAtivo.itens[0].porque === 'destino fora do time ativo');
const doDono = T.planejarRedistribuicao([{ id: 'a', cidade: 'São Paulo', bairro: bairroDeclarado, responsavel_owner_id: dono, status: 'atribuido' }],
  { desligados: [dono], ativos: null });
checar('redistribuir: o território de quem saiu não devolve o lead para ele mesmo', doDono.itens[0].para !== dono);
T.definirDesligados([]);
checar('redistribuir: a lista de quem saiu volta a ficar vazia depois do plano', !T.ehDesligado('saiu'));

/* o formato agregado do ensaio offline */
const linhas = leadsDaEntrada({ grupos: [['São Paulo', 'Mooca', 'x', 'atribuido', false, true, 3]] });
checar('ensaio offline: o grupo vira uma linha por lead, com o negócio do pino', linhas.length === 3 && linhas.every(l => l.pinoComNegocio && !l.hubspot_deal_id));

console.log(ok + ' ok' + (falhas.length ? ' · ' + falhas.length + ' falha(s)' : ''));
falhas.forEach(f => console.log('FALHA ' + f));
if (falhas.length) process.exit(1);
