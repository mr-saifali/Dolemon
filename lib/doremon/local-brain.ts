import type { DoremonAnalysis, DoremonMemory, DoremonMessage } from "./types";
import { emptyMemory } from "./types";

/**
 * The offline brain. Runs in the local demo (no backend at all) and as the
 * graceful fallback when Gemini is unreachable — Doremon never goes silent.
 * Same voice, lighter magic: heuristics instead of a mind.
 */

export type BrainMessage = { who: "me" | "them"; text: string };

const NEGATIVE =
  /\b(angry|angryy|gussa|gusse|ladai|ladte|lad rahi|fight|fighting|hate|hating|ignore|ignored|ignoring|suffocat|suffoc|whatever|fine\.|kya problem|problem kya|kyu kyu|kyu bhi|nonsense|pagal|pagli|chup|shut up|quit|done with|nafrat|bura|buri|disrespect|attitude)\b/i;
const HURT_EMOJI = /😡|😠|🙄|💔|😖|😞/;
const WARM =
  /\b(love|luv|pyaar|pyar|miss you|miss u|yaad aata|yaad aati|cute|swet|sweet|apna|apni|good night|gud night|gnight|good morning|miss|tension nahi)\b/i;
const WARM_EMOJI = /❤️|😘|😊|😍|💛|🥰/;
const DEEP =
  /\b(truth|honest|actually|feelings|future|darr|dar lagta|dar lagti|sochta hoon|sochti hoon|heart|dil ka|real baat|samajh|samajhna|explain)\b/i;

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const clamp = (n: number) => Math.max(0, Math.min(10, n));

/** A cheap, honest read of the last stretch of messages. */
export function localAnalyze(recent: BrainMessage[], memory: DoremonMemory | null): DoremonAnalysis {
  const now = Date.now();
  const mem: DoremonMemory = memory
    ? { ...memory, notes: [...memory.notes], conflictTopics: [...memory.conflictTopics], deepTopics: [...memory.deepTopics] }
    : emptyMemory(now);

  const last6 = recent.slice(-6);
  let tension = 0;
  let negatives = 0;
  let warms = 0;
  let deep = 0;
  let shortDry = 0;

  for (const m of last6) {
    const t = m.text;
    const isNeg = NEGATIVE.test(t) || HURT_EMOJI.test(t);
    const isWarm = WARM.test(t) || WARM_EMOJI.test(t);
    const isDeep = DEEP.test(t) || t.length > 140;
    if (isNeg) {
      negatives += 1;
      tension += 3;
    }
    if (isWarm) {
      warms += 1;
      tension = Math.max(0, tension - 2);
    }
    if (isDeep) deep += 1;
    if (t.trim().length < 28 && !WARM_EMOJI.test(t) && !t.includes("?")) shortDry += 1;
  }

  tension = clamp(Math.round(tension * 0.9));
  const fight = negatives >= 2 && negatives > warms;
  const boring = last6.length >= 4 && shortDry >= 4 && warms === 0 && deep === 0;

  const mine = recent.filter((m) => m.who === "me").slice(-3);
  const theirs = recent.filter((m) => m.who === "them").slice(-3);
  mem.moodMine = negativeOf(mine) ?? warmOf(mine) ?? mem.moodMine;
  mem.moodTheirs = negativeOf(theirs) ?? warmOf(theirs) ?? mem.moodTheirs;
  mem.tension = tension;

  const lastDeep = [...recent].reverse().find((m) => DEEP.test(m.text) || m.text.length > 140);
  if (lastDeep && deep > 0) {
    const topic = deepTopicOf(lastDeep.text);
    if (topic && !mem.deepTopics.includes(topic)) {
      mem.deepTopics = [topic, ...mem.deepTopics].slice(0, 8);
      mem.deepTalkCount += 1;
    }
  }

  const lastNeg = [...recent].reverse().find((m) => NEGATIVE.test(m.text) || HURT_EMOJI.test(m.text));
  if (fight && lastNeg) {
    const topic = conflictTopicOf(lastNeg.text);
    if (topic && !mem.conflictTopics.includes(topic)) {
      mem.conflictTopics = [topic, ...mem.conflictTopics].slice(0, 8);
      mem.fightCount += 1;
    }
  }

  if (!mem.summary) {
    mem.summary =
      mem.fightCount > 0
        ? "A pair with real feelings and a fight pattern already showing up."
        : "A fresh conversation — still learning how these two talk.";
  }

  mem.updatedAt = now;

  let interventionLine: string | null = null;
  const cooledDown = now - (mem.lastInterventionAt ?? 0) > 10 * 60_000;
  if (fight && cooledDown) {
    interventionLine = pick([
      "Arre arre, tension 7/10 padh raha hai! 🐱 Ek rule: screen band na karo. 10 minute ka gap lo, phir bas itna bolo — \u201cmain sun raha/rahi hoon\u201d. Main pocket mein betha hoon, dono ke mood track kar raha hoon. 😌",
      "Ruko ek second — pocket se Cool-Down Spray nikaal raha hoon. 😌 Tum dono ka point valid hai, bas dono ek saath nahi bol sakte. Pehle aadha din sunna do, jawab baad mein. Deal? 🐱",
      "Dekha maine, dono ke phone ki baat se dil ki baat hat rahi hai. 🐱 Rule: pehle ek line — \u201ctujhe bura laga, yeh theek hai, main samajh raha/rahi hoon\u201d. Bas itni. Phir dikhate hain kya hota. 😌",
    ]);
  } else if (boring && cooledDown) {
    interventionLine = pick([
      "Yaar, yahan toh Time Machine bhi bore ho gayi! 🐱 Ek gadget nikaalta hoon — Anywhere Door: kal shaam phone locker mein, 2 cup chai, aur ek sawaal — \u201cagar life mein ek din perfect hona chahiye toh kaun sa?\u201d Kaun accept karega pehle? 😄",
      "Scene thoda dry ho raha hai yaar! Pocket se ek idea: aaj raat 5 second ka voice note bhejo — sirf aaj ka best moment, 5 second. Phir doosra 10 second ka. Chal? 🐱",
      "Boring alert! 🚨 Chal ek game — main topic de raha hoon: \u201csabse weird memory of the other person\u201d. Ek line each, na zyada. Main judge hoon. Shuru? 😄",
    ]);
  }

  return { memory: mem, fight, boring, interventionLine };
}

