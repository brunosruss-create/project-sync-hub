-- Permitir excluir um serviço mesmo que já tenha linhas em
-- appointment_services. As referências são removidas em cascata.

alter table public.appointment_services
  drop constraint if exists appointment_services_service_id_fkey;

alter table public.appointment_services
  add constraint appointment_services_service_id_fkey
  foreign key (service_id)
  references public.services(id)
  on delete cascade;
