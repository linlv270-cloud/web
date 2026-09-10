Component({
  properties: {
    card: { type: Object, value: null },
    featured: { type: Boolean, value: false },
  },
  data: { imageUrl: "" },
  observers: {
    card(this: any, value: any) {
      this.setData({ imageUrl: value?.imageUrl || value?.fallbackUrl || "/assets/companion-fallback.jpg" });
    },
  },
  methods: {
    open(this: any) { this.triggerEvent("open", this.data.card); },
    imageError(this: any) {
      const fallback = this.data.card?.fallbackUrl || "/assets/companion-fallback.jpg";
      if (this.data.imageUrl !== fallback) this.setData({ imageUrl: fallback });
    },
  },
});
