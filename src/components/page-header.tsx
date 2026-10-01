import type { ReactNode } from "react";
interface PageHeaderProps { eyebrow?: string; title: string; description?: string; actions?: ReactNode; }
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return <div className="page-header">
    <div className="min-w-0">
      {eyebrow && <div className="section-kicker">{eyebrow}</div>}
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>;
}

