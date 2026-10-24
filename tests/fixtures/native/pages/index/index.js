Page({
  data: { taps: 0 },
  onTap() {
    this.setData({ taps: this.data.taps + 1 });
  }
});
