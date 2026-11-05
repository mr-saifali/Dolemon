"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppGuard } from "@/components/app-guard";
import { Switch } from "@/components/ui/switch";
import { BrainCircuit, ChevronLeft, Download, RotateCcw, Save, Sparkles, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { authMode } from "@/lib/auth";
import { loadDoremonRecords, saveDoremonMemory, type DoremonRecord } from "@/lib/doremon/memory";
import type { DoremonMemory } from "@/lib/doremon/types";
import {
  LAB_FLAGS,
  openLoopsOf,
  sanitizeProfile,
  withLoopDone,
  type Learning,
  type PersonalProfile,
} from "@/lib/personal/core";
import {
  clearEvents,
  eventLabel,
  exportPersonalData,
  killAllLabs,
  patchProfile,
  readProfile,
  recordEvent,
  resetProfile,
  setChangelogNote,
  setFlag,
  useChangelog,
  useEvents,
  useLabs,
  useLearnings,
  useProfile,
} from "@/lib/personal/store";
import { playMotif } from "@/lib/sound";

const REMOTE = authMode === "supabase";

type LoopRow = {
  id: string;
  text: string;
  at: number;
  conversationId: string;
  partner: string;
  memory: DoremonMemory;
  status: "open" | "done";
};

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-5 scroll-mt-4 rounded-xl2 border border-white/[0.06] bg-white/[0.025] p-4">
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-rose/80">{title}</p>
      {description && <p className="mb-3 text-[11.5px] leading-snug text-zinc-500">{description}</p>}
      {children}
    </section>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#111114] px-3 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-rose/40"
      />
    </label>
  );
}

