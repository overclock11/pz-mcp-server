import type { ParsedBlock } from '../models/types.js';

export function parseScriptBlocks(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = content.split('\n');

  let currentBlock: ParsedBlock | null = null;
  let braceLevel = 0;
  let inModule = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNumber = i + 1;

    // Skip empty lines and comments
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      continue;
    }

    // Count braces before any early exit so module and block opening braces are tracked
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    braceLevel += openBraces - closeBraces;

    // Handle module declarations
    if (line.startsWith('module ') && !inModule) {
      inModule = true;
      continue;
    }

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
      parseProperty(line, currentBlock.properties, currentBlock.type);
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

export function parseProperty(line: string, properties: Record<string, any>, blockType: string): void {
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
    properties[key] = parseValue(value.trim());
  }
}

export function parseValue(value: string): any {
  // Remove quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Parse numbers (incluye negativos y notación científica)
  if (/^[+-]?\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  if (/^[+-]?(\d*\.\d+|\d+)([eE][+-]?\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  // Parse booleans
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  return value;
}