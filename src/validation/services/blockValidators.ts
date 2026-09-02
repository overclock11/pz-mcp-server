import type {
  BlockValidator,
  ReferenceChecker,
} from '../interfaces/contracts.js';
import type { ParsedBlock, ValidationResult } from '../models/types.js';
import { PROPERTY_VALIDATORS, REQUIRED_PROPERTIES } from '../models/propertyRules.js';

export async function validateBlock(
  block: ParsedBlock,
  result: ValidationResult,
  strict: boolean,
  checkReferences: ReferenceChecker
): Promise<void> {
  // Check required properties (Build 42: ItemType or legacy Type for items)
  const required = REQUIRED_PROPERTIES[block.type];
  if (required) {
    for (const prop of required) {
      if (!block.properties[prop]) {
        result.errors.push({
          line: block.startLine,
          message: `Missing required property: ${prop}`,
          severity: 'error',
          code: 'MISSING_PROPERTY',
          suggestion: `Add "${prop} = <value>," to the ${block.type} block`,
        });
      }
    }
  }

  if (block.type === 'item' && !block.properties.ItemType && !block.properties.Type) {
    result.errors.push({
      line: block.startLine,
      message: 'Missing required property: ItemType',
      severity: 'error',
      code: 'MISSING_PROPERTY',
      suggestion: 'Build 42 requires "ItemType = base:weapon," (or base:food, base:normal, etc.)',
    });
  }

  // Validate individual properties
  for (const [key, value] of Object.entries(block.properties)) {
    await validateProperty(key, value, block, result, strict, checkReferences);
  }

  // Type-specific validations
  const validator = BLOCK_VALIDATORS[block.type];
  if (validator) {
    await validator(block, result, strict, checkReferences);
  }
}

async function validateProperty(
  key: string,
  value: any,
  block: ParsedBlock,
  result: ValidationResult,
  strict: boolean,
  checkReferences: ReferenceChecker
): Promise<void> {
  const validator = PROPERTY_VALIDATORS[key];
  if (!validator) {
    if (strict) {
      result.warnings.push({
        line: block.startLine,
        message: `Unknown property: ${key}`,
        severity: 'warning',
        code: 'UNKNOWN_PROPERTY',
      });
    }
    return;
  }

  // Type validation
  if (validator.type === 'number') {
    if (typeof value !== 'number') {
      result.errors.push({
        line: block.startLine,
        message: `Property ${key} must be a number, got ${typeof value}`,
        severity: 'error',
        code: 'INVALID_TYPE',
      });
      return;
    }

    // Range validation
    if (validator.min !== undefined && value < validator.min) {
      result.errors.push({
        line: block.startLine,
        message: `Property ${key} value ${value} is below minimum ${validator.min}`,
        severity: 'error',
        code: 'VALUE_OUT_OF_RANGE',
      });
    }

    if (validator.max !== undefined && value > validator.max) {
      result.errors.push({
        line: block.startLine,
        message: `Property ${key} value ${value} is above maximum ${validator.max}`,
        severity: 'error',
        code: 'VALUE_OUT_OF_RANGE',
      });
    }
  }

  if (validator.type === 'boolean') {
    if (typeof value !== 'boolean') {
      result.errors.push({
        line: block.startLine,
        message: `Property ${key} must be TRUE or FALSE, got ${value}`,
        severity: 'error',
        code: 'INVALID_TYPE',
      });
    }
  }

  if (validator.type === 'enum') {
    if (!validator.values?.includes(String(value))) {
      result.errors.push({
        line: block.startLine,
        message: `Property ${key} has invalid value "${value}". Valid values: ${validator.values?.join(', ')}`,
        severity: 'error',
        code: 'INVALID_ENUM_VALUE',
      });
    }
  }

  // Reference validation
  if (validator.type === 'reference') {
    const referenceResults = await checkReferences(String(value), validator.referenceType);
    const refResult = referenceResults[0];

    if (!refResult.isValid) {
      result.warnings.push({
        line: block.startLine,
        message: `Reference "${value}" not found in game database`,
        severity: 'warning',
        code: 'INVALID_REFERENCE',
        ...(refResult.suggestions.length > 0
          ? { suggestion: `Did you mean: ${refResult.suggestions[0]}?` }
          : {}),
      });
    }
  }
}

