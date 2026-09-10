Component({
  properties: {
    card: { type: Object, value: null },
    compact: { type: Boolean, value: false }
  },
  methods: {
    open(this: any) {
      if (this.data.card) this.triggerEvent("open", this.data.card);
    }
  }
});
