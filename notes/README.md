# Notes dump

Put scraped school PDFs here. This folder is a raw dump, not the RAG store. Every dumped file must link to a Google Classroom item.

## What belongs here

- School notes
- Worksheets
- Practice papers
- Answer keys and mark schemes
- Reference documents used for teaching

Students do not upload curriculum files. The team scrapes or collects them, then drops the files here. Classroom materials the teacher already attached are ingested from Drive. Do not copy those into this folder unless you also need a local scrape copy.

## Link to Classroom

After you add a PDF, add a row in `classroom-links.yaml`. Ingest fails demo content that has no `courseId` and `itemId`.

```yaml
links:
  - path: physics/electricity/sst-science-notes.pdf
    courseId: ""
    itemType: courseWork
    itemId: ""
    driveFileId: ""
    topic: physics/electricity
```

Leave ids empty only while you create the Classroom assignment. Fill them before ingest. Do not invent fake PDFs to fill the folder.

## Naming

Use a path that a person can read without opening the file.

```text
notes/
  classroom-links.yaml
  <subject>/
    <source-or-year>/
      <short-title>.pdf
```

Keep the original filename if it already names the subject, topic, and source.

## What does not belong here

- Processed chunks, embeddings, or golden eval sets. Those live under `app/services/rag` and `app/packages/evals` after ingest.
- App code, prompts, or learner data.
- Fake sample papers.

## After you dump files

Ingest is a one-time expensive setup. See [How to ingest school notes](../docs/how-to-ingest-notes.md).
