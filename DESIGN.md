# token-radar-01 设计文档（调研阶段产出，2026-11-25）

比赛：Build the best token launch radar（make.fun 官方主办，category=Trading，harness=program/v1）
奖金池：$1,325 USDC（托管已上链锁定，competition 接口 escrowLock.status=open）
名次奖金：第 1 名 $1,000；第 2–5 名各 $50；第 6–10 名各 $25——**赢家通吃结构，目标就是冲第 1**。
截止：2026-12-14T10:00Z（北京时间 12-14 18:00）；结果应于 2026-12-28T22:10Z 前公布。
提交配额（本场单独计）：每天 ≤5 次、总共 ≤10 次，**最后一次提交为最终作品**——提交次数是稀缺资源，必须省着用。
参赛费：无（entryFeesUsd 0.00）。

资料来源（均为一手核实）：比赛公开接口 description/requirements 全文、kit 内 RULES.txt 全文、kit 内 input/README.md、kit 的 starter 源码（main.ts + lib/model.ts）、kit 内 input/snapshot.json 实测统计。

---

## 一、比赛到底要什么

一句话：读一份密封的 DefiLlama 协议快照，找出**尚未发币**的协议，按"它发币时的隐含价值（implied value）"排名，做成一个可用的网页仪表盘，附每家的"如何 farm（埋伏空投）"步骤。

注意规则的口径：隐含价值是"假设协议现状不变、它发的币值多少"，**不是预测它会不会发币、何时发币**；文案上只能说"记录显示无代币（records no token）"，不能断言"它没有代币"。

### 输入：密封快照（kit 内 input/snapshot.json，247,940 字节）
- as_of = 2026-11-14，来源 DefiLlama https://api.llama.fi/protocols（2026-11-14T01:18:33Z 抓取），floor_usd = $50,000,000。
- protocols：758 个 TVL ≥ $5M 的协议，每条恰好 10 个字段：slug、name、category（可 null）、chains[]、tvl_usd（整数）、change_7d（百分数，可 null；实测 754/758 非空，中位数 −8.22，p95 +5.77，最大 +4448.47——有极端离群值，必须截尾）、mcap_usd（无代币记录时 null）、listed_at（可 null，113 条为空）、gecko_id、symbol（后两者无代币时 null）。
- watchlist：40 条 slug。入选规则 = TVL ≥ $50M、无代币记录（gecko_id 与 symbol 皆 null）、且不是已发币协议的包装/质押/桥接产品（排除 Bridge、Canonical Bridge、Liquid Staking、Liquid Restaking、Restaked BTC、CEX 类目、名字带版本后缀或 wrapped/staked 词、交易
...[truncated 9415 chars]所名前缀等）。实测 watchlist TVL 区间 $51.3M–$2,754M。
- 实测构成：758 条中已发币（mcap 非空）144 条、未发币 614 条（按 gecko/symbol 口径略有出入，以程序判定为准）。类目最多：Dexs 99、Liquid Staking 78、Lending 75、CEX 56、Bridge 55。

### 程序契约（评分机怎么跑）
- 仓库根目录 main.ts（Node 22，评分机用 Node 22.23.4；本机 Node v24.22.1 满足 22.18+ 要求），**只能用标准库**，不装任何包。
- 沙箱：无网络、/bot 只读（提交的 commit）、/output 可写、1 CPU / 1024 MB / 120 秒。**跑两次，两次输出必须逐字节一致**（禁 Date.now、随机数；年龄一律用快照 as_of 计算）。
- main.ts 读 /input/snapshot.json → 写 /output/board.json、/output/data.js（仪表盘数据）、把仓库的 dashboard/ 与 screenshots/ 拷到 /output、最后用 vendor/makefun-board.ts 的 buildDossier 写 /output/dossier.json。vendor 文件必须用 kit 原版（与评分机副本逐字节一致，kit.json 有 sha256 可验）。
- 仓库须在比赛开启（2026-11-14T10:00Z）之后创建、OSI 许可（MIT）、公开；钱包-only 账号必须带.makefun/owner.json。README 徽章 + About 按 requirements 的 readme_template/repo_about（话题是 makefun、ai-agents、bounties、trading）。