function validateItemBlock(block: ParsedBlock, result: ValidationResult): void {
  // Build 42 weapon detection (ItemType) with legacy Type fallback
  const isWeapon = block.properties.ItemType === 'base:weapon' || block.properties.Type === 'Weapon';
  // Build 42 food detection
  const isFood = block.properties.ItemType === 'base:food' || block.properties.Type === 'Food';

  if (isWeapon) {
    if (!block.properties.MaxDamage && !block.properties.MinDamage) {
      result.warnings.push({
        line: block.startLine,
        message: 'Weapon items should have damage properties (MaxDamage, MinDamage)',
        severity: 'warning',
        code: 'MISSING_WEAPON_STATS',
      });
    }

    if (!block.properties.Categories) {
      result.warnings.push({
        line: block.startLine,
        message: 'Weapon items should specify Categories (e.g., base:longblade, base:smallblade, base:blunt)',
        severity: 'warning',
        code: 'MISSING_WEAPON_CATEGORY',
      });
    }
  }

  if (isFood) {
    if (!block.properties.HungerChange && !block.properties.Calories) {
      result.warnings.push({
        line: block.startLine,
        message: 'Food items should have nutrition properties (HungerChange, Calories)',
        severity: 'warning',
        code: 'MISSING_FOOD_STATS',
      });
    }
  }

  // Balance warnings (Build 42 damage scale: vanilla weapons go up to ~8+)
  if (block.properties.Weight && block.properties.Weight > 50) {
    result.warnings.push({
      line: block.startLine,
      message: `Item weight ${block.properties.Weight} seems very high for normal gameplay`,
      severity: 'warning',
      code: 'BALANCE_WARNING',
    });
  }
}

function validateCraftRecipeBlock(block: ParsedBlock, result: ValidationResult): void {
  if (!block.properties.time) {
    result.warnings.push({
      line: block.startLine,
      message: 'craftRecipe should specify crafting "time" (in game seconds)',
      severity: 'warning',
      code: 'MISSING_RECIPE_TIME',
    });
  }

  if (!block.properties.category) {
    result.warnings.push({
      line: block.startLine,
      message: 'craftRecipe should specify a "category" (e.g., Farming, Survival, Cooking)',
      severity: 'warning',
      code: 'MISSING_RECIPE_CATEGORY',
    });
  }

  if (!block.rawContent.includes('inputs')) {
    result.warnings.push({
      line: block.startLine,
      message: 'craftRecipe should define an "inputs" block',
      severity: 'warning',
      code: 'MISSING_RECIPE_INPUTS',
    });
  }

  if (!block.rawContent.includes('outputs')) {
    result.warnings.push({
      line: block.startLine,
      message: 'craftRecipe should define an "outputs" block',
      severity: 'warning',
      code: 'MISSING_RECIPE_OUTPUTS',
    });
  }
}

async function validateRecipeBlock(
  block: ParsedBlock,
  result: ValidationResult,
  _strict: boolean,
  checkReferences: ReferenceChecker
): Promise<void> {
  // Check if result item exists or is defined
  if (block.properties.Result) {
    const resultCheck = await checkReferences(String(block.properties.Result), 'item');
    if (!resultCheck[0].isValid) {
      result.warnings.push({
        line: block.startLine,
        message: `Recipe result "${block.properties.Result}" not found in game database`,
        severity: 'warning',
        code: 'UNKNOWN_RESULT_ITEM',
      });
    }
  }

  // Validate recipe time
  if (block.properties.Time && block.properties.Time > 1000) {
    result.warnings.push({
      line: block.startLine,
      message: `Recipe time ${block.properties.Time} seems very long (over 16 minutes)`,
      severity: 'warning',
      code: 'BALANCE_WARNING',
    });
  }
}

function validateFixingBlock(block: ParsedBlock, result: ValidationResult): void {
  if (!block.properties.Require) {
    result.errors.push({
      line: block.startLine,
      message: 'Fixing block must specify a required item to repair',
      severity: 'error',
      code: 'MISSING_REQUIRED_ITEM',
    });
  }

  if (!block.properties.Fixer || block.properties.Fixer.length === 0) {
    result.errors.push({
      line: block.startLine,
      message: 'Fixing block must specify at least one fixer option',
      severity: 'error',
      code: 'MISSING_FIXER',
    });
  }
}

function validateSoundBlock(block: ParsedBlock, result: ValidationResult): void {
  if (!block.properties.category) {
    result.errors.push({
      line: block.startLine,
      message: 'Sound block must specify a category',
      severity: 'error',
      code: 'MISSING_SOUND_CATEGORY',
    });
  }
}

export const BLOCK_VALIDATORS: Record<string, BlockValidator> = {
  item: validateItemBlock,
  recipe: validateRecipeBlock,
  craftrecipe: validateCraftRecipeBlock,
  fixing: validateFixingBlock,
  sound: validateSoundBlock,
};