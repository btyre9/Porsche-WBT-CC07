#!/usr/bin/env node
/**
 * sync-from-template.js
 *
 * Pulls template-managed files from the Porsche-WBT-Template repo into the
 * current module. Run this from within a module folder (e.g. Porsche-WBT-CC09)
 * to refresh the pipeline scripts, slide templates, design tokens, runtime,
 * shared SFX, and reference docs without touching per-module content.
 *
 * Direction: template → current module (one-way; never overwrites authored
 * storyboard, generated slides, VO mp3s, captions, or per-module images).
 *
 * Usage:
 *   node scripts/sync-from-template.js [--from <path>] [--dry-run] [--verbose]
 *
 *   --from <path>   Path to the template repo. Defaults to ../Porsche-WBT-Template.
 *   --dry-run       Show what would change without writing.
 *   --verbose       Print every file checked, not just changed ones.
 *
 * Counterpart: scripts/sync-template.js pushes module-side improvements back
 * upstream (module → template). Both scripts share the managed-paths list in
 * scripts/lib/template-paths.js.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// What flows from the template into the module — shared with sync-template.js
// (the module → template push) so both directions use one source of truth.
// Per-module content (course.md, generated slides, vo mp3s, captions, module
// images, course.data.json) is absent from the list and so is preserved.
// PLAYER_PATHS (player chrome + imsmanifest) sync only with --include-player.
const { SYNC_PATHS, PLAYER_PATHS } = require('./lib/template-paths');

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { from: '../Porsche-WBT-Template', dryRun: false, verbose: false, includePlayer: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from')           args.from = argv[++i];
    if (argv[i] === '--dry-run')        args.dryRun = true;
    if (argv[i] === '--verbose')        args.verbose = true;
    if (argv[i] === '--include-player') args.includePlayer = true;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

function filesEqual(a, b) {
  try {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    if (sa.size !== sb.size) return false;
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch (_) {
    return false;
  }
}

function copyFile(src, dest, dryRun) {
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function walkDir(srcDir, destDir, dryRun, state) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const srcChild  = path.join(srcDir,  entry.name);
    const destChild = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      walkDir(srcChild, destChild, dryRun, state);
    } else if (entry.isFile()) {
      processFile(srcChild, destChild, dryRun, state);
    }
  }
}

function processFile(src, dest, dryRun, state) {
  if (!fs.existsSync(src)) { state.missing.push(state.relPath(src)); return; }
  if (filesEqual(src, dest)) { state.unchanged++; if (state.verbose) console.log(`  same   ${state.relPath(dest)}`); return; }
  copyFile(src, dest, dryRun);
  state.changed.push(state.relPath(dest));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args     = parseArgs(process.argv.slice(2));
  const fromAbs  = path.resolve(args.from);
  const cwd      = process.cwd();

  if (!fs.existsSync(fromAbs)) {
    console.error(`Error: template directory not found: ${fromAbs}`);
    console.error('Pass --from <path> to point at the template repo.');
    process.exit(1);
  }
  if (path.resolve(fromAbs) === path.resolve(cwd)) {
    console.error('Error: --from path equals current directory. Run this from a module folder, not the template itself.');
    process.exit(1);
  }

  console.log(`Syncing template files`);
  console.log(`  from: ${fromAbs}`);
  console.log(`  to:   ${cwd}`);
  if (args.dryRun) console.log(`  mode: DRY RUN (no files will be written)`);
  console.log('─'.repeat(60));

  const state = {
    changed:   [],
    missing:   [],
    unchanged: 0,
    verbose:   args.verbose,
    relPath:   (p) => path.relative(cwd, p),
  };

  const allPaths = args.includePlayer
    ? SYNC_PATHS.concat(PLAYER_PATHS)
    : SYNC_PATHS;

  for (const rel of allPaths) {
    const src  = path.join(fromAbs, rel);
    const dest = path.join(cwd,     rel);

    if (!fs.existsSync(src)) {
      state.missing.push(rel);
      continue;
    }

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      walkDir(src, dest, args.dryRun, state);
    } else {
      processFile(src, dest, args.dryRun, state);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('');
  if (state.changed.length) {
    console.log(`Changed (${state.changed.length}):`);
    for (const p of state.changed) console.log(`  ${args.dryRun ? 'would copy' : 'wrote   '}  ${p}`);
  } else {
    console.log('No file changes needed — module is up to date with template.');
  }
  if (state.missing.length) {
    console.log('');
    console.log(`Missing in template (${state.missing.length}):`);
    for (const p of state.missing) console.log(`  ${p}`);
  }
  console.log('');
  console.log(`Unchanged: ${state.unchanged}  |  Changed: ${state.changed.length}  |  Missing: ${state.missing.length}`);

  // ── package.json comparison (script reports new template scripts) ──────
  const tplPkgPath = path.join(fromAbs, 'package.json');
  const modPkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(tplPkgPath) && fs.existsSync(modPkgPath)) {
    try {
      const tplPkg = JSON.parse(fs.readFileSync(tplPkgPath, 'utf8'));
      const modPkg = JSON.parse(fs.readFileSync(modPkgPath, 'utf8'));
      const newScripts = Object.keys(tplPkg.scripts || {}).filter(
        k => modPkg.scripts && !modPkg.scripts[k]
      );
      if (newScripts.length) {
        console.log('');
        console.log(`Template has ${newScripts.length} npm script(s) not present in your package.json:`);
        for (const k of newScripts) {
          console.log(`  "${k}": "${tplPkg.scripts[k]}"`);
        }
        console.log('Add these manually to your package.json "scripts" block to enable them.');
      }
    } catch (_) {
      // ignore json parse errors
    }
  }

  if (args.dryRun) {
    console.log('');
    console.log('(Dry run — re-run without --dry-run to apply.)');
  }
}

main();
