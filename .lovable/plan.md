
# Integração Evolution API ↔ ZapFlow (whitelabel multi-tenant)

Objetivo: ligar o Evolution que você subiu no Railway (`https://aware-love-production.up.railway.app`) ao ZapFlow para que cada workspace tenha sua própria instância WhatsApp, conecte via QR real, receba mensagens em tempo real no Inbox e envie respostas.

## Arquitetura

```text
[ Browser ]  ─►  createServerFn (auth)  ─►  Evolution API (Railway)
                                            │
                                            └─► WhatsApp
[ WhatsApp ] ─► Evolution ─► POST /api/public/evolution/:workspaceId
                                            │
                                            └─► Supabase (messages, contacts)
                                            └─► Realtime ─► Inbox UI
```

- 1 instância Evolution por workspace (`instance_name = "ws_<workspaceId>"`)
- API key global do Evolution fica como **secret no servidor** — nunca vai pro client
- Webhook usa o `workspaceId` na URL + valida que aquela instância pertence mesmo àquele workspace

## 1. Secrets (Supabase Edge Secrets do projeto)

Vou pedir via `add_secret`:
- `EVOLUTION_API_URL` = `https://aware-love-production.up.railway.app`
- `EVOLUTION_API_KEY` = sua `AUTHENTICATION_API_KEY` (rotacionada depois)

Acessadas só dentro de `createServerFn` via `process.env`.

## 2. Migration — tabela `whatsapp_instances`

```sql
create table public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instance_name text not null unique,        -- "ws_<workspaceId>"
  evolution_token text,                       -- token retornado pelo Evolution
  status text not null default 'disconnected'
    check (status in ('disconnected','pending','connected','error')),
  phone_number text,
  profile_name text,
  qr_code text,                               -- base64 do último QR
  qr_expires_at timestamptz,
  last_connected_at timestamptz,
  webhook_secret text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index whatsapp_instances_ws_uniq
  on public.whatsapp_instances(workspace_id);

alter table public.whatsapp_instances enable row level security;

-- só membros do workspace podem ver/manipular
create policy "ws members read instance"
  on public.whatsapp_instances for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "ws admins write instance"
  on public.whatsapp_instances for all
  using (public.has_workspace_role(workspace_id, auth.uid(), 'admin'))
  with check (public.has_workspace_role(workspace_id, auth.uid(), 'admin'));
```

(Se os helpers `is_workspace_member` / `has_workspace_role` não existirem ainda, replico o padrão usado nas outras tabelas — confirmo durante a implementação.)

## 3. Server functions — `src/lib/evolution.functions.ts`

Todas com `requireSupabaseAuth`. Helper interno chama Evolution com `apikey` no header.

- `getInstance()` — retorna a instância do workspace ativo (ou null).
- `createInstance()` — cria no Evolution + grava na tabela. Idempotente.
- `connectInstance()` — chama `/instance/connect/:name`, salva `qr_code` + `qr_expires_at`, status `pending`. Retorna QR base64.
- `getInstanceStatus()` — chama `/instance/connectionState/:name`, atualiza status/`phone_number`/`profile_name`. Usado no polling enquanto pendente.
- `disconnectInstance()` — `/instance/logout/:name`, status `disconnected`.
- `deleteInstance()` — `/instance/delete/:name` + delete na tabela.
- `sendMessage({ contactId, text })` — usado pelo Inbox; chama `/message/sendText/:name` e insere em `messages` com `direction='outbound'`.

Cada função busca `workspaceId` via `auth.uid()` → `workspace_members` (mesmo padrão das outras `*.functions.ts`).

## 4. Webhook público — `src/routes/api/public/evolution.$workspaceId.ts`

`POST /api/public/evolution/:workspaceId`

1. Carrega `whatsapp_instances` por `workspaceId` com `supabaseAdmin`.
2. Valida header `x-webhook-secret` contra `webhook_secret` da instância (timing-safe).
3. Faz `switch(payload.event)`:
   - `messages.upsert` → upsert em `contacts` (por número) + insert em `messages` (`direction='inbound'`, `message_type` mapeado), move kanban pra `waiting` se for novo.
   - `connection.update` → atualiza `status`, `phone_number`, `profile_name`, `last_connected_at`.
   - `qrcode.updated` → atualiza `qr_code`, `qr_expires_at`.
