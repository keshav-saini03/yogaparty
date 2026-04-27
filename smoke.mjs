// End-to-end smoke for Plan 02-04 Task 3
// Drives a real Chromium browser through the funnel and verifies via Supabase REST.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

// Load .env.local
const envText = readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
// Verification uses the service-role key because RLS is enabled on the live
// project and anon SELECT is blocked. The action under test uses service-role
// internally (see app/actions/signup.ts deviation note); the smoke just needs
// read access to assert the inserts landed.
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`REST ${path} ${res.status}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

async function getSignupCount() {
  const rows = await rest('/signups?select=id', { headers: { Prefer: 'count=exact' } });
  return rows.length;
}

async function getSignupByPhone(phone) {
  const rows = await rest(`/signups?phone=eq.${encodeURIComponent(phone)}&select=*`);
  return rows[0] || null;
}

const results = [];
function record(num, check, expected, actual, verdict) {
  results.push({ num, check, expected, actual, verdict });
  console.log(`[${verdict}] ${num} ${check}\n   expected: ${expected}\n   actual:   ${actual}`);
}

const ts = Date.now();
const last4 = String(ts).slice(-4);
const phone1 = `9999999${last4}`;       // step 4 — successful signup
const phone2 = phone1;                   // step 7 — duplicate
const phone3 = `8888888${last4}`;        // step 8 — referral attribution
const phone4 = `7777777${last4}`;        // step 9 — international (+1)
const phone5 = `6666666${last4}`;        // step 10 — city tampering

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

let createdRoomUrl = null;
let createdRowId = null;

try {
  // === Step 4: Successful signup ===
  const preCount = await getSignupCount();
  await page.goto('http://localhost:3000/signup', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="name"]', 'Smoke Test');
  await page.selectOption('select[name="country_code"]', '+91');
  await page.fill('input[name="phone"]', phone1);

  // Verify static city display present, no editable city input
  const cityText = await page.locator('text=/Joining from/i').first().innerText();
  const hasCityInput = await page.locator('input[name="city"], input[name="detected_city"]').count();
  record(
    '4a',
    'Static city display visible, no city input',
    'text "Joining from..." present + 0 city inputs',
    `text="${cityText}", inputs=${hasCityInput}`,
    cityText && hasCityInput === 0 ? 'PASS' : 'FAIL'
  );

  // Submit
  const submitPromise = page.waitForURL(/\/room\//, { timeout: 15000 });
  await page.click('button[type="submit"]');
  await submitPromise;
  createdRoomUrl = page.url();
  const m = createdRoomUrl.match(/\/room\/([0-9a-f-]+)/);
  createdRowId = m ? m[1] : null;
  record(
    '4',
    'Successful signup redirects to /room/<uuid>',
    'URL matches /room/<uuid>',
    createdRoomUrl,
    createdRowId ? 'PASS' : 'FAIL'
  );

  // === Step 5: Verify row in DB ===
  const row1 = await getSignupByPhone(phone1);
  record(
    '5',
    'Row inserted with expected fields',
    `name=Smoke Test, phone=${phone1}, country_code=+91`,
    row1
      ? `name=${row1.name}, phone=${row1.phone}, country_code=${row1.country_code}, city=${row1.city}, referrer_id=${row1.referrer_id}`
      : 'NULL row',
    row1 && row1.name === 'Smoke Test' && row1.phone === phone1 && row1.country_code === '+91'
      ? 'PASS'
      : 'FAIL'
  );

  // === Step 6: Placeholder room renders ===
  const roomResp = await fetch(createdRoomUrl);
  const roomHtml = await roomResp.text();
  record(
    '6',
    'Placeholder room returns 200 + content',
    'HTTP 200, body contains "You\'re in"',
    `${roomResp.status}, contains="${/You['\u2019]re in/.test(roomHtml)}"`,
    roomResp.status === 200 && /You['\u2019]re in/.test(roomHtml) ? 'PASS' : 'FAIL'
  );

  // === Step 7: Duplicate phone shows friendly error ===
  await page.goto('http://localhost:3000/signup', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="name"]', 'Smoke Dup');
  await page.selectOption('select[name="country_code"]', '+91');
  await page.fill('input[name="phone"]', phone2);
  await page.click('button[type="submit"]');
  // wait for either alert or url change
  await page.waitForTimeout(3000);
  const dupUrl = page.url();
  const errEl = await page.locator('[role="alert"]').first();
  const errText = (await errEl.count()) ? await errEl.innerText() : '';
  const dupRows = await rest(
    `/signups?phone=eq.${encodeURIComponent(phone2)}&select=id`
  );
  record(
    '7',
    'Duplicate phone: stays on /signup, verbatim error, no second row',
    'on /signup, error="This number is already in! Check your messages — you\'re already part of YogaParty.", 1 row',
    `url=${dupUrl}, error="${errText}", rows=${dupRows.length}`,
    /\/signup/.test(dupUrl) &&
      errText.includes("This number is already in!") &&
      errText.includes("you're already part of YogaParty") &&
      dupRows.length === 1
      ? 'PASS'
      : 'FAIL'
  );

  // === Step 8: Referral attribution ===
  const REF = createdRowId;
  await page.goto(`http://localhost:3000/?ref=${REF}`, { waitUntil: 'domcontentloaded' });
  // Wait for ReferralCapture useEffect
  await page.waitForTimeout(500);
  const ypRef = await page.evaluate(() => localStorage.getItem('yp_ref'));
  const urlAfter = page.url();
  record(
    '8a',
    'localStorage.yp_ref set, URL has no ?ref',
    `yp_ref=${REF}, url has no ?ref`,
    `yp_ref=${ypRef}, url=${urlAfter}`,
    ypRef === REF && !urlAfter.includes('ref=') ? 'PASS' : 'FAIL'
  );
  await page.goto('http://localhost:3000/signup', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.fill('input[name="name"]', 'Smoke Ref');
  await page.selectOption('select[name="country_code"]', '+91');
  await page.fill('input[name="phone"]', phone3);
  const refSubmit = page.waitForURL(/\/room\//, { timeout: 15000 });
  await page.click('button[type="submit"]');
  await refSubmit;
  const refRow = await getSignupByPhone(phone3);
  record(
    '8b',
    'Referral row has referrer_id == REF',
    `referrer_id=${REF}`,
    refRow ? `referrer_id=${refRow.referrer_id}` : 'NULL row',
    refRow && refRow.referrer_id === REF ? 'PASS' : 'FAIL'
  );

  // === Step 9: International signup (+1) ===
  // Clear localStorage so this row doesn't carry the referrer
  const intlContext = await browser.newContext();
  const intlPage = await intlContext.newPage();
  await intlPage.goto('http://localhost:3000/signup', { waitUntil: 'domcontentloaded' });
  await intlPage.fill('input[name="name"]', 'Smoke Intl');
  await intlPage.selectOption('select[name="country_code"]', '+1');
  await intlPage.fill('input[name="phone"]', phone4);
  const intlSubmit = intlPage.waitForURL(/\/room\//, { timeout: 15000 });
  await intlPage.click('button[type="submit"]');
  await intlSubmit;
  const intlRow = await getSignupByPhone(phone4);
  record(
    '9',
    'International signup stores country_code=+1',
    'country_code=+1',
    intlRow ? `country_code=${intlRow.country_code}` : 'NULL row',
    intlRow && intlRow.country_code === '+1' ? 'PASS' : 'FAIL'
  );

  // === Step 10: City tampering ignored ===
  const tamperContext = await browser.newContext();
  const tamperPage = await tamperContext.newPage();
  await tamperPage.goto('http://localhost:3000/signup', { waitUntil: 'domcontentloaded' });
  await tamperPage.fill('input[name="name"]', 'Smoke Tamper');
  await tamperPage.selectOption('select[name="country_code"]', '+91');
  await tamperPage.fill('input[name="phone"]', phone5);
  // Inject malicious <input name="city"> via DOM
  await tamperPage.evaluate(() => {
    const form = document.querySelector('form');
    const evil = document.createElement('input');
    evil.name = 'city';
    evil.value = 'MaliciousCity';
    evil.type = 'text';
    form.appendChild(evil);
  });
  const tamperSubmit = tamperPage.waitForURL(/\/room\//, { timeout: 15000 });
  await tamperPage.click('button[type="submit"]');
  await tamperSubmit;
  const tamperRow = await getSignupByPhone(phone5);
  record(
    '10',
    'DevTools city injection ignored by action',
    'city != "MaliciousCity"',
    tamperRow ? `city=${tamperRow.city}` : 'NULL row',
    tamperRow && tamperRow.city !== 'MaliciousCity' ? 'PASS' : 'FAIL'
  );

  // Cleanup: delete test rows
  for (const ph of [phone1, phone3, phone4, phone5]) {
    try {
      await rest(`/signups?phone=eq.${encodeURIComponent(ph)}`, { method: 'DELETE' });
    } catch (e) {
      console.warn(`cleanup: could not delete ${ph}: ${e.message}`);
    }
  }
} catch (err) {
  console.error('SMOKE FAILED:', err);
  results.push({
    num: 'X',
    check: 'unhandled error',
    expected: 'no error',
    actual: err.message,
    verdict: 'FAIL',
  });
} finally {
  await browser.close();
}

// Print summary
console.log('\n=== RESULTS JSON ===');
console.log(JSON.stringify(results, null, 2));
const fails = results.filter((r) => r.verdict === 'FAIL').length;
console.log(`\n=== ${fails} FAIL / ${results.length} total ===`);
process.exit(fails > 0 ? 1 : 0);
