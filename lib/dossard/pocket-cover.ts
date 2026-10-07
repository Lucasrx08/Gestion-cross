/** A4 landscape, cover on the right A5 face. Coordinates are in millimetres. */
export const pocketCover = {
  foldX: 148.5,
  frame: { x: 160.5, y: 12, width: 124.5, height: 186 },
  centerX: 222.75,
  logo: { top: 187, width: 40, height: 30 },
  title: { top: 146, width: 112.5, fontSize: 24 },
  dividerY: 122,
  labelY: 112,
  classes: { top: 103, width: 112.5, fontSize: 22 },
};
export function coverTitleLines(text: string, maximum = 22) {
  const words=text.trim().split(/\s+/),out:string[]=[];let line="";
  for(const word of words) {if(line && (line+" "+word).length>maximum){out.push(line);line=word;}else line=[line,word].filter(Boolean).join(" ");}
  if(line)out.push(line);return out;
}
export function pocketDragPosition(start:{x:number;y:number;clientX:number;clientY:number},clientX:number,clientY:number,width:number,height:number) {
  return {x:Math.round(Math.max(5,Math.min(75,start.x+(clientX-start.clientX)/width*200))),y:Math.round(Math.max(5,Math.min(85,start.y+(clientY-start.clientY)/height*100)))};
}
