import type { CommandInteraction } from "discord.js";

export async function handleCommand(interaction: CommandInteraction) {
    try {
        const commandModule = await import(
            `./commands/${interaction.commandName}.ts`
        );
        const command = commandModule.default;
        if (!command.slashCommand.enabled)
            return interaction.reply("This command is not enabled!");
        if (command.slashCommand.enabled) command.interactionRun(interaction);
    } catch (error) {
        console.error(error);
        interaction.reply({
            content: "There was an error while executing this command!",
            ephemeral: true,
        });
    }
}
