import * as Sentry from "@sentry/bun";
import { createMessageCommand } from "@/lib/command-builder";
import { collectImageSources, convertImageToGif } from "@/lib/gif";

export const convertToGif = createMessageCommand(
  { name: "Convert to GIF", cooldown: 15, premiumCooldown: 5 },
  async (interaction) => {
    await interaction.deferReply({ flags: "Ephemeral" });

    const message = interaction.targetMessage;
    const sources = collectImageSources(message);

    if (sources.length === 0) {
      return interaction.editReply({ content: "I couldn't find an image on that message." });
    }

    const started = Date.now();
    const results = await Promise.allSettled(
      sources.map((source, index) =>
        convertImageToGif(interaction.user.id, source, started + index),
      ),
    );

    const urls: string[] = [];
    const failures: Array<{ index: number; reason: unknown }> = [];

    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") urls.push(result.value);
      else failures.push({ index, reason: result.reason });
    }

    if (urls.length === 0) throw failures[0]?.reason;

    for (const failure of failures) {
      Sentry.captureException(failure.reason, {
        tags: { source: "convertToGif" },
        extra: {
          url: sources[failure.index]?.url,
          userId: interaction.user.id,
          messageId: message.id,
        },
      });
    }

    const skipped =
      failures.length > 0
        ? `\n(${failures.length} image${failures.length > 1 ? "s" : ""} couldn't be converted.)`
        : "";

    if (urls.length === 1) {
      return interaction.editReply({
        content: `Add [this URL](${urls[0]}) to your favourites!${skipped}`,
      });
    }

    const list = urls.map((url, index) => `${index + 1}. [Image ${index + 1}](${url})`).join("\n");

    return interaction.editReply({ content: `Add these to your favourites!\n${list}${skipped}` });
  },
);
