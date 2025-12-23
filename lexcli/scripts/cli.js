#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

// Config paths
const CONFIG_DIR = path.join(os.homedir(), '.lexcli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PATTERNS_FILE = path.join(CONFIG_DIR, 'patterns.json');

// API base URL
const API_BASE = 'https://api.lexoffice.io/v1';

// Rate limiting: 2 req/sec
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 550; // ms between requests

// ============== Config Management ==============

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  return { apiKey: null };
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadPatterns() {
  ensureConfigDir();
  if (fs.existsSync(PATTERNS_FILE)) {
    return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
  }
  return { counterparty: {}, keywords: {} };
}

function savePatterns(patterns) {
  ensureConfigDir();
  fs.writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2));
}

// ============== API Client ==============

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL - elapsed));
  }
  lastRequestTime = Date.now();
}

async function apiRequest(endpoint, options = {}) {
  const config = loadConfig();
  if (!config.apiKey) {
    console.error(('No API key configured. Run: lexcli accounts add'));
    process.exit(1);
  }

  await throttle();

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// ============== Prompt Helper ==============

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ============== Commands ==============

// --- Accounts ---
async function accountsList() {
  const config = loadConfig();
  if (config.apiKey) {
    console.log(('✓ API Key configured'));
    // Test the connection
    try {
      const profile = await apiRequest('/profile');
      console.log(`  Organization: ${profile.organizationId}`);
      console.log(`  Company: ${profile.companyName || 'N/A'}`);
    } catch (e) {
      console.log(('  (Could not verify connection)'));
    }
  } else {
    console.log(('No API key configured'));
    console.log('Run: node cli.js accounts add');
  }
}

async function accountsAdd() {
  console.log(('Add Lexoffice API Key'));
  console.log('Get your API key from: Lexoffice → Einstellungen → Öffentliche API\n');

  const apiKey = await prompt('API Key: ');
  if (!apiKey) {
    console.log(('No API key provided'));
    return;
  }

  // Test the key
  const config = { apiKey };
  saveConfig(config);

  try {
    const profile = await apiRequest('/profile');
    console.log((`\n✓ Connected to: ${profile.companyName || profile.organizationId}`));
  } catch (e) {
    console.log((`\n✗ Connection failed: ${e.message}`));
    saveConfig({ apiKey: null });
  }
}

async function accountsRemove() {
  saveConfig({ apiKey: null });
  console.log(('API key removed'));
}

// --- Categories ---
async function listCategories() {
  const categories = await apiRequest('/posting-categories');

  console.log(('\nBuchungskategorien (Posting Categories)\n'));
  console.log('ID'.padEnd(40) + 'Name'.padEnd(40) + 'Type');
  console.log('-'.repeat(100));

  for (const cat of categories) {
    console.log(
      cat.id.padEnd(40) +
      cat.name.padEnd(40) +
      cat.type
    );
  }
}

// Voucher types for API queries
const VOUCHER_TYPES = [
  'salesinvoice',
  'salescreditnote',
  'purchaseinvoice',
  'purchasecreditnote',
  'invoice',
  'creditnote',
  'downpaymentinvoice',
  'orderconfirmation',
  'quotation'
];

// --- Vouchers ---
async function listVouchers(options = {}) {
  const limit = options.limit || 50;
  const params = new URLSearchParams({
    size: limit.toString(),
    sort: 'voucherDate,DESC',
    voucherType: options.type || VOUCHER_TYPES.join(','),
    voucherStatus: options.status || 'open,paid,paidoff,voided,transferred,sepadebit',
  });

  const result = await apiRequest(`/voucherlist?${params}`);

  console.log((`\nVouchers (${result.totalElements} total)\n`));
  console.log(
    'Date'.padEnd(12) +
    'Type'.padEnd(15) +
    'Contact'.padEnd(30) +
    'Amount'.padStart(12) +
    '  Status'
  );
  console.log('-'.repeat(90));

  for (const v of result.content || []) {
    const amount = v.totalAmount?.toFixed(2) || '0.00';
    console.log(
      (v.voucherDate || '').substring(0, 10).padEnd(12) +
      (v.voucherType || '').padEnd(15) +
      (v.contactName || '-').substring(0, 28).padEnd(30) +
      amount.padStart(12) +
      '  ' + (v.voucherStatus || '')
    );
  }
}

// --- Open Transactions ---
async function listOpen(options = {}) {
  const params = new URLSearchParams({
    size: '100',
    sort: 'voucherDate,DESC',
    voucherStatus: 'open',
    voucherType: VOUCHER_TYPES.join(','),
  });

  const result = await apiRequest(`/voucherlist?${params}`);
  const openVouchers = result.content || [];

  if (openVouchers.length === 0) {
    console.log(('\n✓ Keine offenen Transaktionen gefunden\n'));
    return;
  }

  console.log((`\n${openVouchers.length} offene Transaktionen\n`));
  console.log(
    'Date'.padEnd(12) +
    'Type'.padEnd(12) +
    'Contact'.padEnd(35) +
    'Amount'.padStart(12) +
    '  ID'
  );
  console.log('-'.repeat(100));

  for (const v of openVouchers) {
    const amount = v.totalAmount?.toFixed(2) || '0.00';
    console.log(
      (v.voucherDate || '').substring(0, 10).padEnd(12) +
      (v.voucherType || '').padEnd(12) +
      (v.contactName || '-').substring(0, 33).padEnd(35) +
      amount.padStart(12) +
      '  ' + v.id
    );
  }
}

// --- Bookings by Account ---
async function listBookings(options = {}) {
  // First get all categories
  const categories = await apiRequest('/posting-categories');
  const categoryMap = new Map(categories.map(c => [c.id, c]));

  // Get vouchers
  const params = new URLSearchParams({
    size: '250',
    sort: 'voucherDate,DESC',
    voucherType: VOUCHER_TYPES.join(','),
    voucherStatus: 'open,paid,paidoff,voided,transferred,sepadebit',
  });

  const result = await apiRequest(`/voucherlist?${params}`);
  const vouchers = result.content || [];

  // Group by type (as proxy for category - full category info requires individual voucher fetch)
  const byType = new Map();

  for (const v of vouchers) {
    const type = v.voucherType || 'unknown';
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type).push(v);
  }

  console.log(('\nBookings by Type\n'));

  for (const [type, items] of byType) {
    const total = items.reduce((sum, v) => sum + (v.totalAmount || 0), 0);
    console.log((`\n${type}`) + ` (${items.length} items, Total: €${total.toFixed(2)})`);
    console.log('-'.repeat(80));

    for (const v of items.slice(0, 10)) {
      const amount = v.totalAmount?.toFixed(2) || '0.00';
      console.log(
        '  ' +
        (v.voucherDate || '').substring(0, 10).padEnd(12) +
        (v.contactName || '-').substring(0, 35).padEnd(37) +
        amount.padStart(10) + ' €'
      );
    }
    if (items.length > 10) {
      console.log((`  ... and ${items.length - 10} more`));
    }
  }
}

