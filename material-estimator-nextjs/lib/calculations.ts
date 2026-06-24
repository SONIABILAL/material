import type {
  DimensionRegister,
  DoorWindowRegister,
  Wall,
  WallRegister,
  WallReview,
} from "./schemas";

export type MaterialAssumptions = {
  bricksPerCubicFoot: number;
  brickWastagePercent: number;
  mortarWetVolumePerCubicFootMasonry: number;
  mortarDryVolumeFactor: number;
  mortarSandParts: number;
  cementBagVolumeCubicFeet: number;
  plasterThicknessInches: number;
  plasterDryVolumeFactor: number;
  plasterSandParts: number;
  plasterWastagePercent: number;
  flooringWastagePercent: number;
};

export const DEFAULT_ASSUMPTIONS: MaterialAssumptions = {
  bricksPerCubicFoot: 14.16,
  brickWastagePercent: 5,
  mortarWetVolumePerCubicFootMasonry: 0.3,
  mortarDryVolumeFactor: 1.33,
  mortarSandParts: 6,
  cementBagVolumeCubicFeet: 1.226,
  plasterThicknessInches: 0.5,
  plasterDryVolumeFactor: 1.33,
  plasterSandParts: 4,
  plasterWastagePercent: 7.5,
  flooringWastagePercent: 7.5,
};

export type WallQuantity = {
  wallId: string;
  floor: string;
  name: string;
  wallType: string;
  orientation: string;
  startLandmark: string;
  endLandmark: string;
  lengthFeet: number;
  thicknessInches: number;
  heightFeet: number;
  grossAreaSquareFeet: number;
  openingAreaSquareFeet: number;
  netAreaSquareFeet: number;
  grossVolumeCubicFeet: number;
  openingVolumeCubicFeet: number;
  netVolumeCubicFeet: number;
  openings: string;
  validationStatus: string;
  source: string;
};

export type RoomArea = {
  floor: string;
  roomId: string;
  roomName: string;
  lengthFeet: number;
  widthFeet: number;
  areaSquareFeet: number;
  areaWithWastageSquareFeet: number;
  evidence: string;
};

export type QuantityResult = {
  confirmedWalls: WallQuantity[];
  excludedWalls: Array<{ wallId: string; floor: string; reason: string }>;
  roomAreas: RoomArea[];
  totals: {
    netMasonryCubicFeet: number;
    bricks: number;
    mortarWetCubicFeet: number;
    mortarDryCubicFeet: number;
    masonryCementBags: number;
    masonrySandCubicFeet: number;
    internalPlasterAreaSquareFeet: number;
    externalPlasterAreaSquareFeet: number;
    plasterWetCubicFeet: number;
    plasterDryCubicFeet: number;
    plasterCementBags: number;
    plasterSandCubicFeet: number;
    floorAreaSquareFeet: number;
    floorAreaWithWastageSquareFeet: number;
  };
};

function feetInchesToFeet(value: Wall["length"]) {
  if (
    value.status !== "printed" ||
    value.feet === null ||
    value.inches === null
  ) {
    return null;
  }
  return value.feet + value.inches / 12;
}

function findWall(registers: WallRegister[], wallId: string) {
  for (const register of registers) {
    const wall = register.walls.find((item) => item.wall_id === wallId);
    if (wall) return wall;
  }
  return null;
}

function openingArea(
  wall: Wall,
  openingRegister: DoorWindowRegister,
): { area: number; description: string; exact: boolean; reason?: string } {
  let area = 0;
  const descriptions: string[] = [];

  for (const opening of wall.openings) {
    const schedule = openingRegister.schedule.find(
      (item) => item.type.trim().toLowerCase() === opening.type.trim().toLowerCase(),
    );
    if (!schedule) {
      return {
        area: 0,
        description: descriptions.join(", "),
        exact: false,
        reason: `Opening ${opening.type} has no schedule entry`,
      };
    }
    const width = feetInchesToFeet(schedule.width);
    const height = feetInchesToFeet(schedule.height);
    if (width === null || height === null) {
      return {
        area: 0,
        description: descriptions.join(", "),
        exact: false,
        reason: `Opening ${opening.type} size is not fully printed`,
      };
    }
    area += width * height * opening.quantity;
    descriptions.push(`${opening.type} × ${opening.quantity}`);
  }

  return { area, description: descriptions.join(", "), exact: true };
}

