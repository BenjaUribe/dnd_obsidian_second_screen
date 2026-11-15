import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import {
  AbilityScore,
  ActivePartyStatus,
  AttunementSlot,
  CharacterAttributes,
  CharacterCurrencies,
  CharacterSheet,
  CombatState,
  CombatTrackerEntry,
  EntityCategory,
  MagicItemData,
  MapConnection,
  MapEdge,
  MapNode,
  MonsterStatblock,
  PartyResourceRow,
  PreparedSpell,
  QuestItem,
  RoadmapTier,
  RuleSection,
  RulesReference,
  SessionClueItem,
  SessionDiscoveries,
  SessionLog,
  SessionLogCategory,
  SessionLogEntry,
  SpellcastingInfo,
  SpellSlotLevel,
  VaultEntity,
  VaultState,
  WorldMapGraph,
} from './types';

/**
 * Normaliza un nombre o alias de entidad para indexación y resolución de [[WikiLinks]]
 */
export function normalizeEntityKey(raw: string): string {
  return raw
    .replace(/^\[\[|\]\]$/g, '')
    .split('|')[0]
    .trim()
    .toLowerCase();
}

/**
 * Calcula el modificador estándar de D&D 5e: floor((score - 10) / 2)
 */
function calcModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function sleepSync(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

/**
 * Lee un archivo Markdown con gray-matter de forma tolerante a fallos y bloqueos simultáneos.
 * Reintenta brevemente si el archivo está bloqueado (EBUSY/EACCES) o vacío transitoriamente.
 */
function safeReadMarkdown(filePath: string): {
  data: Record<string, unknown>;
  content: string;
  raw: string;
} {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (!raw.trim() && attempt < maxAttempts) {
        sleepSync(60);
        continue;
      }

      try {
        const parsed = matter(raw);
        let content = parsed.content.trim();
        let data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };
// 
        // Caso especial: archivo con un segundo bloque frontmatter consecutivo
        if (content.startsWith('---')) {
          try {
            const secondPass = matter(content);
            if (secondPass.data && Object.keys(secondPass.data).length > 0) {
              data = { ...data, ...(secondPass.data as Record<string, unknown>) };
              content = secondPass.content.trim();
            }
          } catch {
            // Ignorar si no es frontmatter válido
          }
        }

        return { data, content, raw };
      } catch {
        return { data: {}, content: raw, raw };
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if ((code === 'EBUSY' || code === 'EACCES') && attempt < maxAttempts) {
        sleepSync(60 * attempt);
        continue;
      }
      console.error(`[Parser] Error leyendo archivo ${filePath}:`, err);
      return { data: {}, content: '', raw: '' };
    }
  }

  return { data: {}, content: '', raw: '' };
}

/**
 * Extrae atributos STR/DEX/CON/INT/WIS/CHA tanto de frontmatter como de texto
 * Ej: "STR 16 (+3) | DEX 10 (+0) | CON 14 (+2) | INT 10 (+0) | WIS 12 (+1) | CHA 14 (+2)"
 */
function parseAttributes(
  content: string,
  frontmatter: Record<string, unknown>
): CharacterAttributes {
  const keys: Array<keyof CharacterAttributes> = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const spanishAliases: Record<keyof CharacterAttributes, string[]> = {
    STR: ['STR', 'FUE', 'fuerza'],
    DEX: ['DEX', 'DES', 'destreza'],
    CON: ['CON', 'constitucion', 'constitución'],
    INT: ['INT', 'inteligencia'],
    WIS: ['WIS', 'SAB', 'sabiduria', 'sabiduría'],
    CHA: ['CHA', 'CAR', 'carisma'],
  };

  const result: Partial<CharacterAttributes> = {};

  for (const stat of keys) {
    let score: number | null = null;
    let modifier: number | null = null;

    // 1. Buscar en frontmatter
    for (const alias of spanishAliases[stat]) {
      const fmVal = frontmatter[alias] ?? frontmatter[alias.toLowerCase()];
      if (typeof fmVal === 'number' && !isNaN(fmVal)) {
        score = fmVal;
        break;
      } else if (typeof fmVal === 'string') {
        const m = fmVal.match(/(\d+)/);
        if (m) {
          score = parseInt(m[1], 10);
          break;
        }
      }
    }

    // 2. Buscar en el cuerpo con regex tolerante: Ej. "STR 16 (+3)" o "STR: 16"
    const aliasPattern = spanishAliases[stat].join('|');
    const regex = new RegExp(
      `\\b(?:${aliasPattern})\\b\\s*:?\\s*(\\d{1,2})(?:\\s*\\(\\s*([+-]?\\d+)\\s*\\))?`,
      'i'
    );
    const match = content.match(regex);
    if (match) {
      score = parseInt(match[1], 10);
      if (match[2] !== undefined) {
        modifier = parseInt(match[2], 10);
      }
    }

    const finalScore = score ?? 10;
    const finalModifier = modifier ?? calcModifier(finalScore);
    result[stat] = { score: finalScore, modifier: finalModifier };
  }

  return result as CharacterAttributes;
}

/**
 * Extrae una línea de campo en formato "- **Etiqueta:** valor"
 */