// --- Suggest Accounts ---
async function suggestAccounts(options = {}) {
  // Load learned patterns
  const patterns = loadPatterns();

  // Get open vouchers
  const params = new URLSearchParams({
    size: '100',
    voucherStatus: 'open',
    voucherType: VOUCHER_TYPES.join(','),
  });

  const result = await apiRequest(`/voucherlist?${params}`);
  const openVouchers = result.content || [];

  if (openVouchers.length === 0) {
    console.log(('\n✓ Keine offenen Transaktionen zum Kategorisieren\n'));
    return;
  }

  // Get categories
  const categories = await apiRequest('/posting-categories');

  // Common patterns for German bookkeeping
  const commonPatterns = {
    // === DRITTLAND SOFTWARE (USA, etc.) - §13b Reverse Charge ===
    'software_drittland': {
      name: 'Lizenzen §13b Drittland',
      categoryId: '6d575db0-74e8-433d-a986-27b76ea27f9e',
      keywords: [
        // AI & Dev Tools
        'anthropic', 'openai', 'cursor', 'github', 'vercel', 'netlify', 'heroku',
        'digitalocean', 'linode', 'vultr', 'cloudflare', 'stripe', 'twilio',
        // Productivity
        'notion', 'slack', 'zoom', 'loom', 'figma', 'miro', 'airtable',
        'typefully', 'buffer', 'hootsuite', 'mailchimp', 'convertkit',
        // Cloud
        'aws', 'amazon web services', 'google cloud', 'microsoft azure',
        // Media
        'spotify', 'netflix', 'adobe', 'canva',
        // Dev
        'jetbrains', 'sublime', 'postman', 'datadog', 'sentry',
        'openrouter', 'replicate', 'huggingface',
        // Other US
        'dropbox', 'evernote', '1password', 'lastpass', 'grammarly',
        'zapier', 'make.com', 'ifttt', 'calendly', 'typeform',
        'intercom', 'zendesk', 'freshdesk', 'hubspot', 'salesforce',
        'riverside', 'descript', 'otter.ai'
      ]
    },

    // === DEUTSCHE/EU SOFTWARE ===
    'software_de': {
      name: 'Software',
      categoryId: 'aa2d19a0-43e7-4330-a579-75c962254546',
      keywords: [
        'lexoffice', 'lexware', 'datev', 'sevdesk', 'fastbill', 'billomat',
        'personio', 'clockodo', 'toggl', 'harvest', 'mite',
        'sipgate', 'placetel', 'easybell',
        'ionos', 'strato', 'hetzner', 'netcup', 'hosteurope',
        'perspective', 'haufe'
      ]
    },

    // === STEUERN & FINANZAMT ===
    'finanzamt_ust': {
      name: 'Umsatzsteuer-Vorauszahlungen',
      categoryId: '222b6f72-fd92-11e1-a21f-0800200c9a66',
      keywords: ['finanzamt', 'umsatzsteuer', 'ust-vorauszahlung']
    },
    'finanzamt_est': {
      name: 'Einkommensteuer',
      categoryId: '222b6f70-fd92-11e1-a21f-0800200c9a66',
      keywords: ['einkommensteuer', 'est-vorauszahlung']
    },
    'finanzamt_gew': {
      name: 'Gewerbesteuer',
      categoryId: '222b6f71-fd92-11e1-a21f-0800200c9a66',
      keywords: ['gewerbesteuer']
    },

    // === VERSICHERUNGEN ===
    'versicherung': {
      name: 'Versicherungen (betrieblich)',
      categoryId: 'efa82f46-fd85-11e1-a21f-0800200c9a66',
      keywords: ['versicherung', 'insurance', 'hansemerkur', 'allianz', 'axa', 'huk', 'ergo']
    },
    'krankenkasse': {
      name: 'Sozialabgaben',
      categoryId: '5bcf2ff1-fd88-11e1-a21f-0800200c9a66',
      keywords: ['techniker krankenkasse', 'tk', 'aok', 'barmer', 'dak', 'ikk', 'knappschaft']
    },

    // === TELEKOMMUNIKATION ===
    'telefon': {
      name: 'Telekommunikation',
      categoryId: 'efa82f4b-fd85-11e1-a21f-0800200c9a66',
      keywords: ['telekom', 'vodafone', 'o2', 'telefonica', '1&1', 'congstar', 'aldi talk']
    },
    'internet': {
      name: 'Internet',
      categoryId: 'b3a1f841-fd90-11e1-a21f-0800200c9a66',
      keywords: ['internet', 'dsl', 'glasfaser', 'unitymedia', 'kabel deutschland']
    },

    // === BÜRO & MATERIAL ===
    'büro': {
      name: 'Bürobedarf',
      categoryId: '16d04a21-fd91-11e1-a21f-0800200c9a66',
      keywords: ['büro', 'office depot', 'staples', 'viking', 'schreibwaren']
    },
    'amazon': {
      name: 'Anschaffungen',
      categoryId: '16d04a20-fd91-11e1-a21f-0800200c9a66',
      keywords: ['amazon']
    },

    // === REISEN ===
    'reise_bahn': {
      name: 'Bahn-/Flugticket, Mietwagen',
      categoryId: 'f9f05690-fd89-11e1-a21f-0800200c9a66',
      keywords: ['deutsche bahn', 'db ', 'lufthansa', 'eurowings', 'ryanair', 'sixt', 'europcar']
    },
    'reise_hotel': {
      name: 'Übernachtungskosten',
      categoryId: 'f9f05694-fd89-11e1-a21f-0800200c9a66',
      keywords: ['hotel', 'booking.com', 'airbnb', 'hrs', 'motel', 'hostel']
    },
    'reise_taxi': {
      name: 'Taxi',
      categoryId: 'f9f05693-fd89-11e1-a21f-0800200c9a66',
      keywords: ['taxi', 'uber', 'bolt', 'freenow', 'mytaxi']
    },

    // === BANK ===
    'bank': {
      name: 'Kontoführung/Kartengebühr',
      categoryId: '16d04a23-fd91-11e1-a21f-0800200c9a66',
      keywords: ['kontoführung', 'kartengebühr', 'bankgebühr', 'n26', 'commerzbank', 'sparkasse', 'volksbank']
    },

    // === BERATUNG ===
    'steuerberater': {
      name: 'Steuerberater',
      categoryId: 'f48154a1-fd90-11e1-a21f-0800200c9a66',
      keywords: ['steuerberater', 'steuerkanzlei', 'tax', 'gädigk', 'bödecker']
    },
    'rechtsanwalt': {
      name: 'Rechtsanwalt',
      categoryId: 'f48154a0-fd90-11e1-a21f-0800200c9a66',
      keywords: ['rechtsanwalt', 'anwalt', 'kanzlei', 'law']
    },

    // === PRIVAT ===
    'privat': {
      name: 'Privatentnahmen',
      categoryId: '16d04a25-fd91-11e1-a21f-0800200c9a66',
      keywords: ['privatentnahme', 'privat']
    }
  };

  console.log((`\n${openVouchers.length} offene Transaktionen mit Vorschlägen\n`));

  for (const v of openVouchers) {
    const contact = (v.contactName || '').toLowerCase();
    let suggestion = null;
    let confidence = 'low';

    // Check learned patterns first
    if (patterns.counterparty[contact]) {
      suggestion = patterns.counterparty[contact];
      confidence = 'high';
    } else {
      // Check common patterns
      for (const [key, pattern] of Object.entries(commonPatterns)) {
        if (pattern.keywords.some(kw => contact.includes(kw))) {
          suggestion = pattern.name;
          confidence = 'medium';
          break;
        }
      }
    }

    const amount = v.totalAmount?.toFixed(2) || '0.00';
    const suggestionText = suggestion
      ? (`→ ${suggestion}`) + (` (${confidence})`)
      : ('→ ?');

    console.log(
      (v.voucherDate || '').substring(0, 10).padEnd(12) +
      (v.contactName || '-').substring(0, 30).padEnd(32) +
      amount.padStart(10) + ' €  ' +
      suggestionText
    );
  }

  console.log(('\nConfidence: high = learned pattern, medium = keyword match, low = no match'));
}

