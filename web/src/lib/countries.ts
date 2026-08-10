/**
 * ISO 3166-1 country normalisation — pure, no DB/Next imports.
 *
 * The curation template represents a country three inconsistent ways at once:
 * the READ ME says "use ISO 3166-1 alpha-2", `Company_ID` embeds alpha-3
 * (`SELL-IND-0001`), and every example row writes the full English name
 * ("India", "Germany", "USA"). Meanwhile `Organization.country` already stores
 * full names, and `catalog-queries.ts` filters with an exact `in` match.
 *
 * Importing "IN" for one supplier and "India" for another therefore splits the
 * country facet into two options that each show half the suppliers — a bug that
 * looks like missing data rather than a normalisation failure. So: everything
 * entering the system is canonicalised here, and the canonical form is the
 * **full English name**, because that is what the existing rows and the existing
 * filter rail already use. Changing that would mean migrating live data to fix a
 * problem we do not have.
 *
 * Unknown input resolves to `null` and never guesses. A row with an
 * unrecognised country is reported to the curator; inventing a country silently
 * files a supplier under a market they do not serve.
 */

export interface Country {
  /** ISO 3166-1 alpha-2, e.g. `IN`. */
  alpha2: string;
  /** ISO 3166-1 alpha-3, e.g. `IND`. Used by the `SELL-[ISO3]-[NNNN]` company ID. */
  alpha3: string;
  /** Canonical English name — the form stored in `Organization.country`. */
  name: string;
}

/**
 * `alpha2 alpha3 Name`, one per line. A table rather than three parallel maps so
 * a mistake is visible on one line instead of split across the file.
 */
const TABLE = `
AF AFG Afghanistan
AL ALB Albania
DZ DZA Algeria
AO AGO Angola
AR ARG Argentina
AM ARM Armenia
AU AUS Australia
AT AUT Austria
AZ AZE Azerbaijan
BH BHR Bahrain
BD BGD Bangladesh
BY BLR Belarus
BE BEL Belgium
BJ BEN Benin
BO BOL Bolivia
BA BIH Bosnia and Herzegovina
BW BWA Botswana
BR BRA Brazil
BN BRN Brunei
BG BGR Bulgaria
BF BFA Burkina Faso
KH KHM Cambodia
CM CMR Cameroon
CA CAN Canada
CL CHL Chile
CN CHN China
CO COL Colombia
CR CRI Costa Rica
HR HRV Croatia
CU CUB Cuba
CY CYP Cyprus
CZ CZE Czechia
DK DNK Denmark
DO DOM Dominican Republic
EC ECU Ecuador
EG EGY Egypt
SV SLV El Salvador
EE EST Estonia
ET ETH Ethiopia
FI FIN Finland
FR FRA France
GE GEO Georgia
DE DEU Germany
GH GHA Ghana
GR GRC Greece
GT GTM Guatemala
HN HND Honduras
HK HKG Hong Kong
HU HUN Hungary
IS ISL Iceland
IN IND India
ID IDN Indonesia
IR IRN Iran
IQ IRQ Iraq
IE IRL Ireland
IL ISR Israel
IT ITA Italy
CI CIV Ivory Coast
JM JAM Jamaica
JP JPN Japan
JO JOR Jordan
KZ KAZ Kazakhstan
KE KEN Kenya
KW KWT Kuwait
LV LVA Latvia
LB LBN Lebanon
LY LBY Libya
LT LTU Lithuania
LU LUX Luxembourg
MO MAC Macao
MG MDG Madagascar
MW MWI Malawi
MY MYS Malaysia
MT MLT Malta
MU MUS Mauritius
MX MEX Mexico
MD MDA Moldova
MN MNG Mongolia
ME MNE Montenegro
MA MAR Morocco
MZ MOZ Mozambique
MM MMR Myanmar
NA NAM Namibia
NP NPL Nepal
NL NLD Netherlands
NZ NZL New Zealand
NI NIC Nicaragua
NG NGA Nigeria
KP PRK North Korea
MK MKD North Macedonia
NO NOR Norway
OM OMN Oman
PK PAK Pakistan
PS PSE Palestine
PA PAN Panama
PY PRY Paraguay
PE PER Peru
PH PHL Philippines
PL POL Poland
PT PRT Portugal
PR PRI Puerto Rico
QA QAT Qatar
RO ROU Romania
RU RUS Russia
RW RWA Rwanda
SA SAU Saudi Arabia
SN SEN Senegal
RS SRB Serbia
SG SGP Singapore
SK SVK Slovakia
SI SVN Slovenia
ZA ZAF South Africa
KR KOR South Korea
ES ESP Spain
LK LKA Sri Lanka
SD SDN Sudan
SE SWE Sweden
CH CHE Switzerland
SY SYR Syria
TW TWN Taiwan
TZ TZA Tanzania
TH THA Thailand
TN TUN Tunisia
TR TUR Turkey
UG UGA Uganda
UA UKR Ukraine
AE ARE United Arab Emirates
GB GBR United Kingdom
US USA United States
UY URY Uruguay
UZ UZB Uzbekistan
VE VEN Venezuela
VN VNM Vietnam
YE YEM Yemen
ZM ZMB Zambia
ZW ZWE Zimbabwe
`;

