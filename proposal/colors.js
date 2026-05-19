// Color themes per industry/persona context.
// Each theme matches the aiera.si/spirit aesthetic: dark ink, light bg, single brand accent.
// Format: { name, brand, brandSoft, brandDark, accentLine, ink, inkSoft, paper, paperSoft, border, mutedText }

const themes = {
  // Default - cyan/teal (used on aiera.si/spirit). Trustworthy, IT-friendly.
  teal: {
    brand: '#0E7490',       // cyan-700
    brandSoft: '#ECFEFF',   // cyan-50
    brandDark: '#155E75',   // cyan-800
    brandRgba: 'rgba(14, 116, 144, 0.12)',
    accentLine: '#0891B2',  // cyan-600
  },
  // Forest green - sales/growth/B2B distribution
  forest: {
    brand: '#15803D',
    brandSoft: '#F0FDF4',
    brandDark: '#14532D',
    brandRgba: 'rgba(21, 128, 61, 0.12)',
    accentLine: '#16A34A',
  },
  // Navy - finance/CFO/banking
  navy: {
    brand: '#1E40AF',
    brandSoft: '#EFF6FF',
    brandDark: '#1E3A8A',
    brandRgba: 'rgba(30, 64, 175, 0.12)',
    accentLine: '#2563EB',
  },
  // Plum - marketing/creative/agency
  plum: {
    brand: '#7C3AED',
    brandSoft: '#F5F3FF',
    brandDark: '#5B21B6',
    brandRgba: 'rgba(124, 58, 237, 0.12)',
    accentLine: '#8B5CF6',
  },
  // Slate - executive/CEO/board
  slate: {
    brand: '#334155',
    brandSoft: '#F8FAFC',
    brandDark: '#0F172A',
    brandRgba: 'rgba(51, 65, 85, 0.12)',
    accentLine: '#475569',
  },
  // Amber - retail/operations/manufacturing
  amber: {
    brand: '#B45309',
    brandSoft: '#FFFBEB',
    brandDark: '#92400E',
    brandRgba: 'rgba(180, 83, 9, 0.12)',
    accentLine: '#D97706',
  },
};

// Universal neutrals (same across themes - keeps brand consistency)
const neutrals = {
  ink: '#0B1428',         // near-black with cool tint
  inkSoft: '#1E293B',     // slate-800
  body: '#475569',        // slate-600
  muted: '#64748B',       // slate-500
  paper: '#FFFFFF',
  paperSoft: '#FAFAFB',
  paperBg: '#F4F4F6',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
};

function getTheme(themeName = 'teal') {
  const t = themes[themeName] || themes.teal;
  return { ...neutrals, ...t, themeName: themes[themeName] ? themeName : 'teal' };
}

// Pick theme by industry hint (lowercased string)
function themeFromContext({ industry = '', persona = '' } = {}) {
  const s = `${industry} ${persona}`.toLowerCase();
  if (/cfo|finance|finanč|računovod|bank|invest/.test(s)) return 'navy';
  if (/sales|prodaj|business develop|growth|export|izvoz|distrib/.test(s)) return 'forest';
  if (/market|brand|kreativ|agencij|content/.test(s)) return 'plum';
  if (/ceo|founder|direktor|board|owner|lastnik/.test(s)) return 'slate';
  if (/retail|trgovin|production|proizvod|logisti|warehouse|skladi|operations|operativ|supply|manufactur/.test(s)) return 'amber';
  // Default teal = IT, ops, public sector, professional services
  return 'teal';
}

module.exports = { getTheme, themeFromContext, themes };
