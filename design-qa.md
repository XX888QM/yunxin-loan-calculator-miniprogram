# 贷款报价体检与全页面 UI 验收

## 视觉依据

- 用户第 1 步问题图：`/var/folders/9y/2b4fxdnx14v41s93hg5nt0w00000gn/T/codex-clipboard-48357fae-c3b3-45f5-a41d-e0fb0cf59f9d.png`。
- 用户第 2 步问题图：`/var/folders/9y/2b4fxdnx14v41s93hg5nt0w00000gn/T/codex-clipboard-d62ee761-8f04-475e-b0e3-b03238cb3971.png`。
- 用户第 3 步问题图：`/var/folders/9y/2b4fxdnx14v41s93hg5nt0w00000gn/T/codex-clipboard-b1644b34-7ea9-402a-a2c0-067f451f2dea.png`。
- 用户结果页问题图：`/var/folders/9y/2b4fxdnx14v41s93hg5nt0w00000gn/T/codex-clipboard-ed9aff9b-7fc7-4a56-aa40-c0e511d92228.png`。
- 修复后截图目录：`/private/tmp/loan-ui-qa-after-20260807`。
- 四步同画面对比：`/private/tmp/loan-ui-qa-after-20260807/compare-all.png`。每组左侧为用户问题图，右侧为修复后的微信开发者工具实测。

## 环境与状态

- 微信开发者工具 RC 2.02.2607271，WeChatLib 3.8.12。
- 模拟设备：iPhone 12/13 (Pro)，94% 预览缩放。
- 实测主流程：首页 → 买车报价 → 第 2 步必填错误 → 第 3 步 → 结果 → 保存 → 历史 → 工具。
- 车贷工具逐项打开：算月供、折算利率、平息换算、尾款贷、落地总价。
- 房贷工具逐项打开：算月供、组合贷、反推本金、提前还款、LPR 情景。
- 月供一键示例实际生成 36 期结果与还款明细；问题面板为 0 个问题。

## Findings 与修复

- P1，第 2、3 步底部按钮挤压：改为稳定 flex 宽度，返回按钮与主按钮间距明确。
- P1，第 3 步文字越界、竖排、控件跑出卡片：分段按钮等分并允许自然换行；提前还款规则改为上下布局。
- P1，结果页三按钮挤出屏幕：复制/导出两列，保存与对比各占整行；新增修改、新建下一份和返回首页入口。
- P1，从第 3 步进入结果页后标题进入刘海区：所有页面和步骤切换主动回到顶部。
- P1，历史页新增首页/工具后品牌标题被挤成竖排：品牌与导航改为上下两行，标题保持横排。
- P2，买车/买房卡片双层且相连：去掉图标内层卡，卡片间保留独立间距；首页卡片也改为真实可点击入口。
- P2，必填错误只弹一下：第 1–3 步增加页内错误块，修正后自动消失。
- P2，长金额被省略：还款表改为真实宽度横向滚动，数值列不再用省略号隐藏。
- P2，结果文案口径：把“最高单次”改为“单项最高已录入支出”，并说明不等于签约当天总现金；房贷补充 LPR 重定价边界。

## 必查视觉面

| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 字体与排版 | 通过 | 第 1–4 步、历史、工具页无逐字竖排、文字重叠或水平越界。 |
| 间距与布局 | 通过 | 用途卡片独立；分段按钮、底部按钮、报告按钮和历史操作均留在容器内。 |
| 刘海与安全区 | 通过 | 页面切换回顶，首次进入结果页标题和品牌区不再进入刘海。 |
| 长金额 | 通过 | 月供示例生成 36 期明细，金额列完整并可横向滚动。 |
| 交互状态 | 通过 | 必填错误、保存、历史打开、工具导航和全部工具标签均可达。 |
| 控制台/问题面板 | 通过 | 清理样式告警后复查；问题面板 0 个问题。 |

## 自动验证