// --- Search ---
async function searchVouchers(query, options = {}) {
  const params = new URLSearchParams({
    size: '100',
    sort: 'voucherDate,DESC',
    voucherType: VOUCHER_TYPES.join(','),
    voucherStatus: 'open,paid,paidoff,voided,transferred,sepadebit',
  });

  const result = await apiRequest(`/voucherlist?${params}`);
  const vouchers = result.content || [];

  const queryLower = query.toLowerCase();
  const matches = vouchers.filter(v =>
    (v.contactName || '').toLowerCase().includes(queryLower) ||
    (v.voucherNumber || '').toLowerCase().includes(queryLower)
  );

  if (matches.length === 0) {
    console.log((`\nKeine Treffer für "${query}"\n`));
    return;
  }

  console.log((`\n${matches.length} Treffer für "${query}"\n`));
  console.log(
    'Date'.padEnd(12) +
    'Type'.padEnd(12) +
    'Contact'.padEnd(35) +
    'Amount'.padStart(12) +
    '  Status'
  );
  console.log('-'.repeat(90));

  for (const v of matches) {
    const amount = v.totalAmount?.toFixed(2) || '0.00';
    console.log(
      (v.voucherDate || '').substring(0, 10).padEnd(12) +
      (v.voucherType || '').padEnd(12) +
      (v.contactName || '-').substring(0, 33).padEnd(35) +
      amount.padStart(12) +
      '  ' + (v.voucherStatus || '')
    );
  }
}

