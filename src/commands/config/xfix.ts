import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";
import { prisma } from "@/lib/db";

const xfixOptions = [
  {
    name: "enabled",
    description: "Enable or disable X post embed enhancement",
    type: ApplicationCommandOptionType.Boolean,
    required: true,
  },
] as const;

export const xfixConfig: SubcommandConfig<typeof xfixOptions> = {
  name: "xfix",
  description: "Enable or disable X post embed enhancement",
  options: xfixOptions,
};

export const xfixExecute: SubcommandExecuteFunction<typeof xfixOptions> = async (
  interaction,
  options,
) => {
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

  await prisma.server.update({
    where: {
      id: interaction.guild.id,
    },
    data: {
      xfix: options.enabled,
    },
  });

  return interaction.reply({
    content: `✅ X post embed enhancement ${options.enabled ? "enabled" : "disabled"}`,
    flags: "Ephemeral",
  });
};
