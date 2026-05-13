import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockGames } from "@/lib/mock-data";
import { Filter, Download } from "lucide-react";

export const Route = createFileRoute("/app/games")({
  head: () => ({ meta: [{ title: "Games · NeverPay4Chess" }] }),
  component: GamesPage,
});

function GamesPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Game history"
        title="My games"
        description="Every game you've ever played, in one place. Click any row to review it move by move."
        actions={
          <>
            <Button variant="outline" size="sm"><Filter className="h-4 w-4 mr-1.5" /> Filter</Button>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" /> Export PGN</Button>
          </>
        }
      />

      <Tabs defaultValue="all" className="mb-4">
        <TabsList className="bg-muted/40">
          <TabsTrigger value="all">All ({mockGames.length})</TabsTrigger>
          <TabsTrigger value="wins">Wins</TabsTrigger>
          <TabsTrigger value="losses">Losses</TabsTrigger>
          <TabsTrigger value="draws">Draws</TabsTrigger>
          <TabsTrigger value="white">As white</TabsTrigger>
          <TabsTrigger value="black">As black</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="border-border/60 overflow-hidden bg-card/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 text-left">Result</th>
                <th className="px-4 py-3 text-left">Opponent</th>
                <th className="px-4 py-3 text-left">Opening</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">ECO</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Time</th>
                <th className="px-4 py-3 text-right">Accuracy</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {mockGames.map((g) => (
                <tr key={g.id} className="border-b border-border/30 hover:bg-muted/30 transition cursor-pointer group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 rounded-full ${g.result === "win" ? "bg-win" : g.result === "loss" ? "bg-loss" : "bg-draw"}`} />
                      <span className={`font-mono text-xs font-semibold uppercase ${g.result === "win" ? "text-win" : g.result === "loss" ? "text-loss" : "text-draw"}`}>
                        {g.result.charAt(0)}
                      </span>
                      <span className="text-xs">{g.color === "white" ? "♔" : "♚"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{g.opponent}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{g.opponentRating}</div>
                  </td>
                  <td className="px-4 py-3">{g.opening}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Badge variant="outline" className="font-mono text-[10px]">{g.eco}</Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell font-mono text-xs text-muted-foreground">{g.timeControl}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm">
                    <span className={g.accuracy >= 85 ? "text-win" : g.accuracy >= 75 ? "text-foreground" : "text-loss"}>
                      {g.accuracy}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell text-xs text-muted-foreground font-mono">{g.date}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition">Review →</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
