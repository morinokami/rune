export function isHelpFlag(token: string): boolean {
  return token === "--help" || token === "-h";
}

export function isVersionFlag(token: string): boolean {
  return token === "--version" || token === "-V";
}
