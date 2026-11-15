import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollText,
  MapPin,
  Calendar,
  Swords,
  Users,
  Compass,
  BookOpen,
  Flame,
  SearchCheck,
  Coins,
  Package,
  CheckCircle2,
  Circle,
  Sparkles,
  ArrowUp,
  Clock,
  Eye,
  Map,
} from 'lucide-react';
import {
  normalizeEntityKey,
  SessionLog,
  SessionLogCategory,
  VaultEntity,
  WorldMapGraph,
} from '../types';
import { WikiText } from './WikiText';
import { WorldMap } from './WorldMap';

interface SessionFeedProps {
  session: SessionLog | null;
  sessions: SessionLog[];
  entities: Record<string, VaultEntity>;
  mapa: WorldMapGraph;
  onSelectEntity: (entityName: string) => void;
}

type SessionTab = 'feed' | 'discoveries' | 'map';

export const SessionFeed: React.FC<SessionFeedProps> = ({
  session,
  sessions,
  entities,
  mapa,
  onSelectEntity,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SessionTab>('feed');
  const [filterCategory, setFilterCategory] = useState<SessionLogCategory | 'ALL'>('ALL');
  const [isScrolledDown, setIsScrolledDown] = useState<boolean>(false);
  const [unreadFeedCount, setUnreadFeedCount] = useState<number>(0);
  const [seenDiscoveryCounts, setSeenDiscoveryCounts] = useState<Record<string, number>>({});

  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef<number>(0);
  const prevSessionIdRef = useRef<string | null>(null);
  const entryTimestampsRef = useRef<Record<string, string>>({});

  const displayedSession =
    sessions.find((s) => s.id === selectedSessionId) || session || null;

  const nowHHMM = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Registrar marca de tiempo para cada entrada y gestionar auto-scroll o indicador de "Nuevas entradas"
  useEffect(() => {
    if (!displayedSession) return;
    const isSameSession = prevSessionIdRef.current === displayedSession.id;
    const currentEntries = displayedSession.liveFeed;
    const currentCount = currentEntries.length;

    currentEntries.forEach((entry, index) => {
      const key = `${displayedSession.id}:${entry.id}`;
      if (!entryTimestampsRef.current[key]) {
        if (entry.timestamp) {
          entryTimestampsRef.current[key] = entry.timestamp;
        } else if (isSameSession && index >= prevCountRef.current) {
          // Entrada recién llegada en vivo durante esta sesión
          entryTimestampsRef.current[key] = nowHHMM();
        } else {
          entryTimestampsRef.current[key] = displayedSession.date || 'Inicio de sesión';
        }
      }
    });

    if (isSameSession && currentCount > prevCountRef.current) {
      const added = currentCount - prevCountRef.current;
      if (activeTab === 'feed' && !isScrolledDown) {
        feedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        setUnreadFeedCount(0);
      } else {
        setUnreadFeedCount((prev) => prev + added);
      }
    } else if (!isSameSession) {
      setUnreadFeedCount(0);
      setIsScrolledDown(false);
    }

    prevCountRef.current = currentCount;
    prevSessionIdRef.current = displayedSession.id;
  }, [displayedSession, activeTab, isScrolledDown]);

  // Inicializar contador de pistas/botín vistos la primera vez que se carga la sesión
  useEffect(() => {
    if (!displayedSession) return;
    const totalDisc =
      displayedSession.discoveries.clues.length +
      displayedSession.discoveries.items.length +
      displayedSession.discoveries.newEntities.length;

    setSeenDiscoveryCounts((prev) => {
      if (prev[displayedSession.id] === undefined) {
        return { ...prev, [displayedSession.id]: totalDisc };
      }
      return prev;
    });
  }, [displayedSession?.id]);

  // Al abrir la pestaña de Pistas y Botín, marcar todos los ítems actuales como vistos
  useEffect(() => {
    if (!displayedSession || activeTab !== 'discoveries') return;
    const totalDisc =
      displayedSession.discoveries.clues.length +
      displayedSession.discoveries.items.length +
      displayedSession.discoveries.newEntities.length;
    setSeenDiscoveryCounts((prev) => ({
      ...prev,
      [displayedSession.id]: totalDisc,
    }));
  }, [
    activeTab,
    displayedSession?.id,
    displayedSession?.discoveries.clues.length,
    displayedSession?.discoveries.items.length,
    displayedSession?.discoveries.newEntities.length,
  ]);

  const handleFeedScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    const scrolled = top > 80;
    setIsScrolledDown(scrolled);
    if (!scrolled && unreadFeedCount > 0) {
      setUnreadFeedCount(0);
    }
  };

  const scrollToLatest = () => {
    feedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setUnreadFeedCount(0);
    setIsScrolledDown(false);
  };

  const getCategoryStyle = (category: SessionLogCategory, isLatest: boolean) => {
    switch (category) {
      case 'Combate':
        return {
          badge: 'bg-rose-500/25 text-rose-200 border-rose-500/50',
          border: isLatest
            ? 'border-l-[6px] border-l-rose-400 bg-rose-950/35 ring-1 ring-rose-500/40 shadow-lg shadow-rose-950/30'
            : 'border-l-4 border-l-rose-500/80 bg-rose-950/15',
          filterActive: 'bg-rose-500/25 text-rose-200 border-rose-400 shadow-sm',
          filterIdle:
            'bg-slate-900/90 text-rose-300/80 border-rose-500/30 hover:bg-rose-500/15 hover:text-rose-200 hover:border-rose-400/50',
          icon: <Swords className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
        };
      case 'PNJ':
        return {
          badge: 'bg-amber-500/25 text-amber-200 border-amber-500/50',
          border: isLatest
            ? 'border-l-[6px] border-l-amber-400 bg-amber-950/35 ring-1 ring-amber-500/40 shadow-lg shadow-amber-950/30'
            : 'border-l-4 border-l-amber-500/80 bg-amber-950/15',
          filterActive: 'bg-amber-500/25 text-amber-200 border-amber-400 shadow-sm',
          filterIdle:
            'bg-slate-900/90 text-amber-300/80 border-amber-500/30 hover:bg-amber-500/15 hover:text-amber-200 hover:border-amber-400/50',
          icon: <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
        };
      case 'Descubrimiento':
        return {
          badge: 'bg-emerald-500/25 text-emerald-200 border-emerald-500/50',
          border: isLatest
            ? 'border-l-[6px] border-l-emerald-400 bg-emerald-950/35 ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-950/30'
            : 'border-l-4 border-l-emerald-500/80 bg-emerald-950/15',
          filterActive: 'bg-emerald-500/25 text-emerald-200 border-emerald-400 shadow-sm',
          filterIdle:
            'bg-slate-900/90 text-emerald-300/80 border-emerald-500/30 hover:bg-emerald-500/15 hover:text-emerald-200 hover:border-emerald-400/50',
          icon: <Compass className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
        };
      default:
        return {
          badge: 'bg-sky-500/25 text-sky-200 border-sky-500/50',
          border: isLatest
            ? 'border-l-[6px] border-l-sky-400 bg-slate-800/90 ring-1 ring-sky-500/40 shadow-lg shadow-sky-950/30'
            : 'border-l-4 border-l-sky-500/80 bg-slate-900/60',
          filterActive: 'bg-sky-500/25 text-sky-200 border-sky-400 shadow-sm',
          filterIdle:
            'bg-slate-900/90 text-sky-300/80 border-sky-500/30 hover:bg-sky-500/15 hover:text-sky-200 hover:border-sky-400/50',
          icon: <BookOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />,
        };
    }
  };

  if (!displayedSession) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center">
        <p className="text-slate-300 text-sm">
          No hay ninguna sesión registrada en{' '}
          <code className="text-amber-300">Campaña/Sesiones/</code>.
        </p>
      </section>
    );
  }

  const filteredEntries =
    filterCategory === 'ALL'
      ? displayedSession.liveFeed
      : displayedSession.liveFeed.filter((e) => e.category === filterCategory);

  const pendingCluesCount = displayedSession.discoveries.clues.filter(
    (c) => !c.resolved
  ).length;
  const lootCount = displayedSession.discoveries.items.length;
  const totalDiscoveryItems =
    displayedSession.discoveries.clues.length +
    lootCount +
    displayedSession.discoveries.newEntities.length;
  const seenDisc = seenDiscoveryCounts[displayedSession.id] ?? totalDiscoveryItems;
  const newDiscoveriesBadge = Math.max(0, totalDiscoveryItems - seenDisc);

  // Resolver entidad de la Ubicación / Escena actual para mostrar bloque ambiental
  const rawLocationName = displayedSession.location
    .replace(/^\[\[|\]\]$/g, '')
    .split('|')[0]
    .trim();
  const locationEntity =
    entities[normalizeEntityKey(rawLocationName)] ||
    Object.values(entities).find(
      (e) =>
        e.category === 'Lugar' &&
        displayedSession.location.toLowerCase().includes(e.name.toLowerCase())
    );

  return (
    <section className="flex flex-col rounded-xl border border-slate-800/90 bg-slate-900/75 backdrop-blur-md shadow-xl overflow-hidden">
      {/* Cabecera de la Sesión Activa */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Sesión #{String(displayedSession.number).padStart(2, '0')}
            </span>
            <h2 className="font-display text-lg font-bold text-slate-100">
              {displayedSession.title}
            </h2>
          </div>

          {sessions.length > 1 && (
            <select
              value={displayedSession.id}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.fileName})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Bloque Ambiental de Escena / Ubicación Actual */}
        <div className="rounded-xl bg-gradient-to-r from-emerald-950/35 via-slate-900/90 to-slate-900/90 border border-emerald-500/30 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>Escena Actual:</span>
              </span>
              <WikiText
                text={displayedSession.location}
                entities={entities}
                onSelectEntity={onSelectEntity}
              />
              {displayedSession.date && (
                <span className="inline-flex items-center gap-1.5 text-slate-300 font-mono pl-2 border-l border-slate-700">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                  <span>{displayedSession.date}</span>
                </span>
              )}
            </div>

            {locationEntity?.excerpt && (
              <p className="text-xs text-slate-300/90 line-clamp-2 leading-relaxed pl-5">
                {locationEntity.excerpt.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1')}
              </p>
            )}
          </div>

          {locationEntity && (
            <button
              type="button"
              onClick={() => onSelectEntity(locationEntity.name)}
              className="self-start sm:self-center shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/35 text-xs font-semibold transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ver Locación</span>
            </button>
          )}
        </div>
      </div>

      {/* Pestañas: Registro en Vivo vs Pistas y Botín */}
      <div className="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('feed')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              activeTab === 'feed'
                ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 shadow-sm'
                : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5 text-amber-400" />
            <span>Registro en Vivo</span>
            <span className="font-mono text-xs px-1.5 py-0.2 rounded bg-slate-950/80 text-amber-300">
              {displayedSession.liveFeed.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('discoveries')}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              activeTab === 'discoveries'
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50 shadow-sm'
                : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <SearchCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pistas y Botín</span>
            <span className="font-mono text-xs px-1.5 py-0.2 rounded-full bg-slate-950 text-emerald-300 border border-emerald-500/30">
              {pendingCluesCount + lootCount}
            </span>
            {newDiscoveriesBadge > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 animate-bounce shadow">
                +{newDiscoveriesBadge} nuevo{newDiscoveriesBadge > 1 ? 's' : ''}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              activeTab === 'map'
                ? 'bg-sky-500/20 text-sky-200 border-sky-500/50 shadow-sm'
                : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <Map className="w-3.5 h-3.5 text-sky-400" />
            <span>Mapa del Mundo</span>
            <span className="font-mono text-xs px-1.5 py-0.2 rounded-full bg-slate-950 text-sky-300 border border-sky-500/30">
              {mapa?.nodos?.length ?? 0}
            </span>
          </button>
        </div>

        {/* Filtros de categoría con código de color idéntico a las entradas */}
        {activeTab === 'feed' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterCategory('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                filterCategory === 'ALL'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm font-bold'
                  : 'bg-slate-950/80 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              Todos
            </button>
            {(['Narrativa', 'Combate', 'PNJ', 'Descubrimiento'] as const).map((cat) => {
              const active = filterCategory === cat;
              const style = getCategoryStyle(cat, false);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCategory(cat)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    active ? style.filterActive : style.filterIdle
                  }`}
                >
                  {style.icon}
                  <span>{cat}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Contenido según la pestaña activa */}
      {activeTab === 'feed' ? (
        <div className="relative">
          {/* Píldora flotante cuando el usuario hizo scroll y hay entradas nuevas o está lejos del tope */}
          {(unreadFeedCount > 0 || isScrolledDown) && (
            <div className="sticky top-3 z-20 flex justify-center pointer-events-none px-4 pt-2">
              <button
                type="button"
                onClick={scrollToLatest}
                className={`pointer-events-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xl border transition-all ${
                  unreadFeedCount > 0
                    ? 'bg-amber-400 text-slate-950 border-amber-300 animate-bounce'
                    : 'bg-slate-900/95 text-amber-300 border-amber-500/40 hover:bg-slate-800'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>
                  {unreadFeedCount > 0
                    ? `● En vivo · ↑ ${unreadFeedCount} nueva(s) entrada(s)`
                    : '● En vivo · ↑ Volver a la entrada más reciente'}
                </span>
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div
            ref={feedContainerRef}
            onScroll={handleFeedScroll}
            className="overflow-y-auto p-4 space-y-3.5 max-h-[calc(100vh-290px)]"
          >
            {filteredEntries.length === 0 ? (
              <div className="text-center py-12 text-slate-300 text-sm">
                No hay entradas registradas bajo el filtro{' '}
                <strong className="text-amber-300">{filterCategory}</strong> en esta sesión.
              </div>
            ) : (
              [...filteredEntries].reverse().map((entry, idx) => {
                const isLatest = idx === 0;
                const style = getCategoryStyle(entry.category, isLatest);
                const eventNumber = filteredEntries.length - idx;
                const timeKey = `${displayedSession.id}:${entry.id}`;
                const entryTime =
                  entry.timestamp ||
                  entryTimestampsRef.current[timeKey] ||
                  displayedSession.date ||
                  'En sesión';

                return (
                  <div
                    key={entry.id}
                    className={`relative rounded-r-xl rounded-l-sm border border-slate-800/90 ${
                      style.border
                    } p-4 transition-all ${
                      isLatest
                        ? 'opacity-100'
                        : 'opacity-85 hover:opacity-100 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border ${style.badge}`}
                        >
                          {style.icon}
                          <span>{entry.category}</span>
                        </span>

                        {isLatest && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span>MÁS RECIENTE</span>
                          </span>
                        )}

                        {entry.title && (
                          <span className="text-sm font-bold text-slate-100">
                            {entry.title}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 text-xs font-mono text-slate-300">
                        <span className="inline-flex items-center gap-1 text-slate-300/90">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{entryTime}</span>
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            isLatest
                              ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                              : 'bg-slate-950/80 text-slate-300 border border-slate-800'
                          }`}
                        >
                          #{eventNumber}
                        </span>
                      </div>
                    </div>

                    <p
                      className={`${
                        isLatest ? 'text-[15px] font-medium text-white' : 'text-sm text-slate-200'
                      } leading-relaxed`}
                    >
                      <WikiText
                        text={entry.text}
                        entities={entities}
                        onSelectEntity={onSelectEntity}
                      />
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : activeTab === 'discoveries' ? (
        <div className="overflow-y-auto p-4 space-y-5 max-h-[calc(100vh-290px)]">
          {/* Botín y Recompensas */}
          <div className="rounded-xl border border-amber-500/25 bg-slate-950/60 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-amber-400" />
              <span>Botín y Recompensas sin Repartir</span>
            </h3>

            <div className="flex items-center gap-2 text-xs bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800">
              <Coins className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-slate-300 font-medium">Monedas:</span>
              <span className="font-mono text-amber-200">
                {displayedSession.discoveries.coins || '0 PO, 0 PP, 0 PC'}
              </span>
            </div>

            {displayedSession.discoveries.items.length === 0 ? (
              <p className="text-xs text-slate-400">
                No hay objetos o botín pendiente en esta sesión.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {displayedSession.discoveries.items.map((item, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-slate-200 bg-slate-900/70 px-3 py-2 rounded-lg border border-slate-800/80"
                  >
                    <WikiText
                      text={item}
                      entities={entities}
                      onSelectEntity={onSelectEntity}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pistas y Rumores */}
          <div className="rounded-xl border border-emerald-500/25 bg-slate-950/60 p-4 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-emerald-400" />
              <span>Pistas y Rumores Obtenidos</span>
            </h3>
            {displayedSession.discoveries.clues.length === 0 ? (
              <p className="text-xs text-slate-400">Sin pistas registradas todavía.</p>
            ) : (
              <div className="space-y-2">
                {displayedSession.discoveries.clues.map((clue, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${
                      clue.resolved
                        ? 'bg-slate-900/40 border-slate-800/60 text-slate-400 line-through'
                        : 'bg-slate-900/80 border-slate-800 text-slate-200'
                    }`}
                  >
                    {clue.resolved ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <WikiText
                        text={clue.text}
                        entities={entities}
                        onSelectEntity={onSelectEntity}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nuevas Entidades Descubiertas */}
          {displayedSession.discoveries.newEntities.length > 0 && (
            <div className="rounded-xl border border-sky-500/25 bg-slate-950/60 p-4 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>PNJs y Lugares Descubiertos</span>
              </h3>
              <ul className="space-y-1.5">
                {displayedSession.discoveries.newEntities.map((ent, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-slate-200 bg-slate-900/70 px-3 py-2 rounded-lg border border-slate-800/80"
                  >
                    <WikiText
                      text={ent}
                      entities={entities}
                      onSelectEntity={onSelectEntity}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Resumen de cierre si existe */}
          {displayedSession.summary && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-300/90 mb-1.5">
                Resumen de Sesión
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                <WikiText
                  text={displayedSession.summary}
                  entities={entities}
                  onSelectEntity={onSelectEntity}
                />
              </p>
            </div>
          )}
        </div>
      ) : (
        <WorldMap
          mapa={mapa || { nodos: [], aristas: [] }}
          currentLocation={displayedSession.location}
          onSelectEntity={onSelectEntity}
        />
      )}
    </section>
  );
};
