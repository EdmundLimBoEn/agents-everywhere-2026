# Adaptive AI Study Agent

> Planning revision: [the current PRD](./prd.md) and [hackathon scope](./hackathon-scope.md) take precedence. The primary surface is now a browser extension with a multi-post study overlay. Earlier add-on, single-item session, turn-in, and grading requirements below are historical and must be reconciled before implementation.

Historical ChatGPT canvas. Classroom is now the home surface. See `docs/theme-fit.md`.

## 1. Product Goal

Build a student-focused AI teaching agent that:

- learns how each student prefers to learn
- remembers mastery, weaknesses, misconceptions, and past lessons
- teaches across all school subjects
- grounds answers in school notes and practice papers using RAG
- supports natural voice teaching with GPT Live
- shares an interactive whiteboard with the student
- adapts difficulty and teaching style automatically
- tests understanding instead of just answering questions
- can run either:
  - freeform tutoring
  - structured autonomous lessons

The core demo should prove that this is an **agent**, not a chatbot with PDF search.

---

# 2. Core Agent Loop

The main teaching loop:

```text
Observe student
↓
Read learner profile + mastery
↓
Determine lesson state
↓
Retrieve relevant school material
↓
Choose teaching action
↓
Teach via voice/text/whiteboard
↓
Check understanding
↓
Diagnose mistakes
↓
Update learner model
↓
Choose next action
```

Possible teaching actions:

```text
explain
ask_question
retrieve_notes
draw
highlight
move_whiteboard_element
give_hint
show_example
simplify
switch_modality
test_prerequisite
retrieve_practice_question
generate_practice_question
mark_answer
update_mastery
end_lesson
```

---

# 3. Demo Flow

The hackathon demo should ideally show one continuous sequence:

```text
Student starts lesson
↓
Agent sees weak topic
↓
Agent explains using voice
↓
Agent draws on whiteboard
↓
Student answers incorrectly
↓
Agent detects misconception
↓
Agent changes teaching method
↓
Agent retrieves school notes
↓
Agent uses a matching practice-paper question
↓
Student answers correctly
↓
Agent updates mastery
↓
Dashboard visibly changes
```

This is the main "holy shit, this is actually an agent" moment.

---

# 4. Student Onboarding

Students do NOT upload content.

School materials are preloaded by us.

Student onboarding is a short questionnaire covering:

- preferred amount of detail
- examples-first vs theory-first
- voice vs reading
- diagrams vs equations/text
- preferred teaching pace
- whether they like frequent questions
- preferred teacher vibe
- confidence by subject
- learning goals
- exam goals

The profile changes over time based on actual student behavior.

Students can inspect and edit their learner profile.

---

# 5. Learner Model

Track:

```text
student
├── preferences
├── goals
├── subject mastery
├── topic mastery
├── confidence
├── misconceptions
├── mistakes
├── question archetype weaknesses
├── intervention history
├── preferred successful explanation types
├── spaced repetition state
└── lesson history
```

Mastery is NOT one simple score.

Store:

```text
mastery score
confidence
evidence
last tested
decay
questions attempted
hints used
response time
explanation quality
```

The agent should distinguish:

```text
correct + confident
correct + unsure
wrong + confident
wrong + unsure
```

Those mean different things pedagogically.

---

# 6. Memory

Long-term searchable conversation history.

Also store distilled learner memories.

Raw transcripts can contribute to memory, but only learning-relevant information should become structured learner state.

Students must be able to inspect:

- what the system remembers
- why it remembers it
- mastery
- misconceptions
- preferences
- goals

And edit/delete those.

---

# 7. AI Personality Rules

The AI should behave teacher-like, but never pretend to be human.

It must:

- clearly remain an AI system
- focus on information and learning
- avoid sycophancy
- disagree when the student is wrong
- avoid excessive emotional support
- avoid pseudo-friend behavior
- avoid implying emotions or consciousness
- avoid unnecessary praise

Normal teacher-style praise is fine.

Example:

```text
Good — you used conservation of energy correctly.
```

Avoid:

```text
That's such an amazing idea!
You're incredibly smart!
I'm so proud of you!
```

---

# 8. Teaching Behavior

Default mode:

Agent chooses the next useful teaching action.

Optional mode:

```text
Teach me this chapter
```

The agent runs a structured lesson.

Structured lessons should have:

