import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";
import { getVoiceConnection } from "@discordjs/voice";

const leaveOptions = [] as const;

export const leaveConfig: SubcommandConfig<typeof leaveOptions> = {
  name: "leave",
  description: "Disconnect the bot from the voice channel",
  options: leaveOptions,
};

export const leaveExecute: SubcommandExecuteFunction<typeof leaveOptions> = async (interaction) => {
  if (!interaction.inCachedGuild()) {
    return interaction.reply({
      content: "This command can only be used in a server.",
      flags: "Ephemeral",
    });
  }

  const connection = getVoiceConnection(interaction.guild.id);
  if (!connection) {
    return interaction.reply({
      content: "I'm not in a voice channel.",
      flags: "Ephemeral",
    });
  }

  connection.destroy();
  return interaction.reply("Disconnected.");
};
