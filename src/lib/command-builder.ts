import type { ChatInputCommandInteraction } from "discord.js";
import type {
  BaseCommandConfig,
  Command,
  CommandConfig,
  CommandExecuteFunction,
  CommandOption,
  CommandOptionType,
  CommandWithSubcommands,
  InferOptionTypes,
  SubcommandConfig,
  SubcommandExecuteFunction,
  SubcommandOption,
} from "@/types/command";

class CommandBuilder<TOptions extends readonly CommandOption[] = []> {
  private config: CommandConfig<TOptions>;
  private executeHandler?: CommandExecuteFunction<TOptions>;

  constructor(config: CommandConfig<TOptions>) {
    this.config = {
      ...config,
      options: (config.options || []) as TOptions,
    };
  }

  option<
    const TNewOption extends Omit<CommandOption, "type"> & { type: CommandOptionType },
  >(option: TNewOption): CommandBuilder<readonly [...TOptions, TNewOption]> {
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
    return newBuilder;
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
      execute: wrappedExecute,
      toJSON: () => ({
        name: this.config.name,
        description: this.config.description,
        options: this.config.options || ([] as any),
      }),
    };
  }
}

class SubcommandBuilder {
  private config: BaseCommandConfig;
  private subcommands: Map<string, SubcommandOption & { execute: SubcommandExecuteFunction<any> }> =
    new Map();

  constructor(config: BaseCommandConfig) {
    this.config = config;
  }

  subcommand<TOptions extends readonly CommandOption[]>(
    config: SubcommandConfig<TOptions>,
    execute: SubcommandExecuteFunction<TOptions>,
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
      execute: wrappedExecute,
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
      toJSON: () => ({
        name: this.config.name,
        description: this.config.description,
        options: Array.from(this.subcommands.values()).map((sub) => ({
          name: sub.name,
          description: sub.description,
          type: sub.type,
          options: sub.options,
        })),
      }),
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