```text
objective
success criteria
short lesson plan
checkpoints
practice
mastery update
summary
next recommendation
```

The agent may interrupt naturally when:

- a misconception appears
- clarification is needed
- student is going off-track
- a checkpoint is useful

It should act like a good teacher, not like a passive chatbot.

---

# 9. Adaptive Teaching

When a student struggles:

```text
diagnose why
↓
choose intervention
```

Possible interventions:

```text
simpler explanation
analogy
diagram
worked example
prerequisite review
practice question
Socratic question
voice explanation
whiteboard manipulation
```

The agent should not blindly repeat itself differently.

---

# 10. Interest Depth

Default teaching should be concise and syllabus-focused.

If the student shows genuine interest:

```text
"why does this actually happen?"
"can we go deeper?"
"wait that's cool"
```

the agent may go beyond exam requirements.

External knowledge should be clearly distinguished from school-source material.

---

# 11. Modes

## Learning Mode

Optimize for:

```text
understanding
conceptual connections
discussion
diagrams
experimentation
```

## Exam Mode

Optimize for:

```text
marks
speed
school answer style
question archetypes
timing
recall
```

The agent may suggest switching modes.

---

# 12. Practice Papers

Practice papers are first-class data.

Extract:

```text
question
answer
mark allocation
topic
subtopic
difficulty
question archetype
source paper
year
marking style
```

The agent should match real questions based on:

```text
student weakness
+
appropriate difficulty
```

Do NOT overcomplicate prediction of future exam questions.

---

# 13. Generated Questions

Generated questions should be heavily based on the school's existing papers.

Learn:

```text
wording style
difficulty
mark allocation
question structure
common command words
expected answer length
```

Generated questions must be marked as AI-generated.

---

# 14. Question Archetypes

Track categories such as:

```text
calculate
explain
describe
compare
evaluate
source-based
multi-step
application
graph interpretation
proof/reasoning
```

The learner model should know which question types the student struggles with.

---

# 15. School Marking Style

Where marking schemes exist, the agent should teach:

```text
what is correct
+
how the school expects it phrased
```

Example:

```text
Conceptually correct, but this answer would probably lose one mark because you didn't mention...
```

---

# 16. Whiteboard

Web:

Use Excalidraw.

iOS:

Use PencilKit.

Shared conceptual board model between them.

The student and agent can both:

```text
draw
write
erase
move
highlight
annotate
label
point
complete diagrams
```

Agent normally uses high-level tools:

```ts
drawArrow()
addText()
drawShape()
highlightElement()
moveElement()
deleteElement()
groupElements()
```

But raw scene editing may be available for complex operations.

---

# 17. Whiteboard Learning Activities

Examples:

```text
"complete this circuit"
"label the organ"
"draw the force direction"
"move this ion to the correct side"
"finish the graph"
"circle the mistake"
```

Old boards persist.

The agent can reopen them later.

The learner model may extract misconceptions or learned concepts from them.

---

# 18. Voice

Use GPT Live / Realtime.

Voice should not simply be speech-to-text.

It should support natural teaching:

```text
student interrupts
agent interrupts briefly
agent asks follow-up
agent draws while speaking
student says "show me"
agent modifies board
```

Architecture:

```text
Client
  ↕ realtime audio
OpenAI Realtime

Client
  ↕ tools/state
Backend
```

Backend issues short-lived credentials.

Never expose the main OpenAI API key.

---

# 19. Agent Tools

The live agent may directly invoke backend tools.

Examples:

```ts
searchNotes()
searchPracticePapers()
getTopicGraph()
getLearnerProfile()
updateMastery()
recordMisconception()
getPracticeQuestion()
generatePracticeQuestion()
markAnswer()
getWhiteboard()
modifyWhiteboard()
saveLesson()
getPreviousLesson()
recommendNextTopic()
```

All tools need:

```text
strict schemas
server-side authorization
input validation
student isolation
```

No manual confirmation requirement for normal teaching actions.

---

# 20. Agent Architecture

Use one main teaching agent with hidden specialist agents/tools.

Possible specialists:

```text
retrieval agent
lesson planner
marker
question generator
mastery evaluator
whiteboard planner
memory extractor
```

Do NOT expose them to the student as separate characters.

---

# 21. Lesson State Machine

Use an explicit state machine.

Example:

