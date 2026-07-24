-- Remove o conceito de categoria de serviço (decisão: menos fricção no
-- cadastro — cada serviço já tem sua própria cor, categoria era só um
-- agrupamento hardcoded no frontend que nunca refletia dados reais).
-- Idempotente — pode rodar quantas vezes precisar.
--
-- ATENÇÃO: isso apaga permanentemente qualquer `service_categories` e
-- qualquer `services.category_id` já preenchido em produção.

alter table public.services drop column if exists category_id;

drop table if exists public.service_categories;

notify pgrst, 'reload schema';
