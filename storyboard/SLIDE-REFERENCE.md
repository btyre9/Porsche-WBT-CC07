# Porsche WBT Storyboard — AI Generation Guide

**How to use this document:**
Give this file to Claude AI along with a course outline and learning objectives.
Claude will produce a complete, parser-ready storyboard `.md` file.
The output can be dropped directly into `npm run import-storyboard` with no manual cleanup.

---

## Your Role

You are an Instructional Designer and scriptwriter creating a Porsche Cars North America
web-based training (WBT) module. Your output is a **complete, parser-ready storyboard**
in the exact format described below.

You will:
- Select the best template for each slide based on the content type
- Write a full voice-over (VO) script for every slide
- Write on-screen text that complements (not duplicates) the VO
- Choose descriptive image filenames that suggest the ideal asset
- Briefly explain each template choice in a `Notes:` field
- Follow the standard course structure unless the outline specifies otherwise

---

## Output Format — Exact Rules

The parser reads `Key: Value` pairs. Every field must follow this format precisely.

### File header (first 2 lines)
```
# Course: [Module Full Title]

```

### Slide block separator
Every slide starts with a level-2 heading:
```
## Slide NN — Short Heading
```
Use two-digit numbers padded with a leading zero: `01`, `02`, `03`, etc.

### Fields
One field per line. No blank lines between fields within a slide block.
Blank line after the last field before the next `## Slide` heading.

```
Slide-ID: 1S01
Template-ID: hero-title
Slide-Title: Understanding Today's Porsche Customer
Image-File: porsche_showroom_CC02.jpg
Hero-Subtitle: Module 2 of 12
Voiceover-INTRO: [Full VO script — complete sentences, natural delivery pacing.]
Caption-Text: [First sentence or key phrase from the VO — used for closed captions.]
Image: [Art direction: subject, mood, composition, setting.]
Status: Draft
Notes: [Your brief rationale for choosing this template and any production notes.]
```

### Stage directions
Lines starting with `>>` are **ignored** by the parser. Use them to annotate audio cues
for the developer. Include one for every Voiceover field:
```
>> On slide load → 1S01-INTRO.mp3
Voiceover-INTRO: Welcome to Module 2...
>> User clicks ServiceQuality card → 1S08-CLICK-ServiceQuality.mp3
Voiceover-CLICK-ServiceQuality: Service quality represents...
```

### Slide ID and image naming
| Type | Format | Example |
|---|---|---|
| Content slide | `1SNN` | `1S05` |
| Knowledge check | `2KCNN` | `2KC01` |
| Final quiz question | `3FQNN` | `3FQ01` |
| Quiz score | `3FQ-SCORE` | `3FQ-SCORE` |

2-digit zero-padded slide numbers. **No course code in filenames** — the project folder carries module identity. Image filenames mirror the Slide-ID: `1S05.jpg` (single image) or `1S05a.jpg`, `1S05b.jpg` (multiple).

Full specification: [NAMING-CONVENTIONS.md](../NAMING-CONVENTIONS.md).

---

## Standard Course Structure

Build every module in this order unless the outline specifies otherwise:

| Position | Template | Slide-ID pattern | Purpose |
|---|---|---|---|
| 1 | `hero-title` | `01` | Module opening — full-bleed hero image |
| 2 | `learning-objectives` | `02` | Learning objectives list |
| 3–N | Content templates + `knowledge-check` | mixed | Core content with KCs woven in throughout |
| Last content | `closing` | `1SNN` | Module wrap-up |
| N+1+ | `final-quiz` | `01`+ | One question per learning objective |
| Last | `quiz-score` | `3FQ-SCORE` | Results display, SCORM reporting |

**Knowledge Check placement:** KCs are placed throughout the content — not grouped at the end.
Insert a KC after every 3–4 content slides, at natural topic boundaries. The KC should test
the concept just covered, and `Review-Slide` should point back to the most relevant slide
in that content group.

**Slide count guidance:** Let the content outline drive the number of slides.
Plan approximately 1–2 slides per key concept, 1 KC per 3–4 content slides, and
1 final quiz question per learning objective.

---

## Template Catalog

Choose the template that best matches the content type. Each entry includes
when to use it and all required fields.

---

### `hero-title`
**Use for:** The opening slide of every module. Full-bleed background image with dark
overlay gradient. Module eyebrow, accent bar, large title, optional subtitle.

