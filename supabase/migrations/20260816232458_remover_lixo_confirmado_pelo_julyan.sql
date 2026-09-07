-- 20260816232458_remover_lixo_confirmado_pelo_julyan
-- Resgatada do histórico do Supabase em 07/09/26 — SQL exatamente como foi aplicado.

-- Limpeza confirmada explicitamente pelo Julyan (16/08/26), depois de checar que
-- nenhuma das 3 coisas abaixo tem qualquer referência em api/, scripts/ ou template/.

-- Tabela nunca usada: feature de check-in/check-out geolocalizado que nunca foi
-- implementada no front-end (0 linhas, zero código lendo/escrevendo nela).
drop table if exists visitas_checkin;

-- Tabela-sobra: só tem id+created_at, 0 linhas. O dado real de "prometido_fechamentos"
-- vive numa COLUNA de mesmo nome dentro de `dailies` — essa tabela em si nunca foi
-- de fato usada, ficou como esqueleto de uma tentativa anterior.
drop table if exists prometido_fechamentos;

-- Coluna solta em leads_prospeccao: "text" (inteiro), sem nenhuma referência em
-- código algum — sobra de algum comando SQL avulso, não faz parte do schema real
-- da tabela (que já tem cnpj, data_abertura, lat, lng como campos legítimos).
alter table leads_prospeccao drop column if exists "text";
