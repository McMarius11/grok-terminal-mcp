declare class ProcessManager {
    private processes;
    private readonly MAX_BUFFER;
    start(command: string, options?: {
        cwd?: string;
    }): string;
    list(): {
        id: string;
        command: string;
        cwd: string;
        running: boolean;
        exitCode: number | null;
        startedAt: number;
        runtimeMs: number;
    }[];
    readOutput(id: string, options?: {
        offset?: number;
        length?: number;
    }): {
        error: string;
        id?: undefined;
        running?: undefined;
        exitCode?: undefined;
        stdout?: undefined;
        stderr?: undefined;
        stdoutLength?: undefined;
        stderrLength?: undefined;
    } | {
        id: string;
        running: boolean;
        exitCode: number | null;
        stdout: string;
        stderr: string;
        stdoutLength: number;
        stderrLength: number;
        error?: undefined;
    };
    kill(id: string, signal?: string): {
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
    };
    cleanup(): void;
}
export declare const processManager: ProcessManager;
export {};
