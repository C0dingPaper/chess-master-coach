import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Search, Swords } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { navigation } from "@/components/app-sidebar";
import { useGames } from "@/lib/chess/hooks";

export function WorkspaceSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const games = useGames();
  const pages = navigation.filter((item) => item.title.toLowerCase().includes(deferredQuery));
  const matches = useMemo(() => {
    if (!deferredQuery) return games.slice(0, 4);
    const results = [];
    for (const game of games) {
      if (`${game.oppName} ${game.opening} ${game.eco}`.toLowerCase().includes(deferredQuery)) results.push(game);
      if (results.length === 8) break;
    }
    return results;
  }, [games, deferredQuery]);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Search your workspace</DialogTitle>
        <DialogDescription>Find a page, an opponent, or an opening in your games.</DialogDescription>
      </DialogHeader>
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search workspace" placeholder="Try an opening or opponent…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 pl-10" /></div>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto" aria-live="polite">
        {pages.length > 0 && <div><p className="section-kicker px-3 pb-1">Pages</p>{pages.map((page) => <Link key={page.url} to={page.url} className="search-result" onClick={() => onOpenChange(false)}><page.icon className="h-4 w-4 text-accent" /><span className="flex-1 text-sm">{page.title}</span><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" /></Link>)}</div>}
        {matches.length > 0 && <div><p className="section-kicker px-3 pb-1">{deferredQuery ? "Matching games" : "Recent games"}</p>{matches.map((game) => <Link key={game.id} to="/app/games/$gameId" params={{ gameId: game.id }} className="search-result" onClick={() => onOpenChange(false)}><Swords className="h-4 w-4 text-accent" /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{game.opening}</span><span className="text-xs text-muted-foreground">vs {game.oppName}</span></span><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" /></Link>)}</div>}
        {pages.length === 0 && matches.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No results. Try another name or opening.</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
