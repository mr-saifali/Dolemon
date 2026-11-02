"use client";

/** Soft rose gradient wash, top-right. Purely decorative. */
export function BrandBlob({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="pointer-events-none absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.34),rgba(255,92,122,0.07)_45%,transparent_70%)] blur-2xl animate-blob" />
      <div className="pointer-events-none absolute -left-32 top-[38%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_center,rgba(120,90,255,0.16),transparent_68%)] blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(14,14,17,0.65)_75%,#0E0E11)]" />
    </div>
  );
}
