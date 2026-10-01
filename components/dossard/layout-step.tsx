"use client";
import { useMemo, useState } from "react";
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  Bold,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  Italic,
  Plus,
  Save,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { StepHeading } from "./step-heading";
import { BibCanvas } from "./bib-canvas";
import { createElement, elementLabels } from "@/lib/dossard/defaults";
import { createLocalId } from "@/lib/dossard/identifiers";
import {
  longestClassParticipant,
  longestNameParticipant,
  previewParticipant,
} from "@/lib/dossard/preview";
import type {
  BibTemplate,
  LayoutElement,
  LayoutElementType,
  RaceEvent,
  TextAlign,
} from "@/lib/dossard/types";
const types: LayoutElementType[] = [
  "number",
  "lastName",
  "firstName",
  "fullName",
  "className",
  "sex",
  "barcode",
  "qrcode",
  "freeText",
];
export function LayoutStep({
  event,
  onChange,
  onSaveTemplate,
}: {
  event: RaceEvent;
  onChange: (event: RaceEvent) => void;
  onSaveTemplate: (template: BibTemplate) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(
    event.template.elements[0]?.id ?? "",
  );
  const [index, setIndex] = useState(0);
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const participants = event.participants,
    p = participants[index] ?? previewParticipant,
    selected = event.template.elements.find((e) => e.id === selectedId);
  const update = (element: LayoutElement) =>
    onChange({
      ...event,
      template: {
        ...event.template,
        elements: event.template.elements.map((e) =>
          e.id === element.id ? element : e,
        ),
      },
    });
  const add = (type: LayoutElementType) => {
    const element = createElement(type, event.template.elements.length % 6);
    onChange({
      ...event,
      template: {
        ...event.template,
        elements: [...event.template.elements, element],
      },
    });
    setSelectedId(element.id);
  };
  const longName = useMemo(
      () => longestNameParticipant(participants),
      [participants],
    ),
    longClass = useMemo(
      () => longestClassParticipant(participants),
      [participants],
    );
  return (
    <div className="space-y-4">
      <StepHeading
        icon={Type}
        title="Mise en page du dossard"
        description="Positionnez les éléments et vérifiez le rendu avec vos participants."
      />
      <section className="flex flex-col gap-3 cross-panel p-3 xl:flex-row xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus /> Ajouter un élément
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {types.map((type) => (
                <DropdownMenuItem key={type} onSelect={() => add(type)}>
                  <Type />
                  {elementLabels[type]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="cross-choice">
            <Grid3X3 />
            <Label className="mb-0" htmlFor="layout-grid">
              Grille
            </Label>
            <Switch id="layout-grid" checked={grid} onCheckedChange={setGrid} />
          </div>
          <div className="cross-choice">
            <Label className="mb-0" htmlFor="layout-snap">
              Magnétisme
            </Label>
            <Switch id="layout-snap" checked={snap} onCheckedChange={setSnap} />
          </div>
        </div>
        <Button
          variant="outline"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              const saved = {
                ...structuredClone(event.template),
                id: createLocalId(),
                createdAt: new Date().toISOString(),
              };
              await onSaveTemplate(saved);
              toast.success(
                "Une copie de la mise en page a été enregistrée dans vos modèles.",
              );
            } catch {
              toast.error("La mise en page n’a pas pu être enregistrée.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <Save /> Enregistrer une copie du modèle
        </Button>
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="cross-panel bg-[#f0f5ff] p-3 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Aperçu en temps réel
              </p>
              <p className="font-bold">
                {participants.length
                  ? `${index + 1}/${participants.length} · ${p.firstName} ${p.lastName}`
                  : "Aperçu sans participant"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!participants.length || index === 0}
                onClick={() => setIndex((i) => i - 1)}
              >
                <ChevronLeft /> Précédent
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !participants.length || index >= participants.length - 1
                }
                onClick={() => setIndex((i) => i + 1)}
              >
                Suivant <ChevronRight />
              </Button>
            </div>
          </div>
          <BibCanvas
            event={event}
            participant={p}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={update}
            grid={grid}
            snap={snap}
          />
          {participants.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setIndex(
                    Math.max(
                      0,
                      participants.findIndex((x) => x.id === longName?.id),
                    ),
                  )
                }
              >
                Nom le plus long
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setIndex(
                    Math.max(
                      0,
                      participants.findIndex((x) => x.id === longClass?.id),
                    ),
                  )
                }
              >
                Classe la plus longue
              </Button>
            </div>
          )}
        </div>
        <aside className="cross-panel p-5">
          {selected ? (
            <div className="space-y-5">
              <div className="flex justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    Propriétés
                  </p>
                  <h2 className="text-lg font-black">{selected.name}</h2>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Supprimer l’élément sélectionné"
                  className="text-red-600"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["xMm", "Position X", 0, event.template.widthMm],
                    ["yMm", "Position Y", 0, event.template.heightMm],
                    ["widthMm", "Largeur", 6, event.template.widthMm],
                    ["heightMm", "Hauteur", 6, event.template.heightMm],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <div key={key}>
                    <Label className="mb-1 text-xs">{label} (mm)</Label>
                    <Input
                      type="number"
                      step=".5"
                      min={min}
                      max={max}
                      value={Math.round(selected[key] * 10) / 10}
                      onChange={(e) =>
                        update({ ...selected, [key]: Number(e.target.value) })
                      }
                    />
                  </div>
                ))}
              </div>
              {!["barcode", "qrcode"].includes(selected.type) && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Taille (pt)</Label>
                      <Input
                        type="number"
                        min={4}
                        value={selected.fontSizePt}
                        onChange={(e) =>
                          update({
                            ...selected,
                            fontSizePt: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Minimum</Label>
                      <Input
                        type="number"
                        min={4}
                        value={selected.minFontSizePt}
                        onChange={(e) =>
                          update({
                            ...selected,
                            minFontSizePt: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Couleur</Label>
                    <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-2">
                      <Input
                        type="color"
                        value={selected.color}
                        className="w-14 p-1"
                        onChange={(e) =>
                          update({ ...selected, color: e.target.value })
                        }
                      />
                      <Input
                        value={selected.color}
                        onChange={(e) =>
                          update({ ...selected, color: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Toggle
                      aria-label="Gras"
                      pressed={selected.bold}
                      onPressedChange={(v) => update({ ...selected, bold: v })}
                    >
                      <Bold />
                    </Toggle>
                    <Toggle
                      aria-label="Italique"
                      pressed={selected.italic}
                      onPressedChange={(v) =>
                        update({ ...selected, italic: v })
                      }
                    >
                      <Italic />
                    </Toggle>
                    {(
                      [
                        ["left", AlignLeft],
                        ["center", AlignCenter],
                        ["right", AlignRight],
                      ] as const
                    ).map(([align, Icon]) => (
                      <Toggle
                        key={align}
                        aria-label={`Aligner ${align === "left" ? "à gauche" : align === "center" ? "au centre" : "à droite"}`}
                        pressed={selected.align === align}
                        onPressedChange={() =>
                          update({ ...selected, align: align as TextAlign })
                        }
                      >
                        <Icon />
                      </Toggle>
                    ))}
                  </div>
                  {selected.type === "freeText" && (
                    <div>
                      <Label className="text-xs">Texte</Label>
                      <Input
                        value={selected.content ?? ""}
                        onChange={(e) =>
                          update({ ...selected, content: e.target.value })
                        }
                      />
                      <p className="text-xs text-slate-500">
                        Variables : {"{{event}}"}, {"{{year}}"}, {"{{lieu}}"}
                      </p>
                    </div>
                  )}
                </>
              )}
              {selected.type === "barcode" && (
                <div className="flex justify-between rounded-xl bg-slate-50 p-3">
                  <Label className="mb-0" htmlFor="barcode-label">
                    Afficher l’identifiant
                  </Label>
                  <Switch
                    id="barcode-label"
                    checked={selected.showHumanReadable}
                    onCheckedChange={(v) =>
                      update({ ...selected, showHumanReadable: v })
                    }
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update({
                      ...selected,
                      xMm: (event.template.widthMm - selected.widthMm) / 2,
                    })
                  }
                >
                  <AlignHorizontalJustifyCenter /> Centrer H
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update({
                      ...selected,
                      yMm: (event.template.heightMm - selected.heightMm) / 2,
                    })
                  }
                >
                  <AlignVerticalJustifyCenter /> Centrer V
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <Type className="mx-auto text-slate-300" />
                <p className="font-bold">Sélectionnez un élément</p>
              </div>
            </div>
          )}
        </aside>
      </section>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet élément ?</AlertDialogTitle>
            <AlertDialogDescription>
              Il disparaîtra de tous les dossards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600"
              onClick={() => {
                if (selected) {
                  const remaining = event.template.elements.filter(
                    (e) => e.id !== selected.id,
                  );
                  onChange({
                    ...event,
                    template: { ...event.template, elements: remaining },
                  });
                  setSelectedId(remaining[0]?.id ?? "");
                }
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