function extractBulletField(content: string, labels: string[]): string {
  const labelPattern = labels.join('|');
  const regex = new RegExp(
    `^\\s*[-*]\\s*\\*\\*(?:${labelPattern})\\s*:?\\*\\*\\s*:?\\s*(.+)$`,
    'im'
  );
  const match = content.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Divide una cadena separada por comas o punto y coma respetando paréntesis
 */
function splitListItems(raw: string): string[] {
  if (!raw) return [];
  return raw
    .replace(/\.$/, '')
    .split(/,(?![^(]*\))|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Detecta estados alterados mencionados en frontmatter o cuerpo
 */
const KNOWN_CONDITIONS = [
  'Agarrado',
  'Asustado',
  'Aturdido',
  'Cegado',
  'Derribado',
  'Envenenado',
  'Incapacitado',
  'Inconsciente',
  'Invisible',
  'Paralizado',
  'Apresado',
  'Concentración',
  'Bendecido',
  'Inspirado',
  'Agotamiento',
];

function extractConditions(content: string, frontmatter: Record<string, unknown>): string[] {
  const conditions = new Set<string>();

  // 1. Frontmatter: estados / conditions / estado
  const fmCond = frontmatter.estados ?? frontmatter.estado ?? frontmatter.conditions;
  if (Array.isArray(fmCond)) {
    fmCond.forEach((c) => {
      if (typeof c === 'string' && c.trim()) conditions.add(c.trim());
    });
  } else if (typeof fmCond === 'string' && fmCond.trim()) {
    splitListItems(fmCond).forEach((c) => {
      if (c.toLowerCase() !== 'ninguno' && c.toLowerCase() !== 'normal') {
        conditions.add(c);
      }
    });
  }

  // 2. Bullet en el cuerpo: "- **Estados:** ..." o "- **Estados Activos:** ..."
  const bodyField = extractBulletField(content, [
    'Estados Activos',
    'Estados alterados',
    'Estados',
    'Estado',
    'Condiciones',
  ]);
  if (bodyField) {
    splitListItems(bodyField).forEach((c) => {
      if (c.toLowerCase() !== 'ninguno' && c.toLowerCase() !== 'normal' && c !== '-') {
        conditions.add(c);
      }
    });
  }

  return Array.from(conditions);
}

/**
 * Parsea la sección `### 📈 Hoja de Ruta de Clase y Subclase`
 */
function parseCharacterRoadmap(content: string): RoadmapTier[] {
  const featuresSection = extractMarkdownSection(content, /Rasgos,\s*Progresi[oó]n/i);
  const roadmapText =
    extractMarkdownSubSection(featuresSection || content, /Hoja de Ruta/i) || '';
  if (!roadmapText) return [];

  const tiers: RoadmapTier[] = [];
  let currentTier: RoadmapTier | null = null;

  for (const rawLine of roadmapText.split(/\r?\n/)) {
    const tierMatch = rawLine.match(/^\s*[-*]\s*\*\*([^*:\n]+?)\s*:?\*\*\s*$/);
    if (tierMatch) {
      currentTier = {
        levelLabel: tierMatch[1].replace(/:$/, '').trim(),
        items: [],
      };
      tiers.push(currentTier);
      continue;
    }

    const taskMatch = rawLine.match(/^\s+[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      const unlocked = taskMatch[1].toLowerCase() === 'x';
      const body = taskMatch[2].trim();
      let label = body;
      let description = '';

      const boldMatch = body.match(/^\*\*([^*]+?)\*\*\s*:?\s*(.*)$/);
      if (boldMatch) {
        label = boldMatch[1].replace(/:$/, '').trim();
        description = boldMatch[2].trim();
      }

      if (!currentTier) {
        currentTier = { levelLabel: 'General', items: [] };
        tiers.push(currentTier);
      }

      currentTier.items.push({ label, description, unlocked });
    }
  }

  return tiers;
}

/**
 * Parsea la sección `## 🎒 Equipo y Riqueza` (monedas, sintonización e inventario)
 */
function parseCharacterWealthAndGear(content: string): {
  currencies: CharacterCurrencies;
  attunement: AttunementSlot[];
  inventoryItems: string[];
} {
  const gearSection = extractMarkdownSection(content, /Equipo y Riqueza/i);
  const currencies: CharacterCurrencies = { pc: 0, pp: 0, pe: 0, po: 0, ppt: 0 };
  const attunement: AttunementSlot[] = [];
  const inventoryItems: string[] = [];

  if (!gearSection) {
    return { currencies, attunement, inventoryItems };
  }

  // Monedas: "- **Monedas:** **PC:** 0 | **PP:** 0 | **PE:** 0 | **PO:** 0 | **PPT:** 0"
  const coinLine = extractBulletField(gearSection, ['Monedas']);
  if (coinLine) {
    const parseCoin = (code: string): number => {
      const afterMatch = coinLine.match(
        new RegExp(`(?:\\*\\*)?${code}(?:\\*\\*)?\\s*:?\\s*(?:\\*\\*)?\\s*(\\d+)`, 'i')
      );
      if (afterMatch) return parseInt(afterMatch[1], 10);

      const beforeMatch = coinLine.match(new RegExp(`(\\d+)\\s*(?:\\*\\*)?${code}\\b`, 'i'));
      return beforeMatch ? parseInt(beforeMatch[1], 10) : 0;
    };
    currencies.pc = parseCoin('PC');
    currencies.pp = parseCoin('PP');
    currencies.pe = parseCoin('PE');
    currencies.po = parseCoin('PO');
    currencies.ppt = parseCoin('PPT');
  }

  // Sintonización: "1. `[ ]` *Vacío*" o "1. [x] [[Amuleto]]"
  const attuneRegex = /^\s*\d+\.\s*`?\[([ xX])\]`?\s*(.+)$/gm;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = attuneRegex.exec(gearSection)) !== null) {
    const active = aMatch[1].toLowerCase() === 'x';
    const rawItem = aMatch[2].replace(/^\*|\*$/g, '').trim();
    attunement.push({
      active,
      item: rawItem || 'Vacío',
    });
  }

  // ### Inventario
  const invSub = extractMarkdownSubSection(gearSection, /Inventario/i);
  if (invSub) {
    for (const line of invSub.split(/\r?\n/)) {
      const cleaned = line.trim();
      if (!cleaned.startsWith('-') && !cleaned.startsWith('*')) continue;
      const itemText = cleaned.replace(/^[-*]\s*/, '').trim();
      if (itemText) {
        inventoryItems.push(...splitListItems(itemText));
      }
    }
  }

  return { currencies, attunement, inventoryItems };
}

/**
 * Parsea la sección `## ✨ Magia y Conjuros` si existe y tiene datos relevantes
 */
function parseCharacterSpellcasting(content: string): SpellcastingInfo | null {
  const magicSection = extractMarkdownSection(content, /Magia y Conjuros/i);
  if (!magicSection) return null;

  const headerLine = extractBulletField(magicSection, ['Aptitud Mágica']);
  let ability = '—';
  let modifier = '+0';
  let saveDc = 8;
  let attackBonus = '+0';

  if (headerLine) {
    ability = headerLine.split('|')[0]?.trim() || '—';
    const modMatch = magicSection.match(/\*\*Modificador:\*\*\s*([^\s|]+)/i);
    const dcMatch = magicSection.match(/\*\*CD Salvaci[oó]n:\*\*\s*(\d+)/i);
    const atkMatch = magicSection.match(/\*\*Bonif\. Ataque:\*\*\s*([^\s|]+)/i);
    if (modMatch) modifier = modMatch[1].trim();
    if (dcMatch) saveDc = parseInt(dcMatch[1], 10);
    if (atkMatch) attackBonus = atkMatch[1].trim();
  }

  // Espacios de Conjuro (soporta tabla doble lado a lado o tabla simple)
  const slotsSub = extractMarkdownSubSection(magicSection, /Espacios de Conjuro/i);
  const slotsMap = new Map<number, SpellSlotLevel>();

  if (slotsSub) {
    const rows = parseMarkdownTable(slotsSub);
    for (const cells of rows) {
      // Par izquierdo: Nivel (0), Total (1), Gastados (2)
      // Par derecho opcional: Nivel (4), Total (5), Gastados (6)
      const pairs: [number, number, number][] = [[0, 1, 2]];
      if (cells.length >= 7) {
        pairs.push([4, 5, 6]);
      }
      for (const [lvlIdx, totIdx, expIdx] of pairs) {
        const lvlCell = cells[lvlIdx] || '';
        const lvlMatch = lvlCell.match(/(\d+)/);
        if (!lvlMatch) continue;
        const level = parseInt(lvlMatch[1], 10);
        const total = parseInt(cells[totIdx] || '0', 10) || 0;
        const expended = parseInt(cells[expIdx] || '0', 10) || 0;
        slotsMap.set(level, { level, total, expended });
      }
    }
  }

  const slots = Array.from(slotsMap.values()).sort((a, b) => a.level - b.level);

  // Trucos y Conjuros Preparados
  const spellsSub = extractMarkdownSubSection(magicSection, /Trucos y Conjuros/i);
  const preparedSpells: PreparedSpell[] = [];
  if (spellsSub) {
    const rows = parseMarkdownTable(spellsSub);
    for (const cells of rows) {
      const name = (cells[1] || '').trim();
      if (!name) continue;
      preparedSpells.push({
        level: parseInt(cells[0] || '0', 10) || 0,
        name,
        castingTime: (cells[2] || '').trim(),
        range: (cells[3] || '').trim(),
        components: (cells[4] || '').trim(),
        notes: (cells[5] || '').trim(),
      });
    }
  }

  const hasAnySlots = slots.some((s) => s.total > 0);
  const hasAbility = ability !== '—' && ability !== '-' && ability !== '';
  if (!hasAbility && !hasAnySlots && preparedSpells.length === 0) {
    return null;
  }

  return {
    ability,
    modifier,
    saveDc,
    attackBonus,
    slots,
    preparedSpells,
  };
}

/**
 * Parsea la ficha de un personaje desde Personajes/*.md
 */
export function parseCharacterFile(filePath: string): CharacterSheet {
  const fileName = path.basename(filePath, '.md');
  const { data: fm, content } = safeReadMarkdown(filePath);

  // Nombre del personaje: desde H1 (# [[Nombre]]) o nombre de archivo
  let name = fileName.replace(/_/g, ' ');
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    name = h1Match[1].replace(/^\[\[|\]\]$/g, '').trim();
  }
  if (typeof fm.nombre === 'string' && fm.nombre.trim()) {
    name = fm.nombre.trim();
  }

  // Clase, Subclase, Nivel, PX y Raza
  const classAndLevel =
    (typeof fm.clase === 'string' && fm.clase.trim()
      ? `${fm.clase}${fm.nivel ? ` ${fm.nivel}` : ''}${fm.subclase ? ` (${fm.subclase})` : ''}`
      : '') ||
    extractBulletField(content, ['Clase y Nivel', 'Clase']) ||
    'Aventurero 1';

  const className =
    (typeof fm.clase === 'string' && fm.clase.trim()
      ? fm.clase.replace(/\d+/g, '').trim()
      : '') ||
    classAndLevel.split(/\s+\d+|\(/)[0].trim() ||
    'Aventurero';

  const subclass =
    typeof fm.subclase === 'string' ? fm.subclase.trim() : '';

  let level = 1;
  if (typeof fm.nivel === 'number' && !isNaN(fm.nivel)) {
    level = fm.nivel;
  } else if (typeof fm.nivel === 'string' && /\d+/.test(fm.nivel)) {
    level = parseInt(fm.nivel.match(/\d+/)![0], 10);
  } else {
    const lvlMatch = classAndLevel.match(/(\d+)/);
    if (lvlMatch) level = parseInt(lvlMatch[1], 10);
  }

  let xp = 0;
  if (typeof fm.px === 'number' && !isNaN(fm.px)) {
    xp = fm.px;
  } else if (typeof fm.px === 'string' && /\d+/.test(fm.px)) {
    xp = parseInt(fm.px.match(/\d+/)![0], 10);
  } else {
    const xpMatch = content.match(/\*\*PX:\*\*\s*(\d+)/i);
    if (xpMatch) xp = parseInt(xpMatch[1], 10);
  }

  const race =
    (typeof fm.especie === 'string' && fm.especie.trim() ? fm.especie : '') ||
    (typeof fm.raza === 'string' && fm.raza.trim() ? fm.raza : '') ||
    extractBulletField(content, ['Especie', 'Raza']) ||
    'Desconocida';

  // CA (Armor Class): desde frontmatter (`ca` / `ac`) o regex `CA:\s*(\d+)`
  let ac = 10;
  if (typeof fm.ca === 'number') {
    ac = fm.ca;
  } else if (typeof fm.ac === 'number') {
    ac = fm.ac;
  } else if (typeof fm.ca === 'string' && /\d+/.test(fm.ca)) {
    ac = parseInt(fm.ca.match(/\d+/)![0], 10);
  } else {
    const caRegexMatch = content.match(/(?:CA|AC)\*?\*?\s*:\s*\*?\*?\s*(\d+)/i);
    if (caRegexMatch) {
      ac = parseInt(caRegexMatch[1], 10);
    }
  }

  // HP Actual y Máximo: soporta regex `HP:\s*(\d+)\s*\/\s*(\d+)` y frontmatter `hp_actual`, `hp_max`, `hp`
  let hpMax = 10;
  let hpCurrent: number | null = null;

  if (typeof fm.hp_max === 'number') {
    hpMax = fm.hp_max;
  } else if (typeof fm.hp_max === 'string' && /\d+/.test(fm.hp_max)) {
    hpMax = parseInt(fm.hp_max.match(/\d+/)![0], 10);
  }

  if (typeof fm.hp_actual === 'number') {
    hpCurrent = fm.hp_actual;
  } else if (typeof fm.hp === 'number') {
    hpCurrent = fm.hp;
  } else if (typeof fm.hp === 'string') {
    const slashMatch = fm.hp.match(/(\d+)\s*\/\s*(\d+)/);
    if (slashMatch) {
      hpCurrent = parseInt(slashMatch[1], 10);
      hpMax = parseInt(slashMatch[2], 10);
    } else if (/\d+/.test(fm.hp)) {
      hpCurrent = parseInt(fm.hp.match(/\d+/)![0], 10);
    }
  }

  // Regex en el cuerpo: HP:\s*(\d+)\s*\/\s*(\d+) (soporta **HP:** 10/10)
  const hpSlashRegex = /HP\*?\*?\s*:\s*\*?\*?\s*(\d+)\s*\/\s*(\d+)/i;
  const bodyHpMatch = content.match(hpSlashRegex);
  if (bodyHpMatch) {
    hpCurrent = parseInt(bodyHpMatch[1], 10);
    hpMax = parseInt(bodyHpMatch[2], 10);
  } else {
    const singleHpMatch = content.match(/HP(?:\s+actual)?\*?\*?\s*:\s*\*?\*?\s*(\d+)/i);
    if (singleHpMatch && hpCurrent === null) {
      hpCurrent = parseInt(singleHpMatch[1], 10);
    }
  }

  if (hpCurrent === null) {
    hpCurrent = hpMax;
  }

  // HP Temporal
  let hpTemp = 0;
  if (typeof fm.hp_temp === 'number') {
    hpTemp = fm.hp_temp;
  } else {
    const tempMatch = content.match(/Temp(?:oral)?\s*:\s*(\d+)/i);
    if (tempMatch) {
      hpTemp = parseInt(tempMatch[1], 10);
    }
  }

  // Sección `## 🛡️ Combate y Supervivencia`
  const hitDice = extractBulletField(content, ['Dados de Golpe']) || '1/1';
  const proficiencyBonus =
    extractBulletField(content, ['Bonificador por Competencia']) || undefined;

  const initMatch = content.match(/\*\*Iniciativa:\*\*\s*([^\s|]+)/i);
  const initiative = initMatch ? initMatch[1].trim() : undefined;

  const speedMatch = content.match(/\*\*Velocidad:\*\*\s*([^|\n]+)/i);
  const speed = speedMatch ? speedMatch[1].trim() : undefined;

  const ppMatch = content.match(/\*\*Percepci[oó]n Pasiva:\*\*\s*(\d+)/i);
  const passivePerception = ppMatch ? parseInt(ppMatch[1], 10) : undefined;

  const inspLine = extractBulletField(content, ['Inspiración Heroica', 'Inspiracion Heroica']);
  const heroicInspiration = /\[x\]/i.test(inspLine);

  const deathLine = extractBulletField(content, [
    'Salvaciones contra Muerte',
    'Salvaciones de Muerte',
  ]);
  let deathSuccesses = 0;
  let deathFailures = 0;
  if (deathLine) {
    const [succPart, failPart] = deathLine.split(/Fallos/i);
    if (succPart) {
      deathSuccesses = Math.min(3, (succPart.match(/\[x\]/gi) || []).length);
    }
    if (failPart) {
      deathFailures = Math.min(3, (failPart.match(/\[x\]/gi) || []).length);
    }
  }

  const attributes = parseAttributes(content, fm);
  const savingThrows = splitListItems(
    extractBulletField(content, ['Tiradas de Salvación', 'Salvaciones'])
  );
  const skills = splitListItems(
    extractBulletField(content, ['Habilidades clave', 'Habilidades'])
  );

  // Ataques desde viñeta o tabla `## ⚔️ Armas y Trucos de Daño`
  const bulletAttacks = splitListItems(
    extractBulletField(content, ['Ataques principales', 'Ataques', 'Armas'])
  );
  const weaponsSection = extractMarkdownSection(content, /Armas y Trucos/i);
  const tableAttacks: string[] = [];
  if (weaponsSection) {
    for (const cells of parseMarkdownTable(weaponsSection)) {
      const wName = (cells[0] || '').trim();
      if (!wName) continue;
      const bonus = (cells[1] || '').trim();
      const dmg = (cells[2] || '').trim();
      const notes = (cells[3] || '').trim();
      const summary = [wName, bonus ? `(${bonus})` : '', dmg, notes ? `— ${notes}` : '']
        .filter(Boolean)
        .join(' ');
      tableAttacks.push(summary);
    }
  }
  const attacks = tableAttacks.length > 0 ? tableAttacks : bulletAttacks;

  const legacyInventory = splitListItems(
    extractBulletField(content, ['Inventario clave', 'Inventario', 'Equipo'])
  );
  const { currencies, attunement, inventoryItems } = parseCharacterWealthAndGear(content);
  const inventory = inventoryItems.length > 0 ? inventoryItems : legacyInventory;

  const roadmap = parseCharacterRoadmap(content);
  const spellcasting = parseCharacterSpellcasting(content);

  const backgroundNotes =
    extractBulletField(content, ['Notas de trasfondo', 'Trasfondo', 'Notas', 'Historia']) ||
    '';
  const conditions = extractConditions(content, fm);

  // Si cae a 0 HP, asegurar que figure como Inconsciente o Caído si no tiene otro estado
  if (hpCurrent <= 0 && !conditions.includes('Inconsciente')) {
    conditions.push('Inconsciente');
  }

  // Capturar dinámicamente campos nuevos en viñetas `- **Campo:** valor` o frontmatter YAML
  const knownBulletLabels = new Set([
    'estadísticas',
    'estadisticas',
    'tiradas de salvación',
    'tiradas de salvacion',
    'salvaciones',
    'habilidades clave',
    'habilidades',
    'ataques principales',
    'ataques',
    'armas',
    'inventario clave',
    'inventario',
    'equipo',
    'notas de trasfondo',
    'trasfondo',
    'notas',
    'clase',
    'clase y nivel',
    'raza',
    'especie',
    'estados alterados',
    'estados activos',
    'estados',
    'estado',
    'condiciones',
    'ca',
    'hp',
    'dados de golpe',
    'bonificador por competencia',
    'iniciativa',
    'inspiración heroica',
    'inspiracion heroica',
    'salvaciones contra muerte',
    'salvaciones de muerte',
    'monedas',
    'sintonización con objetos mágicos (máx. 3)',
    'sintonización con objetos mágicos',
    'aptitud mágica',
    'herramientas',
    'armaduras',
    'idiomas',
    'aspecto',
    'personalidad y vínculos',
    'historia',
  ]);

  const knownFmKeys = new Set([
    'tipo',
    'nombre',
    'clase',
    'subclase',
    'nivel',
    'raza',
    'especie',
    'trasfondo',
    'alineamiento',
    'px',
    'ca',
    'ac',
    'hp',
    'hp_max',
    'hp_actual',
    'hp_temp',
    'estados',
    'estado',
    'conditions',
    'str',
    'dex',
    'con',
    'int',
    'wis',
    'cha',
    'fue',
    'des',
    'sab',
    'car',
    'fuerza',
    'destreza',
    'constitucion',
    'constitución',
    'inteligencia',
    'sabiduria',
    'sabiduría',
    'carisma',
  ]);

  const extraFields: Record<string, string> = {};

  for (const [fmKey, fmVal] of Object.entries(fm)) {
    if (knownFmKeys.has(fmKey.toLowerCase())) continue;
    if (fmVal === null || fmVal === undefined) continue;
    if (typeof fmVal === 'string' || typeof fmVal === 'number' || typeof fmVal === 'boolean') {
      const strVal = String(fmVal).trim();
      if (strVal) extraFields[fmKey] = strVal;
    } else if (Array.isArray(fmVal) && fmVal.length > 0) {
      extraFields[fmKey] = fmVal.map((v) => String(v)).join(', ');
    }
  }

  const bulletRegex = /^\s*[-*]\s*(?:`?\[([ xX])\]`?\s*)?\*\*([^*:\n]+?)\s*:?\*\*\s*:?\s*(.+)$/gm;
  let bMatch: RegExpExecArray | null;
  while ((bMatch = bulletRegex.exec(content)) !== null) {
    const outerCheck = bMatch[1];
    const rawLabel = bMatch[2].replace(/:$/, '').trim();
    // Si tiene un checkbox desmarcado `[ ]` afuera o adentro del título, omitirlo
    if (outerCheck === ' ' || /^`?\[\s\]`?/.test(rawLabel)) continue;
    const label = rawLabel.replace(/^`?\[[xX]\]`?\s*/, '').trim();
    const val = bMatch[3].trim();
    if (label && val && !knownBulletLabels.has(label.toLowerCase())) {
      extraFields[label] = val;
    }
  }

  return {
    id: normalizeEntityKey(fileName),
    name,
    fileName,
    filePath,
    race,
    classAndLevel,
    className,
    subclass,
    level,
    xp,
    ac,
    hpCurrent,
    hpMax,
    hpTemp,
    hitDice,
    heroicInspiration,
    deathSaves: {
      successes: deathSuccesses,
      failures: deathFailures,
    },
    proficiencyBonus,
    initiative,
    speed,
    passivePerception,
    attributes,
    savingThrows,
    skills,
    attacks,
    inventory,
    currencies,
    attunement,
    roadmap,
    spellcasting,
    conditions,
    backgroundNotes,
    extraFields,
    rawContent: content,
    frontmatter: fm,
  };
}

/**
 * Clasifica una línea de `## 📜 Registro en Vivo` según etiquetas explícitas (`[Combate]`, `[PNJ]`, `[Descubrimiento]`)
 * o inferencia semántica tolerante a fallos sobre el título en negrita (`- **Llegada:** ...`)
 */
function parseSessionLogEntry(rawLine: string, index: number): SessionLogEntry {
  const cleaned = rawLine.replace(/^\s*[-*]\s+/, '').trim();

  let category: SessionLogCategory = 'Narrativa';
  let tagLabel = 'Evento';
  let title: string | undefined;
  let text = cleaned;
  let timestamp: string | undefined;

  // Extraer hora o ronda opcional al principio o final: ej. `[22:15]`, `(Ronda 2)`
  const timePrefixMatch = text.match(/^\[(\d{1,2}:\d{2}|Ronda\s+\d+)\]\s*(.+)$/i);
  if (timePrefixMatch) {
    timestamp = timePrefixMatch[1].trim();
    text = timePrefixMatch[2].trim();
  }

  // 1. Etiqueta explícita entre corchetes (ej: `[Combate]`, `[PNJ]`, `[Descubrimiento]`)
  // Cuidado de no confundir con un WikiLink `[[...]]`
  const explicitTagMatch = text.match(/^\[(?!\[)([^\]\n]+)\]\s*(.*)$/);
  if (explicitTagMatch) {
    const rawTag = explicitTagMatch[1].trim();
    text = explicitTagMatch[2].trim();
    tagLabel = rawTag;

    if (/combate|ataque|daño|iniciativa|batalla|hostil/i.test(rawTag)) {
      category = 'Combate';
    } else if (/pnj|npc|social|di[aá]logo|contacto|interacci[oó]n/i.test(rawTag)) {
      category = 'PNJ';
    } else if (/descubrimiento|pista|indicio|hallazgo|exploraci[oó]n|llegada|bot[ií]n|secreto/i.test(rawTag)) {
      category = 'Descubrimiento';
    }
  }

  // 2. Título en negrita al inicio: `- **Contacto e indicio:** ...` o `- **[Combate] Turno 1:** ...`
  const boldTitleMatch = text.match(/^\*\*([^*]+?)\*\*\s*:?\s*(.*)$/);
  if (boldTitleMatch) {
    let rawBold = boldTitleMatch[1].replace(/:$/, '').trim();
    const restText = boldTitleMatch[2].trim();

    // Revisar si dentro del bold había un [Tag]
    const innerBracket = rawBold.match(/^\[(?!\[)([^\]]+)\]\s*(.*)$/);
    if (innerBracket) {
      tagLabel = innerBracket[1].trim();
      rawBold = innerBracket[2].trim();
    }

    title = rawBold || undefined;
    if (restText) {
      text = restText;
    }

    // Si aún no se categorizó por bracket explícito, inferir por el título o contenido
    if (category === 'Narrativa') {
      const combinedProbe = `${tagLabel} ${rawBold}`;
      if (/combate|ataque|emboscada|turno|asalt|daño|amenaza|situaci[oó]n|peligro|vigila/i.test(combinedProbe)) {
        category = 'Combate';
        if (tagLabel === 'Evento') tagLabel = 'Combate / Tensión';
      } else if (/pnj|contacto|tabernero|di[aá]logo|interrogatorio|encuentro|aliado|conversaci[oó]n/i.test(combinedProbe)) {
        category = 'PNJ';
        if (tagLabel === 'Evento') tagLabel = 'PNJ';
      } else if (/descubrimiento|indicio|pista|llegada|hallazgo|exploraci[oó]n|rastro|secreto|mapa/i.test(combinedProbe)) {
        category = 'Descubrimiento';
        if (tagLabel === 'Evento') tagLabel = 'Descubrimiento';
      }
    }
  } else if (category === 'Narrativa') {
    // Inferencia ligera por palabras clave en el texto si no hay ni bracket ni negrita
    if (/\b(ataca|daño|iniciativa|combate|espada|emboscada|vigila)\b/i.test(text)) {
      category = 'Combate';
      tagLabel = 'Combate';
    } else if (/\b(pista|indicio|sello|descubre|encuentra|llega|ingresa)\b/i.test(text)) {
      category = 'Descubrimiento';
      tagLabel = 'Descubrimiento';
    } else if (/\b(dice|entrega|advierte|tabernero|habla)\b/i.test(text)) {
      category = 'PNJ';
      tagLabel = 'PNJ';
    }
  }

  return {
    id: `log-${index}`,
    category,
    tagLabel,
    title,
    text,
    rawLine,
    timestamp,
  };
}

/**
 * Extrae el contenido de una subsección Markdown delimitada por encabezados `### `
 */
function extractMarkdownSubSection(content: string, subSectionPattern: RegExp): string {
  const lines = content.split(/\r?\n/);
  let capturing = false;
  const captured: string[] = [];

  for (const line of lines) {
    if (/^###\s+/.test(line)) {
      if (subSectionPattern.test(line)) {
        capturing = true;
        continue;
      } else if (capturing) {
        break;
      }
    } else if (/^##\s+/.test(line) && capturing) {
      break;
    }
    if (capturing) {
      captured.push(line);
    }
  }

  return captured.join('\n').trim();
}

/**
 * Parsea filas de una tabla Markdown (omite la cabecera y la fila separadora `| :--- |`)
 */
function parseMarkdownTable(sectionContent: string): string[][] {
  const lines = sectionContent.split(/\r?\n/);
  const rows: string[][] = [];
  let seenHeader = false;
  let seenSeparator = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) {
      if (seenSeparator) break;
      continue;
    }

    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

    if (!seenHeader) {
      seenHeader = true;
      continue;
    }

    if (!seenSeparator && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) {
      seenSeparator = true;
      continue;
    }

    if (seenSeparator) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * Extrae el contenido de una sección Markdown delimitada por encabezados `## `
 */
function extractMarkdownSection(content: string, sectionPattern: RegExp): string {
  const lines = content.split(/\r?\n/);
  let capturing = false;
  const captured: string[] = [];

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (sectionPattern.test(line)) {
        capturing = true;
        continue;
      } else if (capturing) {
        break;
      }
    }
    if (capturing) {
      captured.push(line);
    }
  }

  return captured.join('\n').trim();
}

