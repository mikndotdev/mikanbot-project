import type { CommandInteraction } from "discord.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
        console.error(error);
        interaction.reply({
            content: "There was an error while executing this command!",
            ephemeral: true,
        });
    }
}
