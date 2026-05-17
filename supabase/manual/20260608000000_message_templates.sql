-- Centraliza as mensagens transacionais enviadas ao cliente final.
-- Cada coluna *_text é opcional: se NULL/vazio, o app usa o default
-- de src/lib/message-defaults.ts (fonte única de verdade).
-- Cada coluna *_enabled controla o disparo automático.

alter table public.profiles
  add column if not exists msg_transfer_enabled            boolean not null default true,
  add column if not exists msg_transfer_text               text,
  add column if not exists msg_booking_confirmed_enabled   boolean not null default true,
  add column if not exists msg_booking_confirmed_text      text,
  add column if not exists msg_booking_rescheduled_enabled boolean not null default true,
  add column if not exists msg_booking_rescheduled_text    text,
  add column if not exists msg_booking_cancelled_enabled   boolean not null default true,
  add column if not exists msg_booking_cancelled_text      text;

notify pgrst, 'reload schema';