function negativeOf(list: BrainMessage[]): string | null {
  if (list.some((m) => NEGATIVE.test(m.text) || HURT_EMOJI.test(m.text))) return pick(["annoyed", "hurt", "stiff", "worked up"]);
  return null;
}
function warmOf(list: BrainMessage[]): string | null {
  if (list.some((m) => WARM.test(m.text) || WARM_EMOJI.test(m.text))) return pick(["soft", "happy", "missing them", "warm"]);
  return null;
}

function conflictTopicOf(text: string): string | null {
  const t = text.toLowerCase();
  if (/time|busy|kaam|work|job|late/i.test(t)) return "time & attention";
  if (/phone|screen/i.test(t)) return "phone time";
  if (/plan|kab|meet|milne|call/i.test(t)) return "plans & promises";
  if (/ghar|family|mummy|papa/i.test(t)) return "family things";
  if (/soch|feel|samajh|attention|important/i.test(t)) return "feeling unheard";
  return "the usual";
}

function deepTopicOf(text: string): string | null {
  const t = text.toLowerCase();
  if (/future|ahead|plan karna/i.test(t)) return "the future";
  if (/darr|dar |afraid|fear/i.test(t)) return "fears";
  if (/dil|heart|feel|feeling/i.test(t)) return "feelings out loud";
  if (/family|ghar/i.test(t)) return "family & roots";
  return "a long, honest one";
}

/** The voice Doremon uses when Gemini isn't available. Short, Hinglish, warm. */
export function localAsk(question: string, memory: DoremonMemory | null, recent: BrainMessage[]): string {
  const q = question.trim().toLowerCase();

  if (!q) return checkIn(memory);
  if (/yaad|remember|summary|record|kya pakda|notes|report|kaise hain|how are (you|we)|kaisa hai|kya chal/i.test(q)) return checkIn(memory);
  if (/ladai|fight|solve|samjhao|tension|lad rahe|ladai ho|kaam kya/i.test(q)) return mediation(memory);
  if (/idea|boring|chalu kya|kya karein|kya kare|date|fun|plan do|kuch karne/i.test(q)) return idea(memory);
  if (/mood|kaise feel|feeling|mood kya|vibe/i.test(q)) return moodRead(memory);

  const firstNote = memory && memory.notes.length > 0 ? memory.notes[0] : null;
  const flavor = firstNote ? ` (haan, 22vi sadi ka robot hai, main yaad nahi bhoolta: ${firstNote})` : "";
  return pick([
    `Arre Nobita! 🐱 Main toh 22vi sadi se yahan hoon, future mein hazaron couples dekhe hain — aur main teri har baat pocket mein rakhta hoon. Aaj ek chhoti si khairi baat kar do, main dekh raha hoon. 😌${flavor}`,
    `Theek pucha, genius hai tu. ${memory?.summary ? `Scene yeh hai: ${memory.summary} ` : ""}Mera future-report: aaj ek chhoti baat bina phone ke karo — call bhi chalegi, walk bhi. Yehi chhoti cheezein do logon ko jode rakhti hain. 🐱`,
    `Time Machine se check kar liya! 🐱 ${memory?.conflictTopics[0] ? `Jab baat "${memory.conflictTopics[0]}" ki hoti hai, wahan se 9/10 tension aati hai — maine future mein yahi pattern dekha hai. ` : ""}Rule simple hai — pehle sunna, phir kehna. Main hamesha dekh raha hoon. 😌`,
  ]);
}

