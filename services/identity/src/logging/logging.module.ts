import { Module, Global } from '@nestjs/common';
import { createLogger } from './logger';
import { Logger } from './log-context';

@Global()
@Module({
  providers: [
    {
      provide: 'WINSTON_LOGGER',
      useFactory: () => createLogger(),
    },
    {
      provide: Logger,
      useFactory: (winstonLogger) => new Logger(winstonLogger),
      inject: ['WINSTON_LOGGER'],
    },
  ],
  exports: [Logger, 'WINSTON_LOGGER'],
})
export class LoggingModule {}
