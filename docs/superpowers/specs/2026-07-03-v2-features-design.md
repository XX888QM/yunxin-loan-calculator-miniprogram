# 车贷房贷计算器 V2 功能设计

日期：2026-07-03　状态：已确认（大哥口头批准）

## 背景

V1 已上线 6 个工具（车贷：算月供/查真利率/平息换算；房贷：算月供/组合贷/能贷多少/提前还款），计算引擎 utils/loan.js 经独立交叉验算全部正确。V2 目标：强化"揭穿套路"卖点（含费真利率、违约金），补齐车贷高频场景（车价首付、尾款贷），并加入云鑫租车主业工具（以租代购测算与定价）。

## 一、布局

不加页面，扩展现有 Tab（pages/index）：

- 车贷 5 个：算月供、查真利率、平息换算、**尾款贷（新）**、**租购（新）**
- 房贷 4 个不变：算月供、组合贷、能贷多少、提前还款

`TOOL_OPTIONS.car` 追加 `balloon`（尾款贷）、`rto`（租购）。

## 二、引擎改动（utils/loan.js）

### 2.1 新函数

| 函数 | 签名 | 公式/行为 |
|---|---|---|
| calcBalloonLoan | (principal, annualRatePercent, months, balloonAmount) | 月供 = (P − B·(1+r)⁻ⁿ)·r/(1−(1+r)⁻ⁿ)；前 n−1 期等额，末期 = 月供 + 尾款B；生成完整 schedule（尾款计入末期 principal）；零利率退化：月供 = (P−B)/n，末期加 B。B ≥ P 时月供为 0、全部挂尾款。返回 baseResult 结构 + balloonAmount 字段 |
| calcRentToOwn | (carPrice, downPayment, monthlyRent, months, buyout) | 融资额 = carPrice − downPayment；隐含月利率 = inferMonthlyRateFromPayment(融资额, monthlyRent, months, buyout)；输出 totalCost = 首付+月租×n+尾款、premiumOverCash = totalCost − carPrice、impliedMonthlyRate、impliedAnnualNominal、impliedAnnualEffective |
| calcRentPricing | (carPrice, downPayment, months, buyout, targetAnnualRatePercent) | 月租 = (carPrice − downPayment − buyout·(1+r)⁻ⁿ)·r/(1−(1+r)⁻ⁿ)；零利率退化 (carPrice−downPayment−buyout)/n；结果为负时返回 0（尾款已覆盖本金）。同时返回该定价下 totalCost、premiumOverCash |

### 2.2 现有函数扩展（全部向后兼容，新参数缺省时行为不变）

| 函数 | 扩展 |
|---|---|
| inferMonthlyRateFromPayment | 加第 4 参 `balloon`（默认 0）：现值方程加末期尾款项 Σpay/(1+r)^i + B/(1+r)^n = P；balloon=0 时与现行为完全一致。零利率保护条件同步改为 pay×n + B ≤ P 时返回 0 |
| calcActualRate | 加 `upfrontFee`（前置费用，默认 0）：IRR 以净到手本金 = principal − upfrontFee 计算；总利息仍按名义本金口径展示，另返回 feeAdjustedMonthlyRate 与不含费 monthlyRate 并列。加 `totalInterestInput` 支持模式：页面层先折算月供 = (principal + totalInterest)/months 再走同一路径（引擎不加新函数，页面换算） |
| calcPrepayment | 加 `penaltyPercent`（按提前还款额计）与 `penaltyAmount`（固定额），二者取其一（页面保证）；返回 penalty、netSaved = interestSaved − penalty（可为负，不夹 0，负值即"不划算"信号） |

### 2.3 小修

- `toNumber('')` 返回 0 而非 fallback：`String(value).trim() === ''` 时返回 fallback，消灭死代码（注意回归：现有页面空输入场景全部复测）。

## 三、页面改动（pages/index）

| 位置 | 改动 |
|---|---|
| 算月供（仅车贷显示） | "贷款额 / 车价+首付"输入方式切换；车价模式：车价 + 首付比例快捷（20/30/40/50%）或自定义首付额 → 贷款额 = 车价 − 首付，实时显示 |
| 查真利率 | 新增"前置费用"字段（默认空=0）；新增输入切换"知道月供 / 只知总利息"；结果区并列展示名义真实利率与含费真实利率 |
| 提前还款 | 新增违约金输入：比例%（按提前还款额）或固定金额二选一切换；结果区展示 省利息 / 违约金 / 净省，净省为负时红字提示"不划算" |
| 尾款贷（新 Tab） | 输入：车价或贷款额（复用车价首付控件）、期数、尾款（比例快捷 30/40/50% 或金额）、利率（年化/月息切换）→ 输出：月供、末期总付（月供+尾款）、总利息、与同参数等额本息的月供/总息对比 |
| 租购（新 Tab） | 顶部 segment"方案测算 / 定价反推"。测算：首付/保证金、月租、租期、尾款（全部可为 0）、可选车价（填了才算隐含年化和比全款多花）、可选银行年化（填了出贷款对比差额）。反推：车价、首付、租期、尾款、目标年化 → 月租定价。**定价反推的复制文案不含"目标收益率"字样**，只输出方案本身 |
| 全部金额输入 | "万/元"单位切换：房贷类表单默认万，车贷类默认元；换算仅在页面层（×10000），引擎一律收元 |
| 明细表 | 新增可选"首期年月"选择器（picker, 默认空）；填了后期数列显示"2026-08"式实际年月，跨年正确 |

## 四、测试

- `tests/loan.test.js` 补断言：balloon 月供闭式对照、balloon=0 退化等价、租购 IRR 往返（定价反推的月租代回测算应还原目标年化）、含费利率（费用>0 时利率必然升高）、违约金净省（含负值 case）、toNumber('') fallback。
- 独立交叉验算脚本（scratchpad/verify_loan.js 风格）同步扩展：尾款贷用逐期现金流现值核对；calcRentPricing ↔ calcRentToOwn 互为逆运算闭环。

## 五、不做（本版明确排除）

- 分享海报/保存历史（成本高，功能稳定后单独立项）
- 租购的保险/违章押金/服务费建模（口径太散，用备注栏兜底）
- 房贷 LPR 联动、税费计算

## 六、验收标准

1. `npm test` 全绿；独立验算脚本全过。
2. 老功能零回归：V1 的 22 项交叉验算原样通过。
3. 微信开发者工具实跑：新 Tab 切换、单位切换、空输入不崩、复制文案正确。
