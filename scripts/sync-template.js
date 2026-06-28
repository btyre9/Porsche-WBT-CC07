#!/usr/bin/env node
/**
 * sync-template.js
 *
 * Pushes template-managed files from the CURRENT module back up to the
 * Porsche-WBT-Template repo. The counterpart of sync-from-template.js — run it
 * after improving shared infra (pipeline scripts, slide templates, runtime,
 * dashboard tools, shared CSS/icons/fonts/vendor, rules & reference docs) so the
 * improvement reaches every future module.
 *
 * Direction: current module → template (one-way). Only the shared files in
 * scripts/lib/template-paths.js are copied; per-module content (course.md,
 * generated slides, VO mp3s, captions, module images, course.data.json,
 * generated image-prompts) is never pushed. Player chrome (index.html,
 * player/index.html, imsmanifest.xml) is pushed only with --include-player.
 *
 * Usage:
 *   node scripts/sync-template.js [--to <path>] [--dry-run] [--verbose] [--include-player]
 *
 *   --to <path>        Path to the template repo. Defaults to ../Porsche-WBT-Template.
 *   --dry-run          Show what would change without writing.
 *   --verbose          Print every file checked, not just changed ones.
 *   --include-player   Also push course/index.html, player/index.html, imsmanifest.xml
 *                      (these carry per-module title/code — usually leave OFF).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { SYNC_PATHS, PLAYER_PATHS } = require('./lib/template-paths');

function parseArgs(argv) {
  const args = { to: '../Porsche-WBT-Template', dryRun: false, verbose: false, includePlayer: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--to')             args.to = argv[++i];
    if (argv[i] === '--dry-run')        args.dryRun = true;
    if (argv[i] === '--verbose')        args.verbose = true;
    if (argv[i] === '--include-player') args.includePlayer = true;
  }
  return args;
}

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

function processFile(src, dest, dryRun, state) {
  if (!fs.existsSync(src)) { state.missing.push(state.relPath(src)); return; }
  if (filesEqual(src, dest)) { state.unchanged++; if (state.verbose) console.log(`  same   ${state.relPath(dest)}`); return; }
  copyFile(src, dest, dryRun);
  state.changed.push(state.relPath(dest));
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

function main() {
  const args   = parseArgs(process.argv.slice(2));
  const toAbs  = path.resolve(args.to);
  const cwd    = process.cwd();

  if (!fs.existsSync(toAbs)) {
    console.error(`Error: template directory not found: ${toAbs}`);
    console.error('Pass --to <path> to point at the template repo.');
    process.exit(1);
  }
  if (path.resolve(toAbs) === path.resolve(cwd)) {
    console.error('Error: --to path equals current directory. Run this from a module folder, not the template itself.');
    process.exit(1);
  }

  console.log(`Pushing module files to template`);
  console.log(`  from: ${cwd}   (this module)`);
  console.log(`  to:   ${toAbs}`);
  if (args.dryRun) console.log(`  mode: DRY RUN (no files will be written)`);
  console.log('─'.repeat(60));

  const state = {
    changed:   [],
    missing:   [],   // listed in SYNC_PATHS but absent in THIS module (nothing to push)
    unchanged: 0,
    verbose:   args.verbose,
    relPath:   (p) => path.relative(cwd, p),
  };

  const allPaths = args.includePlayer ? SYNC_PATHS.concat(PLAYER_PATHS) : SYNC_PATHS;

  for (const rel of allPaths) {
    const src  = path.join(cwd,   rel);   // module is the source
    const dest = path.join(toAbs, rel);   // template is the destination
    if (!fs.existsSync(src)) { state.missing.push(rel); continue; }
    const stat = fs.statSync(src);
    if (stat.isDirectory()) walkDir(src, dest, args.dryRun, state);
    else processFile(src, dest, args.dryRun, state);
  }

  console.log('');
  if (state.changed.length) {
    console.log(`Changed in template (${state.changed.length}):`);
    for (const p of state.changed) console.log(`  ${args.dryRun ? 'would copy' : 'wrote   '}  ${p}`);
  } else {
    console.log('No file changes needed — template already matches this module.');
  }
  if (state.missing.length) {
    console.log('');
    console.log(`Listed but absent in this module (${state.missing.length}, nothing to push):`);
    for (const p of state.missing) console.log(`  ${p}`);
  }
  console.log('');
  console.log(`Unchanged: ${state.unchanged}  |  Changed: ${state.changed.length}  |  Missing: ${state.missing.length}`);

  // Report module npm scripts the template lacks (package.json isn't synced).
  const tplPkgPath = path.join(toAbs, 'package.json');
  const modPkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(tplPkgPath) && fs.existsSync(modPkgPath)) {
    try {
      const tplPkg = JSON.parse(fs.readFileSync(tplPkgPath, 'utf8'));
      const modPkg = JSON.parse(fs.readFileSync(modPkgPath, 'utf8'));
      const newScripts = Object.keys(modPkg.scripts || {}).filter(
        k => tplPkg.scripts && !tplPkg.scripts[k]
      );
      if (newScripts.length) {
        console.log('');
        console.log(`This module has ${newScripts.length} npm script(s) not present in the template's package.json:`);
        for (const k of newScripts) console.log(`  "${k}": "${modPkg.scripts[k]}"`);
        console.log("Add these manually to the template's package.json \"scripts\" block.");
      }
    } catch (_) { /* ignore json parse errors */ }
  }

  if (args.dryRun) {
    console.log('');
    console.log('(Dry run — re-run without --dry-run to apply.)');
  }
}

main();
