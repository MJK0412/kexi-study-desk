# 课隙 · 开发记录

> 从「看长课总是被进度条带走」出发，做一个只在本地运行的课程切片学习台。
>
> 最后更新：2026-10-31

## 1. 项目目的

基金从业课程通常一节 40 分钟到 4 小时，内容密度高。实际学习时有几个反复出现的痛点：

- 边听边记笔记，视频会继续往前跑，记完要拖回去；
- 想复听某个知识点，只能凭记忆在进度条上反复找；
- 网课平台不提供可编辑字幕，更无法按知识点整理；
- 笔记散在播放器、文档和脑子里，复习时拼不起来；
- 把课程视频传到在线转写服务，既有隐私顾虑，也受上传速度限制。

课隙的目标不是做一个「更强的播放器」，而是把一节长课拆成**可以一段一段学完、并且能留下痕迹**的学习单元：

1. 打开本地视频，或导入 B 站桌面端已缓存的课程；
2. 本机自动识别字幕，不把视频传到云端；
3. 按讲解逻辑切成 20–180 秒的学习切片；
4. 逐段播放，播完自动暂停，方便记笔记；
5. 给每段打「已掌握 / 待回看 / 重难点」，写自己的笔记；
6. 自动保存到 `D:\课隙\<课程名>\`，每个切片一个 Markdown 文件；
7. 可以导出整门课的 Markdown 复习材料。

### 明确不做的事

- 不抓取、不破解任何网课平台；
- 不提供云端账户、多端同步；
- 不把课程视频上传到第三方；
- 不做「自动替用户学习」的假功能。

## 2. 最终成果

当前版本已经可以日常使用：

- 桌面「课隙」图标，双击后隐藏启动本地服务，再打开浏览器；
- 本地视频：`mp4 / webm / mkv` 等浏览器可解码格式；
- B 站缓存：自动扫描 `Videos\bilibili`，也支持选择一讲缓存文件夹或手动选两个 `.m4s`；
- 本地语音识别：`faster-whisper small`，CPU int8，中文；
- 语义切片：按「第几个知识点 / 接下来 / 什么叫 / 总结 / 长停顿」等边界切分；
- 逐段播放：到切片末尾自动暂停，可切换连续播放；
- 每段独立倍速、标签、笔记；
- IndexedDB 工作副本 + `D:\课隙` 可读存档；
- Markdown 导出；
- 20 个单元测试通过，Vite 生产构建通过。

最终技术栈：

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | Vue 3 + Vite | 单页应用，组件化 |
| 样式 | Tailwind CSS v4 | 暖纸色 / 松绿色视觉 |
| 播放器 | Video.js 8 | 精准 seek、倍速、事件 |
| 本地存储 | IndexedDB（idb） | 课程、字幕、切片、笔记 |
| 本地服务 | Node.js HTTP | API、静态资源、任务调度 |
| 语音识别 | faster-whisper + PyAV | 本地 CPU，16k 单声道 |
| B 站缓存 | PyAV remux | 去掉 9 字节缓存头，合并音视频 |
| 桌面启动 | VBS + WScript | 不引入未签名 exe |

## 3. 需求演变

项目不是一次设计完的，而是按真实使用反馈逐层长出来的。

### 阶段 A：先跑通「切片 + 笔记」

最初的 MVP 只做：

- 本地视频；
- 导入外部 SRT/VTT；
- 固定 60 秒切片；
- 切片列表、标签、笔记；
- 逐段播放；
- IndexedDB；
- Markdown 导出。

这个阶段刻意不碰浏览器内 ASR，因为 Whisper WASM 对长课程太重。先用外部工具生成 SRT，验证「切片学习」本身是否有价值。

### 阶段 B：把「找字幕」这一步也去掉

验证完交互后，加入了本地 Node + Python 服务：

- 浏览器把视频上传到 `127.0.0.1`；
- 服务用 PyAV 解码音轨；
- faster-whisper 分块识别；
- 前端轮询进度，完成后自动生成切片。

这样用户不需要再自己找 SRT。

### 阶段 C：支持 B 站缓存课程

用户的课程主要在 B 站。B 站桌面端缓存不是普通 MP4，而是一对音视频分离的 `.m4s`：

- 文件开头有 9 个 ASCII 字节 `000000000`；
- 后面是 fragmented MP4（`ftyp` / `moov` / `moof` / `mdat`）；
- 直接交给播放器或 PyAV 会失败。

解决方案是本地 remux：

1. 跳过 9 字节缓存头；
2. 用 PyAV 分别打开视频轨和音频轨；
3. 按 DTS 合并 packet；
4. 输出带 faststart 的 MP4；
5. 通过 HTTP Range 提供给 Video.js。

同时支持两种入口：自动扫描固定缓存目录，或手动上传一讲缓存文件夹。

### 阶段 D：把学习记录放到浏览器之外

只存 IndexedDB 有两个问题：用户看不见，清浏览器数据还会丢。于是增加 `D:\课隙` 自动存档：

- 每门课一个文件夹；
- 每个切片一个 Markdown；
- `课程总览.md` 用于从头复习；
- `课程数据.json` 作为完整备份；
- 修改标签、笔记、倍速后自动更新。

### 阶段 E：从固定 60 秒到按内容切片

固定窗口会把一个知识点从中间切断。最终改为本地规则语义切片：

- 知识点转折词；
- 段落停顿 + 句末标点；
- 最短 20 秒，最长 180 秒；
- 末尾碎片并入上一段；
- 旧切片的标签、笔记、倍速按时间中点迁移到新切片。

不调用云端 LLM，保证离线、可预测、零额外费用。

### 阶段 F：桌面化

从「每次开 PowerShell」变成桌面图标：

- `课隙.vbs` 隐藏启动 Node 服务；
- 健康检查通过后再打开浏览器；
- 图标放在 `C:\ProgramData\课隙\kexi.ico`，避免 Windows 不展开 `%USERPROFILE%` 路径的问题；
- 不使用未签名 exe，避免 Smart App Control 拦截。

## 4. 架构

```text
┌──────────────────────────────┐
│ 浏览器（Vue 3 + Video.js）    │
│                              │
│ 切片列表   播放器   笔记面板  │
│      │        │        │     │
│      └────────┴────────┘     │
│          IndexedDB           │
└──────────────┬───────────────┘
               │ HTTP / Range
