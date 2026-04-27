export type Mode = "initial" | "secondary" | "final";

export type Concept = {
  title?: string;
  description?: string;
};

export type PhotoInfo = {
  shutter?: string | number;
  aparture?: string | number;
  aperture?: string | number;
  ISO?: string | number;
  iso?: string | number;
  megapixel?: string | number;
  camera?: string;
  lens?: string;
  focal_length?: string | number;
};

export type PhotoItem = {
  base: string;
  high?: string;
  mini?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  json?: {
    concept?: Concept;
    info?: PhotoInfo;
  };
  concept?: Concept;
  info?: PhotoInfo;
};

export type SheetRecord = Record<string, string | number | boolean | null | undefined>;

export type SyncState = {
  idx?: number;
  mode?: Mode;
  base?: string;
};

export type ScorePayload = {
  base: string;
  scores: Record<string, string | number>;
  mode?: Mode;
};

export type ScoreNotification = {
  base: string;
  scores?: Record<string, string | number>;
  summary?: string;
  mode?: Mode;
  at?: string;
};

export type WorkScoreRow = {
  round: Mode;
  field: string;
  value: number;
  judgeId: string;
};

export type ImportDryRunResult = {
  importId?: string;
  id?: string;
  total?: number;
  valid?: number;
  warnings?: string[];
  errors?: string[];
  items?: Array<{
    name?: string;
    base?: string;
    status?: string;
    message?: string;
  }>;
};

export type ImportProgress = {
  importId?: string;
  phase?: string;
  done?: number;
  total?: number;
  message?: string;
  status?: "idle" | "running" | "complete" | "error" | "cancelled";
  workerOnline?: boolean;
};

export type ImportBatchStatus = "DRY_RUN" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type ActiveImportBatch = {
  id: string;
  fileName: string;
  status: ImportBatchStatus;
  processedCount: number;
  totalCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  dryRun: ImportDryRunResult;
};

export type Judge = {
  id: string;
  name: string;
  sortOrder: number;
};