```text
node --check pages/index/index.js
node --check utils/loan.js
node --check utils/history.js
node --check utils/pdf.js
npm test
loan calculator checks passed
history checks passed
pdf checks passed
page checks passed
git diff --check
```

未上传、发布、推送或部署。

## 2026-08-07 用途卡片尺寸与图标居中复验

- 最新视觉依据：`/var/folders/9y/2b4fxdnx14v41s93hg5nt0w00000gn/T/codex-clipboard-357afbd6-dce9-4e94-8915-2c1921da8642.png`，824 × 1646 px。
- 实现截图：`/private/tmp/loan-ui-card-fix-20260807/implementation-crop.png`，282 × 640 px；微信开发者工具 iPhone 12/13 (Pro)，94% 预览缩放，第 1 步、房贷选中状态。
- 同画面对比：`/private/tmp/loan-ui-card-fix-20260807/comparison.png`；卡片重点对比：`/private/tmp/loan-ui-card-fix-20260807/comparison-focus.png`。比较前统一缩放，避免设备像素密度差异影响判断。
- P1：房子 PNG 的可见图形在透明画布中偏右；按可见图形中心单独向左校正，房子图标现与房贷卡片视觉中心一致。
- P2：买车、买房卡片整体过大；将卡片组最大宽度、卡片高度、内边距、图标、标题和选中标记等比例收小，并保留两卡独立间距。

| 复验面 | 结果 | 证据 |
| --- | --- | --- |
| 字体 | 通过 | 买车、买房字号同步缩小，仍清晰可读。 |
| 间距 | 通过 | 两卡间距明确，图标、标题和选中标记无挤压。 |
| 颜色 | 通过 | 蓝色选中态、青色房子图标与原视觉体系一致。 |
| 布局 | 通过 | 两张卡片尺寸一致；车和房子的可见图形均居中。 |
| 响应式 | 通过 | iPhone 12/13 (Pro) 预览中无裁剪、重叠或横向溢出。 |

- 微信开发者工具控制台清空后无新告警，问题面板显示 0 个问题。
- `npm test`、JavaScript 语法检查和 `git diff --check` 均通过。

## 2026-08-07 房贷默认期数与返回首页复验

- 微信开发者工具 iPhone 12/13 (Pro) 实际点击“买房报价”进入第 2 步，还款期数自动显示 `360`。
- 第 1–3 步顶部均显示“返回首页”；在第 2 步实际点击后成功回到首页。
- 房贷提示同步说明“360 期（30 年）”只是默认值，用户仍可按合同修改。
- 验收截图：`/private/tmp/loan-ui-navigation-fix-20260807/step1.png`、`/private/tmp/loan-ui-navigation-fix-20260807/step2.png`、`/private/tmp/loan-ui-navigation-fix-20260807/home.png`。
- 问题面板 0 个问题；`npm test` 与 `git diff --check` 通过。

## 2026-08-08 工具页“一键示例”按钮高度复验

- 来源截图：`/var/folders/9y/2b4fxdnx14v41s93hg5nt0w00000gn/T/codex-clipboard-dd55a595-4389-4ca4-bf3b-bd2edfcf475b.png`，866 × 1702 px。
- 实现截图：`/private/tmp/loan-ui-sample-button-20260808/implementation.png`，282 × 640 px；微信开发者工具 iPhone 12/13 (Pro)，94% 预览缩放，车贷“算月供”空表单状态。
- 全屏对比：`/private/tmp/loan-ui-sample-button-20260808/comparison-full.png`；重点对比：`/private/tmp/loan-ui-sample-button-20260808/comparison-focus.png`。
- P2：原按钮被工具页通用的 `88rpx` 最小高度撑高。删除该覆盖后，按钮使用已有胶囊内边距自然定高，文字仍居中且点击区域清楚。
- 字体、颜色、文案、图片资产均未改变；布局只收紧按钮高度，未引起裁剪或越界。
- 实际点击“一键示例”后，贷款本金 `200000`、期数 `36`、年化 `13.14` 正常填入并生成计算结果。
- `npm test` 与 `git diff --check` 通过。

