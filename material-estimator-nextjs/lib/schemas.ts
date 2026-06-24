import { z } from "zod";

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export const ValueStatusSchema = z.enum([
  "printed",
  "missing",
  "unreadable",
  "conflicting",
]);

export const FeetInchesSchema = z.object({
  status: ValueStatusSchema,
  printed_value: z.string().nullable(),
  feet: z.number().nullable(),
  inches: z.number().nullable(),
  source: z.string(),
  evidence: z.string(),
  confidence: ConfidenceSchema,
});

export const DrawingCropSchema = z.object({
  left_percent: z.number(),
  top_percent: z.number(),
  right_percent: z.number(),
  bottom_percent: z.number(),
  includes_external_dimension_chains: z.boolean(),
});

export const DrawingSchema = z.object({
  drawing_id: z.string(),
  title: z.string(),
  type: z.enum([
    "floor_plan",
    "roof_plan",
    "mumty_plan",
    "elevation",
    "section",
    "site_plan",
    "schedule",
    "notes",
    "area_statement",
    "structural_detail",
    "other",
  ]),
  floor_name: z.string().nullable(),
  scale: z.string().nullable(),
  location_on_page: z.string(),
  crop: DrawingCropSchema,
  notes: z.string(),
});

export const DrawingInventorySchema = z.object({
  project: z.object({
    title: z.string(),
    plot_number: z.string().nullable(),
    location: z.string().nullable(),
  }),
  sheets: z.array(
    z.object({
      page: z.number(),
      sheet_title: z.string(),
      drawings: z.array(DrawingSchema),
    }),
  ),
  floors_detected: z.array(z.string()),
  elevations_detected: z.array(z.string()),
  sections_detected: z.array(z.string()),
  schedules_detected: z.array(z.string()),
  structural_drawings_detected: z.array(z.string()),
  architectural_masonry_takeoff_possible: z.boolean(),
  exact_rcc_takeoff_possible: z.boolean(),
  exact_steel_takeoff_possible: z.boolean(),
  exact_foundation_takeoff_possible: z.boolean(),
  missing_drawings_for_exact_boq: z.array(z.string()),
  general_notes: z.array(z.string()),
});

export const DimensionSegmentSchema = z.object({
  sequence: z.number(),
  printed_value: z.string(),
  feet: z.number().nullable(),
  inches: z.number().nullable(),
  start_reference: z.string(),
  end_reference: z.string(),
  nearest_space: z.string(),
  segment_type: z.enum([
    "clear_space",
    "wall_thickness",
    "overall",
    "projection",
    "centreline",
    "unknown",
  ]),
  evidence: z.string(),
  confidence: ConfidenceSchema,
});

export const RoomDimensionSchema = z.object({
  status: ValueStatusSchema,
  printed_value: z.string().nullable(),
  feet: z.number().nullable(),
  inches: z.number().nullable(),
  orientation: z.string(),
  evidence: z.string(),
  confidence: ConfidenceSchema,
});

export const DimensionRegisterSchema = z.object({
  floor: z.string(),
  drawing_id: z.string(),
  overall_dimensions: z.array(
    z.object({
      id: z.string(),
      side: z.string(),
      value: FeetInchesSchema,
      start_reference: z.string(),
      end_reference: z.string(),
      measurement_type: z.string(),
    }),
  ),
  dimension_chains: z.array(
    z.object({
      chain_id: z.string(),
      side: z.enum(["top", "right", "bottom", "left", "internal", "other"]),
      reading_direction: z.string(),
      segments: z.array(DimensionSegmentSchema),
      printed_total: z.string().nullable(),
      evidence: z.string(),
    }),
  ),
  rooms: z.array(
    z.object({
      room_id: z.string(),
      name: z.string(),
      nearest_location: z.string(),
      dimension_1: RoomDimensionSchema,
      dimension_2: RoomDimensionSchema,
      notes: z.string(),
    }),
  ),
  wall_thickness_labels: z.array(
    z.object({
      location: z.string(),
      thickness_inches: z.number().nullable(),
      printed_value: z.string(),
      evidence: z.string(),
      confidence: ConfidenceSchema,
    }),
  ),
  height_labels: z.array(
    z.object({
      location: z.string(),
      value: FeetInchesSchema,
      actual_meaning: z.string(),
      can_be_used_as_wall_height: z.boolean(),
    }),
  ),
  levels: z.array(
    z.object({
      location: z.string(),
      printed_value: z.string(),
      meaning: z.string(),
      evidence: z.string(),
    }),
  ),
  stair_dimensions: z.array(
    z.object({
      item: z.string(),
      value: FeetInchesSchema,
    }),
  ),
  column_sizes: z.array(
    z.object({
      location: z.string(),
      width: FeetInchesSchema,
      depth: FeetInchesSchema,
    }),
  ),
  slab_thicknesses: z.array(
    z.object({
      location: z.string(),
      value: FeetInchesSchema,
    }),
  ),
  parapet_and_railing_heights: z.array(
    z.object({
      location: z.string(),
      type: z.string(),
      value: FeetInchesSchema,
    }),
  ),
  unreadable_values: z.array(z.string()),
  conflicts: z.array(z.string()),
  missing_values: z.array(z.string()),
});

