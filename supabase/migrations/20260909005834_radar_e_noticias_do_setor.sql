-- ══════════════════════════════════════════════════════════════════════════════════════
-- O RADAR DAS PRAÇAS E AS NOTÍCIAS DO SETOR (09/09/26)
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Julyan, para a aba Rotas & Prospecção v2: "pode colocar fontes reais da abrasel brasil
-- inteiro, infomoney, fontes relevantes, coloque semanalmente para eu saber de tudo".
--
-- ══ O QUE EU MEDI ANTES, E O QUE A MEDIÇÃO MUDOU ═══════════════════════════════════
-- 1. A ABRASEL NÃO PODE SER LIDA POR ROBÔ NOSSO. O robots.txt deles diz, textualmente:
--       User-agent: ClaudeBot
--       Disallow: /
--    com Content-Signal: search=yes, ai-train=no. Não é limitação técnica nem preguiça:
--    é o site declarando o que autoriza. A notícia da Abrasel CHEGA aqui — pelo índice de
--    busca, que eles autorizam (search=yes) — e o link leva à matéria no site deles.
--    Nunca raspamos as páginas.
--
-- 2. FEED DE VEÍCULO NÃO ENTREGA RADAR SETORIAL. Medido nos feeds em 08/09: InfoMoney
--    devolveu 0 de 10 itens relevantes para food service (resultado da Quina, acordo
--    comercial dos EUA); Agência Brasil, 1 e 4 de 10, e esses eram falso positivo —
--    "desfile de 7 de Setembro" casou porque contém "bar" dentro de "Brasília". São
--    janelas de 10 itens de notícia geral. Bloco semanal alimentado assim abre com
--    loteria, e ninguém lê na segunda seguinte.
--
-- 3. DAS DEZ FONTES ESPECIALIZADAS QUE TESTEI, SEIS NÃO SERVEM: Portal No Varejo responde
--    sem itens; Food Magazine, Bar e Restaurante, Panorama Gastronômico e FoodServiceNews
--    não respondem; Mercado&Consumo e Cozinha Profissional respondem 200 com item mais
--    novo de 28 e 46 dias — feed morto respondendo bonito, que é o pior caso, porque
--    parece funcionar.
--
-- O QUE FICOU: Food Connection (viva, do setor), consultas por tema no índice de notícias
-- (que trazem Abrasel, Sebrae, VEJA, G1, MilkPoint com data da semana) e duas complementares
-- filtradas por palavra. A tabela guarda a FONTE de cada item, então a tela sempre diz de
-- onde veio — e uma fonte que morrer aparece como fonte sem item, não como bloco vazio.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ── 1. O RADAR DE CADA PRAÇA ────────────────────────────────────────────────────────
create table if not exists public.radar_pracas (
  id uuid primary key default gen_random_uuid(),

  -- a praça no idioma do coletor: "Vitória/ES", "Rio de Janeiro/RJ". As seis vêm de
  -- CIDADES em scripts/backfill-casa-dos-dados.js, que é quem já busca nelas.
  praca text not null,
  municipio text not null,
  uf text not null,

  -- a segunda da semana da medição, para "atualizado seg 09/09" ser um fato e não um
  -- rótulo, e para a tela poder comparar com a semana anterior.
  data_semana date not null,

  -- ══ O TAM, E A HONESTIDADE DELE ═════════════════════════════════════════════════
  -- `tam` é o total de estabelecimentos food da cidade. `tam_fonte` diz COMO ele foi
  -- obtido, e é ele que a tela lê para escolher a palavra:
  --   'contagem_api'  -> a Casa dos Dados devolveu o total. O número é o total.
  --   'piso_paginado' -> ela não devolve total e o coletor parou no teto de páginas.
  --                      A tela escreve "≥ N", porque é piso, não total.
  --   'nao_medido'    -> não deu para medir nesta rodada. A tela escreve "não medido",
  --                      nunca zero.
  -- POR QUE ISTO EXISTE: a documentação pública da Casa dos Dados não expõe o schema da
  -- resposta, e o token vive só na Vercel — não consegui provar, antes de escrever isto,
  -- que a API devolve contagem. Paginar a cidade inteira toda semana para contar queima
  -- crédito pago. Então o job tenta o caminho barato (uma consulta de 1 item, lendo
  -- qualquer campo de total) e, quando não vem, DIZ que não veio.
  tam integer,
  tam_fonte text not null default 'nao_medido',
  tam_detalhe text,

  -- contas da praça já no HubSpot, e a divisão. `pct_tocado` é nulo quando o TAM não foi
  -- medido: percentual sobre denominador desconhecido é o número mais perigoso da tela.
  tocado integer,
  pct_tocado numeric(5,2),
  clientes integer,

  -- a leitura da semana em uma frase, montada dos números desta linha (não é texto de IA)
  leitura text,

  atualizado_em timestamptz not null default now(),

  unique (praca, data_semana),
  constraint radar_tam_fonte_valida
    check (tam_fonte in ('contagem_api', 'piso_paginado', 'nao_medido'))
);

comment on table public.radar_pracas is
  'Radar semanal por praça: TAM food (com a procedência do número), contas tocadas, clientes e a leitura da semana. Escrito pelo job de segunda 06h BRT com service_role; lido por authenticated.';

create index if not exists radar_pracas_semana_idx
  on public.radar_pracas (data_semana desc, praca);

-- ── 2. AS NOTÍCIAS DO SETOR ─────────────────────────────────────────────────────────
create table if not exists public.noticias_setor (
  id uuid primary key default gen_random_uuid(),

  titulo text not null,
  -- o veículo como ele se chama ("Food Connection", "Abrasel", "G1"), para a tela creditar
  fonte text not null,
  -- de onde o robô leu: 'feed_setorial' | 'consulta_tema'. Serve para depurar "por que
  -- esta notícia entrou" sem abrir log.
  origem text not null,
  -- o link da MATÉRIA ORIGINAL. É o único caminho de leitura: o Cockpit mostra manchete e
  -- data, e quem quiser ler vai ao veículo. Nada de texto copiado.
  url text not null,
  publicado_em timestamptz,

  -- o tema que fez o item entrar ('bares e restaurantes', 'delivery', 'tributário'...),
  -- que é como a tela agrupa as quatro leituras do bloco do radar
  tema text,
  -- a praça, quando a consulta foi por cidade; nulo quando é notícia do Brasil
  praca text,

  data_semana date not null,
  coletado_em timestamptz not null default now(),

  -- O MESMO LINK NÃO ENTRA DUAS VEZES. Duas consultas de tema diferentes trazem a mesma
  -- matéria com frequência (uma matéria da Abrasel sobre delivery cai em "delivery" e em
  -- "bares e restaurantes"), e a tela mostraria a manchete repetida.
  unique (url)
);

comment on table public.noticias_setor is
  'Manchetes do setor de food service coletadas semanalmente, com fonte, data e link para a matéria original. NUNCA guarda o texto da matéria — a Abrasel, por exemplo, proíbe coleta automatizada no robots.txt (User-agent: ClaudeBot / Disallow: /), e o caminho legítimo é a manchete no índice de busca, que eles autorizam, mais o link para o site deles.';

create index if not exists noticias_setor_semana_idx
  on public.noticias_setor (data_semana desc, publicado_em desc);

-- ══ AS POLÍTICAS ═══════════════════════════════════════════════════════════════════
-- LEITURA PARA QUEM ESTÁ LOGADO, nas duas: tamanho de mercado e manchete pública não são
-- dado pessoal, e o executivo ler o radar da praça dele é bom para o trabalho.
-- ESCRITA SEM POLÍTICA, de propósito: só o job escreve, e ele usa service_role, que passa
-- por cima de RLS. Sem política de insert, nenhuma sessão de navegador inventa uma
-- notícia ou um TAM — que é exatamente a proteção que estas duas tabelas precisam,
-- porque o valor delas é serem a foto de uma fonte externa, não um mural editável.

alter table public.radar_pracas enable row level security;
alter table public.noticias_setor enable row level security;

drop policy if exists "radar legivel por quem esta logado" on public.radar_pracas;
create policy "radar legivel por quem esta logado"
  on public.radar_pracas for select to authenticated using (true);

drop policy if exists "noticias legiveis por quem esta logado" on public.noticias_setor;
create policy "noticias legiveis por quem esta logado"
  on public.noticias_setor for select to authenticated using (true);
