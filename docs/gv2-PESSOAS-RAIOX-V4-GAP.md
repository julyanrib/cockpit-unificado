# Fase 0 · GAP — Pessoas e Raio X v4 (07/10/2026)

Entrega: `entrega-pessoas-e-raiox-v4` (Claude Design). Medido em produção (Supabase `mxyjvijclhlxrlafqcrz` e o `GV2.base` no Chrome do gestor) às 14h–15h de 07/10.

## 1. Tabela do que existe

| Item | Existe? | Onde | Ação | Risco |
|---|---|---|---|---|
| Casca, menu, tokens `--gv2-*` | sim | `gv2.css`, `gv2-ui.js` (`GV2.navHTML`) | reaproveitar | — |
| Lista "Quem precisa de você" | sim | `gv2-pessoas-v3.js` | adaptar (nova ordem, um motivo, promessa) | baixo |
| Âncoras, scroll-spy, barra do pé | sim | `gv2-pessoas-v3.js` (`p3:ir:*`) | adaptar (+ Disciplina) | baixo |
| Resumo de 5 números | não | — | criar | baixo |
| Reuniões sem desfecho (leitura) | dado sim, tela não | `client_meetings` (gestor lê: `is_field_admin`) | criar a leitura em `GV2.montar` | baixo |
| Desfecho pelo gestor (gravar) | **não** | RLS `client_meetings_update` só deixa `created_by` | **criar RPC** (§3.2) | médio |
| Portas sem "como foi" | dado sim | `client_visits` × `fichas_de_rua` | criar a leitura | baixo |
| Decisor nomeado | dado sim | `fichas_de_rua.decisor_nome` | criar | baixo |
| Fila do app (Feito) | dado sim, **o gestor não lê** | RLS `fila_feitas_le_as_suas` só deixa o próprio | **criar policy de leitura** (§3.3) | baixo |
| Promessa do dia | sim | `dailies.prometido_visitas` (o app grava em `useMinhaDaily.prometer`; o gestor lê por `eh_gestor_cockpit`) | trocar a palavra da semana | baixo |
| Resultado do mês e variável | sim | `pontos_eventos` (contrato, demo_realizada) + `meta_clientes_mes` | adaptar | baixo |
| Provável | sim, **fórmula errada** | `gv2-dados.js:359` (por pessoa) e `:109` (soma) | trocar a fórmula (§2.6) | baixo |
| Dedup de repetidos | não | — | criar em `gv2-dados.js` | médio (§2.5) |
| "Melhor" no funil | sim, **errado** | `gv2-dados.js:121-127`, `gv2-ui.js:305` | trocar a regra | baixo |
| Funil por pessoa | dado sim | `p.funil_mes` | criar a tabela | baixo |
| Dinheiro com "sem valor" | dado sim | `GV2.base.negocios[].mrr` | adaptar | baixo |
| Tempo de ciclo | **dado insuficiente no app** | §2.7 | precisa do robô (`createdate` do negócio) | médio |
| Perdas do mês | dado sim | `fichas_de_rua.motivo_perdido` (+ HubSpot no robô) | criar | baixo |
| Fonte do lead | dado sim | `client_visits` + `clients.lead_prospeccao_id` + `client_stage_changes` | criar | baixo |
| Prospecção por pessoa | dado sim, **definição muda** (§2.8) | `leads_prospeccao` | criar | baixo |
| Mapa de calor maior + Expandir | sim | `gv2-praca-ui.js` (canvas próprio; o `HeatmapLayer` do Google saiu da API) | adaptar o tamanho | baixo |
| Grade da Rua: Palavra → Promessa | sim | `gv2-ui.js:450-458` | trocar | baixo |

## 2. Respostas

### 2.1 Reuniões sem desfecho

```sql
select created_by, count(*) from client_meetings
where status = 'agendada' and scheduled_at < now() - interval '2 hours' group by 1;
```

Bate com o pedido: **Sandro 94, Bruno 83, Kelly 56, Marco 23, Renata 14, André 5, Sérgio 5.**

**Achado que muda a leitura.** A tabela inteira só tem dois estados: `agendada` (557) e `cancelada` (10). Nenhuma reunião foi marcada como `realizada`. O app tem o botão ("Registrar" na Agenda grava `realizada`, `AgendaNovoScreen.tsx:303`), mas ninguém usa. Então as 280 não são 280 reuniões furadas: são reuniões que **ninguém fechou no app**, muitas delas aconteceram. A tela não pode chamar isso de "furou"; o texto certo é "sem desfecho".

