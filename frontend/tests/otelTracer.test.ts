import { ROOT_CONTEXT, SpanKind, type Tracer } from '@opentelemetry/api';
import { SamplingDecision, type Sampler } from '@opentelemetry/sdk-trace-web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorAwareSampler,
  attachUncaughtErrorReporting,
  readOtelConfigFromEnv,
} from '@/infrastructure/observability/otelTracer';

function makeBase(decision: SamplingDecision): Sampler {
  return {
    shouldSample: vi.fn().mockReturnValue({ decision }),
    toString: () => 'MockSampler',
  };
}

const NO_ATTRS = {};
const NO_LINKS: never[] = [];

describe('ErrorAwareSampler', () => {
  it('always samples spans whose name starts with "window."', () => {
    const base = makeBase(SamplingDecision.NOT_RECORD);
    const sampler = new ErrorAwareSampler(base);

    const result = sampler.shouldSample(
      ROOT_CONTEXT,
      'trace-id',
      'window.error',
      SpanKind.INTERNAL,
      NO_ATTRS,
      NO_LINKS,
    );

    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(base.shouldSample).not.toHaveBeenCalled();
  });

  it('always samples "window.unhandledrejection" spans', () => {
    const base = makeBase(SamplingDecision.NOT_RECORD);
    const sampler = new ErrorAwareSampler(base);

    const result = sampler.shouldSample(
      ROOT_CONTEXT,
      'trace-id',
      'window.unhandledrejection',
      SpanKind.INTERNAL,
      NO_ATTRS,
      NO_LINKS,
    );

    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(base.shouldSample).not.toHaveBeenCalled();
  });

  it('delegates non-window spans to the base sampler', () => {
    const base = makeBase(SamplingDecision.NOT_RECORD);
    const sampler = new ErrorAwareSampler(base);

    const result = sampler.shouldSample(
      ROOT_CONTEXT,
      'trace-id',
      'fetch.GET /api/puzzle',
      SpanKind.CLIENT,
      NO_ATTRS,
      NO_LINKS,
    );

    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
    expect(base.shouldSample).toHaveBeenCalledOnce();
  });

  it('does not promote a span whose name merely contains "window." mid-string', () => {
    const base = makeBase(SamplingDecision.NOT_RECORD);
    const sampler = new ErrorAwareSampler(base);

    const result = sampler.shouldSample(
      ROOT_CONTEXT,
      'trace-id',
      'some.window.thing',
      SpanKind.INTERNAL,
      NO_ATTRS,
      NO_LINKS,
    );

    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });
});

describe('readOtelConfigFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when VITE_OTEL_OTLP_ENDPOINT is empty', () => {
    vi.stubEnv('VITE_OTEL_OTLP_ENDPOINT', '');

    expect(readOtelConfigFromEnv()).toBeNull();
  });

  it('returns null when VITE_OTEL_OTLP_ENDPOINT is absent', () => {
    vi.stubEnv('VITE_OTEL_OTLP_ENDPOINT', undefined as unknown as string);

    expect(readOtelConfigFromEnv()).toBeNull();
  });

  it('returns config with the endpoint when VITE_OTEL_OTLP_ENDPOINT is set', () => {
    vi.stubEnv('VITE_OTEL_OTLP_ENDPOINT', 'https://otlp.example.io');
    vi.stubEnv('VITE_OTEL_SAMPLER_RATIO', '0.5');

    const config = readOtelConfigFromEnv();

    expect(config).not.toBeNull();
    expect(config!.endpoint).toBe('https://otlp.example.io');
    expect(config!.samplerRatio).toBe(0.5);
  });

  it('accepts a valid ratio of 0.5', () => {
    vi.stubEnv('VITE_OTEL_OTLP_ENDPOINT', 'https://otlp.example.io');
    vi.stubEnv('VITE_OTEL_SAMPLER_RATIO', '0.5');

    expect(readOtelConfigFromEnv()!.samplerRatio).toBe(0.5);
  });

  it('falls back to 0.1 for a negative ratio', () => {
    vi.stubEnv('VITE_OTEL_OTLP_ENDPOINT', 'https://otlp.example.io');
    vi.stubEnv('VITE_OTEL_SAMPLER_RATIO', '-1');

    expect(readOtelConfigFromEnv()!.samplerRatio).toBe(0.1);
  });

  it('falls back to 0.1 for a ratio greater than 1', () => {
    vi.stubEnv('VITE_OTEL_OTLP_ENDPOINT', 'https://otlp.example.io');
    vi.stubEnv('VITE_OTEL_SAMPLER_RATIO', '2');

    expect(readOtelConfigFromEnv()!.samplerRatio).toBe(0.1);
  });

  it('falls back to 0.1 for a non-numeric ratio string', () => {
    vi.stubEnv('VITE_OTEL_OTLP_ENDPOINT', 'https://otlp.example.io');
    vi.stubEnv('VITE_OTEL_SAMPLER_RATIO', 'abc');

    expect(readOtelConfigFromEnv()!.samplerRatio).toBe(0.1);
  });

  it('defaults serviceName to "frontend" when unset', () => {
    vi.stubEnv('VITE_OTEL_OTLP_ENDPOINT', 'https://otlp.example.io');

    expect(readOtelConfigFromEnv()!.serviceName).toBe('frontend');
  });

  it('uses VITE_OTEL_SERVICE_NAME when provided', () => {
    vi.stubEnv('VITE_OTEL_OTLP_ENDPOINT', 'https://otlp.example.io');
    vi.stubEnv('VITE_OTEL_SERVICE_NAME', 'my-service');

    expect(readOtelConfigFromEnv()!.serviceName).toBe('my-service');
  });
});

