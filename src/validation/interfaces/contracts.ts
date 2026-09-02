import type { ParsedBlock, ReferenceValidationResult, ValidationResult } from '../models/types.js';

export type PropertyValidator =
  | { type: 'number'; min: number; max: number }
  | { type: 'boolean' }
  | { type: 'string' }
  | { type: 'enum'; values: string[] }
  | { type: 'reference'; referenceType: string };

export type ReferenceChecker = (
  reference: string,
  type?: string
) => Promise<ReferenceValidationResult[]>;

export interface BlockValidator {
  (
    block: ParsedBlock,
    result: ValidationResult,
    strict: boolean,
    checkReferences: ReferenceChecker
  ): void | Promise<void>;
}

export interface ReferenceProvider {
  checkReference(reference: string, type?: string): Promise<boolean>;
  getSimilarItems(reference: string, limit: number): Promise<string[]>;
}