"use client";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { RaceEvent, ResultBranding } from "@/lib/dossard/types";
import { resolveEventBranding } from "@/lib/dossard/event-branding";
function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}
async function extractPalette(dataUrl: string) {
  const image = new window.Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("IMAGE_INVALIDE"));
    image.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [] as string[];
  ctx.drawImage(image, 0, 0, 72, 72);
  const data = ctx.getImageData(0, 0, 72, 72).data;
  const buckets = new Map<
    string,
    { r: number; g: number; b: number; count: number }
  >();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 150) continue;
    const r = data[index],
      g = data[index + 1],
      b = data[index + 2];
    if (r > 245 && g > 245 && b > 245) continue;
    if (r < 18 && g < 18 && b < 18) continue;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 22) continue;
    const qr = Math.round(r / 32) * 32,
      qg = Math.round(g / 32) * 32,
      qb = Math.round(b / 32) * 32;
    const key = `${qr}-${qg}-${qb}`;
    const item = buckets.get(key) ?? { r: qr, g: qg, b: qb, count: 0 };
    item.count += 1;
    buckets.set(key, item);
  }
  const candidates = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 18);
  const picked: typeof candidates = [];
  candidates.forEach((candidate) => {
    if (
      picked.length < 4 &&
      picked.every((other) => colorDistance(candidate, other) > 72)
    )
      picked.push(candidate);
  });
  picked.sort((a, b) => a.r + a.g + a.b - (b.r + b.g + b.b));
  return picked.map((color) => rgbToHex(color.r, color.g, color.b));
}

export function EventBrandingDialog({event, onChange, open, onOpenChange}: {event: RaceEvent; onChange: (event: RaceEvent) => void; open: boolean; onOpenChange: (open: boolean) => void}) {
  const branding = { ...resolveEventBranding(event), ...event.resultBranding };
  const updateBranding = (patch: Partial<ResultBranding>) =>
    onChange({ ...event, resultBranding: { ...branding, ...patch } });
  const uploadLogo = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      let palette: string[] = [];
      try {
        palette = await extractPalette(dataUrl);
      } catch {
        /* palette manuelle toujours disponible */
      }
      updateBranding({
        logoDataUrl: dataUrl,
        ...(palette[0] && !event.resultBranding?.primaryColor ? { primaryColor: palette[0] } : {}),
        ...(palette[1] && !event.resultBranding?.secondaryColor ? { secondaryColor: palette[1] } : {}),
        ...(palette[2] && !event.resultBranding?.accentColor ? { accentColor: palette[2] } : {}),
      });
      if (palette.length >= 2)
        toast.success("Logo ajouté. Les couleurs déjà choisies sont conservées.");
    };
    reader.readAsDataURL(file);
  };

  return (      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>En-tête & identité visuelle</DialogTitle>
            <DialogDescription>
              Un seul réglage pour la liste des dossards, les classements, le challenge, la feuille de secours, les posts et les stories. Les dossards gardent leur fond personnalisé dans l’éditeur.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Titre affiché</Label>
              <Input
                value={branding.title}
                onChange={(event) =>
                  updateBranding({ title: event.target.value })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Sous-titre</Label>
              <Input
                value={branding.subtitle}
                onChange={(event) =>
                  updateBranding({ subtitle: event.target.value })
                }
                placeholder="Ex. Saint-Lô · 2026"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Logo de la course</Label>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => uploadLogo(event.target.files?.[0])}
              />
              <p className="mt-1 text-xs text-slate-500">
                Ce logo sera utilisé sur les publications, les stories et les feuilles imprimées. Les couleurs déjà choisies sont conservées ; les couleurs non définies sont détectées à l’import. Vous pouvez ensuite les ajuster.
              </p>
            </div>
            {branding.logoDataUrl && (
              <div className="sm:col-span-2 flex justify-center rounded-2xl bg-slate-50 p-4">
                <Image
                  src={branding.logoDataUrl}
                  alt="Logo de la course"
                  width={240}
                  height={176}
                  unoptimized
                  className="max-h-44 max-w-full object-contain"
                />
              </div>
            )}
            <div>
              <Label>Couleur principale</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  type="color"
                  value={branding.primaryColor}
                  onChange={(event) =>
                    updateBranding({ primaryColor: event.target.value })
                  }
                  className="h-11 w-16 p-1"
                />
                <Input
                  value={branding.primaryColor}
                  onChange={(event) =>
                    updateBranding({ primaryColor: event.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Couleur secondaire</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  type="color"
                  value={branding.secondaryColor}
                  onChange={(event) =>
                    updateBranding({ secondaryColor: event.target.value })
                  }
                  className="h-11 w-16 p-1"
                />
                <Input
                  value={branding.secondaryColor}
                  onChange={(event) =>
                    updateBranding({ secondaryColor: event.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Couleur d’accent</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  type="color"
                  value={branding.accentColor}
                  onChange={(event) =>
                    updateBranding({ accentColor: event.target.value })
                  }
                  className="h-11 w-16 p-1"
                />
                <Input
                  value={branding.accentColor}
                  onChange={(event) =>
                    updateBranding({ accentColor: event.target.value })
                  }
                />
              </div>
            </div>
            <div
              className="rounded-2xl border bg-white p-4"
              style={{
                color: branding.primaryColor, borderColor: branding.secondaryColor,
              }}
            >
              <p className="font-bold">Aperçu des couleurs</p>
              <p className="text-sm text-slate-500">
                Les exports reprendront cette palette.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Terminer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
);
}
