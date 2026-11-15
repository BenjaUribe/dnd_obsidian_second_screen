import React, { useState } from 'react';
import { Dices, Sparkles, RotateCcw, Send, ChevronDown, ChevronRight } from 'lucide-react';

type DieType = 4 | 6 | 8 | 10 | 12 | 20 | 100;
type RollMode = 'normal' | 'advantage' | 'disadvantage';

interface RollResult {
  id: string;
  die: DieType;
  count: number;
  modifier: number;
  mode: RollMode;
  rolls: number[];
  keptRolls: number[];
  discardedRoll?: number;
  total: number;
  isCrit: boolean;
  isFumble: boolean;
  timestamp: string;
}

const DICE_OPTIONS: DieType[] = [4, 6, 8, 10, 12, 20, 100];

/**
 * Generador criptográficamente seguro (CSPRNG) sin sesgo de módulo (rejection sampling).
 * Garantiza distribución uniforme exacta entre 1 y `sides`.
 */
function rollFairDie(sides: number): number {
  const maxValid = Math.floor(0xffffffff / sides) * sides;
  const array = new Uint32Array(1);
  while (true) {
    window.crypto.getRandomValues(array);
    if (array[0] < maxValid) {
      return (array[0] % sides) + 1;
    }
  }
}

interface DiceRollerProps {
  onSendToDm?: (text: string) => void;
}

