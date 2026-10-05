const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const path = require('node:path');
const file = path.resolve(__dirname, '../lib/date-time.ts');
const loaded = new Module(file, module);
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { formatFixedOffset, toFixedOffsetInput, fromFixedOffsetInput } = loaded.exports;

test('fixed UTC-3 converts year boundaries and explicit offsets', () => {
  assert.equal(formatFixedOffset('2026-01-01T01:02:03.456Z'), '31/12/2025 22:02:03');
  assert.equal(formatFixedOffset('2026-01-01T01:02:03+02:00'), '31/12/2025 20:02:03');
  assert.equal(formatFixedOffset(null), 'Registro anterior');
  assert.equal(formatFixedOffset('2026-01-01T01:02:03'), 'Data indisponível');
});
test('editing retains the exact instant including milliseconds in different server timezones', () => {
  const originalTZ = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
      process.env.TZ = zone;
      for (const value of ['2026-01-01T01:02:03.456Z', '2024-02-29T03:00:00.001Z', '2026-07-10T15:00:00.000Z']) {
        assert.equal(fromFixedOffsetInput(toFixedOffsetInput(value)), value);
      }
      assert.equal(fromFixedOffsetInput('2026-12-31T23:30'), '2027-01-01T02:30:00.000Z');
    }
  } finally { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; }
});
test('rejects invalid calendar dates and accepts leap years and empty fields', () => {
  for (const value of ['2026-02-29T12:00', '2026-04-31T12:00', '2026-01-01T24:00', 'invalid']) assert.throws(() => fromFixedOffsetInput(value));
  assert.equal(fromFixedOffsetInput('2024-02-29T12:00'), '2024-02-29T15:00:00.000Z');
  assert.equal(fromFixedOffsetInput(''), undefined);
});
