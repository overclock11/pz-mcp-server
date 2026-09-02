import type { DatabaseManager, GameItem } from '../../database/index.js';
import type { GenerationOptions, ItemTemplate } from '../models/types.js';

export class ScriptGenerator {
  private db: DatabaseManager;
  private templates: Map<string, ItemTemplate> = new Map();

  constructor(db: DatabaseManager) {
    this.db = db;
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Weapon templates (Build 42 format)
    this.templates.set('melee_weapon', {
      type: 'item',
      category: 'Weapon',
      baseStats: {
        DisplayCategory: 'Weapon',
        ItemType: 'base:weapon',
        Weight: 2.0,
        BaseSpeed: 1.0,
        MaxDamage: 8.0,
        MinDamage: 8.0,
        MaxRange: 1.4,
        MinRange: 0.61,
        ConditionMax: 10,
        ConditionLowerChanceOneIn: 15,
        CritDmgMultiplier: 6.0,
        CriticalChance: 35.0,
        DamageCategory: 'Slash',
        SubCategory: 'Swinging',
        SwingAnim: 'Bat',
        Swingtime: 3.0,
        MinimumSwingtime: 3.0,
        SwingAmountBeforeImpact: 0.02,
        KnockBackOnNoDeath: true,
        KnockdownMod: 0.0,
        PushBackMod: 0.5,
        HitAngleMod: -30.0,
        MaxHitcount: 3,
        TreeDamage: 1,
        TwoHandWeapon: true,
        WeaponLength: 0.4,
        Sharpness: 1.0,
        RunAnim: 'Run_Weapon2',
        DamageMakeHole: false,
        SplatBloodOnNoDeath: false,
        SplatNumber: 2,
        HeadCondition: 13,
        HeadConditionLowerChanceMultiplier: 1.5,
        Tags: 'base:sharpenable;base:repairwithtape;base:repairwithglue;base:hasmetal',
        Categories: 'base:longblade',
        DoorDamage: 8,
      },
      requiredProperties: ['DisplayName', 'Icon'],
      optionalProperties: ['IconsForTexture', 'AttachmentType', 'WeaponSprite', 'SwingSound', 'HitSound', 'BreakSound', 'DropSound', 'ImpactSound', 'DoorHitSound', 'HitFloorSound', 'OnBreak'],
      balanceMultipliers: {
        powerful: 1.5,
        weak: 0.7,
        vanilla: 1.0,
      },
    });

    this.templates.set('ranged_weapon', {
      type: 'item',
      category: 'Weapon',
      baseStats: {
        DisplayCategory: 'Weapon',
        ItemType: 'base:weapon',
        Weight: 2.0,
        MaxRange: 20,
        MinRange: 0.8,
        AimingTime: 50,
        ConditionMax: 15,
        Categories: 'Firearm',
        RequiresEquippedBothHands: true,
        SubCategory: 'Firearm',
        AimingPerkRangeModifier: 1.5,
        HitChance: 75,
        ProjectileCount: 1,
        ShareDamage: false,
        MaxHitCount: 1,
      },
      requiredProperties: ['DisplayName', 'Icon', 'Type', 'Weight', 'AmmoType'],
      optionalProperties: ['WeaponSprite', 'SwingSound', 'ClickSound', 'EjectAmmoSound'],
      balanceMultipliers: {
        powerful: 1.3,
        weak: 0.8,
        vanilla: 1.0,
      },
    });

    this.templates.set('food_item', {
      type: 'item',
      category: 'Food',
      baseStats: {
        DisplayCategory: 'Food',
        ItemType: 'base:food',
        Weight: 0.1,
        HungerChange: -10,
        ThirstChange: 0,
        Calories: 50,
        Carbohydrates: 5,
        Lipids: 1,
        Proteins: 2,
        DaysFresh: 7,
        DaysTotallyRotten: 14,
        IsCookable: true,
      },
      requiredProperties: ['DisplayName', 'Icon', 'Type'],
      optionalProperties: ['EvolvedRecipe', 'OnEat', 'CustomContextMenu'],
      balanceMultipliers: {
        powerful: 1.2,
        weak: 0.8,
        vanilla: 1.0,
      },
    });

    this.templates.set('tool_item', {
      type: 'item',
      category: 'Tool',
      baseStats: {
        DisplayCategory: 'Tool',
        ItemType: 'base:normal',
        Weight: 0.5,
      },
      requiredProperties: ['DisplayName', 'Icon', 'Type'],
      optionalProperties: ['AttachmentType', 'Tags', 'MetalValue'],
      balanceMultipliers: {
        powerful: 1.1,
        weak: 0.9,
        vanilla: 1.0,
      },
    });

    this.templates.set('clothing_item', {
      type: 'item',
      category: 'Clothing',
      baseStats: {
        DisplayCategory: 'Clothing',
        ItemType: 'base:clothing',
        Weight: 0.3,
        BodyLocation: 'Torso',
        CanBeEquipped: 'Torso',
        BloodLocation: 'Torso',
        FabricType: 'Cotton',
        ClothingItem: 'Base.TShirt_DefaultTEXTURE',
      },
      requiredProperties: ['DisplayName', 'Icon', 'Type', 'BodyLocation'],
      optionalProperties: ['Insulation', 'WindResistance', 'WaterResistance'],
      balanceMultipliers: {
        powerful: 1.2,
        weak: 0.8,
        vanilla: 1.0,
      },
    });

    this.templates.set('model_block', {
      type: 'model',
      category: 'Model',
      baseStats: {
        scale: 1.0,
      },
      requiredProperties: ['mesh'],
      optionalProperties: ['texture'],
      balanceMultipliers: {
        powerful: 1.0,
        weak: 1.0,
        vanilla: 1.0,
      },
    });

    // Recipe template (Build 42 craftRecipe format)
    // OJO: `CanBeDoneFromFloor` es un TAG de bancada, NO una propiedad — como
    // propiedad suelta CraftRecipe.Load aborta y el juego no arranca.
    // El tag de bancada es OBLIGATORIO para que la receta aparezca (pzwiki).
    this.templates.set('basic_recipe', {
      type: 'recipe',
      category: 'Recipe',
      baseStats: {
        time: 100.0,
        category: 'Survival',
        Tags: 'AnySurfaceCraft',
      },
      requiredProperties: ['Result'],
      optionalProperties: ['timedAction', 'Tags', 'OnCreate', 'OnGiveXP'],
      balanceMultipliers: {
        powerful: 0.7, // Faster crafting
        weak: 1.5,     // Slower crafting
        vanilla: 1.0,
      },
    });
  }

