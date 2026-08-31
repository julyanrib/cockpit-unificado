// api/negocio-acao.js
//
// PORTA ÚNICA DAS AÇÕES SOBRE NEGÓCIO (31/08/26).
//
// POR QUE ISTO EXISTE
// O plano Hobby da Vercel dá 12 funções serverless e as 12 estavam ocupadas — sem espaço
// para o endpoint que o PWA vai precisar (a fila pendente do app: o que foi feito na rua e
// ainda não subiu). Cinco das doze faziam a mesma coisa em forma: validar sessão, conferir se
// o negócio é do pipeline Field Sales e escrever uma propriedade ou um objeto associado.
// Elas viraram cinco módulos em lib/acoes-negocio/ e esta é a única função que responde por
// todas. Saldo: 12 → 8 funções, 4 slots livres.
//
// O QUE **NÃO** MUDOU, DE PROPÓSITO
// A lógica de cada ação não foi reescrita: os cinco arquivos foram MOVIDOS, byte por byte,
// com uma única edição mecânica (o caminho relativo dos dois require, que subiu um nível).
// Cada um continua fazendo a própria validação de sessão, a própria checagem de papel e a
// própria escrita no HubSpot. Refatorar o caminho de escrita no mesmo passo em que muda o
// roteamento é como se perde uma ação sem ninguém notar — e aqui as ações são mover etapa,
// registrar nota de campo, marcar visita e corrigir MRR.
//
// O NOME DO CAMPO É `op`, NÃO `acao`
// Duas das cinco já usam `acao` no corpo, com significados diferentes ('criar'/'remover' na
// tarefa de rota, 'confirmar'/'recusar' na sugestão do gestor). Reusar esse nome aqui
// colidiria com o corpo que elas já esperam.
//
// CONTRATO
//   POST /api/negocio-acao
//   Authorization: Bearer <token de sessão do Supabase>   (igual ao de antes)
//   body: { op: 'mudar-etapa' | 'nota' | 'tarefa-rota' | 'mrr' | 'sugestao-gestor', ...resto }
//   O "resto" é exatamente o corpo que a rota antiga recebia — nada mudou de nome.

const ACOES = {
  'mudar-etapa': require('../lib/acoes-negocio/mudar-etapa-negocio'),
  'nota': require('../lib/acoes-negocio/criar-nota-negocio'),
  'tarefa-rota': require('../lib/acoes-negocio/criar-tarefa-rota'),
  'mrr': require('../lib/acoes-negocio/atualizar-mrr'),
  'sugestao-gestor': require('../lib/acoes-negocio/confirmar-sugestao-gestor')
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const op = req.body && typeof req.body.op === 'string' ? req.body.op.trim() : '';
  if (!op) {
    return res.status(400).json({
      erro: 'Falta o campo "op" dizendo qual ação executar.',
      aceitas: Object.keys(ACOES)
    });
  }
  const acao = ACOES[op];
  if (!acao) {
    // Lista as aceitas em vez de só recusar: quem estiver integrando (o PWA, amanhã) descobre
    // o contrato pela própria resposta, sem precisar abrir o repositório.
    return res.status(400).json({ erro: 'Ação desconhecida: ' + op, aceitas: Object.keys(ACOES) });
  }

  /* Cada módulo responde por si — inclusive pela validação de sessão e pelo status de erro.
     O roteador não interpreta nem reescreve resposta: se ele traduzisse erros, a mensagem que
     o executivo vê na rua passaria a depender de duas camadas em vez de uma. */
  return acao(req, res);
};
