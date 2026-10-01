import { Link } from "@tanstack/react-router";
interface LogoProps { className?: string; showText?: boolean; }
export function Logo({ className = "", showText = true }: LogoProps) {
  return (
    <Link to="/" aria-label="NeverPay4Chess home" className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#173f34] font-serif text-[30px] leading-none text-white" aria-hidden="true">♞</span>
      {showText && <span className="flex flex-col gap-1 leading-none">
        <span className="text-[14px] font-bold tracking-[-0.04em] text-foreground">NeverPay<span className="text-accent">4</span>Chess</span>
        <span className="text-[9px] font-medium uppercase tracking-[0.19em] text-muted-foreground">Your chess workspace</span>
      </span>}
    </Link>
  );
}

