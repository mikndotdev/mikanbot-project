import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from "@discordjs/voice";

const joinOptions = [
  {
    name: "channel",
    description: "Voice channel to join (defaults to the one you're in)",
    type: ApplicationCommandOptionType.Channel,
    required: false,
  },
] as const;

export const joinConfig: SubcommandConfig<typeof joinOptions> = {
  name: "keep-esex-alive",
  description: "Join a voice channel and stay until disconnected",
  options: joinOptions,
};

export const joinExecute: SubcommandExecuteFunction<typeof joinOptions> = async (interaction) => {
  if (!interaction.inCachedGuild()) {
    return interaction.reply({
      content: "This command can only be used in a server.",
      flags: "Ephemeral",
    });
  }

  const optionChannelId = interaction.options.getChannel("channel")?.id;
  const channel = optionChannelId
    ? interaction.guild.channels.cache.get(optionChannelId)
    : interaction.member.voice.channel;

  if (!channel) {
    return interaction.reply({
      content: "Join a voice channel first or specify one.",
      flags: "Ephemeral",
    });
  }

  if (!channel.isVoiceBased()) {
    return interaction.reply({
      content: "That isn't a voice channel.",
      flags: "Ephemeral",
    });
  }

  const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
  const permissions = channel.permissionsFor(botMember);
  if (
    !permissions.has(PermissionFlagsBits.ViewChannel) ||
    !permissions.has(PermissionFlagsBits.Connect)
  ) {
    return interaction.reply({
      content: `I don't have permission to join **${channel.name}**.`,
      flags: "Ephemeral",
    });
  }

  await interaction.deferReply();

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: interaction.guild.id,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      connection.destroy();
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  } catch {
    connection.destroy();
    return interaction.editReply("Failed to connect to the voice channel.");
  }

  return interaction.editReply(`Joined **${channel.name}**.`);
};