export function calculateQuantities(args: {
  wallRegisters: WallRegister[];
  reviews: WallReview[];
  dimensions: DimensionRegister[];
  openings: DoorWindowRegister;
  assumptions: MaterialAssumptions;
}): QuantityResult {
  const confirmedWalls: WallQuantity[] = [];
  const excludedWalls: Array<{ wallId: string; floor: string; reason: string }> = [];
  const includeRevised = process.env.INCLUDE_REVISED_WALLS === "true";

  for (const review of args.reviews) {
    for (const item of review.reviewed_walls) {
      let wall = findWall(args.wallRegisters, item.wall_id);
      let validationStatus: string = item.decision;
      if (item.decision === "revise" && includeRevised && item.corrected_wall) {
        wall = item.corrected_wall;
        validationStatus = "revised-and-included";
      }
      if (!wall) {
        excludedWalls.push({
          wallId: item.wall_id,
          floor: review.floor,
          reason: "Wall record not found",
        });
        continue;
      }
      if (item.decision !== "approve" && validationStatus !== "revised-and-included") {
        excludedWalls.push({
          wallId: wall.wall_id,
          floor: wall.floor,
          reason: `${item.decision}: ${item.issues.join("; ")}`,
        });
        continue;
      }
      if (!wall.include_in_masonry) {
        excludedWalls.push({
          wallId: wall.wall_id,
          floor: wall.floor,
          reason: "Marked not included in masonry",
        });
        continue;
      }
      if (wall.requires_review || wall.confidence === "low") {
        excludedWalls.push({
          wallId: wall.wall_id,
          floor: wall.floor,
          reason: "Requires review or low confidence",
        });
        continue;
      }

      const length = feetInchesToFeet(wall.length);
      const thickness = feetInchesToFeet(wall.thickness);
      const height = feetInchesToFeet(wall.height);
      if (length === null || thickness === null || height === null) {
        excludedWalls.push({
          wallId: wall.wall_id,
          floor: wall.floor,
          reason: "Length, thickness, or height is not explicitly printed",
        });
        continue;
      }

      const opening = openingArea(wall, args.openings);
      if (!opening.exact) {
        excludedWalls.push({
          wallId: wall.wall_id,
          floor: wall.floor,
          reason: opening.reason ?? "Opening deduction is unresolved",
        });
        continue;
      }

      const grossArea = length * height;
      if (opening.area > grossArea) {
        excludedWalls.push({
          wallId: wall.wall_id,
          floor: wall.floor,
          reason: "Opening area exceeds gross wall area",
        });
        continue;
      }
      const netArea = grossArea - opening.area;
      const grossVolume = grossArea * thickness;
      const openingVolume = opening.area * thickness;

      confirmedWalls.push({
        wallId: wall.wall_id,
        floor: wall.floor,
        name: wall.wall_name,
        wallType: wall.wall_type,
        orientation: wall.orientation,
        startLandmark: wall.start_landmark,
        endLandmark: wall.end_landmark,
        lengthFeet: length,
        thicknessInches: thickness * 12,
        heightFeet: height,
        grossAreaSquareFeet: grossArea,
        openingAreaSquareFeet: opening.area,
        netAreaSquareFeet: netArea,
        grossVolumeCubicFeet: grossVolume,
        openingVolumeCubicFeet: openingVolume,
        netVolumeCubicFeet: grossVolume - openingVolume,
        openings: opening.description,
        validationStatus,
        source: `${wall.length.source}; ${wall.thickness.source}; ${wall.height.source}`,
      });
    }
  }

  const roomAreas: RoomArea[] = [];
  for (const register of args.dimensions) {
    for (const room of register.rooms) {
      const length =
        room.dimension_1.status === "printed" &&
        room.dimension_1.feet !== null &&
        room.dimension_1.inches !== null
          ? room.dimension_1.feet + room.dimension_1.inches / 12
          : null;
      const width =
        room.dimension_2.status === "printed" &&
        room.dimension_2.feet !== null &&
        room.dimension_2.inches !== null
          ? room.dimension_2.feet + room.dimension_2.inches / 12
          : null;
      if (length === null || width === null) continue;
      const area = length * width;
      roomAreas.push({
        floor: register.floor,
        roomId: room.room_id,
        roomName: room.name,
        lengthFeet: length,
        widthFeet: width,
        areaSquareFeet: area,
        areaWithWastageSquareFeet:
          area * (1 + args.assumptions.flooringWastagePercent / 100),
        evidence: `${room.dimension_1.evidence}; ${room.dimension_2.evidence}`,
      });
    }
  }

  const netMasonry = confirmedWalls.reduce(
    (sum, wall) => sum + wall.netVolumeCubicFeet,
    0,
  );
  const bricks =
    netMasonry *
    args.assumptions.bricksPerCubicFoot *
    (1 + args.assumptions.brickWastagePercent / 100);
  const mortarWet =
    netMasonry * args.assumptions.mortarWetVolumePerCubicFootMasonry;
  const mortarDry = mortarWet * args.assumptions.mortarDryVolumeFactor;
  const mortarTotalParts = 1 + args.assumptions.mortarSandParts;
  const masonryCement =
    mortarDry /
    mortarTotalParts /
    args.assumptions.cementBagVolumeCubicFeet;
  const masonrySand =
    (mortarDry * args.assumptions.mortarSandParts) / mortarTotalParts;

  const internalPlasterArea = confirmedWalls.reduce((sum, wall) => {
    if (wall.wallType === "internal_masonry") return sum + wall.netAreaSquareFeet * 2;
    if (wall.wallType === "external_masonry") return sum + wall.netAreaSquareFeet;
    return sum;
  }, 0);
  const externalPlasterArea = confirmedWalls.reduce((sum, wall) => {
    if (wall.wallType === "external_masonry") return sum + wall.netAreaSquareFeet;
    return sum;
  }, 0);
  const totalPlasterArea = internalPlasterArea + externalPlasterArea;
  const plasterWet =
    totalPlasterArea *
    (args.assumptions.plasterThicknessInches / 12) *
    (1 + args.assumptions.plasterWastagePercent / 100);
  const plasterDry = plasterWet * args.assumptions.plasterDryVolumeFactor;
  const plasterTotalParts = 1 + args.assumptions.plasterSandParts;
  const plasterCement =
    plasterDry /
    plasterTotalParts /
    args.assumptions.cementBagVolumeCubicFeet;
  const plasterSand =
    (plasterDry * args.assumptions.plasterSandParts) / plasterTotalParts;

  const floorArea = roomAreas.reduce((sum, room) => sum + room.areaSquareFeet, 0);
  const floorAreaWithWastage = roomAreas.reduce(
    (sum, room) => sum + room.areaWithWastageSquareFeet,
    0,
  );

  return {
    confirmedWalls,
    excludedWalls,
    roomAreas,
    totals: {
      netMasonryCubicFeet: netMasonry,
      bricks,
      mortarWetCubicFeet: mortarWet,
      mortarDryCubicFeet: mortarDry,
      masonryCementBags: masonryCement,
      masonrySandCubicFeet: masonrySand,
      internalPlasterAreaSquareFeet: internalPlasterArea,
      externalPlasterAreaSquareFeet: externalPlasterArea,
      plasterWetCubicFeet: plasterWet,
      plasterDryCubicFeet: plasterDry,
      plasterCementBags: plasterCement,
      plasterSandCubicFeet: plasterSand,
      floorAreaSquareFeet: floorArea,
      floorAreaWithWastageSquareFeet: floorAreaWithWastage,
    },
  };
}
