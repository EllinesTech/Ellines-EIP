import * as winston from 'winston';

/**
 * Create Winston logger with structured JSON output to console
 * Elasticsearch transport can be added via environment variable
 */
export function createLogger() {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
    }),
  ];

  // Add Elasticsearch transport if URL is provided
  if (process.env.ELASTICSEARCH_URL) {
    try {
      const { ElasticsearchTransport } = require('winston-elasticsearch');
      transports.push(
        new ElasticsearchTransport({
          level: 'info',
          clientOpts: { node: process.env.ELASTICSEARCH_URL },
          index: 'ellines-logs',
          transformer: (logData: any) => ({
            '@timestamp': new Date().toISOString(),
            ...logData,
          }),
        }),
      );
      console.log(
        `✓ Elasticsearch logging enabled (${process.env.ELASTICSEARCH_URL})`,
      );
    } catch (error) {
      console.warn(
        'Elasticsearch transport not available, using console only:',
        error,
      );
    }
  }

  return winston.createLogger({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    transports,
  });
}