export const COUNTRIES: readonly Country[] = TABLE.trim()
  .split('\n')
  .map((line) => {
    const [alpha2, alpha3, ...rest] = line.trim().split(' ');
    return { alpha2, alpha3, name: rest.join(' ') };
  });

/**
 * Spellings the template and public registers use that are not the canonical
 * name. Kept deliberately small — every entry here is a real string observed in
 * the template, a pharmacopoeial register or a trade dataset, not speculation.
 */
const ALIASES: Record<string, string> = {
  usa: 'US',
  'u.s.a.': 'US',
  'u.s.': 'US',
  'united states of america': 'US',
  america: 'US',
  uk: 'GB',
  'u.k.': 'GB',
  'great britain': 'GB',
  britain: 'GB',
  england: 'GB',
  uae: 'AE',
  'u.a.e.': 'AE',
  emirates: 'AE',
  'south korea': 'KR',
  'republic of korea': 'KR',
  'korea, republic of': 'KR',
  korea: 'KR',
  'north korea': 'KP',
  "people's republic of china": 'CN',
  prc: 'CN',
  'mainland china': 'CN',
  'russian federation': 'RU',
  'czech republic': 'CZ',
  holland: 'NL',
  'the netherlands': 'NL',
  "cote d'ivoire": 'CI',
  'côte d’ivoire': 'CI',
  'hong kong sar': 'HK',
  'viet nam': 'VN',
  'republic of ireland': 'IE',
  turkiye: 'TR',
  türkiye: 'TR',
  'kingdom of saudi arabia': 'SA',
  'chinese taipei': 'TW',
};

/** alpha-2 · alpha-3 · lowercased canonical name · alias → Country. */
const INDEX = new Map<string, Country>();
for (const c of COUNTRIES) {
  INDEX.set(c.alpha2.toLowerCase(), c);
  INDEX.set(c.alpha3.toLowerCase(), c);
  INDEX.set(c.name.toLowerCase(), c);
}
for (const [alias, alpha2] of Object.entries(ALIASES)) {
  const c = COUNTRIES.find((x) => x.alpha2 === alpha2);
  if (c) INDEX.set(alias, c);
}

/**
 * Resolves any of the three template representations — plus the observed
 * aliases — to one `Country`. Returns null for anything unrecognised; callers
 * report the cell rather than guessing.
 */
export function resolveCountry(raw: string | null | undefined): Country | null {
  const key = (raw ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!key) return null;
  return INDEX.get(key) ?? null;
}

/** The form stored in `Organization.country` / `Site.country`. */
export function canonicalCountryName(raw: string | null | undefined): string | null {
  return resolveCountry(raw)?.name ?? null;
}

/** The form embedded in a `SELL-[ISO3]-[NNNN]` company ID. */
export function countryAlpha3(raw: string | null | undefined): string | null {
  return resolveCountry(raw)?.alpha3 ?? null;
}
