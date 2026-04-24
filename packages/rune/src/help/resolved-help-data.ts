import type { CommandHelpData, HelpData } from "../core/help-types";

export interface ResolvedHelpData {
  readonly data: HelpData;
  readonly aliases: readonly string[];
  /**
   * Text-only command help renderer from defineCommand({ help }).
   * JSON help intentionally ignores custom renderers and serializes `data`
   * through Rune's stable help JSON contract instead.
   */
  readonly commandHelp?: ((data: CommandHelpData) => string) | undefined;
}