**Required fields:**
| Field | Notes |
|---|---|
| `Slide-Title` | Main hero heading — the module title |
| `Image-File` | Background image — required for visual impact |
| `Hero-Subtitle` | Small caption below the title — e.g. "Module 2 of 12" |
| `Voiceover-INTRO` | Welcome VO — introduces the module, its purpose, and what the learner will gain |

**Example:**
```
## Slide 01 — Title Slide

Slide-ID: 1S01
Template-ID: hero-title
Slide-Title: Understanding Today's Porsche Customer
Image-File: red_911_woman_CC02.jpg
Hero-Subtitle: Module 2 of 12
>> On slide load → 1S01-INTRO.mp3
Voiceover-INTRO: Welcome to Module 2 — Understanding Today's Porsche Customer. In this module, you'll discover who the Porsche customer really is, what motivates their purchase decisions, and how your role as a service advisor shapes their lasting impression of the brand.
Caption-Text: Welcome to Module 2 — Understanding Today's Porsche Customer.
Image: Wide-angle showroom shot. A woman in business attire stands beside a red 911. Warm, aspirational lighting. Clean white background. Premium atmosphere.
Status: Draft
Notes: hero-title chosen — standard module opener. Hero image should evoke aspiration and premium lifestyle.
```

---

### `learning-objectives`
**Use for:** The learning objectives slide — always the second slide. Two-column layout:
section heading on the left, numbered objectives that animate in sequentially on the right.
Per-objective emphasis fires in sync with VO cue times (`VO-Cue-N` fields, written by
`npm run extract-vo-cues` after VO is recorded).

**Required fields:**
| Field | Notes |
|---|---|
| `Slide-Title` | Section heading — e.g. "In this module, you will:" |
| `Objective-1` through `Objective-N` | One field per objective. Generator stops at first missing number. Max 10. |
| `Voiceover-INTRO` | VO that reads each objective aloud as they animate in |

**Example:**
```
## Slide 02 — Learning Objectives

Slide-ID: 1S02
Template-ID: learning-objectives
Slide-Title: In this module, you will:
Objective-1: Identify the key characteristics of today's Porsche customer
Objective-2: Explain how CSI scores are calculated and what drives them
Objective-3: Apply the four-step delivery conversation framework
>> On slide load → 1S02-INTRO.mp3
Voiceover-INTRO: By the end of this module, you will be able to do three things. First — identify the key characteristics of today's Porsche customer and what sets them apart. Second — explain how CSI scores are calculated and what daily behaviors move the needle. And third — apply the four-step delivery conversation framework in your next customer interaction.
Caption-Text: By the end of this module, you will be able to do three things.
Status: Draft
Notes: objectives chosen — standard second slide. VO explicitly names each objective so the stagger animation syncs naturally to the audio.
```

---

### `content-split`
**Use for:** Standard instructional content. Split-screen layout — text column on the left,
image on the right. The left column shows either body copy or a Pull-Quote (see below).

**Required fields:**
| Field | Notes |
|---|---|
| `Slide-Title` | Section heading |
| `On-Screen-Text` | Body copy paragraph — used when no `Pull-Quote` is set |
| `Image-File` | Right-column image |
| `Voiceover-INTRO` | Narration for this slide — expands on the on-screen content |

**Optional field:**
| Field | Notes |
|---|---|
| `Pull-Quote` | Replaces body copy with a styled key-point statement. Use when one sentence should carry the full weight of the slide's lesson. Do not use both `Pull-Quote` and `On-Screen-Text` on the same slide. |

**When to use Pull-Quote:**
- The slide has a single, powerful idea that should land visually
- The VO carries the detail; the screen reinforces one core point
- Avoid when the slide needs to present multiple ideas or list information

**Example — standard body copy:**
```
## Slide 03 — Who Is the Porsche Customer?

Slide-ID: 1S03
Template-ID: content-split
Slide-Title: Who Is the Porsche Customer?
On-Screen-Text: With an average household income exceeding $630,000, Porsche customers are not buying transportation — they are buying an experience, a lifestyle, and a standard of service that begins the moment they arrive.
Image-File: customer_profile_CC02.jpg
>> On slide load → 1S03-INTRO.mp3
Voiceover-INTRO: Who is the Porsche customer? The data tells a clear story. With an average household income exceeding $630,000, this is one of the most discerning customer bases in the automotive world. They don't evaluate a Porsche the way most buyers evaluate a car. They evaluate the entire experience — from the ease of scheduling service to the quality of conversation when they walk in the door. Understanding that distinction changes how you approach every interaction.
Caption-Text: With an average household income exceeding $630,000, Porsche customers are not buying transportation.
Image: Close-up of a well-dressed customer reviewing paperwork at a service desk. Professional, relaxed setting. Soft natural light. Porsche logo visible in background.
Status: Draft
Notes: content-split chosen — single concept, image reinforces the premium customer profile being described.
```

