// scripts/generate-weekly-summary.js
// Roda toda SEXTA-FEIRA às 16h (Brasília), depois do fetch-weekly-comparison.js — ver
// .github/workflows/weekly-summary.yml (cron '0 19 * * 5'). O plano fica pronto antes
// da daily de segunda-feira, mas a GERAÇÃO em si acontece na sexta.
// Manda os números pra API da Claude e pede: (1) um resumo interpretativo do TIME inteiro
// (visão de time/funil agregado, sem citar nomes — pro gestor e pra visão coletiva), e
// (2) um resumo INDIVIDUAL por executivo (endereçado a ele mesmo, "você") — cada um só
// vê o seu, no Meu Painel. O gestor vê o coletivo + a lista de todos os individuais.
// Requer variável de ambiente ANTHROPIC_API_KEY (gerada em console.anthropic.com).

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERRO: variável ANTHROPIC_API_KEY não encontrada. Configure em GitHub → Settings → Secrets → Actions.');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'weekly-raw.json'), 'utf8'));
const narrativas = JSON.parse(fs.readFileSync(path.join(root, 'data', 'narrativas.json'), 'utf8'));

// Monta um resumo por executivo (nome + praça + open + etapa dominante) pra dar contexto à Claude
//
// IMPORTANTE: r.ganhosSemana, r.fechadosNoMes, r.metaMensal e r.leadsTravados EXISTEM em
// data/weekly-raw.json (o fetch-weekly-comparison.js já traz isso certinho), mas antes
// não eram copiados pra cá — então promptIndividual() sempre recebia undefined nesses
// campos e caía nos valores-padrão (0, 0, meta 10), fazendo o texto individual de todo
// mundo dizer sempre "0 ganhos, 0 de 10 fechados" independente do número real. Corrigido
// carregando os campos de verdade abaixo.
const repsContext = Object.entries(raw.snapshotReps || {}).map(([ownerId, r]) => {
  const n = narrativas.reps[ownerId] || {};
  const stageEntries = Object.entries(r.stages || {});
  const dominant = stageEntries.length ? stageEntries.sort((a, b) => b[1] - a[1])[0] : null;
  return {
    ownerId,
    name: r.name,
    praca: n.praca || '—',
    open: r.open,
    etapaDominante: dominant ? dominant[0] : null,
    etapaDominanteContagem: dominant ? dominant[1] : 0,
    ganhosSemana: r.ganhosSemana || 0,
    fechadosNoMes: r.fechadosNoMes || 0,
    metaMensal: r.metaMensal || 10,
    leadsTravados: r.leadsTravados || 0
  };
});