describe('attachUncaughtErrorReporting', () => {
  const setStatus = vi.fn();
  const end = vi.fn();
  const startSpan = vi.fn().mockReturnValue({ setStatus, end });
  const tracer = { startSpan } as unknown as Tracer;

  // Attached once for the whole describe: the module-level guard makes re-attachment a no-op.
  attachUncaughtErrorReporting(tracer);

  beforeEach(() => {
    window.history.pushState({}, '', '/grilles?onglet=archives');
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/');
  });

  function dispatchRejection(reason: unknown): void {
    const event = new Event('unhandledrejection') as Event & { reason: unknown };
    event.reason = reason;
    window.dispatchEvent(event);
  }

  it('records url.full and url.path on window.error spans', () => {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'boom',
        error: new TypeError('boom'),
        filename: 'https://wordsparrow.io/assets/app.js',
        lineno: 12,
        colno: 34,
      }),
    );

    expect(startSpan).toHaveBeenCalledOnce();
    const [name, options] = startSpan.mock.calls[0] as [string, { attributes: Record<string, unknown> }];
    expect(name).toBe('window.error');
    expect(options.attributes['url.full']).toBe(window.location.href);
    expect(options.attributes['url.full']).toContain('/grilles?onglet=archives');
    expect(options.attributes['url.path']).toBe('/grilles');
    expect(options.attributes['exception.type']).toBe('TypeError');
    expect(options.attributes['exception.message']).toBe('boom');
    expect(end).toHaveBeenCalledOnce();
  });

  it('records url.full and url.path on unhandledrejection spans with an Error reason', () => {
    dispatchRejection(new Error('nope'));

    expect(startSpan).toHaveBeenCalledOnce();
    const [name, options] = startSpan.mock.calls[0] as [string, { attributes: Record<string, unknown> }];
    expect(name).toBe('window.unhandledrejection');
    expect(options.attributes['url.full']).toBe(window.location.href);
    expect(options.attributes['url.path']).toBe('/grilles');
    expect(options.attributes['exception.type']).toBe('Error');
    expect(options.attributes['exception.message']).toBe('nope');
    expect(end).toHaveBeenCalledOnce();
  });

  it('handles a string rejection reason and keeps the raw message', () => {
    dispatchRejection('plain string failure');

    const [, options] = startSpan.mock.calls[0] as [string, { attributes: Record<string, unknown> }];
    expect(options.attributes['exception.type']).toBe('string');
    expect(options.attributes['exception.message']).toBe('plain string failure');
    expect(options.attributes['url.path']).toBe('/grilles');
    expect(end).toHaveBeenCalledOnce();
  });

  it('handles a null rejection reason without throwing', () => {
    dispatchRejection(null);

    const [, options] = startSpan.mock.calls[0] as [string, { attributes: Record<string, unknown> }];
    expect(options.attributes['exception.type']).toBe('object');
    expect(options.attributes['exception.message']).toBe('unknown');
    expect(options.attributes['url.path']).toBe('/grilles');
  });

  it('does not attach listeners twice when called again', () => {
    attachUncaughtErrorReporting(tracer);

    dispatchRejection(new Error('once'));

    expect(startSpan).toHaveBeenCalledOnce();
  });
});
