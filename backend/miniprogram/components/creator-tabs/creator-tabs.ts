Component({
  properties: {
    active: { type: String, value: "project" },
    replyUnread: { type: Number, value: 0 },
    noticeUnread: { type: Number, value: 0 },
  },
  data: {
    tabs: [
      { key: "project", label: "体验", icon: "/assets/icons/project-muted.svg", activeIcon: "/assets/icons/project-active.svg", url: "/pages/creator-project/creator-project" },
      { key: "notices", label: "通知", icon: "/assets/icons/notices-muted.svg", activeIcon: "/assets/icons/notices-active.svg", url: "/pages/creator-notices/creator-notices" },
      { key: "mine", label: "我的", icon: "/assets/icons/mine-muted.svg", activeIcon: "/assets/icons/mine-active.svg", url: "/pages/creator-profile/creator-profile" },
    ],
  },
  methods: {
    go(this: any, event: any) {
      const tab = this.data.tabs.find((item: any) => item.key === event.currentTarget.dataset.key);
      if (tab && tab.key !== this.data.active) wx.redirectTo({ url: tab.url });
    },
  },
});
