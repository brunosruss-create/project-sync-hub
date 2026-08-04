import type { ContactCard, KanbanColumnId } from "./data";

/**
 * Fonte única do mapeamento entre a tabela `contacts` e o `ContactCard` da UI.
 *
 * Antes isso estava espalhado em 7 lugares (kanban, chat, contatos, dois pontos
 * do modal de novo contato, agenda e o type `DuplicateInfo`), com listas de
 * SELECT divergentes. O efeito era contato parcial: uma tela carregava campos
 * que a outra não, e salvar por cima de um contato parcial apagava dado real.
 * Qualquer campo novo agora é adicionado só aqui.
 */

/** Lista completa de colunas que compõem um ContactCard. */
export const CONTACT_COLUMNS = [
  "id",
  "name",
  "phone",
  "avatar_url",
  "kanban_column",
  "assigned_agent_id",
  "tags",
  "priority",
  "is_unread",
  "unread_count",
  "last_direction",
  "last_message",
  "last_message_at",
  "email",
  "notes",
  "is_blocked",
  "is_archived",
  // CRM — supabase/manual/20260802000000_contact_crm_fields.sql
  "document_type",
  "document_number",
  "birth_date",
  "gender",
  "profession",
  "cep",
  "street",
  "address_number",
  "address_complement",
  "neighborhood",
  "city",
  "state_uf",
].join(",");

/**
 * Fallback para banco que ainda não recebeu as migrations de inbox/CRM.
 * Em produção elas já foram aplicadas — isto cobre ambiente novo.
 *
 * Quando puder cair, é uma deleção só aqui. Só é seguro porque o `ContactForm`
 * envia apenas os campos que o usuário alterou: um contato carregado por este
 * caminho (sem campos de CRM) não apaga o que não leu.
 */
export const CONTACT_COLUMNS_LEGACY = [
  "id",
  "name",
  "phone",
  "avatar_url",
  "kanban_column",
  "assigned_agent_id",
  "tags",
  "priority",
  "is_unread",
  "last_message",
  "last_message_at",
].join(",");

/** Colunas ausentes em bancos antigos — as que podem disparar o fallback. */
const OPTIONAL_COLUMNS = [
  "email",
  "notes",
  "is_blocked",
  "is_archived",
  "unread_count",
  "last_direction",
  "document_type",
  "document_number",
  "birth_date",
  "gender",
  "profession",
  "cep",
  "street",
  "address_number",
  "address_complement",
  "neighborhood",
  "city",
  "state_uf",
];

/**
 * True quando o erro é "coluna não existe" numa coluna opcional — sinal para
 * repetir a query com `CONTACT_COLUMNS_LEGACY`. Unifica os três regexes
 * divergentes que existiam antes espalhados pelas telas.
 */
export function isMissingColumnError(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  // 42703 = undefined_column (Postgres)
  if (error.code === "42703") return true;
  const msg = error.message ?? "";
  if (!/does not exist/i.test(msg)) return false;
  return OPTIONAL_COLUMNS.some((c) => msg.includes(c));
}

/**
 * Converte uma linha de `contacts` em `ContactCard`.
 * Tolerante de propósito: coluna ausente no SELECT vira `null`/default em vez
 * de `undefined`, para que todo chamador produza exatamente o mesmo shape.
 */
export function mapContactRow(r: any): ContactCard {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    avatar: r.avatar_url ?? null,
    lastMessage: r.last_message ?? "",
    lastMessageAt: r.last_message_at ? new Date(r.last_message_at) : new Date(),
    assignedAgent: r.assigned_agent_id ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    isUnread: !!r.is_unread,
    unreadCount:
      typeof r.unread_count === "number" ? r.unread_count : r.is_unread ? 1 : 0,
    lastDirection: r.last_direction ?? null,
    priority: r.priority === "urgent" ? "urgent" : "normal",
    kanban_column: (r.kanban_column ?? "waiting") as KanbanColumnId,
    email: r.email ?? null,
    notes: r.notes ?? null,
    is_blocked: !!r.is_blocked,
    is_archived: !!r.is_archived,
    document_type: r.document_type ?? null,
    document_number: r.document_number ?? null,
    birth_date: r.birth_date ?? null,
    gender: r.gender ?? null,
    profession: r.profession ?? null,
    cep: r.cep ?? null,
    street: r.street ?? null,
    address_number: r.address_number ?? null,
    address_complement: r.address_complement ?? null,
    neighborhood: r.neighborhood ?? null,
    city: r.city ?? null,
    state_uf: r.state_uf ?? null,
  };
}

/**
 * Campos que caracterizam um CADASTRO de cliente (CRM), fora de nome/telefone —
 * que todo contato tem, por vir do WhatsApp. Espelha o `FormValues` do
 * `ContactForm`: campo de CRM novo lá precisa entrar aqui também.
 *
 * `document_type` fica fora de propósito: é qualificador de `document_number`,
 * e o segmented control pode ser tocado sem nunca preencher o documento.
 * `notes` também fica fora — é anotação de atendimento ("pediu retorno amanhã"),
 * não dado de identidade; incluir faria contato qualquer virar cliente.
 *
 * O `satisfies` é o único type-check real aqui: sem tipos gerados do Supabase,
 * renomear campo no `ContactCard` quebra o tsc nesta linha em vez de tornar o
 * filtro de clientes silenciosamente vazio em runtime.
 */
export const CRM_REGISTRATION_FIELDS = [
  "email",
  "document_number",
  "birth_date",
  "gender",
  "profession",
  "cep",
  "street",
  "address_number",
  "address_complement",
  "neighborhood",
  "city",
  "state_uf",
] as const satisfies readonly (keyof ContactCard)[];

/**
 * True quando o contato tem cadastro de CRM — qualquer campo de
 * `CRM_REGISTRATION_FIELDS` preenchido. Derivado, sem coluna no banco: é o que
 * separa "cliente" de "contato que só apareceu no WhatsApp".
 *
 * Aceita `Partial` de propósito: além do ContactCard completo, precisa tolerar
 * linha carregada por `CONTACT_COLUMNS_LEGACY` (que não traz campo de CRM
 * nenhum) e payload parcial de realtime sem quebrar em runtime.
 *
 * O `trim()` importa: o `ContactForm` grava `null` no lugar de string vazia, mas
 * linha vinda de webhook/import pode ter `""` — sem ele, `city: ""` promoveria
 * todo contato a cliente.
 */
export function hasRegistration(
  contact: Partial<ContactCard> | null | undefined,
): boolean {
  if (!contact) return false;
  return CRM_REGISTRATION_FIELDS.some((f) => {
    const v = contact[f];
    return typeof v === "string" ? v.trim().length > 0 : v != null;
  });
}
