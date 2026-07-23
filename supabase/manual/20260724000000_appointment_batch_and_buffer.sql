-- Corrige o bug de agendamento duplo via IA (cliente pediu 2 horários no
-- mesmo turno, só 1 foi criado mas a IA "confirmou" os 2). Suporte a:
-- (1) buffer/intervalo entre atendimentos por serviço, usado nas checagens
--     de conflito de horário (IA, grade da agenda, modal do inbox);
-- (2) titular do agendamento (client_name), hoje recebido da IA mas
--     descartado — precisa ser persistido pra permitir múltiplos
--     agendamentos por telefone (ex: 1 pro cliente, 1 pra um familiar) e
--     desambiguação por nome, não só por dia/hora;
-- (3) auditoria barata do motivo de falha de agendamento pela IA (hoje só
--     erros HTTP ficam registrados em ai_usage_logs).
-- Idempotente.

alter table public.services
  add column if not exists buffer_minutes integer not null default 0;

alter table public.appointments
  add column if not exists client_name text;

alter table public.ai_usage_logs
  add column if not exists booking_reason text;
