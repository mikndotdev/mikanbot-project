import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";
import { prisma } from "@/lib/db";
import ISO6391 from "iso-639-1";

const preferredLanguageOptions = [
  {
    name: "code",
    description: "Two-letter language code (e.g., en, es, fr)",
    type: ApplicationCommandOptionType.String,
    required: true,
  },
] as const;

export const preferredLanguageConfig: SubcommandConfig<typeof preferredLanguageOptions> = {
  name: "preferred-language",
  description: "Set the preferred language for the server",
  options: preferredLanguageOptions,
};

export const preferredLanguageExecute: SubcommandExecuteFunction<
  typeof preferredLanguageOptions
> = async (interaction, options) => {
  if (!interaction.guild) {
    return interaction.reply({
      content: "This command can only be used in a server!",
      flags: "Ephemeral",
    });
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "You need Administrator permission to use this command!",
      flags: "Ephemeral",
    });
  }

  const languageCode = options.code.toLowerCase().trim();

  if (languageCode.length !== 2 || !/^[a-z]{2}$/.test(languageCode)) {
    return interaction.reply({
      content: "❌ Please provide a valid two-letter language code (e.g., en, es, fr)",
      flags: "Ephemeral",
    });
  }

  const languageName = ISO6391.getName(languageCode);

  if (!languageName) {
    return interaction.reply({
      content: `❌ Invalid language code: ${languageCode}. Please use a valid ISO 639-1 language code (e.g., en, es, fr, de, ja)`,
      flags: "Ephemeral",
    });
  }

  await prisma.server.update({
    where: {
      id: interaction.guild.id,
    },
    data: {
      preferredLocale: languageCode,
    },
  });

  return interaction.reply({
    content: `✅ Preferred language set to ${languageCode} (${languageName})`,
    flags: "Ephemeral",
  });
};