export const DiceRoller: React.FC<DiceRollerProps> = ({ onSendToDm }) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [selectedDie, setSelectedDie] = useState<DieType>(20);
  const [count, setCount] = useState<number>(1);
  const [modifier, setModifier] = useState<number>(0);
  const [mode, setMode] = useState<RollMode>('normal');
  const [history, setHistory] = useState<RollResult[]>([]);

  const handleRoll = (dieOverride?: DieType) => {
    const die = dieOverride ?? selectedDie;
    if (dieOverride) setSelectedDie(dieOverride);

    const effectiveMode: RollMode = die === 20 && count === 1 ? mode : 'normal';
    let rolls: number[] = [];
    let keptRolls: number[] = [];
    let discardedRoll: number | undefined;

    if (effectiveMode === 'advantage' || effectiveMode === 'disadvantage') {
      const r1 = rollFairDie(20);
      const r2 = rollFairDie(20);
      rolls = [r1, r2];
      const chosen =
        effectiveMode === 'advantage' ? Math.max(r1, r2) : Math.min(r1, r2);
      const dropped =
        effectiveMode === 'advantage' ? Math.min(r1, r2) : Math.max(r1, r2);
      keptRolls = [chosen];
      discardedRoll = dropped;
    } else {
      for (let i = 0; i < count; i++) {
        rolls.push(rollFairDie(die));
      }
      keptRolls = [...rolls];
    }

    const sum = keptRolls.reduce((acc, v) => acc + v, 0);
    const total = sum + modifier;
    const isCrit = die === 20 && keptRolls.length === 1 && keptRolls[0] === 20;
    const isFumble = die === 20 && keptRolls.length === 1 && keptRolls[0] === 1;

    const result: RollResult = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      die,
      count: effectiveMode === 'normal' ? count : 1,
      modifier,
      mode: effectiveMode,
      rolls,
      keptRolls,
      discardedRoll,
      total,
      isCrit,
      isFumble,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setHistory((prev) => [result, ...prev].slice(0, 8));
  };

  const latest = history[0] || null;

  const formatRollSummary = (r: RollResult) => {
    const modeTag =
      r.mode === 'advantage'
        ? ' (Ventaja)'
        : r.mode === 'disadvantage'
        ? ' (Desventaja)'
        : '';
    const modStr =
      r.modifier > 0 ? ` + ${r.modifier}` : r.modifier < 0 ? ` - ${Math.abs(r.modifier)}` : '';
    const diceDetail =
      r.mode !== 'normal'
        ? `[${r.rolls.join(', ')} → ${r.keptRolls[0]}]`
        : `[${r.rolls.join(', ')}]`;
    return `Tirada de ${r.count}d${r.die}${modeTag}${modStr}: **${r.total}** ${diceDetail}`;
  };

  return (
    <section className="rounded-xl border border-slate-800/90 bg-slate-900/75 backdrop-blur-md shadow-lg overflow-hidden">
      {/* Cabecera tipo Acordeón */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full p-3.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-left hover:bg-slate-900/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Dices className="w-4 h-4 text-amber-400" />
          <h2 className="font-display text-sm uppercase tracking-wider font-bold text-amber-300/90">
            Bandeja de Dados
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {collapsed && latest && (
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-900 border border-amber-500/40 text-amber-300">
              {latest.count}d{latest.die}: <strong>{latest.total}</strong>
            </span>
          )}
          <span
            className="text-[10px] font-mono text-emerald-400/90 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded"
            title="Web Crypto API (CSPRNG) sin sesgo de módulo"
          >
            CSPRNG
          </span>
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="p-3.5 space-y-3">
        {/* Selector rápido de dados */}
        <div className="grid grid-cols-7 gap-1">
          {DICE_OPTIONS.map((d) => {
            const active = selectedDie === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDie(d)}
                className={`py-1.5 rounded-lg font-mono text-xs font-bold transition-all border ${
                  active
                    ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-sm'
                    : 'bg-slate-950/80 text-slate-300 border-slate-800 hover:border-amber-500/40 hover:text-amber-200'
                }`}
              >
                d{d}
              </button>
            );
          })}
        </div>

        {/* Controles de Cantidad, Modificador y Ventaja/Desventaja */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-400">Dados:</span>
            <div className="flex items-center gap-1.5 font-mono">
              <button
                type="button"
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                -
              </button>
              <span className="w-4 text-center font-bold text-slate-100">{count}</span>
              <button
                type="button"
                onClick={() => setCount((c) => Math.min(20, c + 1))}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-400">Mod:</span>
            <div className="flex items-center gap-1.5 font-mono">
              <button
                type="button"
                onClick={() => setModifier((m) => m - 1)}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                -
              </button>
              <span className="w-6 text-center font-bold text-amber-300">
                {modifier >= 0 ? `+${modifier}` : modifier}
              </span>
              <button
                type="button"
                onClick={() => setModifier((m) => m + 1)}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Selector Normal / Ventaja / Desventaja (activo para 1d20) */}
        <div className="grid grid-cols-3 gap-1.5 text-[11px]">
          {(
            [
              ['normal', 'Normal', 'bg-slate-800 text-slate-100 border-slate-600'],
              ['advantage', 'Ventaja', 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'],
              ['disadvantage', 'Desventaja', 'bg-rose-500/20 text-rose-300 border-rose-500/50'],
            ] as const
          ).map(([mKey, label, activeCls]) => {
            const disabled = selectedDie !== 20 || count !== 1;
            const isActive = !disabled && mode === mKey;
            return (
              <button
                key={mKey}
                type="button"
                disabled={disabled}
                onClick={() => setMode(mKey)}
                title={
                  disabled
                    ? 'Ventaja/Desventaja aplica a tiradas de 1d20'
                    : `Tirar 1d20 con ${label}`
                }
                className={`py-1 rounded-lg font-semibold border transition-all disabled:opacity-35 ${
                  isActive
                    ? activeCls
                    : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Botón principal de Lanzar */}
        <button
          type="button"
          onClick={() => handleRoll()}
          className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            Lanzar {selectedDie === 20 && count === 1 ? '1' : count}d{selectedDie}
            {modifier !== 0 ? (modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`) : ''}
          </span>
        </button>

        {/* Último Resultado Destacado */}
        {latest && (
          <div
            className={`rounded-xl border p-3 transition-all ${
              latest.isCrit
                ? 'bg-amber-500/15 border-amber-400 shadow-[0_0_15px_rgba(245,196,81,0.25)]'
                : latest.isFumble
                ? 'bg-rose-950/50 border-rose-500/60'
                : 'bg-slate-950/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {latest.count}d{latest.die}
                  {latest.mode === 'advantage'
                    ? ' • Ventaja'
                    : latest.mode === 'disadvantage'
                    ? ' • Desventaja'
                    : ''}
                  {latest.modifier !== 0
                    ? latest.modifier > 0
                      ? ` + ${latest.modifier}`
                      : ` - ${Math.abs(latest.modifier)}`
                    : ''}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs font-mono">
                  {latest.mode !== 'normal' ? (
                    <>
                      <span className="text-emerald-300 font-bold">
                        {latest.keptRolls[0]}
                      </span>
                      <span className="text-slate-500 line-through">
                        {latest.discardedRoll}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-300">[{latest.rolls.join(', ')}]</span>
                  )}
                  {latest.isCrit && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">
                      ¡20 Natural!
                    </span>
                  )}
                  {latest.isFumble && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-500 text-white">
                      ¡1 Natural!
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-2xl font-extrabold ${
                    latest.isCrit
                      ? 'text-amber-300'
                      : latest.isFumble
                      ? 'text-rose-400'
                      : 'text-slate-100'
                  }`}
                >
                  {latest.total}
                </span>
                {onSendToDm && (
                  <button
                    type="button"
                    onClick={() => onSendToDm(formatRollSummary(latest))}
                    title="Enviar resultado al chat del DM"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mini Historial */}
        {history.length > 1 && (
          <div className="pt-1 border-t border-slate-800/70 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase font-bold">
              <span>Últimas tiradas</span>
              <button
                type="button"
                onClick={() => setHistory([])}
                className="hover:text-slate-300 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Limpiar</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {history.slice(1, 6).map((item) => (
                <span
                  key={item.id}
                  title={formatRollSummary(item)}
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950/70 border border-slate-800 text-slate-300"
                >
                  {item.count}d{item.die}:{' '}
                  <strong className="text-amber-300">{item.total}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
        </div>
      )}
    </section>
  );
};

