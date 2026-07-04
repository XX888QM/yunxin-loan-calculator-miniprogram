# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目

原生微信小程序（WXML/WXSS/JS），车贷/房贷计算器。零第三方依赖、零构建步骤。UI 文案和 git 提交信息用中文，conventional 前缀（feat:/fix:/docs:/chore:）。

## 常用命令

```bash
npm test                    # 全部测试 = loan + pdf + page
node tests/loan.test.js     # 只跑计算引擎测试
node tests/pdf.test.js      # 只跑 PDF 导出测试
node tests/page.test.js     # 只跑页面逻辑测试
node --check utils/loan.js  # 语法检查
```

- 测试是原生 `assert` 脚本，无测试框架，不能跑单个 case——整文件跑，秒级完成。
- 可视化验证用微信开发者工具打开项目根目录（CLI：`/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project <项目路径>`）。

## 架构

三层，职责严格分离：

### utils/loan.js — 计算引擎（ES5 风格：var/function）

- **所有金额参数一律是"元"**；利率入参是百分数（`13.14` = 年化 13.14%），返回值里的利率是小数（`0.01095`）。
- 入口防御统一走 `toNumber`（空串/非法返回 fallback）、`nonNegative`、`normalizeMonths`（期数夹 1..600）；零利率分支用 `isZeroRate`/`ZERO_RATE` 避免除零。
- IRR 反推 = `presentValueOfPayment` + 二分法（`inferMonthlyRateFromPayment`，第 4 参支持末期尾款 balloon）。
- 分期表构造模式：逐月 `interest = balance * r`，末期 `principalPart = balance` 一把清零，保证本金合计精确、末期余额为 0。
- **向后兼容铁律：给现有函数加参数必须可缺省，缺省时行为与旧版完全一致**（V1 测试断言一条不许改）。

### utils/pdf.js — PDF 导出（零依赖）

- 只生成还款明细 PDF，供页面写入本地临时文件后 `wx.openDocument` 打开。
- 不引入第三方库、不上传数据；PDF 中文用系统 CJK 字体 `STSong-Light` + UCS-2BE，金额/日期/期数用 `Helvetica`，PDF 金额不显示千分位逗号，避免数字被中文字体拉开，也避免嵌入字体导致包体变大。

### pages/index/index.js — 单页多工具（ES6：const/箭头函数）

- 每个工具一个 `build*Result()` 方法；`recalculate()` 全量重建所有结果，并按 `activeTool` 切换 `activeSchedulePreview`。
- 表单全存 `data.xxxForm`；事件只有三个通用 handler（`onInput`/`setFormValue`/`setMonths`），由 WXML 的 `data-form`/`data-field`/`data-value` 驱动。成对字段的互斥清空写在 handler 里（`downRatio`↔`downPayment`、`balloonRatio`↔`balloonAmount`）。
- **万/元换算只发生在页面层**：`amount(value, unit)`（unit==='wan' 时 ×10000），引擎永远收元；月供/月租/月供预算类字段永远按元、不参与换算。
- 工具导航按贷款类型过滤：`TOOL_OPTIONS.car`（含尾款贷 balloon）、`TOOL_OPTIONS.home`（含组合贷 combo、能贷多少 budget、提前还款 prepay）；快捷期数同理走 `TERM_OPTIONS`。

### WXML/WXSS

- 复用固定类名体系：`field/label/input/unit`、`segmented(.two)`、`quick-row`、`result-grid/metric(.main)`、`panel`。新面板照抄现有结构，不引入新样式体系。
- 品牌资源放在 `assets/`；顶部 logo 使用 `assets/logo.png`，保持小图资源低于微信代码质量建议的 200K。
- 公开仓库的 `project.config.json` 使用 `touristappid`；真实 AppID 只放本地未提交的 `project.private.config.json`。
- 发布包通过 `project.config.json` 的 `packOptions.ignore` 排除 docs/tests/README/CLAUDE/package.json 这类开发资料。

## 测试约定

- `page.test.js` mock 全局 `Page`/`wx` 后 require 页面文件，直接调 `build*` 方法断言；它还读取 index.wxml 做文案断言。
- 数值断言优先用**独立闭式公式**交叉验证（测试里自己写年金公式，不复用引擎内部函数）；互逆运算写闭环测试（如 `calcRentPricing` ↔ `calcRentToOwn` 往返还原利率）。
- 本仓库全程 TDD：改公式先写失败测试，再改实现。

## 合规红线（测试有锁，不可违反）

- 发布版不在车贷工具入口展示租购；租购"定价反推"的复制文案**不得出现"目标""收益"字样**（page.test.js 断言）——定价是对内工具，对外文案只给方案本身。
- WXML 不得出现"厘"字（page.test.js 断言，历史上删除过"月息厘"模式）。
- 页面文案不点名任何银行/机构，用"真实资金成本/宣称口径/反推年化"等中性词（详见 docs/开发文档.md §11）。
- 上线类目走"工具"类；"租购"Tab 涉及汽车融资租赁资质问题，公开发布版默认隐藏入口。

## 文档同步

功能改动后同步 `README.md` 和 `docs/开发文档.md`（§3 功能规格、§6 计算口径），只改受影响章节。设计与实施计划存放在 `docs/superpowers/specs|plans/`。
