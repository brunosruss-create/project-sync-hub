import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Returns the workspace owner id for the current user.
 * - Manager → own user.id
 * - Agent   → the manager that invited them
 * Falls back to user.id on any error (so old single-user flows keep working).
 */
export function useWorkspaceOwnerId() {
  const { user, loading: authLoading } = useAuth();

  const q = useQuery({
    queryKey: ["workspace-owner", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc("get_my_workspace_owner");
      if (error || !data) return user!.id;
      return data as string;
    },
  });

  return {
    workspaceOwnerId: q.data ?? user?.id ?? null,
    loading: authLoading || q.isLoading,
  };
}
