import { CATEGORIES } from '../constants/categories';

export function normalizeName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/[.,()'-]/g, ' ')
    .replace(/\b(pvt|private|ltd|limited|llp|inc|india)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches an FO Cashier Report company/guest name against the Customer
 * Master (by name or configured alias). Exact normalized match first, then a
 * containment match so "MakeMyTrip India Pvt Ltd" still resolves against a
 * master record of "MakeMyTrip". No match => Unclassified for manual review.
 */
export function matchCustomer(rawName, customerMasterList) {
  const needle = normalizeName(rawName);
  if (!needle) return null;

  for (const customer of customerMasterList) {
    if (normalizeName(customer.name) === needle) return customer;
    for (const alias of customer.aliases || []) {
      if (normalizeName(alias) === needle) return customer;
    }
  }

  for (const customer of customerMasterList) {
    const candidates = [customer.name, ...(customer.aliases || [])].map(normalizeName).filter(Boolean);
    if (candidates.some((c) => needle.includes(c) || c.includes(needle))) return customer;
  }

  return null;
}

export function classifyInvoiceRow(row, customerMasterList) {
  const nameToMatch = row.companyName?.trim() || row.guestName?.trim() || '';
  const match = matchCustomer(nameToMatch, customerMasterList);
  if (match) {
    return { customerId: match.id, category: match.category, customerName: match.name };
  }
  return { customerId: null, category: CATEGORIES.UNCLASSIFIED, customerName: nameToMatch || 'Unknown' };
}
