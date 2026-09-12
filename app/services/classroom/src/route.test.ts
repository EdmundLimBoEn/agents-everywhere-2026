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
import { classroomPostRef } from '../../../packages/classroom-api/src/route';
test('post URLs resolve to the class and post ids regardless of account prefix or suffix', () => {
  expect(classroomPostRef('https://classroom.google.com/u/0/c/ODg0Njg4ODUwMzU0/a/MTIzNDU2/details')).toEqual({ courseRef: '884688850354', kind: 'a', postRef: '123456' });
  expect(classroomPostRef('/c/Y291cnNlLTE=/m/cG9zdC1i/details?hl=en#top')).toEqual({ courseRef: 'course-1', kind: 'm', postRef: 'post-b' });
  expect(classroomPostRef('https://classroom.google.com/w/ODg0Njg4ODUwMzU0/p/OTg3/details')).toEqual({ courseRef: '884688850354', kind: 'p', postRef: '987' });
  expect(classroomPostRef('https://classroom.google.com/c/ODg0Njg4ODUwMzU0/t/all')).toBeUndefined();
  expect(classroomPostRef('https://example.com/c/ODg0Njg4ODUwMzU0/a/MTIzNDU2/details')).toBeUndefined();
});
