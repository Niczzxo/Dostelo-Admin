/**
 * Data exports (admin master structure module 25: Backup, Logs &
 * Maintenance). An export is produced by the API on staff request
 * from the platform's core stores and returned as one JSON
 * document. The stored record keeps only the export's shape
 * (record counts per store), never a second copy of the data,
 * and exports go nowhere external: there is no external storage
 * integration, and none is claimed.
 */
export interface DataExportRecord {
  id: string;
  requestedById: string | null;
  /** Records exported per store, keyed by store name. */
  counts: Record<string, number>;
  /** Collections included in this export. */
  collections: string[];
  /** Byte size of the generated JSON document. */
  byteSize: number;
  createdAt: string;
}

/**
 * A stored backup (Backup redesign): the full export snapshot
 * kept server-side in the application database on the API host.
 * No external backup storage is connected. The snapshot itself
 * is never part of this view; it is served only by the download
 * endpoint after a permission check and a checksum verification.
 */
export interface StoredBackup {
  id: string;
  createdById: string | null;
  byteSize: number;
  /** SHA-256 hex of the stored snapshot. */
  checksum: string;
  status: 'ready';
  collections: string[];
  createdAt: string;
}

export interface BackupSummary {
  totalBackups: number;
  totalExports: number;
  lastBackupAt: string | null;
  /** Size of the most recent export or backup, when one exists.
   * The summary card labels it estimated. */
  lastArtifactBytes: number | null;
  /** Total bytes of snapshots stored in the database. */
  storedBackupBytes: number;
  /** How many backups the create flow keeps; older ones are
   * pruned (and the pruning audited) when a new backup lands. */
  retentionKeep: number;
  storageNote: string;
  /** Restore is not implemented in this pass; the UI shows it
   * unavailable with this reason rather than offering a partial
   * restore. */
  restoreAvailable: boolean;
  restoreNote: string;
}

export interface SystemHealth {
  checkedAt: string;
  database: {
    mode: 'prisma' | 'in-memory';
    connected: boolean | null;
    latencyMs: number | null;
  };
  redisConfigured: boolean;
  integrationsConfigured: number;
  integrationsTotal: number;
  uptimeSeconds: number;
}

export interface MaintenanceResult {
  action: 'health' | 'optimize-database';
  status: 'completed' | 'unavailable';
  detail: string;
  ranAt: string;
}

export interface DataExportResult {
  record: DataExportRecord;
  /** The export document itself, shaped { exportedAt, stores }. */
  export: {
    exportedAt: string;
    stores: Record<string, unknown[]>;
  };
}
