import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveOrg } from "@/hooks/use-organization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/members")({
  component: MembersPage,
});

type MemberRow = {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

function MembersPage() {
  const { active } = useActiveOrg();

  const { data: members, isLoading } = useQuery({
    queryKey: ["org_members", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("org_members")
        .select("user_id, role, joined_at")
        .eq("org_id", active!.id);
      if (error) throw error;

      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (rows ?? []).map<MemberRow>((r) => ({
        user_id: r.user_id,
        role: r.role,
        joined_at: r.joined_at,
        profiles: map.get(r.user_id) ?? null,
      }));
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Membros</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pessoas com acesso a {active?.name}.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Equipe</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <ul className="divide-y">
              {members?.map((m) => {
                const display = m.profiles?.full_name ?? m.profiles?.email ?? m.user_id;
                const initials = (display ?? "?").slice(0, 2).toUpperCase();
                return (
                  <li key={m.user_id} className="flex items-center gap-4 px-6 py-4">
                    <Avatar className="h-10 w-10"><AvatarFallback>{initials}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{m.profiles?.full_name ?? "—"}</p>
                      <p className="truncate text-sm text-muted-foreground">{m.profiles?.email}</p>
                    </div>
                    <Badge variant={m.role === "owner" ? "default" : "secondary"} className="capitalize">{m.role}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
