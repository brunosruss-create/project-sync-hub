-- ════════════════════════════════════════════════════════════
-- Endereço estruturado do negócio (CEP, rua, número, complemento)
-- + toggle único para a IA divulgar dados de contato.
-- ════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists business_cep                  text,
  add column if not exists business_street               text,
  add column if not exists business_address_number       text,
  add column if not exists business_address_complement   text,
  add column if not exists business_neighborhood         text,
  add column if not exists business_city                 text,
  add column if not exists business_state                text,
  -- Toggle único: IA pode informar endereço, site e telefone quando perguntada.
  add column if not exists ai_can_share_contact_info     boolean not null default true;

-- Backfill: se já existir business_address (texto livre antigo) e business_street
-- estiver vazio, copia para business_street para não perder o que o usuário digitou.
update public.profiles
   set business_street = business_address
 where business_street is null
   and business_address is not null
   and length(trim(business_address)) > 0;
