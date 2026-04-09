# Scaffolding & Project Workflow

## create-rune-app

Scaffold a new Rune CLI project:

```bash
npm create rune-app@latest my-cli
pnpm create rune-app my-cli
yarn create rune-app my-cli
bun create rune-app my-cli
```

To scaffold into the current directory (must be empty):

```bash
npm create rune-app@latest .
pnpm create rune-app .
```

### Options

| Option         | Short | Default | Description                                   |
| -------------- | ----- | ------- | --------------------------------------------- |
| `--yes`        | `-y`  | `false` | Skip all interactive prompts and use defaults |
| `--install`    | —     | `true`  | Install dependencies after scaffolding        |
| `--no-install` | —     | —       | Skip dependency installation                  |
| `--git`        | —     | `true`  | Initialize a git repository                   |
| `--no-git`     | —     | —       | Skip git initialization                       |

### Non-interactive mode

Activates when `--yes` is passed or stdin is not a TTY (CI, agent-driven workflows).

```bash
# Defaults: install deps + init git
create-rune-app my-cli --yes

# Scaffold into the current directory
create-rune-app . --yes

# Skip install and git
create-rune-app my-cli --yes --no-install --no-git
```

In non-interactive mode:

- Project name is **required** as an argument (fails with `missing-project-name` error if omitted)
- Target directory must **not** already exist (fails with `directory-exists` error)
- When `.` is used, the current directory must be **empty** (fails with `directory-not-empty` error)
- All defaults or explicitly-passed flags are used without prompting

### Interactive mode

Default when running in a TTY without `--yes`. Prompts for:

1. **Project name** (if not provided as argument; skipped when `.` is used) — validates non-empty and directory available
2. **Install dependencies** (unless `--install` or `--no-install` explicitly passed)
3. **Initialize git** (unless `--git` or `--no-git` explicitly passed, or git is unavailable / already in a repo)

Explicitly-passed flags skip their corresponding prompts even in interactive mode.

### Git initialization behavior

- Skipped with a log message if git is not installed
- Skipped with a log message if already inside a git repository
- When initialized: runs `git init`, creates `main` branch if no default configured, stages all files, commits as "Initial commit from Create Rune App"

### Package manager detection

Automatically detects the invoking package manager from `npm_config_user_agent`. Adapts install commands and "next steps" output accordingly. Falls back to npm.

## Starter project structure

```
my-cli/
├── src/
│   └── commands/
│       └── hello.ts        # Sample command
├── tests/
│   └── commands/
│       └── hello.test.ts   # Sample test
├── package.json
└── tsconfig.json
```

The `src/commands/` directory is where file-based routing begins. Each `.ts` file or directory maps to a CLI command path. See [commands.md](./commands.md) for details.

## Running and building

```bash
rune run <command> [args...]   # Run from source without building
rune build                     # Build into dist/
```

Both accept `--project <path>` to specify the project root.

After building, the entry point in `dist/cli.mjs` (configured via `package.json` `bin` field) can be executed directly or via `npx`.
