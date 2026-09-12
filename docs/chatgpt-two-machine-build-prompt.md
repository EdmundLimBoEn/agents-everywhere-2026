# SHARED PROJECT RULES

Historical ChatGPT canvas. Classroom OAuth, the add-on, and `app/services/classroom` are now Machine 1 work. See `docs/theme-fit.md`.

You are working on a hackathon project: a specialised adaptive AI study agent for students.

There are **two machines working in parallel on one monorepo**.

Do not casually edit files owned by the other machine.

Use shared contracts for integration:

- OpenAPI is the API source of truth.
- Shared schemas live in `/packages/schemas`.
- Shared event definitions live in `/packages/events`.
- Shared agent tool schemas live in `/packages/agent-tools`.
- Breaking contract changes must be documented before implementation.
- Prefer TypeScript wherever practical.
- Ask Edmund before choosing OpenAI models.
- Optimise for hackathon demo quality, not production-scale perfection.

The core demo must achieve:

```text
student starts lesson
→ agent identifies what to teach
→ retrieves school material
→ teaches by voice
→ draws on shared whiteboard
→ detects misconception
→ changes teaching strategy
→ gives matching practice question
→ evaluates answer
→ updates mastery
→ dashboard reflects progress
```

---

# MACHINE 1 — PRODUCT, PLATFORM & REALTIME

## Mission

Build everything the student directly interacts with and the platform infrastructure connecting the clients to the AI system.

Machine 1 owns:

```text
Web app
iOS app
API gateway
authentication
sessions
realtime sync
whiteboard
voice transport
push notifications
persistent app state
developer observability UI
```

Machine 1 should NOT implement the internal RAG pipeline or teaching intelligence beyond mocked interfaces initially.

---

## 1. Repository Areas

Primary ownership:

```text
/apps/web
/apps/ios

/services/api
/services/realtime

/packages/openapi
/packages/events
/packages/shared-types

/infra
```

Coordinate before editing:

```text
/packages/schemas
/packages/agent-tools
```

---

# 2. Web App

Stack:

```text
Next.js
TypeScript
Cloudflare Workers
```

Build these screens:

```text
/
onboarding
home/dashboard
subjects
topic
lesson
whiteboards
lesson-history
learner-profile
settings
developer
```

---

# 3. Onboarding

Student does NOT upload PDFs.

Ask a short questionnaire covering:

```text
voice vs reading
examples vs theory
diagrams vs text/equations
fast vs detailed explanations
frequency of questions
preferred teacher vibe
subject confidence
exam goals
```

Save responses into the learner profile API.

---

# 4. Home Dashboard

Show:

```text
Continue Learning
Start Learning
Recommended Topic
Weak Topics
Revision Due
Subjects
Recent Lessons
```

Student can choose:

```text
Learn <topic>
```

or:

```text
What should I study?
```

---

# 5. Lesson Interface

The central hackathon screen.

Desktop layout:

```text
┌─────────────────────────────────────────┐
│ lesson goal / subject / progress        │
├───────────────────┬─────────────────────┤
│                   │                     │
│ chat / voice      │ shared whiteboard   │
│                   │                     │
├───────────────────┴─────────────────────┤
│ source chips / controls / status        │
└─────────────────────────────────────────┘
```

Support:

```text
text messages
live voice
agent interruptions
citations
practice questions
whiteboard interaction
lesson goal
mastery updates
```

Keep the UI clean.

Do not expose internal agent complexity to normal students.

---

# 6. Voice / GPT Live

Use the architecture:

```text
Client
↕ realtime audio
OpenAI Realtime

Client
↕ application state/tools
Backend
```

Backend provides short-lived Realtime credentials.

Never expose the main OpenAI API key.

The live session should be capable of:

```text
natural conversation
student interruption
agent interruption
tool calls
whiteboard actions
retrieval requests
practice requests
```

IMPORTANT:

Before configuring OpenAI models, ask Edmund which model to use.

---

# 7. Agent Tool Transport

The AI is allowed to call backend teaching tools.

Machine 1 builds the secure transport/execution boundary.

Example API:

```ts
POST /agent/tools/:toolName
```

Validate every call using strict schemas.

Potential tools:

```text
searchNotes
searchPracticePapers
getLearnerProfile
updateMastery
recordMisconception
getTopicGraph
getWhiteboard
modifyWhiteboard
markAnswer
getPracticeQuestion
generatePracticeQuestion
saveLesson
recommendNextTopic
```

