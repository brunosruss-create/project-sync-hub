import * as React from "react";

interface ViaCepResult {
  street: string;
  neighborhood: string;
  city: string;
  stateUf: string;
}

export function useViaCep() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const lookup = React.useCallback(async (rawCep: string): Promise<ViaCepResult | null> => {
    const clean = rawCep.replace(/\D/g, "");
    if (clean.length !== 8) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const json = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (json.erro) {
        setError("CEP não encontrado");
        return null;
      }
      return {
        street: json.logradouro ?? "",
        neighborhood: json.bairro ?? "",
        city: json.localidade ?? "",
        stateUf: json.uf ?? "",
      };
    } catch {
      setError("Falha ao buscar CEP");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const formatCep = React.useCallback((v: string): string => {
    const digits = v.replace(/\D/g, "").slice(0, 8);
    return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  }, []);

  return { lookup, loading, error, formatCep };
}
