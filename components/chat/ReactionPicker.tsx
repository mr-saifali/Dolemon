"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Copy, CornerUpLeft, Pencil, Trash2 } from "lucide-react";
import { ReactionIcon } from "@/components/reactions";
import { messageMenuPosition } from "@/lib/message-menu";
import { REACTION_META, REACTION_TYPES, type ReactionType } from "@/lib/reactions";

export type BubbleAnchor = { top: number; bottom: number; left: number; width: number };
export type MessageAction = "reply" | "copy" | "edit" | "delete";

/** Compact reactions and a vertical, contextual action menu. */
export function ReactionPicker({ anchor, mine, editable, myReaction, onPick, onAction, onClose }: {
  anchor: BubbleAnchor;
  mine: boolean;
  editable: boolean;
  myReaction: ReactionType | null;
  onPick: (type: ReactionType) => void;
  onAction: (action: MessageAction) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const actionCount = 2 + (mine ? 1 : 0) + (mine && editable ? 1 : 0);
  const viewport = { width: typeof window === "undefined" ? 390 : window.innerWidth, height: typeof window === "undefined" ? 844 : window.innerHeight };
  const position = messageMenuPosition(anchor, viewport, mine, actionCount);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const controls = Array.from(dialog.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      if (!controls.length) return;
      const current = controls.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && current <= 0) { event.preventDefault(); controls[controls.length - 1].focus(); }
      else if (!event.shiftKey && (current < 0 || current === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    };
    const onResize = () => close.current();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <motion.button type="button" tabIndex={-1} aria-label="Dismiss message options" onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 cursor-default bg-black/40" />
      <motion.div
        ref={dialog} role="dialog" aria-modal="true" aria-label="Message options"
        initial={{ opacity: 0, scale: 0.96, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }} style={position}
        className="absolute overflow-y-auto overscroll-contain [scrollbar-width:none]"
      >
        <div role="group" aria-label="React to message" className="flex items-center justify-between rounded-full border border-white/10 bg-[#20242b]/95 p-1 shadow-[0_12px_35px_rgba(0,0,0,.4)] backdrop-blur-xl">
          {REACTION_TYPES.map((type) => (
            <button key={type} type="button" aria-label={REACTION_META[type].label} aria-pressed={myReaction === type}
              title={`${REACTION_META[type].label} — ${REACTION_META[type].means}`} onClick={() => onPick(type)}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 ${myReaction === type ? "bg-white/15" : ""}`}>
              <ReactionIcon type={type} size={25} />
            </button>
          ))}
        </div>
        <div role="menu" aria-label="Message actions" onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
          event.preventDefault(); items[next]?.focus();
        }} className={`mt-2 w-[196px] max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#20242b]/95 p-1 shadow-[0_12px_35px_rgba(0,0,0,.4)] backdrop-blur-xl ${mine ? "ml-auto" : "mr-auto"}`}>
          <ActionButton icon={<CornerUpLeft />} label="Reply" onClick={() => onAction("reply")} />
          <ActionButton icon={<Copy />} label="Copy" onClick={() => onAction("copy")} />
          {mine && editable && <ActionButton icon={<Pencil />} label="Edit" onClick={() => onAction("edit")} />}
          {mine && <ActionButton icon={<Trash2 />} label="Delete" danger onClick={() => onAction("delete")} />}
        </div>
      </motion.div>
    </div>
  );
}

function ActionButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex h-11 w-full items-center justify-between rounded-xl px-3 text-left text-[13px] font-medium transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.09] focus-visible:outline-none ${danger ? "text-[#ff8190]" : "text-zinc-100"}`}>
      <span>{label}</span><span className="[&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:stroke-[1.7]">{icon}</span>
    </button>
  );
}
