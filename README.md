# 车贷房贷计算器微信小程序

中文 | [English](#car-loan-and-mortgage-calculator-wechat-mini-program)

原生微信小程序，无第三方依赖。面向车贷、房贷和还款计划核算场景，所有计算在本地完成，不提供贷款申请、放款或金融撮合服务。

## 功能

- 贷款类型：车贷 / 房贷
- 还款方式：等额本息、等额本金、先息后本
- 首页提供四步“贷款报价体检”：选用途 → 填本金和期数 → 填还款/费用 → 看折算资金成本与签约前核对项
- 车贷工具：算月供、折算利率、平息换算、尾款贷、全款 vs 分期落地总价
- 房贷工具：算月供、组合贷、反推本金、提前还款、LPR 手动情景
- 快捷期数：车贷 12/24/36/48/60 期；房贷 5/10/20/30 年
- 金额单位：元 / 万；切换单位或贷款类型时保持实际金额不变
- 普通贷款利率支持年化% / 月利率%，平息工具单独使用平息月费率/年费率
- 支持车价或房价减首付模式，首付比例可快速选择 20/30/40/50%
- 还款明细按“分”入账，汇总金额与逐期明细严格一致
- 折算利率支持等额月供、尾款贷和先息后本现金流
- “只知总利息”仅按等额月供折算，不用于尾款贷或先息后本
- 支持前置费用摊入，展示含费月利率、含费名义年化、含费复利年化及总融资成本
- 平息换算同时展示折算月利率、名义年化和复利年化
- 提前还款支持等额本息、等额本金、比例/固定违约金，以及可选的当前剩余本金
- 提前还款分“快速估算”和“账单/按日估算”：后者可录入剩余本金、账单应计利息，或按 ACT/365F、ACT/360、30/360 估算应计利息
- 报价体检会把前置费用、每期费用、尾款一起放入现金流；费用未确认时只给已录入项目的下限，不能加入横向对比
- 报价可手动临时加入对比，最多 3 份；只应比较同一用途且费用已确认的报价，不自动给出“哪份更划算”的结论
- 车贷落地总价会分开显示全款价、分期价、优惠、税费、保险、上牌、必选装，以及前置费用是现金另付还是从放款中代扣
- LPR 情景由用户手动填写合同加点、重定价期和假设 LPR；不联网查询实时 LPR
- 支持手动保存最多 30 份报价体检记录到本机；不保存姓名、手机号、证件号等身份信息
- 支持还款明细和报价体检报告的本地 PDF 导出，以及自愿分享
- 首页底部显示当前小程序版本号
- 页面明细默认展示前 12 期，完整明细导出 PDF；结果区提供一句话结论与复制
- 各工具提供场景说明与一键示例；首付/尾款比例即时显示约合金额
- 空着未填为灰色提示，真填错才红色报错
- 必填项、期数、首付、尾款和前置费用均进行显式校验，不再静默改写关键输入

## 计算口径

- 年化%按名义年利率处理，月利率 = 年化利率 / 12。
- 普通“月利率%”按剩余本金递减计息；按原始本金全期计费的销售报价应使用“平息换算”。
- 平息总利息 = 本金 × 平息月费率 × 期数，再按实际还款现金流反推真实资金成本。
- 真实利率通过完整月度现金流 IRR 反推；无有效非负利率时返回明确错误，不伪装成 0%。
- 前置费用口径以净到手本金 = 名义本金 − 前置费用反推。
- 报价体检的“已录入成本合计” = 合同还款额 + 已录入每期费用 + 已录入前置费用 − 贷款本金。
- 报价体检的费用状态为空时，未填写费用不能按 0 处理；年化和总成本仅代表已录入项目的下限。
- 车贷落地总价 = 车价 − 优惠 + 购置税 + 保险 + 上牌 + 必选装；融资成本与购车落地价分开核算，避免把贷款本金或首付重复算进成本。
- LPR 情景利率 = 手动填写的 LPR + 合同加点；在设定的重定价期按剩余本金重新测算。
- 提前还款净省 = 节省利息 − 违约金，结果可能为负。
- 账单应计利息只替代本次结算期的利息；之后的还款计划仍按固定利率和剩余期数估算。
- 首期年月只用于明细标签，不参与普通月供测算的按日计息。

## 适用边界

默认按固定利率、等间隔月度还款测算。LPR 页面是手动情景，不是实时利率或合同重定价模拟；不包含机构的具体重定价日、计息天数和特殊规则。账单/按日提前还款测算仅适用于正常的等额本息/等额本金、固定利率、无逾期/跳期且无尾款的情况；它不能代替结清试算单。未录入或未确认的费用、非整月首期、浮动利率和合同特殊条款需要以合同、正式还款计划、账单及最终结清试算单为准。

## 隐私与安全

- 不需要登录。
- 不接入后台服务。
- 不上传用户输入的金额、利率或还款明细。
- 报价记录只在本机存储，最多 30 条；保存前会过滤姓名、手机号、证件号、邮箱和地址等身份信息。
- PDF 由小程序本地生成，只写入用户本机临时目录。
- 开源仓库中的 `project.config.json` 使用 `touristappid`；真实 AppID 应放在本地未提交的 `project.private.config.json`。

## 开发

用微信开发者工具打开本目录。预览和上传需要当前微信号是该小程序开发者。

```bash
npm test
node --check utils/loan.js
node --check pages/index/index.js
```

测试覆盖计算引擎、现金流 IRR、分币不变量、报价费用边界、车贷落地总价、LPR 情景、提前还款账单/按日估算、本机历史、PDF 生成和页面逻辑。发布包通过 `project.config.json` 排除文档、测试、npm 文件、私有配置和 Git 文件。

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
- A four-step quote health check: purpose, principal/term, repayment/fees, then result and contract checklist
- Payment, real-rate, flat-rate, balloon, combined-loan, affordability, prepayment, car landed-cost, and manual LPR-scenario tools
- Yuan / ten-thousand-yuan display with amount-preserving unit switches
- Cent-level repayment schedules whose row totals exactly match summary totals
- Cash-flow IRR for equal payments, balloon loans, and interest-only loans
- Upfront-fee-adjusted monthly, nominal annual, and effective annual rates
- Flat-rate conversion with both nominal and effective annual rates
- Quick prepayment estimates plus bill-accrual or day-count estimates for normal fixed-rate loans
- Quote fees included in cash-flow IRR; an unconfirmed fee is not silently treated as zero and blocks quote comparison
- Up to three manually added temporary quote comparisons, without an automatic recommendation
- Local-only quote history (up to 30 saved reports) and local PDF reports
- Explicit input validation instead of silently clamping important values
- Calendar-labelled schedules, local PDF export, and voluntary sharing

## Calculation Rules

- Annual-rate input is treated as a nominal annual rate; monthly rate = annual rate / 12.
- Standard monthly-rate input is charged on the declining balance.
- Flat-rate quotes are charged against the original principal for the full term and are converted through actual cash flows.
- Real rates are inferred from complete monthly cash flows. Invalid or insufficient cash flows return an explicit error rather than a fake 0% result.
- Fee-adjusted quote rates use the entered repayment cash flows, upfront fees, recurring fees, and any balloon payment.
- An unconfirmed fee means the displayed quote cost is only a lower bound, not a comparison-ready result.
- Car landed cost and financing cost are separated so that loan funding, down payment, and cash-versus-deducted fees are not counted twice.
- LPR scenarios use manually entered LPR values plus the contractual spread; they are not live-rate queries.
- Early-repayment net saving = interest saved − penalty.

## Assumptions

Calculations assume a fixed rate and equally spaced monthly payments. LPR is a manual scenario, not a live rate or a bank repricing simulation. Bill-accrual and day-count prepayment modes still estimate the future schedule and cannot replace a settlement statement. Irregular first periods, unconfirmed fees, rate resets, and special contract terms require confirmation against the contract, formal repayment plan, bill, and final settlement quote.

## Privacy and Security

- No login or backend service
- No upload of entered amounts, rates, or schedules
- Quote history is stored locally only (up to 30 reports) and filters identity-like text before saving
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
