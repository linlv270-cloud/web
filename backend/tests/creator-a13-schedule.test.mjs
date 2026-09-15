import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const profile = readFileSync(path.join(root, "frontend/profile.html"), "utf8");
const schedule = readFileSync(path.join(root, "frontend/schedule.html"), "utf8");
const publishedProfile = readFileSync(path.join(root, "backend/public/profile.html"), "utf8");

test("A1-3 schedule shell uses locked title and description", () => {
  assert.match(profile, /<h1>档期管理<\/h1>/);
  assert.match(profile, /告诉我哪天不可约你，减少打扰/);
  assert.match(profile, /data-schedule-src="schedule\.html\?embed=schedule&a13=1"/);
  assert.match(profile, /async function hydrateScheduleFrame/);
});

test("schedule home is fixed and has no dismiss action", () => {
  assert.doesNotMatch(profile, /a13CloseButton/);
  assert.doesNotMatch(profile, /closeA13Schedule/);
  assert.doesNotMatch(profile, /class="a13-close"/);
});

test("A1-3 keeps the old embedded calendar save contract", () => {
  assert.match(schedule, /action:'updateSchedule'/);
  assert.match(schedule, /busyPeriods:selectedDatesToPeriods\(\)/);
  assert.match(schedule, /parent\.postMessage\(\{type:'tde-schedule-saved'\}/);
  assert.match(schedule, /const IS_A13 = SCHEDULE_PARAMS\.get\('a13'\) === '1'/);
  assert.match(schedule, /body\.embed\.a13-embed \.card-head,body\.embed\.a13-embed \.cal-tip\{display:none\}/);
});

test("A1-3 does not show the removed platform-record explanation or unchanged button", () => {
  assert.doesNotMatch(schedule, /平台已有记录会保留并单独标记/);
  assert.doesNotMatch(profile, /scheduleUnchangedButton/);
  assert.doesNotMatch(profile, /档期没有变化/);
});

test("A1-3 does not show the last confirmation timestamp in the schedule panel", () => {
  assert.doesNotMatch(profile, /最后确认/);
  assert.doesNotMatch(profile, /scheduleLastConfirmed/);
});

test("creator profile logo and avatar return to the schedule home", () => {
  assert.match(profile, /class="brandmark" onclick="location\.href='profile\.html\?section=schedule'"/);
  assert.match(profile, /id="topAvatar"[^>]+onclick="location\.href='profile\.html\?section=schedule'"/);
  assert.doesNotMatch(profile, /class="brandmark" onclick="location\.href='index\.html'"/);
  assert.equal(publishedProfile, profile);
});

test("schedule home always renders the calendar view", () => {
  assert.match(profile, /if\(requestedSection==='schedule'\)\{await loadLocations\(\);await loadData\(\{a12Only:true\}\);showA13Schedule\(\);return\}/);
  assert.match(profile, /id="a13ScheduleFrame"/);
});

test("A1-3 published profile copy matches the frontend source", () => {
  assert.equal(publishedProfile, profile);
});
