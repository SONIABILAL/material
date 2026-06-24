import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { GLOBAL_SYSTEM_PROMPT } from "./prompts";

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAI({ apiKey });
}

export async function uploadPdf(buffer: Buffer, filename: string) {
  return getOpenAI().files.create({
    file: await toFile(buffer, filename, { type: "application/pdf" }),
    purpose: "user_data",
  });
}

export async function deleteOpenAIFile(fileId: string) {
  try {
    await getOpenAI().files.delete(fileId);
  } catch (error) {
    console.warn("Failed to delete OpenAI file", fileId, error);
  }
}

export type ImageInput = {
  label: string;
  buffer: Buffer;
};

export async function parseStructured<T extends z.ZodTypeAny>(args: {
  schema: T;
  schemaName: string;
  prompt: string;
  fileId: string;
  model: string;
  images?: ImageInput[];
}) {
  const maxImages = Number(process.env.MAX_IMAGES_PER_CALL ?? 10);
  const imageInputs = (args.images ?? []).slice(0, maxImages).map((image) => ({
    type: "input_image" as const,
    image_url: `data:image/png;base64,${image.buffer.toString("base64")}`,
    detail: "original" as const,
  }));

  const response = await getOpenAI().responses.parse({
    model: args.model,
    reasoning: {
      effort: (process.env.OPENAI_REASONING_EFFORT ?? "high") as
        | "none"
        | "minimal"
        | "low"
        | "medium"
        | "high"
        | "xhigh",
    },
    input: [
      {
        role: "system",
        content: GLOBAL_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: args.prompt },
          { type: "input_file", file_id: args.fileId },
          ...imageInputs,
        ],
      },
    ],
    text: {
      format: zodTextFormat(args.schema, args.schemaName),
    },
    max_output_tokens: 50000,
  });

  if (!response.output_parsed) {
    throw new Error(`No parsed output returned for ${args.schemaName}`);
  }

  return {
    data: response.output_parsed as z.infer<T>,
    usage: response.usage,
    responseId: response.id,
  };
}
