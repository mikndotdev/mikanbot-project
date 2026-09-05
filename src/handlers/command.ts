import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as Sentry from "@sentry/bun";
import { setCommandRatelimit, checkCommandRatelimit } from "@/handlers/ratelimit";
import { prisma } from "@/lib/db";
import { getCommand } from "@/commands";

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  try {
    const userDb = await prisma.user.findUnique({
      where: {
        id: interaction.user.id,
      },
    });

    if (!userDb) {
      await prisma.user.create({
        data: {
          id: interaction.user.id,
          premium: false,
        },
      });
    }

    const premium = userDb?.premium;
    const command = getCommand(interaction.commandName);

    if (!command) {
      return interaction.reply({
        content: "This command does not exist!",
        flags: "Ephemeral",
      });
    }

    const limited = await checkCommandRatelimit("cmd", interaction, command.name);
    if (limited)
      return interaction.reply({
        content: "You are being ratelimited! Please wait a bit before using this command again.",
        flags: "Ephemeral",
      });
    if (!command.enabled) return interaction.reply("This command is not enabled!");
    if (command.isPremium && !premium)
      return interaction.reply("This command is only available for premium users!");

    await command.execute(interaction);

    if (premium) {
      setCommandRatelimit(
        "cmd",
        interaction,
        command.premiumCooldown || command.cooldown,
        command.name,
      );
    } else {
      setCommandRatelimit("cmd", interaction, command.cooldown, command.name);
    }
  } catch (error) {
    const logId = Sentry.captureException(error, {
      tags: { source: "command", command: interaction.commandName },
      extra: { userId: interaction.user.id, guildId: interaction.guildId },
    });
    const errorEmbed = new EmbedBuilder()
      .setTitle("An error occurred while executing this command!")
      .setDescription(
        `An error occurred while executing this command.\n\nEID ${logId}\n\nPlease contact support if this persists.`,
      )
      .setColor("#FF0000")
      .setTimestamp();
    await interaction.reply({ embeds: [errorEmbed], flags: "Ephemeral" });
  }
}
