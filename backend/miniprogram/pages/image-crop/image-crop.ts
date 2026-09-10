import { upload } from "../../utils/api";
import { QIDENG_COLORS } from "../../utils/design-tokens";

type TouchPoint = { clientX: number; clientY: number };
type GestureState = {
  mode: "idle" | "drag" | "pinch";
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startScale: number;
  startDistance: number;
  focusImageX: number;
  focusImageY: number;
};

const minimumScale = 1;
const maximumScale = 4;
const pinchDamping = 0.45;
let stageRect = { left: 0, top: 0 };
let gesture: GestureState = {
  mode: "idle",
  startClientX: 0,
  startClientY: 0,
  startX: 0,
  startY: 0,
  startScale: 1,
  startDistance: 0,
  focusImageX: 0,
  focusImageY: 0,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sliderValueForScale(scale: number) {
  return 100 + 300 * Math.sqrt((clamp(scale, minimumScale, maximumScale) - 1) / 3);
}

function scaleForSliderValue(value: number) {
  const progress = clamp((value - 100) / 300, 0, 1);
  return 1 + 3 * progress * progress;
}

function touchPoints(event: any): TouchPoint[] {
  return Array.from(event.touches || []).map((touch: any) => ({
    clientX: Number(touch.clientX ?? touch.pageX ?? 0),
    clientY: Number(touch.clientY ?? touch.pageY ?? 0),
  }));
}

function distance(first: TouchPoint, second: TouchPoint) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function midpoint(first: TouchPoint, second: TouchPoint) {
  return {
    x: (first.clientX + second.clientX) / 2 - stageRect.left,
    y: (first.clientY + second.clientY) / 2 - stageRect.top,
  };
}

Page({
  data: {
    designColors: QIDENG_COLORS,
    src: "",
    target: "profile",
    activityId: 0,
    projectId: 0,
    areaWidth: 0,
    areaHeight: 0,
    baseWidth: 0,
    baseHeight: 0,
    originalWidth: 0,
    originalHeight: 0,
    x: 0,
    y: 0,
    scale: 1,
    scalePercent: 100,
    scaleText: "1.00x",
    outputWidth: 1440,
    outputHeight: 1800,
    saving: false,
  },
  onShow() {
    const wxApi = wx as any;
    if (typeof wxApi.hideShareMenu === "function") {
      wxApi.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    }
  },
  async onLoad(query: any) {
    const src = wx.getStorageSync("qideng_crop_source");
    if (!src) return wx.navigateBack();
    try {
      const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const target = query.target === "project" ? "project" : query.target === "activity" ? "activity" : query.target === "registerLogo" ? "registerLogo" : query.target === "register" ? "register" : "profile";
      const square = target === "registerLogo";
      const statusBarHeight = Number(system.statusBarHeight || 20);
      const stageRatio = square ? 1 : 1.25;
      const availableStageHeight = Math.max(300, Number(system.windowHeight || 568) - statusBarHeight - 208);
      const areaWidth = Math.min(Number(system.windowWidth || 320), Math.floor(availableStageHeight / stageRatio));
      const areaHeight = areaWidth * stageRatio;
      const info = await new Promise<any>((resolve, reject) => wx.getImageInfo({ src, success: resolve, fail: reject }));
      const fit = Math.max(areaWidth / info.width, areaHeight / info.height);
      const baseWidth = info.width * fit;
      const baseHeight = info.height * fit;
      this.setData({
        src,
        target,
        activityId: Number(query.activityId || 0),
        projectId: Number(query.projectId || 0),
        areaWidth,
        areaHeight,
        baseWidth,
        baseHeight,
        originalWidth: info.width,
        originalHeight: info.height,
        outputWidth: square ? 800 : 1440,
        outputHeight: square ? 800 : 1800,
        x: (areaWidth - baseWidth) / 2,
        y: (areaHeight - baseHeight) / 2,
      }, () => this.measureStage());
    } catch {
      wx.showToast({ title: "图片读取失败", icon: "none" });
      setTimeout(() => wx.navigateBack(), 500);
    }
  },
  onReady() {
    this.measureStage();
  },
  onUnload() {
    gesture.mode = "idle";
  },
  measureStage() {
    wx.createSelectorQuery().select(".crop-stage").boundingClientRect((rect: any) => {
      if (rect) stageRect = { left: Number(rect.left || 0), top: Number(rect.top || 0) };
    }).exec();
  },
  clampedTransform(scale: number, x: number, y: number) {
    const nextScale = clamp(scale, minimumScale, maximumScale);
    const renderedWidth = this.data.baseWidth * nextScale;
    const renderedHeight = this.data.baseHeight * nextScale;
    return {
      scale: nextScale,
      x: clamp(x, this.data.areaWidth - renderedWidth, 0),
      y: clamp(y, this.data.areaHeight - renderedHeight, 0),
    };
  },
  applyTransform(scale: number, x: number, y: number) {
    const next = this.clampedTransform(scale, x, y);
    const roundedScale = Math.round(next.scale * 1000) / 1000;
    this.setData({
      scale: roundedScale,
      scalePercent: Math.round(sliderValueForScale(roundedScale)),
      scaleText: `${roundedScale.toFixed(2)}x`,
      x: Math.round(next.x * 10) / 10,
      y: Math.round(next.y * 10) / 10,
    });
  },
  beginDrag(point: TouchPoint) {
    gesture = {
      ...gesture,
      mode: "drag",
      startClientX: point.clientX,
      startClientY: point.clientY,
      startX: this.data.x,
      startY: this.data.y,
      startScale: this.data.scale,
    };
  },
  beginPinch(first: TouchPoint, second: TouchPoint) {
    const center = midpoint(first, second);
    const startScale = Number(this.data.scale || 1);
    gesture = {
      mode: "pinch",
      startClientX: center.x,
      startClientY: center.y,
      startX: this.data.x,
      startY: this.data.y,
      startScale,
      startDistance: Math.max(1, distance(first, second)),
      focusImageX: (center.x - this.data.x) / startScale,
      focusImageY: (center.y - this.data.y) / startScale,
    };
  },
  touchStart(event: any) {
    const points = touchPoints(event);
    if (points.length >= 2) this.beginPinch(points[0], points[1]);
    else if (points.length === 1) this.beginDrag(points[0]);
  },
  touchMove(event: any) {
    const points = touchPoints(event);
    if (points.length >= 2) {
      if (gesture.mode !== "pinch") this.beginPinch(points[0], points[1]);
      const center = midpoint(points[0], points[1]);
      const ratio = Math.max(.2, distance(points[0], points[1]) / Math.max(1, gesture.startDistance));
      const dampedRatio = Math.max(.25, 1 + (ratio - 1) * pinchDamping);
      const nextScale = clamp(gesture.startScale * dampedRatio, minimumScale, maximumScale);
      this.applyTransform(
        nextScale,
        center.x - gesture.focusImageX * nextScale,
        center.y - gesture.focusImageY * nextScale,
      );
      return;
    }
    if (points.length === 1) {
      if (gesture.mode !== "drag") this.beginDrag(points[0]);
      this.applyTransform(
        this.data.scale,
        gesture.startX + points[0].clientX - gesture.startClientX,
        gesture.startY + points[0].clientY - gesture.startClientY,
      );
    }
  },
  touchEnd(event: any) {
    const points = touchPoints(event);
    if (points.length >= 2) this.beginPinch(points[0], points[1]);
    else if (points.length === 1) this.beginDrag(points[0]);
    else gesture.mode = "idle";
  },
  updateScale(nextValue: number) {
    const nextScale = clamp(nextValue, minimumScale, maximumScale);
    const previousScale = Number(this.data.scale || 1);
    if (Math.abs(nextScale - previousScale) < .0001) return;
    const centerX = this.data.areaWidth / 2;
    const centerY = this.data.areaHeight / 2;
    const focusImageX = (centerX - this.data.x) / previousScale;
    const focusImageY = (centerY - this.data.y) / previousScale;
    this.applyTransform(nextScale, centerX - focusImageX * nextScale, centerY - focusImageY * nextScale);
  },
  sliderScale(event: any) {
    this.updateScale(scaleForSliderValue(Number(event.detail.value || 100)));
  },
  nudgeScale(event: any) {
    this.updateScale(Number(this.data.scale || 1) + Number(event.currentTarget.dataset.delta || 0) / 100);
  },
  reset() {
    this.applyTransform(1, (this.data.areaWidth - this.data.baseWidth) / 2, (this.data.areaHeight - this.data.baseHeight) / 2);
  },
  cancel() {
    wx.navigateBack();
  },
  async confirm() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const renderedWidth = this.data.baseWidth * this.data.scale;
      const renderedHeight = this.data.baseHeight * this.data.scale;
      const x = clamp(this.data.x, this.data.areaWidth - renderedWidth, 0);
      const y = clamp(this.data.y, this.data.areaHeight - renderedHeight, 0);
      const sx = Math.max(0, -x / renderedWidth * this.data.originalWidth);
      const sy = Math.max(0, -y / renderedHeight * this.data.originalHeight);
      const sw = Math.min(this.data.originalWidth - sx, this.data.areaWidth / renderedWidth * this.data.originalWidth);
      const sh = Math.min(this.data.originalHeight - sy, this.data.areaHeight / renderedHeight * this.data.originalHeight);
      const context = wx.createCanvasContext("cropCanvas", this);
      context.drawImage(this.data.src, sx, sy, sw, sh, 0, 0, this.data.areaWidth, this.data.areaHeight);
      await new Promise<void>((resolve) => context.draw(false, () => setTimeout(resolve, 120)));
      const file = await new Promise<any>((resolve, reject) => wx.canvasToTempFilePath({
        canvasId: "cropCanvas",
        x: 0,
        y: 0,
        width: this.data.areaWidth,
        height: this.data.areaHeight,
        destWidth: this.data.outputWidth,
        destHeight: this.data.outputHeight,
        fileType: "jpg",
        quality: .92,
        success: resolve,
        fail: reject,
      }, this));
      const updatedAt = Date.now();
      if (this.data.target === "register") {
        const uploaded = await upload<any>("/api/mini/creator-application/image", file.tempFilePath, {}, "consumer");
        wx.setStorageSync("qideng_register_image", file.tempFilePath);
        wx.setStorageSync("qideng_register_image_key", uploaded.imageKey);
        wx.setStorageSync("qideng_register_image_url", uploaded.imageUrl || "");
        wx.setStorageSync("qideng_register_image_owner", uploaded.consumerId);
      } else if (this.data.target === "registerLogo") {
        const uploaded = await upload<any>("/api/mini/creator-application/image", file.tempFilePath, { target: "logo" }, "consumer");
        wx.setStorageSync("qideng_register_logo", file.tempFilePath);
        wx.setStorageSync("qideng_register_logo_key", uploaded.imageKey);
        wx.setStorageSync("qideng_register_logo_url", uploaded.imageUrl || "");
        wx.setStorageSync("qideng_register_logo_owner", uploaded.consumerId);
      } else if (this.data.target === "project") {
        const uploaded = this.data.projectId
          ? await upload<any>("/api/mini/creator/project-image", file.tempFilePath, { projectId: String(this.data.projectId) })
          : null;
        wx.setStorageSync("qideng_project_image_result", { projectId: this.data.projectId, localPath: file.tempFilePath, url: uploaded?.url || "", updatedAt });
      } else if (this.data.target === "activity") {
        const uploaded = await upload<any>("/api/mini/creator/activity-image", file.tempFilePath, { activityId: String(this.data.activityId) });
        wx.setStorageSync("qideng_activity_image_result", { activityId: this.data.activityId, localPath: file.tempFilePath, url: uploaded.activity?.imageUrl || "", updatedAt });
      } else {
        const uploaded = await upload<any>("/api/mini/creator/profile-image", file.tempFilePath, {});
        wx.setStorageSync("qideng_profile_image_result", { localPath: file.tempFilePath, url: uploaded.creator?.workUrls?.[0] || "", updatedAt });
      }
      wx.removeStorageSync("qideng_crop_source");
      wx.setStorageSync("qideng_image_updated", updatedAt);
      wx.showToast({ title: this.data.target === "register" || this.data.target === "registerLogo" ? "裁剪完成" : "图片已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 350);
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "图片保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