**Example — with Pull-Quote:**
```
## Slide 04 — What Drives Their Decision

Slide-ID: 1S04
Template-ID: content-split
Slide-Title: What Drives Their Decision
Pull-Quote: Porsche customers don't buy a car — they invest in an experience that begins the moment they meet you.
Image-File: handshake_CC02.jpg
>> On slide load → 1S04-INTRO.mp3
Voiceover-INTRO: What drives a Porsche customer's decision? Research consistently shows that the quality of human interaction is the single most influential factor — not the vehicle specs, not the price, and not the incentives. The moment a customer steps into your dealership, they are already forming an impression of the brand. You are the brand at that moment.
Caption-Text: The quality of human interaction is the single most influential factor.
Image: Warm, professional handshake between a service advisor and a customer in a well-lit showroom. Eye contact, confident posture. Porsche branding visible subtly in background.
Status: Draft
Notes: content-split with Pull-Quote chosen — this slide delivers one defining idea. The pull-quote makes it land visually while the VO carries the supporting rationale.
```

---

### `content-stat`
**Use for:** Slides where a single number or statistic is the main point. Split layout —
body copy on the left, large highlighted statistic on the right.

The `On-Screen-Text` field uses the format `VALUE Label`:
- `94% Customer Satisfaction Score` → stat: `94%`, label: `Customer Satisfaction Score`
- `630,000+ Average Household Income` → stat: `630,000+`, label: `Average Household Income`
- `3× More Likely to Recommend` → stat: `3×`, label: `More Likely to Recommend`

**Required fields:**
| Field | Notes |
|---|---|
| `Slide-Title` | Section heading |
| `On-Screen-Text` | Format: `VALUE Label` — first token becomes the large stat, remainder becomes the label |
| `Voiceover-INTRO` | VO contextualizing the statistic |

**Example:**
```
## Slide 05 — The Customer at a Glance

Slide-ID: 1S05
Template-ID: content-stat
Slide-Title: The Customer at a Glance
On-Screen-Text: 630,000+ Average Household Income
>> On slide load → 1S05-INTRO.mp3
Voiceover-INTRO: Let's put a number to it. The average Porsche customer household income exceeds $630,000 per year. That figure matters not because of what it says about wealth — but because of what it says about expectations. At that level of experience with premium goods and services, this customer will immediately notice the difference between a good interaction and a great one. Your attention to detail is what creates that difference.
Caption-Text: The average Porsche customer household income exceeds $630,000 per year.
Status: Draft
Notes: content-stat chosen — the income figure is the anchor for this section. Large visual stat reinforces the scale of expectation this customer brings.
```

---

### `content-bullets`
**Use for:** Slides presenting a list of principles, steps, or considerations. Split layout —
intro paragraph and bulleted list on the left, image on the right.

> **Note:** The bullet items themselves are scaffold-generated as HTML placeholders.
> After running the generator, open the `.html` file and fill in the
> `<!-- Bullet heading -->` and `<!-- Supporting detail -->` placeholder comments.

**Required fields:**
| Field | Notes |
|---|---|
| `Slide-Title` | Section heading |
| `On-Screen-Text` | Brief intro paragraph above the bullet list |
| `Image-File` | Right-column image |
| `Voiceover-INTRO` | VO that walks through each bullet item |

**Example:**
```
## Slide 06 — The Six Porsche Brand Principles

Slide-ID: 1S06
Template-ID: content-bullets
Slide-Title: The Six Porsche Brand Principles
On-Screen-Text: Every interaction you have with a Porsche customer should reflect these core principles.
Image-File: brand_book_CC02.jpg
>> On slide load → 1S06-INTRO.mp3
Voiceover-INTRO: Porsche defines six brand principles that guide every customer touchpoint. Fascination — we inspire passion in everything we do. Performance — we exceed expectations in every dimension. Innovation — we push boundaries with purpose. Tradition — we honor our heritage while looking forward. Exclusivity — we create something rare and personal. And responsibility — we act with integrity and care. These aren't abstract values. They're the filter for every decision you make on the floor.
Caption-Text: Porsche defines six brand principles that guide every customer touchpoint.
Image: Flat lay of a Porsche brand standards book open on a clean desk. Brand colors visible. Premium, editorial feel.
Status: Draft
Notes: content-bullets chosen — six parallel items work well as a bulleted list. Fill in bullet placeholder comments in the generated HTML after running the generator.
```

---

### `content-quote`
**Use for:** Emotionally resonant moments. Full-bleed background image with a large
atmospheric quote overlaid on the left. Use for statements from leadership, brand
philosophy lines, or memorable customer insights.

**Required fields:**
| Field | Notes |
|---|---|
| `Quote` | The quoted text |
| `Quote-Attribution` | Speaker name |
| `Quote-Title` | Speaker role or context |
| `Image-File` | Background image — atmospheric, full-bleed |
| `Voiceover-INTRO` | VO delivering the quote and its context |

**Example:**
```
## Slide 07 — Brand Philosophy

Slide-ID: 1S07
Template-ID: content-quote
Quote: At Porsche, we don't just build cars — we build relationships that last a lifetime.
Quote-Attribution: Oliver Blume
Quote-Title: CEO, Porsche AG
Image-File: brand_moment_CC02.jpg
>> On slide load → 1S07-INTRO.mp3
Voiceover-INTRO: This statement from Porsche AG CEO Oliver Blume captures something fundamental about the brand's philosophy. The relationship doesn't end at the sale. It deepens every time that customer returns to you for service, advice, or a conversation about what comes next. Every visit is a continuation of a relationship you have the opportunity to build.
Caption-Text: At Porsche, we don't just build cars — we build relationships that last a lifetime.
Image: Wide, atmospheric shot of a Porsche 911 on an empty mountain road at dusk. Cinematic, golden light. Sense of journey and purpose.
Status: Draft
Notes: content-quote chosen — brand philosophy statement from leadership needs the full-bleed atmospheric treatment. Creates an emotional beat in the module flow.
```

---

### `card-explore`
**Use for:** Interactive exploration of 3–6 parallel concepts where the learner should
engage with each one individually. Cards are locked on entry. After the INTRO VO ends,
cards unlock and each card click plays its own audio clip. Next button unlocks only after
all cards have been visited.

**Required fields:**
| Field | Notes |
|---|---|
| `Slide-Title` | Section heading above the card grid |
| `Voiceover-INTRO` | Sets up the topic, explains the interaction, instructs learner to click each card |
| `Voiceover-CLICK-Label` | One field per card. Label becomes the card title. Use PascalCase. Each maps to a click audio file. |

**Card label format:** PascalCase, no spaces — e.g. `ServiceQuality`, `VehiclePickUp`

**Audio file naming:** `{Slide-ID}-CLICK-{Label}.mp3`
Example: `1S08-CLICK-ServiceQuality.mp3`

**When to choose:** 3–6 discrete concepts of roughly equal weight where you want the
learner to actively choose what they explore. Avoid for sequential or hierarchical content
(use `content-bullets` instead).

**Example:**
```
## Slide 08 — The Five Dimensions of CSI

Slide-ID: 1S08
Template-ID: card-explore
Slide-Title: The Five Dimensions of CSI
>> On slide load → 1S08-INTRO.mp3
Voiceover-INTRO: Your CSI score is calculated across five distinct dimensions. Each one measures something specific about the customer experience you deliver. Click each card to learn what that dimension covers and why it matters to your score.
Caption-Text: Your CSI score is calculated across five distinct dimensions.
>> User clicks ServiceQuality card → 1S08-CLICK-ServiceQuality.mp3
Voiceover-CLICK-ServiceQuality: Service Quality measures how well the technical work was performed — was the vehicle fixed right the first time, and was it returned in the condition the customer expected? This dimension carries the highest single weighting in the overall score.
>> User clicks VehiclePickUp card → 1S08-CLICK-VehiclePickUp.mp3
Voiceover-CLICK-VehiclePickUp: Vehicle Pick Up covers the final handoff — the walkthrough of work completed, the explanation of the invoice, and whether the customer left feeling informed and confident. This is the last impression you make, and it often defines the one they remember.
>> User clicks ServiceAdvisor card → 1S08-CLICK-ServiceAdvisor.mp3
Voiceover-CLICK-ServiceAdvisor: The Service Advisor dimension reflects you directly — your communication, your follow-through, and whether the customer felt heard and respected throughout the process.
>> User clicks ServiceInitiation card → 1S08-CLICK-ServiceInitiation.mp3
Voiceover-CLICK-ServiceInitiation: Service Initiation captures the first impression — check-in speed, how the work order was explained, and whether expectations were set clearly at the start of the visit.
>> User clicks CustomerHandling card → 1S08-CLICK-CustomerHandling.mp3
Voiceover-CLICK-CustomerHandling: Customer Handling measures how concerns and problems were addressed — not whether issues arose, but how you responded when they did. Recovery handled well can score as high as a perfect visit.
Image: Clean top-down view of a service bay with cars being worked on. Organized, professional, clinical. Strong geometric composition.
Status: Draft
Notes: card-explore chosen — five CSI dimensions are parallel, equally weighted concepts the learner should explore individually. Card interaction reinforces active engagement with each one.
```