Actual intelligence behind many of these is owned by Machine 2.

Machine 1 exposes clean endpoints.

---

# 8. Whiteboard — Web

Use Excalidraw.

Store its scene JSON.

Student and AI can both modify the same board.

Expose high-level actions:

```ts
addText()
drawArrow()
drawShape()
highlightElement()
moveElement()
deleteElement()
```

Also allow raw scene modifications for complex operations.

Persist:

```text
board
scene
lessonId
studentId
timestamps
```

Boards survive between lessons.

---

# 9. Whiteboard — iOS

Use:

```text
SwiftUI
PencilKit
```

Fully native UI.

Do NOT make the iOS app a web wrapper.

Create a translation layer between:

```text
PencilKit/native board
↕
shared board representation
↕
Excalidraw
```

Perfect rendering parity is not required for the hackathon.

Semantic compatibility is more important.

---

# 10. iOS App

Feature parity with web where practical:

```text
onboarding
dashboard
subjects
lessons
voice
whiteboards
learner profile
progress
lesson history
settings
```

Additional native feature:

```text
push notifications
```

No Live Activities.

If only one of the two development machines can run Xcode, the iOS work MUST stay on that machine regardless of the rest of this split.

---

# 11. Authentication

Current plan:

```text
Google
Apple
optional email
school SSO later
```

Do not commit to a provider until evaluating free tiers.

Use whatever service offers:

```text
good free tier
Next.js support
Swift support
simple OAuth
```

---

# 12. Database / Cloud

Cloud-first.

Free-tier-first.

Do NOT select D1 simply because Cloudflare hosts the app.

Choose the best free service for each workload.

Machine 1 owns relational application state such as:

```text
users
profiles
sessions
lessons
messages
whiteboards
mastery records
preferences
notifications
```

Canonical entities should be relational.

Machine 2 may use separate graph/vector systems.

---

# 13. Object Storage

Store:

```text
PDF files
source images
whiteboard snapshots if needed
lesson exports
```

Prefer cheap/free object storage such as R2 if appropriate.

---

# 14. Realtime Sync

Use:

```text
WebSockets
+
event log
```

Synchronise:

```text
lesson state
messages
whiteboard changes
agent actions
mastery changes
practice state
```

A student should be able to leave web and resume the same lesson on iOS.

Mid-call voice handoff is NOT required.

---

# 15. Shared Events

Define typed events such as:

```ts
lesson.started
lesson.state.changed

message.created

whiteboard.changed

practice.question.presented
practice.answer.submitted
practice.answer.marked

mastery.updated

misconception.recorded

agent.tool.called
agent.tool.completed

lesson.completed
```

Machine 2 consumes and emits these.

---

# 16. Offline Mode

Implement basic degraded functionality:

```text
read cached notes
read lesson history
view saved boards
create/edit boards
```

AI tutoring requires internet.

Sync changes when connection returns.

Do not overengineer offline conflict resolution.

---

# 17. Notifications

Support:

```text
iOS push
web push
```

Events may include:

```text
revision due
mastery decay
study plan reminder
upcoming assessment
```

Machine 2 decides *what* should be recommended.

Machine 1 handles delivery.

---

# 18. Learner Profile UI

Student can inspect/edit:

```text
learning preferences
goals
mastery
misconceptions
confidence
teacher style preference
memory
```

The student must be able to see what the AI believes about them.

---

# 19. Sources UI

AI answers can contain lightweight chips:

```text
[Science Notes · p.14]
```

Click to show:

```text
document
page
relevant extract
```

Normal users should not see retrieval scores.

---

# 20. Developer Dashboard

Build a developer-only screen displaying:

```text
lesson state
agent calls
tool calls
retrieved documents
latency
token usage
errors
whiteboard actions
mastery changes
event log
```

Machine 2 should expose tracing data to this screen.

This dashboard is important during the hackathon.

---

# 21. Failure UX

Student sees:

```text
short
nontechnical
recoverable
```

Example:

> I couldn't retrieve that section. I'll try the cached material instead.

Developer dashboard sees the actual exception and trace.

---

# 22. Machine 1 Development Order

Build in this order:

