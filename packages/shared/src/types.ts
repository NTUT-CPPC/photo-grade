export type JudgingMode = "initial" | "secondary" | "final";

export type AssetKind = "original" | "preview" | "thumbnail" | "metadata";

export interface WorkSummary {
  id: string;
  code: string;
  title: string;
  description: string;
  author?: string | null;
  school?: string | null;
  department?: string | null;
  sourceUrl?: string | null;
  initialPassed: boolean;
  secondaryTotal: number;
  assets: Partial<Record<AssetKind, string>>;
  metadata?: Record<string, unknown> | null;
}

export interface PresentationStatePayload {
  mode: JudgingMode;
  workId: string | null;
  workCode: string | null;
  idx: number;
  finalCutoff: number;
  secondaryThreshold: number | null;
  updatedAt: string;
}

export type OrderingMode = "sequential" | "shuffle";

export interface OrderingStatePayload {
  defaultMode: OrderingMode;
  activeMode: OrderingMode;
  shuffleOrder: string[];
  generatedAt: string | null;
  updatedAt: string;
  hasShuffle: boolean;
}

export interface ModePreviewResult {
  mode: JudgingMode;
  count: number;
  baseCount: number;
  overflow: number;
  defaultTopN: number;
  currentTopN: number;
  judgeCount?: number;
  initialThreshold?: number;
  defaultThreshold?: number;
  currentThreshold?: number;
}

export interface ScoreInput {
  workId: string;
  round?: JudgingMode;
  judgeId?: string;
  field: string;
  value: number;
}

export interface ScoreChangedPayload {
  workId: string;
  workCode: string;
  scores: Array<{
    field: string;
    value: number;
    label: string;
    judgeLabel: string;
  }>;
  submittedAt: string;
}

export type ImportIssueSeverity = "warning" | "error";

export interface ImportIssue {
  row: number;
  field: string;
  message: string;
  severity: ImportIssueSeverity;
}

export interface NormalizedWorkInput {
  code: string;
  title: string;
  description: string;
  sourceUrl: string;
  author?: string;
  school?: string;
  department?: string;
  studentId?: string;
  email?: string;
}

export interface ImportDryRun {
  totalRows: number;
  works: NormalizedWorkInput[];
  issues: ImportIssue[];
}
