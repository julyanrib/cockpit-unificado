-- ══════════════════════════════════════════════════════════════════════════════════════
-- O EXECUTIVO PODE PEDIR CONTAS AO LÍDER (11/09/26)
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Julyan, sobre o botão "+ pedir contas ao Julyan ▸" que a prancha FINAL desenha na
-- coluna Prospecção do Meu funil: "aposenta o fn2 e usa pauta_do_lider".
--
-- ══ POR QUE PRECISOU DE MIGRATION ══════════════════════════════════════════════════
-- A pauta tinha QUATRO políticas e três delas exigem `role = 'manager'`: insert, update
-- e delete. Só o SELECT já deixava o executivo ler o que é dele. Ou seja: o botão do
-- executivo existiria, ele clicaria, e o Postgres recusaria a linha — clique morto com
-- mensagem de erro em cima.
--
-- Perguntei antes de rodar, porque permissão de banco é decisão dele e não minha, e ele
-- escolheu a política estreita.
--
-- ══ O QUE ESTA MIGRATION PERMITE, E SÓ ISSO ════════════════════════════════════════
-- O executivo passa a poder INSERIR e APAGAR linhas da pauta que:
--
--   1. são SOBRE ELE MESMO — `alvo_owner_id` tem de ser o owner_id dele no
--      mapa_usuarios. Ele não pode pôr pauta na conta de um colega;
--   2. são do tipo 'pedido_do_executivo' — um tipo NOVO, que nenhuma linha da tabela usa
--      hoje (as cinco existentes são cobranca_rota, cobranca_daily, acao_semana,
--      cobranca_negocio e modo_agir, todas escritas pelo gestor). Assim ele não escreve
--      nem apaga cobrança que o gestor criou, mesmo sendo o alvo dela.
--
-- NADA MAIS MUDA: as quatro políticas do gestor ficam exatamente como estavam, e nenhuma
-- outra tabela é tocada. `role = 'rep'` no filtro em vez de "não é manager" — o gestor
-- continua entrando pela porta dele.
--
-- ══ O DELETE EXISTE PORQUE O BOTÃO É TOGGLE ═════════════════════════════════════════
-- Todo botão de pauta nesta casa é toggle: clicar de novo TIRA (é por isso que a tabela
-- tem policy de delete em vez de um "feito" que deixaria item riscado no ritual da
-- manhã). Sem o delete, o executivo poria o pedido e não teria como se retratar — e a
-- unique(chave) faria o segundo clique estourar duplicata.

create policy pauta_insert_executivo on public.pauta_do_lider
  for insert to public
  with check (
    tipo = 'pedido_do_executivo'
    and exists (
      select 1 from public.mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
        and mu.role = 'rep'
        and mu.owner_id = pauta_do_lider.alvo_owner_id
    )
  );

create policy pauta_delete_executivo on public.pauta_do_lider
  for delete to public
  using (
    tipo = 'pedido_do_executivo'
    and exists (
      select 1 from public.mapa_usuarios mu
      where lower(mu.email) = lower((select auth.jwt() ->> 'email'))
        and mu.role = 'rep'
        and mu.owner_id = pauta_do_lider.alvo_owner_id
    )
  );