  async generateScript(
    type: string,
    name: string,
    specifications: Record<string, any>,
    module: string = 'Base',
    options: GenerationOptions = {}
  ): Promise<string> {

    const content = await this.generateScriptUnwrapped(type, name, specifications, options);

    // Wrap in module if needed
    return this.wrapInModule(content, module, options.includeComments);
  }

  /**
   * Generate script content WITHOUT the module wrapper — used by ModProjectGenerator
   * to group multiple blocks into a single module block.
   */
  async generateScriptUnwrapped(
    type: string,
    name: string,
    specifications: Record<string, any>,
    options: GenerationOptions = {}
  ): Promise<string> {
    const template = this.getTemplate(type, specifications.category);
    if (!template) {
      throw new Error(`No template found for type: ${type}, category: ${specifications.category}`);
    }

    // Get balance reference from similar vanilla items
    const balanceRef = await this.getBalanceReference(type, specifications);

    // Generate the script content
    return this.generateScriptContent(type, name, specifications, template, balanceRef, options);
  }

  private getTemplate(type: string, category?: string): ItemTemplate | null {
    // Try specific category template first
    if (category) {
      const categoryKey = `${category.toLowerCase()}_${type}`;
      if (this.templates.has(categoryKey)) {
        return this.templates.get(categoryKey)!;
      }
    }

    // Try type-specific templates
    const typeTemplates = [
      'melee_weapon',
      'ranged_weapon', 
      'food_item',
      'tool_item',
      'clothing_item',
      'basic_recipe',
    ];

    // Try category-specific templates first (e.g. Weapon -> melee_weapon)
    if (category) {
      for (const templateKey of typeTemplates) {
        if (templateKey.includes(category.toLowerCase())) {
          return this.templates.get(templateKey)!;
        }
      }
    }

    // Try type-specific templates (skip generic 'item', handled by fallback below)
    for (const templateKey of typeTemplates) {
      if (type !== 'item' && templateKey.includes(type)) {
        return this.templates.get(templateKey)!;
      }
    }

    // Default fallback based on type
    switch (type) {
      case 'item':
        return this.templates.get('tool_item')!;
      case 'recipe':
        return this.templates.get('basic_recipe')!;
      case 'model':
        return this.templates.get('model_block')!;
      default:
        return null;
    }
  }

