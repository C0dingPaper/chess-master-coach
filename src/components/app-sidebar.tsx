import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Swords,
  GitBranch,
  BookMarked,
  Brain,
  AlertTriangle,
  TrendingUp,
  Plug,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { useConnection, useGames } from "@/lib/chess/hooks";
import { computeStats } from "@/lib/chess/stats";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard; exact?: boolean };

const playItems: NavItem[] = [
  { title: "Overview", url: "/app", icon: LayoutDashboard, exact: true },
  { title: "My Games", url: "/app/games", icon: Swords },
  { title: "Opening Tree", url: "/app/openings", icon: GitBranch },
];

const trainItems: NavItem[] = [
  { title: "Repertoire", url: "/app/repertoire", icon: BookMarked },
  { title: "Spaced Repetition", url: "/app/train", icon: Brain },
  { title: "Mistakes", url: "/app/mistakes", icon: AlertTriangle },
];

const trackItems: NavItem[] = [
  { title: "Skills & Progress", url: "/app/skills", icon: TrendingUp },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const conn = useConnection();
  const games = useGames();
  const stats = computeStats(games);
  const isActive = (url: string, exact?: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border h-14 px-3 flex items-center">
        <Logo />
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        {[
          { label: "Play", items: playItems },
          { label: "Train", items: trainItems },
          { label: "Track", items: trackItems },
        ].map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(item.url, item.exact);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={active}>
                        <Link
                          to={item.url}
                          className={`flex items-center gap-3 ${active ? "text-accent" : ""}`}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {conn ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-accent to-accent/50 grid place-items-center text-accent-foreground font-display font-bold text-sm uppercase">
                {conn.username.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{conn.username}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {stats.rating ?? "—"} · {conn.platform}
                </div>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-[9px] gap-1 px-1.5 py-0.5">
              <Plug className="h-2.5 w-2.5 text-accent" />
              <span className="hidden sm:inline">linked</span>
            </Badge>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground px-1">Not connected</div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
