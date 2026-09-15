import type { TaxonomyNamespace } from "./types";

export const themeCategories: Array<{ name: string; accent: string; themes: string[] }> = [
  { name: "城市生活", accent: "#E5B93F", themes: ["城市周末市集", "夜晚微醺市集", "复古嘉年华", "天台派对", "城市露营", "街区漫游", "咖啡生活节", "城市野餐会", "黄昏音乐市集", "深夜食堂派对"] },
  { name: "手作工坊", accent: "#D86B4B", themes: ["手作体验工坊", "陶艺 Workshop", "银饰制作课", "香薰蜡烛课", "皮具手作课", "植物染体验", "木作体验课", "拼贴艺术课", "毛毡手作课", "手账拼贴派对"] },
  { name: "非遗文化", accent: "#597A50", themes: ["非遗手作市集", "国风雅集", "茶文化体验", "香道体验", "书法篆刻体验", "漆扇体验", "扎染体验", "传统纹样工坊", "民艺收藏展", "中式礼物节"] },
  { name: "艺术设计", accent: "#5378A8", themes: ["独立插画展", "艺术家开放日", "设计师市集", "海报艺术展", "摄影作品展", "版画体验展", "装置艺术空间", "艺术收藏小展", "独立出版市集", "青年艺术节"] },
  { name: "音乐表演", accent: "#735C92", themes: ["独立音乐现场", "民谣夜", "爵士酒会", "电子音乐派对", "黑胶聆听会", "街头表演节", "即兴戏剧夜", "舞蹈快闪", "脱口秀小剧场", "沉浸式表演派对"] },
  { name: "美食酒饮", accent: "#B74942", themes: ["精酿啤酒节", "烈酒品鉴会", "咖啡拉花体验", "茶饮慢生活节", "甜品市集", "面包烘焙日", "世界风味市集", "地方小吃节", "主厨餐桌", "微醺花园派对"] },
  { name: "潮流青年", accent: "#258079", themes: ["潮玩交换会", "球鞋潮流市集", "古着复古市集", "纹身贴体验", "街头文化节", "滑板街区活动", "机车生活派对", "ACG 同好会", "盲盒收藏展", "年轻品牌快闪"] },
  { name: "宠物亲子", accent: "#C66E87", themes: ["宠物友好市集", "狗狗社交日", "猫咪主题展", "亲子手作日", "儿童艺术工坊", "家庭野餐会", "亲子绘本市集", "儿童剧场体验", "萌宠摄影日", "家庭周末嘉年华"] },
  { name: "礼物节庆", accent: "#AA873D", themes: ["情人节礼物市集", "七夕情侣体验日", "中秋礼盒市集", "圣诞礼物节", "新年开运市集", "母亲节礼物展", "生日礼物工坊", "企业伴手礼展", "婚礼伴手礼市集", "节日限定快闪"] },
  { name: "品牌活动", accent: "#555B63", themes: ["品牌新品发布会", "品牌快闪店", "粉丝见面会", "小红书种草体验会", "新品试用派对", "生活方式沙龙", "企业客户答谢会", "联名限定活动", "品牌展会摊位", "创意人招募会"] },
];

export const cooperationTypes = [
  "DIY材料包",
  "个人工作室",
  "现场体验",
  "快闪合作",
  "市集合作",
  "线下开店",
  "寄卖",
  "开工作室",
  "企业活动",
  "品牌联名",
  "商务直采",
  "联合营销",
  "异业置换",
  "体验课推广",
  "活动邀约",
  "技能推广",
] as const;

