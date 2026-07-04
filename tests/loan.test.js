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

console.log('loan calculator checks passed')
