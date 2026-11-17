import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Sparkles,
  Loader2,
  Wrench,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  RefreshCw,
  Square,
  MessageSquare,
  Dices,
  Swords,
  Tent,
  Moon,
  Flag,
  Maximize2,
  Minimize2,
  Type,
} from 'lucide-react';

export interface DmChatMessage {
  id: string;
  role: 'player' | 'dm' | 'error' | 'system';
  content: string;
  timestamp: string;
}

interface DmChatPanelProps {
  messages: DmChatMessage[];
  isProcessing: boolean;
  activeToolLabel: string | null;
  conversationId: string | null;
  activeCampaign?: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSendPrompt: (prompt: string, newSession?: boolean) => Promise<void>;
  onRefreshContext: () => Promise<void>;
  onResetSession: () => Promise<void>;
  onAbort: () => Promise<void>;
}

const REMARK_PLUGINS = [remarkGfm];

const ChatMessageBubble = React.memo<{
  msg: DmChatMessage;
  largeFont: boolean;
}>(({ msg, largeFont }) => {
  if (msg.role === 'system') {
    return (
      <div className="flex items-center justify-center py-1">
        <span className="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-[11px] font-mono text-slate-300 text-center">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${
        msg.role === 'player' ? 'items-end' : 'items-start'
      }`}
    >
      <div
        className={`max-w-[92%] rounded-xl px-4 py-3 leading-relaxed ${
          largeFont ? 'text-base' : 'text-sm'
        } ${
          msg.role === 'player'
            ? 'bg-amber-500/20 border border-amber-500/35 text-amber-100'
            : msg.role === 'error'
            ? 'bg-rose-950/60 border border-rose-500/40 text-rose-200'
            : 'bg-slate-950/85 border border-slate-800 text-slate-200'
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-1.5 text-[11px] font-mono opacity-70">
          <span className="uppercase font-bold">
            {msg.role === 'player'
              ? 'Jugador'
              : msg.role === 'error'
              ? 'Error'
              : 'Dungeon Master'}
          </span>
          <span>{msg.timestamp}</span>
        </div>

        {msg.role === 'dm' ? (
          <div
            className={`prose prose-invert max-w-none space-y-2 leading-relaxed ${
              largeFont ? 'prose-base' : 'prose-sm'
            }`}
          >
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
              {msg.content || '...'}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        )}
      </div>
    </div>
  );
});

const QUICK_MACROS = [
  {
    id: 'start',
    label: 'Iniciar Sesión',
    icon: Dices,
    newSession: true,
    prompt:
      'Inicia la sesión leyendo las directivas en 00_Sistema/ (Dungeon_Master.md, Motor_Reglas_5e.md, Protocolo_Archivos_DM.md), las fichas en Personajes/ y la sesión activa en Sesiones/ de la campaña activa. Presenta el resumen inicial y la escena actual.',
  },
  {
    id: 'initiative',
    label: 'Tirar Iniciativa',
    icon: Swords,
    newSession: false,
    prompt:
      '¡Comienza un combate! Tira iniciativa para todos los combatientes, actualiza la tabla ## ⚔️ Rastreador de Combate e Iniciativa en la sesión activa y anuncia el primer turno.',
  },
  {
    id: 'short-rest',
    label: 'Descanso Corto',
    icon: Tent,
    newSession: false,
    prompt:
      'El grupo toma un Descanso Corto (1 hora). Aplica las reglas de Motor_Reglas_5e.md para Dados de Golpe y habilidades de descanso corto, actualiza las fichas y regístralo en la sesión.',
  },
  {
    id: 'long-rest',
    label: 'Descanso Largo',
    icon: Moon,
    newSession: false,
    prompt:
      'El grupo toma un Descanso Largo (8 horas). Restaura HP máximos, mitad de Dados de Golpe y espacios de conjuro según Motor_Reglas_5e.md, actualiza las fichas y regístralo en la sesión.',
  },
  {
    id: 'end-session',
    label: 'Cerrar Sesión',
    icon: Flag,
    newSession: false,
    prompt:
      'Cierra la sesión actual: genera el bloque [!summary] en ## 🏁 Cierre de Sesión, sincroniza el estado final de todas las fichas en Personajes/ y actualiza Tramas_Activas.md de la campaña activa si corresponde.',
  },
] as const;

export const DmChatPanel: React.FC<DmChatPanelProps> = React.memo(({
  messages,
  isProcessing,
  activeToolLabel,
  conversationId,
  activeCampaign,
  isOpen,
  onToggleOpen,
  onSendPrompt,
  onRefreshContext,
  onResetSession,
  onAbort,
}) => {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [largeFont, setLargeFont] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({
        behavior: isProcessing ? 'auto' : 'smooth',
      });
    }
  }, [messages, activeToolLabel, isOpen, isProcessing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    const text = input.trim();
    setInput('');
    await onSendPrompt(text, false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end max-w-[calc(100vw-2rem)]">
      {/* Ventana desplegada del Chat del DM */}
      {isOpen && (
        <div
          className={`mb-2 rounded-2xl border border-amber-500/40 bg-slate-900/95 backdrop-blur-xl shadow-[0_12px_45px_rgba(0,0,0,0.75)] flex flex-col overflow-hidden transition-all duration-200 ${
            isExpanded
              ? 'w-[95vw] sm:w-[760px] lg:w-[960px] h-[84vh]'
              : 'w-[92vw] sm:w-[500px] md:w-[560px] h-[580px] max-h-[78vh]'
          }`}
        >
          {/* Cabecera */}
          <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-sm font-bold text-amber-300 truncate">
                  Consola del Dungeon Master
                </h2>
                <p className="text-[10px] font-mono text-slate-400 truncate">
                  {activeCampaign ? `[${activeCampaign}] • ` : ''}
                  {conversationId
                    ? `Hilo activo: ${conversationId.slice(0, 12)}...`
                    : 'Modo: Continuar / Nueva sesión'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setLargeFont((prev) => !prev)}
                title={largeFont ? 'Tamaño de texto normal' : 'Aumentar tamaño de texto'}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors ${
                  largeFont
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-100 border-slate-800'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>{largeFont ? 'A+' : 'A'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                title={isExpanded ? 'Tamaño compacto' : 'Agrandar ventana'}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800"
              >
                {isExpanded ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={onRefreshContext}
                disabled={isProcessing}
                title="Refrescar hilo de IA (acelera respuestas conservando el chat visible y leyendo la escena desde Obsidian)"
                className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-emerald-300 hover:text-emerald-200 border border-slate-800 hover:border-emerald-500/40 text-[11px] font-medium flex items-center gap-1 disabled:opacity-40 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Refrescar hilo</span>
              </button>
              <button
                type="button"
                onClick={onResetSession}
                disabled={isProcessing}
                title="Limpiar chat y reiniciar hilo"
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800 disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onToggleOpen}
                title="Minimizar consola"
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-100 border border-slate-800"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Historial de Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 space-y-2">
                <MessageSquare className="w-8 h-8 text-amber-400/50" />
                <p className="text-sm text-slate-300 font-medium">
                  Envía una acción o usa una macro inferior para hablar con tu Dungeon Master IA (`agy`).
                </p>
                <p className="text-xs text-slate-500">
                  Cualquier cambio que el DM haga en Obsidian se reflejará automáticamente en el HUD.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <ChatMessageBubble key={msg.id} msg={msg} largeFont={largeFont} />
              ))
            )}

            {/* Indicador sutil de ejecución de herramientas en la bóveda */}
            {isProcessing && activeToolLabel && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-950/40 border border-sky-500/30 text-xs text-sky-300 animate-pulse">
                <Wrench className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">{activeToolLabel}</span>
              </div>
            )}

            {isProcessing && !activeToolLabel && (
              <div className="flex items-center gap-2 text-xs text-amber-300/80 px-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>El Dungeon Master está pensando...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Macros de Acción Rápida */}
          <div className="px-3 py-2 bg-slate-950/70 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto">
            {QUICK_MACROS.map((macro) => {
              const Icon = macro.icon;
              return (
                <button
                  key={macro.id}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => onSendPrompt(macro.prompt, macro.newSession)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-amber-500/20 text-[11px] font-medium text-slate-300 hover:text-amber-200 border border-slate-800 hover:border-amber-500/40 transition-colors disabled:opacity-40"
                >
                  <Icon className="w-3 h-3 text-amber-400" />
                  <span>{macro.label}</span>
                </button>
              );
            })}
          </div>

          {/* Input del Jugador */}
          <form
            onSubmit={handleSubmit}
            className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isProcessing}
              placeholder={
                isProcessing
                  ? 'Esperando respuesta del DM...'
                  : 'Describe tu acción o comando al DM...'
              }
              className={`flex-1 bg-slate-900 border border-slate-700/90 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50 ${
                largeFont ? 'text-base' : 'text-sm'
              }`}
            />
            {isProcessing ? (
              <button
                type="button"
                onClick={onAbort}
                title="Detener respuesta"
                className="px-3 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
        </div>
      )}

      {/* Botón flotante para abrir/cerrar la Consola del DM */}
      <button
        type="button"
        onClick={onToggleOpen}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full border shadow-xl text-xs font-bold transition-all ${
          isProcessing
            ? 'bg-amber-500 text-slate-950 border-amber-300 animate-pulse'
            : isOpen
            ? 'bg-slate-900 text-amber-300 border-amber-500/50 hover:bg-slate-800'
            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300'
        }`}
      >
        {isProcessing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <MessageSquare className="w-4 h-4" />
        )}
        <span>{isProcessing ? 'DM escribiendo...' : 'Consola DM'}</span>
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
});

