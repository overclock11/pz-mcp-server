import type { PropertyValidator } from '../interfaces/contracts.js';

export const REQUIRED_PROPERTIES: Record<string, string[]> = {
  item: ['DisplayName'],
  recipe: ['Result'],
  craftrecipe: [],
  fixing: ['Require', 'Fixer'],
  sound: ['category'],
  vehicle: ['template'],
  evolvedrecipe: ['BaseItem', 'ResultItem'],
};

export const PROPERTY_VALIDATORS: Record<string, PropertyValidator> = {
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
  MetalValue: { type: 'number', min: 0, max: 200 }, // vanilla Axe usa 120

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
  SplatSize: { type: 'number', min: 0, max: 50 },
  SplatBloodOnNoDeath: { type: 'boolean' },
  ScaleWorldIcon: { type: 'number', min: 0.01, max: 100 },

  // Identidad visual / animación (presentes en items vanilla)
  Icon: { type: 'string' },
  WeaponSprite: { type: 'string' },
  IdleAnim: { type: 'string' },

  // craftRecipe B42 (vanilla: time, category en minúsculas)
  time: { type: 'number', min: 1, max: 100000 },
  category: { type: 'string' },

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