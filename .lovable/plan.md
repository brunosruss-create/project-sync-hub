## Objetivo

Adicionar login/cadastro com Google nas páginas `/login` e `/signup`, e preparar uma tabela `profiles` no Supabase pra guardar dados básicos do usuário (necessária pra ligar ao Stripe depois sem refazer schema).

## O que vou fazer no código

1. **Botão "Continuar com Google"** em `/login` e `/signup`
   - Usa `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/auth/callback } })`
   - Mesmo botão funciona pra login e signup (Google decide se cria conta nova ou loga)

2. **Rota `/auth/callback`** (`src/routes/auth.callback.tsx`)
   - Página leve que aguarda o Supabase processar o token na URL e redireciona pra `/dashboard`
   - Mostra "Finalizando login…" enquanto isso

3. **Hook `useAuth`** já tem `onAuthStateChange` — só precisa adicionar `signInWithGoogle()` no contexto

4. **Tabela `profiles` + trigger** (script SQL pra você rodar no Supabase)
   - Colunas: `id` (FK pra `auth.users`), `email`, `full_name`, `avatar_url`, `stripe_customer_id` (nullable, pro futuro), `created_at`
   - Trigger `on_auth_user_created` cria a row automaticamente no signup (Google ou email)
   - RLS: usuário só lê/edita o próprio perfil
   - Você roda o SQL no SQL Editor do Supabase (não vou usar migrations gerenciadas)

5. **Dashboard mostra avatar + nome** vindos do `profiles` (em vez de só email)

## O que VOCÊ precisa fazer no Supabase (1x, manual)

1. **Authentication → Providers → Google** → enable
2. Criar OAuth credentials em https://console.cloud.google.com/apis/credentials:
   - Application type: Web application
   - Authorized redirect URI: `https://xrezmnaspkctuidehqqi.supabase.co/auth/v1/callback`
3. Colar **Client ID** e **Client Secret** no Supabase
4. **Authentication → URL Configuration** → adicionar nas "Redirect URLs":
   - `https://id-preview--e2215eb7-4cbb-4afc-8773-9f93425b90f1.lovable.app/auth/callback`
   - `http://localhost:*/auth/callback` (pra dev local, se usar)
   - URL final quando publicar
5. Rodar o SQL da tabela `profiles` no SQL Editor (eu te entrego pronto)

## Stripe (não agora, mas preparado)

- A coluna `stripe_customer_id` em `profiles` fica pronta pra quando ligarmos
- Quando quiser ativar: criamos server function que gera Customer no Stripe na 1ª compra, salva o ID, e cria Checkout Session com trial gratuito

## Não-objetivos desta etapa

- Não conectar Stripe agora
- Não criar páginas de billing/pricing ainda
- Não implementar magic link (já temos email/senha + Google é suficiente)
