/* School database: students, courses and enrolments */

PRAGMA foreign_keys = ON;

/* Drop in reverse order so the script can be re-run safely */
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

/* ---------- TABLES ---------- */

CREATE TABLE students (
  student_id INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  course_id INTEGER PRIMARY KEY,
  title     TEXT NOT NULL,
  credits   INTEGER NOT NULL CHECK (credits > 0)
);

/* Join table: one row per student on one course */
CREATE TABLE enrolments (
  enrolment_id INTEGER PRIMARY KEY,
  student_id   INTEGER NOT NULL,
  course_id    INTEGER NOT NULL,
  grade        INTEGER CHECK (grade BETWEEN 0 AND 100),
  FOREIGN KEY (student_id) REFERENCES students (student_id),
  FOREIGN KEY (course_id)  REFERENCES courses (course_id),
  UNIQUE (student_id, course_id)
);

/* Speeds up lookups of all students on a course */
CREATE INDEX idx_enrolments_course ON enrolments (course_id);

/* ---------- SAMPLE DATA ---------- */

INSERT INTO students (student_id, name, email) VALUES
  (1, 'Amina Wanjiku', 'amina@example.com'),
  (2, 'Brian Otieno',  'brian@example.com'),
  (3, 'Grace Mwangi',  'grace@example.com'),
  (4, 'Daniel Kiptoo', 'daniel@example.com');

INSERT INTO courses (course_id, title, credits) VALUES
  (1, 'Web Development',    4),
  (2, 'Databases',          3),
  (3, 'Python Programming', 4);

/* A NULL grade means the work has not been graded yet */
INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 78),
  (1, 2, 85),
  (2, 1, 64),
  (2, 3, NULL),
  (3, 2, 91),
  (3, 3, 72);

/* ---------- QUERIES ---------- */

/* Query 1: all courses for one student, found by name */
SELECT c.title, e.grade
FROM students s
JOIN enrolments e ON e.student_id = s.student_id
JOIN courses c    ON c.course_id  = e.course_id
WHERE s.name = 'Amina Wanjiku';

/* Query 2: all students on one course */
SELECT s.name, s.email, e.grade
FROM courses c
JOIN enrolments e ON e.course_id  = c.course_id
JOIN students s   ON s.student_id = e.student_id
WHERE c.title = 'Web Development';

/* Query 3: number of students per course (LEFT JOIN keeps empty courses) */
SELECT c.title, COUNT(e.enrolment_id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.course_id
GROUP BY c.course_id, c.title
ORDER BY student_count DESC, c.title;

/* Query 4: students who have no enrolments */
SELECT s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.student_id
WHERE e.enrolment_id IS NULL;

/* Query 5: update one enrolment's grade (Brian, Python Programming) */
UPDATE enrolments
SET grade = 80
WHERE student_id = (SELECT student_id FROM students WHERE name = 'Brian Otieno')
  AND course_id  = (SELECT course_id FROM courses WHERE title = 'Python Programming');

/* Check the update worked */
SELECT s.name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.student_id = e.student_id
JOIN courses c  ON c.course_id  = e.course_id
WHERE s.name = 'Brian Otieno';