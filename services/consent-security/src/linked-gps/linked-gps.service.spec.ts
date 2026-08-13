import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LinkedGpsService } from './linked-gps.service';

describe('LinkedGpsService (real HTTP proxy to gp-authorisation-service)', () => {
  const config = new ConfigService({ GP_AUTHORISATION_SERVICE_URL: 'http://gp-authorisation.local' });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forwards the caller bearer token when listing linked GPs', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 'link-1' }] });
    global.fetch = fetchMock as any;

    const service = new LinkedGpsService(config);
    const result = await service.listForPatient('p1', 'Bearer token-abc');

    expect(result).toEqual([{ id: 'link-1' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gp-authorisation.local/gp-links?patientId=p1',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-abc' } }),
    );
  });

  it('raises BadGatewayException when the downstream service errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any;
    const service = new LinkedGpsService(config);
    await expect(service.listForPatient('p1', 'Bearer token-abc')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('posts a revoke request with the reason and forwarded token', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'link-1', status: 'revoked' }) });
    global.fetch = fetchMock as any;

    const service = new LinkedGpsService(config);
    await service.revoke('link-1', 'Changed practice', 'Bearer token-abc');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://gp-authorisation.local/gp-links/link-1/revoke',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer token-abc', 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Changed practice' }),
      }),
    );
  });
});
