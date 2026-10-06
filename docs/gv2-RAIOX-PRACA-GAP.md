# Raio X completo (Funil + Praça) e as armas do executivo — GAP

Pacote `zip-raiox-praca` (06/10/26). Medido no banco `mxyjvijclhlxrlafqcrz` e no código em 06/10/26.
O Julyan delegou a aprovação ("tudo o que for recomendado você pode aprovar"). As decisões abaixo
são as recomendadas e foram aplicadas.

## Pré-requisito

`GV2.base` existe (`GV2.montar`, pacote do Cockpit v2, #724). O Raio X lê a mesma base; a Praça
acrescenta uma segunda leitura (`GV2.pracaLer`), feita só quando a aba abre.

## Tabela

| item | existe? | onde | reaproveitar / adaptar / criar | risco |
|---|---|---|---|---|
| Sistema e dor do negócio | sim | `lib/lead-do-funil.js` `FIELD_SALES_STAGE_PROPS` (`nome_do_sistema`, `gargalo_operacional`) → `DATA.funilLeads` | reaproveitar | valor livre e sujo (ver 5) |
| Horário do decisor no negócio | propriedade existe, robô não lia | `hubspot-sync` `QUALIFICACAO_PERMITIDA` grava `melhor_horario_do_decisor` | adaptar: o robô passa a LER a propriedade (nada criado no HubSpot) | nenhum: leitura |
| Decisor do negócio | só na ficha e como contato | `fichas_de_rua.decisor_nome/decisor_papel`; o app cria contato pelo `decisor` | adaptar: ficha + o registro novo de 7 | o contato do HubSpot não desce para o Cockpit |
| Bairro da visita | sim | `client_visits.client_id → clients.bairro` (615 de 718 visitas em 60 dias) | reaproveitar | 103 visitas sem bairro ficam fora do Onde atacar (entram no calor pela lat/lng) |
| Bairro do lead | sim | `leads_prospeccao.bairro` (3.661 de 3.679) | reaproveitar | grafia livre: comparo sem acento e em minúsculas |
| Clientes Takeat | sim | `clientes_takeat` (6.153; 4.943 com lat/lng) | reaproveitar | 773 sem cidade, e nenhum deles tem lat/lng (ver 2) |
| Em queda | sim | `clientes_takeat.em_queda` (718) e `mapa_contexto().queda` | reaproveitar a coluna | o critério é do sync (ver 3) |
| Perdidos com lugar | sim | `DATA.funilLeads[Perdido]` (desde 01/09) com `latitude/longitude` (55 de 91) e `motivo_do_perdido` (91 de 91) | reaproveitar | 36 perdidos sem lat/lng ficam fora do calor |
| Ganhos com sistema | sim | `DATA.funilLeads[Ganho]` (desde 07/09) e `[Enviado Onboarding]` | reaproveitar | histórico curto: o robô corta Ganho em 07/09 e Perdido em 01/09 |
| Notas da praça | sim | `client_notes` (109 em 30 dias; select liberado ao autenticado) | reaproveitar | a nota não tem praça: vem pelo dono do negócio |
| Argumento por concorrente | sim | Playbook `objecao-ja-tenho-sistema`, seção "Os sistemas que a gente enfrenta" | reaproveitar (ver 6) | — |
| Território por bairro | sim | `DATA.territorios` (`data/territorios.json`) | reaproveitar | comparo bairro inteiro, nunca sufixo ("Tijuca" ≠ "Barra da Tijuca") |
| Avançou sem preencher | não | — | criar `gv2_falta_etapa` (ver 7) | tabela nova, só Supabase |
| Mapa de calor | parcial | `pt6CarregarGoogle` + `GV2.mapa` | adaptar (ver nota do calor) | — |

## 1 · Bairro da visita e do lead

**Decisão: nada novo na gravação.** A visita já aponta para `clients`, e `clients.bairro` está
preenchido em 86% das visitas de 60 dias. O lead tem `leads_prospeccao.bairro` em 99,5%.
Reverse geocode na gravação custaria uma chamada paga por check-in para cobrir 14%.
`fichas_de_rua.bairro` (87 de 92) só completa quando a visita teve ficha.

## 2 · Clientes Takeat sem cidade

773 sem cidade; 386 têm CEP e **nenhum tem lat/lng**. Sem coordenada eles não entram no calor de
jeito nenhum. Por isso a correção certa é geocodificar pelo CEP (cidade e ponto juntos), dentro
do `clientes-sync`. Isso fica como pendência do sync, fora deste pacote. A camada "Clientes"
usa os 4.943 com ponto e mostra no rodapé quantos ficaram de fora.

## 3 · Em queda

`clientes_takeat.em_queda`, calculado pelo `clientes-sync` (0122): "sem comanda há N dias" ou
"faturamento −X% no bimestre". `mapa_contexto()` devolve a mesma lista (client_id, motivo,
faturamento, executivo), só para o time. O Raio X lê a tabela direto, porque precisa da lat/lng.

## 4 · Perdidos com lugar

Sim: o negócio perdido desce do robô com `latitude/longitude` (55 de 91) e `motivo_do_perdido`
(91 de 91). `fichas_de_rua.motivo_perdido` só entra no "O que a praça fala" quando o negócio não
tem motivo no HubSpot.

## 5 · Normalização de sistema

Medido em `nome_do_sistema` (HubSpot): saipos 22, nenhum 19, colibri 11, "anota ai" 8, verificar 7,
anotai 6, frest 6, "não usa" 5, "sem sistema" 4, goomer 4, xmenu/"x menu", yooga, "pdv legal",
"cardapio web", combinações ("saipos e cardápio web") e várias formas de "não sei".
Em `fichas_de_rua.sistema`: saipos 6, nenhum 3, goomer 2, "saipos e cardápio web" 1, "anota ai" 1.

Regra (`GV2.normalizarSistema`): `trim → minúsculas → sem acento → sem pontuação`, depois:

| entrada contém | vira |
|---|---|
| saipos, sai pos | Saipos |
| anota ai, anotai, anota a | Anota Aí |
| colibri | Colibri |
| goomer | Goomer |
| consumer | Consumer |
| frest, f rest | Frest |
| yooga | Yooga |
| xmenu, x menu | xMenu |
| cardapio web | Cardápio Web |
| linx | Linx |
| nenhum, nao usa, nao tem, sem sistema, caderno, planilha, manual, na mao, papel | Nenhum |
| vazio, verificar, ?, -, n/a, ., x, não sei, nao informado, perguntar, xxxxx | **não registrado** |
| qualquer outro texto | Outro |

- **Combinação:** vale o primeiro concorrente nomeado ("saipos e cardápio web" → Saipos).
- **Fonte:** primeiro a ficha mais recente do negócio que tem sistema; depois o HubSpot. Um negócio conta uma vez.
- **Ordem:** concorrentes por abertos, depois Nenhum, depois Outro.

## 6 · Argumento por concorrente

O Playbook tem a página `objecao-ja-tenho-sistema`, e o argumento é por **tipo** de sistema, não por marca:

| tipo | sistemas | porta |
|---|---|---|
| PDV / retaguarda | Saipos, Colibri, Consumer, Yooga, Frest, Linx | CMV e ficha técnica |
| delivery / WhatsApp | Anota Aí | Garçom Digital e o salão |
| cardápio digital | Goomer, xMenu, Cardápio Web | CRM, cashback e recompra |
| sem sistema | Nenhum | o caderno no sábado à noite |

- O número "p. N" é a posição da página no Playbook carregado, contada na hora. Sem playbook carregado, o cartão diz só "Playbook · Objeções".
- **Abrir no Playbook** abre essa página.
- A frase de cada tipo é lida da própria página: a citação logo abaixo do "### Se o sistema dele é…". Se a seção mudar de nome, usa o texto que está no código.

## 7 · "Avançou sem preencher"

Tabela nova **`gv2_falta_etapa`** (migration 0171):
`id, negocio_id text, exec_id text, etapa text, faltou text[], armas jsonb, criado_em`.

- O app grava **uma linha a cada avanço para Demo ou Negociação feito pela folha**:
  - "Avançar sem preencher" grava `faltou` com o que faltou;
  - "Avançar com isso" grava `faltou = {}`.
- **`armas`** guarda o que se sabia no momento: sistema, dor, decisor, papel e horário. **Por que essa coluna existe:** o decisor que o executivo digita vira contato no HubSpot, e o contato não desce para o Cockpit. Sem ela, o gestor veria "sem decisor" num negócio que acabou de ser preenchido.
- **RLS:**
  - o executivo insere só com `exec_id = meu_owner_hubspot()` e lê as próprias linhas;
  - o gestor (`eh_gestor_cockpit()`) lê tudo;
  - ninguém altera nem apaga.
- A coluna "Avançou sem preencher" conta as linhas do mês com `faltou` não vazio.

## Nota do calor

O `visualization.HeatmapLayer` do Google foi descontinuado em maio de 2025 e saiu da API em 2026.

- **Decisão:** um calor próprio, num `canvas` sobre o mapa (`OverlayView`), um por camada, com o gradiente da cor da camada e opacidade 0,5.
- Fica igual com o Google e sem ele: fora do PWA, ou sem chave, o calor é desenhado sobre a caixa da praça.

## Praça

- **Recorte:**
  - pessoa → praça pelo nome da praça do cadastro: rj, vv, sp, poa;
  - ponto → praça pela caixa da região metropolitana (lat/lng);
  - sem ponto → praça pela cidade.
- **Não entra:** clientes Takeat fora das 4 regiões (Brasília, Salvador…).
- **"Pro plano":** o Planejamento só existe para o próprio executivo (não há tela do gestor que abra o de outra pessoa). Por isso o botão manda ao sino do app do dono do território, pelo mesmo caminho das sugestões de plano (`sugestoes_planos`): "Põe Méier no plano desta semana: 142 leads abertos e 6 visitas em 30 dias". A regra "nada escreve na rota do executivo" continua valendo.

## Decidido durante a implementação

**Decisor do negócio.** Medido na produção: "Sem decisor" dava 8 de 8 para todos, porque o decisor que o app grava vira CONTATO (cargo Dono/Gerente), e o robô não lia contatos.
- O robô passa a ler esses contatos para os negócios de Decisor em diante (`hsDecisoresDosNegocios`): um lote de associações e um de contatos.
- Se o token não tiver o escopo, ele só avisa no log e segue.

**Horário do decisor.** O robô passa a ler `melhor_horario_do_decisor` (propriedade conferida no HubSpot em 06/10) e `entrouDecisorEm`, que data a dor para a tendência do mês.

**Migrations:**
- **0172** `armas_da_praca(p_owner)`: o agregado da praça para o app, sem nome de cliente. Devolve dores e fechados com sistema e motivo, lidos do snapshot do robô. Para o Rio, deu as mesmas dores que o gestor vê no Raio X.
- **0173** `mapa_negocio`: passa a devolver também o horário e o decisor.

**Precedência das armas no app.** O app passou a usar a mesma regra do gestor: a ficha (ou a folha) mais recente vence o HubSpot. Antes era o contrário.

**"Salvar as armas" pelo cartão.** Grava em `gv2_falta_etapa` com `etapa = 'armas'`. Serve de fonte para as armas, mas não conta como "Avançou sem preencher".

**Sistemas.** Entraram na lista BitiBar, Tronsoft, Queops, Totvs, Teknisa, Cloudify, Data Caixa e PDV Legal: estão no Playbook ou se repetem no CRM. Também viram "não registrado": "não disse", "ir lá", "FUP", "sem resposta" e "teste".

## O que não foi feito

- **Geocodificar os 773 clientes sem cidade:** pendência do `clientes-sync`, ver 2.
- **Ler os contatos do negócio no HubSpot** (Dono/Gerente): o decisor vem da ficha e da folha.