```text
IDLE
↓
GOAL_SELECTION
↓
ASSESS_PRIOR_KNOWLEDGE
↓
TEACH
↓
CHECK_UNDERSTANDING
↓
DIAGNOSE
↓
RETEACH / PRACTICE
↓
ASSESS
↓
UPDATE_MASTERY
↓
SUMMARY
↓
COMPLETE
```

Hybrid transitions:

- critical transitions deterministic
- teaching choices may be model-selected

---

# 22. RAG

School content includes:

```text
notes
worksheets
practice papers
mark schemes
reference documents
```

Ingestion should preserve:

```text
subject
topic
subtopic
page
document
diagram
table
question references
```

Use multimodal parsing where possible.

Do not flatten everything into plain text.

---

# 23. RAG Retrieval

Use:

```text
vector search
+
keyword/BM25
+
knowledge graph context
+
reranking
```

Retrieval result example:

```ts
{
  chunk,
  document,
  page,
  topic,
  subtopic,
  relevance,
  relatedGraphNodes
}
```

---

# 24. Knowledge Graph

Maintain relationships like:

```text
Topic
REQUIRES
Topic

Topic
APPEARS_IN
Question

Question
USES_SKILL
Skill

Misconception
RELATES_TO
Topic

Topic
RELATED_TO
Topic
```

Example:

```text
Simultaneous equations
    ↓ prerequisite for
Circuit calculations
```

The agent may realize a physics weakness is actually an algebra weakness.

---

# 25. Content Setup Pipeline

We manually upload school PDFs.

Then run an expensive setup process.

```text
PDF
↓
parse
↓
extract text/images/tables
↓
identify subject
↓
identify topics
↓
identify definitions/formulas
↓
extract worked examples
↓
extract questions
↓
extract answers/mark schemes
↓
build graph
↓
chunk
↓
embed
↓
evaluate
```

This setup can intentionally burn lots of model tokens.

It only happens once before the demo.

---

# 26. RAG Evaluation

Use:

```text
RAGAS
+
human-created test questions
+
regression tests
```

Test:

```text
retrieval relevance
answer faithfulness
citation correctness
context recall
context precision
```

Create a small golden dataset from actual school content.

---

# 27. Sources UI

Normal student interface:

small source chips.

Example:

```text
[SST Science Notes p. 14]
```

Click expands into the relevant source chunk.

Developer mode shows:

```text
retrieved chunks
scores
reranking
graph path
RAGAS metrics
```

---

# 28. Home Screen

Show:

```text
Continue learning

Recommended next topic

Weak areas

Upcoming revision

Subjects

Recent lessons
```

Main CTA:

```text
Start Learning
```

Students can either:

```text
choose topic
```

or:

```text
What should I study?
```

---

# 29. Progress

Show:

```text
mastery bars
+
optional knowledge map
```

Knowledge map visualizes:

```text
mastered
learning
weak
decayed
prerequisite
```

---

# 30. Revision System

Agent builds a rolling revision plan based on:

```text
mastery
decay
mistakes
confidence
upcoming assessments
```

Use adaptive spaced repetition.

Home screen can say:

```text
You should revisit Cell Division today.
```

Plan should change when performance changes.

---

# 31. Collaborative Study

Allow 2–4 students in one shared session.

Shared:

```text
voice session
whiteboard
lesson
questions
```

No advanced per-student participation tracking required for MVP.

---

# 32. Offline Behavior

Limited offline mode.

Support:

```text
cached notes
cached lesson history
saved boards
create/edit whiteboards
basic text viewing
```

Agent functionality requires internet.

Boards sync later.

---

# 33. Platforms

## Web

Primary hackathon platform.

Stack:

```text
Next.js
TypeScript
Cloudflare Workers
```

## iOS

Fully native SwiftUI app.

Same major features as web.

Additional:

```text
push notifications
native audio
PencilKit
```

No Live Activities.

---

# 34. Shared Contracts

Use OpenAPI as the API source of truth.

Generate:

```text
TypeScript client
Swift client
```

Avoid manually maintaining duplicate schemas.

---

# 35. Monorepo

Everything in one repository.

Example:

```text
/apps
  /web
  /ios

/services
  /api
  /agent
  /rag
  /jobs

/packages
  /schemas
  /openapi
  /agent-tools
  /rag-core
  /shared-types
  /evals

/content
  /raw
  /processed
  /golden-tests

/scripts
  /ingest
  /evaluate
```

---

# 36. Coding-Agent Work Split

