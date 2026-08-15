/**
 * Document Generation Service — Core Interfaces
 * Requirements: 27.1–27.8
 */

// ── Excel ─────────────────────────────────────────────────────────────────

export interface SheetDefinition {
  name: string;
  data: Record<string, unknown>[][];
  headers?: string[];
  columnWidths?: number[];
}

export interface FormulaDefinition {
  sheet: string;
  cell: string;
  formula: string;
}

export interface ChartDefinition {
  sheet: string;
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'area';
  title: string;
  dataRange: string;
  position: { col: number; row: number };
}

export interface PivotTableDefinition {
  sourceSheet: string;
  targetSheet: string;
  rowFields: string[];
  columnFields: string[];
  valueFields: string[];
}

export interface ExcelFormatting {
  headerStyle?: {
    bold?: boolean;
    bgColor?: string;
    fontColor?: string;
    fontSize?: number;
  };
  alternateRowColor?: string;
  freezeTopRow?: boolean;
  autoFilter?: boolean;
}

export interface ExcelConfig {
  title?: string;
  sheets: SheetDefinition[];
  formulas?: FormulaDefinition[];
  charts?: ChartDefinition[];
  pivotTables?: PivotTableDefinition[];
  formatting?: ExcelFormatting;
  branding?: BrandingConfig;
}

// ── PDF ───────────────────────────────────────────────────────────────────

export interface PageLayout {
  size?: 'A4' | 'LETTER' | 'LEGAL';
  orientation?: 'portrait' | 'landscape';
  margins?: { top: number; bottom: number; left: number; right: number };
}

export interface HeaderConfig {
  text?: string;
  logo?: string; // base64 or URL
  showDate?: boolean;
  showPageNumber?: boolean;
}

export interface FooterConfig {
  text?: string;
  showPageNumber?: boolean;
  showDate?: boolean;
}

export interface VisualizationEmbedding {
  type: 'chart' | 'table' | 'image';
  data?: Record<string, unknown>[];
  imageData?: string; // base64
  caption?: string;
  width?: number;
  height?: number;
}

export interface PDFSection {
  title?: string;
  content?: string;
  data?: Record<string, unknown>[];
  visualizations?: VisualizationEmbedding[];
}

export interface PDFConfig {
  title?: string;
  layout?: PageLayout;
  sections: PDFSection[];
  header?: HeaderConfig;
  footer?: FooterConfig;
  branding?: BrandingConfig;
}

// ── Word ──────────────────────────────────────────────────────────────────

export interface TableDefinition {
  headers: string[];
  rows: string[][];
  style?: 'simple' | 'striped' | 'grid';
}

export interface ImageEmbedding {
  data: string; // base64
  width?: number;
  height?: number;
  caption?: string;
}

export interface StyleDefinition {
  name: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface ContentSection {
  heading?: string;
  paragraphs?: string[];
  tables?: TableDefinition[];
  images?: ImageEmbedding[];
}

export interface WordConfig {
  title?: string;
  author?: string;
  description?: string;
  sections: ContentSection[];
  styles?: StyleDefinition[];
  branding?: BrandingConfig;
}

// ── PowerPoint ────────────────────────────────────────────────────────────

export interface SlideDefinition {
  title?: string;
  subtitle?: string;
  content?: string[];
  imageData?: string; // base64
  chartData?: {
    type: 'bar' | 'line' | 'pie';
    title: string;
    labels: string[];
    values: number[];
  };
  layout?: 'title' | 'content' | 'two_column' | 'blank' | 'chart';
}

export interface AnimationConfig {
  slideIndex: number;
  type: 'fade' | 'slide' | 'appear';
}

export interface SpeakerNoteConfig {
  slideIndex: number;
  notes: string;
}

export interface MasterSlideConfig {
  backgroundImage?: string; // base64
  backgroundColor?: string;
  fontFamily?: string;
}

export interface PowerPointConfig {
  title?: string;
  author?: string;
  slides: SlideDefinition[];
  masterSlide?: MasterSlideConfig;
  animations?: AnimationConfig[];
  speakerNotes?: SpeakerNoteConfig[];
  branding?: BrandingConfig;
}

// ── Branding ──────────────────────────────────────────────────────────────

export interface BrandingConfig {
  organizationName?: string;
  logoBase64?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  website?: string;
  tagline?: string;
}

export interface BrandingContext {
  config: BrandingConfig;
  appliedAt: Date;
  elements: string[];
}

// ── Delivery ──────────────────────────────────────────────────────────────

export interface DeliveryConfig {
  method: 'email' | 'download' | 'webhook' | 'dms_integration';
  recipients?: string[];
  subject?: string;
  message?: string;
  webhookUrl?: string;
  dmsPath?: string;
  expiryDuration?: number; // minutes for download links
  filename?: string;
}

export interface DeliveryResult {
  success: boolean;
  method: string;
  deliveredAt: Date;
  downloadUrl?: string;
  messageId?: string;
  error?: string;
}
