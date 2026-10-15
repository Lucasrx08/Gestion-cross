export const TV_RESULT_WIDTH = 960;
export const TV_RESULT_HEIGHT = 1080;

export interface TvResultRow {
  rank: number;
  name: string;
  className: string;
}

export interface TvResultsDesign {
  title: string;
  subtitle: string;
  course: string;
  primary: string;
  secondary: string;
  rows: TvResultRow[];
}

/** Demi-écran Full HD : deux PNG de 960 × 1080 se placent côte à côte sans retouche. */
export function drawTvTop20(
  ctx: CanvasRenderingContext2D,
  design: TvResultsDesign,
  logo?: HTMLImageElement,
) {
  const width = TV_RESULT_WIDTH;
  const height = TV_RESULT_HEIGHT;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = design.primary;
  ctx.fillRect(40, 24, width - 80, 6);
  ctx.fillStyle = design.secondary;
  ctx.fillRect(40, height - 34, width - 80, 4);

  const text = (
    value: string,
    x: number,
    y: number,
    preferred: number,
    maxWidth: number,
    colour: string,
    align: CanvasTextAlign = "left",
    minimum = 14,
  ) => {
    let size = preferred;
    ctx.textAlign = align;
    ctx.fillStyle = colour;
    do {
      ctx.font = `700 ${size}px Arial`;
      if (ctx.measureText(value).width <= maxWidth) break;
      size -= 1;
    } while (size > minimum);
    ctx.fillText(value, x, y, maxWidth);
  };

  if (logo) {
    const maxWidth = 125;
    const maxHeight = 105;
    const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    const logoWidth = logo.width * ratio;
    const logoHeight = logo.height * ratio;
    ctx.drawImage(logo, 48, 46, logoWidth, logoHeight);
  }

  text(design.title, 560, 82, 34, 680, design.primary, "center");
  text(design.subtitle, 560, 116, 21, 680, design.secondary, "center");
  text("TOP 20", width / 2, 166, 40, width - 96, design.primary, "center");
  text(design.course, width / 2, 207, 29, width - 96, design.secondary, "center");

  text("RANG", 48, 245, 16, 65, design.secondary);
  text("ÉLÈVE", 128, 245, 16, 560, design.secondary);
  text("CLASSE", width - 48, 245, 16, 175, design.secondary, "right");

  const rows = design.rows.slice(0, 20);
  const startY = 286;
  const gap = 36;
  rows.forEach((row, index) => {
    const y = startY + index * gap;
    text(String(row.rank).padStart(2, "0"), 48, y, 22, 62, design.primary);
    text(row.name, 128, y, 21, 570, design.primary);
    text(row.className, width - 48, y, 19, 180, design.secondary, "right");
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, y + 10);
    ctx.lineTo(width - 40, y + 10);
    ctx.stroke();
  });

  if (!rows.length)
    text("Aucune arrivée enregistrée", width / 2, 560, 24, 760, design.primary, "center");
  text("Classement selon l’ordre d’arrivée commun", width / 2, 1025, 16, width - 96, design.primary, "center");
}
