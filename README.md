# 🐉 D&D 5e Live Vault HUD

**D&D 5e Live Vault HUD** es una aplicación web local en tiempo real (_Second Screen_ / HUD táctico de mesa) diseñada para leer, indexar y visualizar una bóveda de **Obsidian** utilizada durante partidas de Dungeons & Dragons 5ª Edición dirigidas por un Dungeon Master IA.

---

## 🏗️ Arquitectura del Sistema

El proyecto está estructurado como un monorepo ligero dividido en dos capas desacopladas que se comunican mediante HTTP REST y **Server-Sent Events (SSE)**:

```
DnD/
├── .env                  # Configuración de entorno (VAULT_PATH, PORT)
├── package.json          # Orquestador con concurrently (npm run dev)
├── server/               # Backend Node.js + TypeScript + Express
│   ├── src/
│   │   ├── types.ts      # Contrato tipado del estado de la bóveda (VaultState)
│   │   ├── parser.ts     # Parser tolerante a fallos (gray-matter + Regex D&D 5e)
│   │   ├── watcher.ts    # Monitor en tiempo real con Chokidar (awaitWriteFinish)
│   │   └── index.ts      # API REST (/api/vault) y emisor SSE (/api/events)
│   ├── package.json
│   └── tsconfig.json
└── client/               # Frontend React + TypeScript + Vite + Tailwind CSS
    ├── src/
    │   ├── components/
    │   │   ├── PartyPanel.tsx      # Tarjetas de PJs, barras de HP, CA, atributos y estados
    │   │   ├── SessionFeed.tsx     # Registro en vivo categorizado y estado de combate
    │   │   ├── QuestTracker.tsx    # Seguimiento colapsable de Tramas_Activas.md
    │   │   ├── EntityDrawer.tsx    # Visor lateral de [[WikiLinks]] y buscador (Ctrl+K)
    │   │   └── WikiText.tsx        # Renderizador interactivo de enlaces [[Entidad]]
    │   ├── App.tsx
    │   └── types.ts
    ├── package.json
    └── vite.config.ts
```

### Flujo de Datos en Tiempo Real

1. **Lectura Segura (`watcher.ts` y `parser.ts`):** `chokidar` observa `VAULT_PATH` en modo de solo lectura con `awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }`, validación de archivos no vacíos, reintentos ante bloqueos (`EBUSY`/`EACCES`) y retención del último estado válido (_Last-Known-Good_) para evitar lecturas truncadas.
2. **Indexación y Parseo Tolerante (`parser.ts`):**
   - **`Personajes/*.md`**: Ignora plantillas (`_*`). Extrae estadísticas desde el frontmatter YAML y/o cuerpo Markdown (`HP actual/máx`, `CA`, `STR/DEX/CON/INT/WIS/CHA`, habilidades, inventario, estados alterados y cualquier campo personalizado en `extraFields`). Además, cruza el HP en vivo reportado en la sección `## 👥 Grupo Activo` de la sesión actual.
   - **`Campaña/Sesiones/Sesion XX.md`**: Detecta automáticamente la sesión con mayor numeración como la sesión activa, extrayendo ubicación actual, fecha, estado de combate y eventos de `## 📜 Registro en Vivo` clasificados por etiquetas (`[Combate]`, `[PNJ]`, `[Descubrimiento]`, `[Narrativa]`).
   - **`Campaña/Tramas_Activas.md`**: Transforma listas de tareas (`- [ ]` / `- [x]`) agrupadas por categoría en misiones activas y completadas.
   - **`Mundo/**/\*.md`y`00_Sistema/Reglas/Motor_Reglas_5e.md`**: Indexa en memoria todas las entidades (`PNJs`, `Lugares`, `Facciones`, `Bestiario_Botin`, `Personajes`) y secciones del reglamento oficial para resolver cualquier `[[WikiLink]]` o búsqueda rápida al instante.
3. **Sincronización Instantánea (`SSE`):** Cada cambio en la bóveda dispara un evento `vault-update` a todos los clientes conectados, haciendo destellar el indicador de sincronización en el HUD sin necesidad de recargar la página.

---

## 🚀 Guía de Arranque Rápido

### 1. Variables de Entorno

El archivo `.env` en la raíz (y en `/server/.env`) configura la ruta de la bóveda de Obsidian:

```env
VAULT_PATH=ruta_Vault
PORT=3001
```

### 2. Instalación de Dependencias

Desde la raíz del proyecto, instala las dependencias de la raíz, servidor y cliente con un solo comando:

```bash
npm run install:all
```

### 3. Ejecución en Desarrollo

Para iniciar simultáneamente el backend (`http://localhost:3001`) y el frontend (`http://localhost:5173`):

```bash
npm run dev
```

Para ejecutar únicamente el servidor backend durante pruebas:

```bash
npm run dev:server
```

---

## 🔌 Endpoints del Backend (`http://localhost:3001`)

| Método | Ruta           | Descripción                                                               |
| :----- | :------------- | :------------------------------------------------------------------------ |
| `GET`  | `/api/health`  | Estado del servidor, ruta observada y clientes SSE conectados.            |
| `GET`  | `/api/vault`   | Devuelve el objeto completo `VaultState` indexado en memoria.             |
| `GET`  | `/api/events`  | Stream **Server-Sent Events (SSE)** que emite cada actualización en vivo. |
| `WS`   | `/ws`          | Endpoint **WebSocket** alternativo con actualizaciones en tiempo real.    |
| `POST` | `/api/refresh` | Fuerza una re-lectura manual completa de la bóveda.                       |
