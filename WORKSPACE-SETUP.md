# Porsche-WBT Workspace — Organizing System

How the Porsche WBT projects are organized across machines (Windows laptop + Mac Studio).
Read this first when setting up a new machine or when something feels out of place.

## The rules (why this exists)

1. **One dedicated root per machine, OFF any cloud-sync drive.**
   - Windows: `C:\Porsche-WBT\`
   - Mac: `~/Porsche-WBT/`
   - **Never** put a live repo under OneDrive, iCloud Drive, or Google Drive (`G:\`).
     Cloud sync corrupts `.git` and silently deletes working files — it has bitten this
     project twice (OneDrive, then Google Drive on CC02). **Git is the backup/sync, not the drive.**

2. **Flat sibling layout.** The template sits *beside* the modules — the dashboard's
   New Module wizard and `sync-template`/`sync-from-template` resolve the template as a
   sibling folder named exactly `Porsche-WBT-Template`.

3. **Consistent names.** Folders are `Porsche-WBT-CC##` and `Porsche-WBT-Template`.
   No `_2`, no lowercase forks, no dated backups in the working root.

4. **One clone per repo per machine.** Your backup is the **git remote**, never a folder copy.

5. **GitHub (`btyre9`) is the canonical host.** All repos are **private**. GitLab
   (`gitlab.com/porsche-wbt`, `gitlab.com/digimotion` — also personal) is kept as a
   secondary mirror on some modules but is not the source of truth.

6. **Git is the cross-machine sync.** Same layout on both machines. `git pull` when you
   sit down; `git commit` + `git push` when you stop.

## Layout

```
Porsche-WBT/
  Porsche-WBT-Template/     # shared infra (scripts, templates, runtime, dashboard, docs)
  Porsche-WBT-CC02/         # module — uses Git LFS (~1.3 GB)
  Porsche-WBT-CC03/         # module (active branch: feature/slide-image-paste)
  Porsche-WBT-CC08/
  Porsche-WBT-CC09/         # module — uses Git LFS
  _archive/                 # retired/duplicate copies, deleted only after verification
```

## Repo map (folder → GitHub repo)

| Folder | GitHub (canonical, private) | Notes |
|--------|-----------------------------|-------|
| `Porsche-WBT-Template` | `btyre9/porsche-wbt-template` | branch `master` |
| `Porsche-WBT-CC03`     | `btyre9/porsche-wbt-cc03_2`  | active branch `feature/slide-image-paste` |
| `Porsche-WBT-CC02`     | `btyre9/porsche-wbt-cc02`    | **Git LFS** |
| `Porsche-WBT-CC08`     | `btyre9/porsche-wbt-cc08`    | (old public repo renamed `porsche-wbt-cc08-old`) |
| `Porsche-WBT-CC09`     | `btyre9/porsche-wbt-cc09`    | **Git LFS** |

## Set up a machine from scratch

Prereqs: **Node 18+**, **Git**, **Git LFS** (`git lfs install` — required for CC02/CC09).

```bash
# 1) Make the root (Mac shown; Windows: C:\Porsche-WBT\)
mkdir -p ~/Porsche-WBT && cd ~/Porsche-WBT

# 2) Clone the template + each module (canonical folder names)
git clone https://github.com/btyre9/porsche-wbt-template.git Porsche-WBT-Template
git clone -b feature/slide-image-paste https://github.com/btyre9/porsche-wbt-cc03_2.git Porsche-WBT-CC03
git clone https://github.com/btyre9/porsche-wbt-cc02.git Porsche-WBT-CC02   # large, LFS
git clone https://github.com/btyre9/porsche-wbt-cc08.git Porsche-WBT-CC08
git clone https://github.com/btyre9/porsche-wbt-cc09.git Porsche-WBT-CC09   # LFS

# 3) Install deps per repo you'll actually run (node_modules is NOT in git)
cd Porsche-WBT-CC03 && npm install        # repeat per module/template as needed

# 4) Secrets: each module needs its own .env (NOT in git) for voiceover
#    WELLSAID_API_KEY=...    (copy from your other machine or WellSaid account)
```

Run the dashboard from any module: `node scripts/dashboard-server.js` → http://localhost:8085/dashboard.html
(The wizard finds the template automatically because it's the sibling `Porsche-WBT-Template`.)

## Daily workflow

- **Start:** `git pull` in the module you're working on.
- **Stop:** `git commit` + `git push`. Commit often — the remote is your only real backup.
- **Improve shared tooling?** Make the change in the module, then
  `npm run sync-template -- --dry-run` → `npm run sync-template` to push it up to the template.

## Cleanup still pending (retire after verifying this layout works)

Old scattered local copies — verify `C:\Porsche-WBT\` works, then delete:
- `C:\Users\ALIBI8I\Documents\00-PROJECTS\` (porsche-wbt-cc03_2, porsche-wbt-template, CC02, Porsche-WBT-CC03, Porsche-WBT-CC08, WBT-CC09, porsche-wbt-cc09, wbt-template-local-backup-*)
- `C:\Projects\` (Porsche-WBT-CC03, -CC08, -Template, -Template - Copy)
- `C:\Users\ALIBI8I\Documents\Porsche-WBT-Template`, `Porsche-WBT-Project`, `Porsche-WBT-Project - BACKUP`
- `G:\My Drive\00-Projects\CC02` (the corrupted Google-Drive copy — safe to delete; it's on GitHub now)

Stale GitHub repos to delete/archive once happy:
- `btyre9/porsche-wbt-cc08-old`, `btyre9/WBT-CC09`, `btyre9/Porsche-WBT-CC03`, `btyre9/Porsche-WBT`
