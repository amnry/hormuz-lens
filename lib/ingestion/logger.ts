// Structured JSON logger for ingestion scripts. One JSON line per event, no pretty-printing.

type Level = 'info' | 'warn' | 'error' | 'debug';

export interface Logger {
  info:  (event: string, payload?: Record<string, unknown>) => void;
  warn:  (event: string, payload?: Record<string, unknown>) => void;
  error: (event: string, payload?: Record<string, unknown>) => void;
  debug: (event: string, payload?: Record<string, unknown>) => void;
}

export function makeLogger(script: string): Logger {
  function log(level: Level, event: string, payload: Record<string, unknown> = {}): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, script, event, ...payload });
    if (level === 'error' || level === 'warn') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }
  return {
    info:  (event, payload) => log('info',  event, payload),
    warn:  (event, payload) => log('warn',  event, payload),
    error: (event, payload) => log('error', event, payload),
    debug: (event, payload) => log('debug', event, payload),
  };
}
