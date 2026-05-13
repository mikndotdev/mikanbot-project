import { PermissionFlagsBits } from "discord.js";
import { createCommandWithSubcommands } from "@/lib/command-builder";
import { xfixConfig, xfixExecute } from "@/commands/config/xfix";
import {
  preferredLanguageConfig,
  preferredLanguageExecute,
} from "@/commands/config/preferred-language";
import {
  xfixAutoTranslateConfig,
  xfixAutoTranslateExecute,
} from "@/commands/config/xfix-auto-translate";

export const config = createCommandWithSubcommands({
  name: "config",
  description: "Configure server settings",
  userPermissions: [PermissionFlagsBits.Administrator],
})
  .subcommand(xfixConfig, xfixExecute)
  .subcommand(preferredLanguageConfig, preferredLanguageExecute)
  .subcommand(xfixAutoTranslateConfig, xfixAutoTranslateExecute)
  .build();
