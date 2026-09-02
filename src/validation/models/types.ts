export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  score: number; // 0-100 quality score
}

export interface ValidationError {
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  suggestion?: string;
}

export interface ValidationWarning extends ValidationError {
  severity: 'warning';
}

export interface ReferenceValidationResult {
  reference: string;
  type: string;
  isValid: boolean;
  error?: string;
  suggestions: string[];
}

export interface ParsedBlock {
  type: string;
  name: string;
  properties: Record<string, any>;
  startLine: number;
  endLine: number;
  rawContent: string;
}