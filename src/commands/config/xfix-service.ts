import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import { EMOJI } from "@/lib/emojis";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";
import { prisma } from "@/lib/db";
import { XFixType } from "@/generated/prisma/client";

const xfixServiceOptions = [
  {
    name: "service",
    description: "The X post fixing service to use",
    type: ApplicationCommandOptionType.String,
    required: true,
    choices: [
      { name: "FxTwitter", value: XFixType.fxtwitter },
      { name: "vxTwitter", value: XFixType.vxtwitter },
    ],
  },
] as const;

const serviceNames: Record<XFixType, string> = {
  fxtwitter: "FxTwitter",
  vxtwitter: "vxTwitter",
};

const isXFixType = (value: string): value is XFixType => value in serviceNames;

export const xfixServiceConfig: SubcommandConfig<typeof xfixServiceOptions> = {
  name: "xfix-service",
  description: "Choose which service is used to enhance X post embeds",
  options: xfixServiceOptions,
};

export const xfixServiceExecute: SubcommandExecuteFunction<typeof xfixServiceOptions> = async (
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

  if (!isXFixType(options.service)) {
    return interaction.reply({
      content: `${EMOJI.error} Invalid service: ${options.service}`,
      flags: "Ephemeral",
    });
  }

  await prisma.server.update({
    where: {
      id: interaction.guild.id,
    },
    data: {
      xfixType: options.service,
    },
  });

  return interaction.reply({
    content: `${EMOJI.success} X post embed service set to ${serviceNames[options.service]}`,
    flags: "Ephemeral",
  });
};
