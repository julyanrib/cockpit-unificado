-- 20260816232400_otimizar_rls_auth_initplan
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- Otimização de performance (RLS Initialization Plan) — nenhuma regra de segurança
-- muda, só a forma como o Postgres avalia auth.email()/auth.role(): de "recalcula
-- pra cada linha" pra "calcula uma vez por consulta". Achado pelo advisor de
-- performance do próprio Supabase ao revisar o backend inteiro (16/08/26).

-- analise_individual_mensal
alter policy "leitura analise mensal - so gestor" on analise_individual_mensal
  using ((select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager');

-- analise_individual_semanal
alter policy "leitura analise semanal - so gestor" on analise_individual_semanal
  using ((select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager');

-- comunicados
alter policy "editar comunicados" on comunicados
  using ((select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager');
alter policy "escrita comunicados" on comunicados
  with check ((select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager');
alter policy "excluir comunicados" on comunicados
  using ((select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager');
alter policy "leitura comunicados" on comunicados
  using ((select auth.role()) = 'authenticated');

-- comunicados_lidos
alter policy "leitura comunicados_lidos" on comunicados_lidos
  using ((select auth.role()) = 'authenticated');
alter policy "marcar lido" on comunicados_lidos
  with check (email_leitor = (select auth.email()));

-- dailies
alter policy "atualizar dailies" on dailies
  using (
    owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
    or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'
  );
alter policy "escrita dailies" on dailies
  with check (
    owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
    or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'
  );
alter policy "leitura dailies" on dailies
  using (
    owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
    or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'
  );

-- pdi_documentos
alter policy "escrita pdi_documentos" on pdi_documentos
  with check ((select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager');
alter policy "leitura pdi_documentos" on pdi_documentos
  using (
    owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
    or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'
  );

-- perfis
alter policy "atualizar proprio perfil" on perfis
  using (email = (select auth.email()));
alter policy "criar proprio perfil" on perfis
  with check (email = (select auth.email()));
alter policy "leitura perfis" on perfis
  using ((select auth.role()) = 'authenticated');

-- sugestoes_planos
alter policy "escrita sugestoes" on sugestoes_planos
  with check ((select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager');
alter policy "leitura sugestoes" on sugestoes_planos
  using (
    owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
    or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'
  );

-- um_a_um
alter policy "escrita 1a1" on um_a_um
  with check ((select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager');
alter policy "leitura 1a1" on um_a_um
  using (
    owner_id = (select mapa_usuarios.owner_id from mapa_usuarios where mapa_usuarios.email = (select auth.email()))
    or (select mapa_usuarios.role from mapa_usuarios where mapa_usuarios.email = (select auth.email())) = 'manager'
  );
