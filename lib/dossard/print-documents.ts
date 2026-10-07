import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import { publicAsset } from "./assets";
import { resolveEventBranding } from "./event-branding";
import { participantRoster } from "./participant-roster";
import type { RaceEvent } from "./types";

const mm = (n: number) => n * 72 / 25.4;
const ink = (hex: string) => rgb(...[1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255) as [number,number,number]);
const clean = (s: string) => s.replace(/[\r\n\t]+/g," ").trim();
export interface PrintSection { title: string; note?: string; columns: string[]; rows: string[][]; widths?: number[] }
export interface ClassPocket { id: string; classes: string[]; text: string; x: number; y: number; fontSize: number }
export function pocketPosition(x: number, y: number) { return {x:Math.max(5,Math.min(75,Number.isFinite(x)?x:12)), y:Math.max(5,Math.min(85,Number.isFinite(y)?y:67))}; }
export function rosterSections(event: RaceEvent): PrintSection[] {
  return participantRoster(event.participants).map(g => ({title:`${g.className} · ${g.participants.length} élèves`,note:"Liste des dossards · Au scan, saisir le code complet, avec ses zéros et son éventuel préfixe.",columns:["Nom","Prénom","Dossard","Code à saisir au scan"],widths:[.32,.24,.12,.32],rows:g.participants.map(p=>[p.lastName.toLocaleUpperCase("fr"),p.firstName,String(p.bibNumber),p.technicalId])}));
}
/** Parse only our own escaped print markup, preserving the complete content of each table. */
export function sectionsFromPrintHtml(html: string): PrintSection[] {
  const doc = new DOMParser().parseFromString(html,"text/html");
  let title = "", notes: string[] = [];
  const sections: PrintSection[] = [];
  for (const element of doc.body.querySelectorAll("h2,p,table")) {
    if (element.closest("header") || element.closest("table") !== (element.tagName === "TABLE" ? element : null)) continue;
    if (element.tagName === "H2") { title = [title,clean(element.textContent ?? "")].filter(Boolean).join(" · "); }
    else if (element.tagName === "P") notes.push(clean(element.textContent ?? ""));
    else {
      sections.push({title, note:notes.join(" "),columns:Array.from(element.querySelectorAll("thead th")).map(c=>clean(c.textContent??"")),rows:Array.from(element.querySelectorAll("tbody tr")).map(r=>Array.from(r.querySelectorAll("td")).map(c=>clean(c.textContent??"")))});
      title = ""; notes = [];
    }
  }
  return sections;
}
async function prepare(event: RaceEvent) {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  doc.setTitle(resolveEventBranding(event).title || event.name); doc.setCreator("Gestion Cross · L. RIGAUX");
  const fonts = await Promise.all(["DejaVuSans.ttf","DejaVuSans-Bold.ttf"].map(async name => {const r=await fetch(publicAsset(`/fonts/${name}`));if(!r.ok)throw new Error("Police d’impression indisponible.");return doc.embedFont(await r.arrayBuffer(),{subset:true});}));
  const b = resolveEventBranding(event); let logo: PDFImage | undefined;
  if (b.logoDataUrl) {
    const r = await fetch(b.logoDataUrl); if (!r.ok) throw new Error("Logo de l’événement indisponible.");
    const bytes = await r.arrayBuffer();
    try { logo = await doc.embedPng(bytes); } catch { logo = await doc.embedJpg(bytes); }
  }
  return {doc,regular:fonts[0],bold:fonts[1],b,logo};
}
function lines(font: PDFFont,text: string,size: number,width: number): string[] {
  const out: string[] = []; let line="";
  for(const word of clean(text).split(" ")) {
    if(font.widthOfTextAtSize([line,word].filter(Boolean).join(" "),size)<=width)line=[line,word].filter(Boolean).join(" ");
    else {if(line)out.push(line);line="";for(const char of word){if(font.widthOfTextAtSize(line+char,size)>width){out.push(line);line="";}line+=char;}}
  }
  if(line)out.push(line);return out;
}
function drawLines(page:PDFPage,font:PDFFont,text:string,x:number,top:number,width:number,size:number,fill=rgb(.15,.19,.25),maxLines=100) {
  const all = lines(font,text,size,width);
  let fitted=size;
  while(lines(font,text,fitted,width).length>maxLines && fitted>5)fitted-=.25;
  const wrapped=lines(font,text,fitted,width);
  for(let i=0;i<wrapped.length;i++)page.drawText(wrapped[i],{x,y:top-fitted-i*fitted*1.25,size:fitted,font,color:fill});
  return Math.max(1,all.length)*size*1.25;
}
export async function generateEventDocumentPdf(event: RaceEvent, sections: PrintSection[]) {
  if(!sections.length)throw new Error("Aucune donnée à imprimer.");
  const {doc,regular,bold,b,logo}=await prepare(event);
  const width=mm(186),left=mm(12),primary=ink(b.primaryColor!),secondary=ink(b.secondaryColor!);
  for(const section of sections) {
    const count=Math.max(1,Math.ceil(section.rows.length/30));
    for(let index=0;index<count;index++) {
      const page=doc.addPage([mm(210),mm(297)]); let top=mm(285);
      const logoWidth=logo ? mm(28) : 0;
      if(logo){const scale=Math.min(mm(26)/logo.width,mm(19)/logo.height);page.drawImage(logo,{x:left,y:top-mm(19),width:logo.width*scale,height:logo.height*scale});}
      drawLines(page,bold,b.title||event.name,left+logoWidth,top,width-logoWidth,16,primary,2);
      if(b.subtitle)drawLines(page,regular,b.subtitle,left+logoWidth,top-mm(15),width-logoWidth,8,undefined,1);
      top-=mm(22);page.drawLine({start:{x:left,y:top},end:{x:left+width,y:top},thickness:1.5,color:secondary});
      top-=mm(3);drawLines(page,bold,section.title,left,top,width,12,primary,2);top-=mm(12);
      if(section.note){drawLines(page,regular,section.note,left,top,width,8,undefined,3);top-=mm(11);}
      const weights=section.widths??section.columns.map(c=>/Élève|Classe|renseigné|comptabilisés/i.test(c)?1.7:1);
      const total=weights.reduce((a,v)=>a+v,0),colWidths=weights.map(v=>width*v/total),headerHeight=mm(11),rowHeight=mm(7);
      page.drawRectangle({x:left,y:top-headerHeight,width,height:headerHeight,color:primary});
      let x=left;
      section.columns.forEach((c,i)=>{drawLines(page,bold,c,x+mm(1.5),top-mm(1.5),colWidths[i]-mm(3),8,rgb(1,1,1),3);x+=colWidths[i];});top-=headerHeight;
      for(const [ri,row] of section.rows.slice(index*30,index*30+30).entries()) {
        page.drawRectangle({x:left,y:top-rowHeight,width,height:rowHeight,color:ri%2?rgb(.97,.97,.98):rgb(1,1,1),borderColor:rgb(.85,.88,.91),borderWidth:.4});x=left;
        section.columns.forEach((_,ci)=>{const font=ci===0?bold:regular,text=row[ci]??"",cellWidth=colWidths[ci]-mm(3),size=lines(font,text,8.5,cellWidth).length>1?7.5:8.5;drawLines(page,font,text,x+mm(1.5),top-mm(0.8),cellWidth,size,undefined,2);x+=colWidths[ci];});top-=rowHeight;
      }
    }
  }
  return doc.save();
}
export async function generatePocketPdf(event: RaceEvent, pockets: ClassPocket[]) {
  if(!pockets.length)throw new Error("Choisissez au moins une classe.");
  const {doc,bold,b,logo}=await prepare(event);const primary=ink(b.primaryColor!),secondary=ink(b.secondaryColor!);
  for(const pocket of pockets) {
    const page=doc.addPage([mm(297),mm(210)]),left=mm(12),faceWidth=mm(124.5);
    page.drawLine({start:{x:mm(148.5),y:mm(5)},end:{x:mm(148.5),y:mm(205)},thickness:.6,color:rgb(.7,.7,.7),dashArray:[3,3]});
    if(logo){const scale=Math.min(mm(38)/logo.width,mm(30)/logo.height);const w=logo.width*scale;page.drawImage(logo,{x:mm(74.25)-w/2,y:mm(164),width:w,height:logo.height*scale});}
    drawLines(page,bold,b.title||event.name,left,mm(151),faceWidth,22,primary,2);
    page.drawLine({start:{x:left,y:mm(122)},end:{x:left+faceWidth,y:mm(122)},thickness:2,color:secondary});
    drawLines(page,bold,pocket.classes.join(" · "),left,mm(115),faceWidth,18,primary,4);
    const position=pocketPosition(pocket.x,pocket.y),x=mm(148.5*position.x/100),top=mm(210*(1-position.y/100));
    drawLines(page,bold,pocket.text,x,top,mm(143.5)-x,Math.max(10,Math.min(30,pocket.fontSize)),primary,4);
  }
  return doc.save();
}
