import { PermissionFlagsBits, type ButtonInteraction } from "discord.js";
import { lineLabel } from "@/lib/train-lines";
import { listSubscriptions, removeSubscription } from "@/lib/train-subscriptions";
import { buildSubscriptionList, decodeSubId } from "@/commands/train/list-subscriptions";

export async function handleTrainSubComponent(interaction: ButtonInteraction) {
  const decoded = decodeSubId(interaction.customId);
  if (!decoded) return;

  if (!interaction.inCachedGuild()) return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({
      content: "❌ この操作には「チャンネルの管理」権限が必要です。",
      flags: "Ephemeral",
    });
  }

  if (decoded.action === "page") {
    const subs = await listSubscriptions(interaction.guild.id);
    return interaction.update(buildSubscriptionList(subs, decoded.page));
  }

  const removed = await removeSubscription(decoded.channelId, decoded.rosenCode);
  const subs = await listSubscriptions(interaction.guild.id);
  await interaction.update(buildSubscriptionList(subs, 0));

  if (removed) {
    await interaction.followUp({
      content: `✅ <#${decoded.channelId}> の **${lineLabel(decoded.rosenCode)}** の登録を解除しました。`,
      flags: "Ephemeral",
    });
  }
}
