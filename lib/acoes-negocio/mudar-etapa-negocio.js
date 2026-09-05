// api/mudar-etapa-negocio.js
// Função serverless da Vercel — mesma arquitetura de api/criar-tarefa-rota.js: o
// navegador nunca conhece o HUBSPOT_TOKEN; manda dealId + a etapa nova + o token de
// sessão do Supabase, e esta rota valida tudo antes de escrever no HubSpot.
//
// Objetivo (Julyan, 14/08/26): "o executivo tem que poder limpar o lead... pelo
// cockpit... e registrar automaticamente no HubSpot". Este arquivo cobre a parte de
// AVANÇAR/VOLTAR ETAPA. Destinos: as 6 etapas abertas do funil (Prospecção → Ag.
// Pagamento), mais Enviado Onboarding (15/08), Reciclagem (17/08) e PERDIDO (02/09).
// Ganho (1396006162) continua fora de propósito: quem move para lá é o ASAAS quando o
// pagamento confirma, não uma pessoa.
// A frase antiga deste bloco dizia que Perdido tinha ficado fora "nesta rodada" e que
// mudar isso pediria uma rota nova. Não pediu: o que Perdido precisava era de uma
// exigência (o motivo) e de duas isenções na regra de pulo — 12 linhas, não uma rota.
//
// Variáveis de ambiente na Vercel: HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY.

