// Algolia REST API search utility for CompletedTasksView.js
// Uses fetch to query Algolia index directly (no algoliasearch/lite)
//
// Usage:
//   searchAlgoliaTasks({ query: 'foo', page: 0, hitsPerPage: 25 })
//
// Always restricts to progressState = 6

const ALGOLIA_APP_ID = 'P7HF5F7EEG';
const ALGOLIA_SEARCH_KEY = '85334946fb1fff4c0562f395d3c425a9';
const ALGOLIA_INDEX = 'tasks';

/**
 * Search Algolia for completed tasks (progressState = 6)
 * @param {Object} params
 * @param {string} params.query - Search string
 * @param {number} params.page - Page number (0-based)
 * @param {number} params.hitsPerPage - Results per page
 * @returns {Promise<{ hits: Array, nbHits: number, page: number, nbPages: number, hitsPerPage: number, processingTimeMS: number, facets?: object }>} Algolia response
 */
export async function searchAlgoliaTasks({ query, page = 0, hitsPerPage = 25, filters, facetFilters }) {
    const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
    const body = {
        query,
        page,
        hitsPerPage,
        ...(filters ? { filters } : {}),
        ...(facetFilters ? { facetFilters } : {}),
      };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Algolia-Application-Id': ALGOLIA_APP_ID,
        'X-Algolia-API-Key': ALGOLIA_SEARCH_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error('Algolia search failed');
    }
    const data = await res.json();
    return data;
  } catch (err) {
    throw err;
  }
}
