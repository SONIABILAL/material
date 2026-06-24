# Material Estimator – Next.js staged drawing pipeline

A working Next.js starter for uploading a construction PDF, extracting drawing data floor by floor, validating every proposed wall in a second model pass, calculating only confirmed masonry/finish quantities in deterministic TypeScript, and downloading an Excel + JSON audit package.

## What the pipeline does

1. Uploads the PDF to OpenAI Files with `purpose: user_data`.
2. Inventories every plan, section, elevation, schedule, and notes region.
3. Renders the PDF locally at high resolution and creates overlapping image crops.
4. Extracts external dimension chains and room dimensions separately for each floor.
5. Extracts the door/window schedule and placements.
6. Verifies floor/mumty heights against plans, elevations, and sections.
7. Builds a unique wall register for each floor.
8. Runs an independent validation pass to reject false, duplicated, unsupported, or guessed walls.
9. Calculates quantities in TypeScript, not in the model.
10. Generates a ZIP containing:
   - Excel estimate
   - complete audit JSON
   - warning README

## Important behavior

The tool is deliberately conservative. A wall is included in confirmed quantities only when:

- the validator approves it,
- a real wall line exists,
- length, thickness, and height are explicitly printed,
- opening sizes are present in the schedule,
- the wall is not marked for manual review.

Structural concrete, foundations, and reinforcement are not calculated as exact unless the structural package is complete. This is intentional.

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Add your OpenAI API key to `.env.local`.

Open `http://localhost:3000`, select a PDF, optionally edit material coefficients, and generate the estimate package.

## Environment variables

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL_CLASSIFIER=gpt-5.4-mini
OPENAI_MODEL_EXTRACTOR=gpt-5.5
OPENAI_MODEL_VALIDATOR=gpt-5.5
OPENAI_REASONING_EFFORT=high
MAX_PDF_MB=45
MAX_PAGES=12
PDF_RENDER_SCALE=3.5
MAX_IMAGES_PER_CALL=10
INCLUDE_REVISED_WALLS=false
```

`INCLUDE_REVISED_WALLS=false` is the safer default. A validator-revised wall stays excluded until a human approves it.

## Deployment warning

The included API route runs the full pipeline synchronously. It is appropriate for local use, a long-running Node server, or a platform plan that supports long request durations.

For production SaaS deployment, do not rely on one long Vercel request. Replace the synchronous route with:

- direct upload to object storage,
- a durable background job queue,
- persisted job status,
- worker retries per stage,
- human review before final issue.

The extraction functions in `lib/pipeline.ts` can be moved into Trigger.dev, Inngest, BullMQ, AWS SQS/Lambda, or another worker without changing schemas/calculation logic.

## Main files

- `app/api/estimate/route.ts` – upload endpoint and ZIP response
- `lib/pipeline.ts` – staged orchestration
- `lib/prompts.ts` – strict drawing-reading prompts
- `lib/schemas.ts` – Zod structured-output contracts
- `lib/pdf-render.ts` – PDF render, crop, and overlapping tiles
- `lib/calculations.ts` – deterministic quantity engine
- `lib/excel.ts` – Excel workbook generator

## Production upgrades you should add

- authentication and per-user authorization,
- private object storage,
- database records for jobs and extracted walls,
- wall-review UI showing the crop and evidence beside every wall,
- user approval/rejection before final BOQ,
- idempotency and retry tracking,
- rate limiting and spend limits,
- model usage/cost logging,
- test fixtures and regression evaluation against engineer-approved drawings.

## Accuracy reality

This code creates a serious extraction pipeline, not an infallible estimator. Dense, low-resolution, conflicting, or incomplete drawings still require human review. The correct commercial promise is “auditable AI-assisted take-off,” not “guaranteed exact estimate from any PDF.”
