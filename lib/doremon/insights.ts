import type { DoremonMemory, DoremonStats, DoremonUserStats } from "./types";

/**
 * Doremon's observer brain, part one: the numbers.
 *
 * Turns the raw talking census (from `doremon_stats()` in the database) into
 * a viewer-relative view — who talks more, how much per day, at which hours,
 * who opens the conversation, and how long the silence has lasted. The room
 * dossier, the predictions and the local (offline) answers are all built
 * from this view, so the local brain and Gemini reason over the same facts.
 */

export type StatsView = {
  me: DoremonUserStats | null;
  them: DoremonUserStats | null;
  meShare: number | null;
  themShare: number | null;
  /** average messages per day over the last 14 days */
  mePerDay: number | null;
  themPerDay: number | null;
  meLastAt: number | null;
  themLastAt: number | null;
  firstAt: number | null;
  lastAt: number | null;
  /** of the last 14 days, how many each one opened */
  meStarts: number;
  themStarts: number;
  /** how long since the conversation last spoke (ms) */
  silentFor: number | null;
  /** conversation-level top activity hours, most-talked first */
  topHours: { hour: number; count: number }[];
  /** each person's top activity hours */
  mePeak: { hour: number; count: number }[];
  themPeak: { hour: number; count: number }[];
  /** who spoke last, "me" | "them" | null */
  lastSpeaker: "me" | "them" | null;
};

const MS_DAY = 24 * 3600 * 1000;

