import { FileHandler } from './base.js';
import { TextFileHandler } from './text.js';
import { BinaryFileHandler } from './binary.js';

const EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.xlsm'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const UNSUPPORTED_BINARY_EXTENSIONS = [
  '.pdf',
  '.docx',
  ...EXCEL_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
];

let textHandler: TextFileHandler | null = null;
let binaryHandler: BinaryFileHandler | null = null;

function getTextHandler(): TextFileHandler {
  if (!textHandler) textHandler = new TextFileHandler();
  return textHandler;
}

function getBinaryHandler(): BinaryFileHandler {
  if (!binaryHandler) binaryHandler = new BinaryFileHandler();
  return binaryHandler;
}

function hasExtension(filePath: string, extensions: string[]): boolean {
  const normalized = filePath.toLowerCase();
  return extensions.some((extension) => normalized.endsWith(extension));
}

/**
 * Route supported text files to TextFileHandler and all recognized or detected
 * binary files to the generic BinaryFileHandler. Format-specific document and
 * image handlers are intentionally not part of the standalone local MCP.
 */
export async function getFileHandler(filePath: string): Promise<FileHandler> {
  if (hasExtension(filePath, UNSUPPORTED_BINARY_EXTENSIONS)) {
    return getBinaryHandler();
  }

  if (await getBinaryHandler().canHandle(filePath)) {
    return getBinaryHandler();
  }

  return getTextHandler();
}

export function isExcelFile(filePath: string): boolean {
  return hasExtension(filePath, EXCEL_EXTENSIONS);
}

export function isImageFile(filePath: string): boolean {
  return hasExtension(filePath, IMAGE_EXTENSIONS);
}
