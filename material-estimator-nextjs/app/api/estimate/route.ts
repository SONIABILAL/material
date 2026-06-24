import JSZip from "jszip";
import { NextResponse } from "next/server";
import { buildEstimateWorkbook } from "@/lib/excel";
import { DEFAULT_ASSUMPTIONS, type MaterialAssumptions } from "@/lib/calculations";
import { runEstimatorPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 800;

function asNumber(form: FormData, key: keyof MaterialAssumptions) {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") {
    return DEFAULT_ASSUMPTIONS[key];
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid numeric value for ${key}`);
  }
  return value;
}

function safeBaseName(filename: string) {
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "material-estimate";
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  try {
    const form = await request.formData();
    const pdf = form.get("pdf");
    if (!(pdf instanceof File)) {
      return NextResponse.json({ error: "A PDF file is required." }, { status: 400 });
    }
    if (pdf.type !== "application/pdf" && !pdf.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 });
    }

    const maxMb = Number(process.env.MAX_PDF_MB ?? 45);
    if (pdf.size > maxMb * 1024 * 1024) {
      return NextResponse.json(
        { error: `PDF exceeds the configured ${maxMb} MB limit.` },
        { status: 413 },
      );
    }

    const assumptions: MaterialAssumptions = {
      bricksPerCubicFoot: asNumber(form, "bricksPerCubicFoot"),
      brickWastagePercent: asNumber(form, "brickWastagePercent"),
      mortarWetVolumePerCubicFootMasonry: asNumber(
        form,
        "mortarWetVolumePerCubicFootMasonry",
      ),
      mortarDryVolumeFactor: asNumber(form, "mortarDryVolumeFactor"),
      mortarSandParts: asNumber(form, "mortarSandParts"),
      cementBagVolumeCubicFeet: asNumber(form, "cementBagVolumeCubicFeet"),
      plasterThicknessInches: asNumber(form, "plasterThicknessInches"),
      plasterDryVolumeFactor: asNumber(form, "plasterDryVolumeFactor"),
      plasterSandParts: asNumber(form, "plasterSandParts"),
      plasterWastagePercent: asNumber(form, "plasterWastagePercent"),
      flooringWastagePercent: asNumber(form, "flooringWastagePercent"),
    };

    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    const result = await runEstimatorPipeline({
      pdfBuffer,
      filename: pdf.name,
      assumptions,
    });
    const workbook = await buildEstimateWorkbook(result);

    const zip = new JSZip();
    const base = safeBaseName(pdf.name);
    zip.file(`${base}-estimate.xlsx`, workbook);
    zip.file(`${base}-audit.json`, JSON.stringify(result, null, 2));
    zip.file(
      "README.txt",
      [
        "This package contains a conservative drawing-derived estimate.",
        "Only walls approved by the independent validation pass and supported by printed length, thickness, height, and opening dimensions are included in confirmed quantities.",
        "Rejected, unresolved, or incomplete walls remain visible in the workbook and audit JSON but are excluded from confirmed quantities.",
        "RCC, reinforcement, foundations, and excavation are not called exact unless the structural package supplies complete details.",
      ].join("\n\n"),
    );
    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    return new Response(new Uint8Array(archive), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${base}-estimate-package.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Estimate generation failed.",
      },
      { status: 500 },
    );
  }
}
