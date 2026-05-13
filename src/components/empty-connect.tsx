import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plug } from "lucide-react";
import { useState } from "react";
import { ConnectDialog } from "@/components/connect-dialog";

interface EmptyConnectProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
}

export function EmptyConnect({
  title = "Connect your account to get started",
  description = "Enter your Chess.com or Lichess username and we'll import your games. Everything stays in your browser — no signup required.",
  icon,
}: EmptyConnectProps) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-12 border-dashed border-border/60 bg-card/30 text-center">
      <div className="h-14 w-14 mx-auto rounded-xl bg-accent/10 text-accent grid place-items-center mb-5">
        {icon ?? <Plug className="h-6 w-6" />}
      </div>
      <h3 className="font-display text-2xl font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">{description}</p>
      <Button onClick={() => setOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
        Connect now
      </Button>
      <ConnectDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}
