var MAX_MONTHS = 600
var ZERO_RATE = 1e-10
var MONEY_SCALE = 100
var MAX_IRR_RATE = 1048576

function toNumber(value, fallback) {
  if (fallback === undefined) fallback = 0
  if (value === null || value === undefined) return fallback
  var s = String(value).replace(/,/g, '').trim()
  if (s === '') return fallback
  var n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

function nonNegative(value) {
  return Math.max(0, toNumber(value))
}

function isZeroRate(rate) {
  return Math.abs(rate) < ZERO_RATE
}

function round(value, digits) {
  if (digits === undefined) digits = 2
  value = toNumber(value)
  var scale = Math.pow(10, digits)
  var sign = value < 0 ? -1 : 1
  var rounded = sign * Math.round((Math.abs(value) + Number.EPSILON) * scale) / scale
  return rounded === 0 ? 0 : rounded
}

function toCents(value) {
  return Math.round((nonNegative(value) + Number.EPSILON) * MONEY_SCALE)
}

function fromCents(value) {
  return value / MONEY_SCALE
}

function moneyFromCents(value) {
  return round(fromCents(value), 2)
}

function formatMoney(value) {
  var rounded = round(toNumber(value), 2)
  if (rounded === 0) rounded = 0
  var fixed = rounded.toFixed(2)
  var parts = fixed.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

function formatPercent(value, digits) {
  if (digits === undefined) digits = 2
  return round(toNumber(value) * 100, digits).toFixed(digits) + '%'
}

function monthlyRateFromAnnual(annualRatePercent) {
  return nonNegative(annualRatePercent) / 100 / 12
}

function annualEffectiveRate(monthlyRate) {
  var value = Math.pow(1 + monthlyRate, 12) - 1
  return Number.isFinite(value) ? value : Infinity
}

function normalizeMonths(months) {
  return Math.min(MAX_MONTHS, Math.max(1, Math.round(toNumber(months, 1))))
}

function sumScheduleCents(schedule, field) {
  return schedule.reduce(function (sum, row) {
    return sum + Math.round(toNumber(row[field]) * MONEY_SCALE)
  }, 0)
}

function baseResult(principal, annualRatePercent, months, method, schedule) {
  var principalCents = toCents(principal)
  var totalPaymentCents = sumScheduleCents(schedule, 'payment')
  var totalInterestCents = sumScheduleCents(schedule, 'interest')
  var lastRow = null
  for (var i = schedule.length - 1; i >= 0; i -= 1) {
    if (schedule[i].payment || schedule[i].principal || schedule[i].interest || schedule[i].balance) {
      lastRow = schedule[i]
      break
    }
  }
  return {
    principal: moneyFromCents(principalCents),
    annualRate: nonNegative(annualRatePercent),
    months: months,
    method: method,
    monthlyRate: monthlyRateFromAnnual(annualRatePercent),
    totalPayment: moneyFromCents(totalPaymentCents),
    totalInterest: moneyFromCents(totalInterestCents),
    firstPayment: schedule[0] ? schedule[0].payment : 0,
    lastPayment: lastRow ? lastRow.payment : 0,
    monthlyPayment: schedule[0] ? schedule[0].payment : 0,
    schedule: schedule
  }
}

function scheduleRow(month, paymentCents, principalCents, interestCents, balanceCents) {
  return {
    month: month,
    payment: moneyFromCents(paymentCents),
    principal: moneyFromCents(principalCents),
    interest: moneyFromCents(interestCents),
    balance: moneyFromCents(balanceCents)
  }
}

function calcEqualInstallment(principal, annualRatePercent, months) {
  var principalCents = toCents(principal)
  principal = moneyFromCents(principalCents)
  months = normalizeMonths(months)
  var r = monthlyRateFromAnnual(annualRatePercent)
  var theoreticalPayment = isZeroRate(r)
    ? principal / months
    : principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1)
  var paymentCents = toCents(theoreticalPayment)
  var balanceCents = principalCents
  var schedule = []

  for (var i = 1; i <= months; i += 1) {
    var interestCents = Math.round(balanceCents * r)
    var principalPartCents
    var rowPaymentCents

    if (i === months) {
      principalPartCents = balanceCents
      rowPaymentCents = principalPartCents + interestCents
    } else if (balanceCents <= 0) {
      principalPartCents = 0
      interestCents = 0
      rowPaymentCents = 0
    } else {
      principalPartCents = paymentCents - interestCents
      if (principalPartCents <= 0) principalPartCents = Math.min(balanceCents, 1)
      principalPartCents = Math.min(balanceCents, principalPartCents)
      rowPaymentCents = principalPartCents + interestCents
    }

    balanceCents = Math.max(0, balanceCents - principalPartCents)
    schedule.push(scheduleRow(i, rowPaymentCents, principalPartCents, interestCents, balanceCents))
  }

  var result = baseResult(principal, annualRatePercent, months, 'equalInstallment', schedule)
  result.monthlyPayment = theoreticalPayment
  return result
}

function calcEqualPrincipal(principal, annualRatePercent, months) {
  var principalCents = toCents(principal)
  principal = moneyFromCents(principalCents)
  months = normalizeMonths(months)
  var r = monthlyRateFromAnnual(annualRatePercent)
  var balanceCents = principalCents
  var repaidPrincipalCents = 0
  var schedule = []

  for (var i = 1; i <= months; i += 1) {
    var cumulativePrincipalCents = i === months
      ? principalCents
      : Math.round(principalCents * i / months)
    var currentPrincipalCents = cumulativePrincipalCents - repaidPrincipalCents
    var interestCents = Math.round(balanceCents * r)
    var paymentCents = currentPrincipalCents + interestCents
    repaidPrincipalCents = cumulativePrincipalCents
    balanceCents = Math.max(0, principalCents - repaidPrincipalCents)
    schedule.push(scheduleRow(i, paymentCents, currentPrincipalCents, interestCents, balanceCents))
  }

  return baseResult(principal, annualRatePercent, months, 'equalPrincipal', schedule)
}

function calcInterestOnly(principal, annualRatePercent, months) {
  var principalCents = toCents(principal)
  principal = moneyFromCents(principalCents)
  months = normalizeMonths(months)
  var r = monthlyRateFromAnnual(annualRatePercent)
  var interestCents = Math.round(principalCents * r)
  var schedule = []

  for (var i = 1; i <= months; i += 1) {
    var principalPartCents = i === months ? principalCents : 0
    var paymentCents = interestCents + principalPartCents
    var balanceCents = i === months ? 0 : principalCents
    schedule.push(scheduleRow(i, paymentCents, principalPartCents, interestCents, balanceCents))
  }

  return baseResult(principal, annualRatePercent, months, 'interestOnly', schedule)
}

function calculateByMethod(principal, annualRatePercent, months, method) {
  if (method === 'equalPrincipal') return calcEqualPrincipal(principal, annualRatePercent, months)
  if (method === 'interestOnly') return calcInterestOnly(principal, annualRatePercent, months)
  return calcEqualInstallment(principal, annualRatePercent, months)
}

function presentValueOfCashflows(cashflows, monthlyRate) {
  var pv = 0
  for (var i = 0; i < cashflows.length; i += 1) {
    pv += cashflows[i] / Math.pow(1 + monthlyRate, i + 1)
  }
  return pv
}

function normalizeCashflows(cashflows) {
  if (!Array.isArray(cashflows)) return []
  return cashflows.map(function (value) {
    return nonNegative(value)
  })
}

function solveMonthlyRateFromCashflows(principal, cashflows) {
  principal = nonNegative(principal)
  cashflows = normalizeCashflows(cashflows)

  if (principal <= 0) {
    return { valid: false, rate: 0, zeroRate: false, error: 'invalidPrincipal' }
  }
  if (!cashflows.length || !cashflows.some(function (value) { return value > 0 })) {
    return { valid: false, rate: 0, zeroRate: false, error: 'invalidCashflow' }
  }

  var total = cashflows.reduce(function (sum, value) { return sum + value }, 0)
  var zeroTolerance = Math.max(1e-8, principal * 1e-12)
  if (Math.abs(total - principal) <= zeroTolerance) {
    return { valid: true, rate: 0, zeroRate: true, error: '' }
  }
  if (total < principal) {
    return { valid: false, rate: 0, zeroRate: false, error: 'insufficientCashflow' }
  }

  var low = 0
  var high = 0.02
  var highPv = presentValueOfCashflows(cashflows, high)
  while (Number.isFinite(highPv) && highPv > principal && high < MAX_IRR_RATE) {
    high *= 2
    highPv = presentValueOfCashflows(cashflows, high)
  }

  if (!Number.isFinite(highPv) || highPv > principal) {
    return { valid: false, rate: 0, zeroRate: false, error: 'rateOutOfRange' }
  }

  for (var i = 0; i < 100; i += 1) {
    var mid = (low + high) / 2
    var pv = presentValueOfCashflows(cashflows, mid)
    if (!Number.isFinite(pv)) {
      return { valid: false, rate: 0, zeroRate: false, error: 'rateOutOfRange' }
    }
    if (pv > principal) {
      low = mid
    } else {
      high = mid
    }
  }

  return { valid: true, rate: (low + high) / 2, zeroRate: false, error: '' }
}

function paymentCashflows(monthlyPayment, months, balloon) {
  monthlyPayment = nonNegative(monthlyPayment)
  balloon = nonNegative(balloon)
  months = normalizeMonths(months)
  var cashflows = []
  for (var i = 0; i < months; i += 1) cashflows.push(monthlyPayment)
  cashflows[months - 1] += balloon
  return cashflows
}

function presentValueOfPayment(monthlyPayment, months, monthlyRate, balloon) {
  return presentValueOfCashflows(paymentCashflows(monthlyPayment, months, balloon), monthlyRate)
}

function inferMonthlyRateFromPayment(principal, monthlyPayment, months, balloon) {
  var solved = solveMonthlyRateFromCashflows(
    principal,
    paymentCashflows(monthlyPayment, months, balloon)
  )
  return solved.valid ? solved.rate : 0
}

function calcActualRate(principal, monthlyPayment, months, claimedMonthlyRatePercent, upfrontFee, options) {
  principal = moneyFromCents(toCents(principal))
  monthlyPayment = nonNegative(monthlyPayment)
  months = normalizeMonths(months)
  upfrontFee = moneyFromCents(toCents(upfrontFee))
  options = options || {}

  var cashflows = Array.isArray(options.cashflows)
    ? normalizeCashflows(options.cashflows)
    : paymentCashflows(monthlyPayment, months, options.balloon)
  if (Array.isArray(options.cashflows) && cashflows.length) months = cashflows.length

  var baseSolved = solveMonthlyRateFromCashflows(principal, cashflows)
  var invalidNetPrincipal = upfrontFee > 0 && upfrontFee >= principal
  var feeSolved = invalidNetPrincipal
    ? { valid: false, rate: 0, error: 'invalidNetPrincipal' }
    : (upfrontFee > 0
      ? solveMonthlyRateFromCashflows(principal - upfrontFee, cashflows)
      : baseSolved)

  var monthlyRate = baseSolved.valid ? baseSolved.rate : 0
  var feeAdjustedMonthlyRate = feeSolved.valid ? feeSolved.rate : 0
  var comparisonMonthlyRate = upfrontFee > 0 ? feeAdjustedMonthlyRate : monthlyRate
  var claimedMonthlyRate = nonNegative(claimedMonthlyRatePercent) / 100
  var totalPaymentCents = toCents(cashflows.reduce(function (sum, value) { return sum + value }, 0))
  var totalInterestCents = Math.max(0, totalPaymentCents - toCents(principal))
  var valid = baseSolved.valid && feeSolved.valid && !invalidNetPrincipal
  var error = invalidNetPrincipal
    ? 'invalidNetPrincipal'
    : (!baseSolved.valid ? baseSolved.error : (!feeSolved.valid ? feeSolved.error : ''))

  return {
    valid: valid,
    error: error,
    principal: principal,
    months: months,
    monthlyPayment: monthlyPayment,
    monthlyRate: monthlyRate,
    annualNominalRate: monthlyRate * 12,
    annualEffectiveRate: annualEffectiveRate(monthlyRate),
    upfrontFee: upfrontFee,
    feeAdjustedMonthlyRate: feeAdjustedMonthlyRate,
    feeAdjustedAnnualNominalRate: feeAdjustedMonthlyRate * 12,
    feeAdjustedAnnualEffectiveRate: annualEffectiveRate(feeAdjustedMonthlyRate),
    totalPayment: moneyFromCents(totalPaymentCents),
    totalInterest: moneyFromCents(totalInterestCents),
    totalFinancingCost: moneyFromCents(totalInterestCents + toCents(upfrontFee)),
    claimedMonthlyRate: claimedMonthlyRate,
    claimedMultiple: valid && claimedMonthlyRate > 0 ? comparisonMonthlyRate / claimedMonthlyRate : 0,
    claimedMonthlyGap: valid && claimedMonthlyRate > 0 ? comparisonMonthlyRate - claimedMonthlyRate : 0,
    cashflows: cashflows
  }
}

function calcFlatMonthly(principal, monthlyFlatRatePercent, months) {
  var principalCents = toCents(principal)
  principal = moneyFromCents(principalCents)
  months = normalizeMonths(months)
  var flatMonthlyRate = nonNegative(monthlyFlatRatePercent) / 100
  var totalInterestCents = toCents(principal * flatMonthlyRate * months)
  var totalPaymentCents = principalCents + totalInterestCents
  var monthlyPaymentCents = Math.round(totalPaymentCents / months)
  var cashflows = []
  for (var i = 1; i <= months; i += 1) {
    cashflows.push(i === months
      ? moneyFromCents(totalPaymentCents - monthlyPaymentCents * (months - 1))
      : moneyFromCents(monthlyPaymentCents))
  }
  var solved = solveMonthlyRateFromCashflows(principal, cashflows)
  var actualMonthlyRate = solved.valid ? solved.rate : 0

  return {
    valid: solved.valid,
    error: solved.error,
    principal: principal,
    months: months,
    flatMonthlyRate: flatMonthlyRate,
    monthlyPayment: moneyFromCents(monthlyPaymentCents),
    lastPayment: cashflows[cashflows.length - 1],
    totalPayment: moneyFromCents(totalPaymentCents),
    totalInterest: moneyFromCents(totalInterestCents),
    actualMonthlyRate: actualMonthlyRate,
    actualAnnualNominalRate: actualMonthlyRate * 12,
    actualAnnualEffectiveRate: annualEffectiveRate(actualMonthlyRate)
  }
}

function calcCompositeLoan(commercialPrincipal, commercialRate, fundPrincipal, fundRate, months, method) {
  months = normalizeMonths(months)
  var commercial = calculateByMethod(commercialPrincipal, commercialRate, months, method)
  var fund = calculateByMethod(fundPrincipal, fundRate, months, method)
  var schedule = []

  for (var i = 0; i < months; i += 1) {
    var a = commercial.schedule[i]
    var b = fund.schedule[i]
    schedule.push(scheduleRow(
      i + 1,
      toCents(a.payment) + toCents(b.payment),
      toCents(a.principal) + toCents(b.principal),
      toCents(a.interest) + toCents(b.interest),
      toCents(a.balance) + toCents(b.balance)
    ))
  }

  return baseResult(
    moneyFromCents(toCents(commercialPrincipal) + toCents(fundPrincipal)),
    0,
    months,
    'composite',
    schedule
  )
}

function resultPaymentCents(result, method) {
  return toCents(method === 'equalPrincipal' ? result.firstPayment : result.monthlyPayment)
}

function calcAffordableLoan(monthlyBudget, annualRatePercent, months, method) {
  monthlyBudget = moneyFromCents(toCents(monthlyBudget))
  months = normalizeMonths(months)
  var r = monthlyRateFromAnnual(annualRatePercent)
  var principal

  if (method === 'equalPrincipal') {
    principal = isZeroRate(r) ? monthlyBudget * months : monthlyBudget / (1 / months + r)
  } else {
    principal = isZeroRate(r)
      ? monthlyBudget * months
      : monthlyBudget * (Math.pow(1 + r, months) - 1) / (r * Math.pow(1 + r, months))
  }

  var principalCents = toCents(principal)
  var targetMethod = method === 'equalPrincipal' ? 'equalPrincipal' : 'equalInstallment'
  var result = calculateByMethod(moneyFromCents(principalCents), annualRatePercent, months, targetMethod)
  var budgetCents = toCents(monthlyBudget)
  var guard = 0

  while (principalCents > 0 && resultPaymentCents(result, targetMethod) > budgetCents && guard < 10000) {
    principalCents -= 1
    result = calculateByMethod(moneyFromCents(principalCents), annualRatePercent, months, targetMethod)
    guard += 1
  }

  guard = 0
  while (guard < 10000) {
    var next = calculateByMethod(moneyFromCents(principalCents + 1), annualRatePercent, months, targetMethod)
    if (resultPaymentCents(next, targetMethod) > budgetCents) break
    principalCents += 1
    result = next
    guard += 1
  }

  result.monthlyBudget = monthlyBudget
  return result
}

function calcBalloonLoan(principal, annualRatePercent, months, balloonAmount) {
  var principalCents = toCents(principal)
  principal = moneyFromCents(principalCents)
  months = normalizeMonths(months)
  var balloonCents = Math.min(toCents(balloonAmount), principalCents)
  var balloon = moneyFromCents(balloonCents)
  var r = monthlyRateFromAnnual(annualRatePercent)
  var theoreticalPayment = isZeroRate(r)
    ? (principal - balloon) / months
    : (principal - balloon / Math.pow(1 + r, months)) * r / (1 - Math.pow(1 + r, -months))
  var paymentCents = toCents(theoreticalPayment)
  var balanceCents = principalCents
  var schedule = []

  for (var i = 1; i <= months; i += 1) {
    var interestCents = Math.round(balanceCents * r)
    var principalPartCents
    var rowPaymentCents

    if (i === months) {
      principalPartCents = balanceCents
      rowPaymentCents = principalPartCents + interestCents
    } else {
      principalPartCents = Math.max(0, paymentCents - interestCents)
      principalPartCents = Math.min(balanceCents, principalPartCents)
      rowPaymentCents = principalPartCents + interestCents
    }

    balanceCents = Math.max(0, balanceCents - principalPartCents)
    schedule.push(scheduleRow(i, rowPaymentCents, principalPartCents, interestCents, balanceCents))
  }

  var result = baseResult(principal, annualRatePercent, months, 'balloon', schedule)
  result.balloonAmount = balloon
  result.monthlyPayment = theoreticalPayment
  return result
}

function calcFixedPaymentSchedule(balance, monthlyRate, payment, maxMonths) {
  var schedule = []
  var currentCents = toCents(balance)
  var paymentCents = toCents(payment)
  maxMonths = normalizeMonths(maxMonths || 600)

  for (var i = 1; i <= maxMonths && currentCents > 0; i += 1) {
    var interestCents = Math.round(currentCents * monthlyRate)
    var principalCents = i === maxMonths ? currentCents : paymentCents - interestCents
    if (principalCents <= 0) break
    principalCents = Math.min(currentCents, principalCents)
    var rowPaymentCents = principalCents + interestCents
    currentCents = Math.max(0, currentCents - principalCents)
    schedule.push(scheduleRow(i, rowPaymentCents, principalCents, interestCents, currentCents))
  }

  return schedule
}

function calcFixedPrincipalSchedule(balance, monthlyRate, principalPayment, maxMonths) {
  var schedule = []
  var currentCents = toCents(balance)
  var principalPaymentCents = Math.max(1, toCents(principalPayment))
  maxMonths = normalizeMonths(maxMonths || 600)

  for (var i = 1; i <= maxMonths && currentCents > 0; i += 1) {
    var principalCents = i === maxMonths
      ? currentCents
      : Math.min(currentCents, principalPaymentCents)
    var interestCents = Math.round(currentCents * monthlyRate)
    var paymentCents = principalCents + interestCents
    currentCents = Math.max(0, currentCents - principalCents)
    schedule.push(scheduleRow(i, paymentCents, principalCents, interestCents, currentCents))
  }

  return schedule
}

function hasExplicitValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function calcPrepayment(principal, annualRatePercent, months, paidMonths, prepayAmount, reduceMode, penaltyPercent, penaltyAmount, method, currentBalance) {
  method = method === 'equalPrincipal' ? 'equalPrincipal' : 'equalInstallment'
  var base = calculateByMethod(principal, annualRatePercent, months, method)
  months = base.months
  paidMonths = Math.min(Math.max(0, Math.round(toNumber(paidMonths))), months)
  prepayAmount = moneyFromCents(toCents(prepayAmount))
  var usedCurrentBalance = hasExplicitValue(currentBalance)

  if (paidMonths >= months) {
    return {
      valid: true,
      error: '',
      method: method,
      usedCurrentBalance: usedCurrentBalance,
      remainingBalance: 0,
      afterPrepayBalance: 0,
      oldRemainingInterest: 0,
      newRemainingInterest: 0,
      interestSaved: 0,
      oldRemainingMonths: 0,
      newRemainingMonths: 0,
      oldMonthlyPayment: base.monthlyPayment,
      newMonthlyPayment: 0,
      penalty: 0,
      netSaved: 0,
      schedule: []
    }
  }

  var remainingMonths = months - paidMonths
  var paidRow = paidMonths > 0 ? base.schedule[paidMonths - 1] : null
  var remainingBalance = usedCurrentBalance
    ? moneyFromCents(toCents(currentBalance))
    : (paidRow ? paidRow.balance : base.principal)
  var nextBaseRow = base.schedule[paidMonths] || base.schedule[base.schedule.length - 1]
  var oldSchedule
  if (usedCurrentBalance && method === 'equalPrincipal') {
    oldSchedule = calcFixedPrincipalSchedule(remainingBalance, base.monthlyRate, nextBaseRow.principal, remainingMonths)
  } else if (usedCurrentBalance) {
    oldSchedule = calcFixedPaymentSchedule(remainingBalance, base.monthlyRate, base.monthlyPayment, remainingMonths)
  } else {
    oldSchedule = base.schedule.slice(paidMonths)
  }
  var afterPrepayBalance = moneyFromCents(Math.max(0, toCents(remainingBalance) - toCents(prepayAmount)))
  var effectivePrepayCents = Math.min(toCents(prepayAmount), toCents(remainingBalance))
  var penaltyCents = nonNegative(penaltyAmount) > 0
    ? toCents(penaltyAmount)
    : toCents(fromCents(effectivePrepayCents) * nonNegative(penaltyPercent) / 100)
  var oldRemainingInterestCents = sumScheduleCents(oldSchedule, 'interest')
  var newSchedule

  if (toCents(afterPrepayBalance) <= 0) {
    newSchedule = []
  } else if (method === 'equalPrincipal') {
    if (reduceMode === 'payment') {
      newSchedule = calcEqualPrincipal(afterPrepayBalance, annualRatePercent, remainingMonths).schedule
    } else {
      var nextPrincipal = base.schedule[paidMonths]
        ? base.schedule[paidMonths].principal
        : base.schedule[base.schedule.length - 1].principal
      newSchedule = calcFixedPrincipalSchedule(afterPrepayBalance, base.monthlyRate, nextPrincipal, remainingMonths)
    }
  } else if (reduceMode === 'payment') {
    newSchedule = calcEqualInstallment(afterPrepayBalance, annualRatePercent, remainingMonths).schedule
  } else {
    newSchedule = calcFixedPaymentSchedule(afterPrepayBalance, base.monthlyRate, base.monthlyPayment, remainingMonths)
  }

  var newRemainingInterestCents = sumScheduleCents(newSchedule, 'interest')
  var interestSavedCents = Math.max(0, oldRemainingInterestCents - newRemainingInterestCents)
  var oldMonthlyPayment = oldSchedule[0] ? oldSchedule[0].payment : 0

  return {
    valid: true,
    error: '',
    method: method,
    usedCurrentBalance: usedCurrentBalance,
    remainingBalance: moneyFromCents(toCents(remainingBalance)),
    afterPrepayBalance: afterPrepayBalance,
    oldRemainingInterest: moneyFromCents(oldRemainingInterestCents),
    newRemainingInterest: moneyFromCents(newRemainingInterestCents),
    interestSaved: moneyFromCents(interestSavedCents),
    penalty: moneyFromCents(penaltyCents),
    netSaved: moneyFromCents(interestSavedCents - penaltyCents),
    oldRemainingMonths: remainingMonths,
    newRemainingMonths: newSchedule.length,
    oldMonthlyPayment: oldMonthlyPayment,
    newMonthlyPayment: newSchedule[0] ? newSchedule[0].payment : 0,
    schedule: newSchedule
  }
}

module.exports = {
  toNumber: toNumber,
  round: round,
  formatMoney: formatMoney,
  formatPercent: formatPercent,
  normalizeMonths: normalizeMonths,
  calculateByMethod: calculateByMethod,
  calcEqualInstallment: calcEqualInstallment,
  calcEqualPrincipal: calcEqualPrincipal,
  calcInterestOnly: calcInterestOnly,
  calcActualRate: calcActualRate,
  calcFlatMonthly: calcFlatMonthly,
  calcCompositeLoan: calcCompositeLoan,
  calcAffordableLoan: calcAffordableLoan,
  calcBalloonLoan: calcBalloonLoan,
  calcPrepayment: calcPrepayment,
  inferMonthlyRateFromPayment: inferMonthlyRateFromPayment,
  solveMonthlyRateFromCashflows: solveMonthlyRateFromCashflows
}
