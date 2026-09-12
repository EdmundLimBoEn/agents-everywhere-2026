import { test, expect } from 'bun:test';
import { classroomCourseRef } from '../../../packages/classroom-api/src/route';
test('real Stream, Classwork and People URLs resolve to the same class', () => {
  for (const route of ['c','w','r']) {
    expect(classroomCourseRef(`https://classroom.google.com/u/0/${route}/ODg0Njg4ODUwMzU0/t/all`)).toBe('884688850354');
    expect(classroomCourseRef(`https://classroom.google.com/${route}/ODg0Njg4ODUwMzU0`)).toBe('884688850354');
  }
  expect(classroomCourseRef('https://classroom.google.com/u/2/h')).toBeUndefined();
  expect(classroomCourseRef('https://example.com/c/ODg0Njg4ODUwMzU0')).toBeUndefined();
  expect(classroomCourseRef('https://classroom.google.com/u/0/w/Y291cnNlLTE=/t/all')).toBe('course-1');
});
