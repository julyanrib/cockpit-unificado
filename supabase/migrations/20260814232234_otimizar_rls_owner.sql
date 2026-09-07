-- 20260814232234_otimizar_rls_owner
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.
--
-- Reescreve as políticas criadas minutos antes (20260814231943) trocando
-- `auth.jwt() ->> 'email'` por `(select auth.jwt()) ->> 'email'`. A regra de
-- segurança é a MESMA; o que muda é o plano de execução: o Postgres passa a
-- avaliar o JWT uma vez por consulta em vez de uma vez por linha.
drop policy if exists "planos_diarios_select_por_owner" on public.planos_diarios;
drop policy if exists "planos_diarios_insert_por_owner" on public.planos_diarios;
drop policy if exists "planos_diarios_update_por_owner" on public.planos_diarios;
create policy "planos_diarios_select_por_owner" on public.planos_diarios for select to authenticated using (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = planos_diarios.owner_id)));
create policy "planos_diarios_insert_por_owner" on public.planos_diarios for insert to authenticated with check (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = planos_diarios.owner_id)));
create policy "planos_diarios_update_por_owner" on public.planos_diarios for update to authenticated using (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = planos_diarios.owner_id))) with check (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = planos_diarios.owner_id)));
drop policy if exists "pdi_compromissos_select_por_owner" on public.pdi_compromissos;
drop policy if exists "pdi_compromissos_insert_por_owner" on public.pdi_compromissos;
drop policy if exists "pdi_compromissos_update_por_owner" on public.pdi_compromissos;
create policy "pdi_compromissos_select_por_owner" on public.pdi_compromissos for select to authenticated using (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = pdi_compromissos.owner_id)));
create policy "pdi_compromissos_insert_por_owner" on public.pdi_compromissos for insert to authenticated with check (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = pdi_compromissos.owner_id)));
create policy "pdi_compromissos_update_por_owner" on public.pdi_compromissos for update to authenticated using (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = pdi_compromissos.owner_id))) with check (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = pdi_compromissos.owner_id)));
drop policy if exists "visitas_checkin_select_por_owner" on public.visitas_checkin;
drop policy if exists "visitas_checkin_insert_por_owner" on public.visitas_checkin;
drop policy if exists "visitas_checkin_update_por_owner" on public.visitas_checkin;
create policy "visitas_checkin_select_por_owner" on public.visitas_checkin for select to authenticated using (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = visitas_checkin.owner_id)));
create policy "visitas_checkin_insert_por_owner" on public.visitas_checkin for insert to authenticated with check (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = visitas_checkin.owner_id)));
create policy "visitas_checkin_update_por_owner" on public.visitas_checkin for update to authenticated using (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = visitas_checkin.owner_id))) with check (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = visitas_checkin.owner_id)));

drop policy if exists "leads_prospeccao_select_por_owner" on public.leads_prospeccao;
drop policy if exists "leads_prospeccao_insert_por_owner" on public.leads_prospeccao;
drop policy if exists "leads_prospeccao_update_por_owner" on public.leads_prospeccao;
create policy "leads_prospeccao_select_por_owner" on public.leads_prospeccao for select to authenticated using (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = leads_prospeccao.responsavel_owner_id)));
create policy "leads_prospeccao_insert_por_owner" on public.leads_prospeccao for insert to authenticated with check (
  exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = leads_prospeccao.responsavel_owner_id))
  and (
    criado_por is null
    or lower(criado_por) = lower((select auth.jwt()) ->> 'email')
    or exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and mu.role = 'manager')
  )
);
create policy "leads_prospeccao_update_por_owner" on public.leads_prospeccao for update to authenticated using (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = leads_prospeccao.responsavel_owner_id))) with check (exists (select 1 from public.mapa_usuarios mu where lower(mu.email) = lower((select auth.jwt()) ->> 'email') and (mu.role = 'manager' or mu.owner_id = leads_prospeccao.responsavel_owner_id)));
