import { Controller, Get } from '@nestjs/common';

interface HealthResponseDto {
  status: 'ok';
}

@Controller()
export class HealthController {
  @Get('health')
  check(): HealthResponseDto {
    return { status: 'ok' };
  }
}