export const tagSeeds: Record<string, string[]> = {
  "我的身份": ["手作人", "设计师", "艺术家", "插画师", "摄影师", "非遗传承人", "工艺匠人", "独立出版人", "花艺师", "调香师", "甜品师", "烘焙师", "咖啡师", "茶艺师", "美食主理人", "酒饮主理人", "潮玩主理人", "古着主理人", "买手", "策展人", "音乐人", "乐队", "DJ", "舞者", "戏剧演员", "即兴演员", "脱口秀演员", "魔术师", "工作坊老师", "内容创作者", "AI从业者"],
  "我的作品": ["纯艺创作", "手帐", "文创周边", "首饰配饰", "银饰", "陶瓷", "木作", "皮具", "布艺", "编织", "刺绣", "染织", "漆艺", "玻璃", "金工", "纸艺", "版画", "插画作品", "摄影作品", "花艺", "香薰", "蜡烛", "香水", "茶", "咖啡", "甜品", "烘焙", "精酿", "酒饮", "宠物用品", "亲子玩具", "潮玩", "古着", "独立书刊", "家居摆件", "礼盒", "伴手礼", "创新食品", "手办", "身体艺术", "数字作品", "互动体验", "现场娱乐", "文学创作", "二次元", "动漫", "明星周边"],
  "我的客群": ["城市青年", "年轻女性", "大学生", "职场人群", "亲子家庭", "儿童", "宝妈", "情侣", "宠物家庭", "艺术爱好者", "设计师群体", "音乐爱好者", "收藏玩家", "潮流人群", "小众审美人群", "品牌主理人", "企业客户", "行政采购", "礼品采购", "同好圈层", "喜欢新鲜事物", "喜欢动手体验", "关注设计与审美", "收藏爱好者", "礼物消费", "喜欢安静/慢节奏", "想放松一下", "朋友结伴", "传统文化爱好者", "特定兴趣人群", "纪念特殊时刻", "大众皆宜", "其他"],
  "我的风格": ["极简", "自然系", "森系", "复古", "国风", "东方美学", "日系", "法式", "韩系", "美式复古", "轻奢", "甜酷", "暗黑", "赛博", "街头", "Y2K", "多巴胺", "童趣", "治愈", "松弛", "艺术感", "电影感", "手工感", "先锋", "实验性", "小众", "精致", "节日感", "烟火气", "仪式感", "自然", "东方", "当代", "实验", "可爱", "粗粝", "街头", "梦幻", "夜色感", "其他"],
  "现场体验": ["现场制作", "现场演示", "手作体验", "线下体验课", "主题工作坊", "亲子体验", "产品试用", "试吃", "试饮", "现场定制", "现场互动", "现场授课", "音乐演出", "舞蹈表演", "戏剧互动", "魔术互动", "脱口秀", "摄影服务", "主持服务"],
  "DIY材料包": ["可做材料包", "成人材料包", "儿童材料包", "亲子材料包", "团建材料包", "零基础友好", "可独立完成", "支持现场教学", "配图文教程", "配视频教程", "支持邮寄", "支持批量", "支持定制", "支持补充包"],
};

export const creatorV1WorkOptions = [...tagSeeds["我的作品"]] as const;

export const creatorApplicationTagCategories = [
  "我的身份",
  "我的作品",
  "我的客群",
  "我的风格",
  "现场体验",
  "DIY材料包",
] as const;

export const offlineExperienceTypes = ["DIY材料包", "个人工作室", "现场体验"] as const;

export const precisionInviteGoals = ["新品测试", "粉丝交流", "品牌推广", "销售增长"] as const;
export const precisionInviteScenes = ["市集快闪", "节事活动", "文旅景区", "购物中心入驻", "艺术展览", "KOL沙龙", "行业展会"] as const;

export const creatorV1StyleOptions = [
  "自然", "极简", "东方", "复古", "当代", "实验", "童趣", "可爱",
  "粗粝", "精致", "街头", "梦幻", "夜色感", "其他",
] as const;

export const creatorV1AudienceOptions = [
  "喜欢新鲜事物", "喜欢动手体验", "关注设计与审美", "收藏爱好者", "礼物消费",
  "喜欢安静/慢节奏", "想放松一下", "亲子家庭", "情侣", "朋友结伴",
  "传统文化爱好者", "特定兴趣人群", "纪念特殊时刻", "大众皆宜", "其他",
] as const;

