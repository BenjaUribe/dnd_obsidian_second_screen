import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  User,
  Users,
  MapPin,
  Swords,
  Sparkles,
  Flag,
  BookOpen,
  HelpCircle,
} from 'lucide-react';
import { normalizeEntityKey, VaultEntity } from '../types';

interface WikiTextProps {
  text: string;
  entities: Record<string, VaultEntity>;
  onSelectEntity: (entityName: string) => void;
  className?: string;
}

function getEntityChipTheme(entity?: VaultEntity) {
  if (!entity) {
    return {
      chip: 'bg-slate-800/90 text-slate-200 border-slate-600/80 hover:bg-slate-700 hover:border-amber-400/50 border-dashed',
      badge: 'bg-slate-800 text-slate-300 border-slate-700',
      label: 'Sin nota aún',
      icon: <HelpCircle className="w-3 h-3 text-slate-400 shrink-0" />,
    };
  }

  switch (entity.category) {
    case 'Personaje':
      return {
        chip: 'bg-amber-500/15 text-amber-200 border-amber-500/40 hover:bg-amber-500/30 hover:border-amber-400',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        label: 'Personaje (PJ)',
        icon: <User className="w-3 h-3 text-amber-400 shrink-0" />,
      };
    case 'PNJ':
      return {
        chip: 'bg-orange-500/15 text-orange-200 border-orange-500/40 hover:bg-orange-500/30 hover:border-orange-400',
        badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
        label: 'PNJ',
        icon: <Users className="w-3 h-3 text-orange-400 shrink-0" />,
      };
    case 'Lugar':
      return {
        chip: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40 hover:bg-emerald-500/30 hover:border-emerald-400',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        label: 'Lugar / Locación',
        icon: <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />,
      };
    case 'Bestiario_Botin':
      if (entity.subType === 'loot' || entity.lootData) {
        return {
          chip: 'bg-purple-500/15 text-purple-200 border-purple-500/40 hover:bg-purple-500/30 hover:border-purple-400',
          badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          label: 'Objeto / Botín',
          icon: <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />,
        };
      }
      return {
        chip: 'bg-rose-500/15 text-rose-200 border-rose-500/40 hover:bg-rose-500/30 hover:border-rose-400',
        badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        label: 'Criatura / Hostil',
        icon: <Swords className="w-3 h-3 text-rose-400 shrink-0" />,
      };
    case 'Faccion':
      return {
        chip: 'bg-violet-500/15 text-violet-200 border-violet-500/40 hover:bg-violet-500/30 hover:border-violet-400',
        badge: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
        label: 'Facción',
        icon: <Flag className="w-3 h-3 text-violet-400 shrink-0" />,
      };
    default:
      return {
        chip: 'bg-sky-500/15 text-sky-200 border-sky-500/40 hover:bg-sky-500/30 hover:border-sky-400',
        badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
        label: entity.category,
        icon: <BookOpen className="w-3 h-3 text-sky-400 shrink-0" />,
      };
  }
}

interface EntityChipProps {
  targetName: string;
  displayLabel: string;
  entity?: VaultEntity;
  onSelectEntity: (entityName: string) => void;
}

const EntityChip: React.FC<EntityChipProps> = ({
  targetName,
  displayLabel,
  entity,
  onSelectEntity,
}) => {
  const [hoverPos, setHoverPos] = useState<{
    left: number;
    top: number;
    placeBelow: boolean;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const theme = getEntityChipTheme(entity);

  const handleMouseEnter = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const tooltipWidth = 272;
    const rawCenterX = rect.left + rect.width / 2;
    const clampedLeft = Math.max(
      12 + tooltipWidth / 2,
      Math.min(window.innerWidth - 12 - tooltipWidth / 2, rawCenterX)
    );
    const placeBelow = rect.top < 170;
    setHoverPos({
      left: clampedLeft,
      top: placeBelow ? rect.bottom + 8 : rect.top - 8,
      placeBelow,
    });
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
  };

  return (
    <span className="inline-block mx-0.5 align-baseline">
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          setHoverPos(null);
          onSelectEntity(targetName);
        }}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold transition-all border shadow-sm cursor-pointer ${theme.chip}`}
      >
        {theme.icon}
        <span>{displayLabel}</span>
      </button>

      {hoverPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: `${hoverPos.left}px`,
              top: `${hoverPos.top}px`,
              transform: hoverPos.placeBelow
                ? 'translate(-50%, 0)'
                : 'translate(-50%, -100%)',
              zIndex: 9999,
            }}
            className="pointer-events-none w-[272px] p-3 rounded-xl bg-slate-950/95 border border-slate-700 shadow-2xl text-left backdrop-blur-md"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-display text-xs font-bold text-slate-100 truncate">
                {entity ? entity.name.replace(/_/g, ' ') : displayLabel}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border shrink-0 ${theme.badge}`}
              >
                {theme.label}
              </span>
            </div>

            {entity?.bestiaryData && (
              <div className="text-[11px] font-mono text-rose-300 mb-1">
                CA {entity.bestiaryData.ac} • HP {entity.bestiaryData.hp}
                {entity.bestiaryData.cr ? ` • VD ${entity.bestiaryData.cr}` : ''}
              </div>
            )}

            <div className="text-xs text-slate-300 line-clamp-3 leading-relaxed font-normal">
              {entity?.excerpt
                ? entity.excerpt.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1')
                : 'Mención aún sin archivo en la bóveda. Haz clic para inspeccionar.'}
            </div>
            <div className="mt-1.5 text-[10px] text-amber-400 font-semibold">
              Clic para abrir ficha completa →
            </div>
          </div>,
          document.body
        )}
    </span>
  );
};

/**
 * Renderiza texto que contiene enlaces estilo Obsidian `[[Entidad]]` o `[[Entidad|Alias]]`
 * convirtiéndolos en chips semánticos sin corchetes y con tarjeta rápida flotante (Portal).
 */
export const WikiText: React.FC<WikiTextProps> = ({
  text,
  entities,
  onSelectEntity,
  className = '',
}) => {
  if (!text) return null;

  const parts = text.split(/(\[\[[^\]]+\]\])/g);

  return (
    <span className={className}>
      {parts.map((part, idx) => {
        const match = part.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
        if (!match) {
          const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
          return (
            <React.Fragment key={idx}>
              {boldParts.map((bPart, bIdx) => {
                if (bPart.startsWith('**') && bPart.endsWith('**')) {
                  return (
                    <strong key={bIdx} className="font-semibold text-slate-100">
                      {bPart.slice(2, -2)}
                    </strong>
                  );
                }
                return <React.Fragment key={bIdx}>{bPart}</React.Fragment>;
              })}
            </React.Fragment>
          );
        }

        const targetName = match[1].trim();
        const displayLabel = (match[2] || targetName).replace(/_/g, ' ').trim();
        const key = normalizeEntityKey(targetName);
        const entity = entities[key] || entities[normalizeEntityKey(displayLabel)];

        return (
          <EntityChip
            key={idx}
            targetName={targetName}
            displayLabel={displayLabel}
            entity={entity}
            onSelectEntity={onSelectEntity}
          />
        );
      })}
    </span>
  );
};
