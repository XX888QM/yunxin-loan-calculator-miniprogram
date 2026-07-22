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

console.log('loan calculator checks passed')
