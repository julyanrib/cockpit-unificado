# Território v3 · decisões (02/11/26)

Handoff: `design_handoff_territorio_v3` (README, protótipo `GestorV2.dc.html` estados tFunil/tPlano/tResgate/tMapa, 20 telas-alvo).
Branch do Cockpit: `feat/territorio-v3`. Banco: `PWA-app-outbound`, branch `feat/territorio-v3-banco`, migração `supabase/migrations/0248_territorio_v3.sql` (escrita, **não aplicada**; o número 0247 ficou com outra migração).

## 1. A regra que manda em tudo

**Nada é gravado no plano do executivo sem ele confirmar.** O gestor não escreve em `planos_semanais` nem marca `na_rota`. Ele cria **sugestões** (`territorio_sugestoes`). O motor que já existe no Planejamento v3 (`PLV3.sugestoes`, pelo bairro do dia escolhido pelo executivo, até 3 contas-alvo por dia) mostra as vivas na grade dele, na frente das outras contas-alvo, com o selo **RECÉM-ABERTO**. Só o "Pôr" do executivo grava a grade. **Um motor só**: a v3 não criou regra nova de dia; ela só muda a ordem das contas-alvo (a do gestor primeiro) e o peso do bairro automático do dia vazio.

## 2. O fluxo "definir carga → pôr no plano → executivo confirma na grade"

| Passo | Quem | Onde grava |
|---|---|---|
| 1. Define a carga (− N +, 1 a 12) | gestor, aba Território | `territorio_carga` (uma linha por gestor) via `definir_carga_territorio(p_carga)`; sem a 0248 o número vale só na tela e nada é gravado |
| 2. "Pôr N no plano de cada um" | gestor | `territorio_sugestoes` via `sugerir_no_plano(p_leads, 'carga')`: uma linha por recém-aberto, `semana` = segunda da semana do plano (sábado e domingo já são a próxima), `vale_ate` = sexta. **Nada** em `planos_semanais` nem em `leads_prospeccao` |
| 3. A grade do executivo mostra | Planejamento v3 do Cockpit (`PLV3.dados`) | só leitura: `PLV3.sugGestor` lê as vivas dele (`vale_ate >= hoje`, sem confirmação, da semana em foco); `PLV3.alvosDoGestor` põe essas contas-alvo na frente; o bloco "SUGESTÃO · BAIRRO" do dia mostra o selo RECÉM-ABERTO |
| 4. Executivo confirma ("Pôr" / "Pôr as N") | executivo | o caminho de sempre (`PLV3.porNoDia` → `pl6AgendarNoSlot`: cria o negócio, a tarefa e grava `planos_semanais.grade`); depois que a grade gravou, `confirmar_sugestao_territorio(p_lead)` anota `confirmada_em` |
| 5. Não confirmou até sexta | ninguém | nada: a sugestão vence pela data (`vale_ate`) e o lead volta à ordem normal do motor. Sem cron |

O Cockpit do gestor conta "N já confirmaram" pela anotação **ou** pelo lead na grade da semana **ou** com negócio (a anotação não é condição).

"Redistribuir" e "dar dono" seguem o mesmo trilho: criam sugestões (origem `resgate` na semana atual; `dono_novo` na **próxima** semana do dono).

## 3. Antes → depois (nada sumiu)

| Item da v2 | Antes | Depois |
|---|---|---|
| Aviso de carga (a carga de domingo não trouxe nada) | topo do corpo | igual, no mesmo lugar (antes do funil) |
| Filtro de praça (Todas/RJ/SP/POA/ES) | cabeçalho | igual; vale também para funil, carga, resgate, cobertura e tabela de 30 dias |
| 5 números (Entraram, Visitados com prova, Com negócio, Parados, Vencendo) | logo abaixo do aviso | iguais, logo abaixo da carga e do resgate |
| Onde agir (5 regras, 3 em destaque) | igual | igual; o "Pro plano" virou **"Sugerir no plano"** (cria sugestão, origem `gestor`) e o seletor "Para quando" virou uma linha explicando que o dia é o do bairro dele |
| Mapa "Territórios" (cores por dono, losangos da carga, anel) | um mapa | lente **"carga da semana"** do novo mapa (seletor no título); a lente padrão é **"cobertura · 4 semanas"** |
| Por executivo (semana, meta de 5, Cobrar, Pro plano, gaveta) | uma tabela | aba **"semana · meta de 5"** da seção; a aba padrão é **"30 dias · programa"** |
| Contra quem | fim da aba | igual |
| Gaveta do executivo (recém-abertos) | igual | igual; "Pro plano" → "Sugerir no plano" (o já sugerido mostra "sugerido · até sex DD/MM") |
| Painel do concorrente (pxsis) | igual | igual |
| Novo | — | Funil do programa + gargalo; A carga cabe na rua; Resgatar o que vence; Cobertura + dar dono; Por executivo · 30 dias com total |

## 4. Decisões e definições

1. **Funil · 30 dias** (`GV2.t3Modelo`): *entraram* = recém-abertos da Casa dos Dados criados nos últimos 30 dias (Brasília); *atribuídos* = desses, os que têm como dono um executivo do time com território (dono fora do time ou sem dono não conta); *na rota* = atribuído que está na rota hoje, **ou** esteve na grade de alguma semana (`n-<lead>` em `planos_semanais.grade` das últimas 5 semanas), **ou** foi visitado com prova, **ou** tem negócio; *negócios* = tem negócio no lead ou no pino. Assim o funil só desce.
2. **Gargalo** = a menor passagem (atribuído/entrou, rota/atribuído, negócio/rota); a frase é escrita pela regra (`GV2.t3Gargalo`).
3. **Paridade**: o funil e a tabela "Por executivo · 30 dias" saem da **mesma passada** (o lead atribuído entra na linha do dono, e a praça do lead atribuído é a do dono); a linha "Total · bate com o funil" fica na tela e `scripts/testar-territorio-v3.js` prova em todas as praças e em cada uma.
4. **Visita = com prova**: `visitas_com_prova` (`provada`), a mesma régua da v2, da Pessoas e do app.
5. **Conversão programa × carteira**: programa = dos recém-abertos visitados com prova, quantos têm negócio (nunca passa de 100%). *Carteira* = a mesma conta nas **outras contas-alvo** dele (pinos de munição que não são recém-abertos) visitadas com prova nos 30 dias. Visitas à carteira de negócios já abertos dariam ~100% e não comparariam nada.
6. **"o time visitou (semana passada)"** = o mesmo número do KPI "Visitados com prova" da v2 (regra 4 do handoff).
7. **"chegam por semana"** = entraram em 30 dias ÷ 30 × 7.
8. **Pôr no plano**: N por executivo (descontando as sugestões vivas dele), os que vencem primeiro, depois os mais novos; nunca o visitado, o que está na rota, o com negócio ou o já sugerido.
9. **Resgate**: vence = 76 a 90 dias de abertura, `pendente`/`atribuido`, sem visita e sem negócio (a régua da expiração das 06:40). Destino por bairro: o dono oficial do bairro (com o dia dele lá na semana, se escolheu); senão quem escolheu dia lá; senão quem mais visitou lá em 4 semanas; senão **sem dono → deixar sair** (pede confirmação no segundo clique). "Saem do mapa até" = o último a sair (dia seguinte ao 90º).
10. **Cobertura**: visitas com prova de qualquer executivo, nas contas do bairro (pinos de munição pelo bairro do lead; demais clientes visitados pelo bairro do cliente), 4 semanas. Coberto ≥ 4; parcial 0 a 3 com dono; **sem dono** = nenhum executivo ativo cobre o bairro no território oficial.
11. **Quem já roda perto**: executivos da praça, pelo bloco oficial deles mais próximo (centro = média das coordenadas das contas do bairro; sem coordenada, distância no desenho, "vizinho no mapa").
12. **Dar dono** só move bairro de `_sem_dono` ou de quem tem `ativo: false`; se alguém ativo cobre o bairro, a função recusa. Antes de mexer, guarda a configuração inteira em `territorios_backup_dar_dono_<data>`.
13. **Avisar, não travar**: sem a 0248, a leitura das tabelas falha com "não existe" e a aba mostra uma nota discreta ("dependem de uma atualização do servidor…"); os botões avisam e não gravam. A guarda 24 ganhou `AGUARDANDO_MIGRACAO` para as duas tabelas (reprova quando a 0248 entrar e o POLITICAS.txt for regerado, para o item sair).
14. **Medição**: `registrar_abertura('territorio','menu','aberto')` uma vez por dia (pelo `GV2.pv2Medir`), e as ações (`definiu_carga`, `pos_no_plano`, `redistribuiu`, `deixou_sair`, `deu_dono`). Antes da 0248 a função recusa em silêncio.
15. Dias úteis via `GV2.util` (feriado fora: seg 02/11 é Finados e aparece "feriado" na prévia da grade); fuso America/Sao_Paulo; tokens `--gv2-*`; Poppins; zero emoji; alvos ≥ 40 px.

