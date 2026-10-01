import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Swords, GitBranch, BookMarked, Brain, ScanSearch, TrendingUp, ArrowUpRight, ShieldCheck, ChevronRight } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Logo } from "@/components/logo";
import { useConnection, usePinned } from "@/lib/chess/hooks";
export const navigation = [
  { title: "Overview", url: "/app", icon: LayoutDashboard, group: "Workspace" },
  { title: "My games", url: "/app/games", icon: Swords, group: "Workspace" },
  { title: "Opening explorer", url: "/app/openings", icon: GitBranch, group: "Workspace" },
  { title: "My repertoire", url: "/app/repertoire", icon: BookMarked, group: "Improve" },
  { title: "Training", url: "/app/train", icon: Brain, group: "Improve" },
  { title: "Mistake review", url: "/app/mistakes", icon: ScanSearch, group: "Improve" },
  { title: "Skills & progress", url: "/app/skills", icon: TrendingUp, group: "Insights" },
];
export function AppSidebar({ onConnect }: { onConnect: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { state, isMobile, setOpenMobile } = useSidebar();
  const conn = useConnection();
  const pinned = usePinned();
  const due = pinned.filter((p) => p.due <= Date.now()).length;
  const expanded = state === "expanded" || isMobile;
  const closeMobile = () => { if (isMobile) setOpenMobile(false); };
  return <Sidebar collapsible="icon" className="app-sidebar">
    <SidebarHeader className="h-[72px] flex-row items-center justify-center border-b border-sidebar-border px-5">
      <Logo showText={expanded} />
    </SidebarHeader>
    <SidebarContent className="gap-3 px-2 py-5">
      {["Workspace", "Improve", "Insights"].map((group) => <SidebarGroup key={group}>
        <SidebarGroupLabel>{group}</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu className="gap-1">
          {navigation.filter((item) => item.group === group).map((item) => {
            const active = item.url === "/app" ? path.replace(/\/$/, "") === "/app" : path.startsWith(item.url);
            return <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                <Link to={item.url} onClick={closeMobile} aria-current={active ? "page" : undefined}>
                  <item.icon /><span className="flex-1">{item.title}</span>
                  {expanded && item.url === "/app/train" && due > 0 && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">{due}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>;
          })}
        </SidebarMenu></SidebarGroupContent>
      </SidebarGroup>)}
    </SidebarContent>
    <SidebarFooter className="gap-5 p-4">
      {expanded && <div className="rounded-xl border border-[#e0eae4] bg-[#f4f8f5] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#315c48]"><ShieldCheck className="h-4 w-4" /> Your game. Your progress.</div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">All your tools to improve. Always free, with your data on this device.</p>
        <Link to="/app/train" onClick={closeMobile} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent">Make your next move <ArrowUpRight className="h-3 w-3" /></Link>
      </div>}
      <button onClick={() => { closeMobile(); onConnect(); }} className="flex min-w-0 items-center gap-3 rounded-lg border-t border-border pt-4 text-left" aria-label={conn ? "Manage connected account" : "Connect chess account"}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e8eeea] text-sm font-semibold text-accent">{conn ? conn.username.charAt(0).toUpperCase() : "♙"}</span>
        {expanded && <><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-foreground">{conn?.username ?? "Your chess account"}</span><span className="mt-1 block text-[10px] text-muted-foreground">{conn?.platform ?? "Connect to get started"}</span></span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></>}
      </button>
    </SidebarFooter>
  </Sidebar>;
}

