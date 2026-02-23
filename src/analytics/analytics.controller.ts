import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * Public analytics endpoints — no authentication required.
 * All data is aggregated and anonymised.
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Platform-wide stats */
  @Get('overview')
  getOverview() {
    return this.analytics.getOverview();
  }

  /** Average compass shape, optionally filtered by country */
  @Get('aggregate')
  getAggregate(@Query('country') country?: string) {
    return this.analytics.getAggregateCompass(country || undefined);
  }

  /** Per-axis distribution histograms */
  @Get('distribution')
  getDistribution(@Query('country') country?: string) {
    return this.analytics.getDistribution(country || undefined);
  }

  /** Monthly trend data for the last N months */
  @Get('trends')
  getTrends(
    @Query('months') months?: string,
    @Query('country') country?: string,
  ) {
    return this.analytics.getTrends(
      months ? parseInt(months, 10) : 12,
      country || undefined,
    );
  }
}
