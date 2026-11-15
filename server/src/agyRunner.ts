import { ChildProcess, spawn } from 'child_process';
import readline from 'readline';

export type DmStreamEvent =
  | { type: 'dm-start'; conversationId: string | null; isNewSession: boolean }
  | { type: 'dm-tool'; toolName: string; label: string }
  | { type: 'dm-chunk'; text: string }
  | { type: 'dm-done'; conversationId: string | null; fullText: string }
  | { type: 'dm-error'; message: string };

export interface RunPromptOptions {
  newSession?: boolean;
  conversationId?: string;
}

/**
 * Traduce nombres de herramientas técnicas del agente a mensajes amigables para el HUD
 */
function formatToolLabel(toolName: string, input?: Record<string, unknown>): string {
  const lower = toolName.toLowerCase();
  const targetPath =
    (typeof input?.path === 'string' && input.path) ||
    (typeof input?.file_path === 'string' && input.file_path) ||
    (typeof input?.Path === 'string' && input.Path) ||
    '';
  const baseName = targetPath ? targetPath.split(/[\\/]/).pop() : '';

  if (lower.includes('write') || lower.includes('edit')) {
    return baseName ? `Actualizando ${baseName}...` : 'Actualizando notas en la bóveda...';
  }
  if (lower.includes('read') || lower.includes('search') || lower.includes('list') || lower.includes('directory')) {
    return baseName ? `Consultando ${baseName}...` : 'Consultando la bóveda de Obsidian...';
  }
  if (lower.includes('command') || lower.includes('bash') || lower.includes('shell')) {
    return 'Ejecutando acción en el sistema...';
  }
  return `Ejecutando ${toolName}...`;
}

export class AgyRunner {
  private vaultPath: string;
  private isProcessing = false;
  private activeConversationId: string | null = null;
  private currentChild: ChildProcess | null = null;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  public getStatus(): { isProcessing: boolean; activeConversationId: string | null } {
    return {
      isProcessing: this.isProcessing,
      activeConversationId: this.activeConversationId,
    };
  }

  public resetSession(): void {
    this.activeConversationId = null;
  }

  public abort(): boolean {
    if (this.currentChild && !this.currentChild.killed) {
      this.currentChild.kill();
      this.isProcessing = false;
      this.currentChild = null;
      return true;
    }
    return false;
  }

  public runPrompt(
    prompt: string,
    options: RunPromptOptions,
    onEvent: (event: DmStreamEvent) => void
  ): Promise<void> {
    if (this.isProcessing) {
      return Promise.reject(
        new Error('El Dungeon Master ya está procesando una acción. Espera a que termine.')
      );
    }

    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      return Promise.reject(new Error('El mensaje no puede estar vacío.'));
    }

    this.isProcessing = true;

    const isNewSession = Boolean(options.newSession);
    if (isNewSession) {
      this.activeConversationId = null;
    }

    const targetConvId = options.conversationId || this.activeConversationId;