function BrainScreen() {
  const profile = useProfile();
  const labs = useLabs();
  const changelog = useChangelog();
  const events = useEvents();
  const { learnings, dismissed, dismiss, restore } = useLearnings();
  const [draft, setDraft] = useState<PersonalProfile>(() => readProfile());
  const [records, setRecords] = useState<DoremonRecord[]>([]);
  const [newTerm, setNewTerm] = useState("");
  const [newMeans, setNewMeans] = useState("");
  const [newSynonyms, setNewSynonyms] = useState("");
  const [clearArmed, setClearArmed] = useState(false);

  useEffect(() => {
    recordEvent("brain.open");
    void loadDoremonRecords(REMOTE)
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);

  const loops = useMemo<LoopRow[]>(
    () =>
      records.flatMap((rec) =>
        (rec.memory.graph?.openLoops ?? []).map((loop) => ({
          id: loop.id,
          text: loop.text,
          at: loop.at,
          conversationId: rec.conversationId,
          partner: rec.memory.partnerUsername || "a deleted chat",
          memory: rec.memory,
          status: loop.status,
        }))
      ).sort((a, b) => b.at - a.at),
    [records]
  );

  const openCount = loops.filter((l) => l.status === "open").length;
  const timeline = useMemo(
    () =>
      records
        .flatMap((rec) =>
          (rec.memory.graph?.episodes ?? []).map((ep) => ({ ...ep, partner: rec.memory.partnerUsername || "a deleted chat" }))
        )
        .sort((a, b) => b.day.localeCompare(a.day))
        .slice(0, 14),
    [records]
  );
  const facts = useMemo(
    () =>
      records
        .flatMap((rec) => (rec.memory.graph?.facts ?? []).map((f) => ({ ...f, partner: rec.memory.partnerUsername || "someone" })))
        .sort((a, b) => b.at - a.at)
        .slice(0, 12),
    [records]
  );

  const set = <K extends keyof PersonalProfile>(key: K, value: PersonalProfile[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    patchProfile(sanitizeProfile({ ...draft, updatedAt: Date.now() }));
    toast.success("Your Dolemon updated");
  };

  const markDone = async (loop: LoopRow) => {
    const graph = loop.memory.graph;
    if (!graph) return;
    const next = withLoopDone(graph, loop.id);
    const memory = { ...loop.memory, graph: next };
    setRecords((prev) => prev.map((r) => (r.conversationId === loop.conversationId ? { ...r, memory } : r)));
    recordEvent("loop.done", { conversationId: loop.conversationId });
    await saveDoremonMemory(loop.conversationId, memory, REMOTE).catch(() => undefined);
    toast.success("Loop closed");
  };

  const addWord = () => {
    const term = newTerm.trim().slice(0, 60);
    if (!term) return;
    const next = [
      ...profile.lexicon,
      {
        term,
        means: newMeans.trim().slice(0, 120) || "your word",
        synonyms: newSynonyms.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12),
      },
    ];
    patchProfile({ lexicon: next });
    setDraft((prev) => ({ ...prev, lexicon: next }));
    setNewTerm("");
    setNewMeans("");
    setNewSynonyms("");
    toast.success(`${term} added to your lexicon`);
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(exportPersonalData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dolemon-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Your data downloaded");
  };

  const eventCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) map.set(e.kind, (map.get(e.kind) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [events]);

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-[#09090B]">
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-28 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.14),transparent_70%)]" />
      <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-16 safe-t">
        <header className="flex items-center gap-2 pb-2 pt-6">
          <Link href="/app" aria-label="Back to your room" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-white">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <BrainCircuit className="h-4 w-4 text-rose/80" />
          <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Your Dolemon</h1>
          <span className="ml-auto rounded-full border border-white/[0.07] px-2 py-0.5 text-[10px] text-zinc-500">one owner</span>
        </header>
        <p className="px-2 pb-2 text-[12px] leading-snug text-zinc-500">
          Everything that makes this app yours lives here. One file, one person, editable — never a setting buried in a menu.
        </p>

        {/* 1 · Constitution */}
        <Section id="constitution" title="The Constitution · me.json" description="One editable file. The greeting, Doremon's voice, the quiet hours and every sound derive from this.">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Your name" value={draft.name} onChange={(v) => set("name", v)} />
            <Field label="Nickname" value={draft.nickname} onChange={(v) => set("nickname", v)} placeholder="what they call you" />
            <Field label="City" value={draft.city} onChange={(v) => set("city", v)} />
            <Field label="Timezone" value={draft.timezone} onChange={(v) => set("timezone", v)} />
            <Field label="Language mix" value={draft.language} onChange={(v) => set("language", v)} />
            <Field label="Quiet from" type="number" value={draft.quietFrom} onChange={(v) => set("quietFrom", Number(v))} />
            <Field label="Quiet until" type="number" value={draft.quietTo} onChange={(v) => set("quietTo", Number(v))} />
          </div>
          <div className="mt-2.5">
            <Field label="How you actually speak" value={draft.languageNote} onChange={(v) => set("languageNote", v)} />
          </div>

          <p className="mb-1.5 mt-4 text-[11px] text-zinc-500">Your four-note self chord (Hz) — every sound in Dolemon is a variation of it.</p>
          <div className="flex items-center gap-1.5">
            {draft.selfChord.map((note, i) => (
              <input
                key={i}
                type="number"
                value={note}
                onChange={(e) => {
                  const next = [...draft.selfChord];
                  next[i] = Number(e.target.value);
                  set("selfChord", next);
                }}
                className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.07] bg-[#111114] px-1.5 text-center text-[12px] text-zinc-200 outline-none"
              />
            ))}
            <button type="button" onClick={() => playMotif(draft.selfChord, "together")} aria-label="Play my chord" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose/10 text-rose active:scale-95">
              <Volume2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-3">
            <Switch label="Doremon may read the full history" description="Off = he only sees the last few lines." checked={draft.boundaries.aiMayReadHistory} onChange={(v) => set("boundaries", { ...draft.boundaries, aiMayReadHistory: v })} />
            <Switch label="Ambient room sound" description="A barely-there chord while you're both here." checked={draft.boundaries.ambientSound} onChange={(v) => set("boundaries", { ...draft.boundaries, ambientSound: v })} />
            <Switch label="Let the app learn my rhythms" description="Local-only events. Turn off and nothing is observed." checked={draft.boundaries.telemetry} onChange={(v) => set("boundaries", { ...draft.boundaries, telemetry: v })} />
            <Switch label="Doremon may send messages" description="Hard-wired off. He advises; only your thumb sends." checked={false} disabled onChange={() => undefined} />
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={save} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-vibrant py-2.5 text-[13px] font-medium text-[#1A1013] active:scale-[0.98]">
              <Save className="h-3.5 w-3.5" /> Save
            </button>
            <button type="button" onClick={() => { const next = resetProfile(); setDraft(next); toast.success("Back to defaults"); }} className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-2.5 text-[12px] text-zinc-300 active:scale-95">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </Section>

        {/* 8 · Labs */}
        <Section id="labs" title="Labs garden" description="One user means no staged rollout. Try a thing, note how it felt, roll it back in one tap.">
          <div className="space-y-3">
            {LAB_FLAGS.map((flag) => (
              <Switch key={flag.id} label={flag.label} description={flag.description} checked={labs[flag.id]} onChange={(v) => setFlag(flag.id, v)} />
            ))}
          </div>
          <button type="button" onClick={() => { killAllLabs(); toast.success("Everything off"); }} className="mt-3 w-full rounded-full border border-danger/30 bg-danger/[0.08] py-2 text-[12px] text-[#FF8B8B] active:scale-[0.98]">
            Kill switch · turn it all off
          </button>
          {changelog.length > 0 && (
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <p className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">What I tried & how it felt</p>
              {changelog.slice(0, 4).map((entry) => (
                <div key={entry.id} className="mb-2 rounded-xl bg-white/[0.03] px-3 py-2">
                  <p className="text-[11.5px] text-zinc-300">{entry.label} · {entry.enabled ? "on" : "off"}</p>
                  <p className="text-[10px] text-zinc-600">{new Date(entry.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</p>
                  <input
                    value={entry.note}
                    onChange={(e) => setChangelogNote(entry.id, e.target.value)}
                    placeholder="how did it feel?"
                    className="mt-1.5 h-8 w-full rounded-lg bg-[#111114] px-2 text-[11.5px] text-zinc-200 outline-none placeholder:text-zinc-600"
                  />
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 9 · Open loops */}
        <Section id="loops" title={`Open loops · ${openCount}`} description="Promises Doremon heard in your own words. No notifications, no nagging — just a ledger you can ask.">
          {loops.length === 0 ? (
            <p className="text-[12.5px] text-zinc-500">Nothing open yet. Promises from your chats collect here quietly.</p>
          ) : (
            <ul className="space-y-2">
              {loops.slice(0, 12).map((loop) => (
                <li key={loop.id} className="flex items-start gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose/70" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[12.5px] leading-snug ${loop.status === "done" ? "text-zinc-600 line-through" : "text-zinc-200"}`}>{loop.text}</p>
                    <p className="mt-0.5 text-[10.5px] text-zinc-600">{loop.partner} · {new Date(loop.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                  </div>
                  {loop.status === "open" ? (
                    <button type="button" onClick={() => void markDone(loop)} className="shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[10.5px] text-zinc-300 active:scale-95">done</button>
                  ) : (
                    <span className="shrink-0 text-[10.5px] text-zinc-600">closed</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {records[0] && (
            <Link href={`/app/doremon/${records[0].conversationId}`} className="mt-3 block text-center text-[12px] text-sky-300/90">
              Ask Doremon “what did I promise?” →
            </Link>
          )}
        </Section>

        {/* 10 · Lexicon */}
        <Section id="lexicon" title="Private lexicon" description="Your two-person dictionary. Search expands synonyms, the composer completes your words, Doremon speaks them back.">
          <ul className="space-y-1.5">
            {profile.lexicon.map((entry, i) => (
              <li key={`${entry.term}-${i}`} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="text-[12.5px] font-medium text-zinc-200">{entry.term}</span>
                  <span className="ml-2 text-[11.5px] text-zinc-500">{entry.means}</span>
                  {entry.synonyms.length > 0 && <span className="block text-[10.5px] text-zinc-600">also: {entry.synonyms.join(", ")}</span>}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${entry.term}`}
                  onClick={() => {
                    const next = profile.lexicon.filter((_, index) => index !== i);
                    patchProfile({ lexicon: next });
                    setDraft((prev) => ({ ...prev, lexicon: next }));
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-600 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Word" value={newTerm} onChange={setNewTerm} placeholder="e.g. chai" />
            <Field label="Means" value={newMeans} onChange={setNewMeans} placeholder="our 3am talk" />
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={newSynonyms}
              onChange={(e) => setNewSynonyms(e.target.value)}
              placeholder="synonyms, comma separated"
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-[#111114] px-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <button type="button" onClick={addWord} className="shrink-0 rounded-xl bg-white/[0.08] px-3 text-[12.5px] text-zinc-200 active:scale-95">Add</button>
          </div>
        </Section>

        {/* 2 · Memory graph */}
        {labs["memory.timeline"] && (
          <Section id="timeline" title="Memory timeline" description="Episodes, facts and inside jokes — extracted locally, stored in your private record, no API call.">
            <p className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">Recent days</p>
            {timeline.length === 0 ? (
              <p className="text-[12.5px] text-zinc-500">Chat a little and days will start appearing here.</p>
            ) : (
              <ul className="space-y-1.5">
                {timeline.map((ep, i) => (
                  <li key={`${ep.day}-${i}`} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ep.mood === "warm" ? "bg-rose" : ep.mood === "sharp" ? "bg-amber" : "bg-violet"}`} />
                    <span className="w-[62px] shrink-0 text-[11px] text-zinc-500">{ep.day.slice(5)}</span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-300">{ep.headline}</span>
                    <span className="shrink-0 text-[10.5px] text-zinc-600">{ep.count}</span>
                  </li>
                ))}
              </ul>
            )}
            {facts.length > 0 && (
              <>
                <p className="mb-2 mt-4 text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">Things Doremon kept</p>
                {facts.slice(0, 6).map((f, i) => (
                  <p key={`${f.id}-${i}`} className="truncate py-1 text-[11.5px] text-zinc-400">· {f.text}</p>
                ))}
              </>
            )}
          </Section>
        )}

        {/* 5 · Learnings */}
        <Section id="learnings" title="What it learned about your hands" description="Every change has a reason from real events and a one-tap undo.">
          {learnings.length === 0 && dismissed.length === 0 ? (
            <p className="text-[12.5px] text-zinc-500">Not enough rhythm yet. Use the app for a few days and it will start adapting.</p>
          ) : (
            <ul className="space-y-2">
              {learnings.map((l: Learning) => (
                <li key={l.id} className="rounded-xl bg-violet/[0.06] px-3 py-2.5">
                  <p className="text-[12.5px] font-medium text-zinc-200">{l.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-zinc-500">{l.why} {l.action}</p>
                  <button type="button" onClick={() => dismiss(l.id)} className="mt-1.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-zinc-300 active:scale-95">Undo this change</button>
                </li>
              ))}
              {dismissed.map((l: Learning) => (
                <li key={l.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-500">Undone: {l.title}</span>
                  <button type="button" onClick={() => restore(l.id)} className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-zinc-300">Restore</button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 17 · Honesty */}
        <Section id="honesty" title="Honesty · show your work" description="No invented numbers. Every stat traces back to an event on this device.">
          <div className="flex items-center gap-2 rounded-xl border border-success/20 bg-success/[0.06] px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <p className="text-[11.5px] text-zinc-300">
              {REMOTE ? "Live mode · real events only, no seeded presence history." : "Demo mode · sample presence history is clearly seeded."}
            </p>
          </div>
          <p className="mt-3 text-[11.5px] text-zinc-500">{events.length} events recorded on this device.</p>
          <ul className="mt-2 space-y-1">
            {eventCounts.map(([kind, count]) => (
              <li key={kind} className="flex justify-between text-[11.5px] text-zinc-400">
                <span>{eventLabel(kind as Parameters<typeof eventLabel>[0])}</span>
                <span className="tabular-nums text-zinc-500">{count}</span>
              </li>
            ))}
            {eventCounts.length === 0 && <li className="text-[11.5px] text-zinc-600">Nothing observed yet.</li>}
          </ul>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={download} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white/[0.08] py-2 text-[12px] text-zinc-200 active:scale-[0.98]">
              <Download className="h-3.5 w-3.5" /> Download my data
            </button>
            <button
              type="button"
              onClick={() => {
                if (!clearArmed) { setClearArmed(true); window.setTimeout(() => setClearArmed(false), 3000); return; }
                clearEvents();
                setClearArmed(false);
                toast.success("Events cleared");
              }}
              className="rounded-full bg-white/[0.05] px-3 text-[11.5px] text-zinc-400 active:scale-95"
            >
              {clearArmed ? "Tap again" : "Clear"}
            </button>
          </div>
        </Section>

        <p className="mt-8 text-center text-[10.5px] text-zinc-600">One person. One place. Nothing here is for anyone else.</p>
      </div>
    </main>
  );
}

export default function BrainPage() {
  return (
    <AppGuard>
      <BrainScreen />
    </AppGuard>
  );
}