// --- Voucher Details ---
async function showVoucher(id) {
  // Try different endpoints based on voucher type
  let voucher;

  // First get from voucherlist to know the type
  const listResult = await apiRequest(`/voucherlist?voucherId=${id}`);

  if (!listResult.content || listResult.content.length === 0) {
    console.log((`Voucher ${id} not found`));
    return;
  }

  const summary = listResult.content[0];

  console.log(('\nVoucher Details\n'));
  console.log(JSON.stringify(summary, null, 2));
}

// --- Contacts ---
async function listContacts(options = {}) {
  const limit = options.limit || 50;
  const params = new URLSearchParams({
    size: limit.toString(),
  });

  const result = await apiRequest(`/contacts?${params}`);

  console.log((`\nContacts (${result.totalElements} total)\n`));
  console.log(
    'Name'.padEnd(40) +
    'Type'.padEnd(15) +
    'ID'
  );
  console.log('-'.repeat(90));

  for (const c of result.content || []) {
    const name = c.company?.name ||
                 `${c.person?.firstName || ''} ${c.person?.lastName || ''}`.trim() ||
                 '-';
    const type = c.roles?.customer ? 'Customer' : c.roles?.vendor ? 'Vendor' : '-';
    console.log(
      name.substring(0, 38).padEnd(40) +
      type.padEnd(15) +
      c.id
    );
  }
}

