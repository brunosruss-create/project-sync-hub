-- ============================================================
-- 20260801000000_business_tax_document.sql
-- Dados fiscais do negócio (não do usuário pessoal): tipo de
-- documento (CPF/CNPJ), número e razão social (só relevante pra
-- CNPJ). Todos opcionais — não trava workspace existente.
-- ADD COLUMN IF NOT EXISTS — seguro para produção.
-- ============================================================

alter table public.profiles
  add column if not exists business_document_type text
    check (business_document_type in ('pessoa_fisica', 'pessoa_juridica')),
  add column if not exists business_document_number text,
  add column if not exists business_legal_name text;