export const projectSceneTags = ["带孩子玩", "和朋友玩", "自己放空", "定制礼物"] as const;
export const projectOperationTags = ["限时限量", "今日上新", "首发尝鲜"] as const;
export const projectPlatformTags = ["好评精选"] as const;

export const projectTagSeeds: Record<string, readonly string[]> = {
  "项目场景": projectSceneTags,
  "项目运营": projectOperationTags,
  "平台运营": projectPlatformTags,
};

export const tagCategoryNames: string[] = [...creatorApplicationTagCategories];

export const creatorTaxonomyNamespaces = ["R", "I", "O", "X", "P", "E", "S"] as const satisfies readonly TaxonomyNamespace[];

/**
 * Product taxonomy used by the Phase 2B discovery flow.
 * Legacy Chinese categories remain separate compatibility data.
 */
export const canonicalTaxonomySeeds: ReadonlyArray<{
  namespace: TaxonomyNamespace;
  termKey: string;
  label: string;
}> = [
  { namespace: "R", termKey: "R01", label: "手作人" },
  { namespace: "R", termKey: "R02", label: "艺术家" },
  { namespace: "R", termKey: "R03", label: "设计师" },
  { namespace: "R", termKey: "R04", label: "插画师" },
  { namespace: "R", termKey: "R05", label: "独立品牌主理人" },
  { namespace: "R", termKey: "R06", label: "美食主理人" },
  { namespace: "R", termKey: "R07", label: "非遗相关创作者" },
  { namespace: "R", termKey: "R08", label: "收藏者" },
  { namespace: "R", termKey: "R09", label: "内容创作者" },
  { namespace: "R", termKey: "R10", label: "工作坊老师" },
  { namespace: "R", termKey: "R11", label: "其他" },
  { namespace: "I", termKey: "I01", label: "陶瓷" },
  { namespace: "I", termKey: "I02", label: "首饰" },
  { namespace: "I", termKey: "I03", label: "织物" },
  { namespace: "I", termKey: "I04", label: "木作" },
  { namespace: "I", termKey: "I05", label: "纸艺" },
  { namespace: "I", termKey: "I06", label: "香氛" },
  { namespace: "I", termKey: "I07", label: "植物" },
  { namespace: "I", termKey: "I08", label: "绘画 / 插画" },
  { namespace: "I", termKey: "I09", label: "家居器物" },
  { namespace: "I", termKey: "I10", label: "美食" },
  { namespace: "I", termKey: "I11", label: "潮玩" },
  { namespace: "I", termKey: "I12", label: "收藏" },
  { namespace: "I", termKey: "I13", label: "其他" },
  { namespace: "O", termKey: "O01", label: "作品展示" },
  { namespace: "O", termKey: "O02", label: "商品售卖" },
  { namespace: "O", termKey: "O03", label: "现场制作" },
  { namespace: "O", termKey: "O04", label: "演示讲解" },
  { namespace: "O", termKey: "O05", label: "故事分享" },
  { namespace: "O", termKey: "O06", label: "定制服务" },
  { namespace: "X", termKey: "X01", label: "自己动手" },
  { namespace: "X", termKey: "X02", label: "试" },
  { namespace: "X", termKey: "X03", label: "尝" },
  { namespace: "X", termKey: "X04", label: "闻" },
  { namespace: "X", termKey: "X05", label: "触摸材料" },
  { namespace: "X", termKey: "X06", label: "选择组合" },
  { namespace: "X", termKey: "X07", label: "小工作坊" },
  { namespace: "X", termKey: "X08", label: "聊天" },
  { namespace: "X", termKey: "X09", label: "共同完成" },
  { namespace: "X", termKey: "X10", label: "拍照记录" },
  { namespace: "P", termKey: "P01", label: "喜欢新鲜东西" },
  { namespace: "P", termKey: "P02", label: "喜欢动手" },
  { namespace: "P", termKey: "P03", label: "在意设计审美" },
  { namespace: "P", termKey: "P04", label: "喜欢收藏" },
  { namespace: "P", termKey: "P05", label: "挑礼物的人" },
  { namespace: "P", termKey: "P06", label: "喜欢安静慢一点" },
  { namespace: "P", termKey: "P07", label: "最近想放松" },
  { namespace: "P", termKey: "P08", label: "亲子家庭" },
  { namespace: "P", termKey: "P09", label: "情侣" },
  { namespace: "P", termKey: "P10", label: "朋友" },
  { namespace: "P", termKey: "P11", label: "传统文化爱好者" },
  { namespace: "P", termKey: "P12", label: "特殊兴趣人群" },
  { namespace: "P", termKey: "P13", label: "纪念某个时刻的人" },
  { namespace: "E", termKey: "E01", label: "松弛" },
  { namespace: "E", termKey: "E02", label: "好奇" },
  { namespace: "E", termKey: "E03", label: "开心" },
  { namespace: "E", termKey: "E04", label: "安静" },
  { namespace: "E", termKey: "E05", label: "专注" },
  { namespace: "E", termKey: "E06", label: "惊喜" },
  { namespace: "E", termKey: "E07", label: "怀旧" },
  { namespace: "E", termKey: "E08", label: "自我表达" },
  { namespace: "E", termKey: "E09", label: "连接" },
  { namespace: "E", termKey: "E10", label: "探索" },
  { namespace: "E", termKey: "E11", label: "成就感" },
  { namespace: "S", termKey: "S01", label: "自然" },
  { namespace: "S", termKey: "S02", label: "极简" },
  { namespace: "S", termKey: "S03", label: "东方" },
  { namespace: "S", termKey: "S04", label: "复古" },
  { namespace: "S", termKey: "S05", label: "当代" },
  { namespace: "S", termKey: "S06", label: "实验" },
  { namespace: "S", termKey: "S07", label: "童趣" },
  { namespace: "S", termKey: "S08", label: "可爱" },
  { namespace: "S", termKey: "S09", label: "粗粝" },
  { namespace: "S", termKey: "S10", label: "精致" },
  { namespace: "S", termKey: "S11", label: "街头" },
  { namespace: "S", termKey: "S12", label: "梦幻" },
  { namespace: "S", termKey: "S13", label: "夜间感" },
];

