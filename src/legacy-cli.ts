import { createProgram, KNOWN_COMMANDS } from './cli/program.js';
import { createCliContext } from './cli/shared.js';
import { resolveCliInvocation } from './lib/cli-args.js';

class LegacyCliExit extends Error {
  constructor(readonly code: number) {
    super(`legacy-cli exited with code ${code}`);
    this.name = 'LegacyCliExit';
  }
}

function trapProcessExit(): () => void {
  const originalExit = process.exit;

  process.exit = ((code?: number | string | null | undefined) => {
    const resolved = typeof code === 'number' ? code : Number(code ?? 0);
    throw new LegacyCliExit(Number.isFinite(resolved) ? resolved : 1);
  }) as typeof process.exit;

  return () => {
    process.exit = originalExit;
  };
}

export async function runLegacyCli(rawArgs: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const normalizedArgs = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
  const ctx = createCliContext(normalizedArgs, env);
  const program = createProgram(ctx);
  const { argv, showHelp } = resolveCliInvocation(normalizedArgs, KNOWN_COMMANDS);

  if (showHelp) {
    program.outputHelp();
    return 0;
  }

  const restoreExit = trapProcessExit();

  try {
    if (argv) {
      await program.parseAsync(argv);
    } else {
      await program.parseAsync(['node', 'bird', ...normalizedArgs]);
    }

    return 0;
  } catch (error) {
    if (error instanceof LegacyCliExit) {
      return error.code;
    }

    throw error;
  } finally {
    restoreExit();
  }
}