let USUARIOS = [];
try {
  const raw = require('../../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

const { buscarDealAutorizado } = require('../hubspot-deal-guard');

// Mesma ordem canônica usada em todo o resto do cockpit (ORDEM_ETAPAS_FUNIL /
// ORDEM_FUNIL_FICHA no template) — repetida aqui só pra VALIDAR que a etapa pedida é
// uma das permitidas; nunca decide nada sozinha, é apenas a lista de permitidas.
// ATUALIZAÇÃO (15/08/26, Julyan): "ele pode enviar pra onboarding... ele pode
// movimentar pelo cockpit, faça isso" — 1396006163 (Enviado Onboarding) adicionada
// como 7ª etapa alcançável, na sequência natural logo depois de Ag. Pagamento. Isso
// NÃO altera a automação dessa etapa (troca de pipeline + grupo de WhatsApp) — é o
// MESMO PATCH genérico de dealstage que qualquer outra transição já usa; do lado do
// HubSpot, não existe diferença entre "moveu pelo Cockpit" e "moveu na tela do
// HubSpot". "Ganho" (1396006162) FICA DE FORA de propósito: Julyan confirmou que essa
// etapa só é alcançada automaticamente pelo próprio ASAAS quando o pagamento
// confirma — nenhum humano move negócio pra lá manualmente, então não faz sentido
// como destino aqui.
// PEDIDO (17/08/26, Julyan): "adicionar a etapa reciclagem em nosso funil, como já
// fez com enviado onboarding" — 1398311191 (Reciclagem) adicionada como etapa
// alcançável. Sem automação de RPA/ASAAS/WhatsApp amarrada a ela (diferente de
// Ag.Pagamento/Enviado Onboarding) — resgatar um lead esfriado de volta pro funil
// é uma ação comercial comum, não precisa de nenhuma trava especial.
// PEDIDO (02/09/26, Julyan): "criar a etapa perdido, mas sem puxar retroativo para nao
// sujar o cockpit". A etapa já existia no pipeline (1396006164, "Perdido") — o que não
// existia era o Cockpit poder escrever nela: o comentário no topo deste arquivo registra
// que Perdido ficou fora de propósito em 14/08. Entra agora, com uma diferença que
// importa: é a ÚNICA etapa cujo campo obrigatório não é um dado de venda, é o MOTIVO.
// Perda sem motivo não ensina nada, e o Cockpit já tem uma leitura inteira em cima de
// motivo_do_perdido (a assinatura de perda do executivo). Sem o motivo, mover para
// Perdido pelo Cockpit iria alimentar 'Sem motivo preenchido' — quer dizer, pioraria
// justamente o relatório que essa etapa existe para alimentar.
const ETAPAS_ABERTAS = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473', '1396006163', '1398311191'];
const ETAPA_RECICLAGEM = '1398311191';
const ETAPA_PERDIDO = '1396006164';
// Todo destino que esta rota aceita. Separado de ETAPAS_ABERTAS de propósito: aquela é a
// ESCADA (usada pela regra de não pular fase), esta é a PORTEIRA (o que é destino válido).
// Misturar as duas faria Perdido virar um degrau do funil e bloquear 'Prospecção → Perdido'
// como se fosse pulo de fase — o oposto do que se quer: desistir é permitido de onde for.
const ETAPAS_DESTINO = ETAPAS_ABERTAS.concat([ETAPA_PERDIDO]);

// BLOCO 54 (14/08/26) — espelho das propriedades condicionais obrigatórias vistas
// diretamente no pipeline Field Sales do HubSpot. Esta allowlist é a fronteira de
// escrita; um navegador comprometido não pode escolher outras propriedades do CRM.
const PROPS_PERMITIDAS = ['dealname', 'email', 'cnpj_cpf', 'celular', 'cep', 'bairro', 'cidade', 'logradouro', 'numero',
  'origem_do_lead', 'gargalo_operacional', 'nome_do_sistema', 'plano_apresentado',
  'valor_de_mrr', 'pacote_contratado', 'adicional', 'tipo_de_pagamento',
  'periodo_contratado', 'amount', 'mrr', 'deseja_criar_perfil_no_asaas_',
  'qual_maior_desafio_', 'informacoes_sobre_o_maior_desafio', 'data_da_reuniao',
  'reuniao_agendada', 'description', 'motivo_do_perdido',
  /* 04/09/26 — a Kelly preencheu o motivo e a frase do cliente, clicou em "Mover para
     Perdido" e levou "Propriedade nao permitida por esta rota". O campo e coletado por
     CAMPOS_POR_ETAPA['1396006164'] desde 03/09 e esta lista nunca o recebeu: duas listas
     que precisam concordar, e nada as comparava (agora a guarda 19 compara).
     A propriedade existe no HubSpot com este nome exato, label "Observacao Perdido" —
     nao houve mudanca la. */
  'observacao__desqualificado'];

// Exigências para ENTRAR em cada etapa. Este mapa é a barreira de integridade do
// servidor; o mapa equivalente no template existe só para orientar a interface.
const PROPS_OBRIGATORIAS_POR_ETAPA = {
  '1395880469': ['origem_do_lead'],
  '1396005401': [],
  '1395880470': ['gargalo_operacional', 'nome_do_sistema'],
  /* DEMO/PROPOSTA PASSA A EXIGIR O VALOR (02/09/26, revisão das propriedades com o
     Julyan). Esta etapa não exigia NADA, e o MRR só era pedido na Negociação — uma
     etapa depois de a proposta existir. Medido no pipeline: dos 22 negócios em
     Demo/Proposta, UM tinha valor_de_mrr. Proposta sem valor não é proposta que se possa
     medir, e medir na etapa seguinte é medir tarde.
     data_da_reuniao entra junto porque é o que separa 'apresentei' de 'marquei': sem ela
     a etapa aceita um negócio que nunca teve reunião. */
  '1395880471': ['valor_de_mrr', 'plano_apresentado', 'data_da_reuniao'],
  '1395880472': ['plano_apresentado', 'valor_de_mrr'],
  /* AG. PAGAMENTO PARA DE PEDIR amount E mrr (02/09/26). Ela pedia os TRÊS campos de
     dinheiro à mão, e foi isso que produziu a divergência que eu medi no pipeline:
       valor_de_mrr 403 x mrr 244,33 (NGW) · 349 x 299 (O Minas) · 450 x 449 (Adega 12)
       e um caso com mrr 900 num contrato TRIMESTRAL de 900 — o total no campo mensal.
     A consolidação em UM campo digitado (valor_de_mrr, com os outros dois derivados) foi
     tentada em 02/09 e DESFEITA em 03/09: os dois campos que ela apagava são os que a
     automação de fora (RPA/ASAAS) lê para gerar o link de pagamento. Três lugares para
     digitar o mesmo número são três lugares para errar — mas um lugar a menos do que a
     automação precisa é o negócio parado. A reconciliação, se vier, é com o RPA na
     frente e com o Julyan decidindo. */
  /* AMOUNT E MRR, COMO ERA — REVERTIDO EM 03/09/26. Em 02/09 eu troquei os dois por
     valor_de_mrr aqui e no formulario. Estes dois campos sao o que o RPA/ASAAS le para
     gerar o link de pagamento, e a etapa tinha aviso escrito desde 15/08 para nao ser
     tocada. Exigir aqui o que o formulario pede e o que impede o executivo de digitar
     tudo e ainda tomar recusa. */
  '1395880473': ['dealname', 'email', 'cnpj_cpf', 'celular', 'cep', 'numero',
    'pacote_contratado', 'adicional', 'tipo_de_pagamento', 'periodo_contratado',
    'amount', 'mrr', 'deseja_criar_perfil_no_asaas_', 'qual_maior_desafio_',
    'informacoes_sobre_o_maior_desafio'],
  // Enviado Onboarding não pede NADA de novo — o contrato inteiro (plano, adicional,
  // MRR, telefone, etc.) já foi coletado quando o negócio entrou em Ag. Pagamento.
  // Esta etapa é confirmação de pagamento, não coleta de dado.
  '1396006163': [],
  // Perdido exige O MOTIVO, e só ele. É a única exigência desta rota que não é dado de
  // venda: é o que transforma uma derrota em informação. Um clique a mais no pior
  // momento do negócio é o único preço, e ele se paga na Daily seguinte.
  '1396006164': ['motivo_do_perdido'],
  // Reciclagem também não pede nada — resgatar um lead de volta é uma ação de 1
  // clique, sem fricção. Se no futuro fizer sentido registrar "por que esfriou",
  // isso entra aqui como campo opcional, nunca obrigatório (senão o resgate vira
  // trabalho extra e ninguém usa).
  '1398311191': []
};

const VALORES_PERMITIDOS = {
  origem_do_lead: ['Rua', 'Indicação', 'Casa dos Dados', 'Instagram', 'Ads', 'GoogleMaps', 'Familia', 'Eventos'],
  gargalo_operacional: ['Fila', 'Falta de Garçom', 'Falta de Gestão', 'Sem fidelização', 'Demora na divisão de contas', 'Estoque'],
  plano_apresentado: ['Básico (PDV + delivery)', 'Básico (PDV + mesa + delivery)', 'Inovação', 'Pro', 'Enterprise'],
  pacote_contratado: ['Básico', 'Básico (delivery e balcão)', 'Inovação', 'Inovação (delivery e balcão)', 'Profissional', 'Profissional (delivery e balcão)', 'Enterprise', 'Enterprise (delivery e balcão)', 'Upsell', 'Produtos Personalizados', 'Básico (Delivery)', 'Básico (PDV Balcão)', 'Básico (Delivery + PDV Balcão)', 'Intermediário (Delivery + PDV Balcão + PDV Mesa)', 'Apenas Cardapio'],
  adicional: ['Sem adicionais', 'Fiscal SN', 'Maquininha POS', 'Cashback', 'Tablet', 'IA Conversacional (TEKA)', 'Totem de Autoatendimento', 'Robô de Whatsapp', 'Multilojas', 'Campanhas Personalizadas', 'Fiscal LP / LR', 'IA de Fechamento', 'TEF', 'Precificação Dinâmica', 'Display ou Comandas', 'Dark Kitchen', 'Conciliação Bancária', 'Rota Inteligente'],
  tipo_de_pagamento: ['À Vista', 'Crédito'],
  periodo_contratado: ['Mensal', 'Trimestral', 'Semestral', 'Anual'],
  deseja_criar_perfil_no_asaas_: ['true', 'false'],
  reuniao_agendada: ['true', 'false'],
  qual_maior_desafio_: ['Problemas com Atendimento', 'Gestão Financeira', 'Problemas de Gestão', 'Problemas em Fidelizar o Cliente', 'Gerenciar várias lojas', 'Controle fiscal', 'Operação', 'Suporte do sistema'],
  // As seis opções REAIS da propriedade motivo_do_perdido no HubSpot, conferidas via
  // get_properties em 02/09/26 (o rótulo de 'Reembolso' aparece como 'Estorno' na tela do
  // CRM, mas o valor gravado é 'Reembolso' — é o valor que vale aqui). Digitar um sétimo
  // motivo criaria uma fatia nova no gráfico de perda que ninguém pediu.
  //
  // 'SEM RETORNO' CONTINUA AQUI DE PROPOSITO (03/09/26), embora a TELA nao ofereca mais.
  // O Julyan aposentou a opcao: medido nos 981 perdidos de 90 dias, 'Outros' (42%) e 'Sem
  // retorno' (30%) somam 72% de motivos que nao sao decisao do cliente — e 'Sem retorno' e
  // a AUSENCIA de decisao, que pertence a `motivo_saida_cadencia`.
  //
  // Esta lista e WHITELIST DE VALIDACAO: remover um valor daqui faz esta rota RECUSAR
  // qualquer escrita que o traga. O Cockpit nao e o unico escritor — o PWA move etapa pela
  // mesma porta —, e aposentar a opcao quebrando o outro escritor seria trocar um problema
  // de relatorio por um problema de campo. Servidor TOLERA o que existe; tela nao OFERECE
  // o que aposentamos. testar-kanban-etapas guarda essa assimetria, tela dentro do
  // servidor, e continua reprovando o caso perigoso: a tela oferecer valor que o servidor
  // recusa, que trava a passagem de etapa na cara do executivo.
  motivo_do_perdido: ['Preço', 'Funcionalidade', 'Sem retorno', 'Reembolso', 'Não quer mudar de sistema', 'Outros']
};

// PISO REMOVIDO EM 03/09/26 (Julyan: "NAO TEMOS VALOR MINIMO E MAXIMO NESSAS ETAPAS, O
// TICKET DE 349 E O IDEAL Q DEVEMOS VENDER, MAS NAO E OBRIGATORIO"). A lista fica VAZIA
// em vez de o bloco sair: o mecanismo de piso continua aqui, desarmado e com a razao
// escrita, para o dia em que existir um piso de verdade. Piso apagado do codigo volta
// como numero magico solto.
// Historico do que ele causava: negocio fechado a 299 era RECUSADO na gravacao, e o
// executivo nao conseguia mover a etapa de um contrato que ja estava assinado. O mesmo
// piso foi tirado da rota do MRR em 15/08 (ver atualizar-mrr.js) e sobreviveu nesta.
// O comentario antigo dizia: piso comercial do time (R$349/mês, regra do Julyan) — a
// checagem do navegador é conveniência, esta é a que vale.
const PISO_VALOR = 349;
const PROPS_COM_PISO = [];
const PROPS_NUMERICAS = ['amount', 'valor_de_mrr', 'mrr'];

/* ══ UM CAMPO DIGITADO, DOIS DERIVADOS (02/09/26) ═══════════════════════════════════
   O pipeline tem três campos de dinheiro e eles não são a mesma coisa:
     valor_de_mrr — o mensal. É o único que uma pessoa digita.
     mrr          — também mensal, e DIVERGIA do primeiro onde os dois existiam.
     amount       — o total do PERÍODO. Provado no dado: Naha sushi 838 trimestral com
                    amount 2.514; Beto restaurante 465 semestral com amount 2.790.
   Somar amount como MRR infla por 3 ou por 6. E dois campos mensais preenchíveis à mão
   não têm como concordar — medido: 4 divergências em 40 negócios, e um caso com o total
   do trimestre no campo mensal.
   Daqui em diante o servidor DERIVA os dois: mrr é espelho de valor_de_mrr (fica porque
   automações do HubSpot podem ler) e amount é valor_de_mrr x meses do período. Se o
   cliente mandar amount ou mrr, o valor derivado sobrescreve — não é validação, é fonte
   única. Sem período conhecido, amount não é inventado: fica como está. */
const MESES_DO_PERIODO = { 'Mensal': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12 };
/* DERIVAR NUNCA SOBRESCREVE O QUE A PESSOA DIGITOU (corrigido em 03/09/26).
   A versao anterior derivava mrr e amount de valor_de_mrr e mandava por cima do que
   veio no pedido. Em Ag. Pagamento isso apagava, em silencio, exatamente os dois campos
   que o executivo preenche para o RPA gerar o link — o negocio chega naquela etapa com
   valor_de_mrr das etapas anteriores, entao a derivacao SEMPRE vencia.

   Agora a derivacao serve so de preenchimento de lacuna: se o pedido trouxe o campo, o
   valor do pedido manda. Isso mantem o que a derivacao resolvia (Demo/Proposta e
   Negociacao pedem so o mensal, e mrr/amount ficavam vazios no HubSpot) sem tirar a
   caneta da mao de quem esta na frente do cliente. */
function derivarDinheiro(finais, propriedades) {
  const mensal = Number(finais.valor_de_mrr);
  if (!isFinite(mensal) || mensal <= 0) return propriedades;
  const veio = chave => Object.prototype.hasOwnProperty.call(propriedades, chave);
  const saida = { ...propriedades };
  if (!veio('mrr')) saida.mrr = String(mensal);
  const meses = MESES_DO_PERIODO[String(finais.periodo_contratado || '').trim()];
  if (meses && !veio('amount')) saida.amount = String(Number((mensal * meses).toFixed(2)));
  return saida;
}

// ══ CEP E CNPJ SO DIGITOS (04/09/26) ══════════════════════════════════════════════
// O HubSpot RECUSA a escrita inteira quando eles chegam pontuados — medido em auditoria:
// "cep: Enter only numbers and letters, not special characters like -". O executivo
// digita 29050-000 porque e assim que se escreve um CEP. Conferido no CRM: os 543
// negocios com o campo preenchido guardam so digitos, entao limpar aqui e escrever no
// formato que a base ja usa. A tela tambem limpa; esta e a ultima linha, para os
// caminhos que nao passam por ela.
const PROPS_SO_DIGITOS = { cep: 8, cnpj_cpf: 14 };
// == DIGITO VERIFICADOR DE CPF E CNPJ (04/09/26) ===================================
// O RPA do Asaas recusa documento invalido e avisa por WhatsApp horas depois, com o
// contrato ja assinado — medido em auditoria. O caso do dia foi um CNPJ com 13 digitos
// em vez de 14: um zero a menos. A tela ja confere; esta e a ultima linha.
// Aceita CPF (11) e CNPJ (14) porque a base tem os dois no mesmo campo.
function cpfEhValido(d) {
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  for (let corte = 9; corte <= 10; corte++) {
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * (corte + 1 - i);
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== Number(d[corte])) return false;
  }
  return true;
}
function cnpjEhValido(d) {
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const corte of [12, 13]) {
    const p = pesos.slice(13 - corte);
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * p[i];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(d[corte])) return false;
  }
  return true;
}
function conferirCpfCnpj(digitos) {
  if (digitos.length === 11) return cpfEhValido(digitos) ? null : 'CPF invalido — confira o numero.';
  if (digitos.length === 14) return cnpjEhValido(digitos) ? null : 'CNPJ invalido — confira o numero.';
  return 'CPF tem 11 digitos e CNPJ tem 14 — vieram ' + digitos.length + '.';
}