4. Sempre responde `200 OK` rápido (Evolution faz retry agressivo se falhar).

Quando `connectInstance()` é chamado, configura no Evolution:
```json
{
  "url": "https://<projeto>.lovable.app/api/public/evolution/<workspaceId>",
  "headers": { "x-webhook-secret": "<webhook_secret>" },
  "events": ["messages.upsert","connection.update","qrcode.updated"]
}
```

## 5. UI — `src/routes/_authenticated.settings.whatsapp.tsx`

Substituir o mock atual (QR fake, botão "Simular conexão"). Estados reais:

- **Sem instância** → botão "Criar instância WhatsApp" → chama `createInstance` + `connectInstance`.
- **`pending`** → mostra QR real (base64), polling a cada 3s em `getInstanceStatus`. Botão "Gerar novo QR" (rechama connect).
- **`connected`** → cards com `phone_number`, `profile_name`, `last_connected_at`. Botões `Reconectar` / `Desconectar`.
- **`disconnected`** → CTA "Conectar agora".
- **`error`** → mensagem amigável + botão tentar de novo.

Mantém o layout atual (`SettingsLayout`, `card`, etc.) — só troca os dados mock por `useQuery` chamando as server functions via `useServerFn`.

## 6. Integração no Inbox (mínimo viável agora)

- `conversation-panel.tsx` → no envio de mensagem, chamar `sendMessage` via server fn (em vez do insert mock atual).
- Inserções vindas do webhook aparecem automaticamente se já houver subscription Realtime em `messages`. Se não houver, adiciono `supabase.channel('messages').on('postgres_changes', ...)` no Inbox.

## 7. Segurança / pontos de atenção

- `EVOLUTION_API_KEY` só em server fns (nunca em `import.meta.env`).
- Webhook valida `webhook_secret` por instância (não dá pra um workspace forjar mensagem de outro).
- RLS garante que admin de um workspace só mexe na própria instância.
- `supabaseAdmin` usado **só** dentro do webhook (após validar secret) e nas server fns que precisam burlar RLS para responder ao Evolution.
- Você precisa **rotacionar a `AUTHENTICATION_API_KEY`** no Railway depois (vazou no chat). Eu posso te lembrar quando terminarmos.

## 8. Fora de escopo desta entrega

- Mídia (imagens/áudio/documento) — só texto agora; mídia em fase 2.
- Templates / disparos em massa.
- Múltiplas instâncias por workspace (hoje 1:1, suficiente).
- Reescrita do Inbox com Realtime se ainda não tiver — vejo no momento e decido se entra ou fica para próximo passo.

## Arquivos afetados

**Novos:**
- `supabase/migrations/<ts>_whatsapp_instances.sql`
- `src/lib/evolution.functions.ts`
- `src/lib/evolution.server.ts` (helper HTTP do Evolution)
- `src/routes/api/public/evolution.$workspaceId.ts`

**Alterados:**
- `src/routes/_authenticated.settings.whatsapp.tsx` (remove mock, plugar server fns)
- `src/features/inbox/conversation-panel.tsx` (envio real via `sendMessage`)
- Possivelmente `src/routes/_authenticated.inbox.tsx` (Realtime subscription se faltar)

## Ordem de execução

1. `add_secret` para `EVOLUTION_API_URL` + `EVOLUTION_API_KEY`
2. Migration `whatsapp_instances`
3. `evolution.server.ts` + `evolution.functions.ts`
4. Webhook route
5. Refazer página `/settings/whatsapp`
6. Plugar `sendMessage` no Inbox
7. Teste end-to-end: criar instância → escanear QR no celular → mandar mensagem do WhatsApp pro número → ver aparecer no Inbox → responder pelo Inbox → chegar no WhatsApp
