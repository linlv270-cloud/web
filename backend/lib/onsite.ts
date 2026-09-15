export const onsiteContentLabels = [
  "产品展售",
  "作品展示",
  "现场制作",
  "工艺演示",
  "DIY体验",
  "主题工作坊",
  "现场定制",
  "互动共创",
  "试吃 / 品鉴",
  "气味 / 感官体验",
  "收藏展示",
  "故事分享 / 内容交流",
  "现场表演",
] as const;

export const onsiteTemplateMap: Record<(typeof onsiteContentLabels)[number], string> = {
  "产品展售": "01 产品展售型",
  "作品展示": "02 作品 / 收藏展示型",
  "现场制作": "03 制作 / 工艺演示型",
  "工艺演示": "03 制作 / 工艺演示型",
  "DIY体验": "04 DIY / 工作坊型",
  "主题工作坊": "04 DIY / 工作坊型",
  "现场定制": "05 现场定制型",
  "互动共创": "06 互动共创型",
  "试吃 / 品鉴": "07 品鉴 / 感官体验型",
  "气味 / 感官体验": "07 品鉴 / 感官体验型",
  "收藏展示": "02 作品 / 收藏展示型",
  "故事分享 / 内容交流": "08 故事分享 / 内容交流型",
  "现场表演": "09 现场表演型",
};

export const onsiteTemplates: Record<string, Array<{
  key: string;
  sentence: string;
  kind: "text" | "choice";
  options?: string[];
}>> = {
  "01 产品展售型": [
    { key: "bring", sentence: "我会带来", kind: "text" },
    { key: "special", sentence: "它最特别的是", kind: "choice", options: ["材料", "工艺", "设计", "功能", "限量", "系列概念", "其他"] },
    { key: "difference", sentence: "和常见的同类相比，不同在", kind: "text" },
    { key: "recommend", sentence: "如果只推荐一件，我会推荐", kind: "text" },
  ],
  "02 作品 / 收藏展示型": [
    { key: "show", sentence: "我会展示", kind: "text" },
    { key: "special", sentence: "这些内容最特别的是", kind: "choice", options: ["来源", "稀缺性", "材料", "年代", "主题", "创作方式", "其他"] },
    { key: "focus", sentence: "现场最值得仔细看的，是", kind: "text" },
    { key: "remember", sentence: "我希望大家最后记住", kind: "text" },
  ],
  "03 制作 / 工艺演示型": [
    { key: "content", sentence: "我会现场制作 / 演示", kind: "text" },
    { key: "change", sentence: "现场会看到", kind: "text" },
    { key: "step", sentence: "最值得看的一个步骤是", kind: "text" },
    { key: "why", sentence: "这个步骤特别在", kind: "choice", options: ["技术", "手法", "材料变化", "难度", "罕见性", "其他"] },
  ],
  "04 DIY / 工作坊型": [
    { key: "project", sentence: "我会带来", kind: "text" },
    { key: "result", sentence: "现场可以亲手完成", kind: "text" },
    { key: "steps", sentence: "会从", kind: "text" },
    { key: "special", sentence: "最特别的一步是", kind: "text" },
  ],
  "05 现场定制型": [
    { key: "service", sentence: "我会提供", kind: "text" },
    { key: "basedOn", sentence: "现场可以根据你的", kind: "choice", options: ["名字", "喜好", "选择", "身体特点", "故事", "需求", "其他"] },
    { key: "choice", sentence: "你可以自己决定", kind: "choice", options: ["材料", "颜色", "图案", "内容", "搭配", "其他"] },
    { key: "result", sentence: "最后会得到", kind: "text" },
  ],
  "06 互动共创型": [
    { key: "project", sentence: "我会邀请大家一起完成", kind: "text" },
    { key: "contribute", sentence: "每个人可以贡献", kind: "choice", options: ["一个动作", "一块材料", "一个想法", "一段文字", "一个选择", "其他"] },
    { key: "become", sentence: "随着参与的人越来越多，它会慢慢变成", kind: "text" },
    { key: "remain", sentence: "最后留下的是", kind: "choice", options: ["作品", "装置", "影像", "记录", "其他"] },
  ],
  "07 品鉴 / 感官体验型": [
    { key: "experience", sentence: "我会带来", kind: "text" },
    { key: "sense", sentence: "现场可以体验", kind: "choice", options: ["味道", "香气", "触感", "声音", "材料", "多感官组合"] },
    { key: "first", sentence: "最明显的第一个感受是", kind: "text" },
    { key: "later", sentence: "继续体验以后，会发现", kind: "text" },
    { key: "remember", sentence: "我希望大家最后记住", kind: "text" },
  ],
  "08 故事分享 / 内容交流型": [
    { key: "topic", sentence: "我会分享", kind: "text" },
    { key: "core", sentence: "其中最值得听的一件事是", kind: "text" },
    { key: "unknown", sentence: "很多人原本可能不知道", kind: "text" },
    { key: "rethink", sentence: "我希望听完以后，大家会重新想到", kind: "text" },
  ],
  "09 现场表演型": [
    { key: "show", sentence: "我会带来", kind: "text" },
    { key: "main", sentence: "现场会看到 / 听到", kind: "text" },
    { key: "moment", sentence: "整个表演最值得期待的是", kind: "text" },
    { key: "difference", sentence: "它与常见的同类表演不同在", kind: "text" },
    { key: "remain", sentence: "我希望现场最后留下", kind: "text" },
  ],
};

export function templateForContent(label: string) {
  return onsiteTemplateMap[label as (typeof onsiteContentLabels)[number]] || "";
}
