import { deepSeek } from "@ai-sdk/deepseek";
import { generateText, Output } from "ai";
import { z } from "zod";

const timeSchema = z.object({
  found: z
    .boolean()
    .describe(
      "True only when the message mentions BOTH a specific clock time and a timezone for that time",
    ),
  hour: z.number().min(0).max(23).optional().describe("The hour of the time in 24-hour format"),
  minute: z.number().min(0).max(59).optional().describe("The minute of the time, 0 if unspecified"),
  utcOffset: z
    .number()
    .optional()
    .describe(
      "The UTC offset in hours of the timezone the time is expressed in, e.g. -5 for EST, 9 for JST, 5.5 for IST",
    ),
});

export type ExtractedTime = {
  hour: number;
  minute: number;
  utcOffset: number;
};

export const extractTime = async (message: string): Promise<ExtractedTime | null> => {
  const result = await generateText({
    model: deepSeek("deepseek-v4-flash"),
    output: Output.object({ schema: timeSchema }),
    prompt: `Extract a clock time and its timezone from the following message. Only set "found" to true if BOTH a specific time of day AND a timezone (name, abbreviation, or offset) are present. Convert the timezone to a UTC offset in hours.\n\nMessage:\n${message}`,
  });

  const out = result.output;
  if (!out.found || out.hour === undefined || out.utcOffset === undefined) {
    return null;
  }

  return {
    hour: out.hour,
    minute: out.minute ?? 0,
    utcOffset: out.utcOffset,
  };
};
