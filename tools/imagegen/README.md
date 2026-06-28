# Image generation (paid, low-cost)

Render slide images from `storyboard/image-prompts.json` via the Gemini or OpenAI
image API. **Dry-run by default** — prints the estimated spend and writes nothing
until you add `--yes`.

> There is **no free API tier** for image generation, and the in-browser options
> aren't really free either: Google AI Studio's free "Nano Banana" quota is limited
> (and **Nano Banana Pro / Gemini 3 Pro Image is paid**), ChatGPT needs a paid seat,
> and Adobe Firefly gives only limited monthly credits. This paid tool is usually the
> cheapest hands-off path (~pennies/image). Brand/accuracy rules and
> the ⚠️ accuracy-critical policy live in `IMAGE-GEN-RULES.md`.

## Setup
```bash
cp tools/imagegen/.env.example tools/imagegen/.env   # then paste your key
```
- Gemini key: https://aistudio.google.com/apikey  →  `GEMINI_API_KEY`
- OpenAI key: https://platform.openai.com/api-keys  →  `OPENAI_API_KEY`

## Use
```bash
# 1) make prompts (free)
node scripts/generate-image-prompts.js                  # reads storyboard/course.md

# 2) preview cost (free, spends nothing)
node scripts/generate-images.js                         # gemini, cheapest model

# 3) actually generate (spends ~the estimate)
node scripts/generate-images.js --yes
node scripts/generate-images.js --provider openai --quality low --yes   # cheapest overall
```

Flags: `--provider gemini|openai` · `--model <id>` · `--quality low|medium|high`
(openai) · `--size 1K|2K|4K` (gemini) · `--max N` (cap) · `--include-critical`
(also do accuracy-flagged slides) · `--yes` (spend).

Approx per-image (May 2026, verify): gpt-image-2 low **$0.006** · gemini-2.5-flash-image
**$0.039** · gemini-3-pro-image **$0.134**. Output → `tools/imagegen/out/` (gitignored;
vet before moving into `course/assets/images/`).