  private async getBalanceReference(type: string, specs: Record<string, any>): Promise<GameItem[]> {
    const searchQueries = [];

    // Build search queries based on specifications
    if (specs.category) {
      searchQueries.push(specs.category);
    }

    if (specs.weaponType) {
      searchQueries.push(specs.weaponType);
    }

    if (specs.similar) {
      searchQueries.push(specs.similar);
    }

    // Default queries for different types
    if (searchQueries.length === 0) {
      switch (type) {
        case 'item':
          if (specs.category === 'Weapon') {
            searchQueries.push('weapon damage');
          } else if (specs.category === 'Food') {
            searchQueries.push('food hunger');
          } else {
            searchQueries.push('tool');
          }
          break;
        case 'recipe':
          searchQueries.push('recipe cooking');
          break;
        default:
          searchQueries.push(type);
      }
    }

    // Search for similar items
    const references: GameItem[] = [];
    for (const query of searchQueries) {
      const results = await this.db.searchContent(query, { 
        type: type === 'item' ? 'item' : type, 
        limit: 5 
      });
      references.push(...results);
    }

    return references;
  }

  private async generateScriptContent(
    type: string,
    name: string,
    specs: Record<string, any>,
    template: ItemTemplate,
    references: GameItem[],
    options: GenerationOptions
  ): Promise<string> {
    
    if (type === 'item') {
      return this.generateItemScript(name, specs, template, references, options);
    } else if (type === 'recipe') {
      return this.generateRecipeScript(name, specs, template, options);
    } else if (type === 'model') {
      return this.generateModelScript(name, specs, template, options);
    } else if (type === 'fixing') {
      return this.generateFixingScript(name, specs, options);
    } else if (type === 'sound') {
      return this.generateSoundScript(name, specs, options);
    }

    throw new Error(`Script generation for type '${type}' not implemented`);
  }

  private generateItemScript(
    name: string,
    specs: Record<string, any>,
    template: ItemTemplate,
    references: GameItem[],
    options: GenerationOptions
  ): string {
    
    const lines: string[] = [];
    
    if (options.includeComments) {
      lines.push(`    /* ${specs.DisplayName || name} - Generated item */`);
    }
    
    lines.push(`    item ${name}`);
    lines.push(`    {`);

    // Merge template stats with user specifications
    const properties = { ...template.baseStats, ...specs };

    // Strip generator control keys (not real script properties)
    delete properties.category;
    delete properties.weaponType;
    delete properties.similar;

    // Remove template keys that differ only by casing (user override wins, e.g. MaxHitcount vs MaxHitCount)
    for (const specKey of Object.keys(specs)) {
      for (const tKey of Object.keys(template.baseStats)) {
        if (tKey !== specKey && tKey.toLowerCase() === specKey.toLowerCase()) {
          delete properties[tKey];
        }
      }
    }

    // Keep damage range consistent when only one bound is overridden
    if (typeof properties.MaxDamage === 'number' && typeof properties.MinDamage === 'number') {
      if (properties.MaxDamage < properties.MinDamage) {
        properties.MinDamage = properties.MaxDamage;
      }
    }

    // Apply balance adjustments
    if (options.balance && options.balance !== 'custom') {
      this.applyBalanceAdjustments(properties, template, options.balance, references);
    }

    // Generate properties
    for (const [key, value] of Object.entries(properties)) {
      if (value !== undefined && value !== null) {
        const formattedValue = this.formatPropertyValue(value);
        lines.push(`        ${key} = ${formattedValue},`);
      }
    }

    lines.push(`    }`);

    return lines.join('\n');
  }

