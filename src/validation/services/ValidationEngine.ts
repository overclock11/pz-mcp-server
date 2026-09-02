import type {
  ReferenceProvider,
} from '../interfaces/contracts.js';
import type {
  ReferenceValidationResult,
  ValidationResult,
} from '../models/types.js';
import { parseScriptBlocks } from './scriptParser.js';
import { validateBlock } from './blockValidators.js';
import {
  calculateQualityScore,
  validateModuleStructure,
  validateSyntax,
  validateTypeConsistency,
} from './structuralValidators.js';

export class ValidationEngine {
  private db: ReferenceProvider;

  constructor(db: ReferenceProvider) {
    this.db = db;
  }

  async validateScript(
    content: string,
    expectedType?: string,
    strict: boolean = false
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      score: 100,
    };

    try {
      const blocks = parseScriptBlocks(content);

      const checkReferences = (reference: string, type?: string) =>
        this.checkReferences([reference], type);

      for (const block of blocks) {
        await validateBlock(block, result, strict, checkReferences);
      }

      // Additional validations
      validateModuleStructure(content, result);
      validateSyntax(content, result);

      // Type consistency check
      if (expectedType) {
        validateTypeConsistency(blocks, expectedType, result);
      }

      // Calculate final validity and score
      result.isValid = result.errors.length === 0;
      result.score = calculateQualityScore(result);
    } catch (error) {
      result.errors.push({
        line: 0,
        message: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
        code: 'PARSE_ERROR',
      });
      result.isValid = false;
      result.score = 0;
    }

    return result;
  }

  async checkReferences(
    references: string[],
    type: string = 'all'
  ): Promise<ReferenceValidationResult[]> {
    const results: ReferenceValidationResult[] = [];

    for (const reference of references) {
      const result: ReferenceValidationResult = {
        reference,
        type,
        isValid: false,
        suggestions: [],
      };

      try {
        // Check if reference exists in database
        const exists = await this.db.checkReference(reference, type === 'all' ? undefined : type);

        if (exists) {
          result.isValid = true;
        } else {
          result.error = `Reference '${reference}' not found`;

          // Get similar references for suggestions
          const suggestions = await this.db.getSimilarItems(reference, 5);
          result.suggestions = suggestions;
        }
      } catch (error) {
        result.error = `Validation error: ${error instanceof Error ? error.message : String(error)}`;
      }

      results.push(result);
    }

    return results;
  }
}

export type {
  BlockValidator,
  PropertyValidator,
  ReferenceChecker,
  ReferenceProvider,
} from '../interfaces/contracts.js';
export type {
  ParsedBlock,
  ReferenceValidationResult,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from '../models/types.js';