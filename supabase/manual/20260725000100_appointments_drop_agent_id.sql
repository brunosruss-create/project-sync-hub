-- Remove a coluna legada `appointments.agent_id`.
--
-- ⚠️ ORDEM IMPORTA. Só rode este arquivo depois de:
--   1. ter rodado 20260725000000_appointments_professional_canonical.sql e
--      conferido o diagnóstico (`orfaos_com_agent_id` deve estar zerado, ou você
--      decidiu conscientemente perder esses vínculos);
--   2. ter feito o deploy do código que lê e grava apenas `professional_id`;
--   3. ter verificado a Agenda e o modal de agendamento em produção.
--
-- Rodar antes disso derruba a aplicação: o código antigo faz SELECT da coluna.
--
-- Nenhuma policy RLS, índice ou view referencia `appointments.agent_id`
-- (`contacts.assigned_agent_id` é outra coluna e continua existindo).

alter table public.appointments
  drop column if exists agent_id;

notify pgrst, 'reload schema';
