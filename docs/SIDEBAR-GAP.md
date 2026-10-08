# Sidebar do gestor · Fase 0 (GAP) · 07/10/2026

Entrega: `kmkm.zip` (Claude Design). Medido no código de produção (cockpit `ab5dfc4`).

## 1. Onde a sidebar é renderizada
- **Um componente só**: `GV2.navHTML` (fonte `gv2-ui.js:83`, injetado em `template/cockpit.template.html` ~74380). Todas as 7 abas do gestor usam a mesma; nada a juntar.
- Esqueleto de carregamento com 6 itens: `gv2-ctl.js:66`.
- CSS: `gv2.css:63-68` (`.gv2-nav`, `.gv2-marca`, `.gv2-marca-logo`). Larguras: `--gv2-nav:220px`, e `72px` abaixo de **1366** (`gv2.css:42`). Não existe trilho de 64 nem "Recolher menu".
- Os ícones: `GV2.ABAS` (`gv2-ui.js:79-81`). **Raio X e Prospecção usam o mesmo ícone** (`raiox`, o funil), como a prancha diz.

## 2. O "t" de texto usado como logo
| Onde | Hoje | Ação |
|---|---|---|
| Sidebar do gestor (`gv2-ui.js:89`) | `<span class="gv2-marca-logo">t</span>`, disco vermelho com a letra | trocar por `<img>` do PNG oficial |
| Sidebar do executivo (template 12206) | disco com `takeat-t-branco.png` | já é o símbolo, não é letra; alinho ao oficial na entrega da Desenvolvimento (o prompt dela pede o mesmo menu) |
| Login e capa (template 12143, 23992) | `logo-takeat.png` (logo completo) | não é letra; fica |
| PWA (`pwa-app-outbound/public/icons/*`, `manifest.json`, `index.html:52-53`) | **já é o t com garfo**, vermelho sobre branco | ver decisão D1 |
| Pino do mapa | disco + `takeat-t-branco.png` | não muda (prancha) |

`grep '>t<'` no template: **1 ocorrência**, a da sidebar do gestor. Nenhum `content:'t'`.

## 3. O número do selo do Time — **não bate hoje**
- Selo: `nExc = pessoas com excecao >= 2` (`gv2-ui.js:85`) — conta **pessoas**.
- A aba Time mostra `GV2.excecoesLista().length` (`gv2-ui.js:165-200`) — conta **exceções** (sem plano agrupado, cada parado, quentes sem passo, o maior travado, furadas), no máximo 5.
- Uma pessoa sem plano e parada vira 1 no selo e 2 linhas na aba; três sem plano viram 3 no selo e 1 linha na aba. **Correção:** o selo passa a chamar `GV2.excecoesLista().length`, a mesma função; some com 0.

## 4. A hora do HubSpot no rodapé
- `DATA.hubspotUpdatedAtISO` (`gv2-dados.js:480`), que o build preenche com o horário da última carga do robô do HubSpot. É a mesma hora do topo ("HubSpot 17:45").
- "atrasado" = mais de 30 min dessa hora. **Atenção:** o robô roda a cada ~2 h no expediente (e quando o CRM muda); com a régua de 30 min o rodapé vai ficar âmbar a maior parte do dia. Ver D2.

## Decisões para você
- **D1 · ícone do PWA.** O app já mostra o t com garfo (vermelho sobre branco). A prancha usa o mesmo desenho em branco sobre quadrado vermelho. Trocar mexe no ícone instalado de todo o time de campo (o app é o mesmo domínio). **Recomendo trocar** para o oficial, nos 3 tamanhos e no maskable, num commit só.
- **D2 · régua do "atrasado".** 30 min com um robô de ~2 h acende quase o dia todo. **Recomendo 3 h** (o robô perdeu uma rodada), ou mantenho 30 min se a ideia é avisar sempre.
- **D3 · larguras.** A prancha usa 1440 e 1024; a escala do cockpit é 1366/1050. **Recomendo** 220 a partir de 1366 (como hoje) e trilho de 64 abaixo de 1050, para não criar dois cortes novos.

Com o seu ok, sai num PR só, com prints antes e depois de cada aba nos dois temas.
