import fs from "node:fs";

const path = "components/dossard/course-step.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`Correctif UI introuvable : ${label}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
  '    secondaryColor: event.resultBranding?.secondaryColor || "#f198a5",\n    accentColor: event.resultBranding?.accentColor || "#bf1281",',
  '    secondaryColor: event.resultBranding?.secondaryColor || "#fed60b",\n    accentColor: event.resultBranding?.accentColor || "#173970",',
  "palette par défaut",
);

replaceOnce(
  '      setEntries(result.entries ?? []);\n      setStations(result.stations ?? []);\n      setHeats((items) => items.map((item) => item.id === result.heat.id ? { ...item, ...result.heat } : item));',
  '      setEntries(result.entries ?? []);\n      setStations(result.stations ?? []);\n      setHeats((items) => items.map((item) => item.id === result.heat.id ? { ...item, ...result.heat } : item));\n      if (result.heat.station_code) {\n        window.localStorage.setItem(stationKey(result.heat.id), result.heat.station_code);\n        if (activeHeatRef.current === result.heat.id) setStationCode(result.heat.station_code);\n      }',
  "récupération du code de poste",
);

replaceOnce(
  '    const rawClasses = new Set(selectedOptions.flatMap((option) => option.variants));\n    const participants = event.participants.filter((participant) => rawClasses.has(participant.className) && (sexFilter === "all" || (sexFilter === "female" ? isFemale(participant.sex) : isMale(participant.sex))));\n    if (!participants.length) return toast.error("Aucun participant ne correspond à ces réglages.");',
  '    const rawClasses = new Set(selectedOptions.flatMap((option) => option.variants));\n    const classParticipants = event.participants.filter((participant) => rawClasses.has(participant.className));\n    const unknownSex = classParticipants.filter((participant) => !isFemale(participant.sex) && !isMale(participant.sex));\n    if (sexFilter !== "all" && unknownSex.length) return toast.error(`${unknownSex.length} élève(s) ont un sexe manquant ou non reconnu. Corrigez la liste avant de préparer une course Filles/Garçons.`);\n    const participants = classParticipants.filter((participant) => sexFilter === "all" || (sexFilter === "female" ? isFemale(participant.sex) : isMale(participant.sex)));\n    if (!participants.length) return toast.error("Aucun participant ne correspond à ces réglages.");',
  "validation du sexe",
);

replaceOnce(
  '  const printWindow = (title: string, body: string) => {\n    const popup = window.open("", "_blank", "width=1000,height=800");\n    if (!popup) return toast.error("Le navigateur a bloqué la fenêtre d’impression.");\n    const primary = branding.primaryColor || "#1154b3", accent = branding.accentColor || "#bf1281";',
  '  const printWindow = (title: string, body: string) => {\n    const popup = window.open("", "_blank", "width=1000,height=800");\n    if (!popup) return toast.error("Le navigateur a bloqué la fenêtre d’impression.");\n    const primary = branding.primaryColor || "#1154b3", accent = branding.accentColor || "#173970";',
  "couleur impression",
);

replaceOnce(
  '  const documentHeader = () => `<header>${branding.logoDataUrl ? `<img src="${esc(branding.logoDataUrl)}">` : ""}<div><h1>${esc(branding.title || event.name)}</h1><p>${esc(branding.subtitle || "")}</p></div></header>`;',
  '  const documentHeader = () => { const logo = branding.logoDataUrl || new URL("./logo-bon-sauveur-cross.png", window.location.href).toString(); return `<header><img src="${esc(logo)}"><div><h1>${esc(branding.title || event.name)}</h1><p>${esc(branding.subtitle || "")}</p></div></header>`; };',
  "logo par défaut des résultats",
);

replaceOnce(
  '    const primary = branding.primaryColor || "#1154b3", secondary = branding.secondaryColor || "#f198a5", accent = branding.accentColor || "#bf1281";',
  '    const primary = branding.primaryColor || "#1154b3", secondary = branding.secondaryColor || "#fed60b", accent = branding.accentColor || "#173970";',
  "palette exports sociaux",
);

replaceOnce(
  '    let logoHeight = 0;\n    if (branding.logoDataUrl) {\n      try { const image = await loadCanvasImage(branding.logoDataUrl);',
  '    let logoHeight = 0;\n    const socialLogo = branding.logoDataUrl || new URL("./logo-bon-sauveur-cross.png", window.location.href).toString();\n    if (socialLogo) {\n      try { const image = await loadCanvasImage(socialLogo);',
  "logo exports sociaux",
);

replaceOnce(
  '    ctx.fillStyle = "#ffffff"; ctx.font = `900 ${story ? 54 : 48}px Arial`; ctx.fillText(branding.title || event.name, 70, titleY - 82);',
  '    ctx.fillStyle = "#ffffff"; let titleSize = story ? 54 : 48; const titleText = branding.title || event.name; do { ctx.font = `900 ${titleSize}px Arial`; if (ctx.measureText(titleText).width <= width - 140) break; titleSize -= 2; } while (titleSize > 28); ctx.fillText(titleText, 70, titleY - 82, width - 140);',
  "titre social adaptatif",
);

replaceOnce(
  '    ctx.fillStyle = primary; ctx.font = `900 ${story ? 48 : 42}px Arial`; ctx.fillText(selectedHeat.name, 90, panelY + 80);',
  '    ctx.fillStyle = primary; let heatSize = story ? 48 : 42; do { ctx.font = `900 ${heatSize}px Arial`; if (ctx.measureText(selectedHeat.name).width <= width - 180) break; heatSize -= 2; } while (heatSize > 26); ctx.fillText(selectedHeat.name, 90, panelY + 80, width - 180);',
  "nom de course social adaptatif",
);

fs.writeFileSync(path, source);
console.log("Correctifs UI de l’audit appliqués.");