// Lê o resumo-semanal.json ATUAL (= o da semana passada, gerado na última vez que este
// script rodou) ANTES de sobrescrevê-lo — assim dá pra alimentar a IA com o que já foi
// recomendado e evitar repetir a mesma orientação toda semana. Se for a primeira vez
// rodando (arquivo não existe ainda), segue sem histórico, sem quebrar.
function lerResumoAnterior() {
  const caminho = path.join(root, 'data', 'resumo-semanal.json');
  if (!fs.existsSync(caminho)) return null;
  try {
    return JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch (e) {
    console.error(`Não deu pra ler o resumo-semanal.json anterior (${e.message}) — seguindo sem histórico.`);
    return null;
  }
}

function promptTime(anterior) {
  const blocoAnterior = (anterior && anterior.comoAgir && anterior.comoAgir.length)
    ? `\nAções recomendadas na semana passada: ${anterior.comoAgir.join(' | ')}. Se os mesmos gargalos continuarem, diga isso explicitamente e escale a recomendação — não repita a mesma frase de novo. Se foram resolvidos, reconheça brevemente e foque no que é novo.`
    : '';

  return `Você é um analista de operações de vendas (sales ops) experiente, escrevendo para Julyan, que lidera o time de Field Sales (Outbound) da Takeat, uma foodtech B2B brasileira. Ele usa esse resumo toda segunda-feira para orientar os 1:1s da semana.

Dados da semana atual (${raw.janela.atual}) vs. semana anterior (${raw.janela.anterior}):
- Leads criados: ${raw.kpisComparativo.atual.leadsCriados} (semana anterior: ${raw.kpisComparativo.anterior.leadsCriados})
- Ganhos: ${raw.kpisComparativo.atual.ganhos} (semana anterior: ${raw.kpisComparativo.anterior.ganhos})
- Reuniões (entraram em Demo/Proposta): ${raw.kpisComparativo.atual.reunioes} (semana anterior: ${raw.kpisComparativo.anterior.reunioes})
- Perdidos: ${raw.kpisComparativo.atual.perdidos} (semana anterior: ${raw.kpisComparativo.anterior.perdidos})
- Reciclagem: ${raw.kpisComparativo.atual.reciclagem} (semana anterior: ${raw.kpisComparativo.anterior.reciclagem})

Snapshot atual por executivo (volume em aberto e etapa onde mais leads estão concentrados):
${JSON.stringify(repsContext, null, 2)}
${blocoAnterior}

Escreva em português do Brasil, tom direto e prático (nada de generalidades tipo "continue o bom trabalho"). Responda SOMENTE com um JSON válido, sem markdown, sem \`\`\`, no formato exato:

{
  "resumoGeral": "2-4 frases em HTML simples (pode usar <b>) explicando o que mais chamou atenção nos números da semana que passou — comparando com a anterior, citando números concretos.",
  "comoAgir": ["3 a 4 ações objetivas e priorizadas para a semana atual, cada uma como uma string curta, pode usar <b> para destacar números, diferentes das da semana passada se aqueles pontos já foram resolvidos"]
}

IMPORTANTE: fale só em nível de time/funil agregado. Não cite nome de executivo específico nem avalie
desempenho individual — essa análise é vista coletivamente por todo o time, e observações sobre uma
pessoa específica devem ficar reservadas para uma conversa de PDI, não para este resumo coletivo.`;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Tolerante a preâmbulo/cerca de código que a IA às vezes inclui mesmo instruída a não
// fazer isso — pega do primeiro '{' ao último '}' em vez de confiar que o texto inteiro
// é só o JSON.
function extrairJSON(texto) {
  const semCercas = texto.replace(/```json|```/g, '').trim();
  const inicio = semCercas.indexOf('{');
  const fim = semCercas.lastIndexOf('}');
  if (inicio === -1 || fim === -1 || fim < inicio) return semCercas;
  return semCercas.slice(inicio, fim + 1);
}

// Antes, qualquer resposta que não viesse em JSON perfeito (truncada, aspas não
// escapadas, resposta sem bloco de texto etc.) derrubava o resumo daquela pessoa pro
// resto da semana — era a causa de vários "Resumo individual" sumirem da aba do gestor.
// Agora: 429 continua com backoff (já existia); resposta sem bloco de texto ou JSON
// malformado/cortado tentam de novo (normalmente é transitório) antes de desistir, e
// loga a resposta bruta na desistência final pra dar pra investigar sem vasculhar o
// Actions na mão.
async function chamarClaude(promptTexto, maxTokens, tentativa = 1) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens || 2500,
      messages: [{ role: 'user', content: promptTexto }]
    })
  });

  if (res.status === 429 && tentativa <= 4) {
    await sleep(1500 * tentativa);
    return chamarClaude(promptTexto, maxTokens, tentativa + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const textBlock = data.content.find(b => b.type === 'text');
  if (!textBlock) {
    if (tentativa <= 3) { await sleep(800 * tentativa); return chamarClaude(promptTexto, maxTokens, tentativa + 1); }
    throw new Error('Resposta da Claude não trouxe bloco de texto, mesmo após 3 tentativas.');
  }

  try {
    return JSON.parse(extrairJSON(textBlock.text));
  } catch (e) {
    if (tentativa <= 3) {
      await sleep(800 * tentativa);
      return chamarClaude(promptTexto, maxTokens, tentativa + 1);
    }
    console.error(`JSON malformado mesmo após 3 tentativas. Resposta bruta (primeiros 500 caracteres): ${textBlock.text.slice(0, 500)}`);
    throw e;
  }
}

// Monta o prompt do resumo INDIVIDUAL — endereçado direto ao executivo ("você"), pra
// aparecer no Meu Painel dele. Diferente da análise de coaching (generate-individual-analysis.js),
// que é privada e só o gestor vê: esse texto aqui é o próprio vendedor quem lê.
function promptIndividual(ownerId, rc, comoAgirAnterior) {
  const detalheGanhos = (raw.ganhosSemanaDetalhe || []).filter(g => g.ownerId === ownerId);
  const blocoAnterior = (comoAgirAnterior && comoAgirAnterior.length)
    ? `\nO que foi combinado com você na semana passada: ${comoAgirAnterior.join(' | ')}. Se o mesmo ponto continuar em aberto, diga isso direto. Se já resolveu, reconheça em 1 frase e siga pro próximo foco — não repita a mesma recomendação de novo.`
    : '';

  return `Você é um analista de operações de vendas escrevendo DIRETO para ${rc.name}, executivo(a) de Field Sales
(Outbound) da Takeat, na praça de ${rc.praca}. Esse texto é lido só por ele(a) mesmo(a) — endereça na segunda pessoa
("você"), tom direto, respeitoso e prático. Nada de elogio vazio tipo "continue assim" sem dado por trás.

Dados da semana atual (${raw.janela.atual}) dele(a):
- Negócios em aberto: ${rc.open}
- Etapa onde mais negócios estão concentrados: ${rc.etapaDominante || 'sem dado suficiente'} (${rc.etapaDominanteContagem} negócios)
- Ganhos fechados essa semana: ${rc.ganhosSemana || 0}${detalheGanhos.length ? ' (' + detalheGanhos.map(g => g.nome).join(', ') + ')' : ''}
- Fechados no mês corrente: ${rc.fechadosNoMes || 0} de meta ${rc.metaMensal || 10}
- Leads com SLA estourado: ${rc.leadsTravados || 0}
${blocoAnterior}

Responda SOMENTE com um JSON válido, sem markdown, sem \`\`\`, no formato exato:
{
  "resumoIndividual": "2-3 frases em HTML simples (pode usar <b>) contando pra essa pessoa como foi a semana dela especificamente, com números concretos — reconhecendo o que foi bem e nomeando o que travou, sem rodeio.",
  "comoAgirIndividual": ["2-3 ações objetivas e específicas pra essa pessoa focar na semana que começa, cada uma como uma string curta, pode usar <b> pra destacar números, diferentes das da semana passada se já foram resolvidas"]
}`;
}

async function main() {
  const anterior = lerResumoAnterior();

  console.log(`Chamando a API da Claude — 1 resumo de time + ${repsContext.length} individuais, em paralelo...`);

  // Antes rodava 1 chamada de time + N individuais uma de cada vez (for...await) — com 9
  // reps isso empilhava ~10 chamadas sequenciais e esticava o workflow inteiro. Agora todas
  // saem juntas com Promise.allSettled: o tempo total vira ~o tempo da chamada mais lenta,
  // não a soma de todas. chamarClaude já tem retry com backoff pra 429, então rodar em
  // paralelo não devia estourar o rate limit da API pra um volume desse tamanho (10 chamadas).
  const [resultadoTime, ...resultadosIndividuais] = await Promise.allSettled([
    chamarClaude(promptTime(anterior), 2500),
    ...repsContext.map(rc => chamarClaude(promptIndividual(rc.ownerId, rc, anterior?.porRep?.[rc.ownerId]?.comoAgirIndividual), 1100))
  ]);

  // Antes, se a chamada de time falhasse, o script inteiro morria e NADA era atualizado
  // (nem os individuais que deram certo). Agora, se falhar, cai pro texto da semana
  // anterior (se existir) em vez de deixar o gestor sem nada na tela de segunda.
  let parsed;
  if (resultadoTime.status === 'rejected') {
    console.error(`Falha ao gerar o resumo de time: ${resultadoTime.reason?.message || resultadoTime.reason} — mantendo o texto da semana passada em vez de travar tudo.`);
    parsed = {
      resumoGeral: anterior?.resumoGeral || 'Resumo de time indisponível essa semana (falha técnica na geração). Consulte os números brutos no dashboard.',
      comoAgir: anterior?.comoAgir || ['Revisar manualmente os números da semana — a geração automática falhou.']
    };
  } else {
    parsed = resultadoTime.value;
  }

  const output = {
    geradoEm: new Date().toISOString(),
    janela: raw.janela,
    kpisComparativo: raw.kpisComparativo,
    resumoGeral: parsed.resumoGeral,
    comoAgir: parsed.comoAgir,
    ganhosSemanaDetalhe: raw.ganhosSemanaDetalhe || [],
    reunioesSemanaDetalhe: raw.reunioesSemanaDetalhe || [],
    quentesDemoOuNegociacao: raw.quentesDemoOuNegociacao || [],
    porRep: {}
  };

  // Um resumo individual por executivo — cada um só vê o seu no Meu Painel; o gestor
  // vê o coletivo acima (resumoGeral/comoAgir) + a lista de todos os individuais.
  // Antes, se a geração de alguém falhasse, essa pessoa simplesmente sumia da lista
  // "Resumo individual de cada executivo" do gestor (o "não tem nada fiel" que o Julyan
  // via) — agora sempre entra uma entrada, real (números atuais) ou de fallback, nunca
  // fica em branco.
  repsContext.forEach((rc, i) => {
    const resultado = resultadosIndividuais[i];
    if (resultado.status === 'fulfilled') {
      output.porRep[rc.ownerId] = {
        name: rc.name,
        resumoIndividual: resultado.value.resumoIndividual,
        comoAgirIndividual: resultado.value.comoAgirIndividual || []
      };
    } else {
      console.error(`Falha ao gerar resumo individual de ${rc.name}: ${resultado.reason?.message || resultado.reason} — gravando fallback honesto.`);
      output.porRep[rc.ownerId] = {
        name: rc.name,
        resumoIndividual: `Análise indisponível essa semana (falha técnica na geração). Números atuais: <b>${rc.open}</b> negócios em aberto, etapa dominante <b>${rc.etapaDominante || 'sem dado'}</b>, <b>${rc.ganhosSemana || 0}</b> ganhos fechados.`,
        comoAgirIndividual: ['Revisar manualmente neste 1:1 — a geração automática falhou e será tentada de novo na próxima semana.']
      };
    }
  });

  fs.writeFileSync(path.join(root, 'data', 'resumo-semanal.json'), JSON.stringify(output, null, 2));
  console.log('OK — data/resumo-semanal.json gravado (coletivo + individuais).');
}

main().catch(err => {
  console.error('Falha ao gerar resumo semanal:', err.message);
  process.exit(1);
});
