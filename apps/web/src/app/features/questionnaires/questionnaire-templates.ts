import { QuestionnaireKind } from '@seo/shared';

/**
 * Question schema used for both the public form and the Intake Hub
 * detail render. `id` is the answer key; the rest is display metadata.
 * Kept minimal so questions can be edited in code without a migration.
 */
export interface QuestionnaireField {
  id: string;
  label: string;
  type: 'text' | 'longtext' | 'url' | 'yesno' | 'select';
  options?: string[];
  hint?: string;
  required?: boolean;
}

export interface QuestionnaireSection {
  title: string;
  fields: QuestionnaireField[];
}

const BUSINESS_INFO: QuestionnaireSection = {
  title: 'Business info',
  fields: [
    { id: 'services', label: 'What services / products do you sell?', type: 'longtext', required: true },
    { id: 'idealCustomer', label: 'Who is your ideal customer?', type: 'longtext' },
    { id: 'primaryLocation', label: 'Primary business location (city, state / country)', type: 'text' },
    { id: 'serviceAreas', label: 'Cities or regions you serve', type: 'longtext' },
    { id: 'usp', label: 'What makes you different from your competitors?', type: 'longtext' },
  ],
};

const COMPETITORS: QuestionnaireSection = {
  title: 'Competitors',
  fields: [
    { id: 'competitorNames', label: 'Top 3 competitors (name / website)', type: 'longtext' },
    { id: 'competitiveEdge', label: 'What do they do well?', type: 'longtext' },
  ],
};

const SEO_STRATEGY: QuestionnaireSection = {
  title: 'SEO / Content',
  fields: [
    { id: 'contentGoals', label: 'What outcomes matter most from SEO?', type: 'longtext', hint: 'Leads / calls / sales / brand visibility.' },
    { id: 'currentSeoWork', label: 'What SEO work are you doing today?', type: 'longtext' },
    { id: 'contentApproval', label: 'Who reviews / approves content?', type: 'text' },
    { id: 'topKeywords', label: 'Keywords you already know you want to rank for', type: 'longtext' },
  ],
};

const PPC_STRATEGY: QuestionnaireSection = {
  title: 'PPC / Ads',
  fields: [
    { id: 'monthlyAdSpend', label: 'Monthly ad budget you plan to allocate (USD)', type: 'text', required: true },
    { id: 'adGoals', label: 'What outcome do you want the ads to drive?', type: 'longtext', hint: 'Calls / form fills / purchases / demo requests.' },
    { id: 'runningAds', label: 'Are you running ads today? If yes, on which platforms?', type: 'longtext' },
    { id: 'landingPages', label: 'Which landing pages should the ads drive to?', type: 'longtext' },
  ],
};

const WEBSITE_SCOPE: QuestionnaireSection = {
  title: 'Website scope',
  fields: [
    { id: 'domainName', label: 'Domain name / URL', type: 'url', required: true },
    { id: 'pagesNeeded', label: 'Pages the new site should include', type: 'longtext', hint: 'Home / Services / About / Contact / individual service pages…' },
    { id: 'features', label: 'Special features you need', type: 'longtext', hint: 'Forms / bookings / e-commerce / blog / CMS access.' },
    { id: 'branding', label: 'Do you have logos, colors, fonts finalized?', type: 'yesno' },
    { id: 'referenceSites', label: 'Websites you like as reference', type: 'longtext' },
  ],
};

const ACCESS: QuestionnaireSection = {
  title: 'Access & credentials',
  fields: [
    { id: 'cmsAccess', label: 'Who owns / has admin access to your website?', type: 'longtext' },
    { id: 'gscAccess', label: 'Do you have a Google Search Console account?', type: 'yesno' },
    { id: 'ga4Access', label: 'Do you have a Google Analytics 4 property?', type: 'yesno' },
    { id: 'gbpAccess', label: 'Do you have a Google Business Profile? If yes, is it verified?', type: 'longtext' },
    { id: 'additionalNotes', label: 'Anything else we should know?', type: 'longtext' },
  ],
};

export const QUESTIONNAIRE_TEMPLATES: Record<QuestionnaireKind, QuestionnaireSection[]> = {
  seo: [BUSINESS_INFO, COMPETITORS, SEO_STRATEGY, ACCESS],
  ppc: [BUSINESS_INFO, COMPETITORS, PPC_STRATEGY, ACCESS],
  website: [BUSINESS_INFO, WEBSITE_SCOPE, ACCESS],
  combo: [BUSINESS_INFO, COMPETITORS, SEO_STRATEGY, PPC_STRATEGY, ACCESS],
};
