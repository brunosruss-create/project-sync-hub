-- Add CRM fields to contacts table for client registration
alter table public.contacts
  add column if not exists document_type      text check (document_type in ('pessoa_fisica','pessoa_juridica')),
  add column if not exists document_number    text,
  add column if not exists birth_date         date,
  add column if not exists gender             text check (gender in ('masculino','feminino','outro')),
  add column if not exists profession         text,
  add column if not exists cep               text,
  add column if not exists street             text,
  add column if not exists address_number     text,
  add column if not exists address_complement text,
  add column if not exists neighborhood       text,
  add column if not exists city               text,
  add column if not exists state_uf           text;

select 'contact CRM fields added' as status;
