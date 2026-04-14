export interface EarlyExit {
  readonly ok: false;
  readonly exitCode: number;
  readonly output: string;
  readonly stream: "stdout" | "stderr";
}

export interface ParsedRuneManagedOption {
  readonly ok: true;
  readonly name: "project";
  readonly value: string;
  readonly nextIndex: number;
}

interface RuneManagedOptionSpec {
  readonly name: ParsedRuneManagedOption["name"];
  readonly takesValue: boolean;
}

const RUNE_MANAGED_OPTION_SPECS: readonly RuneManagedOptionSpec[] = [
  { name: "project", takesValue: true },
];

interface RuneManagedOptionMatch {
  readonly spec: RuneManagedOptionSpec;
  readonly value?: string | undefined;
  readonly nextIndex: number;
}

function matchRuneManagedOption(
  argv: readonly string[],
  index: number,
): RuneManagedOptionMatch | undefined {
  const token = argv[index];

  for (const spec of RUNE_MANAGED_OPTION_SPECS) {
    const longName = `--${spec.name}`;

    if (token === longName) {
      return {
        spec,
        value: spec.takesValue ? argv[index + 1] : undefined,
        nextIndex: index + (spec.takesValue ? 2 : 1),
      };
    }

    if (spec.takesValue && token.startsWith(`${longName}=`)) {
      return {
        spec,
        value: token.slice(longName.length + 1),
        nextIndex: index + 1,
      };
    }
  }

  return undefined;
}

export function getRuneManagedOptionNextIndex(
  argv: readonly string[],
  index: number,
): number | undefined {
  return matchRuneManagedOption(argv, index)?.nextIndex;
}

export function tryConsumeRuneManagedOption(
  argv: readonly string[],
  index: number,
): ParsedRuneManagedOption | EarlyExit | undefined {
  const match = matchRuneManagedOption(argv, index);

  if (!match) {
    return undefined;
  }

  if (match.spec.name === "project") {
    if (match.value === undefined) {
      return {
        ok: false,
        exitCode: 1,
        output: "Missing value for --project. Usage: --project <path>",
        stream: "stderr",
      };
    }

    return {
      ok: true,
      name: "project",
      value: match.value,
      nextIndex: match.nextIndex,
    };
  }

  return undefined;
}
