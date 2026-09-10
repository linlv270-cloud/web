Component({
  properties: {
    active: { type: String, value: "home" },
    immersive: { type: Boolean, value: false },
  },
  data: {
    tabs: [
      { key: "home", label: "发现", icon: "/assets/icons/discover-muted.svg", lightIcon: "/assets/icons/discover-light.svg", activeIcon: "/assets/icons/discover-active.svg", url: "/pages/index/index" },
      { key: "self", label: "自在", icon: "/assets/icons/self-muted.svg", lightIcon: "/assets/icons/self-light.svg", activeIcon: "/assets/icons/self-active.svg", url: "/pages/self-play/self-play" },
      { key: "companion", label: "结伴", icon: "/assets/icons/companion-muted.svg", lightIcon: "/assets/icons/companion-light.svg", activeIcon: "/assets/icons/companion-active.svg", url: "/pages/companion/companion" },
      { key: "mine", label: "我的", icon: "/assets/icons/mine-muted.svg", lightIcon: "/assets/icons/mine-light.svg", activeIcon: "/assets/icons/mine-active.svg", url: "/pages/mine/mine" },
    ],
  },
  methods: {
    open(this: any, event: any) {
      const key = String(event.currentTarget.dataset.key || "");
      const url = String(event.currentTarget.dataset.url || "");
      if (!url || key === this.data.active) return;
      wx.reLaunch({ url });
    },
  },
});
