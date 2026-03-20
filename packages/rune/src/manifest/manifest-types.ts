// Represents the routed command path as filesystem-derived CLI segments.
// `[]` identifies the manifest root node that represents `src/commands` itself.
export type CommandManifestPath = readonly string[];

// Distinguishes executable commands from help-only command groups.
export type CommandManifestNodeKind = "command" | "group";

// Properties shared by every node emitted into the command manifest.
interface CommandManifestNodeBase {
  // Filesystem-derived path segments that identify this command tree node.
  readonly pathSegments: CommandManifestPath;
  // Whether the node is executable or only groups subcommands.
  readonly kind: CommandManifestNodeKind;
  // Immediate child command segment names in deterministic display order.
  readonly childNames: readonly string[];
  // One-line help text extracted during manifest generation when available.
  readonly description?: string | undefined;
}

// Manifest node for an executable command backed by an `index.ts` file.
export interface CommandManifestCommandNode extends CommandManifestNodeBase {
  readonly kind: "command";
  // Absolute source path used later to load the matched command module.
  readonly sourceFilePath: string;
}

// Manifest node for a directory that only exists to group subcommands.
export interface CommandManifestGroupNode extends CommandManifestNodeBase {
  readonly kind: "group";
  // Group nodes have no executable module of their own in the MVP.
  readonly sourceFilePath?: undefined;
}

// Any node that can appear in the serialized command manifest.
export type CommandManifestNode = CommandManifestCommandNode | CommandManifestGroupNode;

// Lookup shape used by router/help code to resolve nodes by joined path key.
export type CommandManifestNodeMap = Readonly<Record<string, CommandManifestNode>>;

// Complete manifest payload emitted by the scanner for runtime consumption.
export interface CommandManifest {
  // The root node is always stored at `pathSegments: []` when at least one command exists.
  // It may be either a command (`src/commands/index.ts`) or a pure group node.
  readonly nodes: readonly CommandManifestNode[];
}
