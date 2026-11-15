export const XP_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 300,
  3: 900,
  4: 2700,
  5: 6500,
  6: 14000,
  7: 23000,
  8: 34000,
  9: 48000,
  10: 64000,
  11: 85000,
  12: 100000,
  13: 120000,
  14: 140000,
  15: 165000,
  16: 195000,
  17: 225000,
  18: 265000,
  19: 305000,
  20: 355000,
};

export function getNextLevelXp(currentLevel: number): number | null {
  if (currentLevel >= 20) return null;
  return XP_THRESHOLDS[currentLevel + 1] ?? null;
}

export function getProficiencyBonus(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / 4) + 2;
}

export interface ClassProgressionRule {
  canonicalName: string;
  aliases: string[];
  hitDie: 6 | 8 | 10 | 12;
  hitDieAverage: number;
  casterType: 'full' | 'half' | 'pact' | 'none';
  subclassLevel: number;
  asiLevels: number[];
  subclassExamples: string[];
}

const DEFAULT_ASI = [4, 8, 12, 16, 19];

export const CLASS_RULES: ClassProgressionRule[] = [
  {
    canonicalName: 'Mago',
    aliases: ['mago', 'wizard'],
    hitDie: 6,
    hitDieAverage: 4,
    casterType: 'full',
    subclassLevel: 2,
    asiLevels: DEFAULT_ASI,
    subclassExamples: [
      'Escuela de Evocación',
      'Escuela de Abjuración',
      'Escuela de Adivinación',
      'Escuela de Ilusión',
      'Escuela de Nigromancia',
    ],
  },
  {
    canonicalName: 'Hechicero',
    aliases: ['hechicero', 'sorcerer'],
    hitDie: 6,
    hitDieAverage: 4,
    casterType: 'full',
    subclassLevel: 1,
    asiLevels: DEFAULT_ASI,
    subclassExamples: ['Linaje Dracónico', 'Magia Salvaje', 'Alma Divina'],
  },
  {
    canonicalName: 'Monje',
    aliases: ['monje', 'monk'],
    hitDie: 8,
    hitDieAverage: 5,
    casterType: 'none',
    subclassLevel: 3,
    asiLevels: DEFAULT_ASI,
    subclassExamples: [
      'Camino de la Mano Abierta',
      'Camino de la Sombra',
      'Camino de los Cuatro Elementos',
      'Camino de la Misericordia',
    ],
  },
  {
    canonicalName: 'Bardo',
    aliases: ['bardo', 'bard'],
    hitDie: 8,
    hitDieAverage: 5,
    casterType: 'full',
    subclassLevel: 3,
    asiLevels: DEFAULT_ASI,
    subclassExamples: ['Colegio del Conocimiento', 'Colegio del Valor', 'Colegio de la Elocuencia'],
  },
  {
    canonicalName: 'Clérigo',
    aliases: ['clerigo', 'clérigo', 'cleric'],
    hitDie: 8,
    hitDieAverage: 5,
    casterType: 'full',
    subclassLevel: 1,
    asiLevels: DEFAULT_ASI,
    subclassExamples: ['Dominio de la Vida', 'Dominio de la Luz', 'Dominio de la Guerra', 'Dominio de la Tempestad'],
  },
  {
    canonicalName: 'Druida',
    aliases: ['druida', 'druid'],
    hitDie: 8,
    hitDieAverage: 5,
    casterType: 'full',
    subclassLevel: 2,
    asiLevels: DEFAULT_ASI,
    subclassExamples: ['Círculo de la Luna', 'Círculo de la Tierra', 'Círculo de las Estrellas'],
  },
  {
    canonicalName: 'Pícaro',
    aliases: ['picaro', 'pícaro', 'rogue'],
    hitDie: 8,
    hitDieAverage: 5,
    casterType: 'none',
    subclassLevel: 3,
    asiLevels: [4, 8, 10, 12, 16, 19],
    subclassExamples: ['Ladrón', 'Asesino', 'Embaucador Arcano'],
  },
  {
    canonicalName: 'Brujo',
    aliases: ['brujo', 'warlock'],
    hitDie: 8,
    hitDieAverage: 5,
    casterType: 'pact',
    subclassLevel: 1,
    asiLevels: DEFAULT_ASI,
    subclassExamples: ['El Infernal', 'El Archifata', 'El Gran Antiguo', 'El Filo Maldito'],
  },
  {
    canonicalName: 'Guerrero',
    aliases: ['guerrero', 'fighter'],
    hitDie: 10,
    hitDieAverage: 6,
    casterType: 'none',
    subclassLevel: 3,
    asiLevels: [4, 6, 8, 12, 14, 16, 19],
    subclassExamples: ['Maestro de Batalla', 'Campeón', 'Caballero Arcano'],
  },
  {
    canonicalName: 'Paladín',
    aliases: ['paladin', 'paladín'],
    hitDie: 10,
    hitDieAverage: 6,
    casterType: 'half',
    subclassLevel: 3,
    asiLevels: DEFAULT_ASI,
    subclassExamples: ['Juramento de Devoción', 'Juramento de Venganza', 'Juramento de los Antiguos'],
  },
  {
    canonicalName: 'Explorador',
    aliases: ['explorador', 'ranger'],
    hitDie: 10,
    hitDieAverage: 6,
    casterType: 'half',
    subclassLevel: 3,
    asiLevels: DEFAULT_ASI,
    subclassExamples: ['Cazador', 'Señor de las Bestias', 'Acechador en la Penumbra'],
  },
  {
    canonicalName: 'Bárbaro',
    aliases: ['barbaro', 'bárbaro', 'barbarian'],
    hitDie: 12,
    hitDieAverage: 7,
    casterType: 'none',
    subclassLevel: 3,
    asiLevels: DEFAULT_ASI,
    subclassExamples: ['Senda del Berserker', 'Senda del Guerrero Totémico', 'Senda del Fanático'],
  },
];

