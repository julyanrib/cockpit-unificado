# Pessoas do gestor v2 · GAP (06/10/26)

Pacote: `pessoa.zip`. Julyan: "vamos deixar a aba pessoas melhor… pode começar". As decisões abaixo seguem o que ele aprovou para o gestor v2: o recomendado pode ser aplicado. Tudo fica atrás da mesma flag `?gv2=1`.

O código mora em `template/cockpit.template.html`, no bloco `gv2-js`, nas funções `GV2.pessoasMontar`, `GV2.render.pessoas`, `GV2.render.campo` e nas ações. A suíte é `scripts/testar-gestor-v2.js`, com 30 verificações; 9 delas são desta aba.

## As 5 perguntas do pacote

| Pergunta | Resposta (medida no banco em 06/10) | Decisão |
|---|---|---|
| 1. Onde está a data do último 1:1? | Em `um_a_um` (`owner_id`, `data`, `autor`, `resumo`, `compromissos` text[]). Tinha 1 linha. | Reaproveitar. Ganha a coluna `canal` (`video` \| `campo`). |
| 2. Existe registro de ida a campo? | Não. | Tabela nova `gestor_idas_campo`: praça, início, `owner_ids`, `dia_por_owner`, status. |
| 3. `pdi_compromissos` aguenta compromisso verificável? | Não: é um checklist booleano de PDI. | Coluna nova `um_a_um.combinados` jsonb `[{texto, regra, alvo, prazo}]`. `compromissos` (text[]) continua sendo gravado, porque é o que a tela de Desenvolvimento lê. |
| 4. A Agenda do app aceita parada com acompanhante? | Não: `field_route_stops` não tem campo para isso. | **Não mexer na rota do executivo.** "Confirmar ida" manda o roteiro para o sino do app dele (`sugestoes_planos`). |
| 5. Dá para tirar visitas/dia de 4 semanas? | Sim: `visitas_com_prova(segunda−21, hoje)` com `provada`, a mesma regra de prova. | Média por dia útil. A semana atual divide pelos dias úteis até hoje. |

O pacote propunha quatro tabelas (`gv2_um_a_um`, `gv2_compromisso`, `gv2_ida_campo`, `gv2_devolutiva`). Ficou assim: três colunas numa tabela que já existe e uma tabela nova. Migration `0170_pessoas_1a1_e_campo.sql` (PWA), aplicada em 06/10.
- **RLS de `gestor_idas_campo`:** o gestor tem acesso total (`eh_gestor_cockpit`). O executivo lê as idas em que está.
- **Manifesto:** `supabase/POLITICAS.txt` foi regenerado pelo `ler-politicas-do-banco.js`.

## Diferenças conscientes em relação ao pacote

- **"Chamar no vídeo" virou "Pauta no WhatsApp".** Não há `link_1a1` nem telefone no perfil: zero de 24 em `profiles.phone`. O botão abre o WhatsApp com a pauta pronta para colar.
- **Texto sem gênero fixo.** Todo "ele" virou o primeiro nome ("O dia com Kelly", "Kelly conduz, você assiste").
- **Os focos do dia** (títulos, frases, "o que observar") ficam em `GV2.FOCOS` até virarem página do Playbook.
- **Rotação vazia** (é o caso hoje): "Montar rotação" propõe uma praça por semana, a mais urgente primeiro, e só grava em "Salvar rotação". "Reordenar por urgência" mantém a semana atual e reordena as outras, também como proposta.
- **"Campo há Nd" e "1:1 há Nd"** começam como "nunca no campo" e "sem 1:1" (âmbar). Não existe histórico anterior a 06/10, e esse âmbar é verdade, não falta de dado.
- **Desfazer de 5 s** antes de gravar o 1:1 e a devolutiva: o botão vira "Desfazer · 5s".
- **A ida vira `feita`** quando todos daquela ida já têm devolutiva de campo desde o início da semana.

## Fora desta entrega

- **O cartão "Combinado com Julyan" na aba Hoje do app do executivo.** Hoje os combinados chegam pelo sino. O status calculado no app fica para depois, com a mesma função `GV2.conferir`.
- **Desligar `ps6` / `pv6` / `renderCoaching` do gestor:** só depois do aceite com a flag ligada.
