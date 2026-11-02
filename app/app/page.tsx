"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUp, Lock, Plus, Settings, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AppGuard } from "@/components/app-guard";
import { BrandBlob } from "@/components/brand-blob";
import { avatarById } from "@/lib/avatars";
import { useSession } from "@/lib/session";

function ChatPlaceholder() {
  const router = useRouter();
  const { account, signOut } = useSession();
  const avatar = avatarById(account?.avatarId);
  // Built after mount so the server and client markup agree.
  const [inviteLink, setInviteLink] = useState("");

  useEffect(() => {
    if (!account?.username) return;
    setInviteLink(`${window.location.origin}/u/${account.username}`);
  }, [account?.username]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(
        `Come find me on Dolemon — it's just us. ${inviteLink}`
      );
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy. Long-press to copy instead.");
    }
  };

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink">
      <BrandBlob />

      <header className="relative z-10 mx-auto flex w-full max-w-md items-center justify-between px-6 pb-4 pt-6 safe-t">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-base"
            style={{
              backgroundColor: avatar?.bg ?? "rgba(255,92,122,0.16)",
              boxShadow: `0 0 0 1px ${(avatar?.ring ?? "#FF5C7A")}33`,
            }}
          >
            {avatar?.emoji ?? "💬"}
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-medium">@{account?.username}</p>
            <p className="text-[11.5px] text-success">Online</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
          >
            <Settings className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6">
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.04] text-2xl">
            💌
          </div>
          <h1 className="text-balance text-[22px] font-semibold tracking-[-0.01em]">
            Your space is ready
          </h1>
          <p className="mt-2 max-w-[19rem] text-[14px] leading-relaxed text-text-muted">
            No conversations yet. Invite the one person who matters — conversations here are only
            ever between two people.
          </p>

          <div className="mt-7 w-full rounded-xl2 border border-ink-line bg-ink-surface/70 p-4 text-left">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose/15 text-rose">
                <Plus className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-medium">Invite your person</p>
                <p className="mt-1 truncate text-[12.5px] text-text-muted">
                  {inviteLink || "Set a username to get your link"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={copyInvite}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-ink-line py-2.5 text-[13px] font-medium text-text transition-colors hover:bg-white/[0.04]"
            >
              <Share2 className="h-3.5 w-3.5" />
              Copy invite link
            </button>
          </div>
        </div>

        <div className="pb-4">
          <div className="flex items-center gap-2 rounded-full border border-ink-line bg-ink-surface/80 p-1.5 pl-4">
            <input
              disabled
              placeholder="Messages unlock when you two connect"
              className="h-10 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-muted/70"
            />
            <button
              type="button"
              disabled
              aria-label="Send"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-rose/25 text-rose/60"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-text-muted/70">
            <Lock className="h-3 w-3" />
            Private by default
          </p>
        </div>

        <div className="pb-6 text-center">
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/");
            }}
            className="text-[12.5px] text-text-muted underline-offset-4 hover:text-text hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}

export default function AppPage() {
  return (
    <AppGuard>
      <ChatPlaceholder />
    </AppGuard>
  );
}