/**
 * Parsea un archivo de sesión: `Campaña/Sesiones/Sesion XX.md`
 */
export function parseSessionFile(filePath: string): SessionLog {
  const fileName = path.basename(filePath, '.md');
  const { data: fm, content } = safeReadMarkdown(filePath);

  // Número de sesión: desde frontmatter `sesion` / `numero_sesion` o nombre de archivo `Sesion 01`
  let number = 1;
  if (typeof fm.sesion === 'number') {
    number = fm.sesion;
  } else if (typeof fm.numero_sesion === 'number') {
    number = fm.numero_sesion;
  } else {
    const numMatch = fileName.match(/(\d+)/);
    if (numMatch) {
      number = parseInt(numMatch[1], 10);
    }
  }

  // Título
  let title = `Sesión ${String(number).padStart(2, '0')}`;
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    title = h1Match[1].trim();
  }

  // Fecha
  let date = '';
  const rawDate = fm.fecha_real ?? fm.fecha;
  if (rawDate instanceof Date) {
    date = rawDate.toISOString().split('T')[0];
  } else if (typeof rawDate === 'string') {
    date = rawDate.trim();
  }

  // Ubicación (`lugar_actual` o `ubicacion`)
  const locationRaw =
    (typeof fm.lugar_actual === 'string' ? fm.lugar_actual : '') ||
    (typeof fm.ubicacion === 'string' ? fm.ubicacion : '') ||
    extractBulletField(content, ['Lugar actual', 'Ubicación']) ||
    'Ubicación desconocida';

  // 1. Sección `## 👥 Grupo Activo`
  const partySection = extractMarkdownSection(content, /Grupo Activo/i);
  const activeParty: ActivePartyStatus[] = [];
  if (partySection) {
    const partyLines = partySection
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-') || l.startsWith('*'));

    for (const line of partyLines) {
      const nameMatch = line.match(/\[\[([^\]]+)\]\]/) || line.match(/^[-*]\s*([^(:\n]+)/);
      if (!nameMatch) continue;
      const charName = nameMatch[1].trim();
      const hpMatch = line.match(/HP\s*:\s*(\d+)\s*\/\s*(\d+)/i);
      const condMatch = line.match(/\[Estado:\s*([^\]]+)\]/i);
      activeParty.push({
        name: charName,
        hpCurrent: hpMatch ? parseInt(hpMatch[1], 10) : undefined,
        hpMax: hpMatch ? parseInt(hpMatch[2], 10) : undefined,
        conditions: condMatch ? splitListItems(condMatch[1]) : undefined,
        rawText: line.replace(/^[-*]\s*/, ''),
      });
    }
  }

  // 2. Sección `## 📜 Registro en Vivo`
  const liveSection = extractMarkdownSection(content, /Registro en Vivo/i);
  const liveFeed: SessionLogEntry[] = [];
  if (liveSection) {
    const cleanSection = liveSection.replace(/<!--[\s\S]*?-->/g, '').trim();
    const lines = cleanSection
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-') || l.startsWith('*'));

    lines.forEach((line, idx) => {
      liveFeed.push(parseSessionLogEntry(line, idx));
    });
  }

  // 3. Sección `## ⚔️ Estado de Combate / Recursos` (legacy) y `## ⚔️ Rastreador de Combate e Iniciativa` (nuevo)
  const combatSection = extractMarkdownSection(content, /Estado de Combate/i);
  const combat: CombatState = {
    inCombat: false,
    initiative: [],
    enemies: [],
  };
  if (combatSection) {
    const initField = extractBulletField(combatSection, ['Iniciativa actual', 'Iniciativa']);
    const enemiesField = extractBulletField(combatSection, ['Enemigos', 'Amenazas', 'Hostiles']);
    if (initField && initField.toLowerCase() !== 'ninguna' && initField !== '-') {
      combat.initiative = splitListItems(initField);
    }
    if (enemiesField && enemiesField.toLowerCase() !== 'ninguno' && enemiesField !== '-') {
      combat.enemies = splitListItems(enemiesField);
    }
    combat.inCombat = combat.initiative.length > 0 || combat.enemies.length > 0;
  }

  const trackerSection = extractMarkdownSection(
    content,
    /Rastreador de Combate e Iniciativa/i
  );
  const combatTracker: CombatTrackerEntry[] = [];
  if (trackerSection) {
    const rows = parseMarkdownTable(trackerSection);
    for (const cells of rows) {
      const combatant = (cells[1] || '').trim();
      const cleanedName = combatant.replace(/\*/g, '').trim();
      if (!cleanedName || /sin combate activo/i.test(cleanedName)) continue;
      combatTracker.push({
        initiative: (cells[0] || '—').trim(),
        combatant,
        hp: (cells[2] || '—').trim(),
        ac: (cells[3] || '—').trim(),
        conditions: (cells[4] || '—').trim(),
      });
    }
  }
  const combateActivo = combatTracker.length > 0;

  // 3b. Sección `## 🛡️ Estado del Grupo y Recursos`
  const partyTableSection = extractMarkdownSection(
    content,
    /Estado del Grupo y Recursos/i
  );
  const partyResources: PartyResourceRow[] = [];
  if (partyTableSection) {
    for (const cells of parseMarkdownTable(partyTableSection)) {
      const character = (cells[0] || '').trim();
      if (!character) continue;
      const hpStr = (cells[1] || '').trim();
      const acStr = (cells[2] || '').trim();
      const resourcesStr = (cells[3] || '').trim();
      const condStr = (cells[4] || '').trim();

      partyResources.push({
        character,
        hp: hpStr,
        ac: acStr,
        resources: resourcesStr,
        conditions: condStr,
      });

      // Sincronizar también hacia activeParty si no estaba en `## 👥 Grupo Activo`
      const cleanName = character.replace(/^\[\[|\]\]$/g, '').trim();
      if (!activeParty.some((p) => normalizeEntityKey(p.name) === normalizeEntityKey(cleanName))) {
        const hpMatch = hpStr.match(/(\d+)\s*\/\s*(\d+)/);
        const conditionsList =
          condStr && condStr.toLowerCase() !== 'ninguno' && condStr !== '—'
            ? splitListItems(condStr)
            : undefined;
        activeParty.push({
          name: cleanName,
          hpCurrent: hpMatch ? parseInt(hpMatch[1], 10) : undefined,
          hpMax: hpMatch ? parseInt(hpMatch[2], 10) : undefined,
          conditions: conditionsList,
          rawText: `${character} (${hpStr})`,
        });
      }
    }
  }

  // 3c. Sección `## 🔍 Pistas, Botín y Entidades Descubiertas`
  const discoveriesSection = extractMarkdownSection(
    content,
    /Pistas,\s*Bot[ií]n y Entidades/i
  );
  const discoveries: SessionDiscoveries = {
    newEntities: [],
    clues: [],
    coins: '',
    items: [],
  };
  if (discoveriesSection) {
    const newEntSub = extractMarkdownSubSection(discoveriesSection, /PNJs y Lugares/i);
    if (newEntSub) {
      for (const line of newEntSub.split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith('-') || t.startsWith('*')) {
          discoveries.newEntities.push(t.replace(/^[-*]\s*/, '').trim());
        }
      }
    }

    const cluesSub = extractMarkdownSubSection(discoveriesSection, /Pistas y Rumores/i);
    if (cluesSub) {
      for (const line of cluesSub.split(/\r?\n/)) {
        const m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
        if (m) {
          discoveries.clues.push({
            resolved: m[1].toLowerCase() === 'x',
            text: m[2].trim(),
          });
        }
      }
    }

    const lootSub = extractMarkdownSubSection(discoveriesSection, /Bot[ií]n y Recompensas/i);
    if (lootSub) {
      discoveries.coins = extractBulletField(lootSub, ['Monedas']) || '';
      const objLine = extractBulletField(lootSub, ['Objetos']);
      if (objLine && !/^ninguno/i.test(objLine)) {
        discoveries.items.push(...splitListItems(objLine));
      }
      // Soportar también ítems adicionales listados debajo
      for (const line of lootSub.split(/\r?\n/)) {
        const t = line.trim();
        if (
          (t.startsWith('-') || t.startsWith('*')) &&
          !/^\s*[-*]\s+\*\*(?:Monedas|Objetos)\s*:?\*\*/i.test(t)
        ) {
          const item = t.replace(/^[-*]\s*/, '').trim();
          if (item && !/^ninguno/i.test(item)) {
            discoveries.items.push(item);
          }
        }
      }
    }
  }

  // 4. Sección `## 📝 Resumen Final` o `## 🏁 Cierre de Sesión`
  const summarySection = (
    extractMarkdownSection(content, /Resumen Final/i) ||
    extractMarkdownSection(content, /Cierre de Sesi[oó]n/i)
  )
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  return {
    id: normalizeEntityKey(fileName),
    number,
    title,
    fileName,
    filePath,
    date,
    location: locationRaw,
    activeParty,
    liveFeed,
    combat,
    combateActivo,
    combatTracker,
    partyResources,
    discoveries,
    summary: summarySection,
    rawContent: content,
    frontmatter: fm,
  };
}

