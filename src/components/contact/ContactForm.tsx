import * as React from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import type { ContactCard } from "@/features/inbox/data";
import { formatPhone } from "@/features/inbox/data";
import { useContactActions, type ContactPatch } from "@/hooks/use-contact-actions";
import { useViaCep } from "@/hooks/use-viacep";
import {
  formatDocument,
  isValidDocument,
  onlyDigits,
  type DocumentType,
} from "@/lib/cpf-cnpj";

interface ContactFormProps {
  contact: ContactCard;
  onSaved?: () => void;
  compact?: boolean;
}

/**
 * Campos editáveis do formulário. As chaves são idênticas às colunas do banco —
 * é isso que permite montar o patch por diff, sem manter uma segunda lista de
 * campos em algum lugar. Tudo string: o form nunca guarda null, converte no save.
 *
 * Campo de CRM novo aqui também precisa entrar em `CRM_REGISTRATION_FIELDS`
 * (features/inbox/contact-row.ts) — é o que decide se o contato conta como
 * cliente cadastrado na tela de Clientes.
 */
type FormValues = {
  name: string;
  email: string;
  notes: string;
  birth_date: string;
  gender: string;
  profession: string;
  document_type: string;
  document_number: string;
  cep: string;
  street: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state_uf: string;
};

/** Única lista de campos do form — Object.keys() disso define o diff do save. */
function valuesFromContact(c: ContactCard): FormValues {
  return {
    name: c.name ?? "",
    email: c.email ?? "",
    notes: c.notes ?? "",
    birth_date: c.birth_date ?? "",
    gender: c.gender ?? "",
    profession: c.profession ?? "",
    document_type: c.document_type ?? "",
    document_number: c.document_number ?? "",
    cep: c.cep ?? "",
    street: c.street ?? "",
    address_number: c.address_number ?? "",
    address_complement: c.address_complement ?? "",
    neighborhood: c.neighborhood ?? "",
    city: c.city ?? "",
    state_uf: c.state_uf ?? "",
  };
}

