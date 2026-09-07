-- 20260814231943_proteger_dados_por_owner
--
-- RESGATADA DO HISTÓRICO DO SUPABASE EM 07/09/26.
-- O SQL abaixo é exatamente o que foi aplicado no banco (lido de
-- supabase_migrations.schema_migrations) — não é reconstrução. Ele nunca esteve
-- no repositório: foi aplicado direto, e o git só tinha 5 das 20 migrations.
--
-- O que ela faz: o dono do dado passa a ser a regra de acesso. Antes, quatro
-- tabelas tinham política "authenticated pode ler/gravar", o que significa que
-- qualquer executivo logado via e escrevia o dado de qualquer outro. Agora cada
-- política cruza o e-mail do JWT com public.mapa_usuarios: gestor alcança o time,
-- executivo alcança só o próprio owner_id.
--
-- lower(email) nos dois lados porque e-mail digitado com maiúscula em algum
-- cadastro já deixou gente sem acesso ao próprio dado.

drop policy if exists "leitura do mapa" on public.mapa_usuarios;
create policy "mapa_usuarios_select_authenticated"
on public.mapa_usuarios for select
to authenticated
using (true);

drop policy if exists "authenticated pode ler leads_prospeccao" on public.leads_prospeccao;
drop policy if exists "authenticated pode atualizar leads_prospeccao" on public.leads_prospeccao;
drop policy if exists "leads_prospeccao_select_por_owner" on public.leads_prospeccao;
drop policy if exists "leads_prospeccao_insert_por_owner" on public.leads_prospeccao;
drop policy if exists "leads_prospeccao_update_por_owner" on public.leads_prospeccao;

create policy "leads_prospeccao_select_por_owner"
on public.leads_prospeccao for select
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = leads_prospeccao.responsavel_owner_id)
  )
);

create policy "leads_prospeccao_insert_por_owner"
on public.leads_prospeccao for insert
to authenticated
with check (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = leads_prospeccao.responsavel_owner_id)
  )
  and (
    criado_por is null
    or lower(criado_por) = lower((select auth.jwt() ->> 'email'))
    or exists (
      select 1 from public.mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt() ->> 'email')) and mu.role = 'manager'
    )
  )
);

create policy "leads_prospeccao_update_por_owner"
on public.leads_prospeccao for update
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = leads_prospeccao.responsavel_owner_id)
  )
)
with check (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = leads_prospeccao.responsavel_owner_id)
  )
);

drop policy if exists "planos_diarios_select_autenticado" on public.planos_diarios;
drop policy if exists "planos_diarios_insert_autenticado" on public.planos_diarios;
drop policy if exists "planos_diarios_update_autenticado" on public.planos_diarios;
drop policy if exists "planos_diarios_select_por_owner" on public.planos_diarios;
drop policy if exists "planos_diarios_insert_por_owner" on public.planos_diarios;
drop policy if exists "planos_diarios_update_por_owner" on public.planos_diarios;

create policy "planos_diarios_select_por_owner"
on public.planos_diarios for select
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = planos_diarios.owner_id)
  )
);
create policy "planos_diarios_insert_por_owner"
on public.planos_diarios for insert
to authenticated
with check (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = planos_diarios.owner_id)
  )
);
create policy "planos_diarios_update_por_owner"
on public.planos_diarios for update
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = planos_diarios.owner_id)
  )
)
with check (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = planos_diarios.owner_id)
  )
);

drop policy if exists "pdi_compromissos_select_autenticado" on public.pdi_compromissos;
drop policy if exists "pdi_compromissos_insert_autenticado" on public.pdi_compromissos;
drop policy if exists "pdi_compromissos_update_autenticado" on public.pdi_compromissos;
drop policy if exists "pdi_compromissos_select_por_owner" on public.pdi_compromissos;
drop policy if exists "pdi_compromissos_insert_por_owner" on public.pdi_compromissos;
drop policy if exists "pdi_compromissos_update_por_owner" on public.pdi_compromissos;

create policy "pdi_compromissos_select_por_owner"
on public.pdi_compromissos for select
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = pdi_compromissos.owner_id)
  )
);
create policy "pdi_compromissos_insert_por_owner"
on public.pdi_compromissos for insert
to authenticated
with check (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = pdi_compromissos.owner_id)
  )
);
create policy "pdi_compromissos_update_por_owner"
on public.pdi_compromissos for update
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = pdi_compromissos.owner_id)
  )
)
with check (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = pdi_compromissos.owner_id)
  )
);

drop policy if exists "authenticated pode ler visitas_checkin" on public.visitas_checkin;
drop policy if exists "authenticated pode gravar visitas_checkin" on public.visitas_checkin;
drop policy if exists "authenticated pode atualizar visitas_checkin" on public.visitas_checkin;
drop policy if exists "visitas_checkin_select_por_owner" on public.visitas_checkin;
drop policy if exists "visitas_checkin_insert_por_owner" on public.visitas_checkin;
drop policy if exists "visitas_checkin_update_por_owner" on public.visitas_checkin;

create policy "visitas_checkin_select_por_owner"
on public.visitas_checkin for select
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = visitas_checkin.owner_id)
  )
);
create policy "visitas_checkin_insert_por_owner"
on public.visitas_checkin for insert
to authenticated
with check (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = visitas_checkin.owner_id)
  )
);
create policy "visitas_checkin_update_por_owner"
on public.visitas_checkin for update
to authenticated
using (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = visitas_checkin.owner_id)
  )
)
with check (
  exists (
    select 1 from public.mapa_usuarios mu
    where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
      and (mu.role = 'manager' or mu.owner_id = visitas_checkin.owner_id)
  )
);

update public.mapa_usuarios
set email = 'ricardoantunes.takeat@gmail.com', nome = 'Ricardo Antunes'
where lower(email) = 'ricardo2.takeat@gmail.com'
  and not exists (
    select 1 from public.mapa_usuarios where lower(email) = 'ricardoantunes.takeat@gmail.com'
  );
