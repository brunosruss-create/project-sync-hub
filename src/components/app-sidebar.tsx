import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Settings, Users, LogOut, Check, ChevronsUpDown, Building2 } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useActiveOrg } from "@/hooks/use-organization";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Membros", url: "/members", icon: Users },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { orgs, active, setActiveId } = useActiveOrg();
  const path = useRouterState({ select: (r) => r.location.pathname });

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-md p-2 hover:bg-sidebar-accent">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="truncate text-sm font-medium">{active?.name ?? "Organização"}</div>
                <div className="truncate text-xs opacity-60 capitalize">{active?.plan ?? "free"}</div>
              </div>
              <ChevronsUpDown className="h-4 w-4 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuLabel>Organizações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {orgs.map((o) => (
              <DropdownMenuItem key={o.id} onClick={() => setActiveId(o.id)}>
                <span className="flex-1 truncate">{o.name}</span>
                {o.id === active?.id && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={path === item.url}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-md p-2 hover:bg-sidebar-accent">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <div className="truncate text-sm">{user?.email}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
