// ADR-0064: EcoIndex baseline via Lighthouse CI.
//
// Lighthouse a11y category is disabled here — @axe-core/playwright is
// the canonical a11y gate per ADR-0050 §1.

const baseUrl = process.env.LHCI_BASE_URL || 'https://wordsparrow.io';
const routes = ['/', '/grille', '/contribuer'];

module.exports = {
  ci: {
    collect: {
      url: routes.map((r) => new URL(r, baseUrl).toString()),
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        onlyCategories: ['performance', 'best-practices', 'seo'],
        plugins: ['lighthouse-plugin-ecoindex'],
        chromeFlags: '--no-sandbox --headless=new',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.85 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
        'plugins:lighthouse-plugin-ecoindex': ['warn', { minScore: 0.7 }],
        'categories:accessibility': 'off',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
