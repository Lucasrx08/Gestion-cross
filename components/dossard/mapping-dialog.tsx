"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mappingIsValid, participantFields } from "@/lib/dossard/import";
import type { ColumnMapping, ImportDraft } from "@/lib/dossard/types";

interface MappingDialogProps {
  draft?: ImportDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mapping: ColumnMapping) => void;
}

function MappingDialogContent({
  draft,
  open,
  onOpenChange,
  onConfirm,
}: MappingDialogProps & { draft: ImportDraft }) {
  const [mapping, setMapping] = useState<ColumnMapping>(() => ({ ...draft.mapping }));
  const duplicates = useMemo(() => {
    const values = Object.values(mapping).filter((value): value is number => typeof value === "number");
    return values.filter((value, index) => values.indexOf(value) !== index);
  }, [mapping]);
  const valid = mappingIsValid(mapping) && !duplicates.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="mb-1 flex gap-2">
            <Badge variant="secondary">{draft.rows.length} lignes</Badge>
            <Badge variant="outline">{draft.fileName}</Badge>
          </div>
          <DialogTitle>Associer les quatre données utiles</DialogTitle>
          <DialogDescription>Nom, prénom et classe sont obligatoires. Le sexe reste facultatif.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {participantFields.map((field) => (
            <div key={field.key} className="rounded-xl border border-blue-100 bg-white p-3">
              <Label className="mb-2">
                {field.label}
                {field.required && <span className="ml-2 text-[#1154b3]">obligatoire</span>}
              </Label>
              <Select
                value={typeof mapping[field.key] === "number" ? String(mapping[field.key]) : "ignore"}
                onValueChange={(value) =>
                  setMapping((current) => ({
                    ...current,
                    [field.key]: value === "ignore" ? undefined : Number(value),
                  }))
                }
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ignore">Ignorer</SelectItem>
                  {draft.headers.map((header, index) => (
                    <SelectItem key={`${header}-${index}`} value={String(index)}>{header}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {duplicates.length > 0 && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Une colonne est utilisée plusieurs fois.</p>
        )}

        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-blue-50/70">
              <tr>{draft.headers.map((header, index) => <th key={index} className="px-3 py-2">{header}</th>)}</tr>
            </thead>
            <tbody>
              {draft.rows.slice(0, 4).map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t">
                  {draft.headers.map((_, columnIndex) => (
                    <td key={columnIndex} className="px-3 py-2">{String(row[columnIndex] ?? "") || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button disabled={!valid} onClick={() => onConfirm(mapping)}>Valider l’import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MappingDialog(props: MappingDialogProps) {
  if (!props.draft) return null;
  const resetKey = [props.draft.fileName, props.draft.headers.join("|"), props.draft.rows.length].join(":");
  return <MappingDialogContent key={resetKey} {...props} draft={props.draft} />;
}
