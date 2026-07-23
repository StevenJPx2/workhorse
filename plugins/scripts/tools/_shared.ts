// Shared helper for the scripts stage tools.
export const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
