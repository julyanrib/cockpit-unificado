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
    etapaDominanteContagem: dominant ? dominant[1] : 0
  };
});

const prompt = `Você é um analista de operações de vendas (sales ops) experiente, escrevendo para Julyan, que lidera o time de Field Sales (Outbound) da Takeat, uma foodtech B2B brasileira. Ele usa esse resumo toda segunda-feira para orientar os 1:1s da semana.

Dados da semana atual (${raw.janela.atual}) vs. semana anterior (${raw.janela.anterior}):
- Leads criados: ${raw.kpisComparativo.atual.leadsCriados} (semana anterior: ${raw.kpisComparativo.anterior.leadsCriados})
- Ganhos: ${raw.kpisComparativo.atual.ganhos} (semana anterior: ${raw.kpisComparativo.anterior.ganhos})
- Reuniões (entraram em Demo/Proposta): ${raw.kpisComparativo.atual.reunioes} (semana anterior: ${raw.kpisComparativo.anterior.reunioes})
- Perdidos: ${raw.kpisComparativo.atual.perdidos} (semana anterior: ${raw.kpisComparativo.anterior.perdidos})
- Reciclagem: ${raw.kpisComparativo.atual.reciclagem} (semana anterior: ${raw.kpisComparativo.anterior.reciclagem})

Snapshot atual por executivo (volume em aberto e etapa onde mais leads estão concentrados):
${JSON.stringify(repsContext, null, 2)}

Escreva em português do Brasil, tom direto e prático (nada de generalidades tipo "continue o bom trabalho"). Responda SOMENTE com um JSON válido, sem markdown, sem \`\`\`, no formato exato:

{
  "resumoGeral": "2-4 frases em HTML simples (pode usar <b>) explicando o que mais chamou atenção nos números da semana que passou — comparando com a anterior, citando números concretos.",
  "comoAgir": ["3 a 4 ações objetivas e priorizadas para a semana atual, cada uma como uma string curta, pode usar <b> para destacar números"]
}

IMPORTANTE: fale só em nível de time/funil agregado. Não cite nome de executivo específico nem avalie
desempenho individual — essa análise é vista coletivamente por todo o time, e observações sobre uma
pessoa específica devem ficar reservadas para uma conversa de PDI, não para este resumo coletivo.`;

async function chamarClaude(promptTexto, maxTokens) {
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const textBlock = data.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Resposta da Claude não trouxe texto.');

  const clean = textBlock.text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// Monta o prompt do resumo INDIVIDUAL — endereçado direto ao executivo ("você"), pra
// aparecer no Meu Painel dele. Diferente da análise de coaching (generate-individual-analysis.js),
// que é privada e só o gestor vê: esse texto aqui é o próprio vendedor quem lê.
function promptIndividual(ownerId, rc) {
  const detalheGanhos = (raw.ganhosSemanaDetalhe || []).filter(g => g.ownerId === ownerId);
  return `Você é um analista de operações de vendas escrevendo DIRETO para ${rc.name}, executivo(a) de Field Sales
(Outbound) da Takeat, na praça de ${rc.praca}. Esse texto é lido só por ele(a) mesmo(a) — endereça na segunda pessoa
("você"), tom direto, respeitoso e prático. Nada de elogio vazio tipo "continue assim" sem dado por trás.

Dados da semana atual (${raw.janela.atual}) dele(a):
- Negócios em aberto: ${rc.open}
- Etapa onde mais negócios estão concentrados: ${rc.etapaDominante || 'sem dado suficiente'} (${rc.etapaDominanteContagem} negócios)
- Ganhos fechados essa semana: ${rc.ganhosSemana || 0}${detalheGanhos.length ? ' (' + detalheGanhos.map(g => g.nome).join(', ') + ')' : ''}
- Fechados no mês corrente: ${rc.fechadosNoMes || 0} de meta ${rc.metaMensal || 10}
- Leads com SLA estourado: ${rc.leadsTravados || 0}

Responda SOMENTE com um JSON válido, sem markdown, sem \`\`\`, no formato exato:
{
  "resumoIndividual": "2-3 frases em HTML simples (pode usar <b>) contando pra essa pessoa como foi a semana dela especificamente, com números concretos — reconhecendo o que foi bem e nomeando o que travou, sem rodeio.",
  "comoAgirIndividual": ["2-3 ações objetivas e específicas pra essa pessoa focar na semana que começa, cada uma como uma string curta, pode usar <b> pra destacar números"]
}`;
}

async function main() {
  console.log('Chamando a API da Claude (resumo do time)...');
  const parsed = await chamarClaude(prompt, 2500);

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
  for (const rc of repsContext) {
    console.log(`Gerando resumo individual de ${rc.name}...`);
    try {
      const individual = await chamarClaude(promptIndividual(rc.ownerId, rc), 800);
      output.porRep[rc.ownerId] = {
        name: rc.name,
        resumoIndividual: individual.resumoIndividual,
        comoAgirIndividual: individual.comoAgirIndividual || []
      };
    } catch (e) {
      console.error(`Falha ao gerar resumo individual de ${rc.name}: ${e.message} — seguindo sem o dele essa semana.`);
    }
  }

  fs.writeFileSync(path.join(root, 'data', 'resumo-semanal.json'), JSON.stringify(output, null, 2));
  console.log('OK — data/resumo-semanal.json gravado (coletivo + individuais).');
}

main().catch(err => {
  console.error('Falha ao gerar resumo semanal:', err.message);
  process.exit(1);
});
