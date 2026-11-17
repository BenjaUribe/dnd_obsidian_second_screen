import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Radio,
  RefreshCw,
  BookOpen,
  ShieldAlert,
  Sparkles,
  Map,
  FolderKanban,
} from 'lucide-react';
import { VaultState } from './types';
import { PartyPanel } from './components/PartyPanel';
import { SessionFeed } from './components/SessionFeed';
import { QuestTracker } from './components/QuestTracker';
import { EntityDrawer } from './components/EntityDrawer';
import { CombatTracker } from './components/CombatTracker';
import { DmChatPanel, DmChatMessage } from './components/DmChatPanel';
import { DiceRoller } from './components/DiceRoller';

export const App: React.FC = () => {
  const [vault, setVault] = useState<VaultState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [syncFlash, setSyncFlash] = useState<boolean>(false);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Estado de la Consola de Chat del Dungeon Master (agy)
  const [isDmChatOpen, setIsDmChatOpen] = useState<boolean>(false);
  const [dmMessages, setDmMessages] = useState<DmChatMessage[]>([]);
  const [dmProcessing, setDmProcessing] = useState<boolean>(false);
  const [dmToolLabel, setDmToolLabel] = useState<string | null>(null);
  const [dmConversationId, setDmConversationId] = useState<string | null>(null);
  const [dmForceNewSession, setDmForceNewSession] = useState<boolean>(false);
  const [dmRehydrateContext, setDmRehydrateContext] = useState<boolean>(false);

  const nowTime = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const triggerFlash = useCallback(() => {
    setSyncFlash(true);
    const timer = setTimeout(() => setSyncFlash(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const fetchVault = useCallback(
    async (campaign?: string) => {
      try {
        const query = campaign
          ? `?campaign=${encodeURIComponent(campaign)}`
          : '';
        const res = await fetch(`/api/vault${query}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: VaultState = await res.json();
        setVault(data);
        setError(null);
        triggerFlash();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo conectar con el servidor de la bóveda.'
        );
      } finally {
        setLoading(false);
      }
    },
    [triggerFlash]
  );

  // Carga inicial + suscripción SSE en vivo (bóveda + streaming del DM)
  useEffect(() => {
    fetchVault();

    fetch('/api/dm/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((st) => {
        if (st) {
          setDmProcessing(Boolean(st.isProcessing));
          setDmConversationId(st.activeConversationId ?? null);
        }
      })
      .catch(() => {});

    const eventSource = new EventSource('/api/events');

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.addEventListener('vault-update', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload && payload.state) {
          setVault(payload.state);
          setConnected(true);
          triggerFlash();
        }
      } catch (e) {
        console.error('[SSE] Error parseando actualización:', e);
      }
    });

    eventSource.addEventListener('dm-event', (event: MessageEvent) => {
      try {
        const evt = JSON.parse(event.data);
        if (evt.type === 'dm-start') {
          setDmProcessing(true);
          setDmToolLabel(null);
          if (evt.conversationId !== undefined) {
            setDmConversationId(evt.conversationId);
          }
          // Crear burbuja vacía del DM para ir llenándola en streaming
          setDmMessages((prev) => [
            ...prev,
            {
              id: `dm-${Date.now()}`,
              role: 'dm',
              content: '',
              timestamp: nowTime(),
            },
          ]);
        } else if (evt.type === 'dm-tool') {
          setDmToolLabel(evt.label || 'Ejecutando herramienta...');
        } else if (evt.type === 'dm-chunk') {
          setDmToolLabel(null);
          setDmMessages((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last.role !== 'dm') {
              return [
                ...prev,
                {
                  id: `dm-${Date.now()}`,
                  role: 'dm',
                  content: evt.text,
                  timestamp: nowTime(),
                },
              ];
            }
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              content: last.content + evt.text,
            };
            return updated;
          });
        } else if (evt.type === 'dm-done') {
          setDmProcessing(false);
          setDmToolLabel(null);
          if (evt.conversationId) {
            setDmConversationId(evt.conversationId);
          }
        } else if (evt.type === 'dm-error') {
          setDmProcessing(false);
          setDmToolLabel(null);
          setDmMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'error',
              content: evt.message || 'Error al comunicarse con el DM.',
              timestamp: nowTime(),
            },
          ]);
        }
      } catch (e) {
        console.error('[SSE] Error parseando dm-event:', e);
      }
    });

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, [fetchVault, triggerFlash]);

  const handleResetDmSession = useCallback(async () => {
    try {
      await fetch('/api/dm/reset', { method: 'POST' });
    } catch {
      // Ignorar
    } finally {
      setDmConversationId(null);
      setDmMessages([]);
      setDmForceNewSession(true);
      setDmRehydrateContext(false);
    }
  }, []);

  const handleRefreshDmContext = useCallback(async () => {
    try {
      await fetch('/api/dm/reset', { method: 'POST' });
    } catch {
      // Ignorar
    } finally {
      setDmConversationId(null);
      setDmForceNewSession(true);
      setDmRehydrateContext(true);
      setDmMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          content:
            '⚡ Hilo de IA refrescado para mayor velocidad. El próximo mensaje retomará la escena desde Obsidian.',
          timestamp: nowTime(),
        },
      ]);
    }
  }, []);

  const handleCampaignChange = async (newCampaign: string) => {
    if (!newCampaign || newCampaign === vault?.activeCampaign) return;
    setSelectedEntity(null);
    await Promise.all([
      fetchVault(newCampaign),
      handleResetDmSession(),
    ]);
  };

  const handleSendDmPrompt = useCallback(async (prompt: string, newSession = false) => {
    const startAsNewSession = newSession || dmForceNewSession;
    const shouldRehydrate = dmRehydrateContext && !newSession;
    if (dmForceNewSession) {
      setDmForceNewSession(false);
    }
    if (dmRehydrateContext) {
      setDmRehydrateContext(false);
    }

    const effectivePrompt = shouldRehydrate
      ? `Retoma la escena actual leyendo brevemente la sesión activa en Sesiones/ y las fichas en Personajes/ de la campaña activa antes de responder. Acción del jugador: ${prompt}`
      : prompt;

    setIsDmChatOpen(true);
    setDmMessages((prev) => [
      ...prev,
      {
        id: `player-${Date.now()}`,
        role: 'player',
        content: prompt,
        timestamp: nowTime(),
      },
    ]);

    try {
      const res = await fetch('/api/dm/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectivePrompt,
          newSession: startAsNewSession,
          campaign: vault?.activeCampaign,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setDmMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'error',
            content: errData.error || `Error HTTP ${res.status}`,
            timestamp: nowTime(),
          },
        ]);
      }
    } catch (err) {
      setDmMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'error',
          content:
            err instanceof Error
              ? err.message
              : 'No se pudo conectar con /api/dm/prompt',
          timestamp: nowTime(),
        },
      ]);
    }
  }, [dmForceNewSession, dmRehydrateContext, vault?.activeCampaign]);

  const handleAbortDm = useCallback(async () => {
    try {
      await fetch('/api/dm/abort', { method: 'POST' });
      setDmProcessing(false);
      setDmToolLabel(null);
    } catch {
      // Ignorar
    }
  }, []);

  const handleToggleDmChat = useCallback(() => {
    setIsDmChatOpen((prev) => !prev);
  }, []);

  // Atajo global Ctrl + K para abrir el buscador rápido y ESC para cerrar modales
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setSelectedEntity(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 gap-3">
        <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
        <p className="font-display text-sm tracking-wider uppercase text-amber-300">
          Sincronizando con Bóveda de Obsidian...
        </p>
      </div>
    );
  }

  if (error || !vault) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-6">
        <div className="max-w-md w-full rounded-2xl border border-rose-500/40 bg-slate-900 p-6 text-center space-y-4">
          <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="font-display text-lg font-bold text-rose-300">
            Servidor Backend Desconectado
          </h1>
          <p className="text-xs text-slate-400">{error}</p>
          <button
            type="button"
            onClick={() => fetchVault()}
            className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 transition-colors"
          >
            Reintentar conexión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col text-slate-100">
      {/* Barra Superior Táctica (Header HUD) */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-md px-4 lg:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Identidad del HUD */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-base md:text-lg font-extrabold tracking-wide text-amber-300">
                  D&D 5e LIVE VAULT HUD
                </h1>
                <span className="hidden sm:inline-block text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                  Obsidian Second Screen
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 truncate max-w-md">
                {vault.vaultPath}
              </p>
            </div>
          </div>

          {/* Controles derechos: Buscador (Ctrl+K), Atlas y Estado de Sincronización */}
          <div className="flex items-center gap-2.5">
            {/* Botón Buscador Rápido Ctrl + K */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/90 hover:border-amber-500/40 text-xs text-slate-300 transition-all"
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Buscar entidad o regla...</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-950 text-slate-400 rounded border border-slate-800">
                Ctrl K
              </kbd>
            </button>

            {/* Botón de Reglas 5e */}
            {vault.rules && (
              <button
                type="button"
                onClick={() =>
                  setSelectedEntity(
                    vault.rules?.sections[0]?.title || '1. Economía de Acción y Estructura del Turno'
                  )
                }
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/90 text-xs text-sky-300 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5 text-sky-400" />
                <span>Reglas 5e</span>
              </button>
            )}

            {/* Selector de Campaña Activa */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700/90 hover:border-amber-500/40 transition-colors">
              <FolderKanban className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <label htmlFor="campaign-selector" className="sr-only">
                Campaña activa
              </label>
              <select
                id="campaign-selector"
                value={vault.activeCampaign || ''}
                onChange={(e) => handleCampaignChange(e.target.value)}
                disabled={!vault.campaigns || vault.campaigns.length === 0}
                title={
                  vault.activeCampaign
                    ? `Campaña activa: Campañas/${vault.activeCampaign}`
                    : 'No se encontraron campañas en Campañas/'
                }
                className="bg-transparent text-xs font-medium text-amber-200 focus:outline-none cursor-pointer pr-1 max-w-[180px] sm:max-w-[220px] truncate"
              >
                {vault.campaigns && vault.campaigns.length > 0 ? (
                  vault.campaigns.map((camp) => (
                    <option
                      key={camp}
                      value={camp}
                      className="bg-slate-900 text-slate-100"
                    >
                      {camp.replace(/_/g, ' ')}
                    </option>
                  ))
                ) : (
                  <option value="" className="bg-slate-900 text-slate-400">
                    Sin campañas
                  </option>
                )}
              </select>
            </div>

            {/* Indicador de Estado de Conexión con Destello en Vivo */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                syncFlash
                  ? 'sync-flash bg-amber-500/25 border-amber-400 text-amber-200'
                  : connected
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
              }`}
              title={
                vault.lastChangedFile
                  ? `Último archivo actualizado: ${vault.lastChangedFile}`
                  : 'Observando cambios con Chokidar'
              }
            >
              <Radio
                className={`w-3.5 h-3.5 ${
                  syncFlash
                    ? 'text-amber-300 animate-ping'
                    : connected
                    ? 'text-emerald-400 animate-pulse'
                    : 'text-rose-400'
                }`}
              />
              <span className="hidden sm:inline">
                {syncFlash
                  ? '¡Bóveda actualizada!'
                  : connected
                  ? 'Sincronizado con bóveda'
                  : 'Reconectando...'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Rastreador de Combate en vivo (visible solo cuando combateActivo === true) */}
      <CombatTracker
        session={vault.activeSession}
        entities={vault.entities}
        onSelectEntity={(name) => setSelectedEntity(name)}
      />

      {/* Grid Táctico Principal de 3 Columnas */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Columna Izquierda: Grupo de Personajes (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          <PartyPanel
            characters={vault.characters}
            entities={vault.entities}
            conditionsMap={vault.rules?.conditionsMap || {}}
            onSelectEntity={(name) => setSelectedEntity(name)}
            onSendPrompt={handleSendDmPrompt}
          />

          {/* Tarjeta de Entidades del Mundo Indexadas */}
          <section className="rounded-xl border border-slate-800/90 bg-slate-900/75 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Map className="w-4 h-4 text-amber-400" />
                <h2 className="font-display text-xs uppercase tracking-wider font-bold text-amber-300/90">
                  Atlas del Mundo
                </h2>
              </div>
              <span className="font-mono text-[11px] text-slate-400">Mundo/**</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {vault.entityList
                .filter((e) => e.category !== 'Regla' && e.category !== 'Personaje')
                .map((ent) => (
                  <button
                    key={ent.id}
                    type="button"
                    onClick={() => setSelectedEntity(ent.name)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-950/80 hover:bg-amber-500/20 text-slate-200 hover:text-amber-300 border border-slate-800 hover:border-amber-500/40 transition-all"
                  >
                    {ent.name}
                  </button>
                ))}
            </div>
          </section>
        </div>

        {/* Columna Central: Feed de Sesión Activa en Tiempo Real (6 cols) */}
        <div className="lg:col-span-6">
          <SessionFeed
            session={vault.activeSession}
            sessions={vault.sessions}
            entities={vault.entities}
            mapa={vault.mapa || { nodos: [], aristas: [] }}
            onSelectEntity={(name) => setSelectedEntity(name)}
          />
        </div>

        {/* Columna Derecha: Bandeja de Dados, QuestTracker y Motor de Reglas 5e (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          <DiceRoller
            onSendToDm={(rollText) => handleSendDmPrompt(rollText, false)}
          />
          <QuestTracker
            quests={vault.quests}
            rules={vault.rules}
            entities={vault.entities}
            onSelectEntity={(name) => setSelectedEntity(name)}
          />
        </div>
      </main>

      {/* Drawer Lateral para [[WikiLinks]] y Modal Buscador (Ctrl+K) */}
      <EntityDrawer
        selectedEntityName={selectedEntity}
        isSearchOpen={isSearchOpen}
        entities={vault.entities}
        entityList={vault.entityList}
        rules={vault.rules}
        onSelectEntity={(name) => setSelectedEntity(name)}
        onCloseDrawer={() => setSelectedEntity(null)}
        onCloseSearch={() => setIsSearchOpen(false)}
      />

      {/* Consola de Chat Interactiva con el Dungeon Master (agy) */}
      <DmChatPanel
        messages={dmMessages}
        isProcessing={dmProcessing}
        activeToolLabel={dmToolLabel}
        conversationId={dmConversationId}
        activeCampaign={vault.activeCampaign}
        isOpen={isDmChatOpen}
        onToggleOpen={handleToggleDmChat}
        onSendPrompt={handleSendDmPrompt}
        onRefreshContext={handleRefreshDmContext}
        onResetSession={handleResetDmSession}
        onAbort={handleAbortDm}
      />
    </div>
  );
};

export default App;