/**
 * Compatibility only: legacy Chinese tag categories keep their original values
 * while this map gives future consumers a stable namespace boundary.
 */
export const creatorTaxonomyLegacyCategoryMap: Readonly<Record<string, TaxonomyNamespace>> = {
  "我的身份": "R",
  "我的作品": "I",
  "DIY材料包": "O",
  "现场体验": "X",
  "我的客群": "P",
  "我的风格": "S",
};

export function legacyTaxonomyTermKey(namespace: TaxonomyNamespace, label: string) {
  const codePoints = Array.from(label)
    .map((character) => (character.codePointAt(0) || 0).toString(16))
    .join("-");
  return `legacy.${namespace}.${codePoints}`;
}

export const themeSuggestedTags: Record<string, string[]> = {
  "城市生活": ["市集", "城市青年", "周末", "街区", "松弛", "可摆摊", "摄影", "现场制作"],
  "手作工坊": ["工作坊", "手作人", "现场制作", "手工", "可授课", "线下体验课", "桌椅", "电源"],
  "非遗文化": ["体验课", "非遗传承人", "现场演示", "非遗", "东方美学", "可授课", "传统纹样工坊", "桌椅"],
  "艺术设计": ["展会", "设计师", "图文", "艺术感", "插画", "美术馆", "出片感", "可提供摄影"],
  "音乐表演": ["派对", "音乐人", "表演", "夜晚", "舞台", "音响", "麦克风", "可表演"],
  "美食酒饮": ["市集", "美食创作者", "试吃", "试饮", "烟火气", "夜晚", "电源", "用水"],
  "潮流青年": ["快闪", "潮玩主理人", "短视频", "街头", "年轻女性", "城市青年", "潮酷", "可摆摊"],
  "宠物亲子": ["嘉年华", "亲子博主", "宠物博主", "亲子家庭", "宠物友好", "童趣", "公园", "宠物区域"],
  "礼物节庆": ["市集", "礼品定制商家", "节日感", "仪式感", "伴手礼", "企业定制礼品", "可定制", "可做企业礼品"],
  "品牌活动": ["发布会", "文创品牌主", "图文", "短视频", "品牌主理人", "企业客户", "可联名", "可快闪"],
};