```text
1. monorepo skeleton
2. OpenAPI + shared schemas
3. auth
4. relational persistence
5. Next.js shell
6. dashboard
7. lesson UI
8. mock agent responses
9. Excalidraw integration
10. realtime event system
11. OpenAI Realtime connection
12. backend agent tool endpoints
13. connect Machine 2 intelligence
14. learner profile
15. developer dashboard
16. iOS SwiftUI app
17. PencilKit
18. notifications
19. polish
```

Use mocks aggressively until Machine 2 endpoints become available.

---

# MACHINE 2 — AI, RAG, KNOWLEDGE & TEACHING ENGINE

## Mission

Build the intelligence behind the product.

Machine 2 owns:

```text
content ingestion
RAG
embeddings
hybrid search
knowledge graph
RAGAS
agent runtime
lesson state machine
learner model
memory extraction
practice-paper system
question generation
marking
teaching strategy
revision planning
```

Machine 2 should expose these capabilities through clean interfaces consumed by Machine 1.

---

# 1. Repository Areas

Primary ownership:

```text
/services/agent
/services/rag
/services/jobs

/packages/rag-core
/packages/evals
/packages/agent-runtime

/content
/scripts/ingest
/scripts/evaluate
```

Coordinate before editing:

```text
/packages/schemas
/packages/agent-tools
/packages/events
/packages/openapi
```

---

# 2. Content Inputs

The team manually uploads:

```text
school notes
worksheets
practice papers
answer keys
mark schemes
reference materials
```

Students never upload their own curriculum materials.

---

# 3. Ingestion Pipeline

Build:

```text
PDF
↓
parse
↓
extract text
↓
extract tables
↓
extract diagrams/images
↓
identify subject/topic/subtopic
↓
extract concepts
↓
extract formulas
↓
extract worked examples
↓
extract questions
↓
extract answers
↓
extract marking guidance
↓
build chunks
↓
create embeddings
↓
build graph
```

Preserve:

```text
document
page
subject
topic
subtopic
source type
question reference
```

Multimodal information should not be flattened away unnecessarily.

---

# 4. Heavy Preprocessing

This is a hackathon.

It is acceptable to spend substantial model tokens once during setup.

Use stronger processing to precompute:

```text
topics
subtopics
definitions
relationships
prerequisites
question archetypes
difficulty
marking patterns
worked examples
misconception candidates
```

Do expensive work ahead of judging.

Runtime should be fast.

---

# 5. RAG

Use:

```text
vector retrieval
+
keyword/BM25 retrieval
+
graph context
+
reranking
```

Return structured results:

```ts
{
  id,
  text,
  document,
  page,
  subject,
  topic,
  subtopic,
  sourceType,
  relevance,
  graphContext
}
```

---

# 6. Vector Search

Architecture should allow:

```text
pgvector initially
```

or another free vector service.

Do not overcommit to infrastructure.

Choose the best free-tier solution available when implementing.

---

# 7. Knowledge Graph

Represent:

```text
Subject
Topic
Skill
Question
Misconception
Resource
```

Relationships:

```text
REQUIRES
RELATED_TO
APPEARS_IN
TESTS
USES_SKILL
HAS_MISCONCEPTION
BELONGS_TO
```

Example:

```text
Algebra
    ↓ prerequisite
Simultaneous Equations
    ↓ useful for
Circuit Calculations
```

The teaching agent can traverse this graph when diagnosing weakness.

---

# 8. Practice Papers

Extract:

```text
question
marks
topic
subtopic
difficulty
question archetype
answer
mark scheme
paper
year
```

Retrieve real questions based primarily on:

```text
weak topic
+
appropriate difficulty
```

Do NOT attempt complicated exam prediction.

---

# 9. Question Archetypes

Support categories including:

```text
calculate
describe
explain
compare
evaluate
source-based
application
multi-step
graph interpretation
reasoning
```

Track which archetypes each student struggles with.

---

# 10. Generated Practice

Generate questions when the existing bank does not provide enough useful practice.

Generated questions should strongly imitate:

```text
school wording
school difficulty
mark allocations
answer length
command words
structure
```

Clearly mark them as AI-generated.

---

# 11. Marking

Where mark schemes exist:

```text
compare against marking scheme
+
evaluate conceptual correctness
```

Return:

```ts
{
  score,
  maxScore,
  correctness,
  missingPoints,
  misconception,
  feedback,
  suggestedNextAction
}
```

