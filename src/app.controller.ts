import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ description: 'ISO 8601', example: '2026-09-03T00:00:00.000Z' })
  timestamp: string;
}

@ApiTags('health')
@Controller()
export class AppController {
  @Public()
  @Get('health')
  @ApiOkResponse({ type: HealthResponseDto })
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
