-- Remove totalmente o link público de agendamento.
-- A IA agora agenda autonomamente pela conversa — não há mais página pública.
-- Idempotente. Rode no SQL Editor do Supabase.

-- Policy anônima depende das colunas; precisa cair antes do drop.
drop policy if exists "public_can_read_booking_profile" on public.profiles;
drop index if exists public.profiles_booking_slug_idx;

alter table public.profiles
  drop column if exists booking_slug,
  drop column if exists booking_enabled,
  drop column if exists booking_ai_send,
  drop column if exists booking_service_ids,
  drop column if exists booking_title,
  drop column if exists booking_description;

notify pgrst, 'reload schema';
