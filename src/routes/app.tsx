import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar, navigation } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Search, ChevronRight, Plus, ShieldCheck } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useChessDataStatus, useConnection } from "@/lib/chess/hooks";
const ConnectDialog = lazy(() => import("@/components/connect-dialog").then((m) => ({ default: m.ConnectDialog })));
const WorkspaceSearch = lazy(() => import("@/components/workspace-search").then((m) => ({ default: m.WorkspaceSearch })));
export const Route = createFileRoute("/app")({ component: AppLayout });

function AppLayout() {
  const conn = useConnection();
  const { loading, error } = useChessDataStatus();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const page = [...navigation].reverse().find((item) => pathname.startsWith(item.url))?.title ?? "Overview";
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return <SidebarProvider>
    <a href="#workspace-content" className="skip-link">Skip to content</a>
    <AppSidebar onConnect={() => setOpen(true)} />
    <SidebarInset className="min-w-0">
      <header className="app-topbar sticky top-0 z-30">
        <SidebarTrigger className="h-8 w-8 shrink-0 text-muted-foreground" />
        <div className="hidden items-center gap-2 text-xs sm:flex"><span className="text-muted-foreground">Workspace</span><ChevronRight className="h-3 w-3 text-muted-foreground/60" /><span className="font-medium">{pathname.startsWith("/app/games/") ? "Game review" : page}</span></div>
        <span className="text-sm font-semibold sm:hidden">{page}</span>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => setSearchOpen(true)} className="app-search-trigger" aria-label="Search workspace" aria-keyshortcuts="Control+k Meta+k"><Search className="h-4 w-4" /><span className="hidden lg:inline">Search workspace</span><kbd className="ml-5 hidden rounded border border-border bg-white px-1 text-[10px] lg:inline">Ctrl K</kbd></button>
          <span className="hidden h-6 w-px bg-border md:block" />
          <Button size="sm" onClick={() => setOpen(true)} className="h-9 gap-1.5"><Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">{conn ? "Import games" : "Connect account"}</span><span className="sm:hidden">Import</span></Button>
        </div>
      </header>
      <div id="workspace-content" tabIndex={-1} className="app-content min-w-0 flex-1 outline-none">
        {loading ? <div className="app-page" role="status" aria-label="Loading your chess workspace"><div className="mb-8 h-8 w-52 rounded bg-muted" /><div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl border border-border bg-card" />)}</div><div className="h-[440px] rounded-xl border border-border bg-card" /><span className="sr-only">Loading your games…</span></div> : error ? <div className="app-page"><div role="alert" className="surface-card p-8"><h1 className="text-xl font-semibold">Your local data couldn’t load</h1><p className="my-3 text-sm text-muted-foreground">Please reload the page and allow browser storage to access your chess workspace.</p><Button onClick={() => window.location.reload()}>Reload workspace</Button></div></div> : <Outlet />}
      </div>
      <footer className="mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-border py-5 text-[10px] text-muted-foreground md:mx-8"><span>NeverPay4Chess · A little better, every game.</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" /> Private on this device. Free forever.</span></footer>
    </SidebarInset>
    <Suspense fallback={null}>
      {open && <ConnectDialog open={open} onOpenChange={setOpen} initialUsername={conn?.username} initialPlatform={conn?.platform} initialImportCategory={conn?.importCategory} />}
      {searchOpen && <WorkspaceSearch open={searchOpen} onOpenChange={setSearchOpen} />}
    </Suspense>
  </SidebarProvider>;
}