  private generateModelScript(
    name: string,
    specs: Record<string, any>,
    template: ItemTemplate,
    options: GenerationOptions
  ): string {

    const lines: string[] = [];

    if (options.includeComments) {
      lines.push(`    /* ${name} - Generated model definition (Build 42) */`);
    }

    lines.push(`    model ${name}`);
    lines.push(`    {`);

    // Scalar properties (mesh, texture, scale)
    const properties = { ...template.baseStats, ...specs };
    delete properties.worldOffset;
    delete properties.worldRotate;

    for (const [key, value] of Object.entries(properties)) {
      if (value !== undefined && value !== null) {
        lines.push(`        ${key} = ${this.formatPropertyValue(value)},`);
      }
    }

    // World attachment for correct ground placement
    if (specs.worldOffset || specs.worldRotate) {
      lines.push(``);
      lines.push(`        attachment world`);
      lines.push(`        {`);
      if (specs.worldOffset) {
        lines.push(`            offset = ${specs.worldOffset},`);
      }
      if (specs.worldRotate) {
        lines.push(`            rotate = ${specs.worldRotate},`);
      }
      lines.push(`        }`);
    }

    lines.push(`    }`);

    return lines.join('\n');
  }

  private generateRecipeScript(
    name: string,
    specs: Record<string, any>,
    template: ItemTemplate,
    options: GenerationOptions
  ): string {

    const lines: string[] = [];

    if (options.includeComments) {
      lines.push(`    /* ${name} - Generated craftRecipe (Build 42) */`);
    }

    lines.push(`    craftRecipe ${name}`);
    lines.push(`    {`);

    // Merge template properties with user specifications
    const properties = { ...template.baseStats };
    Object.keys(specs).forEach(key => {
      if (!['ingredients', 'result', 'resultCount', 'keep', 'name'].includes(key)) {
        properties[key] = specs[key];
      }
    });

    // CanBeDoneFromFloor como propiedad rompe CraftRecipe.Load — migrar a Tags
    if (properties.CanBeDoneFromFloor !== undefined) {
      const wantsFloor = properties.CanBeDoneFromFloor === true || properties.CanBeDoneFromFloor === 'true';
      delete properties.CanBeDoneFromFloor;
      if (wantsFloor) {
        const tags = String(properties.Tags || '').split(';').filter(Boolean);
        if (!tags.includes('CanBeDoneFromFloor')) tags.push('CanBeDoneFromFloor');
        properties.Tags = tags.join(';');
      }
    }

    // Apply balance adjustments
    if (options.balance && options.balance !== 'custom') {
      this.applyRecipeBalanceAdjustments(properties, template, options.balance);
    }

    // Generate scalar properties (time, category, timedAction, etc.)
    for (const [key, value] of Object.entries(properties)) {
      if (value === undefined || value === null) continue;
      const formattedValue = this.formatPropertyValue(value);
      lines.push(`        ${key} = ${formattedValue},`);
    }

    // Inputs block (Build 42 syntax — los ids van SIEMPRE entre corchetes; tags[...] sin corchetes)
    lines.push(`        inputs`);
    lines.push(`        {`);
    const ingredients = Array.isArray(specs.ingredients) ? specs.ingredients : [];
    for (const ingredient of ingredients) {
      if (typeof ingredient === 'string') {
        const hasMode = ingredient.includes('mode:');
        const ref = hasMode ? ingredient : this.formatIngredientRef(ingredient);
        const suffix = hasMode ? '' : ' mode:destroy';
        lines.push(`            item 1 ${ref}${suffix},`);
      } else if (ingredient.item) {
        const count = ingredient.count || 1;
        const raw = String(ingredient.item);
        const hasMode = raw.includes('mode:');
        let suffix: string;
        if (hasMode) suffix = '';
        else if (ingredient.mode === 'none') suffix = '';
        else if (ingredient.mode) suffix = ` mode:${ingredient.mode}`;
        else if (ingredient.keep) suffix = ' mode:keep';
        else suffix = ' mode:destroy';
        lines.push(`            item ${count} ${this.formatIngredientRef(raw)}${suffix},`);
      }
    }
    lines.push(`        }`);

    // Outputs block
    lines.push(`        outputs`);
    lines.push(`        {`);
    if (specs.result) {
      const resultCount = specs.resultCount || 1;
      lines.push(`            item ${resultCount} ${specs.result},`);
    }
    lines.push(`        }`);

    lines.push(`    }`);

    return lines.join('\n');
  }

