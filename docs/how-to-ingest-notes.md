# How to ingest school notes

Use this after someone dumps PDFs into `notes/` and links them to Classroom. Students never upload curriculum files.

## Before you start

1. Put files under `notes/<subject>/...` as described in `notes/README.md`.
2. Add a row per file in `notes/classroom-links.yaml`. Demo files without a Classroom `itemId` fail ingest.
3. Run `app/scripts/classroom-sync` so those ids exist.
4. Pick one polished topic. The plan's example is Physics, Electricity, on one Classroom `courseWork` item.
5. Ask Edmund which OpenAI models to use for ingestion before you spend tokens.

This setup can burn a lot of tokens once. Runtime teaching should stay fast.

## Pipeline

```text
Classroom sync (courses, coursework, materials, announcements)
→ PDF and Classroom Drive files
→ parse
→ extract text, tables, diagrams
→ identify subject, topic, subtopic
→ attach courseId, itemType, itemId
→ extract definitions, formulas, worked examples
→ extract questions, answers, mark schemes
→ chunk (keep page, document, and Classroom ids)
→ embed
→ build topic graph (SUPPORTS_COURSEWORK edges)
→ evaluate with golden questions and RAGAS
```

Do not flatten diagrams and tables into unmarked plain text.

Preserve document, page, subject, topic, subtopic, source type, Classroom ids, and question references.

Classroom materials that were never copied into `notes/` still enter this pipeline from Drive.

## Retrieval at runtime

Use vector search, keyword/BM25, graph context, Classroom item filters, and reranking. Prefer chunks linked to the open `itemId`, then the same `courseId`, then the rest of the topic.

## Evaluation

Keep a small golden set from the real school files in `app/packages/evals`. Include at least one question whose cited source is a Classroom material and one whose source is a `notes/` PDF. Measure retrieval precision and recall, faithfulness, citation correctness, and answer relevance.

## After ingest

Processed artifacts belong with `app/services/rag`, not back in `notes/`. Leave the PDFs in `notes/` as the raw dump.
