import { expect, test } from "bun:test";
import type { ClassroomPost } from "../../../packages/shared-types/src/study";
import {
  badgeText,
  badgeTitle,
  classroomLink,
  dueLabel,
  dueSoon,
  notificationCopy,
  notificationKey,
  pendingNotifications,
} from "./dueSoon";

const now = Date.parse("2026-09-12T06:00:00Z");
const hours = (n: number) => new Date(now + n * 3_600_000).toISOString();
const post = (id: string, extra: Partial<ClassroomPost> = {}): ClassroomPost => ({
  id,
  type: "courseWork",
  courseId: "course-1",
  title: `Assignment ${id}`,
  description: "",
  attachments: [],
  ...extra,
});

test("due soon keeps only future assignments inside the window, soonest first", () => {
  const posts = [
    post("later", { dueAt: hours(40) }),
    post("sooner", { dueAt: hours(3) }),
    post("past", { dueAt: hours(-1) }),
    post("far", { dueAt: hours(49) }),
    post("undated"),
    post("broken", { dueAt: "not a date" }),
    post("material", { type: "courseWorkMaterials", dueAt: hours(2) }),
  ];
  expect(dueSoon(posts, now).map((p) => p.id)).toEqual(["sooner", "later"]);
});

test("badge text and title follow the count", () => {
  expect(badgeText(0)).toBe("");
  expect(badgeText(3)).toBe("3");
  expect(badgeText(12)).toBe("9+");
  expect(badgeText(-2)).toBe("");
  expect(badgeTitle(0)).toBe("Study your Classroom notes");
  expect(badgeTitle(1)).toBe("1 assignment due within 48 hours");
  expect(badgeTitle(4)).toBe("4 assignments due within 48 hours");
});

test("due labels read like a person wrote them", () => {
  expect(dueLabel(hours(0.5), now)).toBe("Due within the hour");
  expect(dueLabel(hours(5), now)).toBe("Due in 5 hours");
  expect(dueLabel(hours(30), now)).toMatch(/^Due (tomorrow|[A-Za-z]{3})$/);
  expect(dueLabel("garbage", now)).toBe("Due date unavailable");
});

test("notifications are announced once per deadline", () => {
  const first = post("a", { dueAt: hours(10) });
  const moved = post("a", { dueAt: hours(20) });
  const other = post("b", { dueAt: hours(12) });
  expect(pendingNotifications([first, other], [notificationKey(first)]).map((p) => p.id)).toEqual(["b"]);
  expect(pendingNotifications([moved], [notificationKey(first)]).map((p) => p.id)).toEqual(["a"]);
});

test("notification copy names the class, the deadline and the attached notes", () => {
  const copy = notificationCopy(
    post("a", { dueAt: hours(5), title: "Fuse ratings worksheet", attachments: [{ id: "f1", title: "Notes" }, { id: "f2", title: "More" }] }),
    { id: "course-1", name: "Sec 4 Physics" },
    now,
  );
  expect(copy.title).toBe("Due in 5 hours · Fuse ratings worksheet");
  expect(copy.message).toContain("Sec 4 Physics · 2 attached notes");
  expect(notificationCopy(post("b", { dueAt: hours(5) }), undefined, now).message).toContain("no attachments yet");
});

test("notification clicks only ever open Classroom", () => {
  expect(classroomLink("https://classroom.google.com/c/abc/a/def/details")).toBe("https://classroom.google.com/c/abc/a/def/details");
  for (const bad of ["https://evil.test/", "javascript:alert(1)", "http://classroom.google.com/", undefined, 42])
    expect(classroomLink(bad)).toBe("https://classroom.google.com/");
});
