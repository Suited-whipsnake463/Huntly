import { vi } from 'vitest';

// Mock Redis globally to prevent real connections in tests
vi.mock('../src/lib/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
    duplicate: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  },
}));