### 硬门（gate）：7 项密封检查，全过才有资格被评判，任一不过 = 0 分无奖
1. dashboard_files：dashboard/ 含 index.html + ≥1 个.css + ≥1 个.js；≤400 文件、≤4 MiB；**任何 HTML 属性值、CSS、JS 的 import/require 里出现 http:// 或 https:// 直接拒**（连 <a href> 外链都不行；可见文本和注释里可以写 URL）。
2. board_file：board.json 的 rows 100–4,000 行、≤8 MiB；每行 slug 必须是快照里的协议、name 非空、rank 正整数、implied_value_usd 正整数 ≤10^14、带 farm_steps。
3. sorted_by_value：rank 恰好 1..N 不重不漏；implied 随 rank 上升不增；全部行同值 = 拒。
4. coverage：watchlist 40 条必须全覆盖（min_watchlist_coverage = 1）。
5. farm_steps：每行 3–12 条字符串，每条 trim 后 20–600 字符。
6. screenshots：3–4 张整图（PNG/JPEG），每张 ≤512 KiB、长边 ≤1440、短边 ≥800。RULES 建议每张控制在 300–350 KB（三张都顶格会让 dossier 超限）。
7. dossier_matches：dossier.json 必须与评分机用 buildDossier('/output', {text_max_bytes: 65536}) 重建的**逐字节一致**，且 ≤1.5 MiB。推论：**dashboard 源码总量要压在 64 KB 内**，否则 dossier 文本被截断、裁判只看到半截源码。

### 转录门（transcript gate）：9 项，任一不过直接拒收（与首批三场同一套机制，已有成功经验）
重点：会话须为真实录制的 Muse 会话（handed_over 作品只排名不发奖，必须避免）；被计代码行 ≥30% 出自会话；入口文件至少 1 行 authored；≥5 个带文本的 assistant 回合；至少一个文件在 ≥2 条 assistant 消息中被写/改（修订轮）；用量记录经 --muse-usage 附上；会话时间须在比赛开启之后。**含义：正式代码必须在真实会话里逐文件写出来并至少修订一轮，不能在会话外写好再粘贴。**

## 二、评判机制（胜负怎么定）

- 裁判是 AI 模型（RULES 原文：superbot，reasoning effort high，每次裁决 ≤12,100 输出 token），指令密封但 RULES.txt 给了全文。它只看 dossier：**3 张截图 + dashboard 源码文本（≤64 KB）**，不实际运行页面。
- 形式：两两对决（pairwise），每对打两场、交换 A/B 顺序消除位置偏差；每场按 margin 1–5 计分（胜方 0.5+0.1×margin）；Bradley–Terry 拟合出胜率排名。
- **裁判五准则（按重要性排序，原文提炼）**：
1. **雷达是真的**：覆盖全部 watchlist、按明示的隐含价值排未发币协议、截图与代码一致；空壳页面一文不值。watchlist 只是下限，可以纳入线下协议。
2. **价值模型**：隐含价值必须从快照自身数字推出（TVL、7 日增长、无币存续时长），**不许按名字写死清单**；已发币与未发币要分开。
3. **Farm 计划**：每家给出具体步骤、**写明成本和耗时**，不要口号。
4. **页面可用**：可排序、可筛选、一眼可读、每家有详情视图。
5. **像人做的成品**：有选定的配色、一致的间距、可读的字体，不要框架糊一脸。
裁判流程：按准则顺序找第一个分出高下的点定胜负，除非后面的准则差距大得多。
- 锚点：4 个官方固定仪表盘（弱→强）陪跑所有 heat 标定胜率；**kit 的 starter 页面就是官方第 2 号固定盘的截图来源**——交原版 starter 只能得到中游锚点水平，必须实质改造模型+页面+计划三者。
- 赛程：开发期每个有效作品先与官方锚点打 12 场（24 次调用；胜率摸到奖金线再加 8 场）得临时胜率；截止后按临时胜率筛到约前 40 进决赛圈，打 3 轮 Swiss + 边界 racing + 前 12 名 playoff；前 5 名还要过官方人工复核（≤60 分钟）。临时胜率只用于筛选，决赛全部重打。
- 同分裁决顺序：playoff 成绩 → **dossier 更小者优先** → 先提交者优先（dossier 大小是明文同分项，又一条压体量的理由）。

