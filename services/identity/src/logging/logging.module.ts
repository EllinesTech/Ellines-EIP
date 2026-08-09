import { Module, Global } from '@nestjs/common';
import { createLogger } from './logger';
import { Logger } from './log-context';
import { WinstonLoggerService } from './winston-logger.service';

@Global()
@Module({
  providers: [
    {
      provide: 'WINSTON_LOGGER',
      useFactory: () => createLogger(),
    },
    {
      provide: Logger,
      useFactory: (winstonLogger: any) => new Logger(winstonLogger),
      inject: ['WINSTON_LOGGER'],
    },
    WinstonLoggerService,
  ],
  exports: [Logger, 'WINSTON_LOGGER', WinstonLoggerService],
})
export class LoggingModule {}
