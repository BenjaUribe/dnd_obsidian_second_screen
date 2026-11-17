import React, { useState, useMemo } from 'react';
import {
  ArrowUpCircle,
  Heart,
  Dices,
  Sparkles,
  BookOpen,
  Search,
  CheckCircle2,
  Plus,
  X,
  Shield,
  Award,
  Wand2,
} from 'lucide-react';
import { CharacterSheet } from '../types';
import {
  getClassRule,
  getProficiencyBonus,
  getMaxSpellLevel,
  getSpellSlotsSummary,
} from '../data/dnd5eProgression';
import spellsCatalog from '../data/spells5e.json';

interface CatalogSpell {
  id: string;
  name: string;
  level: number;
  school: string;
  classes: string[];
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  summary: string;
}

interface CustomSpell {
  id: string;
  name: string;
  level: number;
  castingTime: string;
  range: string;
  notes: string;
}

interface LevelUpModalProps {
  character: CharacterSheet;
  onClose: () => void;
  onConfirmLevelUp: (prompt: string) => void;
}

const STAT_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
const STAT_LABELS: Record<(typeof STAT_KEYS)[number], string> = {
  STR: 'Fuerza (STR)',
  DEX: 'Destreza (DEX)',
  CON: 'Constitución (CON)',
  INT: 'Inteligencia (INT)',
  WIS: 'Sabiduría (WIS)',
  CHA: 'Carisma (CHA)',
};

