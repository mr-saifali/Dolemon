import Link from "next/link";
import { BrandBlob } from "@/components/brand-blob";

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink px-6 text-center">
      <BrandBlob />
      <div className="relative z-10 max-w-sm">
        <p className="text-[13px] font-medium tracking-[0.18em] text-rose">404</p>
        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.02em]">Nothing here.</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
          This corner of Dolemon doesn&apos;t exist. Let&apos;s get you back.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex h-12 items-center justify-center rounded-full bg-rose px-6 text-[15px] font-medium text-[#1A0A0F] transition-colors hover:bg-rose-soft"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
