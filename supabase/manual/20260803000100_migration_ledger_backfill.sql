-- ============================================================
-- 20260803000100_migration_ledger_backfill.sql
--
-- Backfill do ledger com as migrations que JÁ foram aplicadas neste banco
-- antes de o ledger existir.
--
-- ⚠️  TODAS AS LINHAS ESTÃO COMENTADAS DE PROPÓSITO.
--
-- Não há registro de quais destes 53 arquivos realmente rodaram em produção,
-- e um ledger que mente é pior que ledger nenhum: `npm run migrations:check`
-- deixaria de acusar justamente o que falta aplicar.
--
-- Como usar:
--   1. Descomente as linhas das migrations que você tem certeza que já rodaram.
--      (Na dúvida, deixe comentada: o check vai listá-la como pendente, e
--      migrations deste projeto são idempotentes — `if not exists` / `if exists` —
--      então reaplicar é seguro e resolve a dúvida.)
--   2. Rode no SQL Editor.
--   3. `npm run migrations:check` para conferir o que sobrou.
--
-- Idempotente: `on conflict do nothing`, pode rodar quantas vezes quiser.
-- ============================================================

-- Descomentado em 2026-08-08: confirmado via inspeção direta do banco
-- (scripts/inspect-db.mjs) que estas 53 migrations já estavam aplicadas
-- em produção — checagem de colunas/tipos-alvo de cada uma (ex.: type
-- app_role já existia, message_jobs.job_type já existia). Fazendo o
-- backfill real pra `npm run migrations:check` parar de acusar falso
-- positivo nelas.
insert into public.schema_manual_migrations (filename)
values
  ('20260514120000_appointments.sql'),
  ('20260514150000_user_roles.sql'),
  ('20260514160000_workspace_members.sql'),
  ('20260514170000_agent_scoped_access.sql'),
  ('20260514173000_fix_agent_rls_complete.sql'),
  ('20260514180000_diagnose.sql'),
  ('20260515000000_fix_roles_swap.sql'),
  ('20260516000000_professionals.sql'),
  ('20260516000100_ai_global_activation.sql'),
  ('20260517000000_super_admin.sql'),
  ('20260518000000_super_admin_actions.sql'),
  ('20260519000000_ai_agent.sql'),
  ('20260520000000_business_and_ai_timezone.sql'),
  ('20260530000000_messages_is_ai.sql'),
  ('20260531000000_profile_persistence.sql'),
  ('20260601000000_ai_behavior_fields.sql'),
  ('20260601000001_booking_link.sql'),
  ('20260601000002_booking_ai_send.sql'),
  ('20260601000003_contact_ai_summary.sql'),
  ('20260602000000_ai_out_of_hours_toggle.sql'),
  ('20260603000000_welcome_message_enabled.sql'),
  ('20260604000000_contact_fields.sql'),
  ('20260605000000_contacts_realtime.sql'),
  ('20260606000000_services_owner_backfill.sql'),
  ('20260607000000_services_rls_complete.sql'),
  ('20260608000000_message_templates.sql'),
  ('20260609000000_appointment_events.sql'),
  ('20260610000000_services_delete_cascade.sql'),
  ('20260611000000_ai_segments_example_description.sql'),
  ('20260612000000_business_address_structured_and_ai_contact_toggle.sql'),
  ('20260613000000_appointments_professional_backfill.sql'),
  ('20260614000000_drop_public_booking_link.sql'),
  ('20260721000000_fix_profiles_anon_leak.sql'),
  ('20260721010000_fix_segments_gaps.sql'),
  ('20260722120000_message_jobs.sql'),
  ('20260722121000_whatsapp_instances_retroactive.sql'),
  ('20260722122000_message_jobs_alert.sql'),
  ('20260723000000_message_jobs_alert_whatsapp.sql'),
  ('20260724000000_appointment_batch_and_buffer.sql'),
  ('20260724010000_remove_service_categories.sql'),
  ('20260725000000_appointments_professional_canonical.sql'),
  ('20260725000100_appointments_drop_agent_id.sql'),
  ('20260725000200_professionals_working_hours.sql'),
  ('20260726000000_ai_tenant_required_fields.sql'),
  ('20260726010000_ai_segments_field_catalog.sql'),
  ('20260727000000_business_general_info.sql'),
  ('20260728000000_business_general_info_v2.sql'),
  ('20260729000000_kanban_resolved_column.sql'),
  ('20260729000100_business_general_info_notes.sql'),
  ('20260730000000_service_price_and_photos.sql'),
  ('20260731000000_service_photo_send_policy.sql'),
  ('20260801000000_business_tax_document.sql'),
  ('20260802000000_contact_crm_fields.sql'),
  ('20260803000100_migration_ledger_backfill.sql')
on conflict (filename) do nothing;

select count(*) || ' migrations registradas no ledger' as status
from public.schema_manual_migrations;
