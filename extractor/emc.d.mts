export type EmcProgram = { order: number[]; code: number[]; strings: string[] };
export function parseEmc(bytes: Uint8Array): EmcProgram;
export function runEmc(program: EmcProgram, fn: number, syscall: (id: number, args: number[], strings: string[], registers: Int16Array) => number | void,
  registers?: Record<number, number>, limit?: number): { regs: number[]; ret: number; steps: number };
