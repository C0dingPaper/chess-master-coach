import { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6 mb-6 border-b border-border/60">
      <div>
        {eyebrow && (
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
