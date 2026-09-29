"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Participant } from "@/lib/dossard/types";

export type ParticipantValues = Pick<Participant, "lastName" | "firstName" | "className" | "sex">;

const empty: ParticipantValues = { lastName: "", firstName: "", className: "", sex: "" };
const fields = [
  ["lastName", "Nom", true],
  ["firstName", "Prénom", true],
  ["className", "Classe", true],
  ["sex", "Sexe", false],
] as const;

interface ParticipantDialogProps {
  participant?: Participant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: ParticipantValues) => void;
}

function Editor({ participant, onOpenChange, onSave }: Omit<ParticipantDialogProps, "open">) {
  const [values, setValues] = useState<ParticipantValues>(() =>
    participant
      ? {
          lastName: participant.lastName,
          firstName: participant.firstName,
          className: participant.className,
          sex: participant.sex ?? "",
        }
      : { ...empty },
  );
  const valid = Boolean(values.lastName.trim() && values.firstName.trim() && values.className.trim());

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{participant ? "Modifier le participant" : "Ajouter un participant"}</DialogTitle>
        <DialogDescription>Uniquement les quatre données utiles à la course.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label, required]) => (
          <div key={key}>
            <Label className="mb-2">{label}{required ? " *" : ""}</Label>
            <Input
              value={values[key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
            />
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button
          disabled={!valid}
          onClick={() => {
            onSave(values);
            onOpenChange(false);
          }}
        >
          {participant ? "Enregistrer" : "Ajouter"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function ParticipantDialog(props: ParticipantDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && (
        <Editor
          key={props.participant?.id ?? "new"}
          participant={props.participant}
          onOpenChange={props.onOpenChange}
          onSave={props.onSave}
        />
      )}
    </Dialog>
  );
}