/**
 * Parsea `Campaña/Tramas_Activas.md` extrayendo tareas `- [ ]` y `- [x]`
 */
export function parseQuestsFile(filePath: string): QuestItem[] {
  if (!fs.existsSync(filePath)) return [];
  const { content } = safeReadMarkdown(filePath);
  const lines = content.split(/\r?\n/);

  let currentSection = 'General';
  const quests: QuestItem[] = [];

  lines.forEach((line, idx) => {
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      currentSection = h2Match[1].trim();
      return;
    }

    const taskMatch = line.match(/^\s*[-*]\s+\[([ xX/\-~])\]\s+(.+)$/);
    if (taskMatch) {
      const marker = taskMatch[1].toLowerCase();
      const completed = marker === 'x';
      const isExplicitInProgress = marker === '/' || marker === '-' || marker === '~';
      const rawText = taskMatch[2].trim();

      let title = rawText;
      let description = '';

      const boldSplit = rawText.match(/^\*\*([^*]+?)\*\*\s*:?\s*(.*)$/);
      if (boldSplit) {
        title = boldSplit[1].replace(/:$/, '').trim();
        description = boldSplit[2].trim();
      }

      const status = completed
        ? 'completed'
        : isExplicitInProgress || /\(en\s+curso\)/i.test(rawText)
        ? 'in_progress'
        : 'pending';

      quests.push({
        id: `quest-${idx}`,
        section: currentSection,
        title,
        description,
        rawText,
        completed,
        status,
      });
    }
  });

  // Si ninguna misión principal está marcada explícitamente como `in_progress`,
  // marcar la primera misión pendiente de la sección Principal como `in_progress`
  const hasAnyInProgress = quests.some((q) => q.status === 'in_progress');
  if (!hasAnyInProgress) {
    const firstActiveMain = quests.find(
      (q) => !q.completed && /principal/i.test(q.section)
    ) || quests.find((q) => !q.completed);
    if (firstActiveMain) {
      firstActiveMain.status = 'in_progress';
    }
  }

  return quests;
}

