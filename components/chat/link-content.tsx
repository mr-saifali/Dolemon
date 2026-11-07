"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Link2, Play, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { instagramEmbed, splitLinks } from "@/lib/links";

type Preview = { title: string; description: string; site: string };

function LinkCard({ url }: { url: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [watching, setWatching] = useState(false);
  const viewer = useRef<HTMLDivElement | null>(null);
  const watchButton = useRef<HTMLButtonElement | null>(null);
  const embed = instagramEmbed(url);
  const parsed = new URL(url);
  useEffect(() => {
    if (!watching) return;
    const trigger = watchButton.current;
    const focusable = () => Array.from(viewer.current?.querySelectorAll<HTMLElement>("button, a[href], iframe") ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setWatching(false); }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (trigger?.isConnected) trigger.focus(); };
  }, [watching]);
  const loadPreview = async () => {
    setBusy(true); setError("");
    try {
      const db = getSupabase();
      const { data } = db ? await db.auth.getSession() : { data: { session: null } };
      if (!data.session?.access_token) throw new Error("Sign in to load a page preview.");
      const response = await fetch("/api/link-preview", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("Preview unavailable. You can still open the link.");
      const value = await response.json() as Preview;
      setPreview(value);
    } catch (e) { setError(e instanceof Error ? e.message : "Preview unavailable."); }
    finally { setBusy(false); }
  };
  // The message container handles long-press and swipe; link controls must never
  // trigger those actions when the user is opening a URL.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return <div onPointerDown={stop} onPointerUp={stop} onClick={stop} onKeyDown={stop} className="mt-2 w-full min-w-0 max-w-[260px] rounded-xl bg-black/20 p-2.5 text-left">
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10"><Link2 className="h-3.5 w-3.5" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[11px] uppercase tracking-wide text-white/60">{preview?.site || parsed.hostname}</span><span className="mt-0.5 block break-words text-[13px] font-medium text-white">{preview?.title || (embed ? "Instagram post" : parsed.hostname)}</span><span className="mt-0.5 block truncate text-[11px] text-white/60">{preview?.description || `${parsed.hostname}${parsed.pathname}`}</span></span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-white/60" />
    </a>
    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/75">
      {!preview && <button type="button" disabled={busy} onClick={() => void loadPreview()} title="Fetch the page title and description from this site" className="rounded-full bg-white/10 px-2.5 py-1.5 disabled:opacity-50">{busy ? "Loading…" : "Load preview"}</button>}
      {embed && <button ref={watchButton} type="button" onClick={() => setWatching(true)} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5"><Play className="h-3 w-3" /> Watch here</button>}
    </div>
    {error && <p role="status" className="mt-1.5 text-[11px] text-white/70">{error}</p>}
    {watching && embed && createPortal(<div role="dialog" aria-modal="true" aria-label="Instagram viewer" onClick={stop} onPointerDown={stop} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4">
      <div ref={viewer} className="flex h-[min(85dvh,740px)] w-full max-w-md flex-col rounded-2xl bg-[#18181b] p-3 shadow-2xl">
        <div className="flex items-center justify-between gap-2 pb-2"><p className="text-sm text-zinc-200">Instagram</p><button type="button" onClick={() => setWatching(false)} aria-label="Close Instagram viewer" className="rounded-full p-2 text-zinc-300 hover:bg-white/10"><X className="h-5 w-5" /></button></div>
        <iframe title="Instagram post" src={embed} loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation" allow="autoplay; encrypted-media; picture-in-picture" className="min-h-0 w-full flex-1 rounded-xl bg-white" />
        <p className="pt-2 text-center text-xs text-zinc-400">Some posts are private or blocked from embedding. <a href={url} target="_blank" rel="noopener noreferrer" className="underline text-zinc-200">Open on Instagram</a></p>
      </div>
    </div>, document.body)}
  </div>;
}

export function LinkContent({ text }: { text: string }) {
  const parts = useMemo(() => splitLinks(text), [text]);
  const links = Array.from(new Set(parts.filter((part) => part.type === "link").map((part) => part.value)));
  return <><span className="min-w-0 whitespace-pre-wrap break-words text-[15px] leading-[20px] [overflow-wrap:anywhere]">{parts.map((part, i) => part.type === "link" ? <a key={i} href={part.value} target="_blank" rel="noopener noreferrer" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} className="text-white underline decoration-white/50 underline-offset-2">{part.value}</a> : part.value)}</span>{links.map((link) => <LinkCard key={link} url={link} />)}</>;
}
