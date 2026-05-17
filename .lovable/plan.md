# Plano: endereço estruturado + IA divulgando contato

Objetivo: deixar funcional (não só cosmético). A IA passa a receber endereço/site/telefone no prompt, controlado por **um único toggle** na config de IA. Endereço vira estruturado com CEP, número e complemento.

## 1. Banco de dados — nova migration

Arquivo: `supabase/manual/20260612000000_business_address_structured_and_ai_contact_toggle.sql`

```sql
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
```

Mantém `business_address` legado (não dropa) para não quebrar nada — passa a ser ignorado pela UI nova, mas continua lendo no backfill.

## 2. Configurações → Negócio (UI)

Arquivo: `src/routes/_authenticated.settings.workspace.tsx`

Trocar o bloco CONTATO atual (Endereço / Telefone / Site) por:

- Aviso topo da seção:
  > 💡 Esses dados podem ser informados pela IA quando o cliente perguntar (endereço, site, telefone). Mantenha-os atualizados.
- Linha 1: **CEP** (input com máscara `00000-000`). Ao completar 8 dígitos → fetch `https://viacep.com.br/ws/{cep}/json/` no cliente e preenche Rua / Bairro / Cidade / UF automaticamente. Estados de loading e "CEP não encontrado".
- Linha 2: **Rua/Logradouro** (preenchido pelo ViaCEP, editável)
- Linha 3 (grid 2 col): **Número** | **Complemento** (ex.: "Torre 2, Sala 33")
- Linha 4 (grid 3 col): **Bairro** | **Cidade** | **UF**
- **Telefone comercial** e **Site** (mantidos)

Estado/persistência:
- novos `useState`: `cep`, `street`, `number`, `complement`, `neighborhood`, `city`, `state`
- `useEffect` de load: hidrata dos campos novos; fallback: se `business_street` vazio e `business_address` preenchido → usa `business_address` como street
- save: grava as 7 colunas novas; mantém `business_address` sincronizado como string concatenada (`"{street}, {number} — {complement} — {neighborhood}, {city}/{state} — CEP {cep}"`) para compatibilidade legada

Validação: zod no save — CEP regex `^\d{5}-?\d{3}$` opcional, UF 2 letras maiúsculas opcional, demais strings ≤ 200.

## 3. Agente IA → novo toggle único

Arquivo: `src/routes/_authenticated.ai-agent.tsx`

Na seção **COMPORTAMENTO DO AGENTE**, adicionar **1 toggle** (manter os 4 que já existem — não substituir nenhum):

- Label: **"A IA pode informar endereço, site e telefone quando perguntada?"**
- Hint: *"Quando ligado, a IA usa os dados de Configurações → Negócio para responder perguntas tipo 'onde fica?', 'qual o telefone?', 'tem site?'. Desligue se preferir que esses dados não sejam divulgados pelo WhatsApp."*
- Estado: `shareContactInfo`, default `true`
- Hidrata de `ai_can_share_contact_info`, salva em `profiles.ai_can_share_contact_info`

## 4. IA — injeção real no system prompt (parte funcional)

Arquivo: `src/lib/ai-respond.server.ts`

Em `buildWorkspaceLayer` (depois do bloco IDENTIDADE / antes de TOM), adicionar bloco **DADOS DE CONTATO**:

- Se `p.ai_can_share_contact_info !== false` (default ligado) E houver pelo menos um dado preenchido (`business_street` || `business_phone` || `business_website`):
  - Monta `addressLine` a partir dos campos estruturados (street + número + complemento + bairro + cidade/UF + CEP), pulando vazios.
  - Adiciona ao prompt:
    ```
    DADOS DE CONTATO DO NEGÓCIO (use APENAS se o cliente perguntar — não ofereça espontaneamente):
    - Endereço: {addressLine}
    - Telefone: {business_phone}
    - Site: {business_website}
    Quando perguntado sobre localização, telefone ou site, responda com a informação exata acima. Não invente, não complete dados faltantes.
    ```
- Se toggle desligado OU sem dados:
  - Adiciona proibição:
    ```
    OBRIGATÓRIO: NÃO informe endereço, telefone ou site do negócio. Se perguntado, diga que pode passar o contato com um atendente humano.
    ```

Atualizar o `.select()` (linha ~500) para incluir os novos campos: `business_cep, business_street, business_address_number, business_address_complement, business_neighborhood, business_city, business_state, business_phone, business_website, ai_can_share_contact_info` (ou manter `*` se já cobre — confirmar; hoje é `*`, então cobre automaticamente).

## 5. Tipos / interface

Adicionar `ai_can_share_contact_info: boolean` em `AiBehaviorConfig` (linha 37-48 de `ai-respond.server.ts`).

## Arquivos afetados

- ✏️ `supabase/manual/20260612000000_business_address_structured_and_ai_contact_toggle.sql` (novo)
- ✏️ `src/routes/_authenticated.settings.workspace.tsx` (bloco CONTATO refeito + ViaCEP)
- ✏️ `src/routes/_authenticated.ai-agent.tsx` (1 toggle novo)
- ✏️ `src/lib/ai-respond.server.ts` (bloco DADOS DE CONTATO no prompt)

## Fora de escopo

- Não mexe nos toggles existentes de comportamento.
- Não muda outras mensagens/templates.
- Não remove `business_address` legado (fica como espelho).