/**
 * Parsea `00_Sistema/Reglas/Motor_Reglas_5e.md` y extrae tanto secciones como diccionario de Estados Alterados
 */
export function parseRulesFile(filePath: string): RulesReference | null {
  if (!fs.existsSync(filePath)) return null;
  const { data: fm, content } = safeReadMarkdown(filePath);

  const title =
    (typeof fm.name === 'string' ? fm.name : '') || 'Motor de Reglas D&D 5e';
  const description =
    (typeof fm.description === 'string' ? fm.description : '') ||
    'Referencia rápida de reglas y estados alterados.';
  const version = String(fm.version ?? '1.0');

  const sections: RuleSection[] = [];
  const lines = content.split(/\r?\n/);
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      if (currentTitle) {
        sections.push({
          id: normalizeEntityKey(currentTitle),
          title: currentTitle,
          content: currentLines.join('\n').trim(),
        });
      }
      currentTitle = h2Match[1].trim();
      currentLines = [];
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    sections.push({
      id: normalizeEntityKey(currentTitle),
      title: currentTitle,
      content: currentLines.join('\n').trim(),
    });
  }

  // Extraer definiciones rápidas de Estados Alterados para tooltips/drawer
  const conditionsMap: Record<string, string> = {};
  const conditionsSection = sections.find((s) => /Estados Alterados/i.test(s.title));
  if (conditionsSection) {
    const condLines = conditionsSection.content.split(/\r?\n/);
    for (const cLine of condLines) {
      const m = cLine.match(/^\s*[-*]\s+\*\*([^*:(]+)(?:\s*\([^)]*\))?\s*:?\*\*\s*(.+)$/);
      if (m) {
        const condName = m[1].trim();
        const condDesc = m[2].replace(/\[cite:\s*\d+\]/g, '').trim();
        conditionsMap[condName.toLowerCase()] = condDesc;
      }
    }
  }

  return {
    title,
    description,
    version,
    filePath,
    rawContent: content,
    sections,
    conditionsMap,
  };
}

