import type { Command, CommandWithSubcommands, MessageCommand } from "@/types/command";
import { ping } from "@/commands/ping";
import { currency } from "@/commands/currency";
import { rank } from "@/commands/rank";
import { config } from "@/commands/config";
import { aviation } from "@/commands/aviation";
import { voice } from "@/commands/voice";
import { timeInMyTimezone } from "@/commands/message/time-in-my-timezone";
import { convertToGif } from "@/commands/message/convert-to-gif";

export const commands = {
  ping,
  currency,
  rank,
  config,
  aviation,
  voice,
} as const satisfies Record<string, Command<any> | CommandWithSubcommands>;

export type CommandName = keyof typeof commands;

export function getCommand(name: string): Command<any> | CommandWithSubcommands | undefined {
  return commands[name as CommandName];
}

export function getAllCommands(): Array<Command<any> | CommandWithSubcommands> {
  return Object.values(commands);
}

export const messageCommands = {
  "Time in my timezone": timeInMyTimezone,
  "Convert to GIF": convertToGif,
} as const satisfies Record<string, MessageCommand>;

export type MessageCommandName = keyof typeof messageCommands;

export function getMessageCommand(name: string): MessageCommand | undefined {
  return messageCommands[name as MessageCommandName];
}

export function getAllMessageCommands(): MessageCommand[] {
  return Object.values(messageCommands);
}
