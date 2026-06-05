// ADR-0064: a11y category disabled here — axe canonical per ADR-0050 §1.

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
        chromeFlags: '--no-sandbox --headless=new',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.85 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
        'categories:accessibility': 'off',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
