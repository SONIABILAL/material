import {
  DimensionRegisterSchema,
  DoorWindowRegisterSchema,
  DrawingInventorySchema,
  HeightVerificationSchema,
  StructuralCompletenessSchema,
  WallRegisterSchema,
  WallReviewSchema,
  type DimensionRegister,
  type DoorWindowRegister,
  type DrawingInventory,
  type HeightVerification,
  type StructuralCompleteness,
  type WallRegister,
  type WallReview,
} from "./schemas";
import {
  dimensionPrompt,
  doorWindowPrompt,
  heightVerificationPrompt,
  inventoryPrompt,
  structuralCompletenessPrompt,
  wallRegisterPrompt,
  wallValidationPrompt,
} from "./prompts";
import {
  deleteOpenAIFile,
  parseStructured,
  uploadPdf,
  type ImageInput,
} from "./openai";
import {
  imagesForDrawing,
  imagesForDrawingTypes,
  renderPdfPages,
} from "./pdf-render";
import {
  calculateQuantities,
  DEFAULT_ASSUMPTIONS,
  type MaterialAssumptions,
  type QuantityResult,
} from "./calculations";

export type UsageRecord = {
  step: string;
  model: string;
  responseId: string;
  usage: unknown;
};

export type FloorAnalysis = {
  drawingId: string;
  floor: string;
  dimensions: DimensionRegister;
  heightVerification: HeightVerification;
  walls: WallRegister;
  review: WallReview;
};

export type PipelineResult = {
  generatedAt: string;
  sourceFilename: string;
  inventory: DrawingInventory;
  openings: DoorWindowRegister;
  floors: FloorAnalysis[];
  structural: StructuralCompleteness;
  quantities: QuantityResult;
  assumptions: MaterialAssumptions;
  usage: UsageRecord[];
  warnings: string[];
};

function compact(value: unknown) {
  return JSON.stringify(value);
}

function floorNameFromDrawing(drawing: {
  title: string;
  floor_name: string | null;
}) {
  return drawing.floor_name?.trim() || drawing.title.trim();
}

function appendUsage(
  list: UsageRecord[],
  step: string,
  model: string,
  result: { usage: unknown; responseId: string },
) {
  list.push({ step, model, usage: result.usage, responseId: result.responseId });
}

function mergeImages(...groups: ImageInput[][]) {
  const seen = new Set<string>();
  const merged: ImageInput[] = [];
  for (const group of groups) {
    for (const image of group) {
      if (seen.has(image.label)) continue;
      seen.add(image.label);
      merged.push(image);
    }
  }
  return merged;
}

export async function runEstimatorPipeline(args: {
  pdfBuffer: Buffer;
  filename: string;
  assumptions?: Partial<MaterialAssumptions>;
}): Promise<PipelineResult> {
  const classifierModel = process.env.OPENAI_MODEL_CLASSIFIER ?? "gpt-5.4-mini";
  const extractorModel = process.env.OPENAI_MODEL_EXTRACTOR ?? "gpt-5.5";
  const validatorModel = process.env.OPENAI_MODEL_VALIDATOR ?? "gpt-5.5";
  const usage: UsageRecord[] = [];
  const warnings: string[] = [];
  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...(args.assumptions ?? {}) };

  const uploaded = await uploadPdf(args.pdfBuffer, args.filename);
  try {
    const inventoryResult = await parseStructured({
      schema: DrawingInventorySchema,
      schemaName: "drawing_inventory",
      prompt: inventoryPrompt,
      fileId: uploaded.id,
      model: classifierModel,
    });
    appendUsage(usage, "drawing_inventory", classifierModel, inventoryResult);
    const inventory = inventoryResult.data;

    const renderedPages = await renderPdfPages(args.pdfBuffer);
    if (renderedPages.length < inventory.sheets.length) {
      warnings.push(
        `Only ${renderedPages.length} pages were rendered. Increase MAX_PAGES if the PDF has more sheets.`,
      );
    }

    const floorDrawings = inventory.sheets
      .flatMap((sheet) => sheet.drawings)
      .filter((drawing) =>
        ["floor_plan", "roof_plan", "mumty_plan"].includes(drawing.type),
      );

    if (floorDrawings.length === 0) {
      throw new Error("No floor, roof, or mumty plan was identified in the PDF.");
    }

    const scheduleImages = await imagesForDrawingTypes(
      renderedPages,
      inventory,
      ["schedule"],
      2,
    );
    const planImages = await imagesForDrawingTypes(
      renderedPages,
      inventory,
      ["floor_plan", "roof_plan", "mumty_plan"],
      2,
    );
    const openingResult = await parseStructured({
      schema: DoorWindowRegisterSchema,
      schemaName: "door_window_register",
      prompt: doorWindowPrompt,
      fileId: uploaded.id,
      model: extractorModel,
      images: mergeImages(scheduleImages, planImages),
    });
    appendUsage(usage, "door_window_register", extractorModel, openingResult);
    const openings = openingResult.data;

    const contextImages = await imagesForDrawingTypes(
      renderedPages,
      inventory,
      ["elevation", "section", "notes"],
      3,
    );

    const floors: FloorAnalysis[] = [];
    for (const drawing of floorDrawings) {
      const floor = floorNameFromDrawing(drawing);
      const drawingImages = await imagesForDrawing(
        renderedPages,
        inventory,
        drawing.drawing_id,
      );

      const dimensionsResult = await parseStructured({
        schema: DimensionRegisterSchema,
        schemaName: `dimensions_${drawing.drawing_id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
        prompt: dimensionPrompt(floor),
        fileId: uploaded.id,
        model: extractorModel,
        images: drawingImages,
      });
      appendUsage(
        usage,
        `dimensions:${drawing.drawing_id}`,
        extractorModel,
        dimensionsResult,
      );
      const dimensions = dimensionsResult.data;

      const heightResult = await parseStructured({
        schema: HeightVerificationSchema,
        schemaName: `height_${drawing.drawing_id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
        prompt: heightVerificationPrompt(floor),
        fileId: uploaded.id,
        model: validatorModel,
        images: mergeImages(drawingImages, contextImages),
      });
      appendUsage(
        usage,
        `height_verification:${drawing.drawing_id}`,
        validatorModel,
        heightResult,
      );
      const heightVerification = heightResult.data;

      const floorOpenings = {
        ...openings,
        placements: openings.placements.filter(
          (placement) =>
            placement.floor.toLowerCase().includes(floor.toLowerCase()) ||
            floor.toLowerCase().includes(placement.floor.toLowerCase()),
        ),
      };

      const wallsResult = await parseStructured({
        schema: WallRegisterSchema,
        schemaName: `walls_${drawing.drawing_id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
        prompt: wallRegisterPrompt(
          floor,
          compact(dimensions),
          compact(floorOpenings),
          compact(heightVerification),
        ),
        fileId: uploaded.id,
        model: extractorModel,
        images: drawingImages,
      });
      appendUsage(
        usage,
        `wall_register:${drawing.drawing_id}`,
        extractorModel,
        wallsResult,
      );
      const walls = wallsResult.data;

      const reviewResult = await parseStructured({
        schema: WallReviewSchema,
        schemaName: `wall_review_${drawing.drawing_id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
        prompt: wallValidationPrompt(
          floor,
          compact(dimensions),
          compact(walls),
          compact(floorOpenings),
        ),
        fileId: uploaded.id,
        model: validatorModel,
        images: drawingImages,
      });
      appendUsage(
        usage,
        `wall_review:${drawing.drawing_id}`,
        validatorModel,
        reviewResult,
      );

      floors.push({
        drawingId: drawing.drawing_id,
        floor,
        dimensions,
        heightVerification,
        walls,
        review: reviewResult.data,
      });
    }

    const structuralResult = await parseStructured({
      schema: StructuralCompletenessSchema,
      schemaName: "structural_completeness",
      prompt: structuralCompletenessPrompt,
      fileId: uploaded.id,
      model: validatorModel,
      images: contextImages,
    });
    appendUsage(
      usage,
      "structural_completeness",
      validatorModel,
      structuralResult,
    );
    const structural = structuralResult.data;

    const quantities = calculateQuantities({
      wallRegisters: floors.map((item) => item.walls),
      reviews: floors.map((item) => item.review),
      dimensions: floors.map((item) => item.dimensions),
      openings,
      assumptions,
    });

    if (quantities.excludedWalls.length > 0) {
      warnings.push(
        `${quantities.excludedWalls.length} walls were excluded from confirmed quantities because they were rejected, unresolved, or lacked printed dimensions.`,
      );
    }
    if (!inventory.exact_rcc_takeoff_possible) {
      warnings.push(
        "Exact RCC quantities were not calculated because the drawing package lacks complete structural information.",
      );
    }
    if (!inventory.exact_steel_takeoff_possible) {
      warnings.push(
        "Exact reinforcement quantities were not calculated because a reinforcement design/BBS was not supplied.",
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      sourceFilename: args.filename,
      inventory,
      openings,
      floors,
      structural,
      quantities,
      assumptions,
      usage,
      warnings,
    };
  } finally {
    await deleteOpenAIFile(uploaded.id);
  }
}
