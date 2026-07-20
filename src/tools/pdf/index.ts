export interface PdfMetadata {
  fileSize?: number;
  totalPages: number;
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  version?: string;
  creationDate?: string;
  modificationDate?: string;
  isEncrypted?: boolean;
}

export interface ImageInfo {
  data: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface PdfPageItem {
  text: string;
  images: ImageInfo[];
  pageNumber: number;
}

export interface PdfParseResult {
  pages: PdfPageItem[];
  metadata: PdfMetadata;
}

export interface PdfInsertOperation {
  type: 'insert';
  pageIndex: number;
  markdown?: string;
  sourcePdfPath?: string;
  pdfOptions?: Record<string, unknown>;
}

export interface PdfDeleteOperation {
  type: 'delete';
  pageIndexes: number[];
}

export type PdfOperations = PdfInsertOperation | PdfDeleteOperation;
export interface PageImages {
  pageNumber: number;
  images: ImageInfo[];
}

const removedError = (): Error =>
  new Error('PDF parsing, generation, and editing are not available in this standalone local MCP.');

export function ensureChromeAvailable(): void {}

export async function parsePdfToMarkdown(
  _source: string,
  _pageNumbers: unknown = [],
): Promise<PdfParseResult> {
  throw removedError();
}

export async function parseMarkdownToPdf(
  _markdown: string,
  _options: unknown = {},
): Promise<Buffer> {
  throw removedError();
}

export async function editPdf(
  _pdfPath: string,
  _operations: PdfOperations[],
): Promise<Uint8Array> {
  throw removedError();
}

export async function extractImagesFromPdf(
  _data: Uint8Array,
  _pageNumbers?: number[],
): Promise<PageImages[]> {
  throw removedError();
}
