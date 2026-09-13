import assert from "node:assert/strict";
import { test } from "node:test";
import { canApproveTask, canCreateProject, canProjectAction } from "../lib/project-permissions.ts";

const superAdmin = { id: null, role: "super", label: "超级管理员" };
const manager = { id: 10, role: "subadmin", label: "项目经理" };
const member = { id: 11, role: "subadmin", label: "成员" };
const observer = { id: 12, role: "subadmin", label: "观察者" };

test("super administrators have platform-level project permissions", () => {
  assert.equal(canCreateProject(superAdmin).allowed, true);
  assert.equal(canProjectAction(superAdmin, null, "VIEW_PROJECT").allowed, true);
  assert.equal(canProjectAction(superAdmin, null, "MANAGE_MEMBERS").allowed, true);
  assert.equal(canProjectAction(superAdmin, null, "PAUSE_RESUME_PROJECT").allowed, true);
  assert.equal(canProjectAction(superAdmin, null, "DELETE_PROJECT").allowed, false);
  assert.equal(canProjectAction(superAdmin, null, "DELETE_ACTIVITY_LOG").allowed, false);
});

test("project managers can operate an assigned project but cannot create or delete it", () => {
  const membership = { userId: 10, role: "PROJECT_MANAGER" };
  assert.equal(canCreateProject(manager).allowed, false);
  assert.equal(canProjectAction(manager, membership, "MANAGE_TASKS").allowed, true);
  assert.equal(canProjectAction(manager, membership, "PUBLISH_PLAN").allowed, true);
  assert.equal(canProjectAction(manager, membership, "APPROVE_TASK", { approverId: 11 }).allowed, true);
  assert.equal(canProjectAction(manager, membership, "DELETE_PROJECT").allowed, false);
  assert.equal(canProjectAction(manager, membership, "PAUSE_RESUME_PROJECT").allowed, false);
});

test("members are scoped to their own tasks and observers are read-only", () => {
  const membership = { userId: 11, role: "MEMBER" };
  assert.equal(canProjectAction(member, membership, "VIEW_PROJECT").allowed, true);
  assert.equal(canProjectAction(member, membership, "UPDATE_OWN_TASK", { ownerId: 11 }).allowed, true);
  assert.equal(canProjectAction(member, membership, "UPDATE_OWN_TASK", { ownerId: 99 }).allowed, false);
  assert.equal(canProjectAction(member, membership, "APPROVE_TASK", { approverId: 11 }).allowed, false);
  assert.equal(canProjectAction(observer, { userId: 12, role: "OBSERVER" }, "VIEW_PROJECT").allowed, true);
  assert.equal(canProjectAction(observer, { userId: 12, role: "OBSERVER" }, "EDIT_PROJECT").allowed, false);
});

test("approval distinguishes the designated approver from a regular member", () => {
  assert.equal(canApproveTask(member, { userId: 11, role: "MEMBER" }, { approverId: 11 }).allowed, false);
  assert.equal(canApproveTask(manager, { userId: 10, role: "MEMBER" }, { approverId: 10 }).allowed, false);
  assert.equal(canApproveTask(manager, { userId: 10, role: "PROJECT_MANAGER" }, { approverId: 11 }).allowed, true);
  assert.equal(canApproveTask({ id: 11, role: "subadmin", label: "验收人" }, {
    userId: 11,
    role: "PROJECT_MANAGER",
  }, { approverId: 11 }).allowed, true);
});

test("unauthenticated users and non-members receive structured denial reasons", () => {
  assert.equal(canProjectAction(null, null, "VIEW_PROJECT").allowed, false);
  assert.match(canProjectAction(null, null, "VIEW_PROJECT").reason, /authentication/);
  assert.match(canProjectAction(member, null, "VIEW_PROJECT").reason, /membership/);
});