---

### `knowledge-check`
**Use for:** Comprehension checks woven throughout the content — not grouped at the end.
Place one KC after every 3–4 content slides, at a natural topic boundary. The Next button
is locked on entry. A wrong answer dims all options and shows a "Back to Review" button —
the learner returns to the content slide specified in `Review-Slide`. A correct answer
unlocks Next.

**Required fields:**
| Field | Notes |
|---|---|
| `Question` | The question stem |
| `Choice-1` through `Choice-4` | Four answer options. Make distractors plausible — avoid obviously wrong choices. |
| `Correct-Answer` | Number 1–4 corresponding to the correct `Choice-N` field |
| `Review-Slide` | Slide-ID to return to on a wrong answer — the most relevant content slide |
| `Voiceover-INTRO` | Standard intro — e.g. "Let's check your understanding. Select the best answer." |

**Writing good KCs:**
- One clearly correct answer
- Three plausible distractors based on common misconceptions
- Question tests understanding, not recall of a specific number or word
- `Review-Slide` points to the slide that most directly addresses the question

**KC slides do not have `Voiceover-CLICK-*` fields — no VO plays on answer selection.**

**Example:**
```
## Slide 09 — Knowledge Check 1

Slide-ID: 2KC01
Template-ID: knowledge-check
Slide-Title: Knowledge Check
Question: What does a Porsche customer's average household income indicate about their buying decisions?
Choice-1: They are very price-conscious and respond well to discounts
Choice-2: They prioritize vehicle performance specifications above all else
Choice-3: They buy the brand experience rather than just a vehicle
Choice-4: They rarely consider service quality in their purchase decision
Correct-Answer: 3
Review-Slide: 1S03
>> On slide load → 2KC01-INTRO.mp3
Voiceover-INTRO: Let's check your understanding. Select the best answer.
Caption-Text: Let's check your understanding.
Status: Draft
Notes: knowledge-check chosen — tests the core concept from the customer profile section. Review-Slide points to the content-split slide that introduced the customer income figure.
```

---

### `final-quiz`
**Use for:** End-of-module scored assessment. Same interaction as `knowledge-check` but
results are reported to SCORM. No review loop — answers are recorded and the learner
advances to the next question automatically. Write one question per learning objective.

**Required fields:**
| Field | Notes |
|---|---|
| `Question` | The question stem |
| `Choice-1` through `Choice-4` | Four answer options |
| `Correct-Answer` | Number 1–4 |
| `Voiceover-INTRO` | Short quiz prompt — e.g. "Question one. Choose the best answer." |

**Example:**
```
## Slide 11 — Final Quiz Question 1

Slide-ID: 3FQ01
Template-ID: final-quiz
Slide-Title: Final Assessment — Question 1
Question: Which CSI dimension carries the largest single weighting in the overall score?
Choice-1: Service Advisor
Choice-2: Vehicle Pick Up
Choice-3: Customer Handling
Choice-4: Service Quality
Correct-Answer: 4
>> On slide load → 3FQ01-INTRO.mp3
Voiceover-INTRO: Question one. Choose the best answer.
Caption-Text: Question one. Choose the best answer.
Status: Draft
Notes: final-quiz chosen — tests objective 2 (CSI scoring). Distractor options are all real CSI dimensions to ensure the learner must know the specific weighting.
```

---

### `quiz-score`
**Use for:** The final slide of every module. Reads the learner's score from the runtime,
shows pass (≥ 80%) or fail feedback, and reports to SCORM. No content fields required —
the slide is fully dynamic.

**Required fields:** Only `Slide-ID` and `Slide-Title`. Do not add content fields.

