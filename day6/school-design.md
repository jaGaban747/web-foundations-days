# School Database Design

## Tables

### students

Stores one row per student. The primary key is `student_id`. The `name` and `email` columns cannot be empty, and `email` is unique so two students cannot share an address.

### courses

Stores one row per course. The primary key is `course_id`. Each course has a `title` and a number of `credits`, and neither can be empty.

### enrolments

Stores one row for each student who is on a course. It holds `student_id` and `course_id` as foreign keys, plus the `grade`. The grade is allowed to be empty because a student can be enrolled before any work has been graded. A unique rule on the pair `student_id` and `course_id` stops the same student enrolling on the same course twice.

## Relationships

* **One student has many enrolments (one to many).** A single student can appear in many enrolment rows, but each enrolment row belongs to exactly one student.
* **One course has many enrolments (one to many).** A course can have many students enrolled, but each enrolment row belongs to exactly one course.
* **Students and courses are many to many.** A student can take many courses, and a course can have many students.

### Why a join table is needed

A relational table cannot store a list inside one column. If `students` held a column of course ids, one cell would need several values, and if `courses` held a column of student ids it would have the same problem. That breaks the rule that each cell holds one value, and it makes queries, updates and deletes error prone. The `enrolments` table solves this by turning the many to many relationship into two one to many relationships. It also gives the grade a natural home, because a grade belongs to the pair of a student and a course, not to either one alone.

## Index

I would add an index on `enrolments(course_id)`. The unique rule on `student_id` and `course_id` already creates an index that helps when searching by student. Searching for all students on one course, and counting students per course, filter by `course_id` alone and cannot use that index well. Without an index the database must read every enrolment row. As the number of enrolments grows into the thousands or millions, an index on `course_id` keeps those queries fast.

## SQL or NoSQL

I would choose SQL for this system. The data is highly structured and full of relationships: students, courses and enrolments all connect to each other, and the questions we ask, such as which students are on a course or which students have no enrolments, are built on joins. SQL enforces the rules I care about directly in the database, including unique emails, valid foreign keys and no duplicate enrolments, so bad data cannot get in. Grades and enrolments also need to stay consistent, and SQL transactions protect that. A NoSQL document database would suit data that changes shape often or needs to scale across many servers, but this system has a stable structure and modest size, so the strong consistency and joins of SQL are the better fit.