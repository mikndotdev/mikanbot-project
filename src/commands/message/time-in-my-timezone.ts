import { time, TimestampStyles } from "discord.js";
import { createMessageCommand } from "@/lib/command-builder";
import { extractTime } from "@/lib/get-timezone";

export const timeInMyTimezone = createMessageCommand(
  { name: "Time in my timezone", cooldown: 5 },
  async (interaction) => {
    await interaction.deferReply({ flags: "Ephemeral" });

    const extracted = await extractTime(interaction.targetMessage.content);

    if (!extracted) {
      return interaction.editReply({ content: "Couldn't find a valid time in the message." });
    }

    const { hour, minute, utcOffset } = extracted;
    const now = new Date();
    const source = new Date(now.getTime() + utcOffset * 3_600_000);
    const epochMs =
      Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate(), hour, minute) -
      utcOffset * 3_600_000;
    const stamp = time(new Date(epochMs), TimestampStyles.ShortTime);

    return interaction.editReply({ content: `That's ${stamp} in your time!` });
  },
);
