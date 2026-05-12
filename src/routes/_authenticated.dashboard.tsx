import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-4xl tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Bem-vindo
        </h1>
        <p className="mt-1 text-muted-foreground">
          Você está autenticado no seu Supabase.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>User ID</CardDescription>
            <CardTitle className="break-all text-base font-mono">{user?.id}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Email</CardDescription>
            <CardTitle className="text-base">{user?.email}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Criado em</CardDescription>
            <CardTitle className="text-base">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximos passos</CardTitle>
          <CardDescription>
            Adicione tabelas no seu Supabase, crie organizações, integre Stripe…
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Criar tabela <code>profiles</code> com RLS no SQL editor do Supabase</li>
            <li>Adicionar membros e roles em uma tabela <code>user_roles</code></li>
            <li>Plug Stripe via server functions quando estiver pronto</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