function soDigitos(chave, texto) {
  if (!(chave in PROPS_SO_DIGITOS)) return { valor: texto, erro: null };
  const d = String(texto).replace(/[^0-9]/g, '');
  if (d.length > PROPS_SO_DIGITOS[chave]) {
    return { valor: null, erro: `"${chave}" tem ${d.length} dígitos e o HubSpot aceita ${PROPS_SO_DIGITOS[chave]}.` };
  }
  /* o documento tambem passa pelo digito verificador — ver conferirCpfCnpj */
  if (chave === 'cnpj_cpf') {
    const problema = conferirCpfCnpj(d);
    if (problema) return { valor: null, erro: problema };
  }
  return { valor: d, erro: null };
}

function limparPropriedades(bruto) {
  if (!bruto || typeof bruto !== 'object') return { propriedades: {}, erro: null };
  const propriedades = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (!PROPS_PERMITIDAS.includes(chave)) {
      return { propriedades: null, erro: `Propriedade não permitida por esta rota: "${chave}".` };
    }
    // String vazia é uma escrita válida no HubSpot: significa limpar a propriedade.
    // Antes ela era descartada, mas a API respondia sucesso e o valor antigo reaparecia.
    if (valor == null || String(valor).trim() === '') {
      propriedades[chave] = '';
      continue;
    }
    const texto = String(valor).trim();
    if (PROPS_NUMERICAS.includes(chave)) {
      const n = Number(texto);
      if (!isFinite(n) || n <= 0) return { propriedades: null, erro: `Valor inválido em "${chave}".` };
      if (PROPS_COM_PISO.includes(chave) && n < PISO_VALOR) return { propriedades: null, erro: `"${chave}" abaixo do piso de R$${PISO_VALOR}.` };
      propriedades[chave] = String(n);
      continue;
    }
    if (VALORES_PERMITIDOS[chave]) {
      const valores = chave === 'adicional' ? texto.split(';').map(v => v.trim()).filter(Boolean) : [texto];
      const invalidos = valores.filter(v => !VALORES_PERMITIDOS[chave].includes(v));
      if (invalidos.length) return { propriedades: null, erro: `Valor inválido em "${chave}".` };
      if (chave === 'adicional' && valores.includes('Sem adicionais') && valores.length > 1) {
        return { propriedades: null, erro: '"Sem adicionais" não pode ser combinado com outro adicional.' };
      }
    }
    if (chave === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) {
      return { propriedades: null, erro: 'E-mail inválido.' };
    }
    /* CEP e CNPJ so digitos — ver PROPS_SO_DIGITOS. */
    const limpo = soDigitos(chave, texto);
    if (limpo.erro) return { propriedades: null, erro: limpo.erro };
    propriedades[chave] = limpo.valor;
    continue;
    if (texto.length > 2000) return { propriedades: null, erro: `"${chave}" é longo demais.` };
    propriedades[chave] = texto;
  }
  return { propriedades, erro: null };
}

