// Simple structured logger for grok-terminal-mcp
// Levels: error, warn, info, debug
const LOG_LEVEL = (process.env.GROK_TERMINAL_LOG_LEVEL || 'info').toLowerCase();
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};
function shouldLog(level) {
    const current = levels[LOG_LEVEL] ?? 2;
    const target = levels[level] ?? 2;
    return target <= current;
}
export const logger = {
    error: (...args) => {
        if (shouldLog('error'))
            console.error('[ERROR]', ...args);
    },
    warn: (...args) => {
        if (shouldLog('warn'))
            console.error('[WARN]', ...args);
    },
    info: (...args) => {
        if (shouldLog('info'))
            console.error('[INFO]', ...args);
    },
    debug: (...args) => {
        if (shouldLog('debug'))
            console.error('[DEBUG]', ...args);
    },
    security: (...args) => {
        // Always log security events
        console.error('[SECURITY]', ...args);
    },
};
//# sourceMappingURL=logger.js.map