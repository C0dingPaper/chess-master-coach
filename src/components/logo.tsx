import { Link } from "@tanstack/react-router";

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className = "", showText = true }: LogoProps) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2.5 group ${className}`}>
      <div className="relative grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-accent to-accent/60 text-accent-foreground font-display text-xl font-bold shadow-[0_4px_20px_-4px_oklch(0.78_0.16_75/0.5)]">
        <span className="leading-none">♞</span>
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-display text-[15px] font-semibold tracking-tight">
            NeverPay<span className="text-accent">4</span>Chess
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
            free forever
          </span>
        </div>
      )}
    </Link>
  );
}
