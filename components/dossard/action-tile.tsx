"use client";

import { useId } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export function ActionTile({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  const descriptionId = useId();

  return (
    <button
      type="button"
      className="cross-action-tile"
      aria-label={title}
      aria-describedby={descriptionId}
      onClick={onClick}
    >
      <span className="cross-action-tile-top" aria-hidden="true">
        <span className="cross-action-tile-icon"><Icon /></span>
        <ArrowUpRight className="cross-action-tile-arrow" />
      </span>
      <span className="cross-action-tile-copy">
        <span className="cross-action-tile-title">{title}</span>
        <span id={descriptionId} className="cross-action-tile-description">{description}</span>
      </span>
    </button>
  );
}
