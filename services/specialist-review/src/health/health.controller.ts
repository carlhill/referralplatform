import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  service: 'specialist-review-service';
  timestamp: string;
}

/**
 * Liveness/readiness endpoint. docker-compose healthchecks and the CI smoke
 * test both hit this — see root CONVENTIONS.md ("Testing convention").
 * Deliberately unauthenticated (load balancers / orchestrators need to reach
 * it without a token) — never put anything sensitive in this response.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', service: 'specialist-review-service', timestamp: new Date().toISOString() };
  }
}
