import { DatabaseManager } from '../database/DatabaseManager.js';

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

export class ValidationEngine {
  private db: DatabaseManager;
  
  // Define required properties for different block types (Build 42)
  private readonly requiredProperties = {
    item: ['DisplayName'],
    recipe: ['Result'],
    craftrecipe: [],
    fixing: ['Require', 'Fixer'],
    sound: ['category'],
    vehicle: ['template'],
    evolvedrecipe: ['BaseItem', 'ResultItem'],
  };

  // Define valid property types and ranges (Build 42 values)
  private readonly propertyValidators = {
    // Numeric properties with ranges
    Weight: { type: 'number', min: 0, max: 1000 },
    MaxDamage: { type: 'number', min: 0, max: 100 },
    MinDamage: { type: 'number', min: 0, max: 100 },
    ConditionMax: { type: 'number', min: 1, max: 100 },
    Swingtime: { type: 'number', min: 0.1, max: 10 },
    MinimumSwingtime: { type: 'number', min: 0.1, max: 10 },
    SwingTime: { type: 'number', min: 0.1, max: 10 },
    Time: { type: 'number', min: 1, max: 10000 },
    CriticalChance: { type: 'number', min: 0, max: 100 },
    CritDmgMultiplier: { type: 'number', min: 0, max: 100 },
    Sharpness: { type: 'number', min: 0, max: 10 },
    WeaponLength: { type: 'number', min: 0, max: 5 },
    MaxRange: { type: 'number', min: 0, max: 100 },
    MinRange: { type: 'number', min: 0, max: 100 },
    DoorDamage: { type: 'number', min: 0, max: 1000 },
    TreeDamage: { type: 'number', min: 0, max: 100 },
    MaxHitcount: { type: 'number', min: 1, max: 10 },
    HitAngleMod: { type: 'number', min: -360, max: 360 },
    MinAngle: { type: 'number', min: -360, max: 360 },
    PushBackMod: { type: 'number', min: 0, max: 10 },
    KnockdownMod: { type: 'number', min: 0, max: 10 },
    MetalValue: { type: 'number', min: 0, max: 100 },

    // Boolean properties
    CanBeEquipped: { type: 'boolean' },
    KnockBackOnNoDeath: { type: 'boolean' },
    IsCookable: { type: 'boolean' },
    TwoHandWeapon: { type: 'boolean' },
    DamageMakeHole: { type: 'boolean' },
    RequiresEquippedBothHands: { type: 'boolean' },
    CanBeDoneFromFloor: { type: 'boolean' },

    // String properties with valid values
    ItemType: { type: 'enum', values: ['base:normal', 'base:weapon', 'base:weaponpart', 'base:food', 'base:literature', 'base:container', 'base:clothing', 'base:alarmclock', 'base:alarmclockclothing', 'base:key', 'base:drainable', 'base:moveable', 'base:map', 'base:radio', 'base:animal'] },
    Type: { type: 'enum', values: ['Normal', 'Weapon', 'Food', 'Literature', 'Container', 'Clothing', 'AlarmClock', 'Key', 'Drainable', 'Moveable'] },
    DisplayCategory: { type: 'string' }, // B42 has ~80 valid categories; validated against DB
    DamageCategory: { type: 'enum', values: ['Slash', 'Stab', 'Blunt', 'Burn', 'Bite'] },
    SwingAnim: { type: 'string' },
    RunAnim: { type: 'string' },
    Categories: { type: 'string' }, // Can be multiple values separated by ;
    DisplayName: { type: 'string' },
    SubCategory: { type: 'string' },
    Tags: { type: 'string' },
    tags: { type: 'string' }, // craftRecipe uses lowercase
    IconsForTexture: { type: 'string' },
    AttachmentType: { type: 'string' },
    BaseSpeed: { type: 'number', min: 0.1, max: 5 },
    ConditionLowerChanceOneIn: { type: 'number', min: 1, max: 1000 },
    OnBreak: { type: 'string' },
    TimedAction: { type: 'string' },
    timedAction: { type: 'string' },
    SkillRequired: { type: 'string' },
    xpAward: { type: 'string' },
    HeadCondition: { type: 'number', min: 0, max: 100 },
    HeadConditionLowerChanceMultiplier: { type: 'number', min: 0, max: 10 },
    MaxHitCount: { type: 'number', min: 1, max: 10 },
    MinimumSwingTime: { type: 'number', min: 0.1, max: 10 },
    SwingAmountBeforeImpact: { type: 'number', min: 0, max: 1 },
    SplatNumber: { type: 'number', min: 0, max: 20 },
    SplatBloodOnNoDeath: { type: 'boolean' },

    // Sound references
    SwingSound: { type: 'reference', referenceType: 'sound' },
    HitSound: { type: 'reference', referenceType: 'sound' },
    BreakSound: { type: 'reference', referenceType: 'sound' },
    DropSound: { type: 'reference', referenceType: 'sound' },
    ImpactSound: { type: 'reference', referenceType: 'sound' },
    ClickSound: { type: 'reference', referenceType: 'sound' },
    DoorHitSound: { type: 'reference', referenceType: 'sound' },
    HitFloorSound: { type: 'reference', referenceType: 'sound' },

    // B42 firearm properties
    AmmoType: { type: 'string' },
    AmmoBox: { type: 'string' },
    MagazineType: { type: 'string' },
    MaxAmmo: { type: 'number', min: 1, max: 500 },
    FireMode: { type: 'string' },
    FireModePossibilities: { type: 'string' },
    JamGunChance: { type: 'number', min: 0, max: 100 },
    CyclicRateMultiplier: { type: 'number', min: 0, max: 10 },
    RecoilDelay: { type: 'number', min: 0, max: 100 },
    SoundRadius: { type: 'number', min: 0, max: 1000 },
    SoundVolume: { type: 'number', min: 0, max: 100 },
    HitChance: { type: 'number', min: 0, max: 100 },
    Aimingtime: { type: 'number', min: 0, max: 100 },
    AimingTime: { type: 'number', min: 0, max: 100 },
    Reloadtime: { type: 'number', min: 0, max: 100 },
    ReloadTime: { type: 'number', min: 0, max: 100 },
    AimingPerkCritModifier: { type: 'number', min: -100, max: 100 },
    AimingPerkHitChanceModifier: { type: 'number', min: -100, max: 100 },
    AimingPerkMinAngleModifier: { type: 'number', min: -10, max: 10 },
    AimingPerkRangeModifier: { type: 'number', min: -100, max: 100 },
    ModelWeaponPart: { type: 'string' },
    WorldStaticModel: { type: 'string' },

    // B42 weapon part properties
    MountOn: { type: 'string' },
    PartType: { type: 'string' },
    WeightModifier: { type: 'number', min: -10, max: 10 },
    HitChanceModifier: { type: 'number', min: -100, max: 100 },
    RecoilDelayModifier: { type: 'number', min: -100, max: 100 },
    AimingTimeModifier: { type: 'number', min: -100, max: 100 },
    CanAttach: { type: 'string' },
    CanDetach: { type: 'string' },
    Tooltip: { type: 'string' },
  };