/**
 * Recorre recursivamente un directorio devolviendo archivos `.md` que no empiecen con `_`
 */
function walkMarkdownFiles(dirPath: string, ignorePrefixes = ['_']): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const results: string[] = [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(fullPath, ignorePrefixes));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith('.md') &&
      !ignorePrefixes.some((prefix) => entry.name.startsWith(prefix))
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Crea un extracto limpio de las primeras líneas útiles de una nota Markdown
 */
function buildExcerpt(content: string): string {
  const clean = content
    .replace(/^#+\s+.+$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean);

  const summary = clean.slice(0, 2).join(' • ');
  return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
}

/**
 * Registra una entidad en el mapa indexado con todos sus posibles alias (nombre de archivo, título H1, sin guiones bajos)
 */
function registerEntity(
  entitiesMap: Record<string, VaultEntity>,
  entityList: VaultEntity[],
  entity: VaultEntity
): void {
  entityList.push(entity);
  const allKeys = new Set<string>([
    normalizeEntityKey(entity.id),
    normalizeEntityKey(entity.name),
    normalizeEntityKey(entity.name.replace(/_/g, ' ')),
    ...entity.aliases.map(normalizeEntityKey),
  ]);

  for (const key of allKeys) {
    if (key) {
      entitiesMap[key] = entity;
    }
  }
}

/**
 * Extrae pares `**Nombre:** Descripción` desde viñetas de una subsección
 */
function parseNamedBullets(sectionContent: string): { name: string; description: string }[] {
  if (!sectionContent) return [];
  const items: { name: string; description: string }[] = [];

  for (const line of sectionContent.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s+\*\*([^*]+?)\*\*\s*:?\s*(.+)$/);
    if (m) {
      items.push({
        name: m[1].replace(/:$/, '').trim(),
        description: m[2].trim(),
      });
    }
  }
  return items;
}

