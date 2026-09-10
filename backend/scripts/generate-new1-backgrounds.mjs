import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "miniprogram", "assets", "backgrounds");
const artifactDir = path.join(root, "artifacts");
const width = 750;
const height = 1624;

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(artifactDir, { recursive: true });

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function hash2(x, y, seed) {
  let value = Math.imul(x + seed * 1013, 374761393) ^ Math.imul(y - seed * 977, 668265263);
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function noise(x, y, scale, seed) {
  const px = x / scale;
  const py = y / scale;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const tx = px - x0;
  const ty = py - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const top = mix(hash2(x0, y0, seed), hash2(x0 + 1, y0, seed), sx);
  const bottom = mix(hash2(x0, y0 + 1, seed), hash2(x0 + 1, y0 + 1, seed), sx);
  return mix(top, bottom, sy);
}

function fractal(x, y, seed) {
  return noise(x, y, 310, seed) * 0.48
    + noise(x, y, 128, seed + 9) * 0.3
    + noise(x, y, 52, seed + 17) * 0.16
    + noise(x, y, 22, seed + 31) * 0.06;
}

function colorRamp(stops, value) {
  const position = clamp(value);
  for (let index = 0; index < stops.length - 1; index += 1) {
    const current = stops[index];
    const next = stops[index + 1];
    if (position <= next.at) {
      const amount = (position - current.at) / (next.at - current.at);
      return current.color.map((channel, channelIndex) => mix(channel, next.color[channelIndex], amount));
    }
  }
  return stops.at(-1).color;
}

function grain(x, y, seed) {
  return (hash2(x, y, seed) - 0.5) * 8;
}

function vignette(x, y) {
  const nx = (x / width - 0.5) * 2;
  const ny = (y / height - 0.48) * 1.7;
  return clamp((nx * nx + ny * ny) * 0.09, 0, 0.22);
}

function renderPixelBuffer(scene) {
  const buffer = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = scene.pixel(x, y);
      const edge = vignette(x, y);
      const texture = grain(x, y, scene.seed + 71);
      const offset = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        buffer[offset + channel] = Math.round(clamp(color[channel] * (1 - edge) + texture, 0, 255));
      }
    }
  }
  return buffer;
}

const scenes = [
  {
    id: "mist-meadow",
    seed: 24082401,
    title: "雾野",
    role: "全站默认背景",
    prompt: "低饱和雾绿色原野与暖灰天空的抽象摄影感背景，远景虚化，轻颗粒，无人物、文字、标识和明确地标。",
    pixel(x, y) {
      const ny = y / height;
      const field = fractal(x + 60, y * 0.72, this.seed);
      const horizon = 0.37 + (noise(x, 0, 180, this.seed + 3) - 0.5) * 0.1;
      const depth = smoothstep(horizon - 0.13, horizon + 0.36, ny + (field - 0.5) * 0.17);
      const ramp = colorRamp([
        { at: 0, color: [218, 211, 198] },
        { at: 0.28, color: [183, 188, 178] },
        { at: 0.56, color: [103, 133, 105] },
        { at: 1, color: [53, 77, 59] },
      ], depth);
      const blush = Math.exp(-(((x / width - 0.73) / 0.36) ** 2 + ((ny - 0.21) / 0.19) ** 2)) * 16;
      const mist = (1 - Math.abs(field - 0.5) * 2) * 8;
      return [ramp[0] + blush + mist, ramp[1] + blush * 0.46 + mist, ramp[2] + blush * 0.36 + mist * 0.8];
    },
  },
  {
    id: "moving-canopy",
    seed: 24082402,
    title: "流光树影",
    role: "自然与轻松体验背景",
    prompt: "移动中拍摄的绿色树冠与柔和日光，方向性虚化和自然层次，低饱和、无离散光球、无人物、文字或标识。",
    pixel(x, y) {
      const nx = x / width;
      const ny = y / height;
      const diagonal = fractal(x + y * 0.43, y * 0.31, this.seed);
      const streak = noise(x + y * 0.72, 0, 82, this.seed + 12);
      const openSky = smoothstep(0.62, 0.92, noise(x - y * 0.24, y * 0.09, 260, this.seed + 22));
      const base = colorRamp([
        { at: 0, color: [27, 56, 43] },
        { at: 0.44, color: [53, 98, 68] },
        { at: 0.74, color: [111, 144, 102] },
        { at: 1, color: [190, 200, 164] },
      ], clamp(diagonal * 0.68 + openSky * 0.2 + streak * 0.12));
      const shaft = smoothstep(0.79, 0.96, streak) * (1 - ny * 0.34) * 22;
      const calmTop = smoothstep(0.3, 0, ny) * 8;
      return [base[0] + shaft + calmTop, base[1] + shaft * 1.2 + calmTop, base[2] + shaft * 0.76];
    },
  },
  {
    id: "city-in-motion",
    seed: 24082403,
    title: "城市流动",
    role: "发现首页与城市专题背景",
    prompt: "夜色城市移动摄影的抽象氛围，墨绿与青灰为主、少量温暖灯光横向拖影，无人物、品牌、文字和可识别建筑。",
    pixel(x, y) {
      const nx = x / width;
      const ny = y / height;
      const atmosphere = fractal(x * 0.52, y * 0.46, this.seed);
      const base = colorRamp([
        { at: 0, color: [18, 33, 31] },
        { at: 0.48, color: [31, 58, 56] },
        { at: 1, color: [72, 91, 83] },
      ], atmosphere * 0.72 + (1 - ny) * 0.2);
      const cyanLine = Math.exp(-(((ny - (0.31 + 0.028 * Math.sin(nx * 9))) / 0.028) ** 2)) * smoothstep(0.08, 0.42, nx) * 42;
      const warmLine = Math.exp(-(((ny - (0.57 - 0.035 * Math.sin(nx * 7))) / 0.034) ** 2)) * smoothstep(0.18, 0.74, 1 - nx) * 44;
      const lowerShadow = smoothstep(0.62, 0.96, ny) * 22;
      const rain = smoothstep(0.82, 0.96, noise(x + y * 1.8, 0, 36, this.seed + 44)) * 8;
      return [base[0] + warmLine - lowerShadow, base[1] + cyanLine * 0.7 + warmLine * 0.48 - lowerShadow + rain, base[2] + cyanLine - lowerShadow + rain];
    },
  },
];

const manifest = {
  version: "new1.0",
  generatedAt: new Date().toISOString(),
  method: "Original deterministic raster generation using seeded multiscale noise; no source or reference pixels were used.",
  dimensions: { width, height },
  assets: [],
};

for (const scene of scenes) {
  const filename = `new1-${scene.id}.jpg`;
  const destination = path.join(outputDir, filename);
  const raw = renderPixelBuffer(scene);
  await sharp(raw, { raw: { width, height, channels: 3 } })
    .blur(2.1)
    .sharpen({ sigma: 0.5, m1: 0.25, m2: 0.45 })
    .jpeg({ quality: 79, chromaSubsampling: "4:2:0", mozjpeg: true })
    .toFile(destination);
  manifest.assets.push({
    id: scene.id,
    title: scene.title,
    role: scene.role,
    path: `miniprogram/assets/backgrounds/${filename}`,
    seed: scene.seed,
    prompt: scene.prompt,
  });
}

fs.writeFileSync(path.join(artifactDir, "new1-background-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${manifest.assets.length} original backgrounds in ${path.relative(root, outputDir)}.`);
