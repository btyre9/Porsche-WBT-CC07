# Course: [Module Title Here]

Module ID: XX01  |  Version: 1.0  |  Status: Draft
Series: [Training Series Name] — Module [N] of [Total]
Prerequisite: [Previous module ID or "None"]

How to use: Each slide starts with a "Slide XX" heading. Fields follow in Key: Value format.
Lines starting with >> are stage direction annotations — ignored by the parser.
Run `npm run import-storyboard -- --docx storyboard/[ModuleName]-Storyboard.docx` to parse into the course.

File naming convention: underscores only — 01, not SLD-XX01-001.

---

## Slide 01 — Title Slide

Slide-ID: 01
Template-ID: hero-title
Slide-Title: [Module Title Here]
On-Screen-Text: [Module Title] | [Series Name] | [Organization]
>> On slide load → 1S01-INTRO.mp3
Voiceover-INTRO: [Welcome VO introducing the module, its purpose, and what the learner will gain.]
Caption-Text: [First sentence of the VO — used as closed caption text.]
Image: [Art direction: describe the ideal hero image — subject, mood, composition, setting. This will be used to source or generate the asset.]
Status: Draft
Notes: Full-bleed hero image. Title fades in at 0.5s.

---

## Slide 02 — Learning Objectives

Slide-ID: 02
Template-ID: learning-objectives
Slide-Title: Learning Objectives
On-Screen-Text: Module [N] Learning Objectives
>> On slide load → 1S02-INTRO.mp3
Voiceover-INTRO: [VO listing each learning objective. Each objective should be mentioned explicitly so the slide animations can sync to the audio.]
Caption-Text: [Summary caption for this slide.]
Status: Draft
Notes: Each objective fades in sequentially as mentioned in VO. All objectives must be visible before Next unlocks.

---

## Slide 03 — Content Slide (with Stat)

Slide-ID: 03
Template-ID: content-stat
Slide-Title: [Section Heading]
On-Screen-Text: [Key statistic or pull quote that appears visually on the slide]
>> On slide load → 1S03-INTRO.mp3
Voiceover-INTRO: [VO explaining the section content. Reference the on-screen stat/quote in the audio.]
Caption-Text: [First sentence or key phrase from the VO.]
Image: [Art direction for slide image.]
Status: Draft
Notes: Stat figure should be visually prominent. Content reveals in sections.

---

## Slide 04 — Card Explore (Interactive)

Slide-ID: 04
Template-ID: card-explore
Slide-Title: [Section Heading]
On-Screen-Text: [Instruction text displayed on slide, e.g. "Click each card to explore."]
>> On slide load → 1S04-INTRO.mp3
Voiceover-INTRO: [INTRO VO — sets up the topic and instructs learner to click cards.]
>> User clicks [Card 1 Label] → 1S04-CLICK-CardOne.mp3
Voiceover-CLICK-CardOne: [VO that plays when learner clicks Card 1.]
>> User clicks [Card 2 Label] → 1S04-CLICK-CardTwo.mp3
Voiceover-CLICK-CardTwo: [VO that plays when learner clicks Card 2.]
>> User clicks [Card 3 Label] → 1S04-CLICK-CardThree.mp3
Voiceover-CLICK-CardThree: [VO that plays when learner clicks Card 3.]
Caption-Text: [Caption for the slide — usually summarizes the INTRO VO.]
Image: [Art direction for slide background image.]
Status: Draft
Notes: Cards locked until INTRO VO ends. All cards must be clicked to unlock Next.

---

## Slide 05 — Knowledge Check

Slide-ID: 01
Template-ID: knowledge-check
Slide-Title: Knowledge Check
>> On slide load → 2KC01-INTRO.mp3
Voiceover-INTRO: Let's check your understanding. Select the best answer.
Question: [The knowledge check question text.]
Choice-1: [First answer option]
Choice-2: [Second answer option]
Choice-3: [Third answer option]
Choice-4: [Fourth answer option]
Correct-Answer: [Number of correct choice — e.g. 2]
Review-Slide: 03
Caption-Text: Let's check your understanding.
Status: Draft
Notes: Wrong answer → "Back to Review" button → returns to Review-Slide. Correct answer unlocks Next.

---

## Slide 06 — Final Quiz Question 1

Slide-ID: 01
Template-ID: final-quiz
Slide-Title: Final Assessment — Question 1
>> On slide load → 3FQ01-INTRO.mp3
Voiceover-INTRO: Question one. Choose the best answer.
Question: [Quiz question text.]
Choice-1: [First answer option]
Choice-2: [Second answer option]
Choice-3: [Third answer option]
Choice-4: [Fourth answer option]
Correct-Answer: [Number of correct choice]
Caption-Text: Question one. Choose the best answer.
Status: Draft
Notes: Part of final assessment. Pass threshold: 80%. Score reported to SCORM.

---

## Slide 07 — Quiz Score

Slide-ID: 3FQ-SCORE
Template-ID: quiz-score
Slide-Title: Module Results
On-Screen-Text: Module [N] Complete
Status: Draft
Notes: Pass threshold: 80%. Pass state: congratulations + continue. Fail state: encouragement + offer to review. Score reported to SCORM.

---

## Field Reference

Slide-ID: Unique slide identifier — 01, 01, 01. Use underscores only.
Template-ID: Slide layout — hero-title, objectives, content-bullets, content-stat, content-quote, content-split, card-explore, split-explore, video-bg, closing, knowledge-check, final-quiz, quiz-score
Slide-Title: Display title shown in course menu
>> Stage direction lines (starting with >>) are ignored by the parser — show clip triggers and filenames
Voiceover-INTRO: VO that plays on slide entry (required on all slides with audio)
Voiceover-CLICK-Label: VO triggered when a named card or hotspot is clicked
Voiceover-TAB-Label: VO triggered when a named tab or accordion section opens
Voiceover-STEP-N: VO triggered at step N in a sequence (N is zero-padded: 01, 02, etc.)
On-Screen-Text: Main headline or key text displayed visually on the slide
Caption-Text: Closed-caption text (VTT overlay) — usually matches or summarizes Voiceover-INTRO
Image: Art direction for the slide image. Describe subject, mood, composition, setting.
Image-File: (Production) Actual filename once the image has been sourced — e.g. technician-with-customer.jpg
Image-Position: (Optional) Per-slide crop framing — CSS position, e.g. 70% 25% (x% y%) or "center top". Default center.
Image-Scale: (Optional) Per-slide zoom factor — 1 = none, 1.2 = 20% closer. Default 1. Settable visually via dashboard 🎯 Adjust Image.
Video: Art direction for the background video. Describe subject, camera movement, tone.
Video-File: (Production) Actual filename once the video has been sourced — e.g. service-bay-walkthrough.webm
Question: (KC / FQ only) The question text
Choice-1 … Choice-4: (KC / FQ only) Answer choices
Correct-Answer: (KC / FQ only) Number of the correct choice — e.g. 2
Review-Slide: (KC only) Slide ID to return to on wrong answer — e.g. 03
Status: Authoring status — Draft, In Review, or Approved
Notes: Developer / production notes — not parsed into course data
