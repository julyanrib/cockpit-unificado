// scripts/generate-weekly-summary.js
// Roda toda SEGUNDA-FEIRA, depois do fetch-weekly-comparison.js.
// Manda os números pra API da Claude e pede um resumo interpretativo em português.
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

async function main() {
  console.log('Chamando a API da Claude...');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const textBlock = data.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Resposta da Claude não trouxe texto.');

  let parsed;
  try {
    const clean = textBlock.text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error(`Não consegui interpretar o JSON da resposta: ${e.message}\nResposta bruta: ${textBlock.text}`);
  }

  const output = {
    geradoEm: new Date().toISOString(),
    janela: raw.janela,
    kpisComparativo: raw.kpisComparativo,
    resumoGeral: parsed.resumoGeral,
    comoAgir: parsed.comoAgir,
    ganhosSemanaDetalhe: raw.ganhosSemanaDetalhe || [],
    reunioesSemanaDetalhe: raw.reunioesSemanaDetalhe || [],
    quentesDemoOuNegociacao: raw.quentesDemoOuNegociacao || []
  };

  fs.writeFileSync(path.join(root, 'data', 'resumo-semanal.json'), JSON.stringify(output, null, 2));
  console.log('OK — data/resumo-semanal.json gravado.');
}

main().catch(err => {
  console.error('Falha ao gerar resumo semanal:', err.message);
  process.exit(1);
});
