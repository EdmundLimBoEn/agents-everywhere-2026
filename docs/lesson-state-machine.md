# Lesson state machine

The lesson is an explicit state machine enforced on the server in `app/services/agent/src/index.ts`. The model proposes text, an action, an assessment, a misconception, citations, and board items as strict JSON. The server rejects any reply whose action does not match the required transition, whose citation is not an exact substring of a retrieved passage, or that assesses an answer when no check question is pending.

## Entry

```text
Study notes opened with selected posts
→ verify the signed-in account can read the course and each selected post
→ load attachments; extract passages with stable ids (Docs paragraphs, PDF pages)
→ create lesson: courseId, selected posts, sources, learner, phase ready
```

## Phases

```text
ready → diagnostic → teaching / reteaching → practice → teach_back → complete
```

| Agent action | Phase after |
| --- | --- |
| `diagnostic` | diagnostic |
| `explain` | teaching |
| `reteach` | reteaching |
| `practice` | practice |
| `teach_back` | teach_back |
| `recap` | complete |
| `answer` | unchanged |

## Student intents and the required next action

| Intent | Required agent action |
| --- | --- |
| `teach` from ready | `diagnostic` |
| `answer` assessed incorrect or partial | `reteach` |
| `answer` assessed correct after diagnostic, explain, or reteach | `practice` |
| `answer` assessed correct after practice | `teach_back` |
| `answer` assessed correct after teach_back | `recap` |
| `simplify` | `reteach` |
| `example`, `skip` | `explain` |
| `question`, `why` | `answer` |
| `recap` | `recap` |

## Evidence rules

- An answer is assessed only when the previous agent action asked a check question and the lesson is not complete.
- Skips, questions, and interruptions are never graded and never count toward mastery.
- Each assessed answer stores the answer, the assessment, the diagnosed misconception, and the intervention text as evidence on the lesson and the learner profile.
- A recap is allowed only after a correct teach-back or an explicit recap request. It summarizes demonstrated understanding and remaining uncertainty and cites the notes to revisit.

## Observable adaptation

Run the same diagnostic twice, once with a wrong answer and once with a right one. The wrong answer must produce `reteach` with a named misconception and a citation. The right one must produce `practice`. Rewording the same script does not pass.