export function ContactForm({ contact, onSaved }: ContactFormProps) {
  const actions = useContactActions();
  const viaCep = useViaCep();

  const [values, setValues] = React.useState<FormValues>(() => valuesFromContact(contact));
  // Espelho do que veio do banco. O save envia só as chaves que divergem daqui,
  // para nunca sobrescrever campo que o usuário não editou — inclusive campo que
  // a tela de origem não carregou (contato parcial apagaria dado real).
  const [initial, setInitial] = React.useState<FormValues>(() => valuesFromContact(contact));

  const [newTag, setNewTag] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const tags = contact.tags ?? [];

  const set = React.useCallback(
    <K extends keyof FormValues>(key: K, v: FormValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: v })),
    [],
  );

  const [docOpen, setDocOpen] = React.useState(
    !!(contact.document_type || contact.document_number),
  );
  const [addrOpen, setAddrOpen] = React.useState(
    !!(contact.cep || contact.street || contact.city),
  );

  // Depende só do id de propósito: o objeto `contact` é recriado a cada
  // zf:contact-updated / realtime, e rehidratar nessas horas descartaria o que o
  // usuário está digitando. Trocar de contato é o único momento de resetar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const next = valuesFromContact(contact);
    setValues(next);
    setInitial(next);
    setNewTag("");
    setDocOpen(!!(contact.document_type || contact.document_number));
    setAddrOpen(!!(contact.cep || contact.street || contact.city));
  }, [contact.id]);

  const changedKeys = React.useMemo(
    () =>
      (Object.keys(values) as Array<keyof FormValues>).filter(
        (k) => values[k] !== initial[k],
      ),
    [values, initial],
  );
  const isDirty = changedKeys.length > 0;

  const docType = values.document_type as DocumentType | "";

  const handleCepChange = (v: string) => {
    set("cep", viaCep.formatCep(v));
    const digits = v.replace(/\D/g, "");
    if (digits.length === 8) {
      void viaCep.lookup(digits).then((r) => {
        if (!r) return;
        setValues((prev) => ({
          ...prev,
          street: r.street,
          neighborhood: r.neighborhood,
          city: r.city,
          state_uf: r.stateUf,
        }));
      });
    }
  };

  const handleDocTypeChange = (t: DocumentType) => {
    setValues((prev) => {
      const cleared = prev.document_type === t;
      return {
        ...prev,
        document_type: cleared ? "" : t,
        document_number:
          !prev.document_number || cleared
            ? ""
            : formatDocument(prev.document_number, t),
      };
    });
  };

  const handleDocNumberChange = (v: string) => {
    if (!docType) return;
    set("document_number", formatDocument(onlyDigits(v), docType));
  };

  const docValid =
    docType && values.document_number
      ? isValidDocument(values.document_number, docType)
      : true;

  const handleSave = async () => {
    if (!isDirty) return;
    const patch: Record<string, string | null> = {};
    for (const key of changedKeys) {
      const raw = values[key].trim();
      // Nome é obrigatório no banco — nunca deixar virar null.
      patch[key] = key === "name" ? raw : raw || null;
    }
    setSaving(true);
    const ok = await actions.saveContact(contact.id, patch as ContactPatch);
    setSaving(false);
    if (ok) {
      setInitial(values);
      onSaved?.();
    }
  };

  const handleAddTag = async () => {
    const t = newTag.trim();
    if (!t) return;
    const ok = await actions.addTag(contact.id, t, tags);
    if (ok) setNewTag("");
  };

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* DADOS BÁSICOS */}
      <SectionLabel>Dados Básicos</SectionLabel>
      <Field label="Nome" value={values.name} onChange={(v) => set("name", v)} />
      <Field label="Telefone" value={formatPhone(contact.phone)} readOnly />
      <Field label="Email" value={values.email} onChange={(v) => set("email", v)} type="email" />
      <Field
        label="Data de Nascimento"
        value={values.birth_date}
        onChange={(v) => set("birth_date", v)}
        type="date"
      />
      <div className="flex flex-col" style={{ gap: 4 }}>
        <FieldLabel>Gênero</FieldLabel>
        <select
          value={values.gender}
          onChange={(e) => set("gender", e.target.value)}
          style={inputStyle}
        >
          <option value="">Selecionar…</option>
          <option value="masculino">Masculino</option>
          <option value="feminino">Feminino</option>
          <option value="outro">Outro</option>
        </select>
      </div>
      <Field
        label="Profissão / Empresa"
        value={values.profession}
        onChange={(v) => set("profession", v)}
      />

      {/* DOCUMENTO */}
      <CollapsibleSection title="Documento" open={docOpen} onToggle={() => setDocOpen((v) => !v)}>
        <div className="flex" style={{ gap: 4 }}>
          {(["pessoa_fisica", "pessoa_juridica"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleDocTypeChange(t)}
              style={{
                flex: 1,
                height: 30,
                fontSize: 11,
                fontWeight: 500,
                borderRadius: "var(--radius-control)",
                border: `1px solid ${docType === t ? "var(--brand-400)" : "var(--border)"}`,
                background: docType === t ? "color-mix(in oklab, var(--brand-400) 12%, transparent)" : "transparent",
                color: docType === t ? "var(--brand-400)" : "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              {t === "pessoa_fisica" ? "Pessoa Física" : "Pessoa Jurídica"}
            </button>
          ))}
        </div>
        {docType && (
          <>
            <Field
              label={docType === "pessoa_fisica" ? "CPF" : "CNPJ"}
              value={values.document_number}
              onChange={handleDocNumberChange}
              placeholder={docType === "pessoa_fisica" ? "000.000.000-00" : "00.000.000/0000-00"}
            />
            {values.document_number && !docValid && (
              <span style={{ fontSize: 11, color: "#EF4444" }}>
                {docType === "pessoa_fisica" ? "CPF" : "CNPJ"} inválido
              </span>
            )}
          </>
        )}
      </CollapsibleSection>

      {/* ENDEREÇO */}
      <CollapsibleSection title="Endereço" open={addrOpen} onToggle={() => setAddrOpen((v) => !v)}>
        <Field
          label="CEP"
          value={values.cep}
          onChange={handleCepChange}
          placeholder="00000-000"
          hint={viaCep.error ?? (viaCep.loading ? "Buscando endereço…" : undefined)}
        />
        <div className="flex" style={{ gap: 8 }}>
          <div style={{ flex: 7 }}>
            <Field
              label="Rua / Logradouro"
              value={values.street}
              onChange={(v) => set("street", v)}
            />
          </div>
          <div style={{ flex: 3 }}>
            <Field
              label="Número"
              value={values.address_number}
              onChange={(v) => set("address_number", v)}
            />
          </div>
        </div>
        <Field
          label="Complemento"
          value={values.address_complement}
          onChange={(v) => set("address_complement", v)}
        />
        <div className="flex" style={{ gap: 8 }}>
          <div style={{ flex: 4 }}>
            <Field
              label="Bairro"
              value={values.neighborhood}
              onChange={(v) => set("neighborhood", v)}
            />
          </div>
          <div style={{ flex: 4 }}>
            <Field label="Cidade" value={values.city} onChange={(v) => set("city", v)} />
          </div>
          <div style={{ flex: 2 }}>
            <Field
              label="UF"
              value={values.state_uf}
              onChange={(v) => set("state_uf", v)}
              maxLength={2}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* OBSERVAÇÕES */}
      <SectionLabel>Observações</SectionLabel>
      <Field
        label="Notas internas"
        value={values.notes}
        onChange={(v) => set("notes", v)}
        multiline
      />

      {/* TAGS */}
      <SectionLabel>Tags</SectionLabel>
      <div className="flex flex-wrap" style={{ gap: 4 }}>
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center"
            style={{
              gap: 4,
              padding: "3px 4px 3px 8px",
              background: "var(--bg-overlay)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              fontSize: 11,
              color: "var(--text-primary)",
            }}
          >
            {t}
            <button
              type="button"
              onClick={() => void actions.removeTag(contact.id, t, tags)}
              aria-label={`Remover ${t}`}
              style={{
                width: 16, height: 16, borderRadius: "var(--radius-pill)",
                background: "transparent", color: "var(--text-muted)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <div className="inline-flex items-center" style={{ gap: 4 }}>
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                void handleAddTag();
              }
            }}
            placeholder="Nova tag…"
            style={{
              height: 24, width: 100, fontSize: 11, padding: "0 8px",
              borderRadius: "var(--radius-pill)", border: "1px dashed var(--border-strong)",
              background: "transparent", color: "var(--text-primary)", outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void handleAddTag()}
            aria-label="Adicionar tag"
            style={{
              width: 24, height: 24, borderRadius: "var(--radius-pill)",
              background: "var(--bg-overlay)", color: "var(--text-primary)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Plus size={12} />
          </button>
        </div>
        <span style={{ fontSize: 10, color: "var(--text-muted)", width: "100%" }}>
          Enter ou vírgula para adicionar
        </span>
      </div>

      {/* SALVAR */}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || !docValid || !isDirty}
        className="btn-primary"
        style={{
          alignSelf: "flex-start",
          marginTop: 4,
          opacity: saving || !isDirty ? 0.6 : 1,
          cursor: !isDirty ? "default" : undefined,
        }}
      >
        {saving ? "Salvando…" : isDirty ? "Salvar alterações" : "Sem alterações"}
      </button>
    </div>
  );
}

// --- Helpers ---

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: "0 8px",
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 12,
  outline: "none",
  width: "100%",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        borderBottom: "1px solid var(--border)",
        paddingBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  readOnly,
  type = "text",
  placeholder,
  hint,
  maxLength,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 4 }}>
      <FieldLabel>{label}</FieldLabel>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          rows={3}
          style={{
            ...inputStyle,
            height: "auto",
            minHeight: 60,
            padding: "6px 8px",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          maxLength={maxLength}
          style={{
            ...inputStyle,
            color: readOnly ? "var(--text-muted)" : "var(--text-primary)",
            cursor: readOnly ? "default" : undefined,
          }}
        />
      )}
      {hint && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{hint}</span>}
    </div>
  );
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center w-full"
        style={{
          gap: 6,
          padding: "6px 0",
          background: "transparent",
          border: "none",
          borderBottom: "1px solid var(--border)",
          color: "var(--text-muted)",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          cursor: "pointer",
        }}
      >
        <ChevronDown
          size={12}
          style={{
            transition: "transform 150ms",
            transform: open ? "rotate(0)" : "rotate(-90deg)",
          }}
        />
        {title}
      </button>
      {open && (
        <div className="flex flex-col" style={{ gap: 12, paddingTop: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}