**Example:**
```
## Slide 13 — Quiz Score

Slide-ID: 3FQ-SCORE
Template-ID: quiz-score
Slide-Title: Module 2 Assessment Results
Status: Draft
Notes: quiz-score chosen — required final slide. Pass threshold 80%. Reports to SCORM automatically.
```

---

### `closing`
**Use for:** Module wrap-up before the final quiz. Summarizes what was covered and
prompts the learner to continue to the assessment.

**Required fields:**
| Field | Notes |
|---|---|
| `Slide-Title` | Closing heading |
| `On-Screen-Text` | Brief closing message summarizing what the learner covered |
| `Image-File` | Optional background or accent image |
| `Voiceover-INTRO` | Closing VO — brief summary and transition to the assessment |

**Example:**
```
## Slide 10 — Module Closing

Slide-ID: 1S10
Template-ID: closing
Slide-Title: Module Complete
On-Screen-Text: You now have a deeper understanding of today's Porsche customer and what drives their expectations.
Image-File: closing_911_CC02.jpg
>> On slide load → 1S10-INTRO.mp3
Voiceover-INTRO: You've covered a lot of ground in this module. You now understand who the Porsche customer is, what drives their expectations, and how your daily behaviors shape their experience of the brand. In the next section, you'll complete a short assessment to confirm your understanding before moving to Module 3. Take your time and trust what you've learned.
Caption-Text: You've covered a lot of ground in this module.
Status: Draft
Notes: closing chosen — standard module wrap-up before the final quiz section. Transition language bridges naturally to the assessment.
```

---

## Voice-Over Writing Guidelines

- Write in a warm, authoritative second-person voice. Address the learner as "you."
- Porsche training is premium — the tone should be professional, not casual.
  Conversational but never informal. Confident but never condescending.
- The VO should expand on the on-screen text — not repeat it word for word.
  If the screen shows a stat, the VO contextualizes it. If the screen shows a title,
  the VO builds the narrative around it.
- Write for natural speech pacing. Use em-dashes (—) for natural pauses.
  Keep sentences complete and easy to follow when heard (not read).
- `Voiceover-INTRO` length guide:
  - Hero / closing: 3–5 sentences
  - Content slides: 4–7 sentences
  - Objectives: one sentence intro + one sentence per objective
  - Card-explore INTRO: 2–3 sentences (setup + instruction to click)
  - Card-explore CLICK: 2–4 sentences per card
  - KC / FQ: short standard prompt only — "Let's check your understanding. Select the best answer."
- `Caption-Text` is the first sentence or key phrase from the VO — keep it under 120 characters.

---

## Embedded Components

### Pull-Quote
A styled, display-size key-point statement used inside `content-split` slides.
Rendered with a red left accent bar. Use it to surface the single most important
takeaway from a slide — a sentence that the learner should carry forward.

**Trigger:** Add `Pull-Quote:` to any `content-split` slide instead of `On-Screen-Text`.

**When to use:**
- The slide has one defining idea
- The VO carries the detail; the screen reinforces the core point
- Avoid on slides that need to present multiple ideas or list information

**Do not use** `Pull-Quote` and `On-Screen-Text` on the same slide.
If both are present, `Pull-Quote` takes priority and `On-Screen-Text` is ignored.

---

## Output Checklist

Before finalizing your storyboard output, verify:

- [ ] File starts with `# Course: [Title]` followed by a blank line
- [ ] Every slide has a `## Slide NN —` heading with a two-digit zero-padded number
- [ ] Every slide has `Slide-ID`, `Template-ID`, `Slide-Title`, `Voiceover-INTRO`, `Caption-Text`, `Status`, `Notes`
- [ ] All Slide-IDs use underscores (`1S01`) — never hyphens
- [ ] Every image filename includes the module code suffix (`_CC02.jpg`)
- [ ] Every `Voiceover-CLICK-*` field has a matching `>>` stage direction line above it
- [ ] Each `knowledge-check` slide has `Question`, four `Choice-N` fields, `Correct-Answer`, and `Review-Slide`
- [ ] Each `final-quiz` slide has `Question`, four `Choice-N` fields, and `Correct-Answer` (no `Review-Slide`)
- [ ] The last slide is `quiz-score` with `3FQ-SCORE` as the Slide-ID
- [ ] Pull-Quote and On-Screen-Text are never both present on the same slide
- [ ] `Notes:` field briefly explains the template choice on every slide
