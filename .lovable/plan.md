## Problema

O placeholder do campo "Descrição" no modal de criar serviço está fixo num exemplo de limpeza de pele — irrelevante quando o workspace é uma oficina mecânica, advocacia, veterinária, etc. Como existem 16 segmentos cadastrados em `ai_segments`, o exemplo precisa ser **por segmento**.

## Solução

Cada segmento ganha um campo novo `example_service_description` (texto curto, ~200 chars) com um exemplo realista de descrição de serviço daquele ramo. O modal carrega o exemplo do segmento do workspace logado e usa como placeholder do textarea.

## Mudanças

### 1. Migration SQL — nova coluna + seed

`supabase/manual/{timestamp}_ai_segments_example_description.sql`

- `alter table ai_segments add column if not exists example_service_description text;`
- `update ... set example_service_description = '...' where slug = '...'` para cada um dos 16 segmentos existentes.

Exemplos planejados (um por segmento):

| Slug | Exemplo |
|---|---|
| `clinica_estetica` | "Limpeza de pele profunda com extração de cravos, aplicação de máscara calmante e finalização com protetor solar. Indicada para peles oleosas." |
| `consultorio_medico` | "Consulta clínica de avaliação inicial, com anamnese completa e orientação sobre exames necessários. Atende convênio e particular." |
| `odontologia` | "Limpeza e profilaxia com remoção de tártaro, polimento e aplicação de flúor. Recomendada a cada 6 meses." |
| `laboratorio` | "Coleta de sangue para hemograma completo. Necessário jejum de 8h. Resultado liberado em até 24h." |
| `salao_beleza` | "Corte feminino com lavagem, hidratação e escova. Inclui consultoria de estilo conforme o tipo de cabelo." |
| `barbearia` | "Corte masculino na máquina e tesoura + barba completa com toalha quente e finalização com bálsamo." |
| `oficina_mecanica` | "Troca de óleo e filtro com inspeção visual de freios, suspensão e níveis. Use óleo 5W30 sintético." |
| `estetica_automotiva` | "Lavagem completa externa e interna + cera de proteção. Veículos pequenos e médios." |
| `academia_personal` | "Avaliação física inicial com bioimpedância, medidas e teste de condicionamento. Resultado em até 48h." |
| `fisioterapia` | "Sessão de fisioterapia ortopédica para reabilitação pós-cirúrgica de joelho. Inclui exercícios e terapia manual." |
| `assistencia_tecnica` | "Diagnóstico de celular com orçamento. Cobrimos tela, bateria, conector de carga e placa." |
| `clinica_veterinaria` | "Consulta clínica geral para cães e gatos. Inclui exame físico, orientação nutricional e plano vacinal." |
| `nutricao_dietetica` | "Consulta nutricional inicial com avaliação antropométrica, plano alimentar personalizado e retorno em 30 dias." |
| `psicologia_terapia` | "Sessão de psicoterapia individual de 50 minutos. Abordagem cognitivo-comportamental, presencial ou online." |
| `advocacia_juridico` | "Consulta jurídica inicial para análise do caso e orientação sobre próximos passos. Sem compromisso." |
| `outro_personalizado` | "Descreva o que está incluso, materiais usados, duração média e quaisquer pré-requisitos para o cliente." |

### 2. Server function nova — `getMyServiceExample`

`src/lib/services.functions.ts` (arquivo novo ou existente — verificar)

```ts
export const getMyServiceExample = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("profiles")
      .select("ai_segments:segment_id ( example_service_description )")
      .eq("id", userId)
      .maybeSingle();
    return {
      example:
        (data as any)?.ai_segments?.example_service_description ??
        "Descreva o que está incluso, duração, materiais e pré-requisitos.",
    };
  });
```

### 3. UI — `src/routes/_authenticated.services.tsx`

- Carregar o exemplo uma vez no nível da página (mesma `useEffect` de carregamento inicial ou um `useQuery` pequeno).
- Passar `placeholderExample: string` para `ServiceModal`.
- Trocar o placeholder fixo do textarea pelo valor recebido. Manter o helper text 💡 atual (já está bom e é universal).

### O que NÃO muda

- Helper text 💡 ("Esta descrição é usada pela IA do WhatsApp…") — continua igual, é universal.
- Lógica da IA em `ai-respond.server.ts` — não muda.
- Empty state da página, badge "Sem descrição" no card — sem mudanças.
- Editor super-admin de segmentos — fora do escopo desta iteração; o campo é editável depois via SQL ou pode virar UI futura.

## Arquivos afetados

- `supabase/manual/{timestamp}_ai_segments_example_description.sql` (novo)
- `src/lib/services.functions.ts` (novo ou +server fn)
- `src/routes/_authenticated.services.tsx` (placeholder dinâmico)

## SQL completo

Será colado integralmente na resposta de implementação (conforme regra do projeto), com `ALTER TABLE` idempotente + 16 `UPDATE`s por slug.
