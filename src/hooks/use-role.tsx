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
      // Fallback: on error or null, treat as manager (do not lock anyone out)
      if (error || !data) return "manager";
      return data as AppRole;
    },
  });

  const role: AppRole = q.data ?? "manager";
  return {
    role,
    isManager: role === "manager",
    isAgent: role === "agent",
    loading: authLoading || q.isLoading,
  };
}