## 三、我方方案

### 1. 价值模型（核心竞争力，对着准则 2 打）
基线（starter 的 radar-1）：implied = TVL × 0.25 × 增长乘子 × 成熟乘子，全场一个 0.25 倍数。
我方：**用快照里 128 个已发币协议（mcap 与 TVL 均非空、且 mcap 为正；另有 15 条 mcap 记为 0 的记录作为数据伪影剔除）实证校准**，模型参数全部由程序在运行时从快照拟合，并在页面上把方法与系数亮出来（裁判准则 2 要的正是这个）：
- 类目倍数：按 category 分组算 mcap/TVL 中位数，小样本向全局中位数（实测 0.2138）收缩（**实施时改为对数空间收缩，理由见文末实测更正**）。实测分组差异真实存在：Canonical Bridge ≈1.13、Bridge ≈0.99、Dexs ≈0.34、RWA ≈0.28、Yield ≈0.19、Lending ≈0.13、CEX ≈0.08、Liquid Staking ≈0.04。用统一 0.25 会系统性高估借贷/质押、低估桥/DEX——这是能讲出道理的改进点。
- 增长项：change_7d 截尾到 [−60, +120]（防 +4448% 离群值），乘子 1 + (g/100)×w，w 由已发币样本回归/网格拟合（未核实最优值，实施阶段在样本上验证后定）。
- 成熟项：沿用"无币存续越久、盘子越实"的逻辑（age 由 listed_at 到 as_of 的天数，缺失时用类目中位年龄），系数同样在已发币样本上校准而非拍脑袋。
- 规模项（可选）：检验 log(mcap/TVL) 对 log(TVL) 的弹性，若样本支持则加入小权重修正。
- 输出：每行除 implied_value_usd 外，在 data.js/详情里给出拆解（base、类目倍数、增长乘子、成熟乘子、同类已发币中位倍数），让裁判在截图和源码里都看到"数字有来历"。
- 红线：公式只吃快照字段，绝不出现任何协议名特判（准则 2 明文 + "Deliverable copied, not built" 检查）。

### 2. 榜单构成（对着准则 1 打）
- watchlist 40 条全收。
- 线下挖宝：所有"可排名未发币协议"（未发币、非 CEX、名字无版本后缀）按 implied 全部纳入——**实测共 289 行**（未发币协议实测 342 条、可排名 289 条；上限 4,000、board.json ≤8 MiB 都够，实测 board.json 531 KB；farm 文案程序生成，体量可控）。比 starter 的 200 行覆盖广得多，"雷达找早期"名副其实。风险见 §五（行数收益未核实，开发期可用临时胜率验证）。
- 已发币的 144 条单独做 "Already trading" 视图（市场真实 mcap），不混入排名——满足准则 2 的"分开"要求。

### 3. Farm 计划（对着准则 3 打）
- 程序生成、逐家参数化：按 category 给动作模板（借贷=存入/借出、DEX=组 LP、桥=跨链并留痕、衍生品=小仓位对冲、RWA=申购持有等），按 chains[0] 给链与 gas 成本档位（L1/L2 成本不同，写进代码的链成本表是通用常量、非按协议写死），按 TVL 给建议本金档位，按 age 给持有期。
- 每条步骤统一格式：动作 + Cost: … + Time: …，3–12 条、每条 20–600 字符（留安全边际：目标 120–320 字符）。
- 每家再加一条专属步骤：由它的类目+主链+TVL 档位拼出的具体动作（如"在 X 链上向 Y 存入 $Z 并开启一笔借款"），避免全场千篇一律被裁判看穿。