function campoPreenchido(valor) {
  return valor != null && String(valor).trim() !== '';
}

function validarExigenciasEtapa(deal, novaEtapa, propriedades) {
  const atuais = deal.properties || {};
  const finais = { ...atuais, ...propriedades };
  const obrigatorias = PROPS_OBRIGATORIAS_POR_ETAPA[novaEtapa] || [];
  const movendo = String(atuais.dealstage || '') !== String(novaEtapa);

  // Ao mover, a etapa precisa ficar integralmente válida. Numa edição inline da etapa
  // atual, não bloqueamos saneamento de dados legados, mas impedimos apagar um campo
  // que é obrigatório naquela etapa.
  const faltantes = movendo
    ? obrigatorias.filter(prop => !campoPreenchido(finais[prop]))
    : obrigatorias.filter(prop => Object.prototype.hasOwnProperty.call(propriedades, prop) && !campoPreenchido(finais[prop]));
  if (!faltantes.length) return null;
  return `A etapa de destino exige: ${faltantes.join(', ')}.`;
}

function validarMovimentoEtapa(deal, novaEtapa) {
  const atual = String((deal.properties || {}).dealstage || '');
  // Reciclagem (resgate) não é um degrau do funil — é um bucket lateral. Um negócio
  // parado em QUALQUER etapa aberta pode ser resgatado de volta pra lá, e um negócio
  // resgatado pode voltar a avançar depois. A regra "não pula fase" existe pra
  // impedir pular Prospecção→Ag.Pagamento direto, não se aplica aqui.
  if (String(novaEtapa) === ETAPA_RECICLAGEM || atual === ETAPA_RECICLAGEM) return null;
  // PERDIDO ISENTO NOS DOIS SENTIDOS. Ida: desistir é legítimo de qualquer etapa — exigir
  // que o negócio 'suba' até Negociação para poder ser perdido produziria etapa falsa no
  // histórico só para poder desistir. Volta: perda marcada por engano tem que ter
  // desfazer, senão o Cockpit oferece um botão sem saída — e o executivo aprende a nunca
  // usá-lo, que é o mesmo que a etapa não existir.
  if (String(novaEtapa) === ETAPA_PERDIDO || atual === ETAPA_PERDIDO) return null;
  const iAtual = ETAPAS_ABERTAS.indexOf(atual);
  const iNova = ETAPAS_ABERTAS.indexOf(String(novaEtapa));
  if (iAtual >= 0 && iNova > iAtual + 1) {
    return 'O pipeline Field Sales não permite pular fases. Conclua a próxima etapa antes de avançar.';
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão Supabase válida (mesmo padrão de criar-tarefa-rota.js) ----
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. papel de quem chamou ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  // ---- 3. dados do pedido ----
  const { dealId, novaEtapa, propriedades } = req.body || {};
  if (!dealId || !novaEtapa) return res.status(400).json({ erro: 'Faltam campos obrigatórios: dealId e novaEtapa.' });
  if (!ETAPAS_DESTINO.includes(String(novaEtapa))) {
    return res.status(400).json({ erro: 'Etapa inválida — esta rota move entre as etapas abertas do funil e Perdido.' });
  }

  const limpeza = limparPropriedades(propriedades);
  if (limpeza.erro) return res.status(400).json({ erro: limpeza.erro });

  try {
    // Nunca confia em owner/pipeline/etapa enviados pelo navegador. O HubSpot é a
    // fonte de verdade e é consultado imediatamente antes de qualquer escrita.
    const guard = await buscarDealAutorizado({
      token, dealId, usuario, propriedades: PROPS_PERMITIDAS
    });
    if (guard.erro) return res.status(guard.erro.status).json({ erro: guard.erro.mensagem });
    const erroMovimento = validarMovimentoEtapa(guard.deal, String(novaEtapa));
    if (erroMovimento) return res.status(400).json({ erro: erroMovimento });
    const erroExigencias = validarExigenciasEtapa(guard.deal, String(novaEtapa), limpeza.propriedades);
    if (erroExigencias) return res.status(400).json({ erro: erroExigencias });

    /* DINHEIRO DERIVADO, DEPOIS DA VALIDACAO E ANTES DA ESCRITA. Depois porque a
       exigencia da etapa e sobre o que a PESSOA preencheu; antes porque o PATCH e um so
       e tudo tem que ir junto. O derivado PREENCHE LACUNA e nao sobrescreve: campo que
       veio no pedido manda — ver derivarDinheiro(). */
    const finaisParaDerivar = { ...(guard.deal.properties || {}), ...limpeza.propriedades };
    const propriedadesFinais = derivarDinheiro(finaisParaDerivar, limpeza.propriedades);

    // Etapa e propriedades no MESMO PATCH de propósito: se fossem duas chamadas e a
    // segunda falhasse, o negócio ficaria na etapa nova sem os dados que a etapa exige
    // — exatamente o buraco que este bloco existe pra fechar. Uma escrita, tudo ou nada.
    const resp = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { ...propriedadesFinais, dealstage: String(novaEtapa) } })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({ erro: 'HubSpot recusou a mudança de etapa: ' + (data.message || 'sem mensagem'), detalhe: data });
    }
    return res.status(200).json({
      ok: true, id: dealId, novaEtapa: String(novaEtapa),
      propriedadesGravadas: Object.keys(limpeza.propriedades),
      url: `https://app.hubspot.com/contacts/24373118/record/0-3/${dealId}`
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};
