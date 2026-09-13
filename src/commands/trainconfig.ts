import { createCommandWithSubcommands } from "@/lib/command-builder";
import {
  subscribeAutocomplete,
  subscribeConfig,
  subscribeExecute,
} from "@/commands/trainconfig/subscribe";
import { listConfig, listExecute } from "@/commands/trainconfig/list";

export const trainconfig = createCommandWithSubcommands({
  name: "trainconfig",
  description: "列車の運行情報をチャンネルに配信する設定",
  descriptionLocalizations: { ja: "列車の運行情報をチャンネルに配信する設定" },
  cooldown: 5,
})
  .subcommand(subscribeConfig, subscribeExecute, subscribeAutocomplete)
  .subcommand(listConfig, listExecute)
  .build();