## Agent 1 — Platform / Backend

Own:

```text
API
auth
database
OpenAPI
WebSockets
events
queues
sessions
```

## Agent 2 — Web

Own:

```text
Next.js UI
dashboard
lesson UI
chat
voice controls
Excalidraw
progress UI
```

## Agent 3 — iOS

Own:

```text
SwiftUI
PencilKit
voice
push notifications
lesson UI
API client
```

## Agent 4 — RAG

Own:

```text
PDF parsing
chunking
embeddings
search
reranking
knowledge graph
RAGAS
golden tests
```

## Agent 5 — Agent Runtime

Own:

```text
state machine
teaching prompts
tools
learner model
memory
lesson planner
mastery update logic
```

---

# 37. Cloud Strategy

Priority:

```text
free tier
↓
simplicity
↓
reliability
```

Use whichever free service best fits each workload.

Do NOT force everything into Cloudflare because the frontend uses Cloudflare.

Prefer hosted cloud services.

Use the Linux box only if necessary.

Possible categories:

```text
Cloudflare Workers
Cloudflare R2
free relational DB
free vector DB
free graph DB
managed queues
managed auth
```

The coding agent should research current free-tier options before implementation.

---

# 38. Database Responsibilities

Logical split:

```text
relational DB
→ users
→ lessons
→ mastery
→ messages
→ preferences

object storage
→ PDFs
→ images
→ board snapshots

vector store
→ RAG embeddings

graph DB
→ topic/prerequisite relationships
```

Canonical entities remain relational.

Graph DB handles relationships/querying.

---

# 39. Realtime Sync

Use:

```text
WebSockets
+
event log
```

Sync:

```text
lesson state
whiteboard changes
messages
mastery updates
agent actions
```

Students can resume a session on another device.

No requirement for seamless mid-call voice handoff.

---

# 40. Background Jobs

Use queues/jobs for:

```text
PDF processing
embeddings
graph building
RAGAS
question preprocessing
memory extraction
lesson summaries
notifications
```

Jobs may also be triggered by lesson events.

---

# 41. Push Notifications

iOS + web push.

Generated from:

```text
revision schedule
mastery decay
planned study
upcoming assessment
```

Examples:

```text
You planned to revise Electricity today.

Your mastery of Simultaneous Equations is starting to decay.
```

---

# 42. Observability

Developer dashboard should show:

```text
current lesson state
model calls
tool calls
retrieved chunks
latency
token usage
errors
whiteboard actions
mastery updates
```

This is extremely useful during judging/demo debugging.

---

# 43. Failure Handling

On failure:

```text
retry
↓
fallback
↓
student-safe error
```

Example student message:

```text
I couldn't retrieve that section properly. I'll use the cached material instead.
```

Developer view should contain the actual trace.

---

# 44. Model Selection

DO NOT hardcode model choices yet.

Before implementing model routing, the coding agent must ask:

> Edmund, which OpenAI models do you want used for:
> - live voice
> - main teaching agent
> - preprocessing
> - retrieval support
> - question generation
> - marking
> - cheap background tasks?

Free OpenAI credits are expected.

---

# 45. Hackathon Scope Discipline

Prioritize things judges can actually experience.

## Must Work

```text
login
onboarding
one or more subjects
RAG
voice
whiteboard
agent state machine
learner profile
mastery update
practice questions
citations
dashboard
```

## Nice to Have

```text
iOS app
collaborative study
push notifications
full knowledge graph visualization
offline mode
advanced revision planner
```

If behind schedule, cut nice-to-have features before weakening the core agent demo.

---

# 46. Primary Demo Scenario

Prepare ONE highly polished topic.

Example:

```text
Physics — Electricity
```

Demo script:

1. student asks to learn electricity
2. agent notices algebra prerequisite weakness
3. agent explains current/voltage/resistance
4. agent draws circuit
5. student gives misconception
6. agent recognizes it
7. agent switches teaching method
8. agent retrieves exact school note
9. agent gives school-paper-style question
10. student answers
11. agent marks answer
12. mastery increases
13. dashboard updates

This flow matters more than having every subject perfectly complete.

---

# 47. Guiding Principle

The product should not feel like:

```text
ChatGPT + PDFs
```

It should feel like:

```text
An AI system that knows
what you know,
what you don't know,
how you learn,
what your school expects,
and what it should teach you next.
```

That is the hackathon pitch.
:::
