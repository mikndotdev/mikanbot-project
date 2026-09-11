import type { AutocompleteInteraction } from "discord.js";
import * as Sentry from "@sentry/bun";
import { getCommand } from "@/commands";
import type { AutocompleteChoice, AutocompleteHandlerMap, CommandOption } from "@/types/command";

const RESOLVER_BUDGET_MS = 2200;
const MAX_CHOICES = 25;
const MAX_FIELD_LEN = 100;
const UNKNOWN_INTERACTION = 10062;

function truncate(value: string, max: number): string {
  const chars = [...value];
  return chars.length <= max ? value : `${chars.slice(0, max - 1).join("")}…`;
}

function sanitizeChoices(choices: AutocompleteChoice[]): AutocompleteChoice[] {
  const out: AutocompleteChoice[] = [];
  for (const choice of choices) {
    if (out.length >= MAX_CHOICES) break;
    const name = truncate(String(choice?.name ?? "").trim(), MAX_FIELD_LEN);
    if (!name) continue;
    const value =
      typeof choice.value === "number"
        ? choice.value
        : truncate(String(choice?.value ?? ""), MAX_FIELD_LEN);
    if (typeof value === "string" && value.length === 0) continue;
    out.push({ name, value });
  }
  return out;
}

async function safeRespond(interaction: AutocompleteInteraction, raw: AutocompleteChoice[]) {
  if (interaction.responded) return;
  try {
    await interaction.respond(sanitizeChoices(raw));
  } catch (error) {
    if ((error as { code?: unknown }).code === UNKNOWN_INTERACTION) {
      Sentry.logger.warn("autocomplete interaction expired before respond", {
        command: interaction.commandName,
      });
      return;
    }
    Sentry.captureException(error, {
      tags: { source: "autocompleteRespond" },
      extra: { command: interaction.commandName },
    });
  }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const command = getCommand(interaction.commandName);
  if (!command) return safeRespond(interaction, []);

  let resolvers: AutocompleteHandlerMap | undefined;
  let declared: readonly CommandOption[] = [];
  let subcommand: string | null = null;

  if ("subcommands" in command) {
    subcommand = interaction.options.getSubcommand(false);
    const sub = subcommand ? command.subcommands[subcommand] : undefined;
    resolvers = sub?.autocomplete;
    declared = (sub?.options ?? []) as readonly CommandOption[];
  } else {
    resolvers = command.autocomplete;
    declared = (command.options ?? []) as readonly CommandOption[];
  }

  let focused: { name: string; value: string };
  try {
    focused = interaction.options.getFocused(true);
  } catch {
    return safeRespond(interaction, []);
  }

  const resolver = resolvers?.[focused.name];
  if (!resolver) return safeRespond(interaction, []);

  const options: Record<string, unknown> = {};
  for (const option of declared) {
    if (option.name === focused.name) continue;
    const raw = interaction.options.get(option.name);
    if (raw) options[option.name] = raw.value;
  }

  const work = (async () =>
    resolver(interaction, {
      name: focused.name,
      value: String(focused.value ?? ""),
      options: options as never,
      subcommand,
    }))().catch((error) => {
    Sentry.captureException(error, {
      tags: { source: "autocomplete" },
      extra: { command: interaction.commandName, subcommand, option: focused.name },
    });
    return [] as AutocompleteChoice[];
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<AutocompleteChoice[]>((resolve) => {
    timer = setTimeout(() => {
      Sentry.logger.warn("autocomplete resolver exceeded budget", {
        command: interaction.commandName,
        option: focused.name,
      });
      resolve([]);
    }, RESOLVER_BUDGET_MS);
  });

  const choices = await Promise.race([work, budget]).finally(() => clearTimeout(timer));
  await safeRespond(interaction, choices);
}
