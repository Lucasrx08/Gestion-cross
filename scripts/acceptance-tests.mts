import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { pocketCover, pocketDragPosition } from "../lib/dossard/pocket-cover";
import { PDFDocument } from "pdf-lib";
import { createRaceEvent } from "../lib/dossard/defaults";
import { barcodeGeometry, verifyCode128 } from "../lib/dossard/barcode";
import { importParticipants, mappingIsValid, readParticipantFile } from "../lib/dossard/import";
import { createLocalId, normalizeScannedIdentifier, technicalId } from "../lib/dossard/identifiers";
import { generateEventDocumentPdf, generatePocketPdf, rosterSections, pocketPosition } from "../lib/dossard/print-documents";
import { arrangeBibSheets, sortBibParticipants } from "../lib/dossard/print-order";
import { generateBibPdf } from "../lib/dossard/pdf";
import { validateParticipants } from "../lib/dossard/validation";
import type { BackgroundAsset, Participant } from "../lib/dossard/types";

const nativeFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const value = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (value === "/fonts/DejaVuSans.ttf" || value === "/fonts/DejaVuSans-Bold.ttf") {
    const bytes = await readFile(new URL(`../public/fonts/${value.split("/").at(-1)}`, import.meta.url));
    return new Response(bytes);
  }
  return nativeFetch(input, init);
}) as typeof fetch;

function participants(count: number): Participant[] {
  const numbering = { prefix: "CRS26", start: 1, digits: 4 };
  const accents = ["DUPONT", "O’CONNOR", "LÉVÊQUE", "CHARPENTIER-DE-LA-RIVIÈRE", "D'ALMEIDA"];
  return validateParticipants(Array.from({ length: count }, (_, index) => ({
    id: createLocalId(), sourceRow: index + 2, bibNumber: index + 1,
    technicalId: technicalId(numbering, index + 1),
    lastName: accents[index % accents.length], firstName: `Élève-${index + 1}`,
    className: `${6 - (index % 4)}e Classe n°${(index % 32) + 1}`, issues: [],
  })));
}

