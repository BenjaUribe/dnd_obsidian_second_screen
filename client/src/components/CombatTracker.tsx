import React from 'react';
import { Swords, Shield, Heart, AlertCircle } from 'lucide-react';
import { SessionLog, VaultEntity } from '../types';
import { WikiText } from './WikiText';

interface CombatTrackerProps {
  session: SessionLog | null;
  entities: Record<string, VaultEntity>;
  onSelectEntity: (entityName: string) => void;
}

export const CombatTracker: React.FC<CombatTrackerProps> = ({
  session,
  entities,
  onSelectEntity,
}) => {
  if (!session || !session.combateActivo || session.combatTracker.length === 0) {
    return null;
  }

  return (
    <section className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 pt-4">
      <div className="rounded-xl border border-rose-500/50 bg-gradient-to-r from-rose-950/60 via-slate-900/90 to-rose-950/40 backdrop-blur-md shadow-[0_0_25px_rgba(225,29,72,0.18)] overflow-hidden">
        {/* Cabecera del Tracker */}
        <div className="px-4 py-2.5 bg-rose-950/70 border-b border-rose-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-rose-400 animate-pulse" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-rose-200">
              Rastreador de Combate e Iniciativa
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/25 text-rose-300 border border-rose-500/40">
              En Curso ({session.combatTracker.length})
            </span>
          </div>
          <span className="text-[11px] font-mono text-rose-300/80 hidden sm:inline">
            {session.title}
          </span>
        </div>

        {/* Tabla de Iniciativa en Tiempo Real */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800/90 bg-slate-950/50 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-2 px-4 font-semibold text-center w-20">Inic.</th>
                <th className="py-2 px-4 font-semibold">Combatiente</th>
                <th className="py-2 px-4 font-semibold text-center">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="w-3 h-3 text-rose-400" /> HP
                  </span>
                </th>
                <th className="py-2 px-4 font-semibold text-center">
                  <span className="inline-flex items-center gap-1">
                    <Shield className="w-3 h-3 text-amber-400" /> CA
                  </span>
                </th>
                <th className="py-2 px-4 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-sky-400" /> Estados / Concentración
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {session.combatTracker.map((row, idx) => (
                <tr
                  key={`${row.combatant}-${idx}`}
                  className="hover:bg-rose-500/5 transition-colors"
                >
                  <td className="py-2.5 px-4 text-center">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded bg-slate-950 border border-rose-500/30 font-mono font-bold text-amber-300">
                      {row.initiative}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-100">
                    <WikiText
                      text={row.combatant}
                      entities={entities}
                      onSelectEntity={onSelectEntity}
                    />
                  </td>
                  <td className="py-2.5 px-4 text-center font-mono font-semibold text-slate-200">
                    {row.hp}
                  </td>
                  <td className="py-2.5 px-4 text-center font-mono font-semibold text-amber-300">
                    {row.ac}
                  </td>
                  <td className="py-2.5 px-4 text-slate-300">
                    <WikiText
                      text={row.conditions}
                      entities={entities}
                      onSelectEntity={onSelectEntity}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

