# video2guide

**English** | [简体中文](README.zh-CN.md)

**把教程视频一键转成图文分步攻略（单文件 HTML + PDF）。**
**Turn tutorial videos into illustrated step-by-step guides.**

> 🤖 本项目由智谱 **GLM-5.3** 驱动的 AI 编程助手 ZCode 一次性完成开发、测试与发布。
> This project was built end-to-end by **ZCode**, an AI coding agent powered by **GLM-5.3** (Zhipu AI / 智谱).

![preview](docs/preview.png)

## 为什么做这个

为了写笔记把 10 分钟教程反复拖进度条、记下"第 3 步在 1:30"——这种活是机器人的活。`video2guide` 替你看视频：自动找出每一步从哪开始、截图、排版成一份干净的 HTML 攻略（可选 PDF），时间戳全都标好；你只需要往骨架里填字。

## 快速开始

需要 [Node.js](https://nodejs.org) ≥ 18。**无需安装任何依赖**——ffmpeg 自动定位（系统 `ffmpeg` → `FFMPEG_PATH` 环境变量 → `@ffmpeg-installer` 自带副本），PDF 导出自动找机器上的 Edge 或 Chrome。

```bash
# 从 git clone 的目录里直接跑
node bin/video2guide.mjs 教程视频.mp4 --pdf

# 或全局安装
npm i -g video2guide
video2guide 教程视频.mp4 --pdf
```

这一条命令就是全流程：检测分步 → 抽关键帧 → 生成 `guide.html`（加 `--pdf` 再出 PDF）。

## 两段式工作流（推荐）

自动检测能帮你完成 90%，剩下 10% 是你的文字：

```bash
# 1. 只做检测 -> steps.json + frames/
video2guide detect lecture.mp4 -o my-guide

# 2. 打开 my-guide/steps.json，给每一步填 "title" / "note"
#    （--srt 挂载的字幕会自动归进 "subs"）

# 3. 随时重新渲染
video2guide build --steps my-guide/steps.json --pdf
```

`steps.json` 格式：

```json
{
  "title": "我的攻略",
  "video": "lecture.mp4",
  "duration": 558.0,
  "steps": [
    {
      "id": 1,
      "start": 0, "end": 13.0,
      "title": "开场",              // 你的文字（可留空）
      "note": "这一步发生了什么",     // 你的文字（可留空）
      "image": "frames/step-01.jpg",
      "subs": ["自动归到这一步的字幕"]
    }
  ]
}
```

⚠️ `detect` 会覆盖 `steps.json`——先检测，润色完再用 `build` 渲染。

## 全部选项

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `-o, --out <dir>` | `./video2guide-out` | 输出目录 |
| `-t, --title <s>` | 视频文件名 | 攻略标题 |
| `--fps <n>` | `2` | 切换检测的采样帧率 |
| `--threshold <n>` | 自适应 | 手动指定 MAD 切换阈值（0–255） |
| `--min-gap <sec>` | `3` | 相邻两步的最小间隔秒数 |
| `--max-steps <n>` | `60` | 步数上限 |
| `--width <px>` | `1280` | 关键帧最大宽度 |
| `--srt <file>` | 无 | 挂载 SRT 字幕并按时间归到各步 |
| `--url <u>` | 无 | 视频来源页面 URL；时间戳会深链过去（`?t=秒`） |
| `--pdf` | 关 | 同时导出 PDF（需要 Edge/Chrome） |
| `--no-embed` | 内嵌 | 图片引用文件而不是 base64 内联 |
| `--qa` | 关 | 输出页面带 `data-qa` 标记（供截图自测） |
| `--ffmpeg <path>` | 自动 | ffmpeg 二进制位置 |
| `--browser <path>` | 自动 | PDF 导出用的浏览器 |

## 工作原理

1. **采样** — ffmpeg 把整个视频以 64×36 灰度流（`fps=2`）通过管道喂给 Node，JS 侧不做任何图片解码。
2. **检测** — 计算相邻帧的平均绝对差（MAD）；切换阈值鲁棒自适应（中位数 + 4×MAD，少数硬切不会带偏），配合局部极大值筛选、最小间隔约束和超限升阈迭代来满足 `--max-steps`。
3. **抽取** — 在每步的起始时间点抽一张全分辨率 JPEG。
4. **渲染** — 生成单个自包含 HTML（图片内联、带打印样式）；`--pdf` 时走无头 Edge/Chrome 打印导出。

全程本地运行，任何内容都不会上传。

## 提示与边界

- **效果最好**：场景分明的视频——录屏、幻灯片、硬切明确的组装/演示视频。
- **手持连续运镜**（镜头一直在动、很少切换）基线帧差很高，只能切出章节级大步骤。想要更细就调低 `--threshold`，然后润色 `steps.json`——两段式工作流就是为这个准备的。
- 有 SRT 字幕就用上，字幕对攻略质量的提升立竿见影。
- `guide.html` 默认内嵌图片，是一个可以随手发给任何人的单文件；想要小 HTML + `frames/` 文件夹就用 `--no-embed`。
- 视频下载刻意不做——喂给它你手里已有的文件就好。

## 路线图

- [ ] `--ai`：调用本地大模型自动起草步骤标题/笔记
- [ ] 屏幕文字 OCR 进步骤笔记
- [ ] 有 yt-dlp 时直接支持 URL 输入（YouTube/bilibili）

欢迎 PR——全部代码约 600 行、零依赖的纯 ESM。

## 许可

[MIT](LICENSE)
