import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  stripe_customer_id: string | null;
  created_at: string;
};

export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!user?.id) return;
    const channelName = `profile-${user.id}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(channelName);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
      () => queryClient.invalidateQueries({ queryKey: ["profile", user.id] }),
    );
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const fullName =
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        user.email?.split("@")[0] ||
        null;
      const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
      const fallbackProfile: Profile = {
        id: user.id,
        email: user.email ?? null,
        full_name: fullName,
        avatar_url: avatarUrl ?? null,
        stripe_customer_id: null,
        created_at: user.created_at,
      };

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (error) return fallbackProfile;
      if (data) return data as Profile;

      const { data: createdProfile, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email ?? null,
          full_name: fullName,
          avatar_url: avatarUrl ?? null,
        })
        .select("*")
        .maybeSingle();

      if (createError?.code === "23505") {
        const { data: existingProfile, error: reloadError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        if (reloadError) throw reloadError;
        return existingProfile as Profile | null;
      }

      if (createError) return fallbackProfile;
      return (createdProfile as Profile | null) ?? fallbackProfile;
    },
  });
}
