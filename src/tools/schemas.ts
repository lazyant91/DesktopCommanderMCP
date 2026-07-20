import { z } from 'zod';

export const GetConfigArgsSchema = z.object({});

export const SetConfigValueArgsSchema = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

export const ListProcessesArgsSchema = z.object({});

export const StartProcessArgsSchema = z.object({
  command: z.string(),
  timeout_ms: z.number(),
  shell: z.string().optional(),
  verbose_timing: z.boolean().optional(),
});

export const ReadProcessOutputArgsSchema = z.object({
  pid: z.number(),
  timeout_ms: z.number().optional(),
  offset: z.number().optional(),
  length: z.number().optional(),
  verbose_timing: z.boolean().optional(),
});

export const ForceTerminateArgsSchema = z.object({
  pid: z.number(),
});

export const ListSessionsArgsSchema = z.object({});

export const KillProcessArgsSchema = z.object({
  pid: z.number(),
});

export const ReadFileArgsSchema = z.object({
  path: z.string(),
  offset: z.number().optional().default(0),
  length: z.number().optional(),
});

export const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

export const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
  mode: z.enum(['rewrite', 'append']).default('rewrite'),
});

export const PdfInsertOperationSchema = z.object({
  type: z.literal('insert'),
  pageIndex: z.number(),
  markdown: z.string().optional(),
  sourcePdfPath: z.string().optional(),
  pdfOptions: z.object({}).passthrough().optional(),
});

export const PdfDeleteOperationSchema = z.object({
  type: z.literal('delete'),
  pageIndexes: z.array(z.number()),
});

export const PdfOperationSchema = z.union([
  PdfInsertOperationSchema,
  PdfDeleteOperationSchema,
]);

export const WritePdfArgsSchema = z.object({
  path: z.string(),
  content: z.preprocess(
    (value) => {
      if (typeof value === 'string' && value.trim().startsWith('[')) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    },
    z.union([z.string(), z.array(PdfOperationSchema)]),
  ),
  outputPath: z.string().optional(),
  options: z.object({}).passthrough().optional(),
});

export const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

export const ListDirectoryArgsSchema = z.object({
  path: z.string(),
  depth: z.number().optional().default(2),
});

export const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

export const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

export const PublicEditBlockArgsSchema = z.object({
  file_path: z.string(),
  old_string: z.string().min(1),
  new_string: z.string(),
  expected_replacements: z.number().int().positive().optional().default(1),
});

export const InteractWithProcessArgsSchema = z.object({
  pid: z.number(),
  input: z.string(),
  timeout_ms: z.number().optional(),
  wait_for_prompt: z.boolean().optional(),
  verbose_timing: z.boolean().optional(),
});

// Search, PDF, and host-wide process compatibility exports are removed in later slices.
export const StartSearchArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  searchType: z.enum(['files', 'content']).default('files'),
  filePattern: z.string().optional(),
  ignoreCase: z.boolean().optional().default(true),
  maxResults: z.number().optional(),
  includeHidden: z.boolean().optional().default(false),
  contextLines: z.number().optional().default(5),
  timeout_ms: z.number().optional(),
  earlyTermination: z.boolean().optional(),
  literalSearch: z.boolean().optional().default(false),
  origin: z.enum(['ui', 'llm']).optional(),
});
export const GetMoreSearchResultsArgsSchema = z.object({
  sessionId: z.string(),
  offset: z.number().optional().default(0),
  length: z.number().optional().default(100),
});
export const StopSearchArgsSchema = z.object({ sessionId: z.string() });
export const ListSearchesArgsSchema = z.object({});

export const toolArgSchemas: Record<string, z.ZodTypeAny> = {
  get_config: GetConfigArgsSchema,
  set_config_value: SetConfigValueArgsSchema,
  read_file: ReadFileArgsSchema,
  read_multiple_files: ReadMultipleFilesArgsSchema,
  write_file: WriteFileArgsSchema,
  create_directory: CreateDirectoryArgsSchema,
  list_directory: ListDirectoryArgsSchema,
  move_file: MoveFileArgsSchema,
  get_file_info: GetFileInfoArgsSchema,
  edit_block: PublicEditBlockArgsSchema,
  start_process: StartProcessArgsSchema,
  read_process_output: ReadProcessOutputArgsSchema,
  interact_with_process: InteractWithProcessArgsSchema,
  force_terminate: ForceTerminateArgsSchema,
  list_sessions: ListSessionsArgsSchema,
};