export function categoryPosterPath(category: string) {
  const index = themeCategories.findIndex((item) => item.name === category);
  return index >= 0 ? `/posters/category-${index + 1}.jpg` : "/posters/category-10.jpg";
}

// ===== 设计策划模块（在线矢量海报）=====

/** 24 节气固定档期：name 名称、month_day 参考日期（MM-DD）、theme_hint 节气意象提示（供提示词生成） */
export const designSolarTerms: Array<{ name: string; month_day: string; theme_hint: string }> = [
  { name: "立春", month_day: "02-04", theme_hint: "东风解冻，万物复苏，迎春新生" },
  { name: "雨水", month_day: "02-19", theme_hint: "润物无声，草木萌动，初春细雨" },
  { name: "惊蛰", month_day: "03-06", theme_hint: "春雷乍动，万物惊醒，生机萌发" },
  { name: "春分", month_day: "03-21", theme_hint: "昼夜平分，春色正中，和风丽日" },
  { name: "清明", month_day: "04-05", theme_hint: "春和景明，踏青寻春，气清景明" },
  { name: "谷雨", month_day: "04-20", theme_hint: "雨生百谷，春尽夏至，秧苗初插" },
  { name: "立夏", month_day: "05-06", theme_hint: "万物繁茂，夏始蝉鸣，绿意渐浓" },
  { name: "小满", month_day: "05-21", theme_hint: "麦穗渐满，小得盈满，物致于此" },
  { name: "芒种", month_day: "06-06", theme_hint: "忙种忙收，麦浪金黄，梅雨将至" },
  { name: "夏至", month_day: "06-21", theme_hint: "日长之至，盛夏蝉鸣，荷风送香" },
  { name: "小暑", month_day: "07-07", theme_hint: "暑气初盛，温风至，蟋蟀居宇" },
  { name: "大暑", month_day: "07-23", theme_hint: "酷暑极盛，湿热交蒸，萤火虫飞" },
  { name: "立秋", month_day: "08-08", theme_hint: "一叶知秋，暑去凉来，梧桐叶落" },
  { name: "处暑", month_day: "08-23", theme_hint: "暑气渐止，秋意初现，天高云淡" },
  { name: "白露", month_day: "09-08", theme_hint: "露凝而白，秋凉渐深，鸿雁来" },
  { name: "秋分", month_day: "09-23", theme_hint: "平分秋色，稻谷丰收，桂子飘香" },
  { name: "寒露", month_day: "10-08", theme_hint: "露气寒冷，深秋凝霜，菊有黄华" },
  { name: "霜降", month_day: "10-23", theme_hint: "气肃而凝，霜降大地，枫红柿熟" },
  { name: "立冬", month_day: "11-07", theme_hint: "冬之始，水始冰，收藏万物" },
  { name: "小雪", month_day: "11-22", theme_hint: "初雪飘落，寒气渐盛，腌菜入瓮" },
  { name: "大雪", month_day: "12-07", theme_hint: "雪盛寒冬，围炉夜话，岁末将至" },
  { name: "冬至", month_day: "12-22", theme_hint: "日短之至，数九寒天，饺子团圆" },
  { name: "小寒", month_day: "01-06", theme_hint: "寒意渐浓，腊梅初绽，年味渐起" },
  { name: "大寒", month_day: "01-20", theme_hint: "岁末严寒，年关将至，辞旧迎新" },
];