function checkIn(memory: DoremonMemory | null): string {
  if (!memory || (!memory.summary && memory.notes.length === 0)) {
    return pick([
      "Arre, naya scene hai! 🐱 Main 22vi sadi ka robot hoon — abhi se tumhari har baat meri 4D memory mein record hogi. Kuch poochhna ho toh bas /doremon likh de, Nobita. 😌",
      "Pocket check! Abhi notes kam hain, kyunki conversation naya hai. Thodi baatein hongi toh main dono ke mood, ladai, deep baatein — sab future-grade precision se yaad karunga. /doremon + sawaal, kabhi bhi. 🐱",
    ]);
  }
  const parts: string[] = [];
  if (memory.summary) parts.push(memory.summary);
  if (memory.conflictTopics.length)
    parts.push(`Tum zyada se zyada is baat mein atakte ho: ${memory.conflictTopics.slice(0, 2).join(", ")}.`);
  if (memory.deepTopics.length)
    parts.push(`Aur jab dil se baat hoti hai toh: ${memory.deepTopics.slice(0, 2).join(", ")}.`);
  parts.push(`Ajab tak ${memory.fightCount} baar tension, ${memory.deepTalkCount} baar dil ki baat.`);
  return `Future-report ready, suno. 🐱 ${parts.join(" ")} ${
    memory.fightCount > 2
      ? "Ek clear pattern hai — future mein yahi loop phirta hai jab 10 minute ka break nahi milta. Tension ke waqt gap lo. Main dekh raha hoon. 😌"
      : "Vibe achha chal raha hai — Time Machine se dekhne par future bright dikha. Yahi chalta raho. 😌"
  }`;
}

function mediation(memory: DoremonMemory | null): string {
  const topic = memory?.conflictTopics[0];
  return pick([
    `Suna, main Doremon — aise scene mein main hamesha beech mein aata hoon. 😌 ${
      topic ? `Tumhara usual atakne ka point hai "${topic}" — wahan pehle sunna, jawab baad mein. ` : ""
    }Ek rule: aaj koi bhi "tu hamesha…" wali line nahi. Sirf "main feel karta/karti hoon…" wali lines. Try karo, main dekh raha hoon. 🐱`,
    `Ladai ka formula main jaanta hoon: dono sahi ho, dono galat timing pe. 😌 ${
      topic ? `"${topic}" pe jab aata hai, toh ` : ""
    }pehle 10 minute ka gap, phir ek line — "main sun raha/rahi hoon". Bas itni. Wapas aao normal ho kar. 🐱`,
  ]);
}

function idea(memory: DoremonMemory | null): string {
  return pick([
    "Ek amazing idea pocket se! 🐱 Aaj raat 5 second ka voice note — sirf aaj ka best moment, 5 second. Kal uska double. 7 din mein tum ek chhoti si film ban jaoge. Chal? 😄",
    "Scene bore hai? Pocket se Anywhere Door! 🐱 Kal ek jagah jao jahan tum dono pehle kabhi nahi gaye. Phone rakh ke sirf ek cheez photo lo — sabse interesting cheez jo dikhe. Phir uska matlab batao doosre ko. 😄",
    "Ek game chal? 🐱 Main topic de raha hoon: 'sabse weird memory of the other person'. Ek line each, na zyada. Main judge hoon, winner ko main approve karunga. Shuru? 😄",
    "Boring nahi ho sakti, kyunki main hoon. 😌 Ek challenge: aaj ek aisi baat karo jo tumne kabhi nahi ki — jaise apna sabse bada fear, ya sapna. Main dekh raha hoon kya hota. 🐱",
  ]);
}

function moodRead(memory: DoremonMemory | null): string {
  if (!memory || memory.tension == null) {
    return "Abhi mood kaafi stable hai — naya scene hai, main observe kar raha hoon. Thodi baatein hongi toh main dono ka mood, tension, sab padh lunga. 😌";
  }
  const t = memory.tension;
  if (t >= 6)
    return `Seedhi baat: tension ${t}/10 hai. ${
      memory.conflictTopics[0] ? `"${memory.conflictTopics[0]}" wala point dobara aa raha hai. ` : ""
    }Dono ko thoda gap chahiye, phir ek line se shuru karna. Main dekh raha hoon. 🐱`;
  if (t >= 3)
    return `Mood: thoda heavy, lekin theek hai. ${
      memory.moodMine ? `Tu ${memory.moodMine}, ` : ""
    }${memory.moodTheirs ? `waise tu ${memory.moodTheirs} hai. ` : ""}Ek chhoti si sweet line bhej de — tension aadhi ho jaati hai. 😌`;
  return `Vibe achha hai! ${memory.moodMine ? `Tu ${memory.moodMine}, ` : ""}${
    memory.moodTheirs ? `tu ${memory.moodTheirs}. ` : ""
  }Yahi maintain karo. Aaj ek baar dil se baat kar lo — future ke baare mein. 🐱`;
}

export type { DoremonMessage };
