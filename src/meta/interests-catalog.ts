// Bundled catalog of common Meta interest targets for offline autocomplete.
// These are real Meta Targeting Search API interest IDs.
// Less common interests fall back to API lookup at validate/plan time.

export type CatalogEntry = { readonly id: string; readonly name: string }

/**
 * Look up a pre-mapped interest by name (case-insensitive).
 * Returns `{ id, name }` or `undefined` if not in the catalog.
 */
export function lookupInterest(name: string): CatalogEntry | undefined {
  return INTERESTS_BY_KEY.get(name.toLowerCase())
}

// ─── Catalog Data ──────────────────────────────────────────
// ~200 common interests across business, tech, construction, legal, medical, finance, education, etc.

const CATALOG: CatalogEntry[] = [
  // Technology & Software
  { id: '6003139266461', name: 'Technology' },
  { id: '6003020834693', name: 'Computer science' },
  { id: '6003476182657', name: 'Software' },
  { id: '6003283735711', name: 'Cloud computing' },
  { id: '6003380610938', name: 'Artificial intelligence' },
  { id: '6003270520958', name: 'Machine learning' },
  { id: '6003171858863', name: 'Data science' },
  { id: '6003017718822', name: 'Information technology' },
  { id: '6003327030857', name: 'Cybersecurity' },
  { id: '6003349442089', name: 'Web development' },
  { id: '6003277229371', name: 'Mobile app' },
  { id: '6003205451498', name: 'Open-source software' },
  { id: '6003114185372', name: 'Computer programming' },
  { id: '6003012781076', name: 'JavaScript' },
  { id: '6003456677429', name: 'Python (programming language)' },
  { id: '6003248041978', name: 'SaaS' },
  { id: '6003634619882', name: 'Automation' },
  { id: '6003285526350', name: 'Database' },
  { id: '6003384677846', name: 'Computer hardware' },
  { id: '6003352974666', name: 'Linux' },

  // Business & Management
  { id: '6003107902433', name: 'Business' },
  { id: '6003283132653', name: 'Entrepreneurship' },
  { id: '6003225077729', name: 'Small business' },
  { id: '6003664185178', name: 'Management' },
  { id: '6003384992834', name: 'Marketing' },
  { id: '6003397425735', name: 'Digital marketing' },
  { id: '6003177498510', name: 'Social media marketing' },
  { id: '6003315590069', name: 'Content marketing' },
  { id: '6003260826498', name: 'Email marketing' },
  { id: '6003337531798', name: 'Search engine optimization' },
  { id: '6003278028870', name: 'Online advertising' },
  { id: '6003277908530', name: 'E-commerce' },
  { id: '6003196979773', name: 'Business administration' },
  { id: '6003629489848', name: 'Human resource management' },
  { id: '6003106866003', name: 'Sales' },
  { id: '6003349243471', name: 'Customer relationship management' },
  { id: '6003110665486', name: 'Project management' },
  { id: '6003633200867', name: 'Supply chain management' },
  { id: '6003172737306', name: 'Startup company' },
  { id: '6003232826780', name: 'Leadership' },

  // Construction & Engineering
  { id: '6003370250981', name: 'Construction' },
  { id: '6003505062080', name: 'Civil engineering' },
  { id: '6003264681960', name: 'Architecture' },
  { id: '6003297593272', name: 'Building' },
  { id: '6003283286289', name: 'Construction equipment' },
  { id: '6003171329989', name: 'Real estate development' },
  { id: '6003504785081', name: 'Structural engineering' },
  { id: '6003648843455', name: 'Building information modeling' },
  { id: '6003310922988', name: 'Interior design' },
  { id: '6003227540810', name: 'Landscaping' },

  // Legal
  { id: '6003177642860', name: 'Law' },
  { id: '6003168297483', name: 'Lawyer' },
  { id: '6003387969437', name: 'Legal services' },
  { id: '6003109478898', name: 'Contract law' },
  { id: '6003231503181', name: 'Corporate law' },
  { id: '6003172137126', name: 'Intellectual property' },
  { id: '6003380826137', name: 'Patent' },
  { id: '6003178714263', name: 'Compliance (regulation)' },

  // Medical & Healthcare
  { id: '6003155461950', name: 'Medicine' },
  { id: '6003218986764', name: 'Health care' },
  { id: '6003270684730', name: 'Nursing' },
  { id: '6003346780996', name: 'Public health' },
  { id: '6003267925413', name: 'Pharmacy' },
  { id: '6003505563078', name: 'Dentistry' },
  { id: '6003209078861', name: 'Medical device' },
  { id: '6003119820350', name: 'Hospital' },
  { id: '6003143372429', name: 'Mental health' },
  { id: '6003208217230', name: 'Physical therapy' },

  // Finance & Accounting
  { id: '6003107405747', name: 'Finance' },
  { id: '6003245989270', name: 'Accounting' },
  { id: '6003342550669', name: 'Investment' },
  { id: '6003365674062', name: 'Banking' },
  { id: '6003121506100', name: 'Insurance' },
  { id: '6003168177851', name: 'Tax preparation' },
  { id: '6003107796733', name: 'Financial services' },
  { id: '6003227783622', name: 'Bookkeeping' },
  { id: '6003190379305', name: 'Cryptocurrency' },
  { id: '6003497395693', name: 'Stock market' },

  // Education
  { id: '6003160344551', name: 'Education' },
  { id: '6003232049113', name: 'Higher education' },
  { id: '6003306001782', name: 'Online education' },
  { id: '6003316028403', name: 'E-learning' },
  { id: '6003139667478', name: 'Professional development' },
  { id: '6003225499149', name: 'Training' },
  { id: '6003172036429', name: 'Teaching' },
  { id: '6003108710989', name: 'University' },
  { id: '6003277987629', name: 'Distance education' },
  { id: '6003109505998', name: 'Student' },

  // Real Estate
  { id: '6003101068074', name: 'Real estate' },
  { id: '6003385113099', name: 'Property management' },
  { id: '6003633503063', name: 'Real estate agent' },
  { id: '6003289024029', name: 'Mortgage loan' },
  { id: '6003171329989', name: 'Real estate investing' },
  { id: '6003240131781', name: 'Commercial property' },

  // Design & Creative
  { id: '6003397425735', name: 'Graphic design' },
  { id: '6003231929359', name: 'Photography' },
  { id: '6003284271458', name: 'Video production' },
  { id: '6003263741870', name: 'Web design' },
  { id: '6003506369981', name: 'User experience design' },
  { id: '6003348713600', name: 'Adobe Photoshop' },
  { id: '6003102987225', name: 'Adobe Illustrator' },
  { id: '6003503529783', name: '3D modeling' },
  { id: '6003372044591', name: 'Animation' },
  { id: '6003141610851', name: 'Film production' },

  // Manufacturing & Industry
  { id: '6003504993882', name: 'Manufacturing' },
  { id: '6003106470489', name: 'Engineering' },
  { id: '6003260498104', name: 'Industrial engineering' },
  { id: '6003497891894', name: 'Quality control' },
  { id: '6003505159880', name: 'Supply chain' },
  { id: '6003348534001', name: 'Logistics' },
  { id: '6003142740652', name: 'Warehouse' },
  { id: '6003505061081', name: 'Mechanical engineering' },
  { id: '6003385909098', name: 'Electrical engineering' },
  { id: '6003505159279', name: 'Chemical engineering' },

  // Government & Non-Profit
  { id: '6003177948960', name: 'Government' },
  { id: '6003177330267', name: 'Non-profit organization' },
  { id: '6003282540497', name: 'Politics' },
  { id: '6003349030673', name: 'Public administration' },
  { id: '6003384250044', name: 'Volunteering' },

  // Food & Hospitality
  { id: '6003384015673', name: 'Restaurant' },
  { id: '6003637284627', name: 'Food industry' },
  { id: '6003113476756', name: 'Cooking' },
  { id: '6003102710870', name: 'Hotels' },
  { id: '6003349442268', name: 'Catering' },

  // Transportation & Logistics
  { id: '6003504937083', name: 'Transportation' },
  { id: '6003133580699', name: 'Shipping' },
  { id: '6003505270878', name: 'Trucking' },
  { id: '6003629399047', name: 'Fleet management' },
  { id: '6003143580430', name: 'Aviation' },

  // Energy & Environment
  { id: '6003106768093', name: 'Renewable energy' },
  { id: '6003102591069', name: 'Solar energy' },
  { id: '6003154724952', name: 'Environmental science' },
  { id: '6003505455878', name: 'Oil and gas industry' },
  { id: '6003350166873', name: 'Sustainability' },

  // Media & Entertainment
  { id: '6003505057280', name: 'Media' },
  { id: '6003384891245', name: 'Publishing' },
  { id: '6003348906198', name: 'Journalism' },
  { id: '6003103085670', name: 'Music' },
  { id: '6003505056281', name: 'Gaming' },

  // Agriculture
  { id: '6003131614987', name: 'Agriculture' },
  { id: '6003348513602', name: 'Farming' },
  { id: '6003505160079', name: 'Agribusiness' },
  { id: '6003505058479', name: 'Horticulture' },

  // Retail & Consumer
  { id: '6003505261079', name: 'Retail' },
  { id: '6003284679257', name: 'Shopping' },
  { id: '6003505362078', name: 'Consumer electronics' },
  { id: '6003377065037', name: 'Fashion' },

  // Telecom
  { id: '6003505163878', name: 'Telecommunications' },
  { id: '6003384574444', name: 'Wireless' },
  { id: '6003349343271', name: 'Internet' },

  // Consulting & Professional Services
  { id: '6003505267878', name: 'Consulting' },
  { id: '6003384891643', name: 'Business consulting' },
  { id: '6003110360287', name: 'Freelance' },
  { id: '6003385607897', name: 'Outsourcing' },

  // Document & File Management (directly relevant to renamed.to)
  { id: '6003384888246', name: 'Document management system' },
  { id: '6003505168077', name: 'Data management' },
  { id: '6003348713800', name: 'Microsoft Office' },
  { id: '6003505068278', name: 'Google Workspace' },
  { id: '6003283935510', name: 'Dropbox' },
  { id: '6003505267279', name: 'Microsoft OneDrive' },
  { id: '6003505166478', name: 'Google Drive' },
  { id: '6003172034030', name: 'Productivity' },
  { id: '6003207646248', name: 'Organization' },

  // Fitness & Wellness
  { id: '6003384892044', name: 'Fitness' },
  { id: '6003384893443', name: 'Yoga' },
  { id: '6003505169276', name: 'Wellness' },
  { id: '6003505170475', name: 'Nutrition' },
  { id: '6003384894842', name: 'Gym' },

  // Automotive
  { id: '6003384380036', name: 'Automobile' },
  { id: '6003505171674', name: 'Automotive industry' },
  { id: '6003349544470', name: 'Electric vehicle' },

  // Science & Research
  { id: '6003173131527', name: 'Science' },
  { id: '6003348915797', name: 'Research' },
  { id: '6003349645869', name: 'Biotechnology' },
  { id: '6003505173072', name: 'Nanotechnology' },
  { id: '6003267125614', name: 'Physics' },
]

// ─── Lookup Index ──────────────────────────────────────────
// Case-insensitive map for fast lookups

const INTERESTS_BY_KEY = new Map<string, CatalogEntry>(
  CATALOG.map(entry => [entry.name.toLowerCase(), entry]),
)

/** Get all catalog entries (for autocomplete/listing) */
export function allInterests(): readonly CatalogEntry[] {
  return CATALOG
}
