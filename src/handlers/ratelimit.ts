import { type CommandInteraction, type Message } from "discord.js";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function setMessageRatelimit(type: string, message: Message) {
  if (type !== "msg") return;
  await cacheSet(`message:${message.guildId}:${message.author.id}`, `${message.guildId}`, 5);
}

export async function checkMessageRatelimit(type: string, message: Message) {
  if (type !== "msg") return false;
  const isLimited = await cacheGet(`message:${message.guildId}:${message.author.id}`);
  return isLimited === `${message.guildId}`;
}

export async function setCommandRatelimit(
  type: string,
  interaction: CommandInteraction,
  time: number,
  name: string,
) {
  if (type !== "cmd") return;
  await cacheSet(
    `command:${interaction.guildId}:${interaction.user.id}:${name}`,
    `${interaction.guildId}`,
    time,
  );
}

export async function checkCommandRatelimit(
  type: string,
  interaction: CommandInteraction,
  name: string,
) {
  if (type !== "cmd") return false;
  const isLimited = await cacheGet(`command:${interaction.guildId}:${interaction.user.id}:${name}`);
  return isLimited === `${interaction.guildId}`;
}

export async function setTranslationRatelimit(type: string, user: string, time: number) {
  if (type !== "translate") return;
  await cacheSet(`translation:${user}`, `${user}`, time);
}

export async function checkTranslationRatelimit(type: string, user: string) {
  if (type !== "translate") return false;
  const isLimited = await cacheGet(`translation:${user}`);
  return isLimited === `${user}`;
}
