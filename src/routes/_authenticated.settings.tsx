import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveOrg } from "@/hooks/use-organization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const { active } = useActiveOrg();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => { if (profile?.full_name) setFullName(profile.full_name); }, [profile]);
  useEffect(() => { if (active?.name) setOrgName(active.name); }, [active]);

  const saveProfile = async () => {
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user!.id);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
  };

  const saveOrg = async () => {
    if (!active) return;
    const { error } = await supabase.from("organizations").update({ name: orgName }).eq("id", active.id);
    if (error) return toast.error(error.message);
    toast.success("Organização atualizada");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Configurações</h1>

      <Card>
        <CardHeader><CardTitle>Perfil</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fname">Nome completo</Label>
            <Input id="fname" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <Button onClick={saveProfile}>Salvar perfil</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Organização</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="oname">Nome</Label>
            <Input id="oname" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Slug</Label>
            <Input value={active?.slug ?? ""} disabled />
          </div>
          <Button onClick={saveOrg}>Salvar organização</Button>
        </CardContent>
      </Card>
    </div>
  );
}
