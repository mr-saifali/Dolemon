"use client";

import { motion } from "framer-motion";
import { Copy, CornerUpLeft, Forward, Pencil, Trash2 } from "lucide-react";
import { ReactionIcon } from "@/components/reactions";
import { REACTION_META, REACTION_TYPES, type ReactionType } from "@/lib/reactions";

export type BubbleAnchor = { top: number; bottom: number; left: number; width: number };

const SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;

/** a colour voice per reaction, so the row reads as five different feelings */
const TINT: Record<ReactionType, string> = {
  dil: "rgba(255,92,122,0.22)",
  haha: "rgba(252,211,77,0.20)",
  wow: "rgba(125,211,252,0.20)",
  aww: "rgba(255,160,122,0.22)",
  hype: "rgba(167,139,250,0.24)",
};
const PICKER_W = 236;

export type MessageAction = "reply" | "copy" | "forward" | "edit" | "delete";

/**
 * Floats directly above the bubble it belongs to. Reactions on top, the usual four
 * actions underneath — no modal, nothing to dismiss twice.
 */
export function ReactionPicker({
  anchor,
  mine,
  editable,
  myReaction,
  onPick,
  onAction,
  onClose,
}: {
  anchor: BubbleAnchor;
  /** is this my message — decides whether Edit and Delete are offered */
  mine: boolean;
  /** only plain text can be rewritten */
  editable: boolean;
  myReaction: ReactionType | null;
  onPick: (type: ReactionType) => void;
  onAction: (action: MessageAction) => void;
  onClose: () => void;
}) {
  const viewportW = typeof window === "undefined" ? 390 : window.innerWidth;

  const center = anchor.left + anchor.width / 2;
  const left = Math.min(Math.max(center - PICKER_W / 2, 10), viewportW - PICKER_W - 10);

  // Prefer above the bubble; drop below when there's no room under the header.
  const above = anchor.top > 132;
  const top = above ? anchor.top - 62 : anchor.bottom + 8;

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      <button
        type="button"
        aria-label="Dismiss reactions"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-transparent"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: above ? 6 : -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
        style={{ left, top, width: PICKER_W, transformOrigin: `${center - left}px ${above ? "100%" : "0%"}` }}
        className="absolute"
      >
        <div
          role="menu"
          aria-label="React to message"
          className="hairline flex items-center justify-between gap-0.5 rounded-full bg-[#232329] px-[10px] py-2 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]"
        >
          {REACTION_TYPES.map((type, i) => {
            const selected = myReaction === type;
            return (
              <motion.button
                key={type}
                type="button"
                role="menuitem"
                aria-label={REACTION_META[type].label}
                title={`${REACTION_META[type].label} — ${REACTION_META[type].means}`}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...SPRING, delay: i * 0.04 }}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => onPick(type)}
                className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06]"
                style={selected ? { background: TINT[type], boxShadow: `0 0 18px -4px ${TINT[type]}` } : undefined}
              >
                <ReactionIcon type={type} size={selected ? 31 : 28} />
              </motion.button>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: above ? -4 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.16 }}
          className="mt-1.5 flex flex-wrap items-center justify-center gap-1 rounded-[20px] border border-white/[0.08] bg-[#232329]/95 px-1.5 py-1.5 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.85)]"
        >
          <ActionButton icon={<CornerUpLeft className="h-4 w-4" />} label="Reply" onClick={() => onAction("reply")} />
          <ActionButton icon={<Copy className="h-4 w-4" />} label="Copy" onClick={() => onAction("copy")} />
          <ActionButton icon={<Forward className="h-4 w-4" />} label="Forward" onClick={() => onAction("forward")} />
          {mine && editable && (
            <ActionButton icon={<Pencil className="h-4 w-4" />} label="Edit" onClick={() => onAction("edit")} />
          )}
          {mine && (
            <ActionButton
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete"
              danger
              onClick={() => onAction("delete")}
            />
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium transition-colors ${
        danger ? "text-danger hover:bg-danger/10" : "text-text/90 hover:bg-white/[0.07]"
      }`}
    >
      {icon}
      {label}
    </motion.button>
  );
}
