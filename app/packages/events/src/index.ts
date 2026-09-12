export const events = [
  "lesson.started",
  "lesson.state.changed",
  "message.created",
  "whiteboard.changed",
  "practice.question.presented",
  "practice.answer.submitted",
  "practice.answer.marked",
  "mastery.updated",
  "misconception.recorded",
  "agent.tool.called",
  "agent.tool.completed",
  "lesson.completed",
  "classroom.course.synced",
  "classroom.coursework.synced",
  "classroom.material.ingested",
  "classroom.submission.changed",
  "classroom.grade.passed_back",
  "classroom.addon.opened",
] as const;

export type EventName = (typeof events)[number];
