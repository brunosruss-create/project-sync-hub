import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
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
  const { data: profile, isLoading } = useProfile();

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Usuário";

  const avatar =
    profile?.avatar_url || (user?.user_metadata?.avatar_url as string | undefined);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {avatar ? (
          <img
            src={avatar}
            alt={displayName}
            className="size-14 rounded-full border border-border object-cover"
          />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-lg font-semibold text-secondary-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1
            className="text-3xl tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Olá, {displayName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {user?.email} {isLoading && "· carregando perfil…"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>User ID</CardDescription>
            <CardTitle className="break-all text-sm font-mono">{user?.id}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Provedor</CardDescription>
            <CardTitle className="text-base capitalize">
              {user?.app_metadata?.provider || "email"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Stripe</CardDescription>
            <CardTitle className="text-base">
              {profile?.stripe_customer_id ? "Vinculado" : "Não vinculado"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {!profile && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Configuração pendente</CardTitle>
            <CardDescription>
              A tabela <code>profiles</code> não foi encontrada ou a row não foi criada.
              Rode o SQL no seu Supabase (mensagem do chat) e recarregue.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
