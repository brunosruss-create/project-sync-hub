-- Adiciona toggle independente: a IA pode (ou não) oferecer o link de
-- agendamento automaticamente na conversa. Default true para manter o
-- comportamento atual de quem já habilitou o link.
alter table public.profiles
  add column if not exists booking_ai_send boolean default true;

notify pgrst, 'reload schema';
