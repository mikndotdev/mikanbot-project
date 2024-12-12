import {
    WebhookClient,
    EmbedBuilder,
    type CommandInteraction,
} from "discord.js";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const logginWebhook = new WebhookClient({
    url: process.env.LOGGING_WEBHOOK_URL as string,
});

const sendLog = async (message: string) => {
    const logId = crypto.randomBytes(4).toString("hex");
    const embed = new EmbedBuilder()
        .setTitle(`Error Log`)
        .setDescription(`\`\`\`ts\n${message}\n\`\`\``)
        .setColor("#FF0000")
        .setTimestamp();

    await logginWebhook
        .send({ content: `EID ${logId}`, embeds: [embed] })
        .catch(console.error);
    return logId;
};

export async function handleCommand(interaction: CommandInteraction) {
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
        const commandModule = await import(
            `../commands/${interaction.commandName}.ts`
        );
        const command = commandModule.default;
        if (!command.slashCommand.enabled)
            return interaction.reply("This command is not enabled!");
        if (command.isPremium && !premium)
            return interaction.reply(
                "This command is only available for premium users!",
            );
        if (command.slashCommand.enabled) command.interactionRun(interaction);
    } catch (error) {
        const logId = await sendLog(error.message);
        console.error(`Error while executing command: ${logId}`);
        const errorEmbed = new EmbedBuilder()
            .setTitle("An error occurred while executing this command!")
            .setDescription(
                `An error occurred while executing this command.\n\nEID ${logId}\n\nPlease contact support if this persists.`,
            )
            .setColor("#FF0000")
            .setTimestamp();
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}