### 2.2 Desfecho pelo gestor
- **Valores.** Hoje o app grava `realizada` (Registrar) e `cancelada` (tirar ou cancelar). Não existe "não aconteceu". Proposta:
  - Aconteceu = `realizada`;
  - Não aconteceu = `nao_aconteceu` (valor novo; não há CHECK em `status`);
  - Remarcar = muda `scheduled_at` e continua `agendada`.
- **O gatilho `tg_agendado_no_plano`:**
  - `realizada` e `nao_aconteceu` não mexem no plano (só `cancelada` ou a troca de data tiram o slot), o que está certo para dia passado;
  - Remarcar move o slot como hoje.
- **O app precisa de um ajuste:** `App.tsx:7357` e a Agenda tratam como fechado só `realizada` e `cancelada`. Também `nao_aconteceu` tem de sair da Agenda, senão "Não aconteceu" no gestor deixa a reunião viva no app (teste de aceite 6).
- **Permissão (RLS).** O gestor **não** pode gravar: `client_meetings_update` exige `auth.uid() = created_by`. Proposta: uma RPC `reuniao_desfecho(p_id uuid, p_status text, p_quando timestamptz default null)` `security definer`:
  - aceita só `realizada`, `nao_aconteceu` ou remarcar;
  - quem chama tem de ser o dono ou `is_field_admin()`;
  - assim a policy de UPDATE não se abre para o gestor mexer em outros campos.

### 2.3 Portas sem "como foi"
Join por `visited_by = criado_por`, `client_id` e **dia em Brasília**, nos últimos 7 dias, sem visitas declaradas.

| | Portas 7d | Sem ficha | Fichas sem check-in |
|---|---|---|---|
| André | 17 | 4 | 4 |
| Bruno | 19 | 3 | 0 |
| Kelly | 23 | 2 | 3 |
| Marco | 6 | 0 | 2 |
| Renata | 16 | 1 | 0 |
| Sandro | 21 | 3 | 0 |
| Sérgio | 13 | 1 | 0 |

- O pedido citava "Bruno 13 × 11" e "Kelly 16 × 18". Esses são números do **mês**, não de 7 dias.
- O fixture tem "Sandro 8 de 15", que não existe: o real são 3 de 21.

### 2.4 Promessa do dia
- **É a mesma linha.** O app grava `dailies(seller_id, data, prometido_visitas)` com upsert em `seller_id,data` (`useMinhaDaily.ts:159`); o gestor lê por `dailies_select` (`eh_gestor_cockpit`).
- **Vazia** para os 7 nos últimos 14 dias.

### 2.5 Repetidos
- **Regra:** mesmo `dono` + nome normalizado igual (sem acento, sem "restaurante/bar/pizzaria", só letras e dígitos). Roda em `GV2.montar` sobre o snapshot (`negocios`).
- **São 12 grupos, não 15.** Os 15 da auditoria usavam prefixo de 12 letras e pegaram falsos, como "Restaurante Pizzaria Thailan" × "Restaurante Paulista & Cia":
  - Renata:
    - TODO DIA TODA HORA ×2 (Prospecção, Decisor)
    - Asinha bar ×2 (Prospecção, Visita)
    - Best chicken ×2 (Visita, Visita)
    - Diz o Ditado ×2 (Visita, Visita)
    - Restaurante Trajano II ×2 (Visita, Decisor)
    - BENE RESTAURANTE ×2 (Visita, Decisor)
  - Sérgio:
    - Padaria Maria Cereja ×2 (Prospecção, Visita)
  - André:
    - Sushi delícia ×3 (Visita, Decisor, Negociação)
    - Top Gourmet ×3 (Visita, Negociação, Negociação)
    - Matuto Nordestino ×2 (Visita, Decisor)
    - Galpão bier ×2 (Visita, Decisor)
    - Duda Lanches ×2 (Visita, Negociação)
- "Julí Comida Saudável" × "JULI COMIDA DE VERDADE" (Sérgio) **não** casa pela regra exata. Fica de fora de propósito: casar nome parecido acusaria unidades diferentes de rede.
- **Risco:** rede com o mesmo nome em unidades diferentes (Top Gourmet ×3?). O selo só avisa e conta uma vez; nada se junta.

### 2.6 Provável
- **Hoje:**
  - `gv2-dados.js:359` calcula `fechado + round(0,5·quentes + 0,2·mornos)`, com `quente = etapa ≥ Negociação` (inclui Ag. Pagamento);
  - `:109` soma por pessoa: **23**;
  - o cockpit antigo usava `fechados + agPag + quentes×60%`: **15**.