// ============== CLI Router ==============

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    return;
  }

  const command = args[0];
  const subcommand = args[1];

  // Parse options
  const options = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--status' && args[i + 1]) {
      options.status = args[i + 1];
      i++;
    } else if (args[i] === '--from' && args[i + 1]) {
      options.from = args[i + 1];
      i++;
    } else if (args[i] === '--to' && args[i + 1]) {
      options.to = args[i + 1];
      i++;
    } else if (args[i] === '--account' && args[i + 1]) {
      options.account = args[i + 1];
      i++;
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (args[i] === '--verbose') {
      options.verbose = true;
    }
  }

  try {
    switch (command) {
      case 'accounts':
        if (subcommand === 'list' || !subcommand) await accountsList();
        else if (subcommand === 'add') await accountsAdd();
        else if (subcommand === 'remove') await accountsRemove();
        else showHelp();
        break;

      case 'categories':
        await listCategories();
        break;

      case 'vouchers':
        await listVouchers(options);
        break;

      case 'open':
        await listOpen(options);
        break;

      case 'bookings':
        await listBookings(options);
        break;

      case 'suggest':
        await suggestAccounts(options);
        break;

      case 'search':
        if (!subcommand) {
          console.log(('Usage: search <query>'));
        } else {
          await searchVouchers(subcommand, options);
        }
        break;

      case 'voucher':
        if (!subcommand) {
          console.log(('Usage: voucher <id>'));
        } else {
          await showVoucher(subcommand);
        }
        break;

      case 'contacts':
        await listContacts(options);
        break;

      case 'help':
      default:
        showHelp();
    }
  } catch (error) {
    console.error((`Error: ${error.message}`));
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function showHelp() {
  console.log('lexcli <command> [options]\nCommands: accounts, categories, vouchers, open, bookings, suggest, search, voucher, contacts');
}

main();