/**
 * Parsea una nota de `Mundo/Bestiario_Botin/*.md` como Monstruo (Sección A) u Objeto Mágico (Sección B)
 */
function parseBestiaryOrLoot(
  fm: Record<string, unknown>,
  content: string
): { bestiaryData: MonsterStatblock | null; lootData: MagicItemData | null } {
  const tipo = String(fm.tipo || '').toLowerCase();
  const hasMonsterSec = /SECCI[OÓ]N A|Bloque de Estad[ií]sticas/i.test(content);
  const hasLootSec = /SECCI[OÓ]N B|Ficha de Objeto M[aá]gico/i.test(content);

  const isMonster = tipo === 'monstruo' || (hasMonsterSec && tipo !== 'objeto');
  const isLoot = tipo === 'objeto' || (hasLootSec && !isMonster);

  if (isMonster) {
    const secA = extractMarkdownSection(content, /SECCI[OÓ]N A|Bloque de Estad[ií]sticas/i) || content;
    const subMatch = secA.match(/^>\s*\*([^*]+)\*/m);
    const subtitle = subMatch ? subMatch[1].trim() : String(fm.subtipo || 'Criatura');

    const ac =
      extractBulletField(secA, ['Clase de Armadura (CA)', 'Clase de Armadura', 'CA']) ||
      String(fm.ca ?? '10');
    const hp =
      extractBulletField(secA, ['Puntos de Golpe (HP)', 'Puntos de Golpe', 'HP']) ||
      String(fm.hp_max ?? '10');
    const speed = extractBulletField(secA, ['Velocidad']) || '30 pies';

    const stats = {
      FUE: '10 (+0)',
      DES: '10 (+0)',
      CON: '10 (+0)',
      INT: '10 (+0)',
      SAB: '10 (+0)',
      CAR: '10 (+0)',
    };
    const statRows = parseMarkdownTable(secA);
    if (statRows.length > 0 && statRows[0].length >= 6) {
      stats.FUE = statRows[0][0] || stats.FUE;
      stats.DES = statRows[0][1] || stats.DES;
      stats.CON = statRows[0][2] || stats.CON;
      stats.INT = statRows[0][3] || stats.INT;
      stats.SAB = statRows[0][4] || stats.SAB;
      stats.CAR = statRows[0][5] || stats.CAR;
    }

    const savingThrows = extractBulletField(secA, ['Tiradas de Salvación', 'Salvaciones']) || undefined;
    const skills = extractBulletField(secA, ['Habilidades']) || undefined;
    const resistances = extractBulletField(secA, ['Resistencias al Daño', 'Resistencias']) || undefined;
    const immunities =
      extractBulletField(secA, ['Inmunidades al Daño / Estados', 'Inmunidades']) || undefined;
    const senses = extractBulletField(secA, ['Sentidos']) || undefined;
    const languages = extractBulletField(secA, ['Idiomas']) || undefined;
    const cr =
      extractBulletField(secA, ['Desafío (CR)', 'Desafío', 'CR']) ||
      (typeof fm.cr_o_rareza === 'string' ? fm.cr_o_rareza : undefined);

    const traits = parseNamedBullets(extractMarkdownSubSection(secA, /Rasgos Especiales/i));
    const actions = parseNamedBullets(extractMarkdownSubSection(secA, /^Acciones/i));
    const bonusReactions = parseNamedBullets(
      extractMarkdownSubSection(secA, /Reacciones|Acciones Adicionales/i)
    );

    return {
      bestiaryData: {
        subtitle,
        ac,
        hp,
        speed,
        stats,
        savingThrows,
        skills,
        resistances,
        immunities,
        senses,
        languages,
        cr,
        traits,
        actions,
        bonusReactions,
      },
      lootData: null,
    };
  }

  if (isLoot) {
    const secB = extractMarkdownSection(content, /SECCI[OÓ]N B|Ficha de Objeto M[aá]gico/i) || content;
    const subMatch = secB.match(/^>\s*\*([^*]+)\*/m);
    const subtitle = subMatch ? subMatch[1].trim() : String(fm.subtipo || 'Objeto');

    const rarity =
      (typeof fm.cr_o_rareza === 'string' ? fm.cr_o_rareza : '') ||
      subtitle ||
      'Común';
    const requiresAttunement =
      Boolean(fm.sintonizacion) || /requiere sintonizaci[oó]n/i.test(subtitle);

    const weightMatch = secB.match(/\*\*Peso:\*\*\s*([^|\n]+)/i);
    const valueMatch = secB.match(/\*\*Valor estimado:\*\*\s*([^|\n]+)/i);
    const charges = extractBulletField(secB, ['Cargas / Usos', 'Cargas']) || undefined;

    const properties = parseNamedBullets(
      extractMarkdownSubSection(secB, /Propiedades Mec[aá]nicas/i)
    );
    const loreSub = extractMarkdownSubSection(secB, /Origen y Lore/i);
    const lore = loreSub
      ? loreSub
          .split(/\r?\n/)
          .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
          .filter(Boolean)
      : [];

    return {
      bestiaryData: null,
      lootData: {
        subtitle,
        rarity,
        requiresAttunement,
        weight: weightMatch ? weightMatch[1].trim() : undefined,
        value: valueMatch ? valueMatch[1].trim() : undefined,
        charges,
        properties,
        lore,
      },
    };
  }

  return { bestiaryData: null, lootData: null };
}

/**
 * Parsea los archivos de `Mundo/Lugares/*.md` para construir el grafo Point-Crawl `mapa: { nodos, aristas }`
 */
export function parseWorldMap(vaultPath: string): WorldMapGraph {
  const lugaresDir = path.join(vaultPath, 'Mundo', 'Lugares');
  const placeFiles = walkMarkdownFiles(lugaresDir, ['_', 'Plantilla']);

  const nodesMap = new Map<string, MapNode>();
  const edgesMap = new Map<string, MapEdge>();

  for (const fp of placeFiles) {
    const nombre = path.basename(fp, '.md');
    const id = normalizeEntityKey(nombre);
    const { data: fm } = safeReadMarkdown(fp);

    const subtipo =
      typeof fm.subtipo === 'string' && fm.subtipo.trim()
        ? fm.subtipo.trim()
        : 'Lugar';
    const peligro =
      typeof fm.peligro === 'string' && fm.peligro.trim()
        ? fm.peligro.trim()
        : 'Bajo';
    const estado: 'Descubierto' | 'Rumoreado' =
      typeof fm.estado === 'string' && /rumoreado/i.test(fm.estado)
        ? 'Rumoreado'
        : 'Descubierto';
    const region =
      typeof fm.region === 'string' && fm.region.trim()
        ? fm.region.replace(/^\[\[|\]\]$/g, '').trim()
        : undefined;

    const conexiones: MapConnection[] = [];
    if (Array.isArray(fm.conexiones)) {
      for (const rawConn of fm.conexiones) {
        if (typeof rawConn !== 'string') continue;
        const parts = rawConn.split('|').map((s) => s.trim());
        const destino = (parts[0] || '').replace(/^\[\[|\]\]$/g, '').trim();
        if (!destino) continue;
        const distancia = parts[1] || '';
        const via = parts[2] || '';
        conexiones.push({ destino, distancia, via });
      }
    }

    nodesMap.set(id, {
      id,
      nombre,
      subtipo,
      peligro,
      estado,
      region,
      conexiones,
    });
  }

  // Asegurar que cada destino mencionado en `conexiones` exista como nodo (si no tiene archivo .md aún, se crea como "Rumoreado")
  // y construir las aristas del grafo Point-Crawl
  const initialNodes = Array.from(nodesMap.values());
  for (const node of initialNodes) {
    for (const conn of node.conexiones) {
      const targetId = normalizeEntityKey(conn.destino);
      if (!targetId) continue;

      if (!nodesMap.has(targetId)) {
        nodesMap.set(targetId, {
          id: targetId,
          nombre: conn.destino,
          subtipo: 'Lugar Rumoreado',
          peligro: 'Desconocido',
          estado: 'Rumoreado',
          conexiones: [],
        });
      }

      const pairKey = [node.id, targetId].sort().join('--');
      const etiqueta = [conn.distancia, conn.via].filter(Boolean).join(' — ');
      if (!edgesMap.has(pairKey)) {
        edgesMap.set(pairKey, {
          id: `edge-${pairKey}`,
          origen: node.id,
          destino: targetId,
          distancia: conn.distancia,
          via: conn.via,
          etiqueta,
        });
      } else {
        const existing = edgesMap.get(pairKey)!;
        if (!existing.etiqueta && etiqueta) {
          existing.distancia = conn.distancia;
          existing.via = conn.via;
          existing.etiqueta = etiqueta;
        }
      }
    }
  }

  return {
    nodos: Array.from(nodesMap.values()),
    aristas: Array.from(edgesMap.values()),
  };
}

