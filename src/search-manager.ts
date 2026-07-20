export interface SearchResult {
  file: string;
  line?: number;
  match?: string;
  type: 'file' | 'content';
}

export interface SearchSessionOptions {
  rootPath: string;
  pattern: string;
  searchType: 'files' | 'content';
  filePattern?: string;
  ignoreCase?: boolean;
  maxResults?: number;
  includeHidden?: boolean;
  contextLines?: number;
  timeout?: number;
  earlyTermination?: boolean;
  literalSearch?: boolean;
}

export interface SearchStartResult {
  sessionId: string;
  isComplete: boolean;
  isError: boolean;
  results: SearchResult[];
  totalResults: number;
  runtime: number;
}

export interface SearchReadResult {
  results: SearchResult[];
  returnedCount: number;
  totalResults: number;
  totalMatches: number;
  isComplete: boolean;
  isError: boolean;
  error?: string;
  hasMoreResults: boolean;
  runtime: number;
  wasIncomplete?: boolean;
}

export interface SearchSessionSummary {
  id: string;
  searchType: string;
  pattern: string;
  isComplete: boolean;
  isError: boolean;
  runtime: number;
  totalResults: number;
}

const removedError = (): Error =>
  new Error('Background search sessions are not available in this standalone local MCP.');

class SearchManager {
  async startSearch(_options: SearchSessionOptions): Promise<SearchStartResult> {
    throw removedError();
  }

  readSearchResults(
    _sessionId: string,
    _offset = 0,
    _length = 100,
  ): SearchReadResult {
    throw removedError();
  }

  terminateSearch(_sessionId: string): boolean {
    return false;
  }

  listSearchSessions(): SearchSessionSummary[] {
    return [];
  }

  cleanupOldSessions(): void {}
}

// Compatibility boundary for legacy internal callers. It owns no processes,
// timers, files, archive readers, or external binaries.
export const searchManager = new SearchManager();
