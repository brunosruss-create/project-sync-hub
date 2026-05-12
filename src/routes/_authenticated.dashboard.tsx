import { createFileRoute } from "@tanstack/react-router";
import { useActiveOrg } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const { active } = useActiveOrg();
  const name = (user?.user_metadata as { full_name?: string })?.full_name ?? user?.email?.split("@")[0];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">Olá, {name} 👋</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Você está em <span className="font-medium text-foreground">{active?.name}</span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Organização" value={active?.name ?? "—"} />
        <StatCard icon={Sparkles} label="Plano" value={active?.plan ?? "free"} />
        <StatCard icon={Users} label="Seu papel" value={(active as { role?: string })?.role ?? "member"} />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Próximos passos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>✓ Auth + Google configurado</p>
          <p>✓ Tabelas multi-tenant com RLS ativo</p>
          <p>✓ Switcher de organização e papéis</p>
          <p className="pt-2 text-foreground">Agora é só construir suas features sobre essa base.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/10 text-accent">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate font-medium capitalize">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
