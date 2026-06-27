// test-race.js
// Step 1: Hold 19 of 20 Student tickets to leave exactly 1 available
// Step 2: Fire 2 concurrent requests for that last ticket
// Expected: exactly one 201, one 400

const BASE = process.env.NEXT_PUBLIC_HOST;
const TIER = 'tier_002_b';
const EVENT = 'evt_002';

async function setup() {
  const res = await fetch(`${BASE}/api/events/${EVENT}/holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier_id: TIER, quantity: 19 }),
  });
  const data = await res.json();
  console.log('Setup (hold 19 tickets):', res.status, data);
  if (res.status !== 201) {
    console.error('Setup failed. Make sure DB is seeded and no existing holds.');
    process.exit(1);
  }
}

async function holdRequest(label) {
  const res = await fetch(`${BASE}/api/events/${EVENT}/holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier_id: TIER, quantity: 1 }),
  });
  const data = await res.json();
  console.log(`${label}: ${res.status}`, data);
  return res.status;
}

async function main() {
  await setup();

  console.log('\nFiring 2 concurrent requests for the last ticket...\n');
  const results = await Promise.all([
    holdRequest('Request A'),
    holdRequest('Request B'),
  ]);

  const successes = results.filter((s) => s === 201).length;
  const failures = results.filter((s) => s === 400).length;

  console.log(`\n--- Result: ${successes} succeeded, ${failures} failed ---`);
  if (successes === 1 && failures === 1) {
    console.log('✅ PASS: No overselling. Race condition handled correctly.');
  } else {
    console.log('❌ FAIL: Expected exactly 1 success and 1 failure.');
  }
}

main();