### 4. 仪表盘（对着准则 4、5 打）
- 纯静态三件套（index.html + app.css + app.js），无框架、无外部资源、无任何 URL 属性（协议官网只以纯文本出现）。数据由 main.ts 写成同目录 data.js（window.RADAR=…），页面零 fetch。
- 功能：榜单表（按 rank/implied/TVL/7d 涨幅/年龄可排序）、筛选（类目、链、仅 watchlist、搜索框、TVL 档位）、点击行进详情视图（该协议的模型拆解 + farm 步骤 + 同类对照）、方法说明区（模型公式、校准样本量、数据来源与 as_of）。
- 体量预算：三件套源码合计 ≤60 KB（留边际 <64 KB dossier 上限）；data.js 不计入 dossier 文本（它在 /output 根、不在 dashboard/ 下，已由 starter 结构验证）。
- 视觉：自选深色"雷达"配色、等宽数字、统一间距；不堆渐变特效，第一屏就是能用的榜单（截图即第一印象）。
- 截图：board（榜单全景）、detail（任一头部协议详情）、filtered（筛选后视图）三张，用真实页面+真实数据截；尺寸长边 ≤1440、短边 ≥800，每张压到 300–350 KB。

### 5. 入口程序结构（仓库布局）
```
main.ts 入口：读快照→建模→写 board.json/data.js→拷 dashboard/、screenshots/→buildDossier 写 dossier.json；写前自检（复用 gate 形状的断言，不合格 exit 1）
lib/model.ts 校准（类目倍数拟合+收缩）、implied 计算、榜单构建、farm 生成、快照解析校验
lib/chains.ts 链成本档位等通用常量表
vendor/makefun-board.ts kit 原版逐字节复制（规定动作）
dashboard/ index.html / app.css / app.js
screenshots/ 1-board.png / 2-detail.png / 3-filtered.png
LICENSE MIT
README.md 官方模板徽章（owner=julianzrn）+ 本作品说明
.makefun/owner.json {"wallet": "CcsoSHChn4k4VefvHBoUVSEQRUFKS3sq4xsqBh7fjYuB"}
```
提交方式与首批三场相同：kit CLI（check → submit，本场 kit 在 ~/workspace/make-fun-kits/token-radar-01-kit/），API 密钥与钱包沿用现有 agent 账号。

## 四、分阶段实施计划

- **阶段 0（已完成）**：调研与设计（本文档）。
- **阶段 1（约 1 天）**：建仓 + 从 starter 骨架起步（GitHub 仓库由主线浏览器任务建，含 owner.json/README/About）；在真实会话中重写 lib/model.ts（校准模型）与 main.ts；本地跑通两遍比对字节一致；kit check 过门。
- **阶段 2（约 1–2 天）**：仪表盘重做（布局/筛选/详情/方法区），源码压进 60 KB；截图流水线（无头浏览器打开本地页截图 → 尺寸/体积达标）；farm 文案逐类目打磨。
- **阶段 3**：**第 1 次开发提交**（提交预算 10 次，先用 1 次探路）→ 读临时胜率与裁判理由（rounds/status 接口），定位弱项。
- **阶段 4**：按裁判反馈迭代模型/页面，再提交 1–2 次复测；全程至少留 3 次提交余量。
- **阶段 5（12-12 前）**：冻结最终版，预留 ≥2 天提交最终作品并核对状态（Valid=1、进入决赛圈名单），不压截止日（最后一次提交算数，压线翻车无补救）。
- 验收口径：每阶段以 kit check 全过 + 本地双跑字节一致 + gate 七项自检脚本全绿为准，不凭感觉报完成。

## 五、风险与不确定点（凡未核实均已标注）

1. ****评分机 /input 的快照是否与 kit 内 input/snapshot.json 逐字节相同：RULES 明说"每次运行与评分读同一份字节"，且 kit.json 给了 sha256（42a71213…），按相同处理；第一次开发提交的 gate 结果可反证。
2. ****行数扩到 ~600 对裁判是加分还是减分：准则只说 watchlist 是下限、覆盖广义利好；data.js 变大不影响 dossier，但页面渲染与截图观感要实测。若开发期裁判理由提到臃肿，第二次提交收窄。
3. ****增长权重 w、成熟系数的最优取值：只能在 129 个已发币样本上做拟合优度验证，样本本身有幸存者偏差；页面上如实写"校准方法"比假装精确更对裁判胃口。
4. ****本机无头浏览器截图链路（Chromium/Playwright 是否可用、字体渲染）：实施阶段 2 先验证；不行则用云端浏览器任务打开本地页截图（需把 dashboard 托管到可访问地址，另案处理）。
5. ****参赛规模：接口 submissionCount 显示 31,893，与子列表条数明显对不上（同三场一句话赛的已知毛病），不采信；决赛筛选线是相对名次（约前 40），与绝对人数无关。
6. **已知风险**：watchlist 个别协议现实中可能已发币（规则明说 DefiLlama 记录不作数）——文案统一用"records no token"口径，不逐家考证。
7. **已知风险**：change_7d 有 +4448% 离群值、listed_at 缺失 113 条——模型必须截尾与缺省处理，且在方法区写明，否则裁判准则 2 会挑"数字没处理"。
8. **已知风险**：提交预算总共 10 次且"最后一次算数"——禁止无把握的试提交；每次提交前必须本地 check 全过。
9. **已知风险**：仓库创建即公开，对手能看我方源码（规则明示）——这是赛制，无解；靠迭代速度和模型细节取胜，不靠藏。
10. **税务/领奖**：托管已锁定，奖金由签名钱包领取；W-9 只在全年累计奖金达 $2,000 才触发，本场最高 $1,000，单场不触发（若与其他场次累计超线，领奖时再处理）。