export const OpeningScheduleItemSchema = z.object({
  type: z.string(),
  category: z.enum(["door", "window", "other"]),
  width: FeetInchesSchema,
  height: FeetInchesSchema,
  sill_height: FeetInchesSchema,
  material: z.string(),
  remarks: z.string(),
  evidence: z.string(),
  confidence: ConfidenceSchema,
});

export const OpeningPlacementSchema = z.object({
  placement_id: z.string(),
  floor: z.string(),
  type: z.string(),
  quantity: z.number(),
  nearest_room: z.string(),
  wall_orientation: z.string(),
  opening_location: z.string(),
  evidence: z.string(),
  confidence: ConfidenceSchema,
});

export const DoorWindowRegisterSchema = z.object({
  schedule: z.array(OpeningScheduleItemSchema),
  placements: z.array(OpeningPlacementSchema),
  unmapped_symbols: z.array(z.string()),
  schedule_conflicts: z.array(z.string()),
  unreadable_items: z.array(z.string()),
});

export const WallOpeningSchema = z.object({
  placement_id: z.string().nullable(),
  type: z.string(),
  quantity: z.number(),
  evidence: z.string(),
});

export const WallSchema = z.object({
  wall_id: z.string(),
  floor: z.string(),
  nearest_label: z.string(),
  wall_name: z.string(),
  orientation: z.string(),
  start_landmark: z.string(),
  end_landmark: z.string(),
  geometry: z.enum(["continuous", "stepped", "partial", "return", "curved", "unknown"]),
  wall_type: z.enum([
    "external_masonry",
    "internal_masonry",
    "parapet",
    "boundary_wall",
    "rcc_wall",
    "tank_wall",
    "other",
  ]),
  length: FeetInchesSchema,
  thickness: FeetInchesSchema,
  height: FeetInchesSchema,
  openings: z.array(WallOpeningSchema),
  shared_with: z.string().nullable(),
  include_in_masonry: z.boolean(),
  requires_review: z.boolean(),
  confidence: ConfidenceSchema,
  notes: z.string(),
});

export const WallRegisterSchema = z.object({
  floor: z.string(),
  walls: z.array(WallSchema),
  excluded_lines: z.array(
    z.object({
      location: z.string(),
      reason: z.string(),
      evidence: z.string(),
    }),
  ),
  walls_missing_length: z.array(z.string()),
  walls_missing_thickness: z.array(z.string()),
  walls_missing_height: z.array(z.string()),
  wall_conflicts: z.array(z.string()),
  summary: z.object({
    visible_wall_segments: z.number(),
    complete_wall_segments: z.number(),
    unresolved_wall_segments: z.number(),
  }),
});

export const HeightVerificationSchema = z.object({
  floor_or_structure: z.string(),
  plan_dimensions: z.array(
    z.object({
      name: z.string(),
      value: FeetInchesSchema,
    }),
  ),
  wall_thicknesses: z.array(
    z.object({
      orientation: z.string(),
      value: FeetInchesSchema,
    }),
  ),
  vertical_dimensions: z.array(
    z.object({
      printed_value: z.string(),
      start_reference: z.string(),
      end_reference: z.string(),
      actual_meaning: z.string(),
      can_be_used_as_wall_height: z.boolean(),
      evidence: z.string(),
      confidence: ConfidenceSchema,
    }),
  ),
  confirmed_wall_height: FeetInchesSchema,
  conflicts: z.array(z.string()),
  required_clarifications: z.array(z.string()),
});

export const WallReviewSchema = z.object({
  floor: z.string(),
  reviewed_walls: z.array(
    z.object({
      wall_id: z.string(),
      decision: z.enum(["approve", "reject", "revise", "manual_review"]),
      issues: z.array(z.string()),
      corrected_wall: WallSchema.nullable(),
      visible_evidence: z.string(),
      confidence: ConfidenceSchema,
    }),
  ),
  missing_walls: z.array(WallSchema),
  duplicate_walls: z.array(z.string()),
  false_walls: z.array(z.string()),
  incorrect_room_dimension_usage: z.array(z.string()),
  unresolved_items: z.array(z.string()),
  approval_summary: z.object({
    approved: z.number(),
    rejected: z.number(),
    revised: z.number(),
    manual_review: z.number(),
  }),
});

export const StructuralCompletenessSchema = z.object({
  elements: z.array(
    z.object({
      element: z.string(),
      geometry_available: z.boolean(),
      thickness_or_size_available: z.boolean(),
      reinforcement_available: z.boolean(),
      exact_quantity_possible: z.boolean(),
      missing_information: z.array(z.string()),
      evidence: z.string(),
    }),
  ),
  exact_architectural_quantities_possible: z.array(z.string()),
  exact_structural_quantities_possible: z.array(z.string()),
  provisional_only_quantities: z.array(z.string()),
  do_not_calculate: z.array(z.string()),
});

export type DrawingInventory = z.infer<typeof DrawingInventorySchema>;
export type DimensionRegister = z.infer<typeof DimensionRegisterSchema>;
export type DoorWindowRegister = z.infer<typeof DoorWindowRegisterSchema>;
export type Wall = z.infer<typeof WallSchema>;
export type WallRegister = z.infer<typeof WallRegisterSchema>;
export type WallReview = z.infer<typeof WallReviewSchema>;
export type HeightVerification = z.infer<typeof HeightVerificationSchema>;
export type StructuralCompleteness = z.infer<typeof StructuralCompletenessSchema>;
