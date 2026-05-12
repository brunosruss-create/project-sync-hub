import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

const STORAGE_KEY = "active_org_id";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: string;
};

export type MemberRole = "owner" | "admin" | "member";

export function useOrganizations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["organizations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_members")
        .select("role, organizations(*)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .filter((row) => row.organizations)
        .map((row) => ({ ...(row.organizations as Organization), role: row.role as MemberRole }));
    },
  });
}

export function useActiveOrg() {
  const { data: orgs, isLoading } = useOrganizations();
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (!orgs || orgs.length === 0) return;
    if (!activeId || !orgs.find((o) => o.id === activeId)) {
      const first = orgs[0].id;
      setActiveIdState(first);
      localStorage.setItem(STORAGE_KEY, first);
    }
  }, [orgs, activeId]);

  const setActiveId = (id: string) => {
    setActiveIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const active = orgs?.find((o) => o.id === activeId) ?? null;
  return { orgs: orgs ?? [], active, activeId, setActiveId, isLoading };
}
