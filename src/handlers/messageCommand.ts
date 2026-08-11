import { WebhookClient, EmbedBuilder, type MessageContextMenuCommandInteraction } from "discord.js";
import crypto from "node:crypto";
import { setCommandRatelimit, checkCommandRatelimit } from "@/handlers/ratelimit";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getMessageCommand } from "@/commands";

const logginWebhook = new WebhookClient({
  url: env.LOGGING_WEBHOOK_URL,
});

const sendLog = async (message: string) => {
  const logId = crypto.randomBytes(4).toString("hex");
  const embed = new EmbedBuilder()
    .setTitle(`Error Log`)
    .setDescription(`\`\`\`ts\n${message}\n\`\`\``)
    .setColor("#FF0000")
    .setTimestamp();

  await logginWebhook.send({ content: `EID ${logId}`, embeds: [embed] }).catch(console.error);
  return logId;
};

export async function handleMessageCommand(interaction: MessageContextMenuCommandInteraction) {
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
    const command = getMessageCommand(interaction.commandName);

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const logId = await sendLog(errorMessage);
    console.error(`Error while executing command: ${logId}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("An error occurred while executing this command!")
      .setDescription(
        `An error occurred while executing this command.\n\nEID ${logId}\n\nPlease contact support if this persists.`,
      )
      .setColor("#FF0000")
      .setTimestamp();
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], flags: "Ephemeral" });
    }
  }
}