  constructor(db: DatabaseManager) {
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
      const blocks = this.parseScriptBlocks(content);
      
      for (const block of blocks) {
        await this.validateBlock(block, result, strict);
      }

      // Additional validations
      this.validateModuleStructure(content, result);
      this.validateSyntax(content, result);
      
      // Type consistency check
      if (expectedType) {
        this.validateTypeConsistency(blocks, expectedType, result);
      }

      // Calculate final validity and score
      result.isValid = result.errors.length === 0;
      result.score = this.calculateQualityScore(result);

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

  private parseScriptBlocks(content: string): Array<{
    type: string;
    name: string;
    properties: Record<string, any>;
    startLine: number;
    endLine: number;
    rawContent: string;
  }> {
    
    const blocks: Array<any> = [];
    const lines = content.split('\n');
    
    let currentBlock: any = null;
    let braceLevel = 0;
    let inModule = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Skip empty lines and comments
      if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        continue;
      }

      // Handle module declarations
      if (line.startsWith('module ') && !inModule) {
        inModule = true;
        continue;
      }

      // Count braces
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceLevel += openBraces - closeBraces;

      // Check for block start
      const blockMatch = line.match(/^(item|recipe|evolvedrecipe|fixing|sound|vehicle|craftRecipe)\s+([^\s{]+)/);
      if (blockMatch && !currentBlock) {
        currentBlock = {
          type: blockMatch[1].toLowerCase(),
          name: blockMatch[2],
          properties: {},
          startLine: lineNumber,
          endLine: 0,
          rawContent: '',
        };
        continue;
      }

      // Parse properties within block
      if (currentBlock && braceLevel > 0) {
        currentBlock.rawContent += line + '\n';
        this.parseProperty(line, currentBlock.properties, currentBlock.type);
      }

      // Check if block is complete
      if (currentBlock && braceLevel === (inModule ? 1 : 0) && line.includes('}')) {
        currentBlock.endLine = lineNumber;
        blocks.push(currentBlock);
        currentBlock = null;
      }

      // Check if exiting module
      if (inModule && braceLevel === 0 && line.includes('}')) {
        inModule = false;
      }
    }

    return blocks;
  }

