-- 20260902034119_playbook_v7_prova_e_copias
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- PLAYBOOK v7 (02/09/26) — a prova de leitura e o contador de uso real.
--
-- 1. tipo 'prova'. O CHECK antigo só aceitava 'missao' e 'leitura'. A v7 exige quiz para
--    pagar o +10, e as 21 linhas 'leitura' que já existem (2 pessoas, ago/26) NÃO são
--    reescritas: elas continuam contando como lidas, e a tela distingue "lida" de
--    "provada". Invalidar ponto que alguém já ganhou sob a regra antiga seria tirar
--    do bolso de quem leu.
alter table public.playbook_progresso drop constraint playbook_progresso_tipo_check;
alter table public.playbook_progresso add constraint playbook_progresso_tipo_check
  check (tipo = any (array['missao'::text, 'leitura'::text, 'prova'::text]));

-- 2. "AS MAIS USADAS NA RUA" só vale se vier de uso REAL — a prancha é explícita: nada
--    editorial, nada manual. Uso real, hoje, é o botão "copiar script": quem copia vai
--    falar aquilo na próxima porta.
create table if not exists public.playbook_copias (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  guia_slug text not null,
  copiado_em timestamptz not null default now()
);
-- Sem unique: copiar duas vezes é usar duas vezes, e é isso que o contador mede.
create index if not exists playbook_copias_slug_data on public.playbook_copias (guia_slug, copiado_em desc);

alter table public.playbook_copias enable row level security;

create policy playbook_copias_insert_proprio on public.playbook_copias
  for insert to authenticated
  with check (lower(user_email) = lower(((select auth.jwt()) ->> 'email')));

-- SELECT só do próprio, e do gestor — mesma regra de playbook_progresso. O executivo NÃO
-- lê a linha do colega: "o Ramon copiou o script X às 14h" é vigilância, não social proof.
create policy playbook_copias_select_proprio_ou_gestor on public.playbook_copias
  for select to authenticated
  using (
    lower(user_email) = lower(((select auth.jwt()) ->> 'email'))
    or exists (select 1 from mapa_usuarios mu
               where lower(mu.email) = lower(((select auth.jwt()) ->> 'email'))
                 and mu.role = 'manager')
  );

-- 3. O AGREGADO, que é o que a tela mostra. RLS não sabe restringir "só a soma", então a
--    contagem do time sai por função: ela devolve slug + total, nunca uma linha com nome.
--    É o que permite dizer "copiado 14× pelo time" sem expor quem copiou.
create or replace function public.playbook_mais_copiadas(dias integer default 7)
returns table (guia_slug text, copias bigint, pessoas bigint)
language sql
security definer
set search_path = public
stable
as $$
  select c.guia_slug,
         count(*)::bigint as copias,
         count(distinct lower(c.user_email))::bigint as pessoas
    from public.playbook_copias c
   where c.copiado_em >= now() - (greatest(1, least(dias, 90)) || ' days')::interval
     and exists (select 1 from mapa_usuarios mu
                 where lower(mu.email) = lower(((select auth.jwt()) ->> 'email')))
   group by c.guia_slug
   having count(*) > 0
   order by count(*) desc, c.guia_slug;
$$;

revoke all on function public.playbook_mais_copiadas(integer) from public;
grant execute on function public.playbook_mais_copiadas(integer) to authenticated;

comment on function public.playbook_mais_copiadas is
  'Agregado de cópias de script por página, para "as mais usadas na rua". SECURITY DEFINER porque RLS não restringe a agregados: devolve soma, nunca a linha de quem copiou. O EXISTS em mapa_usuarios garante que só gente do time recebe o número.';
