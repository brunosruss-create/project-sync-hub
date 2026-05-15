## Análise: o que é cosmético vs. salvo no banco

### 🔴 Perfil (`/settings/profile`) — **100% cosmético**
O `handleSave` só faz `setTimeout(600ms)` + toast. Nada vai pro banco.

| Campo | Status | Coluna existente? |
|---|---|---|
| Nome completo | ❌ cosmético | `profiles.full_name` ✅ existe |
| Telefone | ❌ cosmético | ❌ coluna não existe |
| Trocar foto | ❌ botão fake ("em breve") | `profiles.avatar_url` ✅ existe |
| Trocar senha | ❌ inputs sem handler | usa `supabase.auth` |
| Idioma | ⚪ cosmético (você quer manter) | — |
| Fuso horário | ❌ cosmético | ❌ coluna não existe (no profile pessoal) |
| Notificações Email/Push | ❌ cosmético | ❌ colunas não existem |

### 🟢 Negócio (`/settings/workspace`) — **realmente salvo**
Usa `updateWorkspaceProfile` server fn → grava em `profiles`.

| Campo | Status |
|---|---|
| Nome do negócio | ✅ salvo (`business_name`) |
| Segmento | ✅ salvo (`segment_id`) |
| Horários de funcionamento | ✅ salvo (`business_hours`) |
| Fuso horário | ✅ salvo (`business_timezone`) |
| Mensagem de boas-vindas | ✅ salvo (`welcome_message`) |
| **Endereço** | ❌ cosmético — sem coluna |
| **Telefone comercial** | ❌ cosmético — sem coluna |
| **Site** | ❌ cosmético — sem coluna |
| Enviar logo | ❌ botão fake ("em breve") |

---

## Plano de correção

### 1. Migration SQL (`supabase/manual/20260531000000_profile_persistence.sql`)
Adicionar colunas faltantes em `profiles`:
- `phone text` (telefone pessoal)
- `user_timezone text default 'America/Sao_Paulo'`
- `notify_email boolean default true`
- `notify_push boolean default true`
- `business_address text`
- `business_phone text`
- `business_website text`
- `business_logo_url text`

### 2. Server functions
**`src/lib/profile.functions.ts`** (novo): `getMyProfile` + `updateMyProfile` (nome, telefone, fuso, notificações) usando `requireSupabaseAuth`.

**`src/lib/onboarding.functions.ts`** (editar): estender `getWorkspaceProfile` e `updateWorkspaceProfile` para incluir `business_address`, `business_phone`, `business_website`, `business_logo_url`.

### 3. UI
**`_authenticated.settings.profile.tsx`**: trocar `setTimeout` por chamada real ao server fn; hidratar todos os campos do banco; manter idioma cosmético.

**`_authenticated.settings.workspace.tsx`**: hidratar e enviar endereço/telefone/site no `persist()`.

### 4. Fora do escopo (deixo cosmético com nota)
- Upload real de avatar/logo (precisa Supabase Storage bucket)
- Trocar senha (já existe `updatePassword` no `useAuth`, posso ligar se quiser)
- Idioma (você pediu pra manter)

---

**Confirma esse plano?** Em particular:
1. Quer que eu inclua troca de senha real (já temos a função pronta)?
2. Upload de logo/avatar agora ou deixo pra depois?
