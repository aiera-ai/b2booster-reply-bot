// Persona blueprints define WHICH sections appear and TONE per role/industry.
// Sections are rendered by template.js in this exact order.
//
// Available section IDs (must match keys in template.js):
//   hero, references, kontekst, aiStack, resitve, arhitektura,
//   pilot, personaSpotlight, benefits, varnostKratko, varnostPodatki,
//   pristop, faq, ctaFinal, footer
//
// Each section is also responsible for which content slots Claude must generate.
// See generator.js SLOT_SCHEMA for exact slot keys.

const PERSONAS = {
  // ─────────────────────────────────────────────────────────────────────────
  head_of_it: {
    label: 'Head of IT / CTO / IT direktor',
    theme: 'teal',
    sections: [
      'hero',
      'references',
      'kontekst',
      'aiStack',
      'resitve',
      'arhitektura',
      'pilot',
      'personaSpotlight',  // ZA IT ODDELEK
      'benefits',
      'varnostKratko',
      'varnostPodatki',
      'pristop',
      'faq',
      'ctaFinal',
      'footer',
    ],
    spotlight: {
      label: 'ZA IT ODDELEK',
      title: 'Zasnovano z mislijo na IT, varnost in dolgoročno vzdrževanje',
      themes: ['security', 'audit', 'integration', 'maintenance', 'control'],
    },
    faqFocus: ['security', 'compliance', 'integration', 'data_residency', 'vendor_lockin', 'maintenance'],
    cta: 'Predlog: 15-minutni pregled možnosti za {company}',
  },

  // ─────────────────────────────────────────────────────────────────────────
  ceo: {
    label: 'CEO / Founder / Generalni direktor',
    theme: 'slate',
    sections: [
      'hero',
      'references',
      'kontekst',
      'resitve',
      'arhitektura',
      'pilot',
      'personaSpotlight',  // ZA VODSTVO
      'benefits',
      'varnostKratko',
      'pristop',
      'faq',
      'ctaFinal',
      'footer',
    ],
    spotlight: {
      label: 'ZA VODSTVO',
      title: 'Strateška vrednost, ne le orodje',
      themes: ['strategic_advantage', 'speed_to_market', 'leverage', 'visibility', 'competitive_edge'],
    },
    faqFocus: ['roi', 'timeline', 'team_change_management', 'risk', 'next_step'],
    cta: 'Predlog: 15-minutni pregovor o smeri za {company}',
  },

  // ─────────────────────────────────────────────────────────────────────────
  cfo: {
    label: 'CFO / Finančni direktor',
    theme: 'navy',
    sections: [
      'hero',
      'references',
      'kontekst',
      'resitve',
      'arhitektura',
      'pilot',
      'personaSpotlight',  // ZA FINANCE
      'benefits',
      'varnostKratko',
      'pristop',
      'faq',
      'ctaFinal',
      'footer',
    ],
    spotlight: {
      label: 'ZA FINANCE',
      title: 'Merljiv prihranek časa in operativni vpliv',
      themes: ['cost_savings', 'time_reclaimed', 'roi', 'budget_predictability', 'risk_mitigation'],
    },
    faqFocus: ['roi', 'cost_breakdown', 'payment_terms', 'risk', 'contract_flexibility'],
    cta: 'Predlog: 15-minutni pregled vpliva za {company}',
  },

  // ─────────────────────────────────────────────────────────────────────────
  head_of_sales: {
    label: 'Head of Sales / Sales direktor / Business Development',
    theme: 'forest',
    sections: [
      'hero',
      'references',
      'kontekst',
      'resitve',
      'pilot',
      'personaSpotlight',  // ZA PRODAJO
      'benefits',
      'pristop',
      'faq',
      'ctaFinal',
      'footer',
    ],
    spotlight: {
      label: 'ZA PRODAJO',
      title: 'Več pravih sestankov, manj ročne priprave',
      themes: ['pipeline', 'qualified_meetings', 'personalization_at_scale', 'sales_velocity', 'crm_hygiene'],
    },
    faqFocus: ['leads_quality', 'crm_integration', 'team_onboarding', 'conversion', 'timeline'],
    cta: 'Predlog: 15-minutni pregled prodajnega motorja za {company}',
  },

  // ─────────────────────────────────────────────────────────────────────────
  head_of_ops: {
    label: 'Head of Operations / COO / Operativni direktor',
    theme: 'amber',
    sections: [
      'hero',
      'references',
      'kontekst',
      'aiStack',
      'resitve',
      'arhitektura',
      'pilot',
      'personaSpotlight',  // ZA OPERACIJE
      'benefits',
      'varnostKratko',
      'pristop',
      'faq',
      'ctaFinal',
      'footer',
    ],
    spotlight: {
      label: 'ZA OPERACIJE',
      title: 'Manj ročnega dela, jasnejši procesi',
      themes: ['process_automation', 'sla_visibility', 'workflow_speed', 'data_handoffs', 'audit_trail'],
    },
    faqFocus: ['integration', 'team_adoption', 'sla', 'maintenance', 'scale'],
    cta: 'Predlog: 15-minutni pregled procesov za {company}',
  },

  // ─────────────────────────────────────────────────────────────────────────
  head_of_marketing: {
    label: 'Head of Marketing / CMO',
    theme: 'plum',
    sections: [
      'hero',
      'references',
      'kontekst',
      'resitve',
      'pilot',
      'personaSpotlight',  // ZA MARKETING
      'benefits',
      'pristop',
      'faq',
      'ctaFinal',
      'footer',
    ],
    spotlight: {
      label: 'ZA MARKETING',
      title: 'Personalizirana vsebina v obsegu, brez izgube tona',
      themes: ['content_velocity', 'personalization', 'attribution', 'brand_consistency', 'campaign_speed'],
    },
    faqFocus: ['brand_voice', 'integration', 'content_quality', 'timeline', 'team_workflow'],
    cta: 'Predlog: 15-minutni pregled marketinških priložnosti za {company}',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Generic fallback for unclassified roles
  default: {
    label: 'Decision maker',
    theme: 'teal',
    sections: [
      'hero',
      'references',
      'kontekst',
      'resitve',
      'pilot',
      'personaSpotlight',
      'benefits',
      'varnostKratko',
      'pristop',
      'faq',
      'ctaFinal',
      'footer',
    ],
    spotlight: {
      label: 'POVZETEK',
      title: 'Zasnovano za vašo organizacijo',
      themes: ['practical_value', 'low_risk_pilot', 'measurable_outcome', 'team_fit'],
    },
    faqFocus: ['roi', 'timeline', 'security', 'pilot_scope', 'next_step'],
    cta: 'Predlog: 15-minutni pregled za {company}',
  },
};

// Persona detection from LinkedIn-style job title
function detectPersona(title = '') {
  const s = (title || '').toLowerCase().trim();
  if (!s) return 'default';

  // CFO / Finance
  if (/cfo|finančn|finance director|financ|controlling|controller|treasur|računovod/.test(s)) return 'cfo';

  // CEO / Founder (check before "sales" since "sales director and co-founder" exists)
  if (/\bceo\b|founder|co-founder|owner|lastnik|direktor\b|managing director|md\b|gener(alni|alna) direktor/.test(s) && !/sales|prodaj|market/.test(s)) return 'ceo';

  // Head of IT / CTO
  if (/\bcto\b|cio\b|head of it|it director|it manager|it lead|tech lead|engineering lead|head of engineering|head of tech|vp engineering|vp of engineering/.test(s)) return 'head_of_it';

  // Head of Sales / BD
  if (/sales|prodaj|business develop|bd manager|bd director|growth|account director|commercial director|export|izvoz/.test(s)) return 'head_of_sales';

  // Head of Marketing / CMO
  if (/cmo\b|marketing|brand director|content director|growth marketing/.test(s)) return 'head_of_marketing';

  // Head of Ops / COO
  if (/\bcoo\b|operations|operativ|head of ops|ops director|process|supply chain|logistik|production/.test(s)) return 'head_of_ops';

  // Director or VP without specific function → CEO bucket (broad leadership)
  if (/\bvp\b|vice president|director|head of/.test(s)) return 'ceo';

  return 'default';
}

function getPersona(key) {
  return PERSONAS[key] || PERSONAS.default;
}

module.exports = { PERSONAS, detectPersona, getPersona };
