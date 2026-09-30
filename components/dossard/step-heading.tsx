import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function StepHeading({ icon: Icon, title, description, actions }: {
  icon: LucideIcon; title: string; description: string; actions?: ReactNode;
}) {
  return <header className="cross-heading">
    <div className="cross-heading-copy flex items-start gap-4">
      <span className="cross-icon"><Icon className="size-5" /></span>
      <div className="min-w-0"><h2>{title}</h2><p>{description}</p></div>
    </div>
    {actions && <div className="cross-actions">{actions}</div>}
  </header>;
}
