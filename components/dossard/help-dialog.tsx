"use client";

import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** The same explicit tap target is available to touch, pointer and keyboard users. */
export function HelpDialog({ title, children, label }: { title: string; children: ReactNode; label?: string }) {
  return <Dialog>
    <DialogTrigger asChild><Button type="button" variant="ghost" size={label ? "sm" : "icon"} className="shrink-0 text-muted-foreground" aria-label={`Aide : ${title}`} title={title}><CircleHelp className="size-4" />{label}</Button></DialogTrigger>
    <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">Aide et détails</DialogDescription></DialogHeader><div className="space-y-3 text-sm leading-relaxed text-slate-600">{children}</div></DialogContent>
  </Dialog>;
}
