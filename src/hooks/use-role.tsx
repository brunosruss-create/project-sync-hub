import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AppRole = "manager" | "agent";

export function useRole() {
  const { user, loading: authLoading } = useAuth();

  const q = useQuery({
    queryKey: ["my-role", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<AppRole> => {
      const { data, error } = await supabase.rpc("get_my_role");
      if (error) {
        console.error("[use-role] get_my_role failed:", error);
        return "agent"; // fail-closed: nunca elevar para manager por erro
      }
      if (!data) return "agent";
      return data as AppRole;
    },
  });

  const role: AppRole = q.data ?? "agent";
  return {
    role,
    isManager: role === "manager",
    isAgent: role === "agent",
    loading: authLoading || q.isLoading,
  };
}