/**
 * 设计标签类别（固定 9 类槽位 = 策划方案字段 ∪ 设计 brief 字段 的并集）。
 * 类别增删属于结构性变更，需同步策划模板、设计 brief 模板与提示词模板。
 */
export const designTagCategories: Array<{ key: string; name: string; hint: string; pick_count: number }> = [
  { key: "theme_name", name: "主题名称", hint: "市集活动的主题词，海报主标题素材", pick_count: 1 },
  { key: "host_identity", name: "主理人身份", hint: "参与主理人的身份构成", pick_count: 2 },
  { key: "style", name: "创作风格", hint: "海报视觉风格方向，决定风格底稿", pick_count: 1 },
  { key: "inspiration", name: "灵感来源", hint: "创意母题，供文案与视觉取材", pick_count: 1 },
  { key: "audience", name: "客群画像", hint: "目标人群，决定文案语气与色彩倾向", pick_count: 1 },
  { key: "product_category", name: "作品品类", hint: "现场售卖的品类构成", pick_count: 2 },
  { key: "gift", name: "限定礼物", hint: "市集限定礼物，海报卖点元素", pick_count: 1 },
  { key: "experience", name: "体验项目", hint: "现场体验项目", pick_count: 1 },
  { key: "schedule", name: "活动档期", hint: "档期描述（时长/时段），海报时间信息", pick_count: 1 },
];

/** 设计标签默认值池（超管可在运营台随时增删，值池扩展不影响提示词结构） */
export const designTagSeeds: Record<string, string[]> = {
  theme_name: [
    "春日拾光", "以物易春", "灯火可亲", "山野来信", "时光慢递", "初见",
    "归园田居", "半日闲", "城市漫游", "旧梦新生", "一纸春色", "拾趣",
    "万物生", "人间烟火", "慢煮光阴", "好物相逢",
  ],
  host_identity: [
    "手作人", "设计师", "插画师", "非遗传承人", "陶艺师", "甜品师",
    "调香师", "独立出版人", "花艺师", "咖啡师", "茶艺师", "皮具匠人",
    "木作匠人", "布艺手作人", "古着买手", "首饰匠人",
  ],
  style: [
    "复古胶片", "新中式国风", "日式侘寂", "极简留白", "赛博霓虹",
    "森系自然", "文艺手账", "港风海报", "欧式古典", "孟菲斯撞色",
    "黑白版画", "水墨写意",
  ],
  inspiration: [
    "二十四节气", "山海经神兽", "老上海月份牌", "敦煌壁画", "宋词意象",
    "童年游戏", "田野四季", "火车旅行", "旧书信", "庙会花灯",
    "江南园林", "星空与潮汐",
  ],
  audience: [
    "亲子家庭", "年轻女性", "城市青年", "文艺爱好者", "大学生",
    "宠物家庭", "情侣", "收藏玩家", "潮流人群", "企业礼品采购",
  ],
  product_category: [
    "手作饰品", "陶瓷器物", "香薰蜡烛", "文创周边", "布艺刺绣", "原创插画",
    "茶与器", "烘焙甜品", "鲜花植物", "皮具木作", "古着旧物", "独立书刊",
  ],
  gift: [
    "节气限定贴纸", "手写书签", "盲盒福袋", "定制印章", "干花标本",
    "手绘明信片", "香囊香包", "迷你灯笼", "种子盲盒", "手工糖果",
  ],
  experience: [
    "亲子手作工坊", "香道体验", "扎染体验", "版画拓印", "茶席品鉴",
    "即兴音乐", "书法描红", "旧物改造课", "植物拓染", "灯笼手作",
  ],
  schedule: [
    "周末两天", "三天小长假", "傍晚至深夜", "整日开放",
    "周末下午", "夜场限定", "假日全天", "早鸟时段",
  ],
};
