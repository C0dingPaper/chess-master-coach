import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Search, Bell, Plug } from "lucide-react";
import { useState } from "react";
import { ConnectDialog } from "@/components/connect-dialog";
import { useConnection } from "@/lib/chess/hooks";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const conn = useConnection();
  const [open, setOpen] = useState(false);
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-xl flex items-center px-4 gap-3">
            <SidebarTrigger />
            <div className="h-5 w-px bg-border" />
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search games, openings, positions..."
                className="w-full h-9 pl-9 pr-3 rounded-md bg-muted/40 border border-border/50 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Bell className="h-4 w-4" />
              </Button>
              {conn ? (
                <Button
                  onClick={() => setOpen(true)}
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs gap-2"
                >
                  <Plug className="h-3.5 w-3.5 text-accent" />
                  {conn.username} · {conn.platform}
                </Button>
              ) : (
                <Button
                  onClick={() => setOpen(true)}
                  size="sm"
                  className="bg-accent text-accent-foreground hover:bg-accent/90 font-medium"
                >
                  Connect account
                </Button>
              )}
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </SidebarInset>
        <ConnectDialog
          open={open}
          onOpenChange={setOpen}
          initialUsername={conn?.username}
          initialPlatform={conn?.platform}
        />
      </div>
    </SidebarProvider>
  );
}
