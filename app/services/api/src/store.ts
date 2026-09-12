import { Database } from "bun:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Lesson,
  LearnerProfile,
} from "../../../packages/shared-types/src/study";

export class Store {
  private db: Database;
  constructor(path = "data/study.sqlite") {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path, { create: true });
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS lessons (id TEXT NOT NULL, owner TEXT NOT NULL, course TEXT NOT NULL, updated TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(owner,id));
      CREATE TABLE IF NOT EXISTS profiles (owner TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (owner TEXT NOT NULL, lesson TEXT NOT NULL, request TEXT NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(owner,lesson,request), FOREIGN KEY(owner,lesson) REFERENCES lessons(owner,id) ON DELETE CASCADE);`);
  }
  lesson(owner: string, id: string): Lesson | null {
    const row = this.db
      .query("SELECT data FROM lessons WHERE owner=? AND id=?")
      .get(owner, id) as { data: string } | null;
    return row ? JSON.parse(row.data) : null;
  }
  list(owner: string, course?: string) {
    const rows = (
      course
        ? this.db
            .query(
              "SELECT data FROM lessons WHERE owner=? AND course=? ORDER BY updated DESC LIMIT 100",
            )
            .all(owner, course)
        : this.db
            .query(
              "SELECT data FROM lessons WHERE owner=? ORDER BY updated DESC LIMIT 100",
            )
            .all(owner)
    ) as { data: string }[];
    return rows.map((row) => {
      const l: Lesson = JSON.parse(row.data);
      return {
        id: l.id,
        title: l.title,
        courseId: l.courseId,
        updatedAt: l.updatedAt,
      };
    });
  }
  save(owner: string, lesson: Lesson) {
    this.db
      .query(
        "INSERT INTO lessons VALUES (?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET updated=excluded.updated,data=excluded.data",
      )
      .run(
        lesson.id,
        owner,
        lesson.courseId,
        lesson.updatedAt,
        JSON.stringify(lesson),
      );
  }
  profile(owner: string, name = ""): LearnerProfile {
    const row = this.db
      .query("SELECT data FROM profiles WHERE owner=?")
      .get(owner) as { data: string } | null;
    return row
      ? JSON.parse(row.data)
      : {
          name,
          pace: "balanced",
          explanation: "examples",
          goals: "",
          evidence: [],
        };
  }
  saveProfile(owner: string, profile: LearnerProfile) {
    this.db
      .query(
        "INSERT INTO profiles VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET data=excluded.data",
      )
      .run(owner, JSON.stringify(profile));
  }
  turn(
    owner: string,
    lesson: string,
    request: string,
  ): { fingerprint: string; data: Lesson } | null {
    const row = this.db
      .query(
        "SELECT fingerprint,data FROM turns WHERE owner=? AND lesson=? AND request=?",
      )
      .get(owner, lesson, request) as {
      fingerprint: string;
      data: string;
    } | null;
    return row ? { ...row, data: JSON.parse(row.data) } : null;
  }
  commitTurn(
    owner: string,
    lesson: Lesson,
    request: string,
    fingerprint: string,
    profile: LearnerProfile,
  ) {
    this.db.transaction(() => {
      this.save(owner, lesson);
      this.saveProfile(owner, profile);
      this.db
        .query("INSERT INTO turns VALUES (?,?,?,?,?)")
        .run(owner, lesson.id, request, fingerprint, JSON.stringify(lesson));
    })();
  }
  deleteLesson(owner: string, id: string) {
    this.db.transaction(() => {
      this.db
        .query("DELETE FROM lessons WHERE owner=? AND id=?")
        .run(owner, id);
      const p = this.profile(owner);
      p.evidence = p.evidence.filter((e) => e.lessonId !== id);
      this.saveProfile(owner, p);
    })();
  }
  deleteEvidence(owner: string, id: string) {
    this.db.transaction(() => {
      const p = this.profile(owner);
      p.evidence = p.evidence.filter((e) => e.id !== id);
      this.saveProfile(owner, p);
      const rows = this.db
        .query("SELECT data FROM lessons WHERE owner=?")
        .all(owner) as { data: string }[];
      for (const row of rows) {
        const l: Lesson = JSON.parse(row.data);
        if (l.evidence.some((e) => e.id === id)) delete l.catchUp;
        l.evidence = l.evidence.filter((e) => e.id !== id);
        this.save(owner, l);
      }
      // Cached turn snapshots contain evidence too; remove them when the learner forgets it.
      this.db.query("DELETE FROM turns WHERE owner=?").run(owner);
    })();
  }
  deleteProfile(owner: string) {
    this.db.transaction(() => {
      this.db.query("DELETE FROM lessons WHERE owner=?").run(owner);
      this.db.query("DELETE FROM profiles WHERE owner=?").run(owner);
    })();
  }
  close() {
    this.db.close();
  }
}