- **Novo (decisão 1 do pedido):** `fechados + agPag + round(0,6 × Negociação)`, por pessoa, e o time é a soma.
  - Com a base de 07/10: 4 fechados + 1 Ag. Pagamento + round(0,6 × 17 em Negociação) = **15**.
  - O fixture diz "4 + 3 + 8"; o real é 4 + 1 + 10, por pessoa.
- **Muda junto a definição de "quente" na tela:** passa a ser **Negociação** (17), sem Ag. Pagamento.

### 2.7 O que o fixture inventou, medido

**Dinheiro por etapa** (snapshot):

| Etapa | Negócios | Com valor | MRR |
|---|---|---|---|
| Decisor | 41 | **0** | R$ 0 |
| Demo/Proposta | 9 | 8 | R$ 3,7k |
| Negociação | 17 | 17 | R$ 5,6k |
| Ag. Pagamento | 1 | 1 | R$ 759 |

De Decisor em diante são 42 sem valor (41 + 1).

**Tempo de ciclo:**
- dos 36 contratos de set–out, só **7** têm a primeira visita em `client_visits`;
- os outros nasceram no HubSpot antes do check-in, e `client_stage_changes` também só tem 9;
- mediana honesta não sai do app: **precisa do robô** gravar `createdate` → `closedate` do negócio no snapshot (campo novo `cicloDias` em `fechados`);
- até lá, a tela mostra "—" ("sem mediana honesta"), como a prancha prevê.

**Perdas do mês** (`fichas_de_rua.motivo_perdido`): Outros 5 · Não quer mudar de sistema 4 · Preço 1. Os motivos do HubSpot entram pelo robô.

**Fonte do lead** (portas de 30 dias; "avançou" = mudança para Decisor ou adiante depois da visita):

| Origem | Portas | Avançaram | Taxa |
|---|---|---|---|
| Conta-alvo | 30 | 7 | **23%** |
| Carteira | 51 | 10 | 20% |
| Criado na rua | 216 | 14 | 6% |

O fixture diz conta-alvo 28%.

**Prospecção por pessoa:**
- atribuídas: Renata 782, Sérgio 728, Kelly 385, Marco 338, Bruno 318, Sandro 212, André 195;
- visitadas com prova: 6, 8, 1, 3, 3, 2, 10, na mesma ordem;
- "viraram negócio" (`hubspot_deal_id`): 35, 33, 8, 18, 24, 22, 31.

**A definição do pedido não fecha.** O negócio nasce na **importação** (`criado_hubspot`), não na visita, então "viraram negócio" > "visitadas". Proposta: **atribuídas → visitadas com prova → avançaram depois da visita**.

**Playbook** (`p.playbook`, nível e dias parado):
- Marco 1/26
- Bruno 2/31
- Sandro 1/nunca
- Kelly 1/2
- Renata 1/nunca
- André 2/29
- Sérgio 2/29

**Meta do mês:**
- Marco, Bruno, Sandro e Kelly: 8 cada;
- Renata, André e Sérgio: 2 cada;
- total 38.

### 2.8 Os três conflitos
- **Fechados de Marco:** a base de hoje (`pontos_eventos` contrato, outubro) diz **2**. O fixture usa 0; o certo é 2.
- **Check-ins de Kelly em 05/10:** **0**. Os 6 de 6 são de terça, 06/10. O fixture está errado; a tela usa o dado.
- **Data:** 13/10/2026 é terça. A Pessoas v3 no ar não tem "seg 13/10" (a ida sugerida diz "semana de 12/10"). Nada a corrigir.

## 3. Mudanças fora do cockpit (precisam de ok)
1. **Migration** `reuniao_desfecho` (RPC security definer), mais o valor `nao_aconteceu` tratado como fechado.
2. **Policy** `fila_feitas_gestor_le`: `for select using ((select is_field_admin()))`.
3. **App:** `nao_aconteceu` sai da Agenda (`App.tsx:7357` e `AgendaNovoScreen`), igual a `realizada`.
4. **Robô do snapshot:** `cicloDias` (createdate → closedate) nos fechados. Sem isso, o ciclo fica "—".

## 4. Ordem proposta (a do pedido)
1. Dados: dedup, provável, melhor, puxar e quente = Negociação, com testes.
2. Pessoas: resumo, Disciplina (com a RPC), promessa.
3. Pessoas: Funil e 640.
4. Raio X › Funil.
5. Raio X › Praça.

Tudo atrás do mesmo cockpit novo, sem flag nova.
