import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X,
  Search,
  FileText,
  User,
  MapPin,
  Shield,
  Skull,
  BookOpen,
  Sparkles,
  FolderOpen,
} from 'lucide-react';
import {
  EntityCategory,
  normalizeEntityKey,
  RulesReference,
  VaultEntity,
} from '../types';
import { WikiText } from './WikiText';

interface EntityDrawerProps {
  selectedEntityName: string | null;
  isSearchOpen: boolean;
  entities: Record<string, VaultEntity>;
  entityList: VaultEntity[];
  rules: RulesReference | null;
  onSelectEntity: (entityName: string) => void;
  onCloseDrawer: () => void;
  onCloseSearch: () => void;
}

export const EntityDrawer: React.FC<EntityDrawerProps> = ({
  selectedEntityName,
  isSearchOpen,
  entities,
  entityList,
  rules,
  onSelectEntity,
  onCloseDrawer,
  onCloseSearch,
}) => {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<EntityCategory | 'ALL'>('ALL');

  useEffect(() => {
    if (isSearchOpen) {
      setQuery('');
    }
  }, [isSearchOpen]);

  // Resolver la entidad actualmente seleccionada
  const resolvedEntity: VaultEntity | null = selectedEntityName
    ? entities[normalizeEntityKey(selectedEntityName)] ||
      entities[normalizeEntityKey(selectedEntityName.replace(/_/g, ' '))] ||
      null
    : null;

  const getCategoryBadge = (cat: EntityCategory) => {
    switch (cat) {
      case 'Personaje':
        return {
          label: 'Personaje Jugador',
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          icon: <User className="w-3.5 h-3.5" />,
        };
      case 'PNJ':
        return {
          label: 'PNJ',
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          icon: <User className="w-3.5 h-3.5" />,
        };
      case 'Lugar':
        return {
          label: 'Lugar / Locación',
          color: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
          icon: <MapPin className="w-3.5 h-3.5" />,
        };
      case 'Faccion':
        return {
          label: 'Facción',
          color: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          icon: <Shield className="w-3.5 h-3.5" />,
        };
      case 'Bestiario_Botin':
        return {
          label: 'Bestiario / Botín',
          color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          icon: <Skull className="w-3.5 h-3.5" />,
        };
      case 'Regla':
        return {
          label: 'Regla D&D 5e',
          color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
          icon: <BookOpen className="w-3.5 h-3.5" />,
        };
      default:
        return {
          label: 'Nota',
          color: 'bg-slate-700 text-slate-300 border-slate-600',
          icon: <FileText className="w-3.5 h-3.5" />,
        };
    }
  };

  // Filtrado del buscador Ctrl + K
  const filteredResults = entityList.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.subType && item.subType.toLowerCase().includes(q)) ||
      item.content.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* 1. Modal Buscador Rápido (Ctrl + K) */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center pt-16 px-4"
          onClick={onCloseSearch}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-amber-500/30 bg-slate-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input de búsqueda */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-950/70">
              <Search className="w-5 h-5 text-amber-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar PNJs, lugares, objetos, personajes o reglas de D&D 5e..."
                className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={onCloseSearch}
                className="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                ESC
              </button>
            </div>

            {/* Filtros rápidos por categoría */}
            <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex flex-wrap gap-1.5">
              {(
                [
                  ['ALL', 'Todo'],
                  ['PNJ', 'PNJs'],
                  ['Lugar', 'Lugares'],
                  ['Personaje', 'Personajes'],
                  ['Bestiario_Botin', 'Bestiario/Botín'],
                  ['Regla', 'Reglas 5e'],
                ] as const
              ).map(([catKey, label]) => (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setCategoryFilter(catKey)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    categoryFilter === catKey
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Lista de resultados */}
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/70">
              {filteredResults.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No se encontraron entidades ni reglas que coincidan con "{query}".
                </div>
              ) : (
                filteredResults.map((item) => {
                  const badge = getCategoryBadge(item.category);
                  return (
                    <button
                      key={`${item.category}-${item.id}`}
                      type="button"
                      onClick={() => {
                        onSelectEntity(item.name);
                        onCloseSearch();
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-800/70 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-sm text-slate-100">
                            {item.name}
                          </span>
                          {item.subType && (
                            <span className="text-xs text-slate-400 truncate">
                              • {item.subType}
                            </span>
                          )}
                        </div>
                        {item.excerpt && (
                          <p className="text-xs text-slate-400 line-clamp-1">
                            {item.excerpt}
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}
                      >
                        {badge.icon}
                        <span>{badge.label}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Panel Lateral Deslizable (EntityDrawer) */}
      {selectedEntityName && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex justify-end"
          onClick={onCloseDrawer}
        >
          <aside
            className="w-full max-w-xl bg-slate-900 border-l border-amber-500/30 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del Drawer */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex items-start justify-between gap-3">
              <div>
                {resolvedEntity ? (
                  <>
                    <div className="flex items-center gap-2 mb-1.5">
                      {(() => {
                        const badge = getCategoryBadge(resolvedEntity.category);
                        return (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${badge.color}`}
                          >
                            {badge.icon}
                            <span>{badge.label}</span>
                          </span>
                        );
                      })()}
                      {resolvedEntity.subType && (
                        <span className="text-xs text-slate-400">
                          {resolvedEntity.subType}
                        </span>
                      )}
                    </div>
                    <h2 className="font-display text-xl font-bold text-amber-300">
                      {resolvedEntity.name}
                    </h2>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700 mb-1.5">
                      Entidad aún no registrada en bóveda
                    </span>
                    <h2 className="font-display text-xl font-bold text-slate-200">
                      {selectedEntityName.replace(/_/g, ' ')}
                    </h2>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={onCloseDrawer}
                className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cuerpo de la Nota */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {resolvedEntity ? (
                <>
                  {/* Tarjeta Statblock Oficial de D&D 5e (Monstruo) */}
                  {resolvedEntity.bestiaryData && (
                    <div className="rounded-xl border-2 border-rose-500/40 bg-gradient-to-b from-rose-950/35 to-slate-950/90 p-4 space-y-3.5 shadow-lg">
                      <div className="border-b border-rose-500/30 pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-rose-300 font-bold">
                            Statblock de Criatura • D&D 5e
                          </span>
                          {resolvedEntity.bestiaryData.cr && (
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-[11px] font-mono font-bold text-rose-200">
                              CR {resolvedEntity.bestiaryData.cr}
                            </span>
                          )}
                        </div>
                        <p className="text-xs italic text-slate-300 mt-0.5">
                          {resolvedEntity.bestiaryData.subtitle}
                        </p>
                      </div>

                      {/* CA, HP, Velocidad */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
                          <span className="text-[10px] uppercase text-slate-400 block">CA</span>
                          <span className="font-mono font-bold text-amber-300">
                            {resolvedEntity.bestiaryData.ac}
                          </span>
                        </div>
                        <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
                          <span className="text-[10px] uppercase text-slate-400 block">HP</span>
                          <span className="font-mono font-bold text-rose-300">
                            {resolvedEntity.bestiaryData.hp}
                          </span>
                        </div>
                        <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
                          <span className="text-[10px] uppercase text-slate-400 block">
                            Velocidad
                          </span>
                          <span className="font-mono font-semibold text-slate-200">
                            {resolvedEntity.bestiaryData.speed}
                          </span>
                        </div>
                      </div>

                      {/* Tabla FUE / DES / CON / INT / SAB / CAR */}
                      <div className="grid grid-cols-6 gap-1.5 py-2 border-y border-rose-500/25">
                        {(['FUE', 'DES', 'CON', 'INT', 'SAB', 'CAR'] as const).map((st) => (
                          <div
                            key={st}
                            className="text-center rounded bg-slate-900/80 border border-slate-800 py-1.5 px-1"
                          >
                            <div className="text-[10px] font-bold text-rose-300">{st}</div>
                            <div className="font-mono text-xs font-semibold text-slate-100">
                              {resolvedEntity.bestiaryData!.stats[st]}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Propiedades secundarias */}
                      <div className="space-y-1 text-xs text-slate-300">
                        {resolvedEntity.bestiaryData.savingThrows && (
                          <div>
                            <strong className="text-rose-200">Salvaciones:</strong>{' '}
                            {resolvedEntity.bestiaryData.savingThrows}
                          </div>
                        )}
                        {resolvedEntity.bestiaryData.skills && (
                          <div>
                            <strong className="text-rose-200">Habilidades:</strong>{' '}
                            {resolvedEntity.bestiaryData.skills}
                          </div>
                        )}
                        {resolvedEntity.bestiaryData.resistances && (
                          <div>
                            <strong className="text-rose-200">Resistencias:</strong>{' '}
                            {resolvedEntity.bestiaryData.resistances}
                          </div>
                        )}
                        {resolvedEntity.bestiaryData.immunities && (
                          <div>
                            <strong className="text-rose-200">Inmunidades:</strong>{' '}
                            {resolvedEntity.bestiaryData.immunities}
                          </div>
                        )}
                        {resolvedEntity.bestiaryData.senses && (
                          <div>
                            <strong className="text-rose-200">Sentidos:</strong>{' '}
                            {resolvedEntity.bestiaryData.senses}
                          </div>
                        )}
                        {resolvedEntity.bestiaryData.languages && (
                          <div>
                            <strong className="text-rose-200">Idiomas:</strong>{' '}
                            {resolvedEntity.bestiaryData.languages}
                          </div>
                        )}
                      </div>

                      {/* Rasgos, Acciones y Reacciones */}
                      {resolvedEntity.bestiaryData.traits.length > 0 && (
                        <div className="pt-2 border-t border-rose-500/25 space-y-1.5">
                          <h4 className="font-display text-xs font-bold uppercase tracking-wider text-rose-300">
                            Rasgos Especiales
                          </h4>
                          {resolvedEntity.bestiaryData.traits.map((t, i) => (
                            <p key={i} className="text-xs text-slate-200 leading-relaxed">
                              <strong className="italic text-amber-200">{t.name}.</strong>{' '}
                              {t.description}
                            </p>
                          ))}
                        </div>
                      )}

                      {resolvedEntity.bestiaryData.actions.length > 0 && (
                        <div className="pt-2 border-t border-rose-500/25 space-y-1.5">
                          <h4 className="font-display text-xs font-bold uppercase tracking-wider text-rose-300">
                            Acciones
                          </h4>
                          {resolvedEntity.bestiaryData.actions.map((a, i) => (
                            <p key={i} className="text-xs text-slate-200 leading-relaxed">
                              <strong className="italic text-rose-200">{a.name}.</strong>{' '}
                              {a.description}
                            </p>
                          ))}
                        </div>
                      )}

                      {resolvedEntity.bestiaryData.bonusReactions.length > 0 && (
                        <div className="pt-2 border-t border-rose-500/25 space-y-1.5">
                          <h4 className="font-display text-xs font-bold uppercase tracking-wider text-rose-300">
                            Reacciones / Acciones Adicionales
                          </h4>
                          {resolvedEntity.bestiaryData.bonusReactions.map((r, i) => (
                            <p key={i} className="text-xs text-slate-200 leading-relaxed">
                              <strong className="italic text-amber-200">{r.name}.</strong>{' '}
                              {r.description}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tarjeta de Objeto Mágico / Botín */}
                  {resolvedEntity.lootData && (
                    <div className="rounded-xl border-2 border-purple-500/40 bg-gradient-to-b from-purple-950/35 to-slate-950/90 p-4 space-y-3.5 shadow-lg">
                      <div className="border-b border-purple-500/30 pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400/40 text-[10px] font-bold uppercase tracking-wider text-purple-200">
                            {resolvedEntity.lootData.rarity}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              resolvedEntity.lootData.requiresAttunement
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {resolvedEntity.lootData.requiresAttunement
                              ? 'Requiere Sintonización'
                              : 'Sin Sintonización'}
                          </span>
                        </div>
                        <p className="text-xs italic text-slate-300 mt-1">
                          {resolvedEntity.lootData.subtitle}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        {resolvedEntity.lootData.weight && (
                          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
                            <span className="text-[10px] uppercase text-slate-400 block">Peso</span>
                            <span className="font-mono font-semibold text-slate-200">
                              {resolvedEntity.lootData.weight}
                            </span>
                          </div>
                        )}
                        {resolvedEntity.lootData.value && (
                          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
                            <span className="text-[10px] uppercase text-slate-400 block">
                              Valor
                            </span>
                            <span className="font-mono font-bold text-amber-300">
                              {resolvedEntity.lootData.value}
                            </span>
                          </div>
                        )}
                        {resolvedEntity.lootData.charges && (
                          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2 col-span-2 sm:col-span-1">
                            <span className="text-[10px] uppercase text-slate-400 block">
                              Cargas / Usos
                            </span>
                            <span className="font-mono font-semibold text-sky-300">
                              {resolvedEntity.lootData.charges}
                            </span>
                          </div>
                        )}
                      </div>

                      {resolvedEntity.lootData.properties.length > 0 && (
                        <div className="pt-2 border-t border-purple-500/25 space-y-1.5">
                          <h4 className="font-display text-xs font-bold uppercase tracking-wider text-purple-300">
                            Propiedades Mecánicas
                          </h4>
                          {resolvedEntity.lootData.properties.map((p, i) => (
                            <p key={i} className="text-xs text-slate-200 leading-relaxed">
                              <strong className="text-amber-200">{p.name}:</strong> {p.description}
                            </p>
                          ))}
                        </div>
                      )}

                      {resolvedEntity.lootData.lore.length > 0 && (
                        <div className="pt-2 border-t border-purple-500/25 space-y-1">
                          <h4 className="font-display text-xs font-bold uppercase tracking-wider text-slate-400">
                            Origen y Lore
                          </h4>
                          {resolvedEntity.lootData.lore.map((l, i) => (
                            <p key={i} className="text-xs italic text-slate-300 leading-relaxed">
                              {l}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Metadatos YAML si existen */}
                  {Object.keys(resolvedEntity.frontmatter).length > 0 && (
                    <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>Metadatos de Bóveda (Frontmatter YAML)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {Object.entries(resolvedEntity.frontmatter).map(([k, v]) => (
                          <div
                            key={k}
                            className="bg-slate-900/90 px-2.5 py-1.5 rounded border border-slate-800/80"
                          >
                            <span className="text-slate-400 font-mono text-[11px] block">
                              {k}:
                            </span>
                            <span className="text-slate-100 font-medium">
                              <WikiText
                                text={String(v)}
                                entities={entities}
                                onSelectEntity={onSelectEntity}
                              />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contenido Markdown renderizado con soporte para [[WikiLinks]] */}
                  <div className="prose prose-invert max-w-none text-sm text-slate-200 space-y-3 leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => (
                          <h1 className="font-display text-lg font-bold text-amber-300 border-b border-slate-800 pb-1.5">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="font-display text-base font-bold text-amber-200 mt-4 mb-1">
                            {children}
                          </h2>
                        ),
                        ul: ({ children }) => (
                          <ul className="space-y-2 list-disc list-inside text-slate-200">
                            {children}
                          </ul>
                        ),
                        li: ({ children }) => (
                          <li className="leading-relaxed bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/70 list-none">
                            {React.Children.map(children, (child) =>
                              typeof child === 'string' ? (
                                <WikiText
                                  text={child}
                                  entities={entities}
                                  onSelectEntity={onSelectEntity}
                                />
                              ) : (
                                child
                              )
                            )}
                          </li>
                        ),
                        p: ({ children }) => (
                          <p className="leading-relaxed">
                            {React.Children.map(children, (child) =>
                              typeof child === 'string' ? (
                                <WikiText
                                  text={child}
                                  entities={entities}
                                  onSelectEntity={onSelectEntity}
                                />
                              ) : (
                                child
                              )
                            )}
                          </p>
                        ),
                      }}
                    >
                      {resolvedEntity.content.replace(/^#\s+.+$/m, '').trim()}
                    </ReactMarkdown>
                  </div>

                  {/* Ruta del archivo en la bóveda */}
                  <div className="pt-4 border-t border-slate-800/80 flex items-center gap-2 text-[11px] font-mono text-slate-500">
                    <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{resolvedEntity.filePath}</span>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-6 text-center space-y-2">
                  <p className="text-sm text-slate-300">
                    La entidad <strong className="text-amber-300">[[{selectedEntityName}]]</strong> fue mencionada en la partida, pero el Dungeon Master IA aún no ha creado su archivo `.md` dedicado en <code className="text-amber-300">Mundo/</code>.
                  </p>
                  <p className="text-xs text-slate-500">
                    En cuanto se cree el archivo en Obsidian, aparecerá automáticamente aquí en tiempo real.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