  private generateFixingScript(
    name: string,
    specs: Record<string, any>,
    options: GenerationOptions
  ): string {
    
    const lines: string[] = [];
    
    if (options.includeComments) {
      lines.push(`    /* ${name} - Generated fixing script */`);
    }
    
    lines.push(`    fixing ${name}`);
    lines.push(`    {`);

    // Add required item
    if (specs.require) {
      lines.push(`        Require : ${specs.require},`);
      lines.push('');
    }

    // Add fixers
    if (specs.fixers && Array.isArray(specs.fixers)) {
      for (const fixer of specs.fixers) {
        let fixerLine = `        Fixer : ${fixer.material}=${fixer.quantity}`;
        if (fixer.skill && fixer.skillLevel) {
          fixerLine += `; ${fixer.skill}=${fixer.skillLevel}`;
        }
        fixerLine += ',';
        lines.push(fixerLine);
      }
    }

    lines.push(`    }`);

    return lines.join('\n');
  }

  private generateSoundScript(
    name: string,
    specs: Record<string, any>,
    options: GenerationOptions
  ): string {
    
    const lines: string[] = [];
    
    if (options.includeComments) {
      lines.push(`    /* ${name} - Generated sound */`);
    }
    
    lines.push(`    sound ${name}`);
    lines.push(`    {`);

    // Add category
    if (specs.category) {
      lines.push(`        category = ${specs.category},`);
    }

    // Add clip block
    lines.push(`        clip`);
    lines.push(`        {`);

    if (specs.file) {
      lines.push(`            file = ${specs.file},`);
    } else if (specs.event) {
      lines.push(`            event = ${specs.event},`);
    }

    if (specs.distanceMax) {
      lines.push(`            distanceMax = ${specs.distanceMax},`);
    }

    lines.push(`        }`);
    lines.push(`    }`);

    return lines.join('\n');
  }

  private applyBalanceAdjustments(
    properties: Record<string, any>,
    template: ItemTemplate,
    balance: string,
    references: GameItem[]
  ): void {
    
    const multiplier = template.balanceMultipliers[balance] || 1.0;

    // Apply multipliers to damage-related properties
    const damageProps = ['MaxDamage', 'MinDamage', 'CritDmgMultiplier', 'DoorDamage', 'TreeDamage'];
    for (const prop of damageProps) {
      if (properties[prop] && typeof properties[prop] === 'number') {
        properties[prop] = Math.round(properties[prop] * multiplier * 10) / 10;
      }
    }

    // Apply inverse multipliers to negative properties
    const inverseProps = ['Weight', 'SwingTime'];
    for (const prop of inverseProps) {
      if (properties[prop] && typeof properties[prop] === 'number') {
        properties[prop] = Math.round(properties[prop] / multiplier * 10) / 10;
      }
    }

    // Adjust durability
    if (properties.ConditionMax && typeof properties.ConditionMax === 'number') {
      properties.ConditionMax = Math.round(properties.ConditionMax * multiplier);
    }

    // Use reference items for better balance
    if (references.length > 0) {
      this.adjustBasedOnReferences(properties, references, balance);
    }
  }

