import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  MapPin,
  ShieldAlert,
  Sparkles,
  Eye,
  HelpCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Navigation,
} from 'lucide-react';
import {
  MapNode,
  normalizeEntityKey,
  WorldMapGraph,
} from '../types';

interface WorldMapProps {
  mapa: WorldMapGraph;
  currentLocation?: string;
  onSelectEntity: (entityName: string) => void;
}

interface PositionedNode extends MapNode {
  x: number;
  y: number;
}

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 580;

/**
 * Calcula posiciones automáticas por niveles (BFS desde la ubicación actual)
 * seguidas de pases de relajación de fuerzas para evitar colisiones y cruces.
 */
function computeAutoLayout(
  nodos: MapNode[],
  aristas: WorldMapGraph['aristas'],
  currentLocKey: string
): Record<string, { x: number; y: number }> {
  if (nodos.length === 0) return {};

  const adj = new Map<string, string[]>();
  for (const n of nodos) {
    adj.set(n.id, []);
  }
  for (const e of aristas) {
    adj.get(e.origen)?.push(e.destino);
    adj.get(e.destino)?.push(e.origen);
  }

  // Encontrar nodo raíz (ubicación actual de la sesión o primer nodo descubierto)
  const startNode =
    nodos.find(
      (n) =>
        n.id === currentLocKey ||
        currentLocKey.includes(n.id) ||
        n.id.includes(currentLocKey)
    ) ||
    nodos.find((n) => n.estado === 'Descubierto') ||
    nodos[0];

  // BFS por capas concéntricas / columnas
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue: string[] = [];

  if (startNode) {
    levels.set(startNode.id, 0);
    visited.add(startNode.id);
    queue.push(startNode.id);
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currLvl = levels.get(curr) ?? 0;
    const neighbors = adj.get(curr) || [];
    for (const nb of neighbors) {
      if (!visited.has(nb)) {
        visited.add(nb);
        levels.set(nb, currLvl + 1);
        queue.push(nb);
      }
    }
  }

  // Nodos desconectados van a un anillo exterior
  let maxLvl = 0;
  levels.forEach((lvl) => {
    if (lvl > maxLvl) maxLvl = lvl;
  });
  for (const n of nodos) {
    if (!visited.has(n.id)) {
      levels.set(n.id, maxLvl + 1);
    }
  }

  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;
  const positions: Record<string, { x: number; y: number }> = {};

  // Agrupar nodos por nivel de distancia desde la ubicación actual
  const byLevel = new Map<number, MapNode[]>();
  for (const n of nodos) {
    const lvl = levels.get(n.id) ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(n);
  }

  byLevel.forEach((group, lvl) => {
    if (lvl === 0 && group.length === 1) {
      positions[group[0].id] = { x: centerX, y: centerY };
      return;
    }
    const radiusX = Math.min(340, 185 * lvl || 160);
    const radiusY = Math.min(210, 135 * lvl || 120);
    group.forEach((node, idx) => {
      const angleOffset = lvl % 2 === 1 ? -Math.PI / 6 : Math.PI / 8;
      const angle = (2 * Math.PI * idx) / group.length + angleOffset;
      positions[node.id] = {
        x: centerX + radiusX * Math.cos(angle),
        y: centerY + radiusY * Math.sin(angle),
      };
    });
  });

  // Relajación ligera por fuerzas para separar nodos cercanos
  const ids = nodos.map((n) => n.id);
  for (let iter = 0; iter < 40; iter++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = positions[ids[i]];
        const b = positions[ids[j]];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const minDist = 230;
        if (dist < minDist) {
          const push = ((minDist - dist) / dist) * 0.35;
          const ox = dx * push;
          const oy = dy * push;
          if (ids[i] !== startNode?.id) {
            a.x -= ox;
            a.y -= oy;
          }
          if (ids[j] !== startNode?.id) {
            b.x += ox;
            b.y += oy;
          }
        }
      }
    }

    // Mantener dentro del lienzo con margen
    for (const id of ids) {
      positions[id].x = Math.max(130, Math.min(CANVAS_WIDTH - 130, positions[id].x));
      positions[id].y = Math.max(85, Math.min(CANVAS_HEIGHT - 85, positions[id].y));
    }
  }

  return positions;
}

