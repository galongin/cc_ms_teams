import pino from 'pino';
import type { LoggingConfig } from '../config/schema.js';

/**
 * Creates the application-wide pino logger.
 *
 * - JSON output to stderr by default.
 * - Pretty-print when config.pretty is true or NODE_ENV=development.
 * - Supports child loggers per component via logger.child({ component: 'tunnel' }).
 */
export function createLogger(config: LoggingConfig = { level: 'info', pretty: false }): pino.Logger {
  const usePretty = config.pretty || process.env['NODE_ENV'] === 'development';

  const transport = usePretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

  return pino({
    level: config.level,
    transport,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { app: 'cc-ms-teams' },
  });
}

/** Default logger instance (info level, JSON output). */
let _defaultLogger: pino.Logger | undefined;

export function getLogger(): pino.Logger {
  if (!_defaultLogger) {
    _defaultLogger = createLogger();
  }
  return _defaultLogger;
}

export function setLogger(logger: pino.Logger): void {
  _defaultLogger = logger;
}
