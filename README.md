# 车贷房贷计算器微信小程序

中文 | [English](#car-loan-and-mortgage-calculator-wechat-mini-program)

原生微信小程序，无第三方依赖。面向车贷、房贷和还款计划核算场景，所有计算在本地完成，不提供贷款申请、放款或金融撮合服务。

## 功能

- 贷款类型：车贷 / 房贷
- 还款方式：等额本息、等额本金、先息后本
- 车贷工具：算月供、查真利率、平息换算、尾款贷
- 房贷工具：算月供、组合贷、能贷多少、提前还款
- 快捷期数：车贷 12/24/36/48/60 期；房贷 5/10/20/30 年
- 金额单位：元 / 万；切换单位或贷款类型时保持实际金额不变
- 普通贷款利率支持年化% / 月利率%，平息工具单独使用平息月费率/年费率
- 支持车价或房价减首付模式，首付比例可快速选择 20/30/40/50%
- 还款明细按“分”入账，汇总金额与逐期明细严格一致
- 查真利率支持等额月供、尾款贷和先息后本现金流
- “只知总利息”仅按等额月供折算，不用于尾款贷或先息后本
- 支持前置费用摊入，展示含费月利率、含费名义年化、含费复利年化及总融资成本
- 平息换算同时展示真实月利率、名义年化和复利年化
- 提前还款支持等额本息、等额本金、比例/固定违约金，以及可选的当前剩余本金
- 支持还款明细首期年月设置、表格预览、本地 PDF 导出和自愿分享
- 必填项、期数、首付、尾款和前置费用均进行显式校验，不再静默改写关键输入

## 计算口径

- 年化%按名义年利率处理，月利率 = 年化利率 / 12。
- 普通“月利率%”按剩余本金递减计息；按原始本金全期计费的销售报价应使用“平息换算”。
- 平息总利息 = 本金 × 平息月费率 × 期数，再按实际还款现金流反推真实资金成本。
- 真实利率通过完整月度现金流 IRR 反推；无有效非负利率时返回明确错误，不伪装成 0%。
- 前置费用口径以净到手本金 = 名义本金 − 前置费用反推。
- 总融资成本 = 总利息 + 已录入前置费用。
- 提前还款净省 = 节省利息 − 违约金，结果可能为负。
- 首期年月只用于明细标签，不参与按日计息。

## 适用边界

默认按固定利率、等间隔月度还款测算。不包含非整月首期、按日计息、中途利率调整或未录入的月度费用。组合贷默认商贷和公积金期限、还款方式及首期时间相同。实际结果以合同、正式还款计划和当前剩余本金为准。

## 隐私与安全

- 不需要登录。
- 不接入后台服务。
- 不上传用户输入的金额、利率或还款明细。
- PDF 由小程序本地生成，只写入用户本机临时目录。
- 开源仓库中的 `project.config.json` 使用 `touristappid`；真实 AppID 应放在本地未提交的 `project.private.config.json`。

## 开发

用微信开发者工具打开本目录。预览和上传需要当前微信号是该小程序开发者。

```bash
npm test
node --check utils/loan.js
node --check pages/index/index.js
```

测试覆盖计算引擎、现金流 IRR、分币不变量、单位切换、输入校验、PDF 生成和页面逻辑。发布包通过 `project.config.json` 排除文档、测试、npm 文件、私有配置和 Git 文件。

## 免责声明

本工具结果仅供测算和对照使用，具体贷款成本、还款计划、费用和违约金以正式合同、还款计划书及相关机构最终确认为准。

## License

MIT

---

# Car Loan and Mortgage Calculator WeChat Mini Program

[中文](#车贷房贷计算器微信小程序) | English

A native WeChat Mini Program with no third-party dependencies. It is built for car loan, mortgage, repayment-schedule, and funding-cost calculations. All calculations run locally. The app does not provide loan applications, lending, brokerage, or financial matching services.

## Features

- Car-loan and mortgage modes
- Equal installment, equal principal, and interest-only repayment
- Payment, real-rate, flat-rate, balloon, combined-loan, affordability, and prepayment tools
- Yuan / ten-thousand-yuan display with amount-preserving unit switches
- Cent-level repayment schedules whose row totals exactly match summary totals
- Cash-flow IRR for equal payments, balloon loans, and interest-only loans
- Upfront-fee-adjusted monthly, nominal annual, and effective annual rates
- Flat-rate conversion with both nominal and effective annual rates
- Early repayment for equal installment or equal principal, with optional current balance and penalties
- Explicit input validation instead of silently clamping important values
- Calendar-labelled schedules, local PDF export, and voluntary sharing

## Calculation Rules

- Annual-rate input is treated as a nominal annual rate; monthly rate = annual rate / 12.
- Standard monthly-rate input is charged on the declining balance.
- Flat-rate quotes are charged against the original principal for the full term and are converted through actual cash flows.
- Real rates are inferred from complete monthly cash flows. Invalid or insufficient cash flows return an explicit error rather than a fake 0% result.
- Fee-adjusted rates use net proceeds = principal − upfront fees.
- Total financing cost = interest + entered upfront fees.
- Early-repayment net saving = interest saved − penalty.

## Assumptions

Calculations assume a fixed rate and equally spaced monthly payments. The selected first month only labels schedule rows and does not introduce day-count interest. Irregular first periods, daily interest, rate resets, and unentered recurring fees are outside the model. Actual results should be checked against the contract, formal repayment plan, and current outstanding balance.

## Privacy and Security

- No login or backend service
- No upload of entered amounts, rates, or schedules
- PDFs are generated locally in the Mini Program temporary directory
- The public project uses `touristappid`; the real AppID remains in the uncommitted private config

## Development

```bash
npm test
node --check utils/loan.js
node --check pages/index/index.js
```

## Disclaimer

This tool is for estimation and comparison only. Actual loan cost, repayment schedule, fees, and penalties should be confirmed against formal contracts and repayment plans.

## License

MIT
