export interface AbilityScore {
  score: number;
  modifier: number;
}

export interface CharacterAttributes {
  STR: AbilityScore;
  DEX: AbilityScore;
  CON: AbilityScore;
  INT: AbilityScore;
  WIS: AbilityScore;
  CHA: AbilityScore;
}

export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface RoadmapItem {
  label: string;
  description: string;
  unlocked: boolean;
}

export interface RoadmapTier {
  levelLabel: string;
  items: RoadmapItem[];
}

export interface CharacterCurrencies {
  pc: number;
  pp: number;
  pe: number;
  po: number;
  ppt: number;
}

export interface AttunementSlot {
  active: boolean;
  item: string;
}

export interface SpellSlotLevel {
  level: number;
  total: number;
  expended: number;
}

export interface PreparedSpell {
  level: number;
  name: string;
  castingTime: string;
  range: string;
  components: string;
  notes: string;
}

export interface SpellcastingInfo {
  ability: string;
  modifier: string;
  saveDc: number;
  attackBonus: string;
  slots: SpellSlotLevel[];
  preparedSpells: PreparedSpell[];
}

export interface CharacterSheet {
  id: string;
  name: string;
  fileName: string;
  filePath: string;
  race: string;
  classAndLevel: string;
  className: string;
  subclass: string;
  level: number;
  xp: number;
  ac: number;
  hpCurrent: number;
  hpMax: number;
  hpTemp: number;
  hitDice: string;
  heroicInspiration: boolean;
  deathSaves: DeathSaves;
  proficiencyBonus?: string;
  initiative?: string;
  speed?: string;
  passivePerception?: number;
  attributes: CharacterAttributes;
  savingThrows: string[];
  skills: string[];
  attacks: string[];
  inventory: string[];
  currencies: CharacterCurrencies;
  attunement: AttunementSlot[];
  roadmap: RoadmapTier[];
  spellcasting: SpellcastingInfo | null;
  conditions: string[];
  backgroundNotes: string;
  extraFields: Record<string, string>;
  rawContent: string;
  frontmatter: Record<string, unknown>;
}

export type SessionLogCategory = 'Combate' | 'PNJ' | 'Descubrimiento' | 'Narrativa';

export interface SessionLogEntry {
  id: string;
  category: SessionLogCategory;
  tagLabel: string;
  title?: string;
  text: string;
  rawLine: string;
  timestamp?: string;
}

export interface ActivePartyStatus {
  name: string;
  hpCurrent?: number;
  hpMax?: number;
  conditions?: string[];
  rawText: string;
}

export interface CombatState {
  inCombat: boolean;
  initiative: string[];
  enemies: string[];
}

export interface CombatTrackerEntry {
  initiative: string;
  combatant: string;
  hp: string;
  ac: string;
  conditions: string;
}

export interface PartyResourceRow {
  character: string;
  hp: string;
  ac: string;
  resources: string;
  conditions: string;
}

export interface SessionClueItem {
  text: string;
  resolved: boolean;
}

export interface SessionDiscoveries {
  newEntities: string[];
  clues: SessionClueItem[];
  coins: string;
  items: string[];
}

export interface SessionLog {
  id: string;
  number: number;
  title: string;
  fileName: string;
  filePath: string;
  date: string;
  location: string;
  activeParty: ActivePartyStatus[];
  liveFeed: SessionLogEntry[];
  combat: CombatState;
  combateActivo: boolean;
  combatTracker: CombatTrackerEntry[];
  partyResources: PartyResourceRow[];
  discoveries: SessionDiscoveries;
  summary: string;
  rawContent: string;
  frontmatter: Record<string, unknown>;
}

export type QuestStatus = 'pending' | 'in_progress' | 'completed';

export interface QuestItem {
  id: string;
  section: string;
  title: string;
  description: string;
  rawText: string;
  completed: boolean;
  status: QuestStatus;
}

export type EntityCategory =
  | 'Personaje'
  | 'PNJ'
  | 'Lugar'
  | 'Faccion'
  | 'Bestiario_Botin'
  | 'Regla'
  | 'Sesion';

export interface MonsterStatblock {
  subtitle: string;
  ac: string;
  hp: string;
  speed: string;
  stats: {
    FUE: string;
    DES: string;
    CON: string;
    INT: string;
    SAB: string;
    CAR: string;
  };
  savingThrows?: string;
  skills?: string;
  resistances?: string;
  immunities?: string;
  senses?: string;
  languages?: string;
  cr?: string;
  traits: { name: string; description: string }[];
  actions: { name: string; description: string }[];
  bonusReactions: { name: string; description: string }[];
}

export interface MagicItemData {
  subtitle: string;
  rarity: string;
  requiresAttunement: boolean;
  weight?: string;
  value?: string;
  charges?: string;
  properties: { name: string; description: string }[];
  lore: string[];
}

export interface VaultEntity {
  id: string;
  name: string;
  aliases: string[];
  category: EntityCategory;
  subType?: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
  content: string;
  excerpt: string;
  bestiaryData?: MonsterStatblock | null;
  lootData?: MagicItemData | null;
}

export interface RuleSection {
  id: string;
  title: string;
  content: string;
}

export interface RulesReference {
  title: string;
  description: string;
  version: string;
  filePath: string;
  rawContent: string;
  sections: RuleSection[];
  conditionsMap: Record<string, string>;
}

export interface MapConnection {
  destino: string;
  distancia: string;
  via: string;
}

export interface MapNode {
  id: string;
  nombre: string;
  subtipo: string;
  peligro: string;
  estado: 'Descubierto' | 'Rumoreado';
  region?: string;
  conexiones: MapConnection[];
}

export interface MapEdge {
  id: string;
  origen: string;
  destino: string;
  distancia: string;
  via: string;
  etiqueta: string;
}

export interface WorldMapGraph {
  nodos: MapNode[];
  aristas: MapEdge[];
}

export interface VaultState {
  vaultPath: string;
  campaigns: string[];
  activeCampaign: string;
  lastUpdated: string;
  lastChangedFile?: string;
  characters: CharacterSheet[];
  activeSession: SessionLog | null;
  sessions: SessionLog[];
  quests: QuestItem[];
  entities: Record<string, VaultEntity>;
  entityList: VaultEntity[];
  rules: RulesReference | null;
  mapa: WorldMapGraph;
}
