import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";
import { prisma } from "@/lib/db";

const xfixAutoTranslateOptions = [
  {
    name: "enabled",
    description: "Enable or disable automatic translation for X posts",
    type: ApplicationCommandOptionType.Boolean,
    required: true,
  },
] as const;

export const xfixAutoTranslateConfig: SubcommandConfig<typeof xfixAutoTranslateOptions> = {
  name: "xfix-auto-translate",
  description: "Enable or disable automatic translation for X posts",
  options: xfixAutoTranslateOptions,
};

export const xfixAutoTranslateExecute: SubcommandExecuteFunction<
  typeof xfixAutoTranslateOptions
> = async (interaction, options) => {
  if (!interaction.guild) {
    return interaction.reply({
      content: "This command can only be used in a server!",
      flags: "Ephemeral",
    });
  }

  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply({
      content: "You need Administrator permission to use this command!",
      flags: "Ephemeral",
    });
  }

  await prisma.server.update({
    where: {
      id: interaction.guild.id,
    },
    data: {
      xfixAutoTranslate: options.enabled,
    },
  });

  return interaction.reply({
    content: `✅ Auto-translation for X posts ${options.enabled ? "enabled" : "disabled"}`,
    flags: "Ephemeral",
  });
};
