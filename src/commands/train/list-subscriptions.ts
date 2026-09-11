import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { lineLabel } from "@/lib/train-lines";
import { lineEmojiPrefix } from "@/lib/train";
import { listSubscriptions, MAX_LINES_PER_GUILD } from "@/lib/train-subscriptions";
import type { TrainSubscription } from "@/lib/train-subscriptions";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";

export const PER_PAGE = 7;
const ACCENT = 0xff7700;

const listOptions = [] as const;

export const listSubscriptionsConfig: SubcommandConfig<typeof listOptions> = {
  name: "list-subscriptions",
  description: "このサーバーの運行情報の登録一覧を表示します",
  descriptionLocalizations: { ja: "このサーバーの運行情報の登録一覧を表示します" },
  options: listOptions,
};

export function encodeUnsubId(sub: TrainSubscription): string {
  return `trainsub:unsub:${sub.channelId}:${sub.rosenCode}`;
}

export function encodePageId(page: number): string {
  return `trainsub:page:${page}`;
}

export function decodeSubId(
  customId: string,
):
  | { action: "unsub"; channelId: string; rosenCode: string }
  | { action: "page"; page: number }
  | null {
  const parts = customId.split(":");
  if (parts[0] !== "trainsub") return null;
  if (parts[1] === "unsub" && parts.length === 4) {
    return { action: "unsub", channelId: parts[2] ?? "", rosenCode: parts[3] ?? "" };
  }
  if (parts[1] === "page" && parts.length === 3) {
    const page = Number(parts[2]);
    if (!Number.isFinite(page)) return null;
    return { action: "page", page };
  }
  return null;
}

export function buildSubscriptionList(subs: TrainSubscription[], page = 0) {
  const totalPages = Math.max(1, Math.ceil(subs.length / PER_PAGE));
  const current = Math.min(Math.max(0, page), totalPages - 1);
  const container = new ContainerBuilder().setAccentColor(ACCENT);

  if (subs.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## 🚆 運行情報の登録\n登録されているチャンネルはありません。\n-# `/train status-subscribe` で登録できます。",
      ),
    );
    return {
      flags: MessageFlags.IsComponentsV2 as const,
      components: [container],
      files: [],
      attachments: [],
    };
  }

  const lines = new Set(subs.map((s) => s.rosenCode)).size;
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 🚆 運行情報の登録\n${subs.length} 件 ・ ${lines}/${MAX_LINES_PER_GUILD} 路線${totalPages > 1 ? `　(${current + 1}/${totalPages})` : ""}`,
    ),
  );

  for (const sub of subs.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE)) {
    const warn = sub.failures > 0 ? `　⚠️ 送信失敗 ${sub.failures} 回` : "";
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `<#${sub.channelId}>\n-# ${lineEmojiPrefix(sub.rosenCode)}${lineLabel(sub.rosenCode)}${warn}`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(encodeUnsubId(sub))
            .setLabel("解除")
            .setEmoji("🔕")
            .setStyle(ButtonStyle.Secondary),
        ),
    );
  }

  if (totalPages > 1) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodePageId(current - 1))
          .setLabel("前")
          .setEmoji("◀️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current <= 0),
        new ButtonBuilder()
          .setCustomId(encodePageId(current + 1))
          .setLabel("次")
          .setEmoji("▶️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current >= totalPages - 1),
      ),
    );
  }

  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [container],
    files: [],
    attachments: [],
  };
}

export const listSubscriptionsExecute: SubcommandExecuteFunction<typeof listOptions> = async (
  interaction,
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

  const subs = await listSubscriptions(interaction.guild.id);
  return interaction.reply({
    ...buildSubscriptionList(subs, 0),
    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
  });
};