export const WorldMap: React.FC<WorldMapProps> = ({
  mapa,
  currentLocation = '',
  onSelectEntity,
}) => {
  const currentLocKey = useMemo(
    () =>
      normalizeEntityKey(
        currentLocation.replace(/^\[\[|\]\]$/g, '').split('|')[0]
      ),
    [currentLocation]
  );

  const autoPositions = useMemo(
    () => computeAutoLayout(mapa.nodos, mapa.aristas, currentLocKey),
    [mapa.nodos, mapa.aristas, currentLocKey]
  );

  const [customPositions, setCustomPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [didDrag, setDidDrag] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Sincronizar cuando cambian los nodos de la bóveda
  useEffect(() => {
    setCustomPositions((prev) => {
      const next = { ...prev };
      for (const n of mapa.nodos) {
        if (!next[n.id] && autoPositions[n.id]) {
          next[n.id] = autoPositions[n.id];
        }
      }
      return next;
    });
  }, [autoPositions, mapa.nodos]);

  const handleResetLayout = () => {
    setCustomPositions(autoPositions);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const applyZoom = (nextZoomRaw: number) => {
    const nextZoom = Math.max(0.5, Math.min(1.8, +nextZoomRaw.toFixed(2)));
    if (nextZoom === zoom) return;
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    const worldCx = (cx - pan.x) / zoom;
    const worldCy = (cy - pan.y) / zoom;
    setPan({
      x: cx - worldCx * nextZoom,
      y: cy - worldCy * nextZoom,
    });
    setZoom(nextZoom);
  };

  const getNodePos = (id: string) =>
    customPositions[id] || autoPositions[id] || { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };

  const handlePointerDownCanvas = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handlePointerDownNode = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggingId(nodeId);
    setDidDrag(false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    if (draggingId) {
      const svgX = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
      const svgY = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
      const worldX = (svgX - pan.x) / zoom;
      const worldY = (svgY - pan.y) / zoom;

      setDidDrag(true);
      setCustomPositions((prev) => ({
        ...prev,
        [draggingId]: { x: worldX, y: worldY },
      }));
      return;
    }

    if (isPanning && panStartRef.current) {
      const dx = ((e.clientX - panStartRef.current.clientX) / rect.width) * CANVAS_WIDTH;
      const dy = ((e.clientY - panStartRef.current.clientY) / rect.height) * CANVAS_HEIGHT;
      setPan({
        x: panStartRef.current.origX + dx,
        y: panStartRef.current.origY + dy,
      });
    }
  };

  const handlePointerUp = () => {
    setDraggingId(null);
    setIsPanning(false);
    panStartRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    applyZoom(zoom + delta);
  };

  const isCurrentLocation = (node: MapNode) => {
    if (!currentLocKey) return false;
    return (
      node.id === currentLocKey ||
      currentLocKey.includes(node.id) ||
      node.id.includes(currentLocKey)
    );
  };

  const getDangerBadge = (peligro: string) => {
    const p = peligro.toLowerCase();
    if (p.includes('alto') || p.includes('mortal') || p.includes('extremo')) {
      return {
        text: `Peligro: ${peligro}`,
        cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      };
    }
    if (p.includes('medio') || p.includes('moderado')) {
      return {
        text: `Peligro: ${peligro}`,
        cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      };
    }
    if (p.includes('bajo') || p.includes('seguro')) {
      return {
        text: `Peligro: ${peligro}`,
        cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };
    }
    return {
      text: `Peligro: ${peligro}`,
      cls: 'bg-slate-800 text-slate-300 border-slate-700',
    };
  };

  const positionedNodes: PositionedNode[] = mapa.nodos.map((n) => ({
    ...n,
    ...getNodePos(n.id),
  }));

  const nodeMap = useMemo(() => {
    const m = new Map<string, PositionedNode>();
    for (const n of positionedNodes) m.set(n.id, n);
    return m;
  }, [positionedNodes]);

  const discoveredCount = mapa.nodos.filter((n) => n.estado === 'Descubierto').length;
  const rumoredCount = mapa.nodos.filter((n) => n.estado === 'Rumoreado').length;

  return (
    <div className="flex flex-col">
      {/* Barra de herramientas y leyenda del Mapa Point-Crawl */}
      <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-3 rounded-full bg-amber-400 ring-2 ring-amber-400/40 animate-pulse" />
            <span>Ubicación Actual</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-3 rounded-full bg-emerald-500/40 border border-emerald-400" />
            <span>Descubierto ({discoveredCount})</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-3 rounded-full bg-slate-800 border border-dashed border-slate-400 opacity-75" />
            <span>Rumoreado / Niebla ({rumoredCount})</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 hidden sm:inline mr-1">
            Arrastra el fondo para moverte • Arrastra nodos • Clic para abrir ficha
          </span>
          <button
            type="button"
            onClick={() => applyZoom(zoom - 0.15)}
            title="Alejar"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-xs text-slate-300 px-1">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => applyZoom(zoom + 0.15)}
            title="Acercar"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetLayout}
            title="Centrar vista y restaurar diseño automático"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reordenar</span>
          </button>
        </div>
      </div>

      {/* Lienzo Interactivo del Grafo Point-Crawl */}
      <div
        className="relative w-full overflow-hidden bg-slate-950/90 select-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 2px 2px, rgba(148, 163, 184, 0.14) 1px, transparent 0)',
          backgroundSize: '28px 28px',
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {mapa.nodos.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-300">
            No se encontraron lugares en <code className="text-amber-300">Mundo/Lugares/</code>.
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            onPointerDown={handlePointerDownCanvas}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
            className={`w-full h-[520px] block touch-none ${
              isPanning ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <defs>
              <radialGradient id="activeNodeGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(251, 191, 36, 0.35)" />
                <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
              </radialGradient>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>

            {/* 1. ARISTAS (RUTAS Y CAMINOS) */}
            {mapa.aristas.map((edge) => {
              const source = nodeMap.get(edge.origen);
              const target = nodeMap.get(edge.destino);
              if (!source || !target) return null;

              const isRumoredRoute =
                source.estado === 'Rumoreado' || target.estado === 'Rumoreado';
              const touchesCurrent =
                isCurrentLocation(source) || isCurrentLocation(target);

              const midX = (source.x + target.x) / 2;
              const midY = (source.y + target.y) / 2;

              return (
                <g key={edge.id}>
                  {/* Resplandor sutil en rutas conectadas a la ubicación actual */}
                  {touchesCurrent && (
                    <line
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="rgba(251, 191, 36, 0.2)"
                      strokeWidth={8}
                      strokeLinecap="round"
                    />
                  )}

                  {/* Línea principal de la ruta */}
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={
                      touchesCurrent
                        ? '#fbbf24'
                        : isRumoredRoute
                        ? '#64748b'
                        : '#10b981'
                    }
                    strokeWidth={touchesCurrent ? 3 : 2.2}
                    strokeDasharray={isRumoredRoute ? '7 6' : undefined}
                    opacity={isRumoredRoute ? 0.65 : 0.9}
                  />

                  {/* Etiqueta de Distancia y Vía */}
                  {edge.etiqueta && (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x={-Math.max(95, edge.etiqueta.length * 3.8)}
                        y={-13}
                        width={Math.max(190, edge.etiqueta.length * 7.6)}
                        height={26}
                        rx={8}
                        fill="#020617"
                        stroke={touchesCurrent ? '#f59e0b' : '#334155'}
                        strokeWidth={1.2}
                        opacity={0.95}
                      />
                      <text
                        x={0}
                        y={4}
                        textAnchor="middle"
                        fill={touchesCurrent ? '#fde68a' : '#e2e8f0'}
                        fontSize={11}
                        fontFamily="monospace"
                        fontWeight={600}
                      >
                        {edge.etiqueta}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* 2. NODOS DE LUGARES */}
            {positionedNodes.map((node) => {
              const isCurrent = isCurrentLocation(node);
              const isRumored = node.estado === 'Rumoreado';
              const danger = getDangerBadge(node.peligro);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onPointerDown={(e) => handlePointerDownNode(e, node.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!didDrag) {
                      onSelectEntity(node.nombre);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {/* Halo pulsante si es la ubicación actual */}
                  {isCurrent && (
                    <circle
                      r={105}
                      fill="url(#activeNodeGlow)"
                      className="animate-pulse"
                    />
                  )}

                  {/* Tarjeta del Nodo mediante foreignObject para rico estilo Tailwind */}
                  <foreignObject
                    x={-110}
                    y={-52}
                    width={220}
                    height={108}
                    className="overflow-visible"
                  >
                    <div
                      className={`w-[220px] rounded-xl p-3 transition-all select-none ${
                        isCurrent
                          ? 'bg-slate-900/95 border-2 border-amber-400 ring-4 ring-amber-400/25 shadow-[0_0_25px_rgba(251,191,36,0.5)] animate-pulse'
                          : isRumored
                          ? 'bg-slate-900/75 border-2 border-dashed border-slate-500/80 opacity-65 hover:opacity-95 hover:border-slate-400'
                          : 'bg-slate-900/95 border border-emerald-500/50 hover:border-amber-400 shadow-lg'
                      }`}
                    >
                      {/* Encabezado del Nodo */}
                      <div className="flex items-start justify-between gap-1.5 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isCurrent ? (
                            <Navigation className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : isRumored ? (
                            <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
                          ) : (
                            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                          <span
                            className={`font-display text-xs font-bold truncate ${
                              isCurrent
                                ? 'text-amber-300'
                                : isRumored
                                ? 'text-slate-300 italic'
                                : 'text-slate-100'
                            }`}
                            title={node.nombre}
                          >
                            {node.nombre.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-extrabold text-[9px] uppercase tracking-wider shrink-0">
                            AQUÍ
                          </span>
                        )}
                      </div>

                      {/* Subtipo */}
                      <div className="text-[11px] text-slate-300 truncate mb-2">
                        {node.subtipo}
                      </div>

                      {/* Footer: Estado y Nivel de Peligro */}
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            isRumored
                              ? 'bg-slate-800/90 text-slate-300 border-slate-600 border-dashed'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                          }`}
                        >
                          {node.estado}
                        </span>

                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border truncate ${danger.cls}`}
                        >
                          {danger.text}
                        </span>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
};
