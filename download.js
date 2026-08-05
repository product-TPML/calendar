#!/usr/bin/env node
// Kannada calendar daily image downloader (Node 18+ built-ins only).
// Usage: node download.js [--year 2026] [--output data] [--delay-ms 0] [--force]

const fs = require('node:fs/promises');
const path = require('node:path');

const opt = { year: 2026, output: 'data', delay: 0, force: false };

const usage = () => console.log(`Usage: node download.js [options]

Downloads every daily image of a year from kannadacalendar.in into:
  ${path.join('data', '<year>', 'MM', 'DD-MM-YYYY.jpg')}

Options:
  --year N         year to download (default 2026)
  --output DIR     output root dir (default data)
  --delay-ms N     pause between requests, in ms (default 0)
  --force          re-download even if the file already exists
  -h, --help       show this help
`);

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') { usage(); process.exit(0); }
  if (a === '--force') { opt.force = true; continue; }
  if (a === '--year' || a === '--output' || a === '--delay-ms') {
    const v = args[++i];
    if (v === undefined) { console.error(`Missing value for ${a}`); process.exit(1); }
    if (a === '--year') opt.year = Number(v);
    else if (a === '--output') opt.output = v;
    else opt.delay = Number(v);
    continue;
  }
  console.error(`Unknown option: ${a}\n`);
  usage();
  process.exit(1);
}
if (!Number.isInteger(opt.year) || opt.year < 1) { console.error('--year must be a positive integer'); process.exit(1); }
if (!Number.isFinite(opt.delay) || opt.delay < 0) { console.error('--delay-ms must be a non-negative number'); process.exit(1); }

const pad = (n) => String(n).padStart(2, '0');

function* daysInYear(year) {
  for (let m = 1; m <= 12; m++) {
    const days = new Date(year, m, 0).getDate();
    for (let d = 1; d <= days; d++) yield `${pad(d)}-${pad(m)}-${year}`;
  }
}

async function downloadOne(file) {
  const url = `https://kannadacalendar.in/wp-content/kannada/daily/${opt.year}/${file.slice(3, 5)}/${file}.jpg`;
  const destDir = path.join(opt.output, String(opt.year), file.slice(3, 5)); // MM
  await fs.mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, `${file}.jpg`);
  if (!opt.force) {
    try { await fs.access(dest); return 'skip'; } catch { /* missing -> download */ }
  }
  const tmp = `${dest}.part`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
    if (opt.force) await fs.rm(dest, { force: true }); // rename can't overwrite on Windows
    await fs.rename(tmp, dest);
  } catch (e) {
    await fs.rm(tmp, { force: true }); // never leave a corrupt .part
    throw e;
  }
  return 'ok';
}

(async () => {
  let ok = 0, skip = 0, fail = 0;
  for (const file of daysInYear(opt.year)) {
    try {
      const r = await downloadOne(file);
      if (r === 'skip') skip++;
      else { ok++; process.stdout.write('.'); }
    } catch (e) {
      fail++;
      process.stdout.write('x');
      console.error(`  ${file}: ${e.message}`);
    }
    if (opt.delay) await new Promise((r) => setTimeout(r, opt.delay));
  }
  console.log(`\nDone: ${ok} downloaded, ${skip} skipped, ${fail} failed`);
  if (fail) process.exitCode = 1;
})();
