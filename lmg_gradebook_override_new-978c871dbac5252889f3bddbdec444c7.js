// ==UserScript==
// @name        View All Grades for a Student
// @namespace   https://github.com/erictrice/CanvasScripts
// @include     /^https://.*\.instructure\.com/?.*/users/[0-9]+$/
// @version     2
// @grant       none
// ==/UserScript==


/*
  This script is to display letter grades along with their percentage on 
  - student's Grades dashboard page(`/grades`)
  - Global Grades dashboard page(`/users/:user_id/grades`)

  For courses that have a set grading scheme, the course’s grading scheme will be utilized to 
  determine the letter grade to display for the course(This includes courses that have 
  selected a course-level grading scheme as well as courses that have selected an account-level grading scheme).

  For courses without a set grading scheme, “No Grading Scheme” will be displayed next to the percentage grade.
  Courses without scores will continue to be rendered as "no grade"
*/

const RELOAD_DELAY_MILLISECONDS = 1000;
var LETTER_GRADES_LEFT = 0;

$(document).ready(() => {
  if (onGradesPage()) {
    letterGradeOverride();
  }
});

function letterGradeOverride() {
  hideOriginalGrades();
  toggleLoading(true);
  const courseGradeRows = document.querySelectorAll("table.student_grades tr");
  if (courseGradeRows.length > 0) {
    LETTER_GRADES_LEFT = courseGradeRows.length;
    const userId = parseCourseRow(courseGradeRows[0])[1];
    fetchAndApplySchemes(userId, courseGradeRows);
  } else {
    toggleLoading(false);
  }
}

function fetchAndApplySchemes(userId, courseGradeRows) {
  getUserEnrollments(userId, (enrollments) => {
    const allCoursesAndGrades = extractCoursesAndGrades(enrollments);
    courseGradeRows.forEach((row) => processRow(row, allCoursesAndGrades, true));
  })
}

function extractCoursesAndGrades(enrollments) {
  var allCoursesAndGrades = {};
  enrollments.forEach(function (enrollment) {
    allCoursesAndGrades[enrollment.course_id] = enrollment.grades.current_grade
  });
  return allCoursesAndGrades;
}

function processRow(row, allCoursesAndGrades, firstPass) {
  const [courseId, userId, gradeCell] = parseCourseRow(row);
  if (firstPass) {
    const gradingPeriodSelect = row.querySelector("select.grading_periods_selector");
    if (gradingPeriodSelect) {
      $(gradingPeriodSelect).on("change", (e) => {
        gradeCell.classList.add("to-be-loaded");
        setTimeout(() => processRow(row, allCoursesAndGrades, false), RELOAD_DELAY_MILLISECONDS);
      });
    }
  }
  const cellText = gradeCell.innerText;
  const percentage = percentageGrade(cellText);

  if (percentage === undefined) {
    noGrade(gradeCell);
  } else {
    var grade = allCoursesAndGrades[courseId];
    if (grade) {
      applyLetterGrade(gradeCell, grade)
    } else {
      noCourseScheme(gradeCell)
    }
  }
}

// ajax calls
function getUserEnrollments(userId, callbackFn) {
  $.ajax({
    url: `/api/v1/users/${userId}/enrollments?per_page=100&type[]=StudentEnrollment`,
    success: (response) => callbackFn(response),
    error: (request, status, error) => displayError()
  });
}

function displayError() {
  console.log('ERROR TO FIND ENROLLMENT OR GRADE')
}

// for computing cell values
function parseCourseRow(row) {
  const courseHref = row.querySelector("td.course a").href;
  const slicedRef = courseHref.match(/.*\/courses\/(\d+)\/grades\/(\d+)$/);
  const courseId = slicedRef[1];
  const userId = slicedRef[2];
  const gradeCell = row.querySelector("td.percent");
  return [courseId, userId, gradeCell];
}

function percentageGrade(gradeText) {
  const grade = gradeText.match(/^(\d+\.*\d*)\%$/);
  return grade ? parseFloat(grade[1]) : undefined;
}

// for updating cell contents
function noCourseScheme(cell) {
  cell.classList.add("no-grading-scheme");
  var gradeText = `${cell.innerText} (no grading scheme)`
  updateGradeCell(cell, gradeText);
}

function noGrade(cell) {
  updateGradeCell(cell, "no grade");
}

function applyLetterGrade(cell, grade) {
  var gradeText = `${cell.innerText} (${grade})`
  updateGradeCell(cell, gradeText);
}

function updateGradeCell(cell, gradeText) {
  cell.innerText = gradeText;
  markRowComplete(cell);
}

function markRowComplete(cell) {
  cell.classList.remove("to-be-loaded");
  LETTER_GRADES_LEFT = LETTER_GRADES_LEFT - 1;
  if (LETTER_GRADES_LEFT === 0) toggleLoading(false);
}

function overrideFailed(cell) {
    cell.classList.add("no-grading-scheme");
    var gradeText = `${cell.innerText} (failed to load)`
    updateGradeCell(cell, gradeText);
}

// misc helpers
function onGradesPage() {
  const directGradesPage = window.location.pathname.match(/^\/grades/)
  const userGradesPage = window.location.pathname.match(/^\/users\/(\d+)\/grades/)
  return directGradesPage || userGradesPage;
}

function hideOriginalGrades() {
  $("table.student_grades tr td.percent").addClass("to-be-loaded");
}

function toggleLoading(loading) {
  if (loading) {
    const heading = document.querySelector("#content h2");
    $(heading).wrap("<div id='heading-wrapper'></div>");
    $("<h4 id='loading-letter-grades'>Retrieving letter grades...</h4>").insertAfter(heading);
  } else {
    $("#loading-letter-grades").remove();
  }
}
