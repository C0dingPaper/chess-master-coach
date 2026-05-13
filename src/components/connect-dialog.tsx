import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { setConnection, putGames, clearGames } from "@/lib/chess/storage";
import { importGames, type ImportProgress } from "@/lib/chess/import";
import type { Platform } from "@/lib/chess/types";
import { toast } from "sonner";
import { Loader2, Plug } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialUsername?: string;
  initialPlatform?: Platform;
}

export function ConnectDialog({ open, onOpenChange, initialUsername = "", initialPlatform = "chess.com" }: Props) {
  const [username, setUsername] = useState(initialUsername);
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    const u = username.trim();
    if (!u) { toast.error("Enter your username"); return; }
    setBusy(true);
    setProgress({ fetched: 0, parsed: 0, total: null, status: "Starting…" });
    try {
      await clearGames();
      const { games, errors } = await importGames(platform, u, setProgress);
      if (games.length === 0) {
        toast.error(`No games found for ${u} on ${platform}`);
        setBusy(false);
        return;
      }
      await putGames(games);
      await setConnection({ username: u, platform, linkedAt: Date.now(), lastImport: Date.now() });
      toast.success(`Imported ${games.length} games from ${platform}`, {
        description: errors.length ? `${errors.length} entries skipped` : undefined,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error("Import failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const pct = progress?.total ? Math.round((progress.fetched / progress.total) * 100) : (progress ? 50 : 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <Plug className="h-5 w-5 text-accent" /> Connect your chess account
          </DialogTitle>
          <DialogDescription>
            Enter your username — we'll pull your public games. No account, no password, no email. Your data lives in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Platform</Label>
            <RadioGroup value={platform} onValueChange={(v) => setPlatform(v as Platform)} className="grid grid-cols-2 gap-2 mt-2">
              {(["chess.com", "lichess"] as Platform[]).map((p) => (
                <Label
                  key={p}
                  htmlFor={`p-${p}`}
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition ${platform === p ? "border-accent bg-accent/5" : "border-border hover:bg-muted/40"}`}
                >
                  <RadioGroupItem value={p} id={`p-${p}`} />
                  <div>
                    <div className="font-medium text-sm">{p === "chess.com" ? "Chess.com" : "Lichess"}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{p === "chess.com" ? "Last 6 months" : "Last 200 games"}</div>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="username" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={platform === "chess.com" ? "MagnusCarlsen" : "DrNykterstein"}
              className="mt-2 font-mono"
              disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
            />
          </div>

          {progress && (
            <div className="rounded-md bg-muted/40 border border-border p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{progress.status}</span>
                <span className="font-mono text-accent">{progress.parsed} games</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConnect} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…</> : "Import games"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
