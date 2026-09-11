import { start } from "@/api/server";
import { deployCommands } from "@/deploy";
import { setPresence } from "@/presence";
import { handleAutocomplete } from "@/handlers/autocomplete";
import { handleCommand } from "@/handlers/command";
import { handleMessageCommand } from "@/handlers/messageCommand";
import { handleLevel } from "@/handlers/lvl";
import { translateMessage } from "@/handlers/flagTranslation";
import { xfix } from "@/handlers/xfix";
import { instafix } from "@/handlers/instafix";
import { handleFlightComponent } from "@/handlers/flightComponent";
import { handlePlaneComponent } from "@/handlers/planeComponent";
import { handleTrainComponent } from "@/handlers/trainComponent";
import { emojiCountryCode } from "country-code-emoji";
import { env } from "@/lib/env";
import * as Sentry from "@sentry/bun";
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  MessageReaction,
  type User,
} from "discord.js";

Sentry.init({
  dsn: env.SENTRY_DSN,
  enableLogs: true,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

export async function dmUser(id: string, provider: string, message: string) {
  const user = client.users.cache.get(id);
  if (!user) return;

  const embed = new EmbedBuilder()
    .setTitle(`System Message from ${provider}`)
    .setDescription(message)
    .setColor("#FF7700")
    .setTimestamp();

  try {
    await user.send({ embeds: [embed] });
  } catch (e) {
    Sentry.captureException(e, { tags: { source: "dmUser" }, extra: { userId: id, provider } });
    return e;
  }
}

client.on("error", (error) => {
  Sentry.captureException(error, { tags: { source: "discordClient" } });
});

client.on("shardError", (error, shardId) => {
  Sentry.captureException(error, { tags: { source: "discordShard" }, extra: { shardId } });
});

client.on("clientReady", () => {
  Sentry.logger.info(Sentry.logger.fmt`Logged in as ${client.user?.tag}!`);
  deployCommands();
  setPresence(client);
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      Sentry.captureException(error, { tags: { source: "messageReactionAdd" } });
      return;
    }
  }

  if (!reaction.partial) {
    let countryCode: string | undefined;
    try {
      countryCode = emojiCountryCode(reaction.emoji.name as string);
    } catch {
      return;
    }
    if (!countryCode) return;

    try {
      await translateMessage(reaction, user as User);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { source: "flagTranslation" },
        extra: {
          emoji: reaction.emoji.name,
          userId: user.id,
          guildId: reaction.message.guildId,
        },
      });
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    try {
      await handleAutocomplete(interaction);
    } catch (e) {
      Sentry.captureException(e, { tags: { source: "autocomplete" } });
    }
    return;
  }
  if (interaction.isChatInputCommand()) {
    Sentry.logger.info("Received command", {
      commandName: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
    try {
      await handleCommand(interaction);
    } catch (e) {
      Sentry.captureException(e);
    }
  }
  if (interaction.isMessageContextMenuCommand()) {
    Sentry.logger.info("Received message command", {
      commandName: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
    try {
      await handleMessageCommand(interaction);
    } catch (e) {
      Sentry.captureException(e);
    }
  }
  if (interaction.isButton()) {
    Sentry.logger.info("Received button", {
      customId: interaction.customId,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
    if (interaction.customId.startsWith("flight:")) {
      try {
        await handleFlightComponent(interaction);
      } catch (e) {
        Sentry.captureException(e);
      }
    }
    if (interaction.customId.startsWith("plane:")) {
      try {
        await handlePlaneComponent(interaction);
      } catch (e) {
        Sentry.captureException(e);
      }
    }
    if (interaction.customId.startsWith("train:")) {
      try {
        await handleTrainComponent(interaction);
      } catch (e) {
        Sentry.captureException(e);
      }
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  Sentry.logger.debug("Received message", {
    userId: message.author.id,
    guildId: message.guildId,
  });
  const messageExtra = {
    messageId: message.id,
    userId: message.author.id,
    guildId: message.guildId,
  };

  handleLevel(message).catch((error) => {
    Sentry.captureException(error, { tags: { source: "handleLevel" }, extra: messageExtra });
  });
  if (
    message.content.startsWith("https://x.com/") ||
    message.content.startsWith("https://twitter.com/")
  ) {
    xfix(message).catch((error) => {
      Sentry.captureException(error, { tags: { source: "xfix" }, extra: messageExtra });
    });
  }
  if (
    message.content.startsWith("https://instagram.com/") ||
    message.content.startsWith("https://www.instagram.com/")
  ) {
    instafix(message).catch((error) => {
      Sentry.captureException(error, { tags: { source: "instafix" }, extra: messageExtra });
    });
  }
});

client.on("guildCreate", async (guild) => {});

client.login(env.BOT_TOKEN).catch((error) => {
  Sentry.captureException(error, { tags: { source: "login" } });
});
start();

globalThis.AI_SDK_LOG_WARNINGS = false;
