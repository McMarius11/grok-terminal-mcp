// Simple structured logger for grok-terminal-mcp
// Levels: error, warn, info, debug

const LOG_LEVEL = (process.env.GROK_TERMINAL_LOG_LEVEL || 'info').toLowerCase();

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function shouldLog(level: string): boolean {
  const current = levels[LOG_LEVEL as keyof typeof levels] ?? 2;
  const target = levels[level as keyof typeof levels] ?? 2;
  return target <= current;
}

export const logger = {
  error: (...args: any[]) => {
    if (shouldLog('error')) console.error('[ERROR]', ...args);
  },
  warn: (...args: any[]) => {
    if (shouldLog('warn')) console.error('[WARN]', ...args);
  },
  info: (...args: any[]) => {
    if (shouldLog('info')) console.error('[INFO]', ...args);
  },
  debug: (...args: any[]) => {
    if (shouldLog('debug')) console.error('[DEBUG]', ...args);
  },
  security: (...args: any[]) => {
    // Always log security events
    console.error('[SECURITY]', ...args);
  },
};