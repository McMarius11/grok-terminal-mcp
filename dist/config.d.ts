export interface TerminalConfig {
    allowedCommands: string[];
    blockedPatterns: string[];
    maxOutputBytes: number;
    maxBackgroundOutputBytes: number;
    defaultTimeoutMs: number;
    projectShortcuts: Record<string, string>;
    _loadedFrom?: string | null;
}
export declare function loadConfig(startDir?: string, explicitConfigPath?: string): TerminalConfig;
export declare function resolveCommand(input: string, config: TerminalConfig): string;
export declare function isCommandAllowed(fullCommand: string, config: TerminalConfig): {
    allowed: boolean;
    reason: string;
} | {
    allowed: boolean;
    reason?: undefined;
};
