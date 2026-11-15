import React, { useState } from 'react';
import {
  Shield,
  Heart,
  Sword,
  Backpack,
  Sparkles,
  AlertTriangle,
  UserCheck,
  Star,
  Coins,
  BookOpen,
  GitBranch,
  X,
  CheckCircle2,
  Circle,
  Wand2,
  FileText,
  ArrowUpCircle,
  Dices,
  Send,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
} from 'lucide-react';
import { CharacterSheet, VaultEntity } from '../types';
import { WikiText } from './WikiText';
import { getNextLevelXp, XP_THRESHOLDS } from '../data/dnd5eProgression';
import { LevelUpModal } from './LevelUpModal';

interface PartyPanelProps {
  characters: CharacterSheet[];
  entities: Record<string, VaultEntity>;
  conditionsMap: Record<string, string>;
  onSelectEntity: (entityName: string) => void;
  onSendPrompt?: (prompt: string, newSession?: boolean) => Promise<void> | void;
}

type DetailTab = 'inventory' | 'spells' | 'roadmap';

interface QuickStatRoll {
  charId: string;
  charName: string;
  stat: string;
  die: number;
  mod: number;
  total: number;
}

function rollCryptoD20(): number {
  const sides = 20;
  const maxValid = Math.floor(0x100000000 / sides) * sides;
  const array = new Uint32Array(1);
  let val = 0;
  do {
    window.crypto.getRandomValues(array);
    val = array[0];
  } while (val >= maxValid);
  return (val % sides) + 1;
}

