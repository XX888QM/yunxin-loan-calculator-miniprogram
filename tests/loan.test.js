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
  closeTo(res.lastPayment, pay + B, 0.01)
  closeTo(res.totalInterest, pay * m + B - P, 0.01)
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

;(function () {
  const price = 200000, down = 20000, B = 50000, m = 36, r = 0.015
  const financed = price - down
  const rent = (financed - B / Math.pow(1 + r, m)) * r / (1 - Math.pow(1 + r, -m))
  const res = loan.calcRentToOwn(price, down, rent, m, B)
  closeTo(res.impliedMonthlyRate, r, 0.0000001)
  closeTo(res.totalCost, down + rent * m + B, 0.01)
  closeTo(res.premiumOverCash, res.totalCost - price, 0.000001)
  assert.strictEqual(res.hasImpliedRate, true)
  closeTo(res.impliedAnnualEffectiveRate, Math.pow(1 + r, 12) - 1, 0.000001)
})()
// 车价缺省(0)：不算隐含利率、溢价为0，总费用照算
;(function () {
  const res = loan.calcRentToOwn(0, 10000, 3000, 24, 20000)
  assert.strictEqual(res.hasImpliedRate, false)
  assert.strictEqual(res.impliedMonthlyRate, 0)
  assert.strictEqual(res.premiumOverCash, 0)
  closeTo(res.totalCost, 10000 + 3000 * 24 + 20000, 0.01)
})()

// 定价 ↔ 测算 互为逆运算
;(function () {
  const pricing = loan.calcRentPricing(200000, 20000, 36, 50000, 18)
  const back = loan.calcRentToOwn(200000, 20000, pricing.monthlyRent, 36, 50000)
  closeTo(back.impliedAnnualNominalRate, 0.18, 0.000001)
  closeTo(pricing.totalCost, 20000 + pricing.monthlyRent * 36 + 50000, 0.01)
})()
// 零利率：月租 = (融资额-尾款)/期数
closeTo(loan.calcRentPricing(120000, 20000, 20, 40000, 0).monthlyRent, 3000, 0.000001)
// 尾款已覆盖融资额 → 月租 0
assert.strictEqual(loan.calcRentPricing(100000, 20000, 12, 200000, 10).monthlyRent, 0)

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
  const res = loan.calcActualRate(350000, pay, m, 0, 10000)
  closeTo(res.feeAdjustedMonthlyRate, r, 0.0000001)
  assert.ok(res.feeAdjustedMonthlyRate > res.monthlyRate)
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
// 净省可为负：临近结清还大额+高违约金
assert.ok(loan.calcPrepayment(350000, 13.14, 36, 34, 20000, 'term', 10).netSaved < 0)
// 兼容：不传违约金参数 → penalty 0, netSaved = interestSaved
;(function () {
  const res = loan.calcPrepayment(350000, 13.14, 36, 12, 50000, 'term')
  assert.strictEqual(res.penalty, 0)
  closeTo(res.netSaved, res.interestSaved, 0.000001)
})()

console.log('loan calculator checks passed')
