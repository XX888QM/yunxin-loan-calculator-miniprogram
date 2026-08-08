const assert = require('assert')
const loan = require('../utils/loan')

function closeTo(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`)
}

const m5 = loan.calcEqualInstallment(350000, 13.14, 36)
closeTo(m5.monthlyPayment, 11816.5, 0.2)
closeTo(m5.totalInterest, 75394, 5)

const zeroRate = loan.calcEqualInstallment(120000, 0, 12)
closeTo(zeroRate.monthlyPayment, 10000, 0.01)
closeTo(zeroRate.totalInterest, 0, 0.01)

const tinyRate = loan.calcEqualInstallment(120000, 0.000000000001, 12)
closeTo(tinyRate.monthlyPayment, 10000, 0.01)
assert.ok(Number.isFinite(tinyRate.monthlyPayment))

const equalPrincipal = loan.calcEqualPrincipal(120000, 12, 12)
closeTo(equalPrincipal.firstPayment, 11200, 0.01)
closeTo(equalPrincipal.lastPayment, 10100, 0.01)

const interestOnly = loan.calcInterestOnly(120000, 12, 12)
closeTo(interestOnly.firstPayment, 1200, 0.01)
closeTo(interestOnly.lastPayment, 121200, 0.01)

const negativeInput = loan.calcEqualInstallment(-100000, -12, 12)
closeTo(negativeInput.monthlyPayment, 0, 0.01)
closeTo(negativeInput.totalInterest, 0, 0.01)

const actual = loan.calcActualRate(350000, 11816.5, 36, 0.59)
closeTo(actual.monthlyRate, 0.01095, 0.000001)
closeTo(actual.annualNominalRate, 0.1314, 0.00001)
assert.ok(actual.claimedMultiple > 1.8)

const flat = loan.calcFlatMonthly(350000, 0.59, 36)
closeTo(flat.monthlyPayment, 11787.22, 0.01)
assert.ok(flat.actualAnnualEffectiveRate > 0.13)

const combo = loan.calcCompositeLoan(1000000, 3.45, 500000, 2.85, 360, 'equalInstallment')
assert.strictEqual(combo.schedule.length, 360)
assert.ok(combo.totalInterest > 0)

const affordable = loan.calcAffordableLoan(11816.5, 13.14, 36, 'equalInstallment')
closeTo(affordable.principal, 350000, 5)
closeTo(affordable.monthlyPayment, 11816.5, 0.2)

const prepay = loan.calcPrepayment(350000, 13.14, 36, 12, 50000, 'term')
assert.ok(prepay.interestSaved > 0)
assert.ok(prepay.newRemainingMonths < prepay.oldRemainingMonths)

const paidOff = loan.calcPrepayment(350000, 13.14, 36, 36, 50000, 'term')
closeTo(paidOff.remainingBalance, 0, 0.01)
assert.strictEqual(paidOff.newRemainingMonths, 0)
assert.strictEqual(paidOff.schedule.length, 0)

assert.strictEqual(loan.toNumber('', 30), 30)
assert.strictEqual(loan.toNumber('   ', 7), 7)
assert.strictEqual(loan.toNumber(',', 5), 5)
assert.strictEqual(loan.toNumber(''), 0)
assert.strictEqual(loan.toNumber('1,234.5'), 1234.5)
assert.strictEqual(loan.normalizeMonths(9999), 600)
assert.strictEqual(loan.normalizeMonths(''), 1)

// balloon=0 与旧行为一致
closeTo(loan.inferMonthlyRateFromPayment(350000, 11816.5, 36, 0), 0.01095, 0.000001)
// 尾款往返：闭式月供反推应还原利率
;(function () {
  const P = 200000, B = 80000, m = 36, r = 0.012
  const pay = (P - B / Math.pow(1 + r, m)) * r / (1 - Math.pow(1 + r, -m))
  closeTo(loan.inferMonthlyRateFromPayment(P, pay, m, B), r, 0.0000001)
})()
// 月供×期数+尾款 恰好等于本金 → 零利率
assert.strictEqual(loan.inferMonthlyRateFromPayment(120000, 3000, 12, 84000), 0)

;(function () {
  const P = 200000, B = 80000, m = 36, r = 0.012
  const res = loan.calcBalloonLoan(P, 14.4, m, B)
  const pay = (P - B / Math.pow(1 + r, m)) * r / (1 - Math.pow(1 + r, -m))
  closeTo(res.monthlyPayment, pay, 0.001)
  // 明细按分入账后，尾期用于吸收累计分币差；应与理论值保持在合理分币范围内
  closeTo(res.lastPayment, pay + B, 0.5)
  closeTo(res.totalInterest, pay * m + B - P, 0.5)
  closeTo(res.schedule[m - 1].balance, 0, 0.000001)
  assert.strictEqual(res.balloonAmount, B)
})()
// 尾款为0 退化成等额本息
closeTo(loan.calcBalloonLoan(350000, 13.14, 36, 0).monthlyPayment,
  loan.calcEqualInstallment(350000, 13.14, 36).monthlyPayment, 0.000001)
// 零利率
closeTo(loan.calcBalloonLoan(120000, 0, 12, 60000).monthlyPayment, 5000, 0.000001)
closeTo(loan.calcBalloonLoan(120000, 0, 12, 60000).lastPayment, 65000, 0.000001)
// 尾款超本金 → 夹到本金，月供=纯利息
closeTo(loan.calcBalloonLoan(100000, 12, 12, 999999).monthlyPayment, 1000, 0.01)

// fee=0：含费口径与名义口径一致（含 V1 兼容）
;(function () {
  const res = loan.calcActualRate(350000, 11816.5, 36, 0.59)
  assert.strictEqual(res.feeAdjustedMonthlyRate, res.monthlyRate)
  assert.strictEqual(res.upfrontFee, 0)
})()
// 收费 → 含费利率必然更高；且往返可还原
;(function () {
  const net = 340000, m = 36, r = 0.0125
  const pay = net * r * Math.pow(1 + r, m) / (Math.pow(1 + r, m) - 1)
  const res = loan.calcActualRate(350000, pay, m, 1, 10000)
  closeTo(res.feeAdjustedMonthlyRate, r, 0.0000001)
  assert.ok(res.feeAdjustedMonthlyRate > res.monthlyRate)
  closeTo(res.claimedMultiple, r / 0.01, 0.0000001)
  closeTo(res.claimedMonthlyGap, r - 0.01, 0.0000001)
  closeTo(res.totalInterest, pay * m - 350000, 0.01)
})()

// 比例违约金：3% × 50000 = 1500
;(function () {
  const res = loan.calcPrepayment(350000, 13.14, 36, 12, 50000, 'term', 3)
  closeTo(res.penalty, 1500, 0.000001)
  closeTo(res.netSaved, res.interestSaved - 1500, 0.000001)
})()
// 固定额优先于比例
closeTo(loan.calcPrepayment(350000, 13.14, 36, 12, 50000, 'term', 3, 2000).penalty, 2000, 0.000001)
// 违约金按实际还入的钱算（提前额超过剩余本金时）
;(function () {
  const res = loan.calcPrepayment(350000, 13.14, 36, 12, 9999999, 'term', 3)
  closeTo(res.penalty, res.remainingBalance * 0.03, 0.01)
})()
// 一次还清且选择降低月供：不应保留空的剩余期数
;(function () {
  const res = loan.calcPrepayment(350000, 13.14, 36, 12, 9999999, 'payment', 3)
  closeTo(res.afterPrepayBalance, 0, 0.01)
  assert.strictEqual(res.newRemainingMonths, 0)
  assert.strictEqual(res.newMonthlyPayment, 0)
  assert.strictEqual(res.schedule.length, 0)
})()
// 净省可为负：临近结清还大额+高违约金
assert.ok(loan.calcPrepayment(350000, 13.14, 36, 34, 20000, 'term', 10).netSaved < 0)
// 兼容：不传违约金参数 → penalty 0, netSaved = interestSaved
;(function () {
  const res = loan.calcPrepayment(350000, 13.14, 36, 12, 50000, 'term')
  assert.strictEqual(res.penalty, 0)
  closeTo(res.netSaved, res.interestSaved, 0.000001)
})()


// 精确分币：所有明细合计必须与汇总完全一致
function toCents(value) {
  return Math.round(Number(value) * 100)
}

function assertScheduleBalances(result) {
  const principalCents = result.schedule.reduce((sum, row) => sum + toCents(row.principal), 0)
  const interestCents = result.schedule.reduce((sum, row) => sum + toCents(row.interest), 0)
  const paymentCents = result.schedule.reduce((sum, row) => sum + toCents(row.payment), 0)
  result.schedule.forEach((row) => {
    assert.strictEqual(toCents(row.payment), toCents(row.principal) + toCents(row.interest))
  })
  assert.strictEqual(principalCents, toCents(result.principal))
  assert.strictEqual(interestCents, toCents(result.totalInterest))
  assert.strictEqual(paymentCents, toCents(result.totalPayment))
  assert.strictEqual(paymentCents, principalCents + interestCents)
  assert.strictEqual(toCents(result.schedule[result.schedule.length - 1].balance), 0)
}

assertScheduleBalances(loan.calcEqualInstallment(1000000, 3.1, 360))
assertScheduleBalances(loan.calcEqualPrincipal(1000000, 3.1, 360))
assertScheduleBalances(loan.calcInterestOnly(120000, 12, 12))
assertScheduleBalances(loan.calcBalloonLoan(200000, 14.4, 36, 80000))
assertScheduleBalances(loan.calcCompositeLoan(1000000, 3.45, 500000, 2.85, 360, 'equalInstallment'))

// 通用现金流 IRR：尾款贷与先息后本均应往返回原利率
;(function () {
  const P = 200000, B = 80000, m = 36, r = 0.012
  const pay = (P - B / Math.pow(1 + r, m)) * r / (1 - Math.pow(1 + r, -m))
  const cashflows = Array(m).fill(pay)
  cashflows[m - 1] += B
  const solved = loan.solveMonthlyRateFromCashflows(P, cashflows)
  assert.strictEqual(solved.valid, true)
  closeTo(solved.rate, r, 0.0000001)

  const actual = loan.calcActualRate(P, pay, m, 0, 0, { balloon: B })
  assert.strictEqual(actual.valid, true)
  closeTo(actual.monthlyRate, r, 0.0000001)
})()

;(function () {
  const cashflows = Array(12).fill(1200)
  cashflows[11] += 120000
  const solved = loan.solveMonthlyRateFromCashflows(120000, cashflows)
  assert.strictEqual(solved.valid, true)
  closeTo(solved.rate, 0.01, 0.0000001)
})()

// 现金流不足不能伪装成 0% 利率
;(function () {
  const solved = loan.solveMonthlyRateFromCashflows(120000, Array(12).fill(1000))
  assert.strictEqual(solved.valid, false)
  assert.strictEqual(solved.error, 'insufficientCashflow')
})()

// 前置费用达到本金时必须判无效
;(function () {
  const res = loan.calcActualRate(350000, 11816.5, 36, 0.59, 350000)
  assert.strictEqual(res.valid, false)
  assert.strictEqual(res.error, 'invalidNetPrincipal')
})()

// 提前还款支持等额本金与当前余额覆盖
;(function () {
  const base = loan.calcEqualPrincipal(1000000, 3.1, 360)
  const res = loan.calcPrepayment(1000000, 3.1, 360, 120, 100000, 'payment', 0, 0, 'equalPrincipal')
  closeTo(res.remainingBalance, base.schedule[119].balance, 0.01)
  assert.strictEqual(res.method, 'equalPrincipal')
  assert.ok(res.interestSaved > 0)
  assert.ok(res.newMonthlyPayment < res.oldMonthlyPayment)
})()

;(function () {
  const res = loan.calcPrepayment(1000000, 3.1, 360, 120, 100000, 'term', 0, 0, 'equalInstallment', 700000)
  closeTo(res.remainingBalance, 700000, 0.01)
  assert.strictEqual(res.usedCurrentBalance, true)
  closeTo(res.oldMonthlyPayment, loan.calcEqualInstallment(1000000, 3.1, 360).monthlyPayment, 0.01)
})()

;(function () {
  const base = loan.calcEqualPrincipal(1000000, 3.1, 360)
  const res = loan.calcPrepayment(1000000, 3.1, 360, 120, 100000, 'term', 0, 0, 'equalPrincipal', 700000)
  const expectedInterest = Math.round(700000 * (3.1 / 100 / 12) * 100) / 100
  closeTo(res.oldMonthlyPayment, base.schedule[120].principal + expectedInterest, 0.01)
})()

// 正负数四舍五入必须对称，且不输出负零
assert.strictEqual(loan.round(1.005, 2), 1.01)
assert.strictEqual(loan.round(-1.005, 2), -1.01)
assert.strictEqual(loan.round(2.675, 2), 2.68)
assert.strictEqual(loan.round(-2.675, 2), -2.68)
assert.strictEqual(loan.formatMoney(-0.0001), '0.00')
assert.strictEqual(loan.formatMoney(6752.28), '6752.28')
assert.strictEqual(loan.formatMoney(195437.72), '195437.72')
assert.ok(!loan.formatMoney(1000000).includes(','))

// 二期：综合融资成本。费用在放款日或还款日发生，不能混入合同利息。
;(function () {
  const contract = loan.calcEqualInstallment(150000, 6, 36)
  const noFee = loan.calcComprehensiveFinancing({
    principal: 150000,
    annualRate: 6,
    months: 36,
    purposeFunding: 150000
  })
  assert.strictEqual(noFee.valid, true)
  closeTo(noFee.totalFinancingCost, contract.totalInterest, 0.001)
  closeTo(noFee.monthlyIrr, 0.06 / 12, 0.0000001)

  const res = loan.calcComprehensiveFinancing({
    principal: 150000,
    annualRate: 6,
    months: 36,
    method: 'equalInstallment',
    purposeFunding: 145000,
    upfrontFee: 2000,
    periodicFee: 10
  })
  assert.strictEqual(res.valid, true)
  closeTo(res.contractInterest, contract.totalInterest, 0.001)
  closeTo(res.totalRepayment, contract.totalPayment, 0.001)
  closeTo(res.totalPeriodicFee, 360, 0.001)
  closeTo(res.financingFees, 2360, 0.001)
  closeTo(res.declaredFinancingFees, 2360, 0.001)
  // 已填写实际给车商的金额时，前置费默认视为从贷款中代扣，不能再扣第二次。
  assert.strictEqual(res.upfrontFeePayment, 'deducted')
  closeTo(res.netFunding, 145000, 0.001)
  closeTo(res.nonPurposePrincipal, 5000, 0.001)
  closeTo(res.deductedUpfrontFee, 2000, 0.001)
  closeTo(res.unallocatedFinancedAmount, 3000, 0.001)
  closeTo(res.nonInterestFinancingCost, 5360, 0.001)
  closeTo(res.totalFinancingCost, contract.totalPayment + 360 - 145000, 0.001)
  closeTo(res.totalFinancingCost, res.contractInterest + res.nonInterestFinancingCost, 0.001)
  assert.ok(res.monthlyIrr > 0.007)
  assert.ok(res.maxPeriodicOutflow > contract.monthlyPayment)
  assert.strictEqual(res.cashflows.length, 36)
  assert.strictEqual(res.schedule[0].periodicFee, 10)
})()

;(function () {
  const contract = loan.calcEqualInstallment(150000, 6, 36)
  const cashFee = loan.calcComprehensiveFinancing({
    principal: 150000,
    annualRate: 6,
    months: 36,
    purposeFunding: 145000,
    upfrontFee: 2000,
    upfrontFeePayment: 'cash'
  })
  assert.strictEqual(cashFee.valid, true)
  assert.strictEqual(cashFee.upfrontFeePayment, 'cash')
  closeTo(cashFee.netFunding, 143000, 0.001)
  closeTo(cashFee.totalFinancingCost, contract.totalPayment + 2000 - 145000, 0.001)
  closeTo(cashFee.nonPurposePrincipal, 5000, 0.001)
  closeTo(cashFee.unallocatedFinancedAmount, 5000, 0.001)
  closeTo(cashFee.nonInterestFinancingCost, 7000, 0.001)
  closeTo(cashFee.totalFinancingCost, cashFee.contractInterest + cashFee.nonInterestFinancingCost, 0.001)

  // 现金另付的服务费发生在放款日，最高单次现金压力不能只看月供。
  const pressure = loan.calcComprehensiveFinancing({
    principal: 1200,
    annualRate: 0,
    months: 12,
    purposeFunding: 1200,
    upfrontFee: 500,
    upfrontFeePayment: 'cash'
  })
  assert.strictEqual(pressure.valid, true)
  closeTo(pressure.maxPeriodicOutflow, 100, 0.001)
  closeTo(pressure.maxCashPressure, 500, 0.001)
  closeTo(pressure.maxSingleCashOutflow, 500, 0.001)
})()

;(function () {
  const balloon = loan.calcBalloonLoan(200000, 14.4, 36, 80000)
  const res = loan.calcComprehensiveFinancing({
    principal: 200000,
    annualRate: 14.4,
    months: 36,
    balloonAmount: 80000,
    purposeFunding: 200000
  })
  assert.strictEqual(res.valid, true)
  closeTo(res.totalRepayment, balloon.totalPayment, 0.001)
  closeTo(res.maxPeriodicOutflow, balloon.lastPayment, 0.001)
  assert.ok(res.maxPeriodicOutflow > res.schedule[0].cashflow)
})()

;(function () {
  const invalid = loan.calcComprehensiveFinancing({
    principal: 100000, annualRate: 6, months: 12, purposeFunding: 100001
  })
  assert.strictEqual(invalid.valid, false)
  assert.strictEqual(invalid.error, 'invalidPurposeFunding')

  const deductedFeeExceedsGap = loan.calcComprehensiveFinancing({
    principal: 150000,
    annualRate: 6,
    months: 36,
    purposeFunding: 149000,
    upfrontFee: 2000,
    upfrontFeePayment: 'deducted'
  })
  assert.strictEqual(deductedFeeExceedsGap.valid, false)
  assert.strictEqual(deductedFeeExceedsGap.error, 'deductedFeeExceedsFundingGap')
})()

// 车贷落地价：全部实际付出必须恒等于落地价加融资成本。
;(function () {
  const res = loan.calcCarLandedCost({
    vehiclePrice: 200000,
    discount: 10000,
    purchaseTax: 10000,
    insurance: 6000,
    registration: 1000,
    requiredOptions: 0,
    purposeFunding: 145000,
    upfrontFee: 2000,
    totalRepayment: 164278.44
  })
  assert.strictEqual(res.valid, true)
  closeTo(res.landedCost, 207000, 0.001)
  closeTo(res.cashAtPurchase, 64000, 0.001)
  closeTo(res.financingCost, 21278.44, 0.001)
  closeTo(res.totalPaid, 228278.44, 0.001)
  closeTo(res.totalPaid, res.landedCost + res.financingCost, 0.001)

  const financing = loan.calcComprehensiveFinancing({
    principal: 150000, annualRate: 6, months: 36,
    purposeFunding: 145000, upfrontFee: 2000, periodicFee: 10
  })
  const chained = loan.calcCarLandedCost({
    vehiclePrice: 200000,
    discount: 10000,
    purchaseTax: 10000,
    insurance: 6000,
    registration: 1000,
    financing
  })
  assert.strictEqual(chained.valid, true)
  closeTo(chained.financingCost, financing.totalFinancingCost, 0.001)
  closeTo(chained.totalPaid, chained.landedCost + chained.financingCost, 0.001)
})()

;(function () {
  // 服务费若直接从放款中代扣，首期现金与融资成本都不能再把它加第二遍。
  const deducted = loan.calcCarLandedCost({
    vehiclePrice: 200000,
    purposeFunding: 145000,
    upfrontFee: 5000,
    upfrontFeePayment: 'deducted',
    totalRepayment: 164278.44
  })
  assert.strictEqual(deducted.valid, true)
  closeTo(deducted.cashAtPurchase, 55000, 0.001)
  closeTo(deducted.financingCost, 19278.44, 0.001)
  closeTo(deducted.totalPaid, 219278.44, 0.001)
  closeTo(deducted.totalPaid, deducted.landedCost + deducted.financingCost, 0.001)

  const invalidDeducted = loan.calcCarLandedCost({
    vehiclePrice: 200000,
    purposeFunding: 145000,
    upfrontFee: 5000,
    upfrontFeePayment: 'deducted',
    totalRepayment: 149999.99
  })
  assert.strictEqual(invalidDeducted.valid, false)
  assert.strictEqual(invalidDeducted.error, 'deductedFeeNotInContract')
})()

;(function () {
  const invalid = loan.calcCarLandedCost({
    vehiclePrice: 200000,
    purposeFunding: 200001
  })
  assert.strictEqual(invalid.valid, false)
  assert.strictEqual(invalid.error, 'fundingExceedsLandedCost')

  const subCentVehiclePrice = loan.calcCarLandedCost({ vehiclePrice: 0.001 })
  assert.strictEqual(subCentVehiclePrice.valid, false)
  assert.strictEqual(subCentVehiclePrice.error, 'invalidVehiclePrice')
})()

// 分段利率：单段必须与原固定利率还款表一致；改价后等额本息重算剩余月供。
;(function () {
  const fixed = loan.calcRatePathSchedule({
    principal: 1000000,
    months: 360,
    method: 'equalInstallment',
    ratePath: [{ effectiveMonth: 1, annualRate: 3.1 }]
  })
  const original = loan.calcEqualInstallment(1000000, 3.1, 360)
  assert.strictEqual(fixed.valid, true)
  assertScheduleBalances(fixed)
  closeTo(fixed.totalPayment, original.totalPayment, 0.001)
  closeTo(fixed.totalInterest, original.totalInterest, 0.001)
  closeTo(fixed.schedule[0].payment, original.schedule[0].payment, 0.001)
  assert.deepStrictEqual(fixed.schedule, original.schedule)
  assert.strictEqual(fixed.isRateScenario, true)
  assert.strictEqual(fixed.repricingUnit, 'month')
})()

;(function () {
  const staged = loan.calcRatePathSchedule({
    principal: 100000,
    months: 24,
    method: 'equalInstallment',
    ratePath: [
      { effectiveMonth: 1, annualRate: 3.6 },
      { effectiveMonth: 13, annualRate: 4.2 }
    ]
  })
  assert.strictEqual(staged.valid, true)
  assert.strictEqual(staged.ratePath.length, 2)
  assert.ok(staged.schedule[12].payment > staged.schedule[11].payment)
  const firstMonthlyRate = 0.036 / 12
  const firstPayment = 100000 * firstMonthlyRate * Math.pow(1 + firstMonthlyRate, 24) /
    (Math.pow(1 + firstMonthlyRate, 24) - 1)
  const balanceAfter12 = 100000 * Math.pow(1 + firstMonthlyRate, 12) - firstPayment *
    (Math.pow(1 + firstMonthlyRate, 12) - 1) / firstMonthlyRate
  const secondMonthlyRate = 0.042 / 12
  const expectedRecastPayment = balanceAfter12 * secondMonthlyRate * Math.pow(1 + secondMonthlyRate, 12) /
    (Math.pow(1 + secondMonthlyRate, 12) - 1)
  closeTo(staged.paymentChanges[1].monthlyPayment, expectedRecastPayment, 0.5)
  assertScheduleBalances(staged)
})()

;(function () {
  const lpr = loan.calcRatePathSchedule({
    principal: 100000,
    months: 24,
    method: 'equalPrincipal',
    lprPath: [
      { effectiveMonth: 1, lprBps: 360 },
      { effectiveMonth: 13, lprBps: 330 }
    ],
    spreadBps: -30
  })
  assert.strictEqual(lpr.valid, true)
  closeTo(lpr.ratePath[0].annualRate, 3.3, 0.000001)
  closeTo(lpr.ratePath[1].annualRate, 3, 0.000001)
  assert.strictEqual(lpr.ratePathType, 'lpr')
  closeTo(lpr.initialAnnualRate, 3.3, 0.000001)
  closeTo(lpr.finalAnnualRate, 3, 0.000001)
  assertScheduleBalances(lpr)

  const invalid = loan.calcRatePathSchedule({
    principal: 100000,
    months: 24,
    method: 'equalInstallment',
    ratePath: [{ effectiveMonth: 2, annualRate: 3.1 }]
  })
  assert.strictEqual(invalid.valid, false)
  assert.strictEqual(invalid.error, 'invalidRatePath')

  const subCentPrincipal = loan.calcRatePathSchedule({
    principal: 0.001,
    months: 12,
    annualRate: 3.1
  })
  assert.strictEqual(subCentPrincipal.valid, false)
  assert.strictEqual(subCentPrincipal.error, 'invalidPrincipal')
})()

// 精确提前还款：账单利息优先；没有账单时才按日计息估算。
;(function () {
  const statement = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalInstallment',
    prepayPrincipal: 20000,
    reduceMode: 'payment',
    settlementInterest: 321.23,
    penaltyType: 'percentOfPrepay',
    penaltyValue: 3
  })
  assert.strictEqual(statement.valid, true)
  assert.strictEqual(statement.precisionMode, 'statement')
  closeTo(statement.accruedInterest, 321.23, 0.001)
  closeTo(statement.penalty, 600, 0.001)
  closeTo(statement.settlementTotal, 20921.23, 0.001)
  assert.ok(statement.newMonthlyPayment < statement.oldMonthlyPayment)
})()

;(function () {
  const daily = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalInstallment',
    prepayPrincipal: 20000,
    reduceMode: 'term',
    lastSettledDate: '2026-01-01',
    prepayDate: '2026-01-16',
    dayCount: 'ACT_365F',
    penaltyType: 'fixed',
    penaltyValue: 500
  })
  assert.strictEqual(daily.valid, true)
  assert.strictEqual(daily.precisionMode, 'dailyEstimate')
  assert.strictEqual(daily.accrualDays, 15)
  closeTo(daily.accruedInterest, 493.15, 0.001)
  closeTo(daily.penalty, 500, 0.001)
  assert.ok(daily.newRemainingMonths < daily.oldRemainingMonths)
  const principalCents = daily.schedule.reduce((sum, row) => sum + toCents(row.principal), 0)
  assert.strictEqual(principalCents, toCents(daily.afterPrepayBalance))
  assert.strictEqual(toCents(daily.schedule[daily.schedule.length - 1].balance), 0)
})()

;(function () {
  const day360 = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalInstallment',
    prepayPrincipal: 10000,
    reduceMode: 'payment',
    lastSettledDate: '2026-01-01',
    prepayDate: '2026-02-01',
    dayCount: '30_360',
    penaltyType: 'percentOfBalance',
    penaltyValue: 3
  })
  assert.strictEqual(day360.valid, true)
  assert.strictEqual(day360.accrualDays, 30)
  assert.strictEqual(day360.dayCountConvention, '30_360_US')
  closeTo(day360.accruedInterest, 1000, 0.001)
  closeTo(day360.penalty, 3000, 0.001)

  const actual360 = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalInstallment',
    prepayPrincipal: 10000,
    reduceMode: 'payment',
    lastSettledDate: '2026-01-01',
    prepayDate: '2026-02-01',
    dayCount: 'ACT_360'
  })
  assert.strictEqual(actual360.valid, true)
  assert.strictEqual(actual360.accrualDays, 31)
  closeTo(actual360.accruedInterest, 1033.33, 0.001)

  // 30/360 US 要把二月底视同第 30 天，不能按真实 31 天把利息多算成 33 天。
  const februaryEnd = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalInstallment',
    prepayPrincipal: 1,
    reduceMode: 'term',
    lastSettledDate: '2026-02-28',
    prepayDate: '2026-03-31',
    dayCount: '30_360'
  })
  assert.strictEqual(februaryEnd.valid, true)
  assert.strictEqual(februaryEnd.accrualDays, 30)
  closeTo(februaryEnd.accruedInterest, 1000, 0.001)

  const equalPrincipal = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalPrincipal',
    prepayPrincipal: 20000,
    reduceMode: 'payment',
    settlementInterest: 0
  })
  assert.strictEqual(equalPrincipal.valid, true)
  assert.ok(equalPrincipal.newMonthlyPayment < equalPrincipal.oldMonthlyPayment)

  const paidOff = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalInstallment',
    prepayPrincipal: 100000,
    reduceMode: 'term',
    settlementInterest: 0
  })
  assert.strictEqual(paidOff.valid, true)
  assert.strictEqual(paidOff.newRemainingMonths, 0)
  assert.strictEqual(paidOff.schedule.length, 0)

  const tooMuch = loan.calcExactPrepayment({
    remainingPrincipal: 100000, remainingMonths: 24, annualRate: 12,
    method: 'equalInstallment', prepayPrincipal: 100001,
    settlementInterest: 0
  })
  assert.strictEqual(tooMuch.valid, false)
  assert.strictEqual(tooMuch.error, 'prepayExceedsBalance')

  const unsupported = loan.calcExactPrepayment({
    remainingPrincipal: 100000, remainingMonths: 24, annualRate: 12,
    method: 'interestOnly', prepayPrincipal: 10000, settlementInterest: 0
  })
  assert.strictEqual(unsupported.valid, false)
  assert.strictEqual(unsupported.error, 'unsupportedMethod')

  const variableRate = loan.calcExactPrepayment({
    remainingPrincipal: 100000, remainingMonths: 24, annualRate: 12,
    method: 'equalInstallment', prepayPrincipal: 10000, settlementInterest: 0,
    lprPath: [{ effectiveMonth: 1, lpr: 3.6 }]
  })
  assert.strictEqual(variableRate.valid, false)
  assert.strictEqual(variableRate.error, 'unsupportedRatePath')

  const rateEvents = loan.calcExactPrepayment({
    remainingPrincipal: 100000, remainingMonths: 24, annualRate: 12,
    method: 'equalInstallment', prepayPrincipal: 10000, settlementInterest: 0,
    rateEvents: [{ effectiveMonth: 1, annualRate: 3.6 }]
  })
  assert.strictEqual(rateEvents.valid, false)
  assert.strictEqual(rateEvents.error, 'unsupportedRatePath')

  const insufficientCustomPayment = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalInstallment',
    monthlyPayment: 1100,
    prepayPrincipal: 1,
    settlementInterest: 0
  })
  assert.strictEqual(insufficientCustomPayment.valid, false)
  assert.strictEqual(insufficientCustomPayment.error, 'paymentInsufficient')

  const mismatchedCustomPayment = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalInstallment',
    monthlyPayment: 10000,
    prepayPrincipal: 1,
    settlementInterest: 0
  })
  assert.strictEqual(mismatchedCustomPayment.valid, false)
  assert.strictEqual(mismatchedCustomPayment.error, 'paymentTermMismatch')

  const incompatibleCustomPayment = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalPrincipal',
    monthlyPayment: 5000,
    prepayPrincipal: 1,
    settlementInterest: 0
  })
  assert.strictEqual(incompatibleCustomPayment.valid, false)
  assert.strictEqual(incompatibleCustomPayment.error, 'unsupportedCustomPayment')

  const invalidBalloon = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalInstallment',
    balloonAmount: -1,
    prepayPrincipal: 1,
    settlementInterest: 0
  })
  assert.strictEqual(invalidBalloon.valid, false)
  assert.strictEqual(invalidBalloon.error, 'invalidBalloonAmount')

  const belowOneCent = loan.calcExactPrepayment({
    remainingPrincipal: 100000,
    remainingMonths: 24,
    annualRate: 12,
    method: 'equalInstallment',
    prepayPrincipal: 0.001,
    settlementInterest: 0
  })
  assert.strictEqual(belowOneCent.valid, false)
  assert.strictEqual(belowOneCent.error, 'invalidPrepayPrincipal')
})()

console.log('loan calculator checks passed')
