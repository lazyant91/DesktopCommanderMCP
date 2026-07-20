export type ConfigFieldValueType = 'string' | 'number' | 'array';

export type ConfigFieldDefinition = {
  label: string;
  description: string;
  valueType: ConfigFieldValueType;
};

export const CONFIG_FIELD_DEFINITIONS = {
  blockedCommands: {
    label: 'Blocked Commands',
    description:
      'Commands in this local safety blocklist are rejected before a terminal session is started.',
    valueType: 'array',
  },
  allowedDirectories: {
    label: 'Allowed Directories',
    description:
      'Local filesystem roots available to file tools. An empty list preserves the current unrestricted behavior.',
    valueType: 'array',
  },
  defaultShell: {
    label: 'Default Shell',
    description: 'Shell executable used when a process call does not provide an explicit shell.',
    valueType: 'string',
  },
  fileReadLineLimit: {
    label: 'File Read Line Limit',
    description: 'Default maximum number of text lines returned by one file or process-output read.',
    valueType: 'number',
  },
  fileWriteLineLimit: {
    label: 'File Write Line Limit',
    description: 'Configured line threshold reported by text write operations.',
    valueType: 'number',
  },
} as const satisfies Record<string, ConfigFieldDefinition>;

export type ConfigFieldKey = keyof typeof CONFIG_FIELD_DEFINITIONS;

export const CONFIG_FIELD_KEYS = Object.keys(CONFIG_FIELD_DEFINITIONS) as ConfigFieldKey[];

export function isConfigFieldKey(value: string): value is ConfigFieldKey {
  return Object.prototype.hasOwnProperty.call(CONFIG_FIELD_DEFINITIONS, value);
}
