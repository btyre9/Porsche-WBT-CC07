# Working on a different machine — Porsche-WBT-CC07

This module does not use Git LFS.

how to produce the SCORM package for upload to the Porsche LMS.

## The one thing that will bite you: Git LFS

**CC02, CC05 and CC09 store their media in Git LFS.** Clone them without
`git-lfs` installed and you get 100-byte pointer stubs where the images, audio
and video should be. The build will still succeed and the zip will look
plausible — it will just be broken.

Install it **before** cloning:

```bash
brew install git-lfs && git lfs install
```

Already cloned without it? Fix in place:

```bash
git lfs install && git lfs pull
```

Check any clone for stubs — this must print `0`:

```bash
find course -type f -size -200c -exec grep -l "^version https://git-lfs" {} \; | wc -l
```

## Building a SCORM package

```bash
npm run package
```

Writes `output/<module>-scorm.zip`. No `npm install` needed — the packager uses
`adm-zip` when present and otherwise falls back to `python3`, so **node and
python3 are the only requirements**.

The zips are **not** committed (except CC02's), so every machine builds its own.
A fresh clone reproduces them byte-for-byte — verified on CC11: 224 entries,
zero differences from the original.

## Verify before uploading

From the engine directory, checks every module's zip against its staged
`output/course` tree plus manifest, launch path, governor, SVG and LFS-pointer
checks:

```bash
python3 engine/scripts/verify-packages.py
```

Per module, catches storyboard/build drift, missing media, dead fields and
broken slide JS:

```bash
npm run audit
```

## Locked modules — do not compile

`storyboard/.no-regen` marks a module whose compiled slides are the source of
truth. `generate-slides.js` and `clean-generated.js` both refuse to run when it
is present, exiting non-zero before anything is written or deleted.

Currently locked: **CC01, CC02, CC09, CC12**. Each `.no-regen` explains why.

This matters most for **CC02**, whose storyboard Slide-IDs (`SLD-CC02-001…`)
have drifted from the live slides (`1S01…`). Compiling it rewrites
`course.data.json` and orphans all 34 real slides. Reconcile the storyboard
before ever passing `--unlock`.

Individual hand-authored slides carry `Source: hand-built` in the storyboard;
`generate-slides` skips those and reports them as `PROTECT`.

## LMS upload notes

- Package sizes range from 47 MB (CC11) to **242 MB (CC04)**. CC02 uploaded
  successfully at 103 MB, so the ceiling is at least that; CC04 is unproven.
  Upload a small module first and leave CC04 until last.
- The certificate resolves the course code from `meta.course_code`, falling
  back to parsing `meta.id`. CC01's id is `porsche-safety-001`, which cannot be
  parsed, so its explicit `course_code` must not be removed.
