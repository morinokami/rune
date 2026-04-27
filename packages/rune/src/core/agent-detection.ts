export interface ResolveAgentDetectedInput {
  readonly simulateAgent: boolean | undefined;
  readonly detectedAgent: boolean;
  readonly env: NodeJS.ProcessEnv;
}

export function resolveAgentDetected(input: ResolveAgentDetectedInput): boolean {
  if (input.simulateAgent !== undefined) {
    return input.simulateAgent;
  }
  if (isAutoJsonDisabled(input.env)) {
    return false;
  }
  return input.detectedAgent;
}

export function isAutoJsonDisabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.RUNE_DISABLE_AUTO_JSON;
  return value === "1" || value === "true";
}