## 2026-08-08 还款明细响应式布局复验

- 来源截图：`/var/folders/9y/2b4fxdnx14v41s93hg5nt0w00000gn/T/codex-clipboard-aa627bae-b3c2-4c55-8e99-b94a8909e9bb.png`，828 × 1334 px。
- 实现截图：`/private/tmp/loan-ui-schedule-fix-20260808/implementation.png`，282 × 640 px；微信开发者工具 iPhone 12/13 (Pro)，94% 预览缩放，车贷 36 期示例明细状态。
- 全屏对比：`/private/tmp/loan-ui-schedule-fix-20260808/comparison-full.png`；重点对比：`/private/tmp/loan-ui-schedule-fix-20260808/comparison-focus.png`。
- P1：固定 `1208rpx` 表格宽度导致本金、利息和余额列跑出屏幕；改为手机宽度内五列自适应，12 期数据全部可见。
- P2：工具页通用的 `88rpx` 高度覆盖把分享和导出按钮撑高，导致顶部控件乱换行；删除覆盖后恢复紧凑单行布局。
- P2：表格使用小程序不允许的标签和属性选择器；改为明确的 `first`、`amount` 类，避免样式被运行时忽略。
- 字体层级、蓝灰色板、文案与数据保持不变；本区域没有图片资产。实际点击“一键示例”可正常生成 36 期明细。
- `npm test`、`git diff --check` 通过；开发者工具仅剩自身资源预加载提示，无本次页面样式告警。

## 2026-08-08 明细操作同排与完整日期复验

- 来源截图：`/var/folders/9y/2b4fxdnx14v41s93hg5nt0w00000gn/T/codex-clipboard-ea0c5f3a-787a-430a-beed-98ae768238ed.png`，840 × 1266 px。
- 实现截图：`/private/tmp/loan-ui-schedule-actions-20260808/implementation.png`，282 × 640 px；微信开发者工具 iPhone 12/13 (Pro)，94% 预览缩放，已设置首期年月的 36 期明细状态。
- 全屏对比：`/private/tmp/loan-ui-schedule-actions-20260808/comparison-full.png`；重点对比：`/private/tmp/loan-ui-schedule-actions-20260808/comparison-focus.png`。
- P2：通用 `.field-picker` 的 `width: 100%` 让日期选择器独占一行；在 `.schedule-meta` 内恢复自动宽度，并禁止标题栏与操作栏换行，四个控件现稳定同排。
- P2：月份列原宽度不足导致 `2026-08` 显示为 `202...`；将首列扩至 `106rpx`，12 行年月均完整显示，其余四列仍无裁剪。
- 字体、颜色、文案和功能未改变；本区域没有图片资产。`npm test`、`git diff --check` 通过。

## 2026-08-08 首页版本号复验

- 视觉依据：`/var/folders/9y/2b4fxdnx14v41s93hg5nt0w00000gn/T/codex-clipboard-aefa26f2-76d3-452a-983c-0c3831120058.png`，882 × 1634 px。
- 实现截图：`/private/tmp/loan-home-version-1.2.0.png`，285 × 614 px；微信开发者工具 iPhone 12/13 (Pro)，94% 预览缩放，首页默认状态。
- 同画面对比：`/private/tmp/loan-home-version-comparison.png`；左侧为来源，右侧为实现，已统一为 285 × 614 px 比较。
- 版本号 `v1.2.0` 位于首页隐私说明下方居中，使用低对比小号字；不抢主按钮和隐私文案层级。
- 字体、间距、颜色、图片资产和原首页文案无其他变化；无裁剪、重叠或横向溢出。
- 开发者工具代码质量面板显示 0 个问题；`npm test` 与 `git diff --check` 通过。

final result: passed
