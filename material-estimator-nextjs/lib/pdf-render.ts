import sharp from "sharp";
import type { DrawingInventory } from "./schemas";

export type RenderedPage = {
  pageNumber: number;
  width: number;
  height: number;
  png: Buffer;
};

export type RegionImage = {
  label: string;
  buffer: Buffer;
};

async function loadPdfJs() {
  const canvas = await import("@napi-rs/canvas");
  Object.assign(globalThis, {
    DOMMatrix: canvas.DOMMatrix,
    ImageData: canvas.ImageData,
    Path2D: canvas.Path2D,
  });
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

export async function renderPdfPages(pdfBuffer: Buffer): Promise<RenderedPage[]> {
  const pdfjs = await loadPdfJs();
  const { createCanvas } = await import("@napi-rs/canvas");
  const scale = Number(process.env.PDF_RENDER_SCALE ?? 3.5);
  const maxPages = Number(process.env.MAX_PAGES ?? 12);

  const task = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableFontFace: false,
  });
  const pdf = await task.promise;
  const pages: RenderedPage[] = [];

  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, maxPages); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");

    await page.render({
      canvas: canvas as never,
      canvasContext: context as never,
      viewport,
    }).promise;

    pages.push({
      pageNumber,
      width: canvas.width,
      height: canvas.height,
      png: canvas.toBuffer("image/png"),
    });
  }

  await task.destroy();
  return pages;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function tileImage(buffer: Buffer, label: string, columns = 2, rows = 2) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) return [{ label, buffer }];

  const overlap = 0.12;
  const tileWidth = metadata.width / columns;
  const tileHeight = metadata.height / rows;
  const tiles: RegionImage[] = [{ label: `${label}-full`, buffer }];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const left = clamp(Math.floor(col * tileWidth - tileWidth * overlap), 0, metadata.width - 1);
      const top = clamp(Math.floor(row * tileHeight - tileHeight * overlap), 0, metadata.height - 1);
      const right = clamp(
        Math.ceil((col + 1) * tileWidth + tileWidth * overlap),
        left + 1,
        metadata.width,
      );
      const bottom = clamp(
        Math.ceil((row + 1) * tileHeight + tileHeight * overlap),
        top + 1,
        metadata.height,
      );

      const tile = await sharp(buffer)
        .extract({ left, top, width: right - left, height: bottom - top })
        .png()
        .toBuffer();
      tiles.push({ label: `${label}-r${row + 1}c${col + 1}`, buffer: tile });
    }
  }
  return tiles;
}

export async function cropDrawing(
  page: RenderedPage,
  crop: {
    left_percent: number;
    top_percent: number;
    right_percent: number;
    bottom_percent: number;
  },
  label: string,
): Promise<RegionImage[]> {
  const leftPercent = clamp(crop.left_percent, 0, 99);
  const topPercent = clamp(crop.top_percent, 0, 99);
  const rightPercent = clamp(crop.right_percent, leftPercent + 1, 100);
  const bottomPercent = clamp(crop.bottom_percent, topPercent + 1, 100);

  const left = Math.floor((leftPercent / 100) * page.width);
  const top = Math.floor((topPercent / 100) * page.height);
  const right = Math.ceil((rightPercent / 100) * page.width);
  const bottom = Math.ceil((bottomPercent / 100) * page.height);

  const region = await sharp(page.png)
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();

  return tileImage(region, label, 2, 2);
}

export async function imagesForDrawing(
  pages: RenderedPage[],
  inventory: DrawingInventory,
  drawingId: string,
) {
  for (const sheet of inventory.sheets) {
    const drawing = sheet.drawings.find((item) => item.drawing_id === drawingId);
    if (!drawing) continue;
    const page = pages.find((item) => item.pageNumber === sheet.page);
    if (!page) return [];
    return cropDrawing(page, drawing.crop, drawing.drawing_id);
  }
  return [];
}

export async function imagesForDrawingTypes(
  pages: RenderedPage[],
  inventory: DrawingInventory,
  types: string[],
  maxDrawings = 4,
) {
  const images: RegionImage[] = [];
  let count = 0;
  for (const sheet of inventory.sheets) {
    for (const drawing of sheet.drawings) {
      if (!types.includes(drawing.type) || count >= maxDrawings) continue;
      const page = pages.find((item) => item.pageNumber === sheet.page);
      if (!page) continue;
      const region = await cropDrawing(page, drawing.crop, drawing.drawing_id);
      images.push(...region);
      count += 1;
    }
  }
  return images;
}
