import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HelpDialog } from "./help-dialog";

export function StepHeading({ icon: Icon, title, description, actions }: {
  icon: LucideIcon; title: string; description: string; actions?: ReactNode;
}) {
  return <header className="cross-heading">
    <div className="cross-heading-copy flex items-start gap-4">
      <span className="cross-icon"><Icon className="size-5" /></span>
      <div className="flex min-w-0 items-center gap-2"><h2>{title}</h2>{description && <HelpDialog title={title}><p>{description}</p></HelpDialog>}</div>
    </div>
    {actions && <div className="cross-actions">{actions}</div>}
  </header>;
}
