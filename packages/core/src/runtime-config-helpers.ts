export interface CompilePromptLimits {
  maxContextChars: number;
  responseReserveChars: number;
  analysisSourceMaxChars: number;
  generationAnalysisItemLimit: number;
  generationPromptStringMaxChars: number;
  generationPromptArrayLimit: number;
  generationPromptObjectKeyLimit: number;
}

export function computeCompilePromptLimits(maxContextChars: number): CompilePromptLimits {
  const safeMaxContextChars =
    Number.isSafeInteger(maxContextChars) && maxContextChars > 0 ? maxContextChars : 24_000;
  const responseReserveChars = Math.floor(safeMaxContextChars * 0.15);
  const fillablePromptChars = Math.max(1, safeMaxContextChars - responseReserveChars);

  return {
    maxContextChars: safeMaxContextChars,
    responseReserveChars,
    analysisSourceMaxChars: clampInteger(Math.floor(fillablePromptChars * 0.3), 2_000, 50_000),
    generationAnalysisItemLimit: clampInteger(Math.floor(safeMaxContextChars / 3_000), 4, 16),
    generationPromptStringMaxChars: clampInteger(Math.floor(safeMaxContextChars / 30), 400, 2_000),
    generationPromptArrayLimit: clampInteger(Math.floor(safeMaxContextChars / 2_000), 8, 24),
    generationPromptObjectKeyLimit: clampInteger(Math.floor(safeMaxContextChars / 1_200), 12, 30),
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function maskSecret(value: string | undefined): string {
  if (!value) {
    return "Missing";
  }

  if (value.length < 8) {
    return "Configured";
  }

  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
