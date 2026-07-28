// Customer category taxonomy used for classification, dashboard tabs and reports.
export const CATEGORIES = {
  COMPANY: 'Company',
  INDIVIDUAL: 'Individual',
  PORTAL: 'Portal',
  TRAVEL: 'Travel',
  UNCLASSIFIED: 'Unclassified',
};

export const CATEGORY_TABS = [
  { key: 'ALL', label: 'All Bills', value: null },
  { key: 'COMPANY', label: 'Company', value: CATEGORIES.COMPANY },
  { key: 'INDIVIDUAL', label: 'Individual', value: CATEGORIES.INDIVIDUAL },
  { key: 'PORTAL', label: 'Portals', value: CATEGORIES.PORTAL },
  { key: 'TRAVEL', label: 'Travels', value: CATEGORIES.TRAVEL },
  { key: 'UNCLASSIFIED', label: 'Unclassified', value: CATEGORIES.UNCLASSIFIED },
];

// Seed data used the first time the Customer Master is empty, matching the
// well-known portals/travel agencies called out in the spec. Admins can edit
// or remove these from Customers afterward — it is not hardcoded logic.
export const SEED_CUSTOMERS = [
  { name: 'Booking.com', category: CATEGORIES.PORTAL },
  { name: 'Agoda', category: CATEGORIES.PORTAL },
  { name: 'Goibibo', category: CATEGORIES.PORTAL },
  { name: 'MakeMyTrip', category: CATEGORIES.PORTAL },
  { name: 'Expedia', category: CATEGORIES.PORTAL },
  { name: 'EaseMyTrip', category: CATEGORIES.PORTAL },
  { name: 'SRS Travels', category: CATEGORIES.TRAVEL },
  { name: 'Parveen Travels', category: CATEGORIES.TRAVEL },
  { name: 'Royal Travels', category: CATEGORIES.TRAVEL },
];

// Hotel-internal billing departments — the "Department" column on the FO
// Cashier Report (Front Office, Restaurant, etc.), unrelated to customer
// category. Configurable by Administrators under Settings.
export const SEED_HOTEL_DEPARTMENTS = [
  'Front Office',
  'Restaurant',
  'Bar',
  'Room Service',
  'Banquet',
  'Housekeeping',
  'Spa',
  'Laundry',
  'Transport',
  'Other',
];

export const INVOICE_STATUS = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
};

export const PAYMENT_MODES = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'Card', 'Credit Card', 'Razorpay', 'Cheque', 'Cash', 'Cash Deposit', 'Other'];
