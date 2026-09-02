import type { ParsedBlock, ValidationResult } from '../models/types.js';

export function validateModuleStructure(content: string, result: ValidationResult): void {
  if (!content.includes('module ')) {
    result.warnings.push({
      line: 1,
      message: 'Script should be wrapped in a module block (e.g., "module Base { ... }")',
      severity: 'warning',
      code: 'MISSING_MODULE',
    });
  }
}

export function validateSyntax(content: string, result: ValidationResult): void {
  const lines = content.split('\n');
  let braceLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNumber = i + 1;

    if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

    // Count braces
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    braceLevel += openBraces - closeBraces;

    // Check for negative brace level (more closing than opening)
    if (braceLevel < 0) {
      result.errors.push({
        line: lineNumber,
        message: 'Unexpected closing brace "}"',
        severity: 'error',
        code: 'SYNTAX_ERROR',
      });
      braceLevel = 0; // Reset to continue parsing
    }
  }

  // Check if braces are balanced
  if (braceLevel > 0) {
    result.errors.push({
      line: lines.length,
      message: `Missing ${braceLevel} closing brace(s) "}"`,
      severity: 'error',
      code: 'SYNTAX_ERROR',
    });
  }
}

export function validateTypeConsistency(
  blocks: ParsedBlock[],
  expectedType: string,
  result: ValidationResult
): void {
  for (const block of blocks) {
    // Build 42: 'recipe' expectedType matches craftrecipe blocks
    const normalizedExpected = expectedType === 'recipe' ? ['recipe', 'craftrecipe'] : [expectedType];
    if (!normalizedExpected.includes(block.type)) {
      result.warnings.push({
        line: block.startLine,
        message: `Expected ${expectedType} block but found ${block.type}`,
        severity: 'warning',
        code: 'TYPE_MISMATCH',
      });
    }
  }
}

export function calculateQualityScore(result: ValidationResult): number {
  let score = 100;

  // Deduct points for errors and warnings
  score -= result.errors.length * 10;
  score -= result.warnings.length * 5;

  // Ensure score doesn't go below 0
  return Math.max(0, score);
}