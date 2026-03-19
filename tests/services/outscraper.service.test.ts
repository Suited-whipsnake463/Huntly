import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock outscraper + config BEFORE importing the service              */
/* ------------------------------------------------------------------ */

const mockGoogleMapsSearch = vi.fn();
const mockGoogleMapsReviews = vi.fn();

vi.mock('outscraper', () => {
  // The outscraper package uses `module.exports = Outscraper` (CJS class).
  // With esModuleInterop, `import Outscraper from 'outscraper'` resolves
  // to the class itself. Vitest rewrites this so that `default` is the
  // constructor the service will `new`.
  class OutscraperMock {
    googleMapsSearch = mockGoogleMapsSearch;
    googleMapsReviews = mockGoogleMapsReviews;
  }
  return { default: OutscraperMock };
});

vi.mock('../../src/config.js', () => ({
  env: {
    OUTSCRAPER_API_KEY: 'test-key',
  },
}));

import { searchBusinesses, fetchReviews } from '../../src/services/outscraper.service.js';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const makeBusiness = (overrides: Record<string, unknown> = {}) => ({
  place_id: 'ChIJ_abc123',
  name: 'Acme Dental',
  type: 'Dentist',
  full_address: '123 Main St, Anytown, USA',
  phone: '+15551234567',
  site: 'https://acmedental.com',
  rating: 4.5,
  reviews: 120,
  ...overrides,
});

const makeReviewItem = (overrides: Record<string, unknown> = {}) => ({
  name: 'Acme Dental',
  rating: 4.5,
  reviews_data: [
    { review_text: 'Great service!' },
    { review_text: 'Very professional.' },
  ],
  ...overrides,
});

/* ------------------------------------------------------------------ */
/*  Tests: searchBusinesses                                            */
/* ------------------------------------------------------------------ */

describe('searchBusinesses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalises Outscraper results into LeadSourceData[]', async () => {
    mockGoogleMapsSearch.mockResolvedValue([
      [makeBusiness()],
    ]);

    const leads = await searchBusinesses('dentists in New York');

    expect(leads).toHaveLength(1);
    expect(leads[0]).toEqual({
      businessName: 'Acme Dental',
      category: 'Dentist',
      address: '123 Main St, Anytown, USA',
      phone: '+15551234567',
      websiteUrl: 'https://acmedental.com',
      googleMapsPlaceId: 'ChIJ_abc123',
      googleRating: 4.5,
      googleReviewCount: 120,
      raw: expect.objectContaining({ place_id: 'ChIJ_abc123' }),
    });
  });

  it('deduplicates results by place_id', async () => {
    const biz = makeBusiness();
    mockGoogleMapsSearch.mockResolvedValue([
      [biz, biz, { ...biz, name: 'Acme Dental Copy' }],
    ]);

    const leads = await searchBusinesses('dentists in NYC');

    expect(leads).toHaveLength(1);
    expect(leads[0]!.businessName).toBe('Acme Dental');
  });

  it('deduplicates across multiple batches', async () => {
    const biz1 = makeBusiness({ place_id: 'ChIJ_1' });
    const biz2 = makeBusiness({ place_id: 'ChIJ_2', name: 'Beta Dental' });
    const biz1dup = makeBusiness({ place_id: 'ChIJ_1', name: 'Acme Dental Again' });

    mockGoogleMapsSearch.mockResolvedValue([
      [biz1, biz2],
      [biz1dup],
    ]);

    const leads = await searchBusinesses('dentists in LA');

    expect(leads).toHaveLength(2);
    expect(leads.map((l) => l.googleMapsPlaceId)).toEqual(['ChIJ_1', 'ChIJ_2']);
  });

  it('skips items without a place_id', async () => {
    mockGoogleMapsSearch.mockResolvedValue([
      [makeBusiness(), { name: 'No Place ID' }],
    ]);

    const leads = await searchBusinesses('dentists');

    expect(leads).toHaveLength(1);
  });

  it('handles missing optional fields gracefully', async () => {
    mockGoogleMapsSearch.mockResolvedValue([
      [
        {
          place_id: 'ChIJ_minimal',
          name: 'Minimal Biz',
          // no type, category, full_address, phone, site, rating, reviews
        },
      ],
    ]);

    const leads = await searchBusinesses('query');

    expect(leads).toHaveLength(1);
    expect(leads[0]).toEqual({
      businessName: 'Minimal Biz',
      category: '',
      address: '',
      phone: undefined,
      websiteUrl: undefined,
      googleMapsPlaceId: 'ChIJ_minimal',
      googleRating: undefined,
      googleReviewCount: undefined,
      raw: expect.objectContaining({ place_id: 'ChIJ_minimal' }),
    });
  });

  it('defaults businessName to "Unknown" when name is missing', async () => {
    mockGoogleMapsSearch.mockResolvedValue([
      [{ place_id: 'ChIJ_noname' }],
    ]);

    const leads = await searchBusinesses('query');

    expect(leads[0]!.businessName).toBe('Unknown');
  });

  it('returns empty array when API returns no results', async () => {
    mockGoogleMapsSearch.mockResolvedValue([[]]);

    const leads = await searchBusinesses('nonexistent');

    expect(leads).toEqual([]);
  });

  it('handles non-array batch items (single objects)', async () => {
    // Some APIs may return a flat object instead of an array in a batch
    mockGoogleMapsSearch.mockResolvedValue([
      makeBusiness({ place_id: 'ChIJ_flat' }),
    ]);

    const leads = await searchBusinesses('query');

    expect(leads).toHaveLength(1);
    expect(leads[0]!.googleMapsPlaceId).toBe('ChIJ_flat');
  });

  it('falls back to address when full_address is missing', async () => {
    mockGoogleMapsSearch.mockResolvedValue([
      [makeBusiness({ full_address: undefined, address: '456 Oak Ave' })],
    ]);

    const leads = await searchBusinesses('query');

    expect(leads[0]!.address).toBe('456 Oak Ave');
  });

  it('falls back to category when type is missing', async () => {
    mockGoogleMapsSearch.mockResolvedValue([
      [makeBusiness({ type: undefined, category: 'Medical' })],
    ]);

    const leads = await searchBusinesses('query');

    expect(leads[0]!.category).toBe('Medical');
  });

  it('passes the correct limit to the API', async () => {
    mockGoogleMapsSearch.mockResolvedValue([[]]);

    await searchBusinesses('dentists', 50);

    expect(mockGoogleMapsSearch).toHaveBeenCalledWith(
      'dentists',
      50,
      'en',
      null,
      0,
      false,
      null,
      false,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: fetchReviews                                                */
/* ------------------------------------------------------------------ */

describe('fetchReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns review texts and rating for a place', async () => {
    mockGoogleMapsReviews.mockResolvedValue([
      [makeReviewItem()],
    ]);

    const result = await fetchReviews('ChIJ_abc123');

    expect(result.reviews).toEqual(['Great service!', 'Very professional.']);
    expect(result.rating).toBe(4.5);
  });

  it('handles empty reviews_data', async () => {
    mockGoogleMapsReviews.mockResolvedValue([
      [{ rating: 3.0, reviews_data: [] }],
    ]);

    const result = await fetchReviews('ChIJ_empty');

    expect(result.reviews).toEqual([]);
    expect(result.rating).toBe(3.0);
  });

  it('handles missing reviews_data field', async () => {
    mockGoogleMapsReviews.mockResolvedValue([
      [{ rating: 4.0 }],
    ]);

    const result = await fetchReviews('ChIJ_no_reviews');

    expect(result.reviews).toEqual([]);
    expect(result.rating).toBe(4.0);
  });

  it('filters out reviews without text', async () => {
    mockGoogleMapsReviews.mockResolvedValue([
      [
        {
          rating: 4.2,
          reviews_data: [
            { review_text: 'Good place' },
            { review_text: '' },
            { review_text: null },
            { stars: 5 }, // no review_text at all
          ],
        },
      ],
    ]);

    const result = await fetchReviews('ChIJ_mixed');

    expect(result.reviews).toEqual(['Good place']);
  });

  it('returns zero rating when no rating present', async () => {
    mockGoogleMapsReviews.mockResolvedValue([
      [{ reviews_data: [{ review_text: 'OK' }] }],
    ]);

    const result = await fetchReviews('ChIJ_no_rating');

    expect(result.reviews).toEqual(['OK']);
    expect(result.rating).toBe(0);
  });

  it('passes the correct limit to the API', async () => {
    mockGoogleMapsReviews.mockResolvedValue([[]]);

    await fetchReviews('ChIJ_abc123', 50);

    expect(mockGoogleMapsReviews).toHaveBeenCalledWith('ChIJ_abc123', 50);
  });

  it('returns empty reviews from empty API response', async () => {
    mockGoogleMapsReviews.mockResolvedValue([[]]);

    const result = await fetchReviews('ChIJ_nothing');

    expect(result.reviews).toEqual([]);
    expect(result.rating).toBe(0);
  });
});
