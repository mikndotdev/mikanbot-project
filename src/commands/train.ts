import { createCommandWithSubcommands } from "@/lib/command-builder";
import { findAutocomplete, findConfig, findExecute } from "@/commands/train/find";
import { setAutocomplete, setConfig, setExecute } from "@/commands/train/set";
import { clearConfig, clearExecute } from "@/commands/train/clear";
import { meConfig, meExecute } from "@/commands/train/me";
import { userConfig, userExecute } from "@/commands/train/user";

export const train = createCommandWithSubcommands({
  name: "train",
  description: "日本の列車情報",
  descriptionLocalizations: { ja: "日本の列車情報" },
  cooldown: 10,
})
  .subcommand(findConfig, findExecute, findAutocomplete)
  .subcommand(setConfig, setExecute, setAutocomplete)
  .subcommand(clearConfig, clearExecute)
  .subcommand(meConfig, meExecute)
  .subcommand(userConfig, userExecute)
  .build();