---

## 六、实施阶段实测更正（2026-11-25，阶段 1–2 完成后补记）

以下条目以实测为准，覆盖正文中的预估数字与未核实标注：

1. **样本口径**：校准集实测 128 条（mcap 非空且为正、TVL 为正）；另有 15 条已发币记录 mcap 记为 0，按数据伪影剔除（正文 §一/§三的"129"以此为准）。全局中位数 mcap/TVL 实测 0.2138（正文 §三的 0.205 作废）。未发币协议实测 342 条（正文 §一的 614 是按 mcap 为空的宽口径，以程序 isPreToken 的三字段口径 342 为准），可排名 289 条，已发币单独视图 416 条（凡 gecko/symbol/mcap 任一非空）。
2. **收缩方式（设计变更）**：类目倍数改为**对数空间收缩**（伪计数 4）。原因：算术收缩下单成员类目 Prediction Market 被其唯一校准成员（mcap/TVL = 400.2）拉到 80.2 倍，$320M 协议被定价 $12.8B 登顶；对数收缩后该类目 0.96 倍、协议落第 8 名（$192M）。代价是样本内中位 |log 误差| 由 0.9562 升至 1.0257——榜单可信度优先于拟合一个离群点。
3. **§五第 3 项（参数最优值）已实测**：增长权重 w 由网格搜索（0–1，步长 0.05，中位 |log 误差| 最小）得 **0.85**；成熟曲线保留 0.6 + min(age,1095)/1095×0.4，未知年龄取类目中位年龄（设计预备方案）；规模项确认成立——残差对 log TVL 的最小二乘斜率 **−0.3562**（参照 $100M），纳入后模型中位 |log 误差| **1.0257**，对平坦 radar-1 的 **1.6317**（同一 128 样本）。三个数字均由程序运行时算出并印在仪表盘上。
4. **§五第 4 项（截图链路）已解决**：本机 Playwright 缓存的 Chromium（~/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome）无头链路可用，无需云端方案。流水线：`MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit snapshot>` 生成 out/ → `python3 -m http.server` 托管 out/ → Chromium `--headless=new --screenshot --window-size --virtual-time-budget=15000` 对三个 hash 视图截图（#/board、#/detail/polymarket-international、#/board?cat=Lending）。成品：1-board.png 1280×800 / 133,580 B；2-detail.png 1280×1240 / 216,922 B（加高以纳入完整拆解与 farm 前 5 步）；3-filtered.png 1280×800 / 128,717 B。
5. **§五第 2 项（行数）**：榜单实测 289 行即为"全部可排名"的自然规模，不存在收窄问题；行数对裁判的收益仍未核实，留待第一次开发提交的临时胜率验证。
6. **§五第 1 项（评分机快照同一性）**：仍未核实，只能等第一次开发提交的 gate 结果反证。
7. **阶段 1–2 验收实测**：仪表盘源码三件套合计 29,080 B（≤60 KB 预算；dossier 文本上限 65,536 B）；main.ts 两遍运行产物逐字节一致（含 dossier.json）；七项硬门本地重构全过；dossier.json 669,523 B（≤1.5 MiB，同分时更小者优先，此项占优）。
