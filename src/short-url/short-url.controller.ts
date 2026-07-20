import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, UsePipes } from '@nestjs/common';
import { Request, Response } from 'express';
import { extractRequestContext } from '../common/http/request-context';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateShortUrlBulkDto } from './dto/create-short-url-bulk.dto';
import { CreateShortUrlBulkSchema } from './dto/create-short-url-bulk.schema';
import { CreateShortUrlDto } from './dto/create-short-url.dto';
import { CreateShortUrlSchema } from './dto/create-short-url.schema';
import { ShortUrlBulkResponseDto } from './dto/short-url-bulk-response.dto';
import { ShortUrlClicksResponseDto } from './dto/short-url-clicks-response.dto';
import { ShortUrlResponseDto } from './dto/short-url-response.dto';
import { ShortUrlStatsResponseDto } from './dto/short-url-stats-response.dto';
import { ShortUrlService } from './short-url.service';

@Controller()
export class ShortUrlController {
  constructor(private readonly shortUrlService: ShortUrlService) {}

  @Post('short-url')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateShortUrlSchema))
  async create(@Body() body: CreateShortUrlDto): Promise<ShortUrlResponseDto> {
    return this.shortUrlService.create(body.destination);
  }

  @Post('short-url/bulk')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateShortUrlBulkSchema))
  async createBulk(@Body() body: CreateShortUrlBulkDto): Promise<ShortUrlBulkResponseDto> {
    return this.shortUrlService.createBulk(body.items);
  }

  @Get('short-url/:code')
  async getStats(@Param('code') code: string): Promise<ShortUrlStatsResponseDto> {
    return this.shortUrlService.getStats(code);
  }

  @Get('short-url/:code/clicks')
  async getClicks(
    @Param('code') code: string,
    @Query('limit') limit?: string,
  ): Promise<ShortUrlClicksResponseDto> {
    const parsedLimit = limit !== undefined && !Number.isNaN(Number(limit)) ? Number(limit) : undefined;
    return this.shortUrlService.getClicks(code, parsedLimit);
  }

  @Get('r/:code')
  async redirect(@Param('code') code: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const shortUrl = await this.shortUrlService.redirect(code, extractRequestContext(req));
    res.redirect(HttpStatus.FOUND, shortUrl.destination);
  }
}