  private applyRecipeBalanceAdjustments(
    properties: Record<string, any>,
    template: ItemTemplate,
    balance: string
  ): void {
    
    const multiplier = template.balanceMultipliers[balance] || 1.0;

    // Adjust recipe time (inverse for powerful)
    if (properties.Time && typeof properties.Time === 'number') {
      properties.Time = Math.round(properties.Time * (1 / multiplier) * 10) / 10;
    }
  }

  private adjustBasedOnReferences(
    properties: Record<string, any>,
    references: GameItem[],
    balance: string
  ): void {
    
    // Calculate average stats from references
    const avgStats: Record<string, number> = {};
    const numericProps = ['MaxDamage', 'MinDamage', 'Weight', 'ConditionMax'];

    for (const prop of numericProps) {
      const values = references
        .map(ref => ref.properties[prop])
        .filter(val => typeof val === 'number') as number[];
      
      if (values.length > 0) {
        avgStats[prop] = values.reduce((sum, val) => sum + val, 0) / values.length;
      }
    }

    // Adjust properties based on balance and averages
    const balanceMultipliers = {
      powerful: 1.2,
      weak: 0.8,
      vanilla: 1.0,
    };

    const multiplier = balanceMultipliers[balance as keyof typeof balanceMultipliers] || 1.0;

    for (const [prop, avgValue] of Object.entries(avgStats)) {
      if (properties[prop] === undefined) {
        properties[prop] = Math.round(avgValue * multiplier * 10) / 10;
      }
    }
  }

  /**
   * B42 craftRecipe inputs: los ids de item van SIEMPRE entre corchetes
   * (`[Base.MetalBar]`); los selectores de tags van sin ellos (`tags[base:x]`).
   * Los outputs NO llevan corchetes.
   */
  private formatIngredientRef(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('tags[')) return trimmed;
    return `[${trimmed}]`;
  }

  private formatPropertyValue(value: any): string {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    } else if (typeof value === 'number') {
      return value.toString();
    } else if (Array.isArray(value)) {
      return value.join(';');
    }
    
    return String(value);
  }

  private wrapInModule(content: string, module: string, includeComments: boolean = false): string {
    const lines: string[] = [];
    
    if (includeComments) {
      lines.push('/**');
      lines.push(' * Generated by Project Zomboid MCP Server');
      lines.push(' * https://github.com/overclock11/pz-mcp-server');
      lines.push(' */');
      lines.push('');
    }
    
    lines.push(`module ${module}`);
    lines.push('{');

    // Non-Base modules need to import Base to reference vanilla items
    if (module !== 'Base') {
      lines.push('    imports');
      lines.push('    {');
      lines.push('        Base,');
      lines.push('    }');
      lines.push('');
    }

    lines.push(content);
    lines.push('}');
    
    return lines.join('\n');
  }

  async generateModTemplate(modName: string, modId: string): Promise<{modInfo: string; exampleScript: string}> {
    const modInfo = this.generateModInfo(modName, modId);
    const exampleScript = await this.generateScript(
      'item',
      'ExampleItem',
      {
        DisplayName: 'Example Item',
        DisplayCategory: 'Tool',
        ItemType: 'base:normal',
        Weight: 0.5,
        Icon: 'Hammer',
      },
      'Base',
      { includeComments: true, balance: 'vanilla' }
    );

    return { modInfo, exampleScript };
  }

  private generateModInfo(modName: string, modId: string): string {
    return [
      `name=${modName}`,
      `id=${modId}`,
      `description=Generated mod template`,
      `author=MCP Server User`,
      `poster=`,
      `icon=`,
    ].join('\n');
  }
}