## 5. Divergências das telas-alvo e por quê

- **Cartograma**: os blocos mantêm a **posição geográfica** do layout da v2 (`GV2.T10_LAYOUT`), um bloco por célula; o protótipo varia o tamanho pelo volume. Mudar o tamanho quebraria o desenho por praça que a v2 já valida (e a lente "carga da semana" usa o mesmo layout).
- **"Os outros ≈ N ficam no motor, sem atribuir"** virou "seguem na lista de cada um, sem entrar no plano": hoje o roteador atribui todo recém-aberto que chega; a frase do protótipo prometeria um comportamento que não existe.
- **Por executivo**: flat, ordenado por praça; ganhou a linha "Total · bate com o funil" (não está no protótipo) para a paridade ficar visível. "+N sugeridos" aparece só para quem tem sugestão pendente.
- **Prévia da grade**: abre no executivo com mais sugestões, com chips para trocar; sugestão sem dia daquele bairro aparece numa linha "Esperando o dia do bairro".
- **"desfazer · protótipo"** virou "Retirar as N pendentes" (as confirmadas ficam) e "Cobrar quem não confirmou".
- **Header**: mantém o subtítulo da v2 (carga e próxima rodada) com o prefixo "o motor de prospecção da praça".

## 6. O que a 0248 faz, item a item

1. `aberturas_de_tela`: tela `territorio` e as 5 ações novas; `registrar_abertura` recriada com a mesma assinatura e todas as telas atuais.
2. `territorio_carga` (RLS: o gestor lê a dele) + `definir_carga_territorio(int)` (gestor, 1 a 12).
3. `territorio_sugestoes` (RLS: gestor lê tudo; executivo, as dele) + `sugerir_no_plano(uuid[], origem)`, `retirar_sugestoes_territorio(date)`, `confirmar_sugestao_territorio(uuid)`; helpers `_territorio_hoje`, `_territorio_semana`, `_territorio_chave`, `_territorio_ativo`, `_territorio_sugerir`.
4. `redistribuir_recem_abertos(uuid[], text)`: troca o dono quando é outro (o pino segue pelo gatilho `municao_lead_mudou` → `municao_sincronizar_pino`, conferido no banco) e cria a sugestão `resgate`.
5. `deixar_sair_recem_abertos(uuid[])`: a mesma marca de `expirar_recem_abertos` (status `expirado`, `status_antes_de_expirar`, `expirado_em`, pino sem negócio e sem visita arquivado com `expirado_90d`), só para os escolhidos com 76+ dias.
6. `dar_dono_bairro(bairro, município, uf, rep)`: cópia, move o bairro, atribui os pendentes do bairro e cria sugestões `dono_novo` na próxima semana.

Validação: o DDL e as funções rodaram dentro de uma transação desfeita no banco de produção (com a sessão de um gestor): semana 02/11, sábado 07/11 → 09/11, 5 sugestões criadas e 0 repetidas, medição gravada, dar dono num bairro fictício gravou a cópia e o bairro, a segunda chamada recusou ("já tem dono ativo"), retirar devolveu 5. Nada ficou gravado. Redistribuir e deixar sair não foram exercitados no banco (mexem em leads/pinos com gatilhos), só pela suíte do Cockpit.

## 7. Pendências

- **Aplicar a 0248** (Supabase pede ok) e regerar `supabase/POLITICAS.txt`; depois tirar as duas tabelas de `AGUARDANDO_MIGRACAO` na guarda 24.
- O app (PWA) não tem a grade com contas-alvo sugeridas: a confirmação acontece no Planejamento do Cockpit. Mostrar a sugestão do gestor no app é uma mudança do app.
- A meta de 5 por semana da v2 (e do mapa do app) não muda com a carga: a carga define quantas sugestões cada um recebe. Unificar as duas é decisão de produto.
- O `GV2.t10Plano` (pôr na rota direto) ficou no código, sem botão na aba, porque a suíte da v2 o mede; pode sair numa limpeza.
