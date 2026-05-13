# Diagnóstico

## 1) Erro "new row violates row-level security policy for table contacts"

O insert do modal envia `owner_user_id: user.id`, e a migração `20260513133500_whatsapp_owner_rls.sql` cria policies coerentes (`with check (owner_user_id = auth.uid())`).

A tabela `contacts`, porém, foi criada **fora** dessa migração (provavelmente via dashboard do Supabase em uma sessão anterior). Isso significa que ela quase certamente tem:

- uma coluna legada `user_id` (ou similar) **NOT NULL**, que o insert atual não preenche; **ou**
- uma policy permissiva antiga (ex.: `Enable insert for authenticated users only` exigindo `user_id = auth.uid()`) que ainda existe e bloqueia o insert porque a coluna não foi enviada.

Como Postgres avalia RLS combinando todas as policies permissivas (precisa passar em pelo menos uma) **e** todas as restritivas (precisa passar em todas), uma policy legada permissiva extra não bloqueia. O bloqueio ocorre quando:

- a coluna `user_id` legada é NOT NULL e o insert falha o `WITH CHECK` original; ou
- existe uma policy restritiva legada exigindo outra condição.

## 2) WhatsApp não envia nem recebe

Independente do RLS, o usuário relata que o WhatsApp não está operando. Isso aponta para a integração com a UAZAPI (instância não conectada, webhook não configurado, ou serverFn de envio quebrada). Precisa ser investigado em separado, mas não bloqueia a criação do contato.

# Plano

## Passo 1 — Migração de saneamento da tabela `contacts`

Criar `supabase/migrations/<ts>_contacts_rls_consolidation.sql` que:

1. Garante que `owner_user_id` existe e copia valores de `user_id` (se a coluna existir) para `owner_user_id` quando estiver nulo.
2. Faz `owner_user_id` NOT NULL com default `auth.uid()` (para inserts via Supabase JS pegarem o usuário automaticamente como rede de segurança).
3. Se existir `user_id` legado NOT NULL, torna nullable (ou define default `auth.uid()`) para não quebrar inserts.
4. Dropa **todas** as policies existentes em `public.contacts` via `pg_policies` (loop dinâmico) e recria apenas o conjunto canônico baseado em `owner_user_id` (select/insert/update/delete) — sem restritivas duplicadas, que são desnecessárias quando todas as permissivas exigem a mesma condição.
5. Mesmo tratamento mínimo para `messages` (drop de policies legadas conflitantes, manter apenas as baseadas em `owner_user_id`).

## Passo 2 — Hardening do insert no modal

Em `src/features/inbox/new-contact-modal.tsx`:

- Logar `error.code`, `error.details`, `error.hint` (não só `message`) para diagnósticos futuros.
- Se a coluna `user_id` legada continuar exigida, incluí-la no payload espelhando `user.id`.

## Passo 3 — Investigação do WhatsApp (separado, mesmo turno)

Listar e relatar (sem corrigir ainda):

- Estado de `public.whatsapp_instances` para o usuário (existe? `connected`?).
- ServerFn / endpoint que envia mensagem (caminho do arquivo, se existe token UAZAPI configurado em secrets).
- Se há webhook configurado apontando para `/api/public/...` e se a rota existe.

Com isso entrego um diagnóstico claro do WhatsApp e abrimos um próximo passo focado.

# Detalhes técnicos

```sql
-- Esqueleto da migração
alter table public.contacts
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

update public.contacts
   set owner_user_id = user_id
 where owner_user_id is null
   and exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='contacts' and column_name='user_id');

alter table public.contacts
  alter column owner_user_id set default auth.uid(),
  alter column owner_user_id set not null;

-- (se user_id legado for NOT NULL)
alter table public.contacts alter column user_id drop not null;

-- Drop dinâmico de TODAS as policies de contacts
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname='public' and tablename='contacts'
  loop
    execute format('drop policy if exists %I on public.contacts', p.policyname);
  end loop;
end $$;

-- Recriar policies canônicas (4 policies, sem restritivas)
create policy "contacts_select_own" on public.contacts
  for select to authenticated using (owner_user_id = auth.uid());
create policy "contacts_insert_own" on public.contacts
  for insert to authenticated with check (owner_user_id = auth.uid());
create policy "contacts_update_own" on public.contacts
  for update to authenticated using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy "contacts_delete_own" on public.contacts
  for delete to authenticated using (owner_user_id = auth.uid());
```

Mesmo padrão mínimo para `messages` (mantendo `contact_id` e `owner_user_id`).

# Fora de escopo deste plano

- Implementar o envio real via UAZAPI (será tratado após o diagnóstico do passo 3).
- Mudanças visuais no modal.