  private parseProperty(line: string, properties: Record<string, any>, blockType: string): void {
    // Different block types use different syntax
    let match: RegExpMatchArray | null = null;

    if (blockType === 'item' || blockType === 'sound' || blockType === 'vehicle' || blockType === 'craftrecipe') {
      // Use "property = value," format
      match = line.match(/^\s*(\w+)\s*=\s*([^,]+),?\s*$/);
    } else if (blockType === 'recipe' || blockType === 'evolvedrecipe') {
      // Use "property:value," format
      match = line.match(/^\s*(\w+)\s*:\s*([^,]+),?\s*$/);
    } else if (blockType === 'fixing') {
      // Special handling for fixing blocks
      if (line.includes('Require :')) {
        match = line.match(/Require\s*:\s*([^,]+),?\s*$/);
        if (match) {
          properties.Require = match[1].trim();
        }
        return;
      } else if (line.includes('Fixer :')) {
        match = line.match(/Fixer\s*:\s*([^,]+),?\s*$/);
        if (match) {
          if (!properties.Fixer) properties.Fixer = [];
          properties.Fixer.push(match[1].trim());
        }
        return;
      }
    }

    if (match) {
      const [, key, value] = match;
      properties[key] = this.parseValue(value.trim());
    }
  }

  private parseValue(value: string): any {
    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // Parse numbers
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    
    if (/^\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // Parse booleans
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    return value;
  }

  private async validateBlock(
    block: any, 
    result: ValidationResult, 
    strict: boolean
  ): Promise<void> {
    
    // Check required properties (Build 42: ItemType or legacy Type for items)
    const required = this.requiredProperties[block.type as keyof typeof this.requiredProperties];
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
      await this.validateProperty(key, value, block, result, strict);
    }

    // Type-specific validations
    await this.validateBlockSpecific(block, result, strict);
  }

  private async validateProperty(
    key: string, 
    value: any, 
    block: any, 
    result: ValidationResult, 
    strict: boolean
  ): Promise<void> {
    
    const validator = this.propertyValidators[key as keyof typeof this.propertyValidators];
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
      const referenceResults = await this.checkReferences([String(value)], validator.referenceType);
      const refResult = referenceResults[0];
      
      if (!refResult.isValid) {
        result.warnings.push({
          line: block.startLine,
          message: `Reference "${value}" not found in game database`,
          severity: 'warning',
          code: 'INVALID_REFERENCE',
          suggestion: refResult.suggestions.length > 0 
            ? `Did you mean: ${refResult.suggestions[0]}?`
            : undefined,
        });
      }
    }
  }

  private async validateBlockSpecific(
    block: any, 
    result: ValidationResult, 
    strict: boolean
  ): Promise<void> {
    
    switch (block.type) {
      case 'item':
        this.validateItemBlock(block, result);
        break;
      case 'recipe':
        await this.validateRecipeBlock(block, result);
        break;
      case 'craftrecipe':
        this.validateCraftRecipeBlock(block, result);
        break;
      case 'fixing':
        this.validateFixingBlock(block, result);
        break;
      case 'sound':
        this.validateSoundBlock(block, result);
        break;
    }
  }

  private validateItemBlock(block: any, result: ValidationResult): void {
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

  private validateCraftRecipeBlock(block: any, result: ValidationResult): void {
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

  private async validateRecipeBlock(block: any, result: ValidationResult): Promise<void> {
    // Check if result item exists or is defined
    if (block.properties.Result) {
      const resultCheck = await this.checkReferences([block.properties.Result], 'item');
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

  private validateFixingBlock(block: any, result: ValidationResult): void {
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

  private validateSoundBlock(block: any, result: ValidationResult): void {
    if (!block.properties.category) {
      result.errors.push({
        line: block.startLine,
        message: 'Sound block must specify a category',
        severity: 'error',
        code: 'MISSING_SOUND_CATEGORY',
      });
    }
  }

  private validateModuleStructure(content: string, result: ValidationResult): void {
    if (!content.includes('module ')) {
      result.warnings.push({
        line: 1,
        message: 'Script should be wrapped in a module block (e.g., "module Base { ... }")',
        severity: 'warning',
        code: 'MISSING_MODULE',
      });
    }
  }

  private validateSyntax(content: string, result: ValidationResult): void {
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

  private validateTypeConsistency(
    blocks: any[], 
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

  private calculateQualityScore(result: ValidationResult): number {
    let score = 100;

    // Deduct points for errors and warnings
    score -= result.errors.length * 10;
    score -= result.warnings.length * 5;

    // Ensure score doesn't go below 0
    return Math.max(0, score);
  }
}
