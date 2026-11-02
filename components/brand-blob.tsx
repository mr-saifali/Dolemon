"use client";

/** Soft rose gradient wash, top-right. Purely decorative. */
export function BrandBlob({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="pointer-events-none absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.30),rgba(255,140,90,0.10)_42%,transparent_72%)] will-change-transform animate-blob" />
      <div className="pointer-events-none absolute -left-32 top-[38%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_center,rgba(140,110,255,0.16),transparent_70%)]" />
      <div className="pointer-events-none absolute -left-20 bottom-[-12%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(94,234,212,0.10),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(14,14,17,0.65)_75%,#0E0E11)]" />
    </div>
  );
}