The teaching agent should be able to say:

> Correct concept, but you would likely lose one mark because you didn't state ___.

---

# 12. RAG Evaluation

Use RAGAS.

Also create a human-labelled golden test set.

Tests should measure:

```text
retrieval precision
retrieval recall
faithfulness
citation correctness
answer relevance
```

Add regression testing.

A change that makes retrieval worse should be detectable.

---

# 13. Learner Model

Track:

```text
preferences
goals
subject mastery
topic mastery
confidence
mistakes
misconceptions
question archetype weaknesses
intervention history
successful explanation styles
spaced repetition state
lesson history
```

---

# 14. Mastery

Do NOT represent mastery with only one number.

Track:

```text
mastery
confidence
evidence
last tested
decay
attempts
hints used
response time
explanation quality
```

Distinguish:

```text
correct + confident
correct + unsure
wrong + confident
wrong + unsure
```

---

# 15. Memory

Conversations remain searchable long-term.

Extract only learning-relevant structured memory.

Example:

```ts
{
  type: "misconception",
  topic: "electricity",
  value: "believes current is consumed by components",
  evidenceMessageId: "...",
  confidence: 0.91
}
```

Students can inspect/edit/delete structured memory.

---

# 16. Teaching Agent

The main AI is an adaptive teacher.

Not a generic chatbot.

It should:

```text
observe
diagnose
plan
retrieve
teach
test
adapt
update
```

---

# 17. Agent Identity

The AI must remain visibly AI.

It should NOT:

```text
pretend to be human
imply feelings
act like a friend
encourage emotional dependency
use excessive flattery
agree purely to please the student
```

Teacher-style praise is allowed.

Example:

```text
Good — you applied conservation of energy correctly.
```

Avoid:

```text
That's such an amazing idea!
I'm so proud of you!
```

---

# 18. Teaching Strategy

When a student struggles:

```text
diagnose first
```

Then select:

```text
hint
simpler explanation
analogy
diagram
worked example
prerequisite review
practice
Socratic question
voice explanation
whiteboard activity
```

Do not simply regenerate the same explanation.

---

# 19. Lesson State Machine

Implement:

```text
IDLE

GOAL_SELECTION

ASSESS_PRIOR_KNOWLEDGE

TEACH

CHECK_UNDERSTANDING

DIAGNOSE

RETEACH

PRACTICE

ASSESS

UPDATE_MASTERY

SUMMARY

COMPLETE
```

Critical transitions are deterministic.

Teaching-path choices can be model-driven.

---

# 20. Lesson Planning

Default agent:

```text
short rolling 3–5 step plan
```

Full autonomous lesson mode:

```text
objective
success criteria
teaching sequence
checkpoints
practice
fallback explanation
assessment
summary
```

---

# 21. Freeform Learning

Student can ignore structured lessons and simply ask questions.

Structured goals are optional.

The same learner model and memory still apply.

---

# 22. Teaching Modes

## Learning Mode

Optimise for:

```text
understanding
conceptual depth
connections
diagrams
discussion
```

## Exam Mode

Optimise for:

```text
marks
timing
school phrasing
question archetypes
recall
```

The agent can recommend switching modes.

---

# 23. Interest Depth

Default to concise syllabus-level teaching.

If the student clearly wants deeper understanding, allow enrichment beyond school content.

External knowledge must be distinguished from school-grounded material.

---

# 24. Citations

When information comes from school RAG:

return citation metadata.

When using external/general knowledge:

mark it separately.

Never blur the two sources.

---

# 25. Agent Specialists

Main teaching agent may call hidden specialists:

```text
retriever
lesson planner
marker
question generator
mastery evaluator
memory extractor
whiteboard planner
```

Do not turn these into visible personas.

---

# 26. Tool Interface

Machine 2 should implement tool behavior matching shared schemas:

```text
searchNotes
searchPracticePapers
getLearnerProfile
updateMastery
recordMisconception
getTopicGraph
getPracticeQuestion
generatePracticeQuestion
markAnswer
recommendNextTopic
saveLessonSummary
```

---

# 27. Whiteboard Intelligence

Machine 2 does NOT render the board.

Instead return semantic actions.

Example:

```json
{
  "action": "drawArrow",
  "from": "battery",
  "to": "resistor",
  "label": "conventional current"
}
```

Machine 1 executes the visual action.

