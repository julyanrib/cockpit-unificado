# Cockpit do gestor v2 · GAP (06/10/26)

Pacote: `vasco.zip` (Claude Design, 05/10). O Julyan delegou: "tudo o que for recomendado você pode aprovar". Por isso as decisões abaixo já estão aplicadas. Onde o spec conflitava com o código, venceu o código, e a linha diz por quê.

**Onde mora.** O código fica em `template/cockpit.template.html`, entre os marcadores:
- `<style id="gv2-css">` e `<!-- /gv2-css -->`;
- `<div id="gv2Raiz">`;
- `<script id="gv2-js">`, com o namespace `GV2`.

**Flag.** `?gv2=1` liga e grava em `localStorage.gv2`; `?gv2=0` desliga. Sem a flag, nada muda para ninguém. `aplicarVisaoPorPapel` chama `GV2.ligar()`, e a casca só aparece para `role === 'manager'`.

## A base: de onde vem cada número

| Item do spec | Existe? | Origem real | Decisão |
|---|---|---|---|
| Time (pessoas) | sim | `DATA.reps` (o robô já tira `foraDoTime` e `desligado`, `fetch-hubspot.js:507`) | Reaproveitar. 7 pessoas hoje. O exemplo do pacote tem 9 fictícias. |
| `meta_visitas_dia` | sim | RPC `planejamento_do_time` → `dias[].meta` (função `meta_visitas`, a mesma do app) | Reaproveitar. Não usa o 6 fixo (`V5_META_VISITAS`). |
| `fase` | sim | `rampDoOwner(ownerId).label` | Mostra o rótulo real (Pleno, Semanas 2–3…), em vez de "Pleno/Rampa". |
| `meta_clientes_mes` / meta do mês | sim | `metaClientesDoRep(r)` | A soma das pessoas dá 38, igual ao "3 de 38 contratos" da Semana atual. |
| `hoje.paradas_plano`, `ontem.*`, `semana_planejada` | sim | `planejamento_do_time(p_segunda, donos, hoje)`, com `dias[].planejadas/provadas/feitasDoPlano`. Ontem na segunda = sexta, por uma segunda chamada da semana anterior. | Reaproveitar (é o Planejamento do gestor). |
| `hoje.visitas_com_prova` | sim | mesmo RPC (`provadas`), com a regra de `visitas_com_prova`: 200 m / 500 m, foto, série | Reaproveitar. Não reclassifica no cliente. |
| `hoje.status` / `posicao` / `ultima_atividade` | parcial | `mapa.checkins` de hoje (lat, lng, nome do cliente, hora) e `pessoas[].ultimo` | Criado no cliente: último check-in ≤ 40 min = em visita, depois disso deslocando, nenhum hoje = sem check-in (posição do último conhecido). |
| `hoje.paradas` (rota no mapa) | sim | `mapa.plano` (lat, lng, feita, hora) | Reaproveitar. |
| `palavra_dada` | sim | `planos_semanais.promessa_dada_em` (vem no RPC) | Reaproveitar. |
| funil · portas | sim | `visitas_com_prova(1º do mês, hoje)`, `provada = true` | — |
| funil · decisor | sim | `fichas_de_rua.como_foi = 'falou_com_decisor'` no mês | — |
| funil · demo | sim | `pontos_eventos.tipo = 'demo_realizada'` no mês | A mesma fonte do ranking. |
| funil · proposta | **não existe registro** | Entrou em Negociação no mês: `client_stage_changes` (app e cockpit) ∪ negócio em Negociação há menos dias úteis que o mês | Aproximação documentada na Prova. Mudança feita direto no HubSpot e já fora de Negociação escapa. |
| funil · fechado | sim | `pontos_eventos` `contrato` − `estorno` no mês | O mesmo número do ranking ("3 de 38"). |
| Negócios | sim | `DATA.funilLeads`, as 6 etapas abertas | MRR por `mrrDoNegocio`. Próximo passo por `proximoPassoDoLead`. |
| Régua | sim | `DATA.stageMeta.slaDays` = 5·5·4·3·7·2 dias úteis | Igual ao spec. A tabela `stage_sla` do app tem outros valores (3·2·3·5·3) e **não** é usada: "não mudar a régua". |
| Travado | sim | `lead.slaBreach` | **Conflito:** o spec diz `dias > régua`; o Cockpit não acusa estouro quando há próxima atividade futura (`estadoDaRegua`). Venceu o código, para o número bater com Meu funil e Raio X. |
| Propostas · lista | **não existe** | Negócios em Negociação e Ag. Pagamento, mais Demo/Proposta com `plano_apresentado` | "Vale até" = fim da régua da etapa, porque o Cockpit não guarda a validade da proposta (`prcDataValidade` calcula 3 dias e não grava). Aceita = Ag. Pagamento. |
| Propostas · por pessoa | **não existe** | A mesma regra da proposta do funil (semana e mês); aceitas = contratos do mês | — |
| Vender | sim | Motor `prc*` (`#precificacaoContent`), **movido** para dentro da casca e devolvido ao sair | Nada reimplementado: preços em `pricing_config`, o PNG, o envio e o registro no HubSpot são os de hoje. |
| Playbook · trilha por pessoa | parcial | `playbook_progresso` (e-mail, slug, data) e as páginas de `playbookDados()` por capítulo (`PB9_CAPITULOS`) | Capítulo concluído = todas as páginas lidas ou provadas. Parado = 7 dias sem concluir nada. São 7 capítulos: Liderança é só do gestor. |
| 1:1 e compromissos | sim | tabela `um_a_um` (`owner_id, data, autor, resumo, compromissos[]`), a mesma do registro de 1:1 do Desenvolvimento | **Sem tabela nova**: o `gestor_compromissos` proposto no spec não é necessário. |
| "vão para o app dele" | sim | `sugestoes_planos` (o sino do app), por `pt6EnviarRecado` | Cada compromisso da daily e do 1:1 vai para o sino. |
| Cobrar negócio | sim | `POST /api/negocio-acao` `{op:'nota', tipoAcao:'proximo-passo'}` (o mesmo do Cobrar em lote do Raio X) | Vira tarefa datada de hoje no app do dono. |
| Cobrar pessoa (sem plano) | sim | sino do app (`sugestoes_planos`) e WhatsApp | — |
| Telefone do executivo | **não existe** | `profiles.phone` está vazio para os 24; `usuarios.json` não tem telefone | O WhatsApp abre com `wa.me/?text=` e o gestor escolhe a conversa. "Ligar" virou **Chamar**: não há número para discar. |
| Mapa | sim | Google Maps do app (`pt6CarregarGoogle`, só dentro do PWA) | Fora do PWA, ou sem chave, entra uma projeção simples dos pontos. |
| Mapa → Agenda do app do dia | não | o app não abre a agenda de outra pessoa | "Mapa" leva para Rua › Hoje com a pessoa destacada. |

## Números de hoje contra a fonte

- A meta do mês soma 38: 8+8+8+8+2+2+2, igual ao ranking `meta_coletiva`.
- Visitas, planos e semana são o mesmo RPC do Planejamento do gestor, então batem com a aba atual por construção.
- A Prova (menu do avatar › Prova dos números) roda `GV2.testes.prova()` a cada carga. Se a linha Time ≠ KPIs de Time/Raio X ≠ filtros do Raio X, ela dá `console.error('[gv2] número não bate', …)` e põe o aviso no canto.

## O que ficou de fora, e por quê

- **Tomada de contas e Radar:** continuam na aba antiga. Rua › "Tomada de contas e Radar" abre a aba Rotas & Prospecção, com o botão "Voltar ao cockpit novo".
- **Remover as views antigas:** fica para depois do aceite com a flag ligada por uma semana (Parte 11.12).
- **Registro de proposta enviada** (para "quanto cada um envia" exato): precisaria gravar no envio do `prc*`, que o executivo também usa. Fica como próximo passo, se o Julyan quiser.
