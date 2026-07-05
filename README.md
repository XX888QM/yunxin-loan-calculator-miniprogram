# 车贷房贷计算器微信小程序

中文 | [English](#car-loan-and-mortgage-calculator-wechat-mini-program)

原生微信小程序，无第三方依赖。面向车贷、房贷和还款计划核算场景，所有计算在本地完成，不提供贷款申请、放款或金融撮合服务。

## 功能

- 贷款类型：车贷 / 房贷
- 还款方式：等额本息、等额本金、先息后本
- 车贷工具：算月供、查真利率、平息换算、尾款贷
- 房贷工具：算月供、组合贷、能贷多少、提前还款
- 快捷期数：车贷 12/24/36/48/60 期；房贷 5/10/20/30 年
- 金额单位：元 / 万，房贷默认按万输入
- 利率口径：年化% / 月息%
- 支持车价或房价减首付模式，首付比例可快速选择 20/30/40/50%
- 根据本金、期数、月供或总利息反推真实月利率、名义年化和复利年化
- 支持前置费用摊入，计算含费真实利率
- 支持平息口径换算，反推真实资金成本
- 支持尾款贷，展示低月供、大尾款方案与等额本息的成本差异
- 支持等额本息提前还款估算，可计入比例或固定违约金
- 支持还款明细首期年月设置、表格预览、本地 PDF 导出和自愿分享

## 计算口径

- 年化%按名义年利率处理，月利率 = 年化利率 / 12。
- 月息%会先折算成年化利率，再进入还款计算。
- 真实利率按现金流 IRR 反推。
- 平息/月息按本金全期计息，再用实际月供反推真实资金成本。
- 提前还款净省 = 节省利息 - 违约金，结果可能为负。

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
```

测试覆盖计算引擎、PDF 生成和页面逻辑。发布包通过 `project.config.json` 排除文档、测试、npm 文件、私有配置和 Git 文件。

## 免责声明

本工具结果仅供测算和对照使用，具体贷款成本、还款计划、费用和违约金以正式合同、还款计划书及相关机构最终确认为准。

## License

MIT

---

# Car Loan and Mortgage Calculator WeChat Mini Program

[中文](#车贷房贷计算器微信小程序) | English

A native WeChat Mini Program with no third-party dependencies. It is built for car loan, mortgage, and repayment schedule calculations. All calculations run locally. The app does not provide loan applications, lending, brokerage, or financial matching services.

## Features

- Loan types: car loan and mortgage
- Repayment methods: equal installment, equal principal, and interest-only
- Car loan tools: payment calculator, real-rate checker, flat-rate converter, and balloon loan calculator
- Mortgage tools: payment calculator, combined loan calculator, affordability calculator, and early repayment estimator
- Quick terms: 12/24/36/48/60 months for car loans; 5/10/20/30 years for mortgages
- Amount units: yuan or ten-thousand yuan, with mortgages defaulting to ten-thousand yuan
- Rate modes: annual rate or monthly rate
- Price minus down payment input mode with quick down payment ratios: 20/30/40/50%
- Reverse-calculates real monthly rate, nominal annual rate, and effective annual rate from principal, term, payment, or total interest
- Includes upfront fees when calculating fee-adjusted real rates
- Converts flat-rate quotes into real funding cost
- Supports balloon loans and compares them against equal installment loans
- Estimates early repayment impact with percentage or fixed penalties
- Shows repayment schedules by calendar month, exports local PDFs, and supports voluntary sharing

## Calculation Rules

- Annual rate input is treated as nominal annual interest. Monthly rate = annual rate / 12.
- Monthly rate input is converted to annual rate before repayment calculation.
- Real interest rate is inferred by cash-flow IRR.
- Flat-rate quotes are calculated against the original principal for the full term, then converted back to real funding cost through the actual payment stream.
- Early repayment net saving = interest saved - penalty. It can be negative.

## Privacy and Security

- No login required.
- No backend service.
- No user-entered amounts, rates, or repayment schedules are uploaded.
- PDFs are generated locally and written only to the user's temporary file directory.
- The public `project.config.json` uses `touristappid`; the real AppID should stay in the uncommitted local `project.private.config.json`.

## Development

Open this folder in WeChat Developer Tools. Preview and upload require the current WeChat account to be a developer of the Mini Program.

```bash
npm test
```

Tests cover the calculation engine, PDF generation, and page logic. The upload package excludes documentation, tests, npm files, private config, and Git files through `project.config.json`.

## Disclaimer

This tool is for estimation and comparison only. Actual loan cost, repayment schedule, fees, and penalties should be confirmed against formal contracts, repayment plans, and the relevant financial institution.

## License

MIT