    // Escapar comillas y saltos de línea para compatibilidad con cmd.exe (shell: true en Windows)
    const safePromptArg = cleanPrompt
      .replace(/\r?\n+/g, ' ')
      .replace(/"/g, '\\"');

    const args: string[] = [
      '--output-format',
      'stream-json',
      '--dangerously-skip-permissions',
      '--print',
      `"${safePromptArg}"`,
    ];

    if (!isNewSession) {
      if (targetConvId) {
        args.push('--conversation', targetConvId);
      } else {
        args.push('--continue');
      }
    }

    onEvent({
      type: 'dm-start',
      conversationId: this.activeConversationId,
      isNewSession,
    });

    return new Promise((resolve) => {
      let accumulatedText = '';
      let stderrBuffer = '';
      let emittedError = false;

      const child = spawn('agy', args, {
        cwd: this.vaultPath,
        shell: true,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
        },
      });

      this.currentChild = child;

      if (child.stdout) {
        const rl = readline.createInterface({
          input: child.stdout,
          crlfDelay: Infinity,
        });

        rl.on('line', (line) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            const stepUpdate =
              parsed.step_update && typeof parsed.step_update === 'object'
                ? (parsed.step_update as Record<string, unknown>)
                : null;
            const resultObj =
              parsed.result && typeof parsed.result === 'object'
                ? (parsed.result as Record<string, unknown>)
                : null;

            // Capturar conversation_id / session_id desde raíz, step_update o result
            const convId =
              (typeof parsed.conversation_id === 'string' && parsed.conversation_id) ||
              (typeof parsed.conversationId === 'string' && parsed.conversationId) ||
              (typeof parsed.session_id === 'string' && parsed.session_id) ||
              (stepUpdate && typeof stepUpdate.conversation_id === 'string' && stepUpdate.conversation_id) ||
              (resultObj && typeof resultObj.conversation_id === 'string' && resultObj.conversation_id) ||
              null;
            if (convId) {
              this.activeConversationId = convId;
            }

            // Formato nativo de agy.exe (`event`: init | step_update | result)
            const agyEvent = String(parsed.event || '').toLowerCase();

            if (agyEvent === 'init') {
              return;
            }

            if (agyEvent === 'step_update' && stepUpdate) {
              if (typeof stepUpdate.text_delta === 'string' && stepUpdate.text_delta) {
                accumulatedText += stepUpdate.text_delta;
                onEvent({ type: 'dm-chunk', text: stepUpdate.text_delta });
                return;
              }

              const stepType = String(stepUpdate.step_type || '').toLowerCase();
              const state = String(stepUpdate.state || '').toUpperCase();
              if (
                stepType &&
                stepType !== 'user_input' &&
                stepType !== 'agent_response' &&
                state === 'ACTIVE'
              ) {
                const toolName = String(
                  stepUpdate.tool_name || stepUpdate.name || stepType
                );
                const input =
                  stepUpdate.input && typeof stepUpdate.input === 'object'
                    ? (stepUpdate.input as Record<string, unknown>)
                    : undefined;
                onEvent({
                  type: 'dm-tool',
                  toolName,
                  label: formatToolLabel(toolName, input),
                });
              }
              return;
            }

            if (agyEvent === 'result' && resultObj) {
              const respText =
                typeof resultObj.response === 'string' ? resultObj.response : '';
              if (respText && !accumulatedText) {
                accumulatedText = respText;
                onEvent({ type: 'dm-chunk', text: respText });
              }
              const status = String(resultObj.status || 'SUCCESS').toUpperCase();
              if (status !== 'SUCCESS' && !emittedError) {
                emittedError = true;
                onEvent({
                  type: 'dm-error',
                  message: respText || `agy finalizó con estado ${status}.`,
                });
              }
              return;
            }

            // Fallback compatible con otros esquemas basados en `type`
            const evtType = String(parsed.type || '').toLowerCase();

            // 1. Eventos de herramientas
            if (evtType === 'tool_use' || evtType === 'tool_call') {
              const toolName = String(parsed.name || parsed.tool_name || 'herramienta');
              const input =
                parsed.input && typeof parsed.input === 'object'
                  ? (parsed.input as Record<string, unknown>)
                  : undefined;
              onEvent({
                type: 'dm-tool',
                toolName,
                label: formatToolLabel(toolName, input),
              });
              return;
            }

            // 2. Bloques de delta de texto (streaming)
            if (evtType === 'content_block_delta') {
              const delta = parsed.delta as Record<string, unknown> | undefined;
              if (delta && typeof delta.text === 'string' && delta.text) {
                accumulatedText += delta.text;
                onEvent({ type: 'dm-chunk', text: delta.text });
              }
              return;
            }

            // 3. Mensaje completo de asistente (puede contener bloques de texto y tool_use)
            if (evtType === 'assistant' || evtType === 'message') {
              const msgObj = (parsed.message as Record<string, unknown>) || parsed;
              const content = msgObj.content;

              if (typeof content === 'string' && content) {
                const deltaText = content.startsWith(accumulatedText)
                  ? content.slice(accumulatedText.length)
                  : content;
                if (deltaText) {
                  accumulatedText += deltaText;
                  onEvent({ type: 'dm-chunk', text: deltaText });
                }
              } else if (Array.isArray(content)) {
                for (const block of content) {
                  if (!block || typeof block !== 'object') continue;
                  const b = block as Record<string, unknown>;
                  if (b.type === 'tool_use') {
                    const tName = String(b.name || 'herramienta');
                    const tInput =
                      b.input && typeof b.input === 'object'
                        ? (b.input as Record<string, unknown>)
                        : undefined;
                    onEvent({
                      type: 'dm-tool',
                      toolName: tName,
                      label: formatToolLabel(tName, tInput),
                    });
                  } else if (b.type === 'text' && typeof b.text === 'string' && b.text) {
                    const txt = b.text;
                    const deltaText = txt.startsWith(accumulatedText)
                      ? txt.slice(accumulatedText.length)
                      : txt;
                    if (deltaText) {
                      accumulatedText += deltaText;
                      onEvent({ type: 'dm-chunk', text: deltaText });
                    }
                  }
                }
              }
              return;
            }

            // 4. Texto suelto
            if (evtType === 'text' && typeof parsed.text === 'string' && parsed.text) {
              accumulatedText += parsed.text;
              onEvent({ type: 'dm-chunk', text: parsed.text });
              return;
            }

            // 5. Resultado final
            if (evtType === 'result') {
              if (typeof parsed.result === 'string' && parsed.result && !accumulatedText) {
                accumulatedText = parsed.result;
                onEvent({ type: 'dm-chunk', text: parsed.result });
              }
              if (parsed.is_error && typeof parsed.result === 'string') {
                emittedError = true;
                onEvent({ type: 'dm-error', message: parsed.result });
              }
              return;
            }

            // 6. Error explícito
            if (evtType === 'error') {
              const errMsg =
                (typeof parsed.message === 'string' && parsed.message) ||
                (parsed.error && typeof (parsed.error as Record<string, unknown>).message === 'string'
                  ? String((parsed.error as Record<string, unknown>).message)
                  : 'Error desconocido en agy.');
              emittedError = true;
              onEvent({ type: 'dm-error', message: errMsg });
            }
          } catch {
            // Fallback si agy emite texto plano no-JSON
            accumulatedText += `${trimmed}\n`;
            onEvent({ type: 'dm-chunk', text: `${trimmed}\n` });
          }
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer) => {
          stderrBuffer += chunk.toString('utf-8');
        });
      }

      child.on('error', (err) => {
        this.isProcessing = false;
        this.currentChild = null;
        if (!emittedError) {
          emittedError = true;
          onEvent({
            type: 'dm-error',
            message: `No se pudo iniciar 'agy': ${err.message}`,
          });
        }
        resolve();
      });

      child.on('close', (code) => {
        this.isProcessing = false;
        this.currentChild = null;

        if (code !== 0 && !accumulatedText && !emittedError) {
          onEvent({
            type: 'dm-error',
            message:
              stderrBuffer.trim() ||
              `El proceso 'agy' terminó con código de salida ${code}.`,
          });
        } else {
          onEvent({
            type: 'dm-done',
            conversationId: this.activeConversationId,
            fullText: accumulatedText,
          });
        }
        resolve();
      });
    });
  }
}

