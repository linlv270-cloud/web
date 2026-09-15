export const projectCenterCopy = {
  navigation: {
    overview: "项目情况",
    members: "参与人员",
    phases: "工作步骤",
    milestones: "重要日期",
    tasks: "安排工作",
    files: "项目文件",
    records: "沟通记录",
    timeline: "时间安排",
    settings: "基本信息",
  },
  status: {
    DRAFT: "还没发给负责人",
    READY: "已安排，等待开始",
    IN_PROGRESS: "正在做",
    WAITING_EXTERNAL: "在等外部回复",
    WAITING_INTERNAL: "在等同事配合",
    BLOCKED: "暂时做不下去",
    REVIEW: "已提交，等待检查",
    REVISION_REQUIRED: "需要修改后再提交",
    DONE: "已完成",
    CANCELLED: "已取消",
  },
  help: {
    owner: "主要负责完成这项工作的人。任务发出后，会出现在他的“我的工作”中，他负责更新进度和提交结果。",
    collaborators: "帮助负责人完成这件事的人。任务也会出现在他的“我的工作”中，但最后提交结果仍由负责人完成。",
    approver: "负责人提交结果后，这项任务会进入你的“等我检查”。你可以确认完成，也可以退回修改。",
    publish: "任务会正式生效，并进入负责人和协助人员的“我的工作”。相关人员会收到一条内部提醒。",
    dependency: "设置开始这项工作前必须先完成的任务。前面的任务没有完成时，系统会提醒暂时不能开始。",
  },
} as const;

export function statusCopy(value: string) {
  return projectCenterCopy.status[value as keyof typeof projectCenterCopy.status] || value || "未知状态";
}