export function getClassRule(rawClassName: string): ClassProgressionRule {
  const norm = rawClassName.toLowerCase().trim();
  const found = CLASS_RULES.find((r) =>
    r.aliases.some((alias) => norm.includes(alias))
  );
  return (
    found || {
      canonicalName: rawClassName || 'Aventurero',
      aliases: [],
      hitDie: 8,
      hitDieAverage: 5,
      casterType: 'none',
      subclassLevel: 3,
      asiLevels: DEFAULT_ASI,
      subclassExamples: [],
    }
  );
}

/**
 * Devuelve el nivel máximo de conjuro desbloqueado para una clase en `targetLevel`
 */
export function getMaxSpellLevel(
  casterType: ClassProgressionRule['casterType'],
  targetLevel: number
): number {
  if (casterType === 'none') return 0;
  if (casterType === 'full') {
    return Math.min(9, Math.ceil(targetLevel / 2));
  }
  if (casterType === 'half') {
    if (targetLevel < 2) return 0;
    return Math.min(5, Math.ceil(targetLevel / 4));
  }
  if (casterType === 'pact') {
    return Math.min(5, Math.ceil(targetLevel / 2));
  }
  return 0;
}

/**
 * Devuelve resumen de espacios de conjuro para lanzadores completos o medios en `targetLevel`
 */
export function getSpellSlotsSummary(
  casterType: ClassProgressionRule['casterType'],
  targetLevel: number
): Record<number, number> {
  const FULL_SLOTS: Record<number, Record<number, number>> = {
    1: { 1: 2 },
    2: { 1: 3 },
    3: { 1: 4, 2: 2 },
    4: { 1: 4, 2: 3 },
    5: { 1: 4, 2: 3, 3: 2 },
    6: { 1: 4, 2: 3, 3: 3 },
    7: { 1: 4, 2: 3, 3: 3, 4: 1 },
    8: { 1: 4, 2: 3, 3: 3, 4: 2 },
    9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  };
  if (casterType === 'full') {
    return FULL_SLOTS[Math.min(10, targetLevel)] || FULL_SLOTS[10];
  }
  if (casterType === 'half' && targetLevel >= 2) {
    const eff = Math.max(1, Math.ceil(targetLevel / 2));
    return FULL_SLOTS[Math.min(10, eff)] || {};
  }
  if (casterType === 'pact') {
    const slotLvl = Math.min(5, Math.ceil(targetLevel / 2));
    const count = targetLevel === 1 ? 1 : targetLevel < 11 ? 2 : 3;
    return { [slotLvl]: count };
  }
  return {};
}

