# Cockpit v5 — decisões fora do pacote

O handoff `HANDOFF-MAPA-COCKPIT-v5` manda registrar aqui toda escolha que o pacote não
cobre ou que o código obrigou a tomar diferente. Cada linha diz o que foi decidido, por
quê, e o que desfaz a decisão se ela estiver errada.

## Fase 1 · tokens e casca (28/09/26)

### Como os tokens entraram
- **O v5 redefine os nomes que o Cockpit já usava**, em vez de renomear 2.700 `style=""`.
  O último bloco do `<style>` declara `--bg`, `--panel`, `--ink`, `--line`… com os valores
  do mapa, e declara também os nomes do v5 (`--painel`, `--fg`, `--mute`, `--dim`, `--chip`,
  `--inv`, `--faixa`…) para o que nascer daqui em diante. Regra antiga não mudou de nome.
- **Sol é o `:root`, escuro é `[data-tema="escuro"]`.** O pacote faz o contrário (escuro
  no `:root`). Aqui o bootstrap do `<head>` carimba o tema antes da primeira pintura; se
  ele falhar, a tela cai no claro, que é o Cockpit que o time conhece, e não num escuro
  com resíduo.
- **Cor cravada virou token pela PROPRIEDADE em que aparece**: o mesmo `#2B3440` é
  `--dark` em `background`, `--ink` em `color` e em `border`. Feito por script
  determinístico (1.419 trocas), com o cartão da proposta fora do alcance.
- **Fundo de tinta é faixa.** `background:var(--ink)` (herói e botão escuros com texto
  claro) virou `--dark`: no escuro `--ink` fica quase branco, e `--dark` continua escuro.
  No sol os dois são o mesmo `#111418`, então nada mudou de cor ali.
- **Tinta escura de estado só vira token onde é texto.** `#6E1210`, `#8E3B5C`, `#8A3B3B`
  e `#C3152A` são texto em `color:` e em campo de JS que termina em `Cor`
  (`promStCor`, `slaCor`…) — viram `--red-dk`, `--plum-ink`, `--red-ink`, que clareiam no
  escuro. Como fundo (`bg:`, `avBg:`) elas ficam, porque carregam texto branco por cima.
- **Três tokens novos de preenchimento** (`--barra-neutra`, `--barra-ambar`,
  `--barra-verde`): barra que segura número branco precisa ser escura nos dois temas, e
  os tons de tinta que resolviam isso no claro clareiam no escuro.
- **`--red-dk` como fundo virou `--red-press`** (o vermelho pressionado, `#C8131B`), pelo
  mesmo motivo: selo e hover de botão vermelho com texto branco.
- **`--green` de texto é o 700 (`#15803D`) no sol**, não o `#16A34A` do pino: o do pino
  dá 3,2:1 sobre o creme. O verde do pino continua sendo `--cliente`, cor de dado.
- **`--amber` no escuro é `#D97706`**, não o `#F5A524` do morno: ele também é fundo de
  avatar com iniciais brancas, e o morno claro apagava as iniciais.

### Fonte
- **Poppins em tudo, menos no cartão da proposta.** O cartão (`prcCartaoHTML`) vira o PNG
  que vai para o cliente e o handoff proíbe mudá-lo; ele escreve `'Archivo'` e
  `'Manrope'` inline. Por isso as duas continuam no `<link>` junto da Poppins. A guarda 30
  (fonte pedida e usada) não enxergava família entre aspas e foi reancorada para contar
  esse uso (testada vermelha: sem o cartão, Archivo sai reprovada).

### Casca
- **"· ver como executivo" não entrou na pílula de papel.** Não existe troca de papel no
  Cockpit; o texto viraria um clique morto. A pílula diz só o papel.
- **O botão Mapa nasce escondido** e só o importador do PWA o mostra: na Vercel não há
  mapa para abrir.
- **O cabeçalho rola com a página abaixo de 760px.** Grudado ele tem três linhas (167px)
  e comeria um quarto da tela do celular. No desktop ele gruda.
- **As abas saíram da barra fixa de baixo no celular** e viraram a fileira de pílulas do
  handoff (390, prancha G1). Quem usava a barra de baixo encontra as abas no topo.
- **O avatar mostra a foto de perfil quando existe**; sem foto, as iniciais no disco
  vermelho do handoff. A foto é uma coisa que o time subiu e é mais reconhecível.
- **"Meu perfil e foto" entrou no menu do avatar** (o handoff lista só tema, Modo TV e
  Sair). Sem ele, o drawer de perfil — foto, progresso do mês — ficaria sem porta.
- **Modo TV pelo avatar leva o gestor para a Daily**, que é a tela que a TV projeta. O
  modo é o mesmo de sempre (`body.tv`, chave `cockpit_daily_tv_v2`, Esc sai), agora com o
  botão flutuante "Sair do Modo TV".
- **A busca procura no que a sessão já carregou** (`DATA.funilLeads` e a carteira de cada
  executivo; pessoas só para o gestor) e abre a ficha que as outras portas já abrem. O
  cartão único do mapa é da fase 3; quando ele existir, a busca passa a abri-lo.
- **O painel lateral do v5 foi vestido no perfil e no sino** (`.v5-painel`, 480px, véu,
  Esc fecha) em vez de nascer vazio: um componente sem nenhum uso seria código morto, e
  a guarda de função órfã reprova.
- **Tema "Aparelho" só existe no Cockpit.** O mapa conhece claro e escuro; ele lê a chave
  `v5-tema` quando ela diz `sol` ou `escuro`, e grava as duas chaves quando o executivo
  troca no mapa. Com `aparelho`, o mapa fica no que já estava.
