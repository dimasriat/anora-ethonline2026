import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecOptions = { cwd?: string };
export type ExecResult = { stdout: string; stderr: string; exitCode: number };

/* Toolchain output is small but `forge` and `cast` can print long traces, and a
   truncated stream would surface as a parse failure instead of the real error. */
const MAX_BUFFER = 64 * 1024 * 1024;

/* Rejects on a non-zero exit, and the rejection carries `stderr`, which is what
   flow.ts reads to report why a circuit run failed. */
export async function run(
  file: string,
  args: string[],
  options: ExecOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(file, args, {
    cwd: options.cwd,
    maxBuffer: MAX_BUFFER,
    encoding: "utf8",
  });
  return { stdout, stderr };
}

export async function runAllowingFailure(
  file: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await run(file, args, options);
    return { stdout, stderr, exitCode: 0 };
  } catch (cause) {
    const failure = cause as { stdout?: string; stderr?: string; code?: number };
    if (failure.stdout === undefined && failure.stderr === undefined) throw cause;
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: failure.code ?? 1,
    };
  }
}
