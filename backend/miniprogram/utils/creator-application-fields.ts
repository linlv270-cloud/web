export const defaultCreatorApplicationFields = {
  brandName: { enabled: true, required: true, label: "品牌 / 工作室名称", hint: "填写对外展示的品牌或工作室名称" },
  location: { enabled: true, required: true, label: "常驻城市", hint: "选择省、市、区" },
  representativeImage: { enabled: true, required: true, label: "申请代表图", hint: "上传一张不超过20MB的图片" },
  intro: { enabled: true, required: false, label: "完整介绍", hint: "介绍你的创作、技能和体验方向" },
  tags: { enabled: true, required: true, label: "新遇官标签", hint: "每类最多 8 个，全部分类至少选择 1 个" },
  customTags: { enabled: true, required: false, label: "新增标签", hint: "没有合适标签时可新增，最多 7 个字" },
  offlineExperience: { enabled: true, required: false, label: "是否有线下体验", hint: "可多选，也可以暂不选择" },
  busyPeriods: { enabled: true, required: true, label: "已经安排的活动档期", hint: "填写你已安排的其他活动日期，避免我们在这些日期打扰你" },
};

export type CreatorApplicationFields = typeof defaultCreatorApplicationFields;
