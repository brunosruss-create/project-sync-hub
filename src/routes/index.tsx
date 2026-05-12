import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2, Lock, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background" style={{ background: "var(--gradient-hero), var(--color-background)" }}>
      <header className="container mx-auto flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-semibold">B</div>
          <span className="font-semibold tracking-tight">Base SaaS</span>
        </div>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/login">Entrar</Link></Button>
          <Button asChild size="sm"><Link to="/signup">Criar conta</Link></Button>
        </nav>
      </header>

      <main className="container mx-auto px-6 pt-20 pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            Boilerplate multi-tenant
          </span>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight md:text-6xl">
            A base para o seu próximo{" "}
            <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }} className="text-accent">
              SaaS
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Autenticação, organizações, papéis e RLS configurados.
            Comece a construir o que importa no minuto seguinte.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Começar agora <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Entrar</Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-24 grid max-w-4xl gap-6 md:grid-cols-3">
          {[
            { icon: Lock, title: "Auth segura", desc: "Email/senha + Google, sessão persistente." },
            { icon: Building2, title: "Multi-tenant", desc: "Organizações isoladas via RLS no banco." },
            { icon: Users, title: "Papéis & equipe", desc: "Owner, admin, membro com permissões." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
              <Icon className="h-5 w-5 text-accent" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
