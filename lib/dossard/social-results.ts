export interface SocialResultRow { label: string; detail: string; rank: number }
export interface SocialResultsDesign {
  story: boolean;
  title: string;
  subtitle: string;
  heading: string;
  category: string;
  note: string;
  primary: string;
  secondary: string;
  rows: SocialResultRow[];
}

/** Shared layout for every post/story: white background, isolated logo, event colours. */
export function drawSocialResults(ctx: CanvasRenderingContext2D, design: SocialResultsDesign, logo?: HTMLImageElement) {
  const { story, primary, secondary } = design;
  const width = 1080, height = story ? 1920 : 1080;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = primary;
  ctx.fillRect(64, 32, width - 128, 6);
  ctx.fillStyle = secondary;
  ctx.fillRect(64, height - (story ? 48 : 24), width - 128, 4);

  const text = (value: string, x: number, y: number, preferred: number, maxWidth: number, colour: string, align: CanvasTextAlign = "left") => {
    let size = preferred;
    ctx.textAlign = align;
    ctx.fillStyle = colour;
    do { ctx.font = `700 ${size}px Arial`; if (ctx.measureText(value).width <= maxWidth) break; size -= 1; } while (size > 16);
    ctx.fillText(value, x, y, maxWidth);
  };
  if (logo) {
    const maxWidth = story ? 320 : 230, maxHeight = story ? 260 : 185;
    const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    const w = logo.width * ratio, h = logo.height * ratio;
    ctx.drawImage(logo, (width - w) / 2, story ? 75 : 60, w, h);
  }
  // All text starts below the reserved logo area, even for a tall transparent logo.
  text(design.title, width / 2, story ? 410 : 295, story ? 54 : 40, 952, primary, "center");
  text(design.subtitle, width / 2, story ? 465 : 330, story ? 30 : 24, 952, secondary, "center");
  text(design.heading, width / 2, story ? 555 : 375, story ? 52 : 38, 952, primary, "center");
  text(design.category, width / 2, story ? 605 : 415, story ? 32 : 25, 952, secondary, "center");

  const startY = story ? 680 : 458, gap = story ? 104 : 51;
  design.rows.slice(0, 10).forEach((row, index) => {
    const y = startY + index * gap;
    text(String(row.rank).padStart(2, "0"), 70, y, story ? 36 : 25, 70, primary);
    text(row.label, 160, y, story ? 36 : 25, 660, primary);
    text(row.detail, 1008, y, story ? 28 : 21, 175, secondary, "right");
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(64, y + 28); ctx.lineTo(1016, y + 28); ctx.stroke();
  });
  text(design.note, width / 2, height - (story ? 125 : 92), story ? 25 : 18, 952, primary, "center");
  text("Gestion Cross · L. RIGAUX", width / 2, height - (story ? 78 : 50), story ? 24 : 18, 952, secondary, "center");
}