function secureRollDie(sides: number): number {
  const maxValid = Math.floor(0x100000000 / sides) * sides;
  const array = new Uint32Array(1);
  let randomVal = 0;
  do {
    window.crypto.getRandomValues(array);
    randomVal = array[0];
  } while (randomVal >= maxValid);
  return (randomVal % sides) + 1;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({
  character,
  onClose,
  onConfirmLevelUp,
}) => {
  const targetLevel = Math.min(20, character.level + 1);
  const classRule = useMemo(() => getClassRule(character.className), [character.className]);
  const conMod = character.attributes.CON?.modifier ?? 0;
  const newProfBonus = getProficiencyBonus(targetLevel);
  const oldProfBonus = getProficiencyBonus(character.level);

  // 1. Puntos de Golpe (HP)
  const [hpMode, setHpMode] = useState<'average' | 'roll'>('average');
  const [rolledDie, setRolledDie] = useState<number | null>(null);

  const baseDieGain = hpMode === 'average' ? classRule.hitDieAverage : rolledDie ?? classRule.hitDieAverage;
  const hpGain = Math.max(1, baseDieGain + conMod);
  const newHpMax = character.hpMax + hpGain;
  const newHpCurrent = character.hpCurrent + hpGain;

  const handleRollHpDie = () => {
    const val = secureRollDie(classRule.hitDie);
    setHpMode('roll');
    setRolledDie(val);
  };

  // 2. Rasgos de Hoja de Ruta para targetLevel
  const matchingRoadmapItems = useMemo(() => {
    const items: { tierLabel: string; label: string; description: string }[] = [];
    for (const tier of character.roadmap) {
      // Buscar mención exacta al nivel objetivo (ej. "Nivel 2", "Niveles 1 - 4")
      const singleMatch = tier.levelLabel.match(/nivel\s*(\d+)/i);
      const rangeMatch = tier.levelLabel.match(/(\d+)\s*-\s*(\d+)/);
      let matchesTier = false;
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        if (targetLevel >= start && targetLevel <= end) matchesTier = true;
      } else if (singleMatch && parseInt(singleMatch[1], 10) === targetLevel) {
        matchesTier = true;
      }

      for (const item of tier.items) {
        const itemLvlMatch = item.label.match(/nivel\s*(\d+)/i);
        if (itemLvlMatch) {
          if (parseInt(itemLvlMatch[1], 10) === targetLevel) {
            items.push({ tierLabel: tier.levelLabel, label: item.label, description: item.description });
          }
        } else if (matchesTier && !item.unlocked) {
          items.push({ tierLabel: tier.levelLabel, label: item.label, description: item.description });
        }
      }
    }
    return items;
  }, [character.roadmap, targetLevel]);

  // 3. Subclase y ASI / Dote
  const needsSubclass =
    targetLevel === classRule.subclassLevel ||
    (!character.subclass && targetLevel >= classRule.subclassLevel) ||
    character.subclass.toLowerCase().includes('por elegir');

  const [selectedSubclass, setSelectedSubclass] = useState<string>(
    character.subclass && !character.subclass.toLowerCase().includes('por elegir')
      ? character.subclass
      : classRule.subclassExamples[0] || ''
  );

  const hasAsi = classRule.asiLevels.includes(targetLevel);
  const [asiMode, setAsiMode] = useState<'plus2' | 'plus1x2' | 'feat'>('plus2');
  const [asiStat1, setAsiStat1] = useState<(typeof STAT_KEYS)[number]>('STR');
  const [asiStat2, setAsiStat2] = useState<(typeof STAT_KEYS)[number]>('DEX');
  const [featName, setFeatName] = useState<string>('');

  // 4. Catálogo de Conjuros y Trucos
  const maxSpellLevel = getMaxSpellLevel(classRule.casterType, targetLevel);
  const isCaster = classRule.casterType !== 'none' && maxSpellLevel > 0;
  const newSpellSlots = useMemo(
    () => getSpellSlotsSummary(classRule.casterType, targetLevel),
    [classRule.casterType, targetLevel]
  );

  const alreadyKnownNames = useMemo(() => {
    const set = new Set<string>();
    character.spellcasting?.preparedSpells.forEach((sp) =>
      set.add(sp.name.toLowerCase().trim())
    );
    return set;
  }, [character.spellcasting]);

  const availableCatalogSpells = useMemo(() => {
    if (!isCaster) return [];
    return (spellsCatalog as CatalogSpell[]).filter(
      (sp) =>
        sp.classes.includes(classRule.canonicalName) &&
        sp.level <= maxSpellLevel &&
        !alreadyKnownNames.has(sp.name.toLowerCase().trim())
    );
  }, [isCaster, classRule.canonicalName, maxSpellLevel, alreadyKnownNames]);

  const [spellSearch, setSpellSearch] = useState<string>('');
  const [spellLevelFilter, setSpellLevelFilter] = useState<number | 'all'>('all');
  const [selectedSpellIds, setSelectedSpellIds] = useState<string[]>([]);
  const [customSpells, setCustomSpells] = useState<CustomSpell[]>([]);
  const [showCustomForm, setShowCustomForm] = useState<boolean>(false);
  const [customName, setCustomName] = useState('');
  const [customLevel, setCustomLevel] = useState(1);
  const [customTime, setCustomTime] = useState('1 acción');
  const [customRange, setCustomRange] = useState('60 pies');
  const [customNotes, setCustomNotes] = useState('');

  const filteredSpells = useMemo(() => {
    return availableCatalogSpells.filter((sp) => {
      if (spellLevelFilter !== 'all' && sp.level !== spellLevelFilter) return false;
      if (spellSearch.trim()) {
        const q = spellSearch.toLowerCase();
        return (
          sp.name.toLowerCase().includes(q) ||
          sp.school.toLowerCase().includes(q) ||
          sp.summary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [availableCatalogSpells, spellLevelFilter, spellSearch]);

  const toggleSpellSelection = (id: string) => {
    setSelectedSpellIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAddCustomSpell = () => {
    if (!customName.trim()) return;
    setCustomSpells((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name: customName.trim(),
        level: customLevel,
        castingTime: customTime.trim() || '1 acción',
        range: customRange.trim() || 'Personal',
        notes: customNotes.trim() || 'Conjuro añadido al subir de nivel',
      },
    ]);
    setCustomName('');
    setCustomNotes('');
    setShowCustomForm(false);
  };

  const handleConfirm = () => {
    const selectedCatalogObjs = (spellsCatalog as CatalogSpell[]).filter((sp) =>
      selectedSpellIds.includes(sp.id)
    );

    const hpExplanation =
      hpMode === 'average'
        ? `Promedio oficial (${classRule.hitDieAverage}) + Mod. CON (${conMod >= 0 ? `+${conMod}` : conMod}) = +${hpGain} HP`
        : `Tirada de 1d${classRule.hitDie} (${rolledDie ?? classRule.hitDieAverage}) + Mod. CON (${conMod >= 0 ? `+${conMod}` : conMod}) = +${hpGain} HP`;

    const lines: string[] = [
      `⬆️ **Subida de Nivel Confirmada para ${character.name.replace(/_/g, ' ')}** (Archivo: \`Personajes/${character.fileName}.md\`).`,
      `Por favor actualiza inmediatamente su ficha en la bóveda de Obsidian aplicando exactamente estos cambios:`,
      `- **Nuevo Nivel:** ${character.level} → **${targetLevel}** (${classRule.canonicalName} ${targetLevel}). Actualiza tanto el frontmatter YAML (\`nivel: ${targetLevel}\`) como el encabezado de la ficha.`,
      `- **Puntos de Golpe (HP):** Incrementa en **+${hpGain} HP** (${hpExplanation}). Nuevo \`hp_max: ${newHpMax}\` y \`hp_actual: ${newHpCurrent}\`.`,
      `- **Dados de Golpe:** Actualiza el total a \`${targetLevel}/${targetLevel} (1d${classRule.hitDie})\`.`,
    ];

    if (newProfBonus !== oldProfBonus) {
      lines.push(
        `- **Bonificador por Competencia:** Sube de +${oldProfBonus} a **+${newProfBonus}**. Actualiza las tiradas de salvación, habilidades, ataques y CD de conjuros que dependan de competencia.`
      );
    }

    if (needsSubclass && selectedSubclass.trim()) {
      lines.push(
        `- **Subclase Elegida:** \`${selectedSubclass.trim()}\` (actualiza el YAML \`subclase\` y el encabezado).`
      );
    }

    if (hasAsi) {
      if (asiMode === 'plus2') {
        lines.push(
          `- **Mejora de Característica (ASI Nivel ${targetLevel}):** Aumenta **${asiStat1} en +2** (recalcula su modificador y estadísticas derivadas).`
        );
      } else if (asiMode === 'plus1x2') {
        lines.push(
          `- **Mejora de Característica (ASI Nivel ${targetLevel}):** Aumenta **${asiStat1} en +1** y **${asiStat2} en +1** (recalcula sus modificadores).`
        );
      } else if (asiMode === 'feat' && featName.trim()) {
        lines.push(
          `- **Dote Elegida (Nivel ${targetLevel}):** **${featName.trim()}**. Regístrala en los rasgos de clase/hoja de ruta.`
        );
      }
    }

    if (matchingRoadmapItems.length > 0) {
      lines.push(
        `- **Hoja de Ruta 1-20:** En la sección \`### 📈 Hoja de Ruta de Clase y Subclase\`, marca como completados (\`[x]\`) los rasgos de Nivel ${targetLevel}: ${matchingRoadmapItems
          .map((i) => `**${i.label}**`)
          .join(', ')}.`
      );
    } else {
      lines.push(
        `- **Hoja de Ruta 1-20:** En la sección \`### 📈 Hoja de Ruta de Clase y Subclase\`, marca con \`[x]\` los rasgos correspondientes al Nivel ${targetLevel}.`
      );
    }

    if (isCaster) {
      const slotParts = Object.entries(newSpellSlots).map(
        ([lvl, count]) => `Nivel ${lvl}: ${count} espacios`
      );
      if (slotParts.length > 0) {
        lines.push(
          `- **Espacios de Conjuro (Nivel ${targetLevel}):** Actualiza la tabla \`### Espacios de Conjuro\` a: ${slotParts.join(', ')}.`
        );
      }

      const allNewSpells = [
        ...selectedCatalogObjs.map((sp) => ({
          level: sp.level,
          name: sp.name,
          castingTime: sp.castingTime,
          range: sp.range,
          notes: `${sp.concentration ? 'Concentración. ' : ''}${sp.ritual ? 'Ritual. ' : ''}${sp.summary}`,
        })),
        ...customSpells,
      ];

      if (allNewSpells.length > 0) {
        lines.push(
          `- **Nuevos Trucos / Conjuros Aprendidos:** Añade las siguientes filas a la tabla \`### Trucos y Conjuros Preparados\`:`
        );
        for (const sp of allNewSpells) {
          const lvlLabel = sp.level === 0 ? 'Truco' : `${sp.level}`;
          lines.push(
            `  - \`| ${lvlLabel} | ${sp.name} | ${sp.castingTime} | ${sp.range} | ${sp.notes} |\``
          );
        }
      }
    }

    lines.push(
      `- Finalmente, registra brevemente esta subida a Nivel ${targetLevel} en la bitácora de la sesión activa (\`Sesiones/\`).`
    );

    onConfirmLevelUp(lines.join('\n'));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] rounded-2xl border border-amber-500/40 bg-slate-900 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-950/60 via-slate-950 to-slate-950 border-b border-amber-500/30 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center shadow-inner">
              <ArrowUpCircle className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg sm:text-xl font-bold text-amber-300">
                  Subir de Nivel: {character.name.replace(/_/g, ' ')}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-200 border border-amber-400/40">
                  Nivel {character.level} → {targetLevel}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {character.race} • {classRule.canonicalName} • Dado de Golpe{' '}
                <span className="text-amber-300 font-mono">1d{classRule.hitDie}</span> • Competencia{' '}
                <span className="text-emerald-300 font-mono">+{newProfBonus}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Asistente */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* BLOQUE 1: PUNTOS DE GOLPE (HP) */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-rose-400 fill-rose-400/30" />
                <span>1. Incremento de Puntos de Golpe (HP)</span>
              </h3>
              <span className="text-xs font-mono text-slate-400">
                Mod. CON: {conMod >= 0 ? `+${conMod}` : conMod}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opción A: Promedio Oficial */}
              <button
                type="button"
                onClick={() => setHpMode('average')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  hpMode === 'average'
                    ? 'bg-emerald-950/30 border-emerald-500/60 text-slate-100 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-emerald-300">
                    Promedio Oficial 5e
                  </span>
                  <span className="font-mono text-sm font-bold text-emerald-300">
                    +{Math.max(1, classRule.hitDieAverage + conMod)} HP
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Valor fijo ({classRule.hitDieAverage} de 1d{classRule.hitDie}) + Mod. CON (
                  {conMod >= 0 ? `+${conMod}` : conMod}). Seguro y consistente.
                </p>
              </button>

              {/* Opción B: Tirar Dado con CSPRNG */}
              <div
                onClick={() => {
                  if (rolledDie === null) handleRollHpDie();
                  else setHpMode('roll');
                }}
                className={`cursor-pointer p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  hpMode === 'roll'
                    ? 'bg-amber-950/30 border-amber-500/60 text-slate-100 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-amber-300 flex items-center gap-1.5">
                    <Dices className="w-4 h-4 text-amber-400" />
                    Tirar 1d{classRule.hitDie} (CSPRNG)
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRollHpDie();
                    }}
                    className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 text-[11px] font-semibold"
                  >
                    {rolledDie === null ? `Lanzar 1d${classRule.hitDie}` : 'Relanzar'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  {rolledDie === null ? (
                    'Haz clic para lanzar tu Dado de Golpe criptográfico.'
                  ) : (
                    <span>
                      Resultado dado:{' '}
                      <strong className="text-amber-300 font-mono">{rolledDie}</strong> + CON (
                      {conMod >= 0 ? `+${conMod}` : conMod}) ={' '}
                      <strong className="text-emerald-300 font-mono">
                        +{Math.max(1, rolledDie + conMod)} HP
                      </strong>
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
              <span className="text-slate-400">Nuevo Puntos de Golpe Máximos:</span>
              <span className="font-mono font-bold text-sm text-emerald-300">
                {character.hpMax} → {newHpMax} HP
              </span>
            </div>
          </section>

          {/* BLOQUE 2: RASGOS DE CLASE, SUBCLASE Y ASI */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              <span>2. Rasgos de Nivel {targetLevel} y Progresión</span>
            </h3>

            {/* Rasgos detectados en la Hoja de Ruta de la Ficha */}
            {matchingRoadmapItems.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[11px] text-slate-400">
                  Rasgos de tu <code className="text-amber-300">Hoja de Ruta 1–20</code> que se
                  desbloquearán automáticamente:
                </div>
                {matchingRoadmapItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/35 text-xs"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-emerald-200">{item.label}</span>
                      {item.description && (
                        <span className="ml-1.5 text-slate-300">{item.description}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                El DM marcará como completados los rasgos de Nivel {targetLevel} en tu Hoja de Ruta.
              </p>
            )}

            {/* Selector de Subclase si corresponde */}
            {needsSubclass && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-amber-300">
                  ¡Nivel de Subclase alcanzado! Elige o escribe tu Subclase de{' '}
                  {classRule.canonicalName}:
                </label>
                {classRule.subclassExamples.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {classRule.subclassExamples.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setSelectedSubclass(sub)}
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${
                          selectedSubclass === sub
                            ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={selectedSubclass}
                  onChange={(e) => setSelectedSubclass(e.target.value)}
                  placeholder="Ej. Escuela de Evocación, Camino de la Mano Abierta..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>
            )}

            {/* Selector de ASI / Dote si corresponde */}
            {hasAsi && (
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mejora de Característica (ASI) o Dote de Nivel {targetLevel}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['plus2', '+2 a un atributo'],
                      ['plus1x2', '+1 a dos atributos'],
                      ['feat', 'Elegir una Dote'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setAsiMode(mode)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        asiMode === mode
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {asiMode === 'plus2' && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">Atributo (+2):</span>
                    <select
                      value={asiStat1}
                      onChange={(e) => setAsiStat1(e.target.value as (typeof STAT_KEYS)[number])}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                    >
                      {STAT_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {STAT_LABELS[k]} (Actual: {character.attributes[k].score})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {asiMode === 'plus1x2' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Primer Atributo (+1):
                      </label>
                      <select
                        value={asiStat1}
                        onChange={(e) => setAsiStat1(e.target.value as (typeof STAT_KEYS)[number])}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                      >
                        {STAT_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {STAT_LABELS[k]} (Actual: {character.attributes[k].score})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Segundo Atributo (+1):
                      </label>
                      <select
                        value={asiStat2}
                        onChange={(e) => setAsiStat2(e.target.value as (typeof STAT_KEYS)[number])}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                      >
                        {STAT_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {STAT_LABELS[k]} (Actual: {character.attributes[k].score})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {asiMode === 'feat' && (
                  <input
                    type="text"
                    value={featName}
                    onChange={(e) => setFeatName(e.target.value)}
                    placeholder="Nombre de la Dote (ej. Alerta, Afortunado, Lanzador de Conjuros de Guerra...)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                )}
              </div>
            )}
          </section>

          {/* BLOQUE 3: CATÁLOGO DE TRUCOS Y CONJUROS (SOLO LANZADORES) */}
          {isCaster && (
            <section className="rounded-xl border border-sky-500/30 bg-slate-950/75 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                    <Wand2 className="w-4 h-4 text-sky-400" />
                    <span>
                      3. Grimorio y Selección de Conjuros ({classRule.canonicalName} • Máx. Nivel{' '}
                      {maxSpellLevel})
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Selecciona los nuevos trucos o conjuros que aprenderás en el Nivel {targetLevel}
                    .
                  </p>
                </div>

                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-sky-500/20 text-sky-200 border border-sky-400/40">
                  {selectedSpellIds.length + customSpells.length} seleccionados
                </span>
              </div>

              {/* Resumen de nuevos Espacios de Conjuro */}
              {Object.keys(newSpellSlots).length > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
                  <span className="text-slate-400 font-medium">
                    Espacios en Nivel {targetLevel}:
                  </span>
                  {Object.entries(newSpellSlots).map(([lvl, count]) => (
                    <span
                      key={lvl}
                      className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono text-[11px]"
                    >
                      Niv. {lvl}: {count}
                    </span>
                  ))}
                </div>
              )}

              {/* Barra de filtro por nivel y buscador */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={spellSearch}
                    onChange={(e) => setSpellSearch(e.target.value)}
                    placeholder="Buscar conjuro por nombre, escuela o efecto..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
                  />
                </div>

                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setSpellLevelFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                      spellLevelFilter === 'all'
                        ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpellLevelFilter(0)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                      spellLevelFilter === 0
                        ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Trucos (0)
                  </button>
                  {Array.from({ length: maxSpellLevel }, (_, idx) => idx + 1).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSpellLevelFilter(lvl)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        spellLevelFilter === lvl
                          ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Niv. {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid de Tarjetas de Conjuros */}
              <div className="max-h-64 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredSpells.length === 0 ? (
                  <div className="col-span-2 py-6 text-center text-xs text-slate-500">
                    No se encontraron conjuros con ese filtro o ya los tienes preparados.
                  </div>
                ) : (
                  filteredSpells.map((sp) => {
                    const isSelected = selectedSpellIds.includes(sp.id);
                    return (
                      <div
                        key={sp.id}
                        onClick={() => toggleSpellSelection(sp.id)}
                        className={`cursor-pointer rounded-xl border p-3 transition-all flex flex-col justify-between gap-2 ${
                          isSelected
                            ? 'bg-sky-950/40 border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                              <span>{sp.name}</span>
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-950 text-sky-300 border border-slate-800 shrink-0">
                              {sp.level === 0 ? 'Truco' : `Niv. ${sp.level}`}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span>{sp.school}</span>
                            <span>•</span>
                            <span>{sp.castingTime}</span>
                            <span>•</span>
                            <span>{sp.range}</span>
                            {sp.concentration && (
                              <span className="px-1 rounded bg-amber-500/20 text-amber-300">
                                Conc.
                              </span>
                            )}
                            {sp.ritual && (
                              <span className="px-1 rounded bg-purple-500/20 text-purple-300">
                                Ritual
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">
                            {sp.summary}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Conjuros personalizados añadidos */}
              {customSpells.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-sky-300">
                    Conjuros personalizados a agregar:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {customSpells.map((cs) => (
                      <span
                        key={cs.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-950/60 border border-sky-500/40 text-xs text-sky-200"
                      >
                        <span>
                          {cs.name} ({cs.level === 0 ? 'Truco' : `Niv. ${cs.level}`})
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCustomSpells((prev) => prev.filter((x) => x.id !== cs.id))
                          }
                          className="text-slate-400 hover:text-rose-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Botón / Formulario para agregar conjuro personalizado (Homebrew / Suplementos) */}
              {!showCustomForm ? (
                <button
                  type="button"
                  onClick={() => setShowCustomForm(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>¿No encuentras un conjuro o usas Homebrew? Añádelo manualmente</span>
                </button>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Añadir Conjuro Personalizado</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCustomForm(false)}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Nombre del conjuro"
                      className="sm:col-span-2 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100"
                    />
                    <select
                      value={customLevel}
                      onChange={(e) => setCustomLevel(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100"
                    >
                      <option value={0}>Truco (Nivel 0)</option>
                      {Array.from({ length: maxSpellLevel }, (_, i) => i + 1).map((l) => (
                        <option key={l} value={l}>
                          Nivel {l}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={customRange}
                      onChange={(e) => setCustomRange(e.target.value)}
                      placeholder="Alcance (ej. 60 pies)"
                      className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      placeholder="Tiempo (ej. 1 acción)"
                      className="w-1/3 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100"
                    />
                    <input
                      type="text"
                      value={customNotes}
                      onChange={(e) => setCustomNotes(e.target.value)}
                      placeholder="Efecto / Daño / Notas..."
                      className="flex-1 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomSpell}
                      className="px-3 py-1.5 rounded bg-sky-500 text-slate-950 font-bold text-xs hover:bg-sky-400"
                    >
                      Añadir
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer de Confirmación */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            El DM (<code className="text-amber-300">agy</code>) actualizará{' '}
            <code className="text-slate-200">Personajes/{character.fileName}.md</code> sin
            conflictos de escritura.
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Confirmar y Enviar Subida a Nivel {targetLevel} al DM</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

