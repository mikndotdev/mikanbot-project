import { ApplicationCommandOptionType, ChannelType, PermissionFlagsBits } from "discord.js";
import { isKnownLine, lineLabel, searchLines } from "@/lib/train-lines";
import { addSubscription, MAX_LINES_PER_GUILD } from "@/lib/train-subscriptions";
import type {
  AutocompleteHandlers,
  SubcommandConfig,
  SubcommandExecuteFunction,
} from "@/types/command";

const subscribeOptions = [
  {
    name: "channel",
    description: "運行情報を投稿するチャンネル",
    nameLocalizations: { ja: "チャンネル" },
    descriptionLocalizations: { ja: "運行情報を投稿するチャンネル" },
    type: ApplicationCommandOptionType.Channel,
    channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    required: true,
  },
  {
    name: "line",
    description: "購読する路線",
    nameLocalizations: { ja: "路線" },
    descriptionLocalizations: { ja: "購読する路線" },
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
] as const;

export const statusSubscribeConfig: SubcommandConfig<typeof subscribeOptions> = {
  name: "status-subscribe",
  description: "チャンネルを路線の運行情報に登録します",
  descriptionLocalizations: { ja: "チャンネルを路線の運行情報に登録します" },
  options: subscribeOptions,
};

export const statusSubscribeAutocomplete: AutocompleteHandlers<typeof subscribeOptions> = {
  line: (_interaction, ctx) => searchLines(ctx.value),
};

export const statusSubscribeExecute: SubcommandExecuteFunction<typeof subscribeOptions> = async (
  interaction,
  options,
) => {
  if (!interaction.inCachedGuild()) {
    return interaction.reply({
      content: "このコマンドはサーバー内でのみ使用できます。",
      flags: "Ephemeral",
    });
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({
      content: "❌ この操作には「チャンネルの管理」権限が必要です。",
      flags: "Ephemeral",
    });
  }

  const rosenCode = options.line;
  if (!isKnownLine(rosenCode)) {
    return interaction.reply({
      content: "❌ 路線が正しく選択されていません。候補から選んでください。",
      flags: "Ephemeral",
    });
  }

  const channel = interaction.guild.channels.cache.get(
    interaction.options.getChannel("channel")?.id ?? "",
  );
  if (!channel || !channel.isTextBased()) {
    return interaction.reply({
      content: "❌ テキストチャンネルを指定してください。",
      flags: "Ephemeral",
    });
  }

  const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
  const permissions = channel.permissionsFor(botMember);
  if (
    !permissions?.has(PermissionFlagsBits.ViewChannel) ||
    !permissions.has(PermissionFlagsBits.SendMessages)
  ) {
    return interaction.reply({
      content: `❌ ${channel.toString()} に投稿する権限がありません。`,
      flags: "Ephemeral",
    });
  }

  const result = await addSubscription(
    interaction.guild.id,
    channel.id,
    rosenCode,
    interaction.user.id,
  );

  if (result === "exists") {
    return interaction.reply({
      content: `❌ ${channel.toString()} は既に **${lineLabel(rosenCode)}** を購読しています。`,
      flags: "Ephemeral",
    });
  }
  if (result === "limit") {
    return interaction.reply({
      content: `❌ 1サーバーあたり ${MAX_LINES_PER_GUILD} 路線までです。\`/train list-subscriptions\` で整理してください。`,
      flags: "Ephemeral",
    });
  }

  return interaction.reply({
    content: `✅ ${channel.toString()} を **${lineLabel(rosenCode)}** の運行情報に登録しました。`,
    flags: "Ephemeral",
  });
};
