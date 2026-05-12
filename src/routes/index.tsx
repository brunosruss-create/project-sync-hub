import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            <span style={{ fontFamily: "var(--font-display)" }}>Saas</span>
            <span className="text-accent">.</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <h1
            className="text-5xl leading-tight tracking-tight md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            O começo limpo do seu próximo SaaS.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Auth, dashboard e fundações de banco prontos. Você foca no produto.
          </p>
          <div className="mt-10 flex gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Começar grátis</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Já tenho conta</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