export const PartyPanel: React.FC<PartyPanelProps> = ({
  characters,
  entities,
  conditionsMap,
  onSelectEntity,
  onSendPrompt,
}) => {
  const [detailCharId, setDetailCharId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('inventory');
  const [levelUpCharId, setLevelUpCharId] = useState<string | null>(null);
  const [quickRolls, setQuickRolls] = useState<Record<string, QuickStatRoll>>({});
  const [expandedTraits, setExpandedTraits] = useState<Record<string, boolean>>({});
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const detailChar = characters.find((c) => c.id === detailCharId) || null;
  const levelUpChar = characters.find((c) => c.id === levelUpCharId) || null;

  const isCardExpanded = (charId: string): boolean => {
    if (expandedCards[charId] !== undefined) {
      return expandedCards[charId];
    }
    // Por defecto: expandido si hay 1 o 2 personajes; compacto si hay 3 o más
    return characters.length <= 2;
  };

  const allCardsExpanded =
    characters.length > 0 && characters.every((c) => isCardExpanded(c.id));

  const toggleAllCards = () => {
    const nextState = !allCardsExpanded;
    const nextMap: Record<string, boolean> = {};
    for (const c of characters) {
      nextMap[c.id] = nextState;
    }
    setExpandedCards(nextMap);
  };

  const toggleSingleCard = (e: React.MouseEvent, charId: string) => {
    e.stopPropagation();
    const current = isCardExpanded(charId);
    setExpandedCards((prev) => ({
      ...prev,
      [charId]: !current,
    }));
  };

  const getHpStatus = (current: number, max: number) => {
    const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    const pct = Math.round(ratio * 100);

    if (pct > 50) {
      return {
        pct,
        barColor: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]',
        textColor: 'text-emerald-400',
        borderAccent: 'border-emerald-500/40',
        label: 'Saludable',
      };
    }
    if (pct >= 25) {
      return {
        pct,
        barColor: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]',
        textColor: 'text-amber-300',
        borderAccent: 'border-amber-500/40',
        label: 'Herido',
      };
    }
    return {
      pct,
      barColor: 'bg-rose-600 shadow-[0_0_12px_rgba(225,29,72,0.7)]',
      textColor: 'text-rose-400',
      borderAccent: 'border-rose-500/50',
      label: current <= 0 ? 'Caído (0 HP)' : 'Crítico',
    };
  };

  const formatMod = (mod: number) => (mod >= 0 ? `+${mod}` : `${mod}`);

  const openDetailModal = (charId: string, initialTab: DetailTab = 'inventory') => {
    setDetailCharId(charId);
    setActiveTab(initialTab);
  };

  const handleQuickStatRoll = (
    e: React.MouseEvent,
    char: CharacterSheet,
    stat: string,
    mod: number
  ) => {
    e.stopPropagation();
    const die = rollCryptoD20();
    const total = die + mod;
    setQuickRolls((prev) => ({
      ...prev,
      [char.id]: {
        charId: char.id,
        charName: char.name.replace(/_/g, ' '),
        stat,
        die,
        mod,
        total,
      },
    }));
  };

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1 gap-2">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-400" />
            <h2 className="font-display text-sm uppercase tracking-wider text-amber-300 font-bold">
              Grupo de Aventureros ({characters.length})
            </h2>
          </div>
          {characters.length > 0 && (
            <button
              type="button"
              onClick={toggleAllCards}
              title={
                allCardsExpanded
                  ? 'Compactar todas las tarjetas para ver más personajes sin hacer scroll'
                  : 'Expandir atributos y rasgos de todos los personajes'
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/90 hover:border-amber-500/40 text-xs font-semibold text-slate-200 transition-colors"
            >
              {allCardsExpanded ? (
                <>
                  <ChevronsUp className="w-3.5 h-3.5 text-amber-400" />
                  <span>Vista Compacta</span>
                </>
              ) : (
                <>
                  <ChevronsDown className="w-3.5 h-3.5 text-amber-400" />
                  <span>Expandir Todo</span>
                </>
              )}
            </button>
          )}
        </div>

        {characters.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-300">
            No se encontraron fichas de personajes en{' '}
            <code className="text-amber-300">Personajes/</code>.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {characters.map((char) => {
              const hp = getHpStatus(char.hpCurrent, char.hpMax);
              const statKeys = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
              const showDeathSaves =
                char.hpCurrent <= 0 ||
                char.deathSaves.successes > 0 ||
                char.deathSaves.failures > 0;
              const nextXp = getNextLevelXp(char.level);
              const prevXp = XP_THRESHOLDS[char.level] ?? 0;
              const canLevelUpByXp = nextXp !== null && char.xp >= nextXp;
              const xpPct =
                nextXp !== null && nextXp > prevXp
                  ? Math.max(
                      0,
                      Math.min(100, Math.round(((char.xp - prevXp) / (nextXp - prevXp)) * 100))
                    )
                  : 100;

              const activeRoll = quickRolls[char.id];
              const isTraitsExpanded = Boolean(expandedTraits[char.id]);
              const extraEntries = Object.entries(char.extraFields || {});
              const visibleTraits = isTraitsExpanded ? extraEntries : extraEntries.slice(0, 3);
              const cardExpanded = isCardExpanded(char.id);

              return (
                <article
                  key={char.id}
                  onClick={() => openDetailModal(char.id, 'inventory')}
                  className="cursor-pointer rounded-xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md p-3.5 shadow-lg hover:border-amber-500/40 transition-all group"
                >
                  {/* Cabecera del PJ */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-base sm:text-lg font-bold text-slate-100 group-hover:text-amber-300 transition-colors truncate">
                          {char.name.replace(/_/g, ' ')}
                        </h3>
                        {/* Indicador de Inspiración Heroica */}
                        <span
                          title={
                            char.heroicInspiration
                              ? 'Inspiración Heroica disponible'
                              : 'Sin Inspiración Heroica'
                          }
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold border shrink-0 ${
                            char.heroicInspiration
                              ? 'bg-amber-500/25 text-amber-300 border-amber-400/70 shadow-[0_0_8px_rgba(245,196,81,0.4)]'
                              : 'bg-slate-950/70 text-slate-400 border-slate-700'
                          }`}
                        >
                          <Star
                            className={`w-3 h-3 ${
                              char.heroicInspiration ? 'fill-amber-300 text-amber-300' : ''
                            }`}
                          />
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 font-medium mt-0.5 truncate">
                        {char.race} •{' '}
                        <span className="text-amber-300 font-semibold">{char.classAndLevel}</span>
                      </p>
                    </div>

                    {/* Escudo de CA + Botón Acordeón Individual */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-amber-500/40 shadow-inner"
                        title="Clase de Armadura (CA)"
                      >
                        <Shield className="w-4 h-4 text-amber-400" />
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-slate-300 leading-none font-semibold">
                            CA
                          </div>
                          <div className="font-mono text-base font-extrabold text-slate-100 leading-tight">
                            {char.ac}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => toggleSingleCard(e, char.id)}
                        title={
                          cardExpanded
                            ? 'Compactar tarjeta (ocultar atributos y rasgos)'
                            : 'Desplegar atributos, PX, monedas y rasgos'
                        }
                        className={`p-2 rounded-lg border transition-colors ${
                          cardExpanded
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                            : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-amber-300'
                        }`}
                      >
                        {cardExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Barra de HP protagonista (con semáforo y números grandes) */}
                  <div className="mb-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                        <Heart className={`w-4 h-4 ${hp.textColor} fill-current`} />
                        <span>HP</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-md bg-slate-900 border font-semibold ${hp.borderAccent} ${hp.textColor}`}
                        >
                          {hp.label}
                        </span>
                      </span>
                      <span className="font-mono flex items-baseline gap-1.5">
                        <span className={`text-lg font-extrabold ${hp.textColor}`}>
                          {char.hpCurrent}
                        </span>
                        <span className="text-xs text-slate-400">/</span>
                        <span className="text-base font-bold text-slate-100">{char.hpMax}</span>
                        {char.hpTemp > 0 && (
                          <span
                            className="ml-1 px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200 border border-sky-500/40 text-xs font-bold"
                            title="Puntos de Golpe Temporales"
                          >
                            +{char.hpTemp} Temp
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${hp.barColor}`}
                        style={{ width: `${hp.pct}%` }}
                      />
                    </div>

                    {/* Salvaciones contra Muerte: SOLO visibles cuando HP <= 0 o hay marcas activas */}
                    {showDeathSaves && (
                      <div className="mt-2.5 p-2 rounded-lg bg-rose-950/40 border border-rose-500/40 flex items-center justify-between text-xs">
                        <span className="text-rose-200 font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                          <span>Salv. Muerte:</span>
                        </span>
                        <div className="flex items-center gap-3.5">
                          <div className="flex items-center gap-1.5" title="Éxitos">
                            <span className="text-[11px] text-emerald-300 font-semibold">Éx:</span>
                            {[0, 1, 2].map((i) => (
                              <span
                                key={`s-${i}`}
                                className={`w-3 h-3 rounded-full border ${
                                  i < char.deathSaves.successes
                                    ? 'bg-emerald-500 border-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                                    : 'bg-slate-900 border-slate-600'
                                }`}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5" title="Fallos">
                            <span className="text-[11px] text-rose-300 font-semibold">Fa:</span>
                            {[0, 1, 2].map((i) => (
                              <span
                                key={`f-${i}`}
                                className={`w-3 h-3 rounded-full border ${
                                  i < char.deathSaves.failures
                                    ? 'bg-rose-500 border-rose-200 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                                    : 'bg-slate-900 border-slate-600'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Botón de Subida de Nivel siempre visible si alcanzó los PX */}
                    {canLevelUpByXp && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLevelUpCharId(char.id);
                        }}
                        className="mt-2 w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-all animate-pulse"
                      >
                        <ArrowUpCircle className="w-4 h-4" />
                        <span>¡Subir a Nivel {char.level + 1}!</span>
                      </button>
                    )}

                    {/* Barra compacta de Experiencia (PX) — visible cuando la tarjeta está desplegada */}
                    {cardExpanded && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-300 font-medium">Experiencia (PX):</span>
                          <span className="font-mono text-amber-300 font-bold">
                            {char.xp}
                            {nextXp !== null ? ` / ${nextXp} PX` : ' PX (Máx)'}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              canLevelUpByXp
                                ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                                : 'bg-sky-500/80'
                            }`}
                            style={{ width: `${xpPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Estados Alterados (si existen) */}
                  {char.conditions.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      {char.conditions.map((cond) => {
                        const desc =
                          conditionsMap[cond.toLowerCase()] ||
                          'Estado activo en el personaje. Haz clic para consultar el Motor de Reglas.';
                        return (
                          <button
                            key={cond}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectEntity(
                                '6. Estados Alterados (Recordatorio Obligatorio en Turno)'
                              );
                            }}
                            title={desc}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-500/40 hover:bg-rose-500/30 transition-colors"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                            <span>{cond}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* SECCIÓN PLEGABLE (ACORDEÓN): Atributos, Monedas, Ataques y Rasgos */}
                  {!cardExpanded ? (
                    <div className="flex items-center justify-between gap-2 pt-1 text-xs text-slate-300">
                      <div className="flex items-center gap-2 font-mono text-amber-300/90">
                        <span className="inline-flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5 text-amber-400" />
                          <span>{char.currencies.po} PO</span>
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400">
                          {char.xp}/{nextXp ?? 'Máx'} PX
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={(e) => toggleSingleCard(e, char.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-amber-300"
                        >
                          <span>Atributos y rasgos</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs text-amber-300 font-semibold group-hover:underline">
                          Ficha →
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Grid de 6 Atributos Clickeables (Tiran 1d20 + mod) */}
                      <div className="grid grid-cols-6 gap-1.5 mb-2.5">
                    {statKeys.map((stat) => {
                      const info = char.attributes[stat];
                      const isPositive = info.modifier > 0;
                      const isNegative = info.modifier < 0;
                      return (
                        <button
                          key={stat}
                          type="button"
                          onClick={(e) => handleQuickStatRoll(e, char, stat, info.modifier)}
                          title={`Clic para tirar prueba de ${stat}: 1d20 ${formatMod(
                            info.modifier
                          )}`}
                          className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg bg-slate-950/90 hover:bg-amber-500/15 border border-slate-800 hover:border-amber-400/50 transition-all group/stat"
                        >
                          <span className="text-[11px] font-bold tracking-wider text-slate-300 group-hover/stat:text-amber-300">
                            {stat}
                          </span>
                          <span
                            className={`font-mono text-sm font-extrabold leading-tight ${
                              isPositive
                                ? 'text-amber-300'
                                : isNegative
                                ? 'text-rose-400'
                                : 'text-slate-200'
                            }`}
                          >
                            {formatMod(info.modifier)}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {info.score}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Resultado de Tirada Rápida de Atributo */}
                  {activeRoll && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mb-3 p-2.5 rounded-lg bg-amber-950/35 border border-amber-500/45 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <Dices className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-slate-200">
                          <strong>{activeRoll.stat}:</strong>{' '}
                          <span className="font-mono text-slate-300">
                            1d20 ({activeRoll.die}) {formatMod(activeRoll.mod)} =
                          </span>{' '}
                          <strong
                            className={`font-mono text-sm ${
                              activeRoll.die === 20
                                ? 'text-emerald-300'
                                : activeRoll.die === 1
                                ? 'text-rose-400'
                                : 'text-amber-300'
                            }`}
                          >
                            {activeRoll.total}
                          </strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {onSendPrompt && (
                          <button
                            type="button"
                            onClick={() => {
                              onSendPrompt(
                                `🎲 **Tirada de ${activeRoll.stat} (${activeRoll.charName}):** 1d20 (${activeRoll.die}) ${formatMod(activeRoll.mod)} = **${activeRoll.total}**.`,
                                false
                              );
                            }}
                            title="Enviar resultado al DM"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px]"
                          >
                            <Send className="w-3 h-3" />
                            <span>Al DM</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setQuickRolls((prev) => {
                              const next = { ...prev };
                              delete next[char.id];
                              return next;
                            })
                          }
                          className="p-0.5 text-slate-400 hover:text-slate-200"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Monedas y acceso rápido a Ficha */}
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-2.5 mb-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs">
                    <div className="flex items-center gap-1.5 text-amber-300 font-mono font-semibold">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>{char.currencies.po} PO</span>
                      {char.currencies.pp > 0 && (
                        <span className="text-slate-200">• {char.currencies.pp} PP</span>
                      )}
                      {char.currencies.pe > 0 && (
                        <span className="text-cyan-300">• {char.currencies.pe} PE</span>
                      )}
                      {char.currencies.pc > 0 && (
                        <span className="text-amber-500">• {char.currencies.pc} PC</span>
                      )}
                      {char.currencies.ppt > 0 && (
                        <span className="text-sky-300">• {char.currencies.ppt} PPT</span>
                      )}
                    </div>
                    <span className="text-xs text-amber-300 font-semibold group-hover:underline">
                      Abrir Ficha →
                    </span>
                  </div>

                  {/* Ataques y Rasgos sin `[x]` roto ni truncado frustrante */}
                  <div className="space-y-2 text-xs text-slate-200 border-t border-slate-800/80 pt-2.5">
                    {char.attacks.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Sword className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        <div className="leading-relaxed">
                          <span className="text-slate-300 font-semibold">Ataques: </span>
                          <WikiText
                            text={char.attacks.slice(0, 2).join(' • ')}
                            entities={entities}
                            onSelectEntity={onSelectEntity}
                          />
                        </div>
                      </div>
                    )}

                    {extraEntries.length > 0 && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedTraits((prev) => ({
                            ...prev,
                            [char.id]: !prev[char.id],
                          }));
                        }}
                        title="Haz clic para desplegar o contraer los rasgos completos"
                        className="pt-2 mt-1.5 border-t border-slate-800/70 space-y-1.5 cursor-pointer"
                      >
                        {visibleTraits.map(([rawKey, fieldVal]) => {
                          const cleanKey = rawKey.replace(/^`?\[[ xX]\]`?\s*/, '').trim();
                          return (
                            <div
                              key={rawKey}
                              title={`${cleanKey}: ${fieldVal}`}
                              className="flex items-start gap-1.5 text-xs leading-relaxed"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                              <div className={isTraitsExpanded ? '' : 'line-clamp-1'}>
                                <span className="text-amber-300 font-semibold">
                                  {cleanKey}:{' '}
                                </span>
                                <span className="text-slate-200">
                                  <WikiText
                                    text={fieldVal}
                                    entities={entities}
                                    onSelectEntity={onSelectEntity}
                                  />
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        <div className="flex items-center justify-end gap-1 text-[11px] text-amber-300/90 hover:text-amber-200 font-semibold pt-0.5">
                          {isTraitsExpanded ? (
                            <>
                              <span>Contraer rasgos</span>
                              <ChevronUp className="w-3.5 h-3.5" />
                            </>
                          ) : (
                            <>
                              <span>
                                Ver rasgos completos ({extraEntries.length})
                              </span>
                              <ChevronDown className="w-3.5 h-3.5" />
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal de Detalle de Personaje (Inventario/Sintonización, Conjuros, Hoja de Ruta 1-20) */}
      {detailChar && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDetailCharId(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[88vh] rounded-2xl border border-amber-500/35 bg-slate-900 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="p-4 sm:p-5 bg-slate-950/80 border-b border-slate-800 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-bold text-amber-300">
                    {detailChar.name.replace(/_/g, ' ')}
                  </h2>
                  {detailChar.heroicInspiration && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/50">
                      <Star className="w-3 h-3 fill-amber-300" />
                      Inspiración Heroica
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {detailChar.race} • {detailChar.classAndLevel} • CA {detailChar.ac} • HP{' '}
                  {detailChar.hpCurrent}/{detailChar.hpMax}
                  {detailChar.hpTemp > 0 ? ` (+${detailChar.hpTemp} Temp)` : ''} • Dados de Golpe:{' '}
                  {detailChar.hitDice}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {detailChar.level < 20 && (
                  <button
                    type="button"
                    onClick={() => {
                      const cId = detailChar.id;
                      setDetailCharId(null);
                      setLevelUpCharId(cId);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-xs font-bold text-amber-200 border border-amber-400/50 transition-colors"
                    title="Abrir Asistente de Subida de Nivel (por PX o por Hito)"
                  >
                    <ArrowUpCircle className="w-3.5 h-3.5 text-amber-300" />
                    <span>Subir a Nivel {detailChar.level + 1}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const fName = detailChar.fileName;
                    setDetailCharId(null);
                    onSelectEntity(fName);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Ver Nota .md</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailCharId(null)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Pestañas */}
            <div className="px-4 sm:px-5 pt-2 bg-slate-950/40 border-b border-slate-800 flex gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('inventory')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'inventory'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-300 hover:text-slate-100'
                }`}
              >
                <Backpack className="w-3.5 h-3.5" />
                <span>Inventario y Sintonización</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('spells')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'spells'
                    ? 'border-sky-400 text-sky-300'
                    : 'border-transparent text-slate-300 hover:text-slate-100'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Conjuros</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('roadmap')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'roadmap'
                    ? 'border-emerald-400 text-emerald-300'
                    : 'border-transparent text-slate-300 hover:text-slate-100'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>Hoja de Ruta (1–20)</span>
              </button>
            </div>

            {/* Contenido de Pestañas */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* TAB 1: INVENTARIO Y SINTONIZACIÓN */}
              {activeTab === 'inventory' && (
                <div className="space-y-5">
                  {/* Riqueza / Monedas */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>Bolsa de Monedas</span>
                    </h3>
                    <div className="grid grid-cols-5 gap-2">
                      {(
                        [
                          ['PC', detailChar.currencies.pc, 'text-amber-500'],
                          ['PP', detailChar.currencies.pp, 'text-slate-200'],
                          ['PE', detailChar.currencies.pe, 'text-cyan-300'],
                          ['PO', detailChar.currencies.po, 'text-amber-300'],
                          ['PPT', detailChar.currencies.ppt, 'text-sky-200'],
                        ] as const
                      ).map(([label, amount, color]) => (
                        <div
                          key={label}
                          className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5 text-center"
                        >
                          <div className="text-xs font-bold text-slate-400">{label}</div>
                          <div className={`font-mono text-base font-bold ${color}`}>
                            {amount}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sintonización (Máx. 3) */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Sintonización con Objetos Mágicos (Máx. 3)</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(detailChar.attunement.length > 0
                        ? detailChar.attunement
                        : [
                            { active: false, item: 'Vacío' },
                            { active: false, item: 'Vacío' },
                            { active: false, item: 'Vacío' },
                          ]
                      ).map((slot, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg border p-2.5 text-xs flex items-center gap-2 ${
                            slot.active
                              ? 'bg-purple-950/30 border-purple-500/40 text-purple-200'
                              : 'bg-slate-950/50 border-slate-800 text-slate-400'
                          }`}
                        >
                          {slot.active ? (
                            <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <span className="truncate">
                            <WikiText
                              text={slot.item}
                              entities={entities}
                              onSelectEntity={(n) => {
                                setDetailCharId(null);
                                onSelectEntity(n);
                              }}
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lista de Inventario */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                      <Backpack className="w-3.5 h-3.5 text-amber-400" />
                      <span>Inventario ({detailChar.inventory.length})</span>
                    </h3>
                    {detailChar.inventory.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin objetos registrados.</p>
                    ) : (
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {detailChar.inventory.map((item, idx) => (
                          <li
                            key={idx}
                            className="rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2 text-xs text-slate-200"
                          >
                            <WikiText
                              text={item}
                              entities={entities}
                              onSelectEntity={(n) => {
                                setDetailCharId(null);
                                onSelectEntity(n);
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: CONJUROS */}
              {activeTab === 'spells' && (
                <div className="space-y-5">
                  {!detailChar.spellcasting ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center text-sm text-slate-300">
                      <BookOpen className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      Este personaje no tiene capacidades mágicas o aún no ha desbloqueado conjuros.
                    </div>
                  ) : (
                    <>
                      {/* Estadísticas de Lanzamiento */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3">
                          <div className="text-xs uppercase text-slate-300">Aptitud</div>
                          <div className="text-sm font-bold text-sky-300">
                            {detailChar.spellcasting.ability}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3">
                          <div className="text-xs uppercase text-slate-300">Modificador</div>
                          <div className="font-mono text-sm font-bold text-slate-100">
                            {detailChar.spellcasting.modifier}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3">
                          <div className="text-xs uppercase text-slate-300">CD Salvación</div>
                          <div className="font-mono text-sm font-bold text-amber-300">
                            {detailChar.spellcasting.saveDc}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3">
                          <div className="text-xs uppercase text-slate-300">Bonif. Ataque</div>
                          <div className="font-mono text-sm font-bold text-rose-300">
                            {detailChar.spellcasting.attackBonus}
                          </div>
                        </div>
                      </div>

                      {/* Espacios de Conjuro */}
                      {detailChar.spellcasting.slots.some((s) => s.total > 0) && (
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                            Espacios de Conjuro
                          </h3>
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                            {detailChar.spellcasting.slots
                              .filter((s) => s.total > 0)
                              .map((slot) => {
                                const available = Math.max(0, slot.total - slot.expended);
                                return (
                                  <div
                                    key={slot.level}
                                    className="rounded-lg bg-slate-950/80 border border-sky-500/30 p-2.5 text-center"
                                  >
                                    <div className="text-xs font-bold text-sky-300 uppercase">
                                      Nivel {slot.level}
                                    </div>
                                    <div className="font-mono text-sm font-bold text-slate-100 my-1">
                                      {available} / {slot.total}
                                    </div>
                                    <div className="flex justify-center gap-1">
                                      {Array.from({ length: slot.total }).map((_, i) => (
                                        <span
                                          key={i}
                                          className={`w-2.5 h-2.5 rounded-full ${
                                            i < available
                                              ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.6)]'
                                              : 'bg-slate-800 border border-slate-700'
                                          }`}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Trucos y Conjuros Preparados */}
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                          Trucos y Conjuros Preparados
                        </h3>
                        {detailChar.spellcasting.preparedSpells.length === 0 ? (
                          <p className="text-xs text-slate-400">
                            No hay conjuros preparados listados en la tabla.
                          </p>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-slate-800">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-950 text-slate-300">
                                <tr>
                                  <th className="py-2 px-3">Niv.</th>
                                  <th className="py-2 px-3">Nombre</th>
                                  <th className="py-2 px-3">Tiempo</th>
                                  <th className="py-2 px-3">Alcance</th>
                                  <th className="py-2 px-3">Notas</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/70">
                                {detailChar.spellcasting.preparedSpells.map((sp, i) => (
                                  <tr key={i} className="bg-slate-900/60">
                                    <td className="py-2 px-3 font-mono text-sky-300">
                                      {sp.level === 0 ? 'Truco' : sp.level}
                                    </td>
                                    <td className="py-2 px-3 font-semibold text-slate-100">
                                      {sp.name}
                                    </td>
                                    <td className="py-2 px-3 text-slate-300">
                                      {sp.castingTime}
                                    </td>
                                    <td className="py-2 px-3 text-slate-300">{sp.range}</td>
                                    <td className="py-2 px-3 text-slate-300">{sp.notes}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: HOJA DE RUTA DE NIVELES (1-20) */}
              {activeTab === 'roadmap' && (
                <div className="space-y-3">
                  {detailChar.roadmap.length === 0 ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center text-sm text-slate-300">
                      Esta ficha no incluye una sección de{' '}
                      <code className="text-amber-300">Hoja de Ruta de Clase y Subclase</code>.
                    </div>
                  ) : (
                    detailChar.roadmap.map((tier) => (
                      <div
                        key={tier.levelLabel}
                        className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3.5 space-y-2"
                      >
                        <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                          {tier.levelLabel}
                        </div>
                        <div className="space-y-1.5">
                          {tier.items.map((item, idx) => (
                            <div
                              key={idx}
                              className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${
                                item.unlocked
                                  ? 'bg-emerald-950/25 border-emerald-500/35 text-slate-100'
                                  : 'bg-slate-900/50 border-slate-800/80 text-slate-400'
                              }`}
                            >
                              {item.unlocked ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              ) : (
                                <Circle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                              )}
                              <div>
                                <span
                                  className={`font-semibold ${
                                    item.unlocked ? 'text-emerald-200' : 'text-slate-300'
                                  }`}
                                >
                                  {item.label}
                                </span>
                                {item.description && (
                                  <span className="ml-1.5 opacity-95">{item.description}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Asistente Híbrido de Subida de Nivel D&D 5e */}
      {levelUpChar && (
        <LevelUpModal
          character={levelUpChar}
          onClose={() => setLevelUpCharId(null)}
          onConfirmLevelUp={(prompt) => {
            if (onSendPrompt) {
              onSendPrompt(prompt, false);
            }
          }}
        />
      )}
    </>
  );
};
