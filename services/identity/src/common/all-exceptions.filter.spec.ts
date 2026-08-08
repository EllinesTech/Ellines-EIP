import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost(method = 'GET', path = '/api/test', user?: object): ArgumentsHost {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status };
  const req = { method, path, ip: '127.0.0.1', user, get: jest.fn().mockReturnValue('TestAgent/1.0') };

  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('returns 400 for BadRequest HttpException', () => {
    const exception = new HttpException('Bad input', HttpStatus.BAD_REQUEST);
    const host = makeHost();
    filter.catch(exception, host);
    const res = host.switchToHttp().getResponse() as any;
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Bad input');
    expect(body).toHaveProperty('errorId');
    expect(body).not.toHaveProperty('stack');
  });

  it('returns 500 for generic Error', () => {
    const exception = new Error('Something broke');
    const host = makeHost();
    filter.catch(exception, host);
    const res = host.switchToHttp().getResponse() as any;
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.message).toMatch(/Internal error/);
    expect(body.message).toContain(body.errorId); // errorId embedded in message
    expect(body).not.toHaveProperty('stack'); // never leak stack to client
  });

  it('returns 500 for non-Error unknown exception', () => {
    const host = makeHost();
    filter.catch('plain string error', host);
    const res = host.switchToHttp().getResponse() as any;
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
  });

  it('includes path in response body', () => {
    const host = makeHost('POST', '/api/v1/auth/login');
    filter.catch(new HttpException('Not found', 404), host);
    const res = host.switchToHttp().getResponse() as any;
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.path).toBe('/api/v1/auth/login');
  });

  it('does not include stack in 500 client response', () => {
    const host = makeHost();
    filter.catch(new Error('crash'), host);
    const res = host.switchToHttp().getResponse() as any;
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body).not.toHaveProperty('stack');
  });

  it('handles 404 HttpException as warn (not error)', () => {
    const host = makeHost('GET', '/api/v1/orgs/me');
    // No throw — just check status code mapping
    filter.catch(new HttpException('Not found', 404), host);
    const res = host.switchToHttp().getResponse() as any;
    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.message).toBe('Not found');
  });

  it('extracts organizationId from user context when present', () => {
    const host = makeHost('GET', '/api/test', { organizationId: 'org-xyz', sub: 'user-abc' });
    // Just verify it doesn't throw — organizationId extraction is in log payload
    expect(() => filter.catch(new Error('test'), host)).not.toThrow();
  });
});
