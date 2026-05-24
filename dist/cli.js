// cli.ts - Small CLI layer for grok-terminal-mcp
// Keeps the CLI surface minimal but useful.
import { cac } from 'cac';
export function parseCliArgs(argv = process.argv) {
    const cli = cac('grok-terminal-mcp');
    cli
        .option('--config <path>', 'Path to a custom .grok-terminal.json configuration file')
        .option('--debug', 'Enable debug logging (very verbose)')
        .option('--root <dir>', 'Override the project root directory (affects security jail and default config search)')
        .help()
        .version();
    const parsed = cli.parse(argv, { run: false });
    return {
        config: parsed.options.config,
        debug: parsed.options.debug,
        root: parsed.options.root,
        help: parsed.options.help,
        version: parsed.options.version,
    };
}
//# sourceMappingURL=cli.js.map