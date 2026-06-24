import ExcelJS from "exceljs";
import type { PipelineResult } from "./pipeline";

const COLORS = {
  navy: "1F4E78",
  blue: "D9EAF7",
  green: "E2F0D9",
  yellow: "FFF2CC",
  red: "FCE4D6",
  white: "FFFFFF",
  gray: "E7E6E6",
};

function title(sheet: ExcelJS.Worksheet, text: string, columns: number) {
  sheet.mergeCells(1, 1, 1, columns);
  const cell = sheet.getCell(1, 1);
  cell.value = text;
  cell.font = { bold: true, color: { argb: COLORS.white }, size: 16 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;
}

function header(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.blue } };
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "808080" } },
      bottom: { style: "thin", color: { argb: "808080" } },
      left: { style: "thin", color: { argb: "808080" } },
      right: { style: "thin", color: { argb: "808080" } },
    };
  });
}

function finishSheet(sheet: ExcelJS.Worksheet, widths?: number[]) {
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 2) {
      row.alignment = { vertical: "top", wrapText: true };
    }
  });
  if (widths) {
    widths.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });
  } else {
    sheet.columns.forEach((column) => {
      column.width = Math.min(Math.max(column.width ?? 12, 12), 40);
    });
  }
  sheet.autoFilter = sheet.rowCount >= 3 ? { from: "A3", to: sheet.getRow(3).getCell(sheet.columnCount).address } : undefined;
}

function fmt(value: number) {
  return Math.round(value * 100) / 100;
}

export async function buildEstimateWorkbook(result: PipelineResult) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Material Estimator";
  workbook.created = new Date(result.generatedAt);

  const summary = workbook.addWorksheet("BOQ Summary");
  title(summary, "Confirmed Material Estimate", 6);
  summary.addRow([]);
  summary.addRow(["Material / Quantity", "Quantity", "Unit", "Status", "Basis", "Warning"]);
  header(summary.getRow(3));
  const t = result.quantities.totals;
  const summaryRows = [
    ["Net brick masonry", fmt(t.netMasonryCubicFeet), "ft³", "Confirmed rows only", "Approved walls minus scheduled openings", "Excluded walls are not included"],
    ["Bricks", Math.ceil(t.bricks), "No.", "Coefficient-based", "Net masonry × bricks/ft³ × wastage", "Verify local brick size"],
    ["Cement for masonry mortar", fmt(t.masonryCementBags), "bags", "Coefficient-based", "Editable 1:N mortar assumptions", "Not structural concrete cement"],
    ["Sand for masonry mortar", fmt(t.masonrySandCubicFeet), "ft³", "Coefficient-based", "Editable mortar assumptions", ""],
    ["Internal plaster area", fmt(t.internalPlasterAreaSquareFeet), "ft²", "Confirmed rows only", "Internal faces based on wall type", ""],
    ["External plaster area", fmt(t.externalPlasterAreaSquareFeet), "ft²", "Confirmed rows only", "External face of external walls", ""],
    ["Cement for plaster", fmt(t.plasterCementBags), "bags", "Coefficient-based", "Editable plaster assumptions", ""],
    ["Sand for plaster", fmt(t.plasterSandCubicFeet), "ft³", "Coefficient-based", "Editable plaster assumptions", ""],
    ["Room floor area", fmt(t.floorAreaSquareFeet), "ft²", "Printed room sizes", "Sum of readable room labels", "Not gross covered area"],
    ["Floor finish incl. wastage", fmt(t.floorAreaWithWastageSquareFeet), "ft²", "Coefficient-based", "Room areas plus wastage", "Check room overlaps and omitted circulation"],
    ["RCC concrete", 0, "m³", "NOT CALCULATED", "Structural details required", "Do not use architectural drawing alone"],
    ["Reinforcement steel", 0, "kg", "NOT CALCULATED", "Reinforcement design/BBS required", "Do not use thumb rules as exact"],
  ];
  summaryRows.forEach((row) => summary.addRow(row));
  result.warnings.forEach((warning) => {
    const row = summary.addRow(["QA warning", "", "", "Review required", "", warning]);
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.yellow } };
  });
  finishSheet(summary, [30, 16, 12, 20, 36, 50]);
  summary.getColumn(2).numFmt = "#,##0.00";

  const drawingSheet = workbook.addWorksheet("Drawing Register");
  title(drawingSheet, "Drawing Register", 10);
  drawingSheet.addRow([]);
  drawingSheet.addRow(["Page", "Drawing ID", "Title", "Type", "Floor", "Scale", "Location", "Crop L/T/R/B %", "Includes dimensions", "Notes"]);
  header(drawingSheet.getRow(3));
  for (const sheet of result.inventory.sheets) {
    for (const drawing of sheet.drawings) {
      drawingSheet.addRow([
        sheet.page,
        drawing.drawing_id,
        drawing.title,
        drawing.type,
        drawing.floor_name ?? "",
        drawing.scale ?? "",
        drawing.location_on_page,
        `${drawing.crop.left_percent}/${drawing.crop.top_percent}/${drawing.crop.right_percent}/${drawing.crop.bottom_percent}`,
        drawing.crop.includes_external_dimension_chains ? "Yes" : "No",
        drawing.notes,
      ]);
    }
  }
  finishSheet(drawingSheet, [8, 14, 30, 18, 18, 12, 22, 18, 18, 45]);

  const dimensionSheet = workbook.addWorksheet("Printed Dimensions");
  title(dimensionSheet, "Printed Dimension Register", 12);
  dimensionSheet.addRow([]);
  dimensionSheet.addRow(["Floor", "Drawing", "Category", "ID / Chain", "Side", "Sequence", "Printed value", "Feet", "Inches", "Start reference", "End reference", "Evidence / Note"]);
  header(dimensionSheet.getRow(3));
  for (const floor of result.floors) {
    for (const overall of floor.dimensions.overall_dimensions) {
      dimensionSheet.addRow([
        floor.floor, floor.drawingId, "Overall", overall.id, overall.side, "",
        overall.value.printed_value ?? "", overall.value.feet, overall.value.inches,
        overall.start_reference, overall.end_reference,
        `${overall.value.evidence}; ${overall.measurement_type}`,
      ]);
    }
    for (const chain of floor.dimensions.dimension_chains) {
      for (const segment of chain.segments) {
        dimensionSheet.addRow([
          floor.floor, floor.drawingId, "Dimension chain", chain.chain_id, chain.side,
          segment.sequence, segment.printed_value, segment.feet, segment.inches,
          segment.start_reference, segment.end_reference,
          `${segment.evidence}; ${segment.segment_type}; nearest ${segment.nearest_space}`,
        ]);
      }
    }
    for (const item of floor.dimensions.wall_thickness_labels) {
      dimensionSheet.addRow([
        floor.floor, floor.drawingId, "Wall thickness", item.location, "", "",
        item.printed_value, 0, item.thickness_inches, "", "", item.evidence,
      ]);
    }
  }
  finishSheet(dimensionSheet, [16, 14, 18, 18, 10, 10, 15, 10, 10, 34, 34, 55]);

  const roomSheet = workbook.addWorksheet("Room Areas");
  title(roomSheet, "Room Dimensions and Floor Areas", 9);
  roomSheet.addRow([]);
  roomSheet.addRow(["Floor", "Room ID", "Room", "Length ft", "Width ft", "Area ft²", "Area incl. waste ft²", "Status", "Evidence"]);
  header(roomSheet.getRow(3));
  for (const room of result.quantities.roomAreas) {
    roomSheet.addRow([
      room.floor, room.roomId, room.roomName, fmt(room.lengthFeet), fmt(room.widthFeet),
      fmt(room.areaSquareFeet), fmt(room.areaWithWastageSquareFeet), "Printed dimensions", room.evidence,
    ]);
  }
  finishSheet(roomSheet, [18, 14, 26, 12, 12, 14, 18, 18, 55]);
  [4, 5, 6, 7].forEach((column) => (roomSheet.getColumn(column).numFmt = "#,##0.00"));

  const openingSheet = workbook.addWorksheet("Door-Window Schedule");
  title(openingSheet, "Door and Window Schedule", 12);
  openingSheet.addRow([]);
  openingSheet.addRow(["Type", "Category", "Width", "Height", "Sill", "Material", "Remarks", "Confidence", "Floor", "Placement", "Nearest room", "Evidence"]);
  header(openingSheet.getRow(3));
  for (const schedule of result.openings.schedule) {
    const placements = result.openings.placements.filter((p) => p.type === schedule.type);
    if (placements.length === 0) {
      openingSheet.addRow([
        schedule.type, schedule.category, schedule.width.printed_value ?? "", schedule.height.printed_value ?? "",
        schedule.sill_height.printed_value ?? "", schedule.material, schedule.remarks, schedule.confidence,
        "", "", "", schedule.evidence,
      ]);
    } else {
      for (const placement of placements) {
        openingSheet.addRow([
          schedule.type, schedule.category, schedule.width.printed_value ?? "", schedule.height.printed_value ?? "",
          schedule.sill_height.printed_value ?? "", schedule.material, schedule.remarks, schedule.confidence,
          placement.floor, `${placement.opening_location} × ${placement.quantity}`, placement.nearest_room,
          `${schedule.evidence}; ${placement.evidence}`,
        ]);
      }
    }
  }
  finishSheet(openingSheet, [10, 12, 14, 14, 14, 20, 28, 12, 16, 24, 24, 55]);

  for (const floor of result.floors) {
    const safeName = `${floor.floor.slice(0, 20)} Walls`.replace(/[\\/?*\[\]:]/g, "-");
    const wallSheet = workbook.addWorksheet(safeName.slice(0, 31));
    title(wallSheet, `${floor.floor} – Proposed Wall Register`, 18);
    wallSheet.addRow([]);
    wallSheet.addRow(["Wall ID", "Name", "Type", "Orientation", "Start", "End", "Geometry", "Length", "Thickness", "Height", "Openings", "Include", "Review required", "Confidence", "Validator decision", "Validator issues", "Length evidence", "Notes"]);
    header(wallSheet.getRow(3));
    for (const wall of floor.walls.walls) {
      const review = floor.review.reviewed_walls.find((item) => item.wall_id === wall.wall_id);
      wallSheet.addRow([
        wall.wall_id, wall.wall_name, wall.wall_type, wall.orientation, wall.start_landmark,
        wall.end_landmark, wall.geometry, wall.length.printed_value ?? wall.length.status,
        wall.thickness.printed_value ?? wall.thickness.status, wall.height.printed_value ?? wall.height.status,
        wall.openings.map((o) => `${o.type} × ${o.quantity}`).join(", "),
        wall.include_in_masonry ? "Yes" : "No", wall.requires_review ? "Yes" : "No",
        wall.confidence, review?.decision ?? "not reviewed", review?.issues.join("; ") ?? "",
        wall.length.evidence, wall.notes,
      ]);
    }
    finishSheet(wallSheet, [12, 38, 20, 12, 34, 34, 14, 14, 14, 14, 18, 10, 14, 12, 16, 45, 50, 45]);
  }

  const confirmedSheet = workbook.addWorksheet("Confirmed Wall Quantities");
  title(confirmedSheet, "Confirmed Wall Quantities", 20);
  confirmedSheet.addRow([]);
  confirmedSheet.addRow(["Wall ID", "Floor", "Wall", "Type", "Orientation", "Start", "End", "Length ft", "Thickness in", "Height ft", "Gross area ft²", "Opening area ft²", "Net area ft²", "Gross vol ft³", "Opening vol ft³", "Net vol ft³", "Openings", "Validation", "Sources", "Status"]);
  header(confirmedSheet.getRow(3));
  for (const wall of result.quantities.confirmedWalls) {
    confirmedSheet.addRow([
      wall.wallId, wall.floor, wall.name, wall.wallType, wall.orientation, wall.startLandmark,
      wall.endLandmark, fmt(wall.lengthFeet), fmt(wall.thicknessInches), fmt(wall.heightFeet),
      fmt(wall.grossAreaSquareFeet), fmt(wall.openingAreaSquareFeet), fmt(wall.netAreaSquareFeet),
      fmt(wall.grossVolumeCubicFeet), fmt(wall.openingVolumeCubicFeet), fmt(wall.netVolumeCubicFeet),
      wall.openings, wall.validationStatus, wall.source, "Included",
    ]);
  }
  finishSheet(confirmedSheet, [12, 16, 38, 20, 12, 32, 32, 12, 12, 12, 14, 14, 14, 14, 14, 14, 18, 16, 50, 12]);
  for (let i = 8; i <= 16; i += 1) confirmedSheet.getColumn(i).numFmt = "#,##0.00";

  const excludedSheet = workbook.addWorksheet("Rejected-Unresolved");
  title(excludedSheet, "Rejected and Unresolved Walls", 4);
  excludedSheet.addRow([]);
  excludedSheet.addRow(["Wall ID", "Floor", "Reason", "Action"]);
  header(excludedSheet.getRow(3));
  for (const wall of result.quantities.excludedWalls) {
    excludedSheet.addRow([wall.wallId, wall.floor, wall.reason, "Review drawing or obtain missing detail"]);
  }
  finishSheet(excludedSheet, [14, 18, 70, 38]);

  const assumptionSheet = workbook.addWorksheet("Assumptions");
  title(assumptionSheet, "Editable Material Coefficients", 4);
  assumptionSheet.addRow([]);
  assumptionSheet.addRow(["Parameter", "Value", "Unit", "Warning"]);
  header(assumptionSheet.getRow(3));
  const assumptions = result.assumptions;
  const assumptionRows = [
    ["Bricks per cubic foot", assumptions.bricksPerCubicFoot, "No./ft³", "Verify local brick dimensions and joints"],
    ["Brick wastage", assumptions.brickWastagePercent, "%", ""],
    ["Mortar wet volume per ft³ masonry", assumptions.mortarWetVolumePerCubicFootMasonry, "ft³/ft³", "Coefficient, not drawing-derived"],
    ["Mortar dry factor", assumptions.mortarDryVolumeFactor, "factor", "Coefficient"],
    ["Mortar sand parts", assumptions.mortarSandParts, "parts to 1 cement", ""],
    ["Cement bag volume", assumptions.cementBagVolumeCubicFeet, "ft³/bag", "50 kg bag approximation"],
    ["Plaster thickness", assumptions.plasterThicknessInches, "in", "Not drawing-derived unless specified"],
    ["Plaster dry factor", assumptions.plasterDryVolumeFactor, "factor", "Coefficient"],
    ["Plaster sand parts", assumptions.plasterSandParts, "parts to 1 cement", ""],
    ["Plaster wastage", assumptions.plasterWastagePercent, "%", ""],
    ["Flooring wastage", assumptions.flooringWastagePercent, "%", ""],
  ];
  assumptionRows.forEach((row) => assumptionSheet.addRow(row));
  assumptionSheet.getColumn(2).numFmt = "0.000";
  finishSheet(assumptionSheet, [38, 16, 20, 55]);

  const structuralSheet = workbook.addWorksheet("Structural QA");
  title(structuralSheet, "Structural Completeness Check", 7);
  structuralSheet.addRow([]);
  structuralSheet.addRow(["Element", "Geometry", "Size/Thickness", "Reinforcement", "Exact possible", "Missing information", "Evidence"]);
  header(structuralSheet.getRow(3));
  for (const item of result.structural.elements) {
    structuralSheet.addRow([
      item.element,
      item.geometry_available ? "Yes" : "No",
      item.thickness_or_size_available ? "Yes" : "No",
      item.reinforcement_available ? "Yes" : "No",
      item.exact_quantity_possible ? "Yes" : "No",
      item.missing_information.join("; "),
      item.evidence,
    ]);
  }
  finishSheet(structuralSheet, [25, 12, 16, 16, 14, 55, 55]);

  const usageSheet = workbook.addWorksheet("API Audit");
  title(usageSheet, "API Call Audit", 5);
  usageSheet.addRow([]);
  usageSheet.addRow(["Step", "Model", "Response ID", "Input tokens", "Output tokens"]);
  header(usageSheet.getRow(3));
  for (const item of result.usage) {
    const usage = item.usage as { input_tokens?: number; output_tokens?: number } | null;
    usageSheet.addRow([
      item.step,
      item.model,
      item.responseId,
      usage?.input_tokens ?? "",
      usage?.output_tokens ?? "",
    ]);
  }
  finishSheet(usageSheet, [34, 18, 42, 16, 16]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