┌──────────────▼───────────────┐
│ 本地 Node 服务 :5173          │
│                              │
│ /api/transcribe  转写任务     │
│ /api/bilibili/*  缓存与播放   │
│ /api/archive/*   D 盘存档     │
│ Vite middleware / dist        │
└───────┬──────────────┬───────┘
        │              │
┌───────▼──────┐ ┌─────▼────────┐
│ faster-whisper│ │ D:\课隙       │
│ + PyAV        │ │ 课程文件夹     │
└───────────────┘ └──────────────┘
```

### 前端模块

| 文件 | 职责 |
|---|---|
| `src/App.vue` | 页面编排、弹窗、全局事件 |
| `src/stores/studio.js` | 课程 / 切片 / 播放状态、业务动作 |
| `src/components/PlayerStage.vue` | Video.js 封装、逐段暂停、倍速 |
| `src/components/SliceSidebar.vue` | 切片列表、筛选、进度 |
| `src/components/BilibiliBrowser.vue` | B 站缓存扫描 / 上传 / 打开 |
| `src/components/TranscribeDialog.vue` | 转写进度、取消、结果 |
| `src/lib/db.js` | IndexedDB 封装 |
| `src/lib/slices.js` | 语义切片与旧数据迁移 |
| `src/lib/archive.js` | 调用本地存档 API，串行写入 |
| `src/lib/subtitles.js` | SRT / VTT 解析 |
| `src/lib/markdown.js` | 导出 Markdown |

### 本地 API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/health` | 服务 / 模型健康检查 |
| `POST` | `/api/transcribe` | 上传视频并创建转写任务 |
| `GET` | `/api/transcribe/:id` | 轮询任务进度 |
| `POST` | `/api/transcribe/:id/cancel` | 取消任务 |
| `GET` | `/api/bilibili/library` | 已扫描 / 已上传的缓存课程 |
| `POST` | `/api/bilibili/import/start` | 开始一次缓存上传 |
| `POST` | `/api/bilibili/import/:id/video` | 上传视频轨 |
| `POST` | `/api/bilibili/import/:id/audio` | 上传音频轨 |
| `POST` | `/api/bilibili/import/:id/complete` | 合并并登记课程 |
| `GET` | `/api/bilibili/:id/stream` | Range 播放 remux 后的 MP4 |
| `POST` | `/api/bilibili/:id/transcribe` | 从缓存视频直接创建转写任务 |
| `POST` | `/api/archive/course` | 写入 `D:\课隙\<课程名>\` |
| `GET` | `/api/archive/status` | 存档目录状态 |
| `POST` | `/api/archive/open` | 打开存档文件夹 |

### 数据模型

```ts
interface Course {
  id: string;
  name: string;
  source?: 'local' | 'bilibili';
  fileName?: string;
  fileSize?: number;
  fileLastModified?: number;
  duration: number;
  subtitleFileName?: string;
  subtitleSource?: 'import' | 'auto';
  sliceMode?: 'semantic';
  sliceCount: number;
  bilibiliId?: string;
  bilibiliBvid?: string;
  bilibiliP?: number;
  bilibiliGroup?: string;
  bilibiliUname?: string;
  videoUrl?: string;
  createdAt: number;
  updatedAt: number;
}

interface SubtitleItem {
  id: string;
  courseId: string;
  start: number;
  end: number;
  text: string;
}

interface Slice {
  id: string;
  courseId: string;
  title: string;
  preview: string;
  startTime: number;
  endTime: number;
  subtitleIds: string[];
  tag: 'done' | 'review' | 'hard';
  note: string;
  playbackRate: number;
}
```

## 5. 关键决策与踩坑

### 5.1 为什么用本地服务，而不是纯浏览器 WASM

浏览器 WASM 版 Whisper 适合短音频演示，不适合 4 小时课程：

- 模型几百 MB；
- 长音频解码和推理容易占满内存 / CPU；
- 页面刷新会中断；
- 无法稳定抽取视频音轨。

本地 Node + Python 服务只监听 `127.0.0.1`，视频不出本机，同时能复用成熟的 faster-whisper / PyAV。代价是必须有一个后台进程，所以后来做了 VBS 启动器。

### 5.2 为什么保留 IndexedDB，又写 D 盘

IndexedDB 负责页面内快速读写；D 盘负责用户可见、可备份、可脱离浏览器阅读。两边不是二选一，而是：

- IndexedDB = 工作副本；
- `D:\课隙` = 可读存档 + 完整 JSON 备份。

这样即使清浏览器数据，切片 Markdown 仍在。

### 5.3 B 站缓存为什么不能直接播放

缓存 `.m4s` 不是标准 MP4：

- 9 字节私有头；
- fragmented MP4，需要真实可 seek 的文件；
- 音视频分离。

最初用 PyAV 直接打开文件对象，`demux()` 返回 0 个 packet。后来改成先把去掉头的字节写入真实临时 `.mp4`，再打开、合并，才成功。

### 5.4 临时目录权限

DSH 沙箱下，Python 在 `server/tmp` 里新建子目录会 `Permission denied`；直接在已存在的目录里写唯一文件名可以。最终 remux 使用：

```text
.kexi-bili-<uuid>-video.mp4
.kexi-bili-<uuid>-audio.mp4
.kexi-bili-<uuid>-out.mp4
```

不再 `mkdtemp()` 建子目录。

### 5.5 语义切片不调用 LLM

课程字幕是连续口语，云端 LLM 切片会带来费用、延迟、隐私和不可复现问题。最终用本地规则：

- 强转折词；
- 长停顿 + 句末标点；
- 20–180 秒约束；
- 尾段合并。

规则不完美，但离线、稳定、可测试，而且旧笔记可以按时间迁移。

### 5.6 桌面图标为什么绕了一圈

最初快捷方式用 `public\favicon.ico`，Windows 却显示脚本图标。排查后发现：

- WScript 保存快捷方式时，把用户目录路径写成了 `%USERPROFILE%\...`；
- Windows 不展开这个变量来渲染图标；
- 改成用户目录外的绝对路径 `C:\ProgramData\课隙\kexi.ico` 后正常。

中途尝试过未签名 `课隙.exe` 内嵌图标，被 Smart App Control 拦截，最终放弃，回到 `wscript.exe + 课隙.vbs`。

### 5.7 双击没反应

旧启动器把「打开浏览器」交给第二个 Node 进程处理：

- 服务已运行时，第二个进程进入 `EADDRINUSE` 分支；
- 它可能在 detached 的 `start` 成功前退出；
- 用户看到的就是「双击没反应」。

新启动器自己负责：

1. 轮询 `/api/health`；
2. 必要时启动 `--no-open` 服务；
3. 等健康检查通过；
4. 用 `Shell.Application.ShellExecute` 打开浏览器；
5. 写 `server/launcher.log`，失败时弹窗。

### 5.8 其他问题

- pnpm 安装极慢：Node 优先走坏掉的 IPv6，设置 `--dns-result-order=ipv4first`；
- `DataCloneError`：往 IndexedDB 写入了 Vue reactive proxy，`putCourse` 改为 JSON 深拷贝；
- HuggingFace 下载失败：Xet 缓存权限问题，改用 `HF_HOME` + `HF_HUB_DISABLE_XET` + 镜像；
- Vite watcher 被 Edge 调试 profile 的 Cookies 锁文件搞崩：忽略 `.edge-*`、`server/models` 等目录；
- B 站缓存文件夹上传时，一次只能导入一讲，避免把多讲混在一起。

## 6. 目录结构

```text
.
├─ 课隙.vbs                    # 桌面启动器：健康检查 + 打开浏览器
├─ README.md                   # 使用说明
├─ DEVELOPMENT.md              # 本文：开发过程与决策
├─ server/
│  ├─ index.mjs                # HTTP API、Vite 中间件、转写任务
│  ├─ archive.mjs              # D:\课隙 课程文件夹存档
│  ├─ bilibili.mjs             # B 站缓存扫描、上传、remux、Range
│  ├─ bilibili_remux.py        # PyAV 合并音视频
│  ├─ transcribe.py            # faster-whisper 分块识别
│  ├─ setup.mjs                # 安装 Python 语音组件
│  ├─ pyfix/                   # 强制 IPv4
│  ├─ .venv/                   # 本地 Python 环境（不入库）
│  ├─ models/                  # Whisper 模型（不入库）
│  └─ tmp/                     # 临时视频（不入库）
├─ src/
│  ├─ App.vue
│  ├─ components/
│  ├─ composables/
│  ├─ lib/
│  └─ stores/
├─ tests/
├─ public/
└─ dist/                       # 构建产物（不入库）
```

## 7. 运行与构建

首次：

```powershell
npm install
npm run setup:asr
```

开发：

```powershell
npm run dev
```

生产：

```powershell
npm run build
npm start
```

日常使用直接双击桌面「课隙」。启动器会：

- 检查 `http://127.0.0.1:5173/api/health`；
- 服务没起时在后台启动；
- 就绪后打开默认浏览器；
- 日志写到 `server/launcher.log`。

## 8. 测试

```powershell
npm test
npm run build
```

当前结果：

- 4 个测试文件，20 个测试全部通过；
- Vite 构建成功，约 908 kB JS / 107 kB CSS；
- 手工 E2E 覆盖：本地视频、自动转写、B 站缓存扫描 / 上传、Range 播放、刷新重连、逐段暂停、标签笔记、D 盘存档、旧切片迁移。

重点回归场景：

1. 记笔记时视频是否暂停；
2. 逐段播完是否自动停在段尾；
3. 刷新后 B 站课程是否能自动重连；
4. 改笔记后 `D:\课隙\<课程名>\切片*.md` 是否更新；
5. 旧固定切片是否迁移成语义切片且笔记不丢；
6. 双击桌面图标是否能打开页面。

## 9. 数据与隐私

- 视频只在本机浏览器和 `127.0.0.1` 服务之间流动；
- 语音识别在本机 CPU 完成；
- 临时视频在任务结束 / 取消后删除；
- 课程和笔记保存在本机 IndexedDB 与 `D:\课隙`；
- 不接入任何云端 ASR、云存储或用户账户；
- 仅处理用户合法拥有的课程文件，不抓取、不破解平台。

## 10. 已知限制与后续

- 目前主要面向 Windows + Chrome / Edge；
- 识别速度取决于 CPU，没有 GPU 加速；
- 没有说话人分离、字幕润色、全文检索；
- 语义切片是本地规则，不是真正的语义模型；连续无停顿的长讲解仍可能切得不够准；
- 本地视频刷新后需要重新选择文件；B 站缓存课程会自动重连；
- 模型精度受背景音、口音、录音质量影响；
- 后续可考虑：全文检索、自测面板、切片级独立倍速记忆、PWA、更多字幕格式。
