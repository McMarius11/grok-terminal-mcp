export interface CliOptions {
    config?: string;
    debug?: boolean;
    root?: string;
    help?: boolean;
    version?: boolean;
}
export declare function parseCliArgs(argv?: string[]): CliOptions;
