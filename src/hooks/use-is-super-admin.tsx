import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Returns true only when the current user has the super_admin role.
 * Fail-closed: any error => false.
 */
export function useIsSuperAdmin() {
  const { user, loading: authLoading } = useAuth();

  const q = useQuery({
    queryKey: ["is-super-admin", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("is_super_admin");
      if (error) {
        console.error("[use-is-super-admin] rpc failed:", error);
        return false;
      }
      return data === true;
    },
  });

  return {
    isSuperAdmin: q.data === true,
    loading: authLoading || q.isLoading,
  };
}
