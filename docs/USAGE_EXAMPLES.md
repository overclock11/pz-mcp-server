# Usage Examples and Workflows

This document provides comprehensive examples of using the Project Zomboid MCP Server for various mod development tasks.

## Table of Contents

1. [Basic Item Creation](#basic-item-creation)
2. [Advanced Weapon Balancing](#advanced-weapon-balancing)
3. [Recipe Development](#recipe-development)
4. [Mod Analysis and Quality Assurance](#mod-analysis-and-quality-assurance)
5. [Batch Operations](#batch-operations)
6. [Integration Workflows](#integration-workflows)

## Basic Item Creation

### Creating a Simple Tool

```typescript
// 1. Search for similar items to understand properties
const similarTools = await mcp.callTool('search_vanilla', {
  query: 'hammer tool',
  type: 'item',
  category: 'Tool',
  limit: 5
});

console.log('Similar tools found:', similarTools.map(t => t.name));

// 2. Generate a new tool based on the template
const toolScript = await mcp.callTool('generate_script', {
  type: 'item',
  name: 'ReinforcedHammer',
  properties: {
    DisplayName: 'Reinforced Hammer',
    DisplayCategory: 'Tool',
    Type: 'Normal',
    Weight: 1.8,
    Icon: 'Hammer',
    ConditionMax: 25,
    ConditionLowerChanceOneIn: 15,
    Categories: 'Tool',
    MetalValue: 20
  },
  module: 'MyMod'
});

console.log('Generated script:\n', toolScript);

// 3. Validate the generated script
const validation = await mcp.callTool('validate_script', {
  content: toolScript,
  type: 'item',
  strict: true
});

if (validation.isValid) {
  console.log('✅ Script is valid!');
} else {
  console.log('❌ Validation errors:', validation.errors);
}
```

### Creating Food Items

```typescript
// Create a nutritious food item
const foodScript = await mcp.callTool('generate_script', {
  type: 'item',
  name: 'PowerBar',
  properties: {
    DisplayName: 'Power Bar',
    DisplayCategory: 'Food',
    Type: 'Food',
    Weight: 0.1,
    Icon: 'CandyBar',
    HungerChange: -20,
    ThirstChange: 5,
    Calories: 300,
    Carbohydrates: 40,
    Lipids: 10,
    Proteins: 15,
    DaysFresh: 30,
    DaysTotallyRotten: 60,
    IsCookable: false,
    Packaged: true
  }
});

// Validate nutrition balance
const validation = await mcp.callTool('validate_script', {
  content: foodScript,
  strict: true
});

console.log('Food item validation:', validation);
```

## Advanced Weapon Balancing

### Creating a Balanced Melee Weapon

```typescript
// 1. Research existing weapons in the same category
const longBlades = await mcp.callTool('search_vanilla', {
  query: 'Categories:LongBlade',
  type: 'item',
  limit: 10
});

// Analyze damage ranges
const damageStats = longBlades.map(weapon => ({
  name: weapon.name,
  maxDamage: weapon.properties.MaxDamage,
  minDamage: weapon.properties.MinDamage,
  weight: weapon.properties.Weight,
  conditionMax: weapon.properties.ConditionMax
}));

console.log('Existing long blade stats:', damageStats);

// 2. Generate a weapon with balanced stats
const balancedWeapon = await mcp.callTool('generate_script', {
  type: 'item',
  name: 'CraftsmanKatana',
  properties: {
    DisplayName: 'Craftsman Katana',
    DisplayCategory: 'Weapon',
    Type: 'Weapon',
    Weight: 2.2,
    Icon: 'Katana',
    AttachmentType: 'Sword',
    BaseSpeed: 1.0,
    MaxDamage: 3.5,
    MinDamage: 2.8,
    ConditionMax: 15,
    ConditionLowerChanceOneIn: 25,
    Categories: 'LongBlade',
    DamageCategory: 'Slash',
    SwingSound: 'KatanaSwing',
    HitSound: 'Katanahit',
    BreakSound: 'Katanabreak',
    DamageMakeHole: true,
    KnockBackOnNoDeath: true,
    SwingTime: 2.5,
    CriticalChance: 25,
    CritDmgMultiplier: 4,
    TreeDamage: 0.5,
    DoorDamage: 15
  }
});

// 3. Validate references exist
const references = await mcp.callTool('check_references', {
  references: ['KatanaSwing', 'Katanahit', 'Katanabreak', 'Katana'],
  type: 'all'
});

references.forEach(ref => {
  if (!ref.isValid) {
    console.log(`⚠️ Reference "${ref.reference}" not found. Suggestions: ${ref.suggestions.join(', ')}`);
  }
});

console.log('Balanced weapon script:\n', balancedWeapon);
```

### Creating Ranged Weapons

```typescript
// Generate a balanced firearm
const firearmScript = await mcp.callTool('generate_script', {
  type: 'item',
  name: 'HuntingCrossbow',
  properties: {
    DisplayName: 'Hunting Crossbow',
    DisplayCategory: 'Weapon',
    Type: 'Weapon',
    Weight: 3.5,
    Icon: 'Crossbow',
    MaxRange: 15,
    MinRange: 0.8,
    AimingTime: 35,
    RecoilDelay: 0,
    ConditionMax: 20,
    Categories: 'Archery',
    SubCategory: 'Crossbow',
    RequiresEquippedBothHands: true,
    ProjectileCount: 1,
    ShareDamage: false,
    MaxHitCount: 1,
    AmmoType: 'CrossbowBolt',
    HitChance: 85,
    SwingSound: 'CrossbowFire',
    ClickSound: 'CrossbowClick'
  }
});

console.log('Crossbow script:\n', firearmScript);
```

## Recipe Development

### Creating Crafting Recipes

```typescript
// 1. Check what materials are available
const materials = await mcp.callTool('search_vanilla', {
  query: 'leather metal',
  type: 'item',
  limit: 20
});

console.log('Available materials:', materials.map(m => m.name));

// 2. Create a complex crafting recipe
const recipeScript = await mcp.callTool('generate_script', {
  type: 'recipe',
  name: 'Craft Reinforced Hammer',
  properties: {
    ingredients: [
      { item: 'Base.Hammer', count: 1 },
      { item: 'Base.LeatherStrips', count: 2 },
      { item: 'Base.Scrap', count: 3 },
      { item: 'Base.Glue', count: 1 }
    ],
    result: 'MyMod.ReinforcedHammer',
    resultCount: 1,
    Time: 120.0,
    Category: 'Smithing',
    OnCreate: 'Recipe.OnCreate.SmithingTool',
    OnGiveXP: 'Recipe.OnGiveXP.SmithingTool5',
    Sound: 'SmithingSound',
    NeedToBeLearn: true
  }
});

console.log('Crafting recipe:\n', recipeScript);

// 3. Validate recipe balance
const validation = await mcp.callTool('validate_script', {
  content: recipeScript,
  type: 'recipe'
});

if (validation.warnings.length > 0) {
  console.log('Recipe warnings:', validation.warnings);
}
```

### Creating Evolved Recipes (Food Combinations)

```typescript
// Create an evolved recipe for food preparation
const evolvedRecipe = await mcp.callTool('generate_script', {
  type: 'evolvedrecipe',
  name: 'Survival Stew',
  properties: {
    BaseItem: 'Base.Pot',
    MaxItems: 6,
    ResultItem: 'MyMod.SurvivalStew',
    Name: 'Survival Stew',
    Category: 'Cooking'
  }
});

console.log('Evolved recipe:\n', evolvedRecipe);
```

## Mod Analysis and Quality Assurance

### Comprehensive Mod Analysis

```typescript
// Analyze an entire mod directory
const analysis = await mcp.callTool('analyze_mod', {
  modPath: '/path/to/my-zombie-survival-mod',
  checkBalance: true,
  checkCompatibility: true,
  generateReport: true
});

console.log('=== MOD ANALYSIS REPORT ===');
console.log(`Mod Name: ${analysis.modName}`);
console.log(`Overall Quality Score: ${analysis.quality.overall}/100`);
console.log(`Structure Score: ${analysis.quality.structure}/100`);
console.log(`Syntax Score: ${analysis.quality.syntax}/100`);
console.log(`Balance Score: ${analysis.quality.balance}/100`);

// Report issues
if (analysis.issues.length > 0) {
  console.log('\n🔍 ISSUES FOUND:');
  analysis.issues.forEach((issue, index) => {
    const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${index + 1}. ${icon} ${issue.file}:${issue.line || '?'} - ${issue.message}`);
    if (issue.suggestion) {
      console.log(`   💡 ${issue.suggestion}`);
    }
  });
}

// Report balance issues
if (analysis.balance && analysis.balance.outliers.length > 0) {
  console.log('\n⚖️ BALANCE OUTLIERS:');
  analysis.balance.outliers.forEach(outlier => {
    console.log(`- ${outlier.item}: ${outlier.property} = ${outlier.value} (${outlier.recommendation})`);
  });
}

// Show recommendations
if (analysis.recommendations.length > 0) {
  console.log('\n📋 RECOMMENDATIONS:');
  analysis.recommendations.forEach((rec, index) => {
    console.log(`${index + 1}. ${rec}`);
  });
}
```

### Script Quality Validation

```typescript
// Validate multiple script files
const scriptFiles = [
  { path: 'weapons.txt', content: weaponScript },
  { path: 'recipes.txt', content: recipeScript },
  { path: 'items.txt', content: itemScript }
];

for (const file of scriptFiles) {
  console.log(`\n🔍 Validating ${file.path}...`);
  
  const validation = await mcp.callTool('validate_script', {
    content: file.content,
    strict: true
  });
  
  if (validation.isValid) {
    console.log(`✅ ${file.path} is valid (Score: ${validation.score}/100)`);
  } else {
    console.log(`❌ ${file.path} has issues:`);
    validation.errors.forEach(error => {
      console.log(`   Line ${error.line}: ${error.message}`);
    });
  }
  
  if (validation.suggestions.length > 0) {
    console.log('💡 Suggestions:');
    validation.suggestions.forEach(suggestion => {
      console.log(`   - ${suggestion}`);
    });
  }
}
```

## Batch Operations

### Bulk Item Generation

```typescript
// Generate multiple related items
const weaponSeries = [
  { name: 'TrainingKatana', damage: 2.0, weight: 1.8 },
  { name: 'StandardKatana', damage: 3.0, weight: 2.0 },
  { name: 'MasterKatana', damage: 4.0, weight: 2.2 },
  { name: 'LegendaryKatana', damage: 5.0, weight: 2.5 }
];

const generatedWeapons = [];

for (const weapon of weaponSeries) {
  const script = await mcp.callTool('generate_script', {
    type: 'item',
    name: weapon.name,
    properties: {
      DisplayName: weapon.name.replace(/([A-Z])/g, ' $1').trim(),
      DisplayCategory: 'Weapon',
      Type: 'Weapon',
      Weight: weapon.weight,
      MaxDamage: weapon.damage,
      MinDamage: weapon.damage * 0.8,
      Categories: 'LongBlade',
      Icon: 'Katana'
    }
  });
  
  generatedWeapons.push(script);
  console.log(`Generated ${weapon.name}`);
}

// Combine all weapons into one module
const fullWeaponScript = `module WeaponMod\n{\n${generatedWeapons.join('\n\n')}\n}`;
console.log('Complete weapon mod:\n', fullWeaponScript);
```

### Batch Reference Validation

```typescript
// Validate all references in a mod
const allReferences = [
  'Base.Hammer', 'Base.Katana', 'Base.Apple',
  'KatanaSwing', 'HammerHit', 'FoodEat',
  'HammerIcon', 'KatanaSprite', 'AppleIcon'
];

const validationResults = await mcp.callTool('check_references', {
  references: allReferences,
  type: 'all'
});

const validRefs = validationResults.filter(r => r.isValid);
const invalidRefs = validationResults.filter(r => !r.isValid);

console.log(`✅ Valid references: ${validRefs.length}`);
console.log(`❌ Invalid references: ${invalidRefs.length}`);

if (invalidRefs.length > 0) {
  console.log('\nInvalid references:');
  invalidRefs.forEach(ref => {
    console.log(`- ${ref.reference}: ${ref.error}`);
    if (ref.suggestions.length > 0) {
      console.log(`  Suggestions: ${ref.suggestions.join(', ')}`);
    }
  });
}
```

## Integration Workflows

### Complete Mod Development Workflow

```typescript
async function developCompleteWeaponMod() {
  console.log('🚀 Starting complete weapon mod development...');

  // Step 1: Research and planning
  console.log('\n📚 Step 1: Research existing weapons...');
  const existingWeapons = await mcp.callTool('search_vanilla', {
    query: 'weapon damage',
    type: 'item',
    limit: 20
  });
  
  console.log(`Found ${existingWeapons.length} weapons for reference`);

  // Step 2: Generate weapon items
  console.log('\n🔨 Step 2: Generating weapon items...');
  const weapons = [
    {
      name: 'SteelMachete',
      displayName: 'Steel Machete',
      damage: 3.2,
      weight: 1.5
    },
    {
      name: 'CombatKnife',
      displayName: 'Combat Knife', 
      damage: 2.1,
      weight: 0.8
    }
  ];

  const weaponScripts = [];
  for (const weapon of weapons) {
    const script = await mcp.callTool('generate_script', {
      type: 'item',
      name: weapon.name,
      properties: {
        DisplayName: weapon.displayName,
        Type: 'Weapon',
        Weight: weapon.weight,
        MaxDamage: weapon.damage,
        MinDamage: weapon.damage * 0.8,
        Categories: weapon.name.includes('Knife') ? 'SmallBlade' : 'LongBlade',
        DamageCategory: 'Slash'
      }
    });
    weaponScripts.push(script);
  }

  // Step 3: Generate crafting recipes
  console.log('\n🔧 Step 3: Generating crafting recipes...');
  const recipeScript = await mcp.callTool('generate_script', {
    type: 'recipe',
    name: 'Craft Steel Machete',
    properties: {
      ingredients: [
        { item: 'Base.KitchenKnife', count: 1 },
        { item: 'Base.Scrap', count: 4 },
        { item: 'Base.LeatherStrips', count: 2 }
      ],
      result: 'WeaponMod.SteelMachete',
      Time: 180.0,
      Category: 'Smithing'
    }
  });

  // Step 4: Validation
  console.log('\n✅ Step 4: Validating all scripts...');
  const allScripts = [...weaponScripts, recipeScript];
  
  for (let i = 0; i < allScripts.length; i++) {
    const validation = await mcp.callTool('validate_script', {
      content: allScripts[i],
      strict: true
    });
    
    if (!validation.isValid) {
      console.log(`❌ Script ${i + 1} has validation errors:`, validation.errors);
    } else {
      console.log(`✅ Script ${i + 1} is valid (Score: ${validation.score}/100)`);
    }
  }

  // Step 5: Combine into complete mod
  console.log('\n📦 Step 5: Creating complete mod package...');
  const completeScript = `module WeaponMod\n{\n${allScripts.join('\n\n')}\n}`;
  
  // Step 6: Final analysis
  console.log('\n🔍 Step 6: Final quality analysis...');
  // Note: In real usage, you'd save the script to a file and analyze the directory
  
  console.log('\n🎉 Weapon mod development complete!');
  console.log('\nGenerated files:');
  console.log('- items_weapons.txt (weapon definitions)');
  console.log('- items_recipes.txt (crafting recipes)');
  console.log('- mod.info (mod metadata)');
  
  return completeScript;
}

// Run the complete workflow
const finalMod = await developCompleteWeaponMod();
console.log('\n📄 Final mod script:\n', finalMod);
```

### CI/CD Integration Example

```typescript
// Example GitHub Actions workflow integration
async function validateModForCI(modPath: string) {
  console.log(`🔍 CI/CD: Validating mod at ${modPath}...`);

  // Analyze mod quality
  const analysis = await mcp.callTool('analyze_mod', {
    modPath,
    checkBalance: true,
    checkCompatibility: true,
    generateReport: true
  });

  // Set quality gates
  const qualityGates = {
    minimumOverallScore: 70,
    maximumErrors: 0,
    maximumCriticalWarnings: 3
  };

  const errors = analysis.issues.filter(i => i.severity === 'error');
  const criticalWarnings = analysis.issues.filter(i => 
    i.severity === 'warning' && i.code.includes('BALANCE')
  );

  // Check quality gates
  const passed = 
    analysis.quality.overall >= qualityGates.minimumOverallScore &&
    errors.length <= qualityGates.maximumErrors &&
    criticalWarnings.length <= qualityGates.maximumCriticalWarnings;

  // Generate CI report
  const report = {
    passed,
    qualityScore: analysis.quality.overall,
    errorCount: errors.length,
    warningCount: analysis.issues.filter(i => i.severity === 'warning').length,
    recommendations: analysis.recommendations
  };

  console.log('CI/CD Results:', report);

  if (!passed) {
    console.log('❌ Quality gates failed. Blocking deployment.');
    process.exit(1);
  } else {
    console.log('✅ Quality gates passed. Ready for deployment.');
  }

  return report;
}
```

These examples demonstrate the power and flexibility of the Project Zomboid MCP Server for various mod development scenarios. From simple item creation to complex workflow automation, the server provides comprehensive tools for creating high-quality Project Zomboid mods.