For complex scenes, Machine 2 may produce raw scene instructions if the shared contract supports them.

---

# 28. Whiteboard Pedagogy

The agent may use tasks such as:

```text
complete this circuit
label this organ
draw the force arrow
finish the graph
circle the incorrect part
move this label
```

Whiteboard interactions can update mastery.

---

# 29. Revision Planner

Use:

```text
mastery
decay
mistakes
confidence
assessment dates
```

Generate:

```text
recommended next topic
revision due
spaced repetition schedule
```

Machine 1 displays/sends reminders.

---

# 30. Spaced Repetition

Intervals should adapt based on:

```text
performance
confidence
hints
mistakes
time since last review
```

No need to implement a scientifically perfect algorithm.

Make it believable and demonstrable.

---

# 31. Proactive Agent Behavior

The agent may:

```text
suggest stopping when objective is achieved
suggest continuing when mastery is weak
interrupt to correct misconceptions
change teaching strategy
recommend another topic
```

It should remain focused on learning.

---

# 32. Student Confusion Signals

Possible weak signals:

```text
repeated wrong answers
repeated "I don't get it"
long hesitation
frequent hints
contradictory explanations
```

Do not treat emotional/confusion inference as fact.

Use it only to adjust teaching strategy.

---

# 33. Collaborative Study

Support the data model for:

```text
2–4 students
one lesson
one agent
shared board
```

Do not build sophisticated participation analytics unless time remains.

---

# 34. Background Jobs

Machine 2 owns jobs such as:

```text
PDF ingestion
embeddings
knowledge graph creation
RAGAS
memory extraction
lesson summarisation
question preprocessing
revision schedule recalculation
```

Use managed/free queue systems where practical.

---

# 35. Observability

Emit structured tracing data:

```text
model call
agent state
tool selected
tool inputs
tool outputs
retrieved chunk IDs
latency
token usage
errors
mastery decision
```

Machine 1 developer dashboard consumes this.

---

# 36. Model Routing

DO NOT decide model names automatically.

Before implementing this section, STOP and ask Edmund:

> Which OpenAI models should we use for:
> - GPT Live / voice
> - main teaching agent
> - lesson planning
> - ingestion
> - question generation
> - marking
> - memory extraction
> - cheap background tasks?

Edmund expects to have OpenAI credits.

---

# 37. Machine 2 Development Order

Build in this order:

```text
1. schemas/contracts with Machine 1
2. ingest one polished subject/topic
3. chunking
4. embeddings
5. hybrid retrieval
6. citations
7. golden evaluation set
8. RAGAS
9. topic graph
10. practice-paper extraction
11. learner model
12. mastery engine
13. lesson state machine
14. teaching agent
15. tool implementations
16. marking
17. whiteboard action generation
18. memory extraction
19. revision planner
20. tracing
21. expand to more subjects
```

---

# MERGE / INTEGRATION CONTRACT

The two machines should integrate around these boundaries:

```text
Machine 1
UI / realtime / transport / storage / execution

          ↓ OpenAPI + events + tools ↑

Machine 2
AI / RAG / planning / teaching / evaluation
```

Avoid direct imports across deeply internal folders.

Prefer API/tool contracts.

---

# DAILY INTEGRATION CHECK

Regularly verify this exact path:

```text
Web lesson starts
↓
Machine 1 creates lesson session
↓
Machine 2 receives learner state
↓
Machine 2 retrieves school notes
↓
Machine 2 chooses teaching action
↓
Machine 1 renders response
↓
Machine 2 requests whiteboard action
↓
Machine 1 draws it
↓
student submits answer
↓
Machine 2 marks it
↓
Machine 2 updates mastery
↓
Machine 1 dashboard changes
```

If that path works, the project works.

---

# HACKATHON CUT LINE

If time becomes short, DO NOT sacrifice the central demo.

Prioritise:

```text
web app
one polished subject
RAG
voice
whiteboard
adaptive teaching
misconception handling
practice question
mastery update
citations
```

Cut first:

```text
offline
collaborative sessions
full iOS parity
notifications
advanced graphs
large subject coverage
```

A convincing narrow demo beats a half-working giant platform.
:::

One practical adjustment: if one machine is a Mac and the other is not, put **all Swift/Xcode work on the Mac**, even if that means shifting some Machine 1 web work to Machine 2 temporarily.