export function viewStats(
  stats: DoremonStats | null,
  meId: string | null,
  partnerId: string | null
): StatsView {
  const empty: StatsView = {
    me: null,
    them: null,
    meShare: null,
    themShare: null,
    mePerDay: null,
    themPerDay: null,
    meLastAt: null,
    themLastAt: null,
    firstAt: stats?.firstAt ? new Date(stats.firstAt).getTime() : null,
    lastAt: stats?.lastAt ? new Date(stats.lastAt).getTime() : null,
    meStarts: 0,
    themStarts: 0,
    silentFor: null,
    topHours: [],
    mePeak: [],
    themPeak: [],
    lastSpeaker: null,
  };
  if (!stats || typeof stats.total !== "number" || !stats.total) return empty;

  const cleanUser = (raw: unknown): DoremonUserStats | null => {
    const u = raw as DoremonUserStats | null;
    if (!u || typeof u !== "object" || typeof u.total !== "number") return null;
    return {
      total: u.total,
      lastAt: typeof u.lastAt === "string" ? u.lastAt : "",
      perDay: u.perDay && typeof u.perDay === "object" ? u.perDay : undefined,
      hours: u.hours && typeof u.hours === "object" ? u.hours : undefined,
    };
  };

  const me = meId ? cleanUser(stats.users?.[meId]) : null;
  const them = partnerId ? cleanUser(stats.users?.[partnerId]) : null;
  const total = stats.total || 1;

  const avg = (u: DoremonUserStats | null): number | null => {
    if (!u?.perDay) return null;
    const days = Object.keys(u.perDay);
    if (days.length === 0) return null;
    const sum = days.reduce((acc, d) => acc + (typeof u.perDay![d] === "number" ? u.perDay![d] : 0), 0);
    return sum / Math.max(days.length, 1);
  };

  const peak = (u: DoremonUserStats | null): { hour: number; count: number }[] => {
    if (!u?.hours) return [];
    return Object.entries(u.hours)
      .map(([h, c]) => ({ hour: Number(h), count: Number(c) }))
      .filter((x) => Number.isFinite(x.hour) && Number.isFinite(x.count))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  };

  const mergedHours = new Map<number, number>();
  for (const u of [me, them]) {
    if (!u?.hours) continue;
    for (const [h, c] of Object.entries(u.hours)) {
      const hour = Number(h);
      const count = Number(c);
      if (!Number.isFinite(hour) || !Number.isFinite(count)) continue;
      mergedHours.set(hour, (mergedHours.get(hour) ?? 0) + count);
    }
  }

  const meLastAt = me?.lastAt ? new Date(me.lastAt).getTime() : null;
  const themLastAt = them?.lastAt ? new Date(them.lastAt).getTime() : null;
  const lastAt = empty.lastAt;

  return {
    ...empty,
    me,
    them,
    meShare: me ? me.total / total : null,
    themShare: them ? them.total / total : null,
    mePerDay: avg(me),
    themPerDay: avg(them),
    meLastAt,
    themLastAt,
    meStarts: meId ? stats.whoStarts?.[meId] ?? 0 : 0,
    themStarts: partnerId ? stats.whoStarts?.[partnerId] ?? 0 : 0,
    silentFor: lastAt ? Math.max(0, Date.now() - lastAt) : null,
    topHours: Array.from(mergedHours.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
    mePeak: peak(me),
    themPeak: peak(them),
    lastSpeaker:
      meLastAt != null && themLastAt != null
        ? meLastAt >= themLastAt
          ? "me"
          : "them"
        : meLastAt != null
          ? "me"
          : themLastAt != null
            ? "them"
            : null,
  };
}

/* ---------------------------------------------------------------- labels */

export function hourLabel(hour: number): string {
  if (hour < 5) return "late night";
  if (hour < 8) return "early morning";
  if (hour < 12) return "morning";
  if (hour < 15) return "afternoon";
  if (hour < 18) return "late afternoon";
  if (hour < 22) return "evening";
  return "night";
}

function clockHour(h: number): string {
  const ampm = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${ampm}`;
}

/** "9pm-11pm" style from a top-hours list. */
export function peakLabel(peaks: { hour: number; count: number }[]): string {
  if (peaks.length === 0) return "—";
  if (peaks.length === 1) return hourLabel(peaks[0].hour);
  // nearest-neighbour range: from the top hour to its nearest busy neighbour
  const first = peaks[0].hour;
  const near = peaks.slice(1).sort((a, b) => Math.abs(a.hour - first) - Math.abs(b.hour - first))[0];
  const from = Math.min(first, near.hour);
  const to = Math.max(first, near.hour);
  if (to === from) return hourLabel(first);
  return `${clockHour(from)}–${clockHour(to)}`;
}

export function silenceLabel(ms: number | null): string {
  if (ms == null) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? "" : "s"}`;
  const days = Math.floor(hrs / 24);
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

function sinceLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/* --------------------------------------------------------------- dossier */

/** The room's opening card: the state of this conversation, in Doremon's voice. */
export function dossierLines(
  view: StatsView,
  memory: DoremonMemory | null,
  partnerName: string
): string[] {
  const lines: string[] = [];
  const v = view;

  const totalMsgs = (v.me?.total ?? 0) + (v.them?.total ?? 0);
  if (v.lastAt && v.firstAt) {
    lines.push(
      `${totalMsgs} baatein, ${sinceLabel(
        new Date(v.firstAt).toISOString()
      )} se — aur har ek meri 4D memory mein hai. 22vi sadi ka robot, Nobita. 🐱`
    );
  } else if (memory?.summary) {
    lines.push(`Ye chat ab nahi hai, par meri 4D memory mein poori zinda hai — wahi se sunao.`);
  }

  if (memory?.summary) {
    lines.push(`AB KA HAAL: ${memory.summary}`);
  }

  if (memory?.endedNote) {
    lines.push(`LAST TIME WE CLOSED: ${memory.endedNote}`);
  }

  if (v.me && v.them) {
    const mine = Math.round((v.meShare ?? 0) * 100);
    const theirs = 100 - mine;
    const diff = (v.meShare ?? 0) - (v.themShare ?? 0);
    const verdict =
      diff > 0.2
        ? `Tum zyada bolte ho (${mine}% vs ${theirs}%) — tum hi is baat ko ghumate ho.`
        : diff < -0.2
          ? `${partnerName} zyada bolta hai (${theirs}% vs ${mine}%) — tum zyada sunte ho.`
          : `Dono lagbhag equally bolte ho (${mine}% / ${theirs}%) — balance achha hai.`;
    lines.push(verdict);

    if (v.mePerDay != null || v.themPerDay != null) {
      lines.push(
        `Last 14 din: tum ~${round1(v.mePerDay)} msg/day, ${partnerName} ~${round1(v.themPerDay)} msg/day.`
      );
    }
  }

  if (v.mePeak.length || v.themPeak.length) {
    const bits: string[] = [];
    if (v.mePeak.length) bits.push(`tum ${peakLabel(v.mePeak)} par sabse active`);
    if (v.themPeak.length) bits.push(`${partnerName} ${peakLabel(v.themPeak)} par`);
    lines.push(`TIMING: ${bits.join(", ")}.`);
  }

  if (v.meStarts || v.themStarts) {
    lines.push(
      `Pichhle 14 din mein din ki pehli baat: ${partnerName} ${v.themStarts} baar, tum ${v.meStarts} baar.`
    );
  }

  if (v.silentFor != null && v.silentFor > 2 * 3600 * 1000) {
    const who = v.lastSpeaker === "me" ? "tum" : partnerName;
    lines.push(`Ab tak ${silenceLabel(v.silentFor)} ki khamoshi hai — aakhri baat ${who} ke paas se aayi thi.`);
  }

  if (memory && (memory.moodMine || memory.moodTheirs) && memory.tension != null) {
    lines.push(
      `MOOD: tum "${memory.moodMine ?? "?"}", ${partnerName} "${memory.moodTheirs ?? "?"}" — tension ${memory.tension}/10.`
    );
  }

  if (memory?.conflictTopics.length) {
    lines.push(`Ladaiyon ke theme: ${memory.conflictTopics.slice(0, 3).join(", ")}.`);
  }
  if (memory?.deepTopics.length) {
    lines.push(`Jahan tum deep gaye: ${memory.deepTopics.slice(0, 3).join(", ")}.`);
  }

  lines.push(`AGLA KADAM: ${predictNext(view, memory, partnerName)}`);
  return lines;
}

function round1(n: number | null): string {
  if (n == null) return "0";
  return (Math.round(n * 10) / 10).toString();
}

/* ------------------------------------------------------------ prediction */

/** Doremon's read of what happens next — the heuristic engine. */
export function predictNext(view: StatsView, memory: DoremonMemory | null, partnerName: string): string {
  const v = view;
  const tension = memory?.tension ?? 0;
  const silentDays = v.silentFor != null ? v.silentFor / MS_DAY : 0;
  const starter = v.meStarts >= v.themStarts ? "tum" : partnerName;
  const peakRaw = peakLabel(v.topHours.length ? v.topHours : v.mePeak);
  const hasTiming = peakRaw !== "—";
  // "at <peak>" only when we actually know the rhythm (live census)
  const at = hasTiming ? `${peakRaw} ke aas-paas ` : "";

  if (silentDays >= 3 && tension >= 6) {
    return (
      `khamoshi ${silenceLabel(v.silentFor)} se chali hai aur tension abhi bhi ${tension}/10 hai. ` +
      `Agla message chhota aur casual hoga — sorry bina sorry ke, ya sirf "kya kar rahe ho?". ` +
      `Jo pehle bologe wo jeetega nahi, bas baat phir ghumne lagegi.`
    );
  }
  if (silentDays >= 2) {
    return (
      `aam taur par ${at}pehla message ${starter} ke paas se aata hai. ` +
      `Ek chhota sa "missed you" ya koi random photo — bas itna hi chahiye.`
    );
  }
  if (tension >= 6) {
    const topic = memory?.conflictTopics[0];
    return topic
      ? `hawa mein abhi ${topic} ki gandi wangi hai — agla conversation ya toh iska make-up hoga, ya koi naya topic. Aj hi kuch toh hoga.`
      : `tension ${tension}/10 hai — agla conversation ya toh make-up hoga ya ek naya chhota sa takraav.`;
  }
  if ((memory?.deepTalkCount ?? 0) > 0 && (memory?.deepTopics?.[0] ?? null)) {
    return `dono recently ${memory!.deepTopics![0]} par deep gaye the — agli baat usi line mein hogi, aur thodi serious hogi. Ye achha sign hai.`;
  }
  return `agli baat ${at}shuru hogi, shayad ${starter} ke paas se. Energy theek hai — sirf ek bahana chahiye.`;
}

/* --------------------------------------------------- the local room brain */

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * The offline Doremon in his room — heuristics over the same census the
 * Gemini path sees, in the same voice. Keeps him alive with no API key.
 */
export function localRoomAsk(
  question: string,
  view: StatsView,
  memory: DoremonMemory | null,
  partnerName: string
): string {
  const q = question.toLowerCase();
  const v = view;

  const who = (side: "me" | "them") => (side === "me" ? "tum" : partnerName);

  if (/(predict|agla|aage|next|kya hoga|kya hua karega|future|ho sakta)/.test(q)) {
    return predictNext(v, memory, partnerName);
  }
  if (/(summary|yaad|yaadein|patli|record|poora|sab batao|kya hua tha|remember)/.test(q)) {
    const bits: string[] = [];
    if (memory?.summary) bits.push(`Ab ka haal: ${memory.summary}`);
    if (memory?.notes?.length) bits.push(`Yaadein: ${memory.notes.slice(0, 3).join(" · ")}`);
    if (memory?.finalSummary) bits.push(`Pichhli baar jab baat rukhi: ${memory.finalSummary}`);
    if (bits.length === 0) {
      return `Abhi maine itna dekh liya hai ki kahani ki pehli pages banti hai nahi — thodi aur baat kar do, main har line save karta hoon.`;
    }
    return bits.join("\n");
  }
  if (/(kab|timing|time|hour|zaman|kaise waqt|jab bhi)/.test(q)) {
    const bits: string[] = [];
    if (v.mePeak.length) bits.push(`tum ${peakLabel(v.mePeak)} par sabse zyada bolte ho`);
    if (v.themPeak.length) bits.push(`${partnerName} ${peakLabel(v.themPeak)} par`);
    if (bits.length) return bits.join(", ") + ".\nYe waqt pakad lo agar reply fast chahiye toh.";
    return `Abhi maine itne messages nahi dekhe ki timing ka pattern pakadun — thodi aur baat hone do.`;
  }
  if (/(kitna|zyada bol|talks more|willing|avoid|ignoring|ignore|kitne message|count|ginti|ginte)/.test(q)) {
    if (!v.me || !v.them) {
      return `Numbers abhi kam hai — maine abhi pattern nahi pakda. Thodi aur baat hone do.`;
    }
    const mine = Math.round((v.meShare ?? 0) * 100);
    const theirs = 100 - mine;
    const diff = (v.meShare ?? 0) - (v.themShare ?? 0);
    const verdict =
      diff > 0.2
        ? `Tum hi is baat ko ghumate ho — ${mine}% vs ${theirs}%.`
        : diff < -0.2
          ? `${partnerName} zyada bolta hai — ${theirs}% vs ${mine}%. Tum zyada sunne wale ho.`
          : `Dono equal lagte ho — ${mine}% / ${theirs}%.`;
    let tail = "";
    if (v.mePerDay != null && v.themPerDay != null) {
      tail = `\nHar din: tum ~${round1(v.mePerDay)}, ${partnerName} ~${round1(v.themPerDay)}.`;
    }
    if (v.silentFor != null && v.silentFor > MS_DAY) {
      tail += `\nLekin ${silenceLabel(v.silentFor)} se khamoshi hai.`;
    }
    return verdict + tail;
  }
  if (/(start|shuru|khol|who opens|din kyun)/.test(q)) {
    if (!v.meStarts && !v.themStarts) return `Abhi din-shuru karne ka pattern nahi banta — 14 din ka data chahiye.`;
    return `14 din mein din ki pehli baat: tum ${v.meStarts} baar, ${partnerName} ${v.themStarts} baar.${
      v.meStarts >= v.themStarts ? " Tum zyada aage nikalte ho." : ` ${partnerName} zyada aage nikalte hain.`
    }`;
  }
  if (/(mood|feeling|kaise hai|sentiment|state)/.test(q)) {
    if (!memory?.moodMine && !memory?.moodTheirs) return `Mood abhi clear nahi — thodi aur baat hone do, phir bataunga.`;
    const t = memory.tension != null ? `tension ${memory.tension}/10` : "tension theek";
    return `Tum "${memory.moodMine ?? "?"}" ho, ${partnerName} "${memory.moodTheirs ?? "?"}" — ${t}.`;
  }
  if (/(ladai|fight|ladiya|conflict|jhanjhat|issue)/.test(q)) {
    if (!memory?.conflictTopics.length) return `Abhi tak koi asli ladai nahi dekhi — sirf baatein.`;
    return `Ladaiyon ka theme: ${memory.conflictTopics.slice(0, 3).join(", ")}. \n${memory.fightCount > 1 ? `${memory.fightCount} baar ye circle phira hai — same jagah se ghus-te ho.` : "Ek baar hui, abhi tak ek hi."}`;
  }
  if (/(deep|dil|heart|serious|soch)/.test(q)) {
    if (!memory?.deepTopics.length) return `Deep talks abhi kam the — aur ho toh main yaad rakhta hoon.`;
    return `Jahan dono ne dil khola: ${memory.deepTopics.slice(0, 3).join(", ")}. Ye lines is chat ki asli daulat hain.`;
  }
  if (/(madad|advice|kya karu|kya karna|batao kya|suggest)/.test(q)) {
    if (v.silentFor != null && v.silentFor > MS_DAY) {
      return `Khamoshi ${silenceLabel(v.silentFor)} ki hai. Ek chhota sa message bhejo — bina reason ke bhi theek. "ye dekha? yaad aaya tum" — bas.`;
    }
    if ((memory?.tension ?? 0) >= 6) {
      return `Pehle tension giraao — koi naya topic uthao, purana wala mat chhoo. Raat ko, jab dono halka hote ho.`;
    }
    return pick([
      `Future-report: sab theek chal raha hai, Nobita. 🐱 Ek 10-minute ka deep sawaal uthao — "agar hum ek din phone chhod dein, pehli baat kya hogi?" Maine future mein dekha, isse kaam karta hai. 😌`,
      `Relation healthy hai! Pocket se ek game: aaj dono alag-alag ek "aaj ka best moment" bhejo — 2 minute mein 20 messages. Main referee. 🐱`,
    ]);
  }
  if (/(chhod|avoid|door|door pe|ghar se)/.test(q)) {
    if (v.them && v.themPerDay != null && v.themPerDay < 1 && (v.mePerDay ?? 0) > 2) {
      return `Time Machine se dekh liya — ${partnerName} pichhle 14 din mein ~${round1(v.themPerDay)}/din bol rahe hai, tum ~${round1(v.mePerDay)}. Door hain ya busy, ye toh wo hi bata sakta hai. Tum bhi thoda space do, Nobita. 🐱`;
    }
    return `Avoid ka pattern abhi nahi dikhta — numbers clean hain. Future mein bhi yahi dikha. 😌`;
  }

  // fallback — offer what he knows
  const known: string[] = [];
  if (memory?.summary) known.push(memory.summary);
  if (v.me && v.them) known.push(`tum ${Math.round((v.meShare ?? 0) * 100)}% baatein, ${partnerName} ${100 - Math.round((v.meShare ?? 0) * 100)}%`);
  return (
    `Arre, main is chat ka 4D memory mein poora record rakhta hoon — memories, timing, moods, ladaiyan, sab. ${
      known.length ? "Abhi tak: " + known.join(" · ") + ". " : ""
    }Mujhse kuch bhi poochh: "kab zyada bolta hai", "who talks more", "what happens next". Future-grade answers, guaranteed. 🐱`
  );
}

/* ---------------------------------------------------------------- finalize */

/** When the conversation ends, Doremon writes the closing note + summary. */
export function localFinalize(
  view: StatsView,
  memory: DoremonMemory | null,
  partnerName: string
): { summary: string; note: string } {
  const v = view;
  const bits: string[] = [];
  if (memory?.summary) bits.push(memory.summary);
  if (v.me && v.them) {
    bits.push(
      `The last session ended with ${v.me.total + v.them.total} total messages exchanged; ${
        (v.meShare ?? 0) >= (v.themShare ?? 0) ? "my user" : "the partner"
      } carried more of the conversation (~${Math.round(Math.max(v.meShare ?? 0, v.themShare ?? 0) * 100)}%).`
    );
  }
  if (memory?.tension != null) bits.push(`Tension closed at ${memory.tension}/10.`);
  if (memory?.conflictTopics?.[0]) bits.push(`Unresolved thread: ${memory.conflictTopics[0]}.`);
  const summary =
    bits.length > 0
      ? bits.slice(0, 4).join(" ")
      : "A short conversation with no strong signal yet; the record stays open for the next session.";

  const silent = v.silentFor != null && v.silentFor > MS_DAY ? `, ${silenceLabel(v.silentFor)} ki khamoshi ke saath` : "";
  const note = pick([
    `Bas, is session ka poora record meri 4D memory mein${silent}. 22vi sadi ka robot, Nobita — main pehli line se jaanta hoon. Wapas aao, sab yaad hai. 🐱`,
    `Ye session band${silent} — moods, timings, har pattern, sab future-grade save ho gaya. Kuch poochhna ho toh meri room mein mil lena. 😌`,
  ]);
  return { summary, note };
}

/* ---------------------------------------------------------- gemini prompt */

/** Renders the census as the English fact-block Gemini reasons over. */
export function statsForPrompt(view: StatsView, partnerName: string): string {
  const v = view;
  if (!v.lastAt) return "(no message history yet for this conversation)";
  const lines: string[] = [
    `Total messages: ${((v.me?.total ?? 0) + (v.them?.total ?? 0))}, since ${sinceLabel(
      new Date(v.firstAt ?? 0).toISOString()
    )}.`,
  ];
  if (v.me && v.them) {
    lines.push(
      `Split: you ${Math.round((v.meShare ?? 0) * 100)}% / ${partnerName} ${Math.round(
        (v.themShare ?? 0) * 100
      )}%${v.mePerDay != null && v.themPerDay != null ? ` (per day, last 14d: you ~${round1(v.mePerDay)}, ${partnerName} ~${round1(v.themPerDay)})` : ""}.`
    );
  }
  const peaks: string[] = [];
  if (v.mePeak.length) peaks.push(`you peak at ${peakLabel(v.mePeak)}`);
  if (v.themPeak.length) peaks.push(`${partnerName} peaks at ${peakLabel(v.themPeak)}`);
  if (peaks.length) lines.push(`Timing: ${peaks.join("; ")}.`);
  if (v.meStarts || v.themStarts) {
    lines.push(`Of the last 14 days, you opened the day ${v.meStarts} times, ${partnerName} ${v.themStarts}.`);
  }
  if (v.silentFor != null && v.silentFor > 2 * 3600 * 1000) {
    lines.push(`Silence right now: ${silenceLabel(v.silentFor)} (last message from ${v.lastSpeaker === "me" ? "you" : partnerName}).`);
  }
  return lines.join("\n");
}