/**
 * Parsea toda la bóveda en `vaultPath` y devuelve un `VaultState` completo y tipado
 */
export function parseVault(vaultPath: string, lastChangedFile?: string): VaultState {
  const entities: Record<string, VaultEntity> = {};
  const entityList: VaultEntity[] = [];

  // 1. Parsear Sesiones (`Campaña/Sesiones/*.md`), ignorando `Plantilla_Sesion.md` y archivos con `_`
  const sessionsDir = path.join(vaultPath, 'Campaña', 'Sesiones');
  const sessionFiles = walkMarkdownFiles(sessionsDir, ['_', 'Plantilla']);
  const sessions: SessionLog[] = sessionFiles
    .map((fp) => parseSessionFile(fp))
    .sort((a, b) => b.number - a.number);

  const activeSession: SessionLog | null = sessions.length > 0 ? sessions[0] : null;

  // 2. Parsear Personajes (`Personajes/*.md`, ignorando `_Plantilla_PJ.md`)
  const charactersDir = path.join(vaultPath, 'Personajes');
  const characterFiles = walkMarkdownFiles(charactersDir, ['_']);
  const characters: CharacterSheet[] = characterFiles.map((fp) => parseCharacterFile(fp));

  // Sincronizar HP/estados con `## 👥 Grupo Activo` de la sesión activa si están reportados ahí
  if (activeSession && activeSession.activeParty.length > 0) {
    for (const char of characters) {
      const partyMatch = activeSession.activeParty.find(
        (p) =>
          normalizeEntityKey(p.name) === normalizeEntityKey(char.fileName) ||
          normalizeEntityKey(p.name) === normalizeEntityKey(char.name)
      );
      if (partyMatch) {
        if (
          typeof partyMatch.hpCurrent === 'number' &&
          char.frontmatter.hp_actual === undefined &&
          !/HP\s*:\s*\d+\s*\/\s*\d+/i.test(char.rawContent)
        ) {
          char.hpCurrent = partyMatch.hpCurrent;
        }
        if (typeof partyMatch.hpMax === 'number' && !char.frontmatter.hp_max) {
          char.hpMax = partyMatch.hpMax;
        }
        if (partyMatch.conditions && partyMatch.conditions.length > 0) {
          for (const c of partyMatch.conditions) {
            if (!char.conditions.includes(c)) char.conditions.push(c);
          }
        }
      }
    }
  }

  // Indexar personajes como entidades para [[WikiLinks]]
  for (const char of characters) {
    registerEntity(entities, entityList, {
      id: char.fileName,
      name: char.name.replace(/_/g, ' '),
      aliases: [char.fileName, char.name],
      category: 'Personaje',
      subType: `${char.race} • ${char.classAndLevel}`,
      filePath: char.filePath,
      frontmatter: char.frontmatter,
      content: char.rawContent,
      excerpt: buildExcerpt(char.rawContent),
    });
  }

  // 3. Indexar todas las notas de `Mundo/**/*.md`
  const mundoDir = path.join(vaultPath, 'Mundo');
  const mundoFiles = walkMarkdownFiles(mundoDir, ['_']);
  for (const fp of mundoFiles) {
    const fileName = path.basename(fp, '.md');
    const relFromMundo = path.relative(mundoDir, fp).replace(/\\/g, '/');
    const topFolder = relFromMundo.split('/')[0] || '';
    const { data: fm, content } = safeReadMarkdown(fp);

    let category: EntityCategory = 'Lugar';
    if (/pnj/i.test(topFolder) || fm.tipo === 'pnj') {
      category = 'PNJ';
    } else if (/lugar/i.test(topFolder) || fm.tipo === 'lugar') {
      category = 'Lugar';
    } else if (/faccion/i.test(topFolder) || fm.tipo === 'faccion') {
      category = 'Faccion';
    } else if (
      /bestiario|botin/i.test(topFolder) ||
      fm.tipo === 'monstruo' ||
      fm.tipo === 'objeto'
    ) {
      category = 'Bestiario_Botin';
    }

    let displayName = fileName.replace(/_/g, ' ');
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      displayName = h1Match[1].replace(/^\[\[|\]\]$/g, '').trim();
    }

    const subType =
      (typeof fm.rol === 'string' ? fm.rol.replace(/\[\[|\]\]/g, '') : '') ||
      (typeof fm.region === 'string' ? `Región: ${fm.region.replace(/\[\[|\]\]/g, '')}` : '') ||
      (typeof fm.cr_o_rareza === 'string' ? fm.cr_o_rareza : '') ||
      (typeof fm.rareza_o_desafio === 'string' ? fm.rareza_o_desafio : '') ||
      (typeof fm.subtipo === 'string' ? fm.subtipo : '') ||
      (typeof fm.tipo === 'string' ? fm.tipo : category);

    const { bestiaryData, lootData } =
      category === 'Bestiario_Botin'
        ? parseBestiaryOrLoot(fm, content)
        : { bestiaryData: null, lootData: null };

    registerEntity(entities, entityList, {
      id: fileName,
      name: displayName,
      aliases: [fileName, displayName],
      category,
      subType,
      filePath: fp,
      frontmatter: fm,
      content,
      excerpt: buildExcerpt(content),
      bestiaryData,
      lootData,
    });
  }

  // 4. Parsear Misiones (`Campaña/Tramas_Activas.md`)
  const questsPath = path.join(vaultPath, 'Campaña', 'Tramas_Activas.md');
  const quests = parseQuestsFile(questsPath);

  // 5. Parsear Reglas (`00_Sistema/Reglas/Motor_Reglas_5e.md`) e indexar sus secciones
  const rulesPath = path.join(vaultPath, '00_Sistema', 'Reglas', 'Motor_Reglas_5e.md');
  const rules = parseRulesFile(rulesPath);
  if (rules) {
    for (const sec of rules.sections) {
      registerEntity(entities, entityList, {
        id: `regla-${sec.id}`,
        name: sec.title,
        aliases: [sec.title],
        category: 'Regla',
        subType: 'Regla Oficial D&D 5e',
        filePath: rules.filePath,
        frontmatter: { version: rules.version, seccion: sec.title },
        content: `## ${sec.title}\n\n${sec.content}`,
        excerpt: buildExcerpt(sec.content),
      });
    }
  }

  // 6. Parsear Grafo de Mapa de Rutas Point-Crawl (`Mundo/Lugares/*.md`)
  const mapa = parseWorldMap(vaultPath);

  return {
    vaultPath,
    lastUpdated: new Date().toISOString(),
    lastChangedFile,
    characters,
    activeSession,
    sessions,
    quests,
    entities,
    entityList,
    rules,
    mapa,
  };
}

