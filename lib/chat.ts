export type Conversation = {
  id: string;
  name: string;
  username: string;
  avatarId: string | null;
  lastMessage: string;
  /** epoch ms — relative so demo data always looks fresh */
  lastAt: number;
  unread: number;
  online: boolean;
  typing?: boolean;
  muted?: boolean;
  /** last message was sent by you → prefix the preview */
  outgoing?: boolean;
  pinned?: boolean;
};

type DemoSeed = Omit<Conversation, "lastAt"> & { minutesAgo: number };

const DEMO_SEEDS: DemoSeed[] = [
  {
    id: "c_aarohi",
    name: "Aarohi",
    username: "aarohi",
    avatarId: "rose",
    lastMessage: "reached home. call me when you're free? 🥺",
    minutesAgo: 2,
    unread: 2,
    online: true,
    pinned: true,
  },
  {
    id: "c_kabir",
    name: "Kabir",
    username: "kabir.m",
    avatarId: "moon",
    lastMessage: "bhai that playlist was unreal",
    minutesAgo: 48,
    unread: 0,
    online: false,
    outgoing: true,
  },
  {
    id: "c_meher",
    name: "Meher",
    username: "meher_",
    avatarId: "lily",
    lastMessage: "typing…",
    minutesAgo: 190,
    unread: 0,
    online: true,
    typing: true,
  },
  {
    id: "c_dev",
    name: "Dev",
    username: "dev.k",
    avatarId: null,
    lastMessage: "sent a photo",
    minutesAgo: 1500,
    unread: 0,
    online: false,
  },
  {
    id: "c_anaya",
    name: "Anaya",
    username: "anaya",
    avatarId: "peach",
    lastMessage: "see you saturday 🌸",
    minutesAgo: 4400,
    unread: 1,
    online: false,
    muted: true,
  },
];

export function demoConversations(now = Date.now()): Conversation[] {
  return DEMO_SEEDS.map(({ minutesAgo, ...rest }) => ({
    ...rest,
    lastAt: now - minutesAgo * 60_000,
  })).sort((a, b) => b.lastAt - a.lastAt);
}

export function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Compact, chat-style timestamps: now · 5m · 14:32 · Yesterday · Mon · 12 Jun */
export function formatChatTime(ts: number, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;

  const date = new Date(ts);
  const today = new Date(now);
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const time = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return "Yesterday";

  if (diff < 7 * 86_400_000) {
    return date.toLocaleDateString("en-IN", { weekday: "short" });
  }
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}
