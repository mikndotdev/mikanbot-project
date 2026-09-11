import { ApplicationCommandType, type ChatInputCommandInteraction } from "discord.js";
import type {
  AutocompleteHandlerMap,
  AutocompleteHandlers,
  AutocompleteResolver,
  BaseCommandConfig,
  Command,
  CommandConfig,
  CommandExecuteFunction,
  CommandOption,
  CommandOptionType,
  CommandWithSubcommands,
  InferOptionTypes,
  MessageCommand,
  MessageCommandConfig,
  MessageCommandExecuteFunction,
  SerializedOption,
  SubcommandConfig,
  SubcommandExecuteFunction,
  SubcommandOption,
} from "@/types/command";

function omitUndefined(value: SerializedOption): SerializedOption {
  const out: SerializedOption = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out;
}

function serializeOption(option: CommandOption): SerializedOption {
  return omitUndefined({
    name: option.name,
    description: option.description,
    type: option.type,
    required: option.required,
    choices: option.choices,
    autocomplete: option.autocomplete,
    channel_types: option.channelTypes,
    min_value: option.minValue,
    max_value: option.maxValue,
    min_length: option.minLength,
    max_length: option.maxLength,
    name_localizations: option.nameLocalizations,
    description_localizations: option.descriptionLocalizations,
  });
}

function serializeOptions(options: readonly CommandOption[] | undefined): SerializedOption[] {
  return (options ?? []).map(serializeOption);
}

function serializeSubcommand(
  sub: SubcommandOption & { execute: SubcommandExecuteFunction<any> },
): SerializedOption {
  return omitUndefined({
    name: sub.name,
    description: sub.description,
    type: sub.type,
    options: serializeOptions(sub.options),
    name_localizations: sub.nameLocalizations,
    description_localizations: sub.descriptionLocalizations,
  });
}

class CommandBuilder<TOptions extends readonly CommandOption[] = []> {
  private config: CommandConfig<TOptions>;
  private executeHandler?: CommandExecuteFunction<TOptions>;
  private autocompleteHandlers: AutocompleteHandlerMap = {};

  constructor(config: CommandConfig<TOptions>) {
    this.config = {
      ...config,
      options: (config.options || []) as TOptions,
    };
  }

  option<const TNewOption extends Omit<CommandOption, "type"> & { type: CommandOptionType }>(
    option: TNewOption,
  ): CommandBuilder<readonly [...TOptions, TNewOption]> {
    const newOptions = [...(this.config.options || []), option] as readonly [
      ...TOptions,
      TNewOption,
    ];
    const newConfig = {
      ...this.config,
      options: newOptions,
    };
    const newBuilder = new CommandBuilder(newConfig) as CommandBuilder<
      readonly [...TOptions, TNewOption]
    >;
    if (this.executeHandler) {
      newBuilder.executeHandler = this.executeHandler as any;
    }
    newBuilder.autocompleteHandlers = { ...this.autocompleteHandlers };
    return newBuilder;
  }

  autocomplete<TName extends TOptions[number]["name"]>(
    name: TName,
    resolver: AutocompleteResolver<TOptions>,
  ): CommandBuilder<TOptions> {
    this.autocompleteHandlers[name as string] = resolver as AutocompleteResolver<any>;
    return this;
  }

  execute(handler: CommandExecuteFunction<TOptions>): Command<TOptions> {
    this.executeHandler = handler;

    const getOptionValue = (interaction: ChatInputCommandInteraction, option: CommandOption) => {
      const value = interaction.options.get(option.name);
      if (!value) return undefined;

      switch (option.type) {
        case 3:
          return value.value as string;
        case 4:
        case 10:
          return value.value as number;
        case 5:
          return value.value as boolean;
        case 6:
        case 7:
        case 8:
        case 9:
        case 11:
          return value.value as string;
        default:
          return value.value;
      }
    };

    const wrappedExecute = async (interaction: ChatInputCommandInteraction) => {
      const options = {} as InferOptionTypes<TOptions>;

      for (const option of this.config.options || []) {
        const value = getOptionValue(interaction, option);
        (options as any)[option.name] = value;
      }

      return handler(interaction, options);
    };

    return {
      name: this.config.name,
      description: this.config.description,
      cooldown: this.config.cooldown ?? 3,
      premiumCooldown: this.config.premiumCooldown,
      isPremium: this.config.isPremium ?? false,
      botPermissions: this.config.botPermissions ?? [],
      userPermissions: this.config.userPermissions ?? [],
      enabled: this.config.enabled ?? true,
      options: this.config.options || ([] as any),
      autocomplete: this.autocompleteHandlers,
      execute: wrappedExecute,
      toJSON: () =>
        omitUndefined({
          name: this.config.name,
          description: this.config.description,
          options: serializeOptions(this.config.options),
          name_localizations: this.config.nameLocalizations,
          description_localizations: this.config.descriptionLocalizations,
        }) as ReturnType<Command<TOptions>["toJSON"]>,
    };
  }
}

class SubcommandBuilder {
  private config: BaseCommandConfig;
  private subcommands: Map<
    string,
    SubcommandOption & {
      execute: SubcommandExecuteFunction<any>;
      autocomplete?: AutocompleteHandlerMap;
    }
  > = new Map();

  constructor(config: BaseCommandConfig) {
    this.config = config;
  }

  subcommand<TOptions extends readonly CommandOption[]>(
    config: SubcommandConfig<TOptions>,
    execute: SubcommandExecuteFunction<TOptions>,
    autocomplete?: AutocompleteHandlers<TOptions>,
  ): this {
    const getOptionValue = (interaction: ChatInputCommandInteraction, option: CommandOption) => {
      const value = interaction.options.get(option.name);
      if (!value) return undefined;

      switch (option.type) {
        case 3:
          return value.value as string;
        case 4:
        case 10:
          return value.value as number;
        case 5:
          return value.value as boolean;
        case 6:
        case 7:
        case 8:
        case 9:
        case 11:
          return value.value as string;
        default:
          return value.value;
      }
    };

    const wrappedExecute = async (interaction: ChatInputCommandInteraction) => {
      const options = {} as InferOptionTypes<TOptions>;

      for (const option of config.options || []) {
        const value = getOptionValue(interaction, option);
        (options as any)[option.name] = value;
      }

      return execute(interaction, options);
    };

    this.subcommands.set(config.name, {
      name: config.name,
      description: config.description,
      type: 1,
      options: config.options as any,
      nameLocalizations: config.nameLocalizations,
      descriptionLocalizations: config.descriptionLocalizations,
      execute: wrappedExecute,
      autocomplete: autocomplete as AutocompleteHandlerMap | undefined,
    });

    return this;
  }

  build(): CommandWithSubcommands {
    const mainExecute = async (interaction: ChatInputCommandInteraction) => {
      const subcommandName = interaction.options.getSubcommand();
      const subcommand = this.subcommands.get(subcommandName);

      if (!subcommand) {
        throw new Error(`Unknown subcommand: ${subcommandName}`);
      }

      return subcommand.execute(interaction, {} as any);
    };

    return {
      name: this.config.name,
      description: this.config.description,
      cooldown: this.config.cooldown ?? 3,
      premiumCooldown: this.config.premiumCooldown,
      isPremium: this.config.isPremium ?? false,
      botPermissions: this.config.botPermissions ?? [],
      userPermissions: this.config.userPermissions ?? [],
      enabled: this.config.enabled ?? true,
      subcommands: Object.fromEntries(this.subcommands),
      execute: mainExecute,
      toJSON: () =>
        omitUndefined({
          name: this.config.name,
          description: this.config.description,
          options: Array.from(this.subcommands.values()).map(serializeSubcommand),
          name_localizations: this.config.nameLocalizations,
          description_localizations: this.config.descriptionLocalizations,
        }) as ReturnType<CommandWithSubcommands["toJSON"]>,
    };
  }
}

export function createCommand<TOptions extends readonly CommandOption[] = []>(
  config: CommandConfig<TOptions>,
): CommandBuilder<TOptions> {
  return new CommandBuilder(config);
}

export function createCommandWithSubcommands(config: BaseCommandConfig): SubcommandBuilder {
  return new SubcommandBuilder(config);
}

export function createMessageCommand(
  config: MessageCommandConfig,
  execute: MessageCommandExecuteFunction,
): MessageCommand {
  return {
    name: config.name,
    cooldown: config.cooldown ?? 3,
    premiumCooldown: config.premiumCooldown,
    isPremium: config.isPremium ?? false,
    botPermissions: config.botPermissions ?? [],
    userPermissions: config.userPermissions ?? [],
    enabled: config.enabled ?? true,
    execute,
    toJSON: () => ({
      name: config.name,
      type: ApplicationCommandType.Message,
    }),
  };
}