async function importTests() {
  const data = [["Groupe", "Prénom élève", "Élève"], ["6e Avignon", "Léa", "DUPONT"], ["5e Deroche", "Hugo", "MARTIN"]];
  const sheet = XLSX.utils.aoa_to_sheet(data), book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Élèves");
  const xlsx = XLSX.write(book, { bookType: "xlsx", type: "array" });
  const draft = await readParticipantFile(new File([xlsx], "eleves.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) as unknown as globalThis.File);
  assert(mappingIsValid(draft.mapping));
  assert.equal(draft.mapping.className, 0); assert.equal(draft.mapping.firstName, 1); assert.equal(draft.mapping.lastName, 2);
  const imported = importParticipants(draft, draft.mapping, { prefix: "CRS26", start: 1, digits: 4 });
  assert.equal(imported[0].lastName, "DUPONT"); assert.equal(imported[0].className, "6e Avignon");
  const csv = "Classe;Nom;Prénom\n4e Flessel;LEGRAND;Sarah\n3e Gaudí;D’ARC;Zoé";
  const csvDraft = await readParticipantFile(new File([csv], "eleves.csv", { type: "text/csv" }) as unknown as globalThis.File);
  assert(mappingIsValid(csvDraft.mapping));
  console.log("✓ imports XLSX/CSV et ordre variable");
}

async function background(path: string, mimeType: "image/png" | "image/jpeg"): Promise<BackgroundAsset> {
  const bytes = await readFile(path);
  return { fileName: path.split("/").at(-1)!, mimeType, dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`, widthPx: 2480, heightPx: 1748, sizeBytes: bytes.length };
}

async function pdfTest(count: number, asset?: BackgroundAsset) {
  const event = createRaceEvent({ name: `Test ${count}`, year: 2026, location: "Saint-Lô" });
  event.participants = participants(count); if (asset) event.template.background = asset;
  const ids = new Set(event.participants.map((p) => p.technicalId)); assert.equal(ids.size, count);
  event.participants.forEach((p) => { assert(verifyCode128(p.technicalId)); assert(barcodeGeometry(p.technicalId).bars.length > 0); });
  const result = await generateBibPdf(event, event.participants);
  const pdf = await PDFDocument.load(result.bytes); assert.equal(pdf.getPageCount(), Math.ceil(count / 2));
  const { width, height } = pdf.getPage(0).getSize();
  assert(Math.abs(width - 210 * 72 / 25.4) < .02); assert(Math.abs(height - 297 * 72 / 25.4) < .02);
  assert.equal(result.a4PageCount, Math.ceil(count / 2));
  console.log(`✓ PDF ${count} dossards / ${Math.ceil(count / 2)} feuilles A4 · ${(result.bytes.length / 1048576).toFixed(1)} Mo`);
}

await importTests();
assert.equal(normalizeScannedIdentifier("RR§001"), "RR-001");
assert.equal(normalizeScannedIdentifier(" rr–001\n"), "RR-001");
assert.equal(technicalId({ prefix: "", start: 1, digits: 4 }, 1), "0001");
assert.equal(technicalId({ prefix: "RR", start: 1, digits: 4 }, 1), "RR-0001");
console.log("✓ normalisation des scans de douchette");
const png = await background(new URL("../public/logo-bon-sauveur-cross.png", import.meta.url).pathname, "image/png");
const jpegBytes = Buffer.from("/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAOABQDAREAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAcJ/8QAGhAAAQUBAAAAAAAAAAAAAAAAAAMVFmJjof/EABgBAQADAQAAAAAAAAAAAAAAAAAFBgcI/8QAGxEAAQQDAAAAAAAAAAAAAAAAAAIDFmEUFWL/2gAMAwEAAhEDEQA/ANLZJp0zGZdE1rqEk06Jl0NdQkmnRMuhrqJc+L2OVpO9ZesFIfF7CTvWMFIfF7CTvWMFJ//Z", "base64");
const jpeg: BackgroundAsset = { fileName: "fond-test.jpg", mimeType: "image/jpeg", dataUrl: `data:image/jpeg;base64,${jpegBytes.toString("base64")}`, widthPx: 2480, heightPx: 1748, sizeBytes: jpegBytes.length };
await pdfTest(10, png); await pdfTest(10, jpeg);
for (const count of [100, 800, 1500]) await pdfTest(count);
console.log("✓ critères d’acceptation principaux validés");

async function printDocumentTests() {
  const event = createRaceEvent({name:"ROSE RUN · ESSAI FICTIF",year:2026,location:"Saint-Lô"});
  event.participants = participants(51).map((p,i)=>({...p,className:i<25?"CP A":"CE1 B"}));
  event.resultBranding={title:event.name,primaryColor:"#bf1281",secondaryColor:"#f198a5",logoDataUrl:png.dataUrl};
  const list=await generateEventDocumentPdf(event,rosterSections(event));
  assert.equal((await PDFDocument.load(list)).getPageCount(),2);
  for (const count of [26,30,31,700]) {
    const sameClass={...event,participants:participants(count).map(p=>({...p,className:"6e A"}))};
    const bytes=await generateEventDocumentPdf(sameClass,rosterSections(sameClass));
    assert.equal((await PDFDocument.load(bytes)).getPageCount(),Math.ceil(count/30));
  }
  const pockets=[{id:"test",classes:["CP A","CE1 B"],text:"Mme Dupont · Distribution des dossards",x:12,y:70,fontSize:18}];
  assert(pocketCover.frame.x>148.5);
  assert(pocketCover.centerX>148.5);
  assert.deepEqual(pocketDragPosition({x:20,y:70,clientX:300,clientY:400},330,420,600,400),{x:30,y:75});
  const pocket=await generatePocketPdf(event,pockets);
  const pocketDoc=await PDFDocument.load(pocket);
  assert.equal(pocketDoc.getPageCount(),1);
  assert(Math.abs(pocketDoc.getPage(0).getWidth()-297*72/25.4)<.02);
  assert.deepEqual(pocketPosition(-10,100),{x:5,y:85});
  const bibs=await generateBibPdf(event,arrangeBibSheets(sortBibParticipants(event.participants,"class-name"),true,true));
  assert.equal(bibs.a4PageCount,26);
  const backup=await generateEventDocumentPdf(event,[{title:"Course CP / CE1 · Feuille de secours",columns:["Ordre d’arrivée","Numéro de dossard"],rows:Array.from({length:30},()=>["",""])}]);
  assert.equal((await PDFDocument.load(backup)).getPageCount(),1);
  if(process.env.QA_PRINT_OUTPUT) {
    await mkdir(process.env.QA_PRINT_OUTPUT,{recursive:true});
    for(const [name,bytes] of [["liste-classes.pdf",list],["pochette-classes.pdf",pocket],["dossards-piles.pdf",bibs.bytes],["feuille-secours.pdf",backup]] as const)await writeFile(`${process.env.QA_PRINT_OUTPUT}/${name}`,bytes);
  }
  console.log("✓ Listes 25/26/30/31/700 élèves, pochettes paysage et piles séparées avec emplacement vide");
}
await printDocumentTests();
