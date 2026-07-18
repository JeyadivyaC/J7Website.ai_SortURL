import { Module } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { IncomingMessage } from 'http';
import { ConfigService } from '../../config/config.service';

// pino-http's GenReqId is typed against the raw Node IncomingMessage (not
// Express's Request), so this extends that instead of `express.Request` -
// the extra properties Express adds would otherwise make the function
// parameter incompatible with GenReqId's expected signature.
interface ApiGatewayIncomingMessage extends IncomingMessage {
  apiGateway?: { event?: { requestContext?: { requestId?: string } } };
}

// Wraps nestjs-pino's LoggerModule so the rest of the app only ever imports
// this module. Output is raw JSON (no pretty-print transport) so CloudWatch
// Logs Insights can query fields directly. Request IDs are pulled from the
// API Gateway request context (exposed by @codegenie/serverless-express as
// req.apiGateway.event) so every log line ties back to a specific
// invocation; pino-http falls back to its own generated id if unavailable
// (e.g. during local dev, where there is no API Gateway event).
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: (req: ApiGatewayIncomingMessage) =>
            req.apiGateway?.event?.requestContext?.requestId ?? randomUUID(),
        },
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class AppLoggerModule {}
