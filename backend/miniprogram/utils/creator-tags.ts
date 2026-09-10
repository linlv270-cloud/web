export const creatorTagCatalog = {
  "我的身份": [
    "手作人", "设计师", "艺术家", "插画师", "摄影师", "非遗传承人", "工艺匠人", "独立出版人", "花艺师", "调香师",
    "甜品师", "烘焙师", "咖啡师", "茶艺师", "美食主理人", "酒饮主理人", "潮玩主理人", "古着主理人", "买手", "策展人",
    "音乐人", "乐队", "DJ", "舞者", "戏剧演员", "即兴演员", "脱口秀演员", "魔术师", "工作坊老师", "内容创作者", "AI从业者",
  ],
  "我的作品": [
    "纯艺创作", "手帐", "文创周边", "首饰配饰", "银饰", "陶瓷", "木作", "皮具", "布艺", "编织", "刺绣", "染织", "漆艺", "玻璃", "金工", "纸艺",
    "版画", "插画作品", "摄影作品", "花艺", "香薰", "蜡烛", "香水", "茶", "咖啡", "甜品", "烘焙", "精酿", "酒饮", "宠物用品", "亲子玩具",
    "潮玩", "古着", "独立书刊", "家居摆件", "礼盒", "伴手礼", "创新食品", "手办", "身体艺术", "数字作品", "互动体验", "现场娱乐", "文学创作", "二次元", "动漫", "明星周边",
  ],
  "我的客群": [
    "城市青年", "年轻女性", "大学生", "职场人群", "亲子家庭", "儿童", "宝妈", "情侣", "宠物家庭", "艺术爱好者", "设计师群体", "音乐爱好者",
    "收藏玩家", "潮流人群", "小众审美人群", "品牌主理人", "企业客户", "行政采购", "礼品采购", "同好圈层",
  ],
  "我的风格": [
    "极简", "自然系", "森系", "复古", "国风", "东方美学", "日系", "法式", "韩系", "美式复古", "轻奢", "甜酷", "暗黑", "赛博", "街头", "Y2K",
    "多巴胺", "童趣", "治愈", "松弛", "艺术感", "电影感", "手工感", "先锋", "实验性", "小众", "精致", "节日感", "烟火气", "仪式感",
  ],
  "现场体验": [
    "现场制作", "现场演示", "手作体验", "线下体验课", "主题工作坊", "亲子体验", "产品试用", "试吃", "试饮", "现场定制", "现场互动", "现场授课",
    "音乐演出", "舞蹈表演", "戏剧互动", "魔术互动", "脱口秀", "摄影服务", "主持服务",
  ],
  "DIY材料包": [
    "可做材料包", "成人材料包", "儿童材料包", "亲子材料包", "团建材料包", "零基础友好", "可独立完成", "支持现场教学", "配图文教程", "配视频教程",
    "支持邮寄", "支持批量", "支持定制", "支持补充包",
  ],
} as const;

export const creatorTagCategories = Object.keys(creatorTagCatalog) as Array<keyof typeof creatorTagCatalog>;

export function initialCreatorTagGroups() {
  return creatorTagCategories.map((category) => ({
    category,
    open: true,
    customLabel: "",
    customTags: [] as Array<{ category: string; label: string }>,
    tags: creatorTagCatalog[category].map((label) => ({ id: 0, label, category, status: "active", selected: false, available: false })),
  }));
}

export function hydrateCreatorTagGroups(tags: any[], selectedTagIds: number[] = []) {
  return creatorTagCategories.map((category) => {
    const visibleTags = tags.filter((tag) => tag.category === category && (tag.status === "active" || selectedTagIds.includes(Number(tag.id))));
    const byLabel = new Map(visibleTags.map((tag) => [tag.label, tag]));
    const catalogLabels = new Set<string>(creatorTagCatalog[category]);
    const ordered = [
      ...creatorTagCatalog[category].map((label) => byLabel.get(label) || { id: 0, label, category, status: "active" }),
      ...visibleTags.filter((tag) => !catalogLabels.has(tag.label)),
    ];
    return {
      category,
      open: true,
      customLabel: "",
      customTags: [] as Array<{ category: string; label: string }>,
      tags: ordered.map((tag) => ({ ...tag, available: Number(tag.id) > 0, selected: selectedTagIds.includes(Number(tag.id)) })),
    };
  });
}
