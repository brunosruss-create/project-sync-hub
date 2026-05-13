## Objetivo

Descobrir, com 100% de certeza, por que a Inbox mostra "não é possível conectar". As variáveis `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` já existem nos secrets do Lovable — então o erro está no **valor** delas ou na **disponibilidade** do Railway. Vamos provar qual é.

## O que vou fazer

### 1. Criar rota pública de diagnóstico
Arquivo novo: `src/routes/api/public/evo-diag.ts`

A rota faz, no servidor (onde os secrets existem):
- Lê `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` do `process.env`
- Mostra: tamanho da key (sem expor o valor), URL final, se tem `https://`, se tem barra no fim
- Faz `GET {URL}/instance/fetchInstances` com header `apikey: {KEY}`
- Retorna JSON com: `status`, `latency_ms`, `body_preview` (primeiros 300 chars), `error` se der timeout

Sem expor a key. Apenas leitura. Nada destrutivo.

### 2. Você abre a URL
`https://github-vercel-bridge.lovable.app/api/public/evo-diag`

### 3. Interpretar o resultado

| Resposta | Significado | Fix |
|---|---|---|
| `status: 200` + lista de instâncias | Evolution OK — o bug está em outro lugar (RLS, webhook, instanceName) | Investigo o fluxo da Inbox |
| `status: 401/403` | Key errada (não bate com `AUTHENTICATION_API_KEY` do Railway) | Atualizar `EVOLUTION_API_KEY` no secret |
| `status: 404` | URL aponta pra path errado | Conferir base URL do Railway |
| `error: ENOTFOUND` ou DNS fail | Domínio do Railway mudou ou está fora | Atualizar `EVOLUTION_API_URL` |
| `error: timeout` ou `502/503` | Container do Railway parado/dormindo | Subir no Railway |
| `error: "não configurado"` | Secret vazio | Repreencher o secret |

### 4. Aplicar o fix correspondente
Depende do resultado. Se for valor de secret, abro o formulário pra você atualizar.

### 5. Remover a rota de diagnóstico
Após resolver, deleto `src/routes/api/public/evo-diag.ts` pra não deixar endpoint público desnecessário.

## Por que rota pública

Server functions normais (`createServerFn`) exigem auth e cookie de sessão, o que dificulta testar do lado de fora. `/api/public/*` não exige auth no Lovable e basta abrir no navegador. A rota é **read-only** e **não vaza a key** (só mostra comprimento e prefixo da URL).

## Riscos

- Nenhum. Não escreve em banco, não muda config, não expõe secrets.
- Rota fica ativa até a remoção (passo 5) — em produção por alguns minutos só.
