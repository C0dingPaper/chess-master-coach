import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookmarkCheck, Plus, StickyNote } from "lucide-react";

export const Route = createFileRoute("/app/repertoire")({
  head: () => ({ meta: [{ title: "Repertoire · NeverPay4Chess" }] }),
  component: RepertoirePage,
});

const repertoires = [
  { name: "Italian Game", color: "white", lines: 12, mastered: 7, eco: "C50–C54", note: "Focus on Giuoco Pianissimo. Avoid early d3 if Black plays Bc5." },
  { name: "Caro-Kann", color: "black", lines: 8, mastered: 3, eco: "B10–B19", note: "Solid against e4. Need to drill the Advance variation." },
  { name: "King's Indian", color: "black", lines: 5, mastered: 2, eco: "E60–E99", note: "Mar del Plata is the goal." },
];

function RepertoirePage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Build & curate"
        title="Your repertoire"
        description="Save your moves, label your lines, and write your own notes. This is your personal opening book."
        actions={<Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="h-4 w-4 mr-1.5" /> New line</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {repertoires.map((r) => (
          <Card key={r.name} className="p-5 border-border/60 bg-card/40 hover:border-accent/40 transition group">
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-md bg-muted grid place-items-center text-2xl font-display">
                {r.color === "white" ? "♔" : "♚"}
              </div>
              <Badge variant="outline" className="font-mono text-[10px]">{r.eco}</Badge>
            </div>
            <h3 className="font-display text-xl font-semibold">{r.name}</h3>
            <div className="text-xs text-muted-foreground mt-0.5 capitalize">As {r.color}</div>

            <div className="mt-4">
              <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                <span>Mastered</span><span>{r.mastered} / {r.lines}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-accent" style={{ width: `${(r.mastered / r.lines) * 100}%` }} />
              </div>
            </div>

            <div className="mt-4 p-3 rounded-md bg-muted/30 border border-border/40 text-xs text-muted-foreground flex gap-2">
              <StickyNote className="h-3.5 w-3.5 shrink-0 mt-0.5 text-accent" />
              <span className="italic">{r.note}</span>
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1">Edit lines</Button>
              <Button size="sm" className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90">Train</Button>
            </div>
          </Card>
        ))}

        <Card className="p-5 border-dashed border-border/60 bg-transparent grid place-items-center min-h-[280px] hover:border-accent/40 transition cursor-pointer">
          <div className="text-center">
            <div className="h-10 w-10 mx-auto rounded-md border border-dashed border-border grid place-items-center mb-3">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="font-display font-medium">Add a new repertoire</div>
            <div className="text-xs text-muted-foreground mt-1">Pick an opening, choose your moves</div>
          </div>
        </Card>
      </div>

      <Card className="mt-8 p-5 border-border/60 bg-card/40">
        <div className="flex items-center gap-2 mb-3">
          <BookmarkCheck className="h-4 w-4 text-accent" />
          <h3 className="font-display text-lg font-semibold">Pinned positions</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Critical positions you've marked as "my move".</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["1.e4 e5 2.Nf3 Nc6 3.Bc4", "1.e4 c6 2.d4 d5", "1.d4 Nf6 2.c4 g6", "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5"].map((line) => (
            <div key={line} className="aspect-square rounded-md bg-board grain relative shadow-elegant overflow-hidden">
              <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-background/95 to-transparent">
                <div className="font-mono text-[10px] truncate">{line}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
