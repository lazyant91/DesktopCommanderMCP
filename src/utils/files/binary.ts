import fs from 'fs/promises';
import path from 'path';
import { isBinaryFile } from 'isbinaryfile';
import {
  FileHandler,
  ReadOptions,
  FileResult,
  FileInfo,
  EditResult,
} from './base.js';

export class BinaryFileHandler implements FileHandler {
  async canHandle(filePath: string): Promise<boolean> {
    try {
      return await isBinaryFile(filePath);
    } catch {
      return false;
    }
  }

  async read(filePath: string, _options?: ReadOptions): Promise<FileResult> {
    return {
      content: this.getBinaryInstructions(filePath),
      mimeType: 'text/plain',
      metadata: {
        isBinary: true,
      },
    };
  }

  async write(_filePath: string, _content: unknown): Promise<void> {
    throw new Error(
      'Cannot write binary files directly. Use a local process with an appropriate command-line tool or library.',
    );
  }

  async editRange(
    _filePath: string,
    range: string,
    _content: unknown,
  ): Promise<EditResult> {
    return {
      success: false,
      editsApplied: 0,
      errors: [
        {
          location: range,
          error: 'Cannot edit binary files directly.',
        },
      ],
    };
  }

  async getInfo(filePath: string): Promise<FileInfo> {
    const stats = await fs.stat(filePath);

    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      permissions: stats.mode.toString(8).slice(-3),
      fileType: 'binary',
      metadata: {
        isBinary: true,
      },
    };
  }

  private getBinaryInstructions(filePath: string): string {
    const fileName = path.basename(filePath);

    return `Cannot read binary file as text: ${fileName}\n\nThe read_file, write_file, and edit_block tools support text files only. Use a local process with an appropriate command-line tool or library when binary processing is explicitly required.`;
  }
}
