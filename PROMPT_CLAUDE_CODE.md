# Prompt pra colar no Claude Code

Cole o texto abaixo na raiz do repo `cockpit-unificado`, com a pasta `design_handoff_cockpit_takeat/` copiada dentro do projeto.

---

Você vai repaginar o visual do cockpit de Field Sales deste repositório. A referência de design está em `design_handoff_cockpit_takeat/` — leia `README.md` (especificação completa) e `Cockpit Takeat.dc.html` (protótipo funcionando; abra no navegador pra ver estados, hover e modo escuro).

Regras do trabalho:

1. **Não troque a arquitetura.** O app continua sendo `template/cockpit.template.html` preenchido pelos scripts de build (`scripts/build.js`, `scripts/fetch-hubspot.js`, etc.) e publicado na Vercel. Nada de React, bundler ou npm novo.
2. **O protótipo é referência visual, não código pra copiar.** Ele foi escrito com estilos inline num runtime de componentes; no repo o padrão é CSS com variáveis em `:root` + classes. Traduza pro padrão do repo: crie os tokens novos em `:root` e `[data-theme="dark"]` e reescreva as classes existentes (`.tab-btn`, `.rep-row`, `.kpi-*`, `.lead-row`, `.pdi-*`) com os valores do README.
3. **Preserve toda a lógica existente**: `aplicarSessao`, permissões por `role`, `activateTab`, persistência de PDI em `localStorage` (`pdiStorageKey`), leitura de `DATA.*`, Supabase de análise individual, abertura automática do Resumo Semanal na segunda-feira.
4. **Não use dados do Expogo.** Visitas com check-in por GPS saem do produto por enquanto. A métrica de atividade passa a ser **prometido na Daily vs. realizado**: `visitasPrometidas` (soma do que o executivo prometeu nas dailies da semana) e `visitasRealizadas` (o que ele informou). Aderência = realizadas / prometidas. Onde hoje existe "visitas com GPS", troque por "visitas informadas" e mostre sempre `realizadas/prometidas` + a aderência em %.
5. **Aba Daily gamificada** — é a mudança de comportamento mais importante. Implemente sequência (dias seguidos batendo o prometido), tira da semana com um quadrado por dia útil, pontos do dia (visita 10, avanço de etapa 25, proposta 40, fechamento 100), pontos por linha no card "prometido vs. realizado" e as 6 conquistas descritas no README (3 desbloqueadas, 3 bloqueadas com o critério visível). Enquanto não houver campo no banco, calcule sequência e pontos a partir das dailies já salvas e derive as conquistas — nada de número chumbado no HTML.
6. **Aba nova "Leads da praça"**: sugestões de casas bem avaliadas por praça que ainda não estão no funil, com motivo da indicação e ações "Criar negócio" / "Descartar". Gestor vê todas as praças; executivo vê só a dele. Se ainda não existe fonte de dados, crie `data/leads-referencia.json` com o mesmo formato do README e leia daí, deixando o ponto de integração comentado.
7. **Time atual** (usar em `data/usuarios.json` e nos mocks): Amanda Pardim (Vitória/ES), Marco Filho (Vila Velha/ES), Sandro Brito, Bruno e Michel (Rio de Janeiro), Wericles (São Paulo), Gleyson e Ricardo (Salvador), Kelly (Porto Alegre) e Ricardo (Porto Alegre, ainda vai começar — todos os números dele aparecem como "—", tag "a começar", e o PDI dele é o onboarding).
8. **Responsivo de verdade.** O protótipo está desenhado em desktop, mas o executivo usa no celular entre visitas: abaixo de 900px a navegação lateral vira barra inferior fixa, os grids de 2 colunas viram 1, e nenhum alvo de toque fica abaixo de 44px.
9. Mantenha o modo claro/escuro já existente e o logo da Takeat no header e no login (`design_handoff_cockpit_takeat/logo-takeat.png`).

Comece lendo o README do handoff e o `template/cockpit.template.html` atual, me mostre o plano de mudança arquivo por arquivo, e só depois implemente.
