"use client";

import type { ComponentType } from "react";
import type { ReactionType } from "@/lib/reactions";
import { DilReaction } from "./DilReaction";
import { HahaReaction } from "./HahaReaction";
import { WowReaction } from "./WowReaction";
import { AwwReaction } from "./AwwReaction";
import { HypeReaction } from "./HypeReaction";

export { DilReaction, HahaReaction, WowReaction, AwwReaction, HypeReaction };

export type ReactionIconProps = { size?: number; className?: string };

const ICONS: Record<ReactionType, ComponentType<ReactionIconProps>> = {
  dil: DilReaction,
  haha: HahaReaction,
  wow: WowReaction,
  aww: AwwReaction,
  hype: HypeReaction,
};

/** Render any of the five Dolemon reactions by name. No unicode emoji involved. */
export function ReactionIcon({
  type,
  size = 28,
  className,
}: ReactionIconProps & { type: ReactionType }) {
  const Icon = ICONS[type] ?? DilReaction;
  return <Icon size={size} className={className} />;
}
