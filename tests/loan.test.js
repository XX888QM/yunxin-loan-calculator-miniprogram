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

console.log('loan calculator checks passed')
