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
  createdAt: string;
}

export interface DataExportResult {
  record: DataExportRecord;
  /** The export document itself, shaped { exportedAt, stores }. */
  export: {
    exportedAt: string;
    stores: Record<string, unknown[]>;
  };
}
