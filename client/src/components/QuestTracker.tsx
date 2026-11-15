import React, { useState } from 'react';
import {
  Compass,
  CheckCircle2,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
  Scroll,
  BookOpen,
} from 'lucide-react';
import { QuestItem, RulesReference, VaultEntity } from '../types';
import { WikiText } from './WikiText';

interface QuestTrackerProps {
  quests: QuestItem[];
  rules: RulesReference | null;
  entities: Record<string, VaultEntity>;
  onSelectEntity: (entityName: string) => void;
}

export const QuestTracker: React.FC<QuestTrackerProps> = ({
  quests,
  rules,
  entities,
  onSelectEntity,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState(true);

  const completedCount = quests.filter((q) => q.status === 'completed' || q.completed).length;
  const inProgressCount = quests.filter((q) => q.status === 'in_progress' && !q.completed).length;
  const totalCount = quests.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Agrupar misiones por sección (ej: Principales, Secundarias)
  const sections = Array.from(new Set(quests.map((q) => q.section)));

  const getQuestStatusMeta = (quest: QuestItem) => {
    const status = quest.completed ? 'completed' : quest.status || 'pending';
    if (status === 'completed') {
      return {
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
        badge: 'Completada',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        cardClass: 'bg-slate-950/50 border-emerald-500/25 text-slate-400 line-through',
      };
    }
    if (status === 'in_progress') {
      return {
        icon: <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />,
        badge: 'En curso',
        badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/50',
        cardClass:
          'bg-amber-950/20 border-amber-500/40 text-slate-100 shadow-sm hover:border-amber-400/60',
      };
    }
    return {
      icon: <Circle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />,
      badge: 'Pendiente',
      badgeClass: 'bg-slate-800/90 text-slate-300 border-slate-700',
      cardClass: 'bg-slate-950/80 border-slate-800/90 text-slate-200 hover:border-slate-700',
    };
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Panel de Tramas Activas */}
      <section className="rounded-xl border border-slate-800/90 bg-slate-900/75 backdrop-blur-md shadow-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full p-3.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-left hover:bg-slate-900/80 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-400" />
            <h2 className="font-display text-sm uppercase tracking-wider font-bold text-amber-300">
              Tramas y Misiones
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {inProgressCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-200">
                {inProgressCount} en curso
              </span>
            )}
            {collapsed ? (
              <ChevronRight className="w-4 h-4 text-slate-300" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-300" />
            )}
          </div>
        </button>

        {!collapsed && (
          <div className="p-4 space-y-4">
            {/* Barra única de progreso sin duplicar contador y porcentaje */}
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                <span className="font-medium">Objetivos completados</span>
                <span className="font-mono font-bold text-amber-300">
                  {completedCount} de {totalCount}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${
                      progressPct > 0 ? progressPct : inProgressCount > 0 ? 12 : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {quests.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">
                No hay misiones en <code className="text-amber-300">Tramas_Activas.md</code>.
              </p>
            ) : (
              sections.map((sec) => {
                const secQuests = quests.filter((q) => q.section === sec);
                return (
                  <div key={sec} className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Scroll className="w-3.5 h-3.5 text-amber-400" />
                      <span>{sec}</span>
                    </h3>
                    <div className="space-y-2">
                      {secQuests.map((quest) => {
                        const meta = getQuestStatusMeta(quest);
                        return (
                          <div
                            key={quest.id}
                            className={`p-3 rounded-xl border text-xs transition-all ${meta.cardClass}`}
                          >
                            <div className="flex items-start gap-2.5">
                              {meta.icon}
                              <div className="flex-1 space-y-1.5 leading-relaxed">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="font-semibold text-slate-100 text-[13px]">
                                    <WikiText
                                      text={quest.title}
                                      entities={entities}
                                      onSelectEntity={onSelectEntity}
                                    />
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border shrink-0 ${meta.badgeClass}`}
                                  >
                                    {meta.badge}
                                  </span>
                                </div>
                                {quest.description && (
                                  <p className="text-slate-300 text-xs">
                                    <WikiText
                                      text={quest.description}
                                      entities={entities}
                                      onSelectEntity={onSelectEntity}
                                    />
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      {/* Acceso Rápido al Motor de Reglas 5e */}
      {rules && (
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/75 backdrop-blur-md shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setRulesExpanded(!rulesExpanded)}
            className="w-full p-3.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-left hover:bg-slate-900/80 transition-colors"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-sky-400" />
              <h2 className="font-display text-sm uppercase tracking-wider font-bold text-sky-300">
                Motor de Reglas 5e
              </h2>
            </div>
            {rulesExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-300" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-300" />
            )}
          </button>

          {rulesExpanded && (
            <div className="p-3 space-y-1.5">
              {rules.sections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => onSelectEntity(sec.title)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-200 bg-slate-950/60 hover:bg-sky-500/15 hover:text-sky-200 border border-slate-800/80 hover:border-sky-500/30 transition-all flex items-center justify-between"
                >
                  <span className="truncate">{sec.title}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
