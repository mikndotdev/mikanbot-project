import { createCommand } from "@/lib/command-builder";
import { EMOJI } from "@/lib/emojis";

export const ping = createCommand({
  name: "ping",
  description: "Replies with Pong!",
  cooldown: 5,
  isPremium: false,
}).execute(async (interaction) => {
  const ping = Math.abs(Math.round(interaction.client.ws.ping));
  await interaction.reply(EMOJI.loading);
  const roundtrip = Math.abs(Date.now() - interaction.createdTimestamp);
  interaction.editReply(`API Latency: ${ping}ms\nRoundtrip: ${roundtrip}ms`);
});
