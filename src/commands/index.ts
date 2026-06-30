import type { Command, CommandWithSubcommands } from "@/types/command";
import { ping } from "@/commands/ping";
import { currency } from "@/commands/currency";
import { rank } from "@/commands/rank";
import { config } from "@/commands/config";
import { flight } from "@/commands/flight";

export const commands = {
  ping,
  currency,
  rank,
  config,
  flight,
} as const satisfies Record<string, Command<any> | CommandWithSubcommands>;

export type CommandName = keyof typeof commands;

export function getCommand(name: string): Command<any> | CommandWithSubcommands | undefined {
  return commands[name as CommandName];
}

export function getAllCommands(): Array<Command<any> | CommandWithSubcommands> {
  return Object.values(commands);
}
