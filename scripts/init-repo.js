#!/usr/bin/env node
/**
 * init-repo.js
 * Initializes the module folder as a git repo and makes the first commit.
 * Optionally adds a remote and pushes.
 *
 * Usage:
 *   npm run init-repo                                    # git init + add + commit (branch: main)
 *   npm run init-repo -- --branch master                 # use master instead
 *   npm run init-repo -- --message "Init from template"  # custom commit message
 *   npm run init-repo -- --remote git@github.com:org/repo.git           # add origin
 *   npm run init-repo -- --remote <url> --push                          # add origin and push
 *   npm run init-repo -- --dry-run                                      # preview only
 *
 * Safe to re-run: skips `git init` if .git exists, skips commit if there are
 * no staged changes, skips remote add if `origin` already exists.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { dryRun: false, push: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--branch')        args.branch  = argv[++i];
    else if (a === '--message')  args.message = argv[++i];
    else if (a === '--remote')   args.remote  = argv[++i];
    else if (a === '--push')     args.push    = true;
    else if (a === '--dry-run')  args.dryRun  = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`
init-repo — first-time git setup for a new module

Optional:
  --branch <name>     Initial branch name (default: main; common alt: master)
  --message <text>    Commit message (default: "Initial commit from template")
  --remote <url>      Add as 'origin' after the initial commit
  --push              Push -u origin <branch> (only valid with --remote)
  --dry-run           Print the commands that would run; don't execute them

Examples:
  npm run init-repo
  npm run init-repo -- --branch master
  npm run init-repo -- --remote git@github.com:porsche/wbt-cc09.git --push
`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) { usage(); process.exit(0); }
if (args.push && !args.remote) {
  console.error('Error: --push requires --remote <url>.');
  process.exit(1);
}

const BRANCH  = args.branch  || 'main';
const MESSAGE = args.message || 'Initial commit from template';
const dryRun  = args.dryRun;

function run(cmd, cmdArgs, opts = {}) {
  const display = `git ${[cmd, ...cmdArgs].join(' ')}`;
  if (dryRun) {
    console.log(`  WOULD  ${display}`);
    return '';
  }
  console.log(`  RUN    ${display}`);
  return execFileSync('git', [cmd, ...cmdArgs], {
    stdio: opts.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
}

function safeRun(cmd, cmdArgs) {
  try { return { ok: true, out: run(cmd, cmdArgs, { quiet: true }) }; }
  catch (err) { return { ok: false, err }; }
}

function gitOutput(cmdArgs) {
  try { return execFileSync('git', cmdArgs, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim(); }
  catch (_) { return ''; }
}

console.log(`\nInit repo${dryRun ? '  (dry run)' : ''}`);
console.log('─'.repeat(60));
console.log(`  branch:  ${BRANCH}`);
console.log(`  message: ${MESSAGE}`);
if (args.remote) console.log(`  remote:  ${args.remote}${args.push ? '  (will push)' : ''}`);
console.log('');

// 1. git init (skip if already a repo)
const isRepo = fs.existsSync(path.resolve('.git'));
if (isRepo) {
  console.log('  SKIP   git init  (.git already exists)');
} else {
  run('init', ['-b', BRANCH]);
}

// 2. If repo existed but branch name differs, rename current branch
if (isRepo && !dryRun) {
  const currentBranch = gitOutput(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (currentBranch && currentBranch !== BRANCH && currentBranch !== 'HEAD') {
    console.log(`         current branch is "${currentBranch}", not renaming (use \`git branch -m\` manually if intended)`);
  }
}

// 3. git add .
run('add', ['.']);

// 4. git commit — only if there's something staged
let didCommit = false;
if (dryRun) {
  console.log(`  WOULD  git commit -m "${MESSAGE}"`);
} else {
  const staged = gitOutput(['diff', '--cached', '--name-only']);
  if (!staged) {
    console.log('  SKIP   git commit  (nothing staged)');
  } else {
    run('commit', ['-m', MESSAGE]);
    didCommit = true;
  }
}

// 5. Remote setup (optional)
if (args.remote) {
  const existingRemote = dryRun ? '' : gitOutput(['remote', 'get-url', 'origin']);
  if (existingRemote) {
    console.log(`  SKIP   git remote add origin  (origin already set: ${existingRemote})`);
  } else {
    run('remote', ['add', 'origin', args.remote]);
  }

  if (args.push) {
    run('push', ['-u', 'origin', BRANCH]);
  } else {
    console.log(`  NOTE   remote added but NOT pushed. To push now:`);
    console.log(`         git push -u origin ${BRANCH}`);
  }
}

console.log('');
console.log(dryRun
  ? 'Dry run — no git commands were executed.'
  : (didCommit ? 'Done.' : 'Done (no new commit was needed).'));
console.log('');
