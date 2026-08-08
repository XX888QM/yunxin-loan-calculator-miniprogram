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
  // 金额只保留两位小数，不用千分位逗号（国内习惯看小数点）
  var rounded = round(toNumber(value), 2)
  if (rounded === 0) rounded = 0
  return rounded.toFixed(2)
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

function calcFixedPaymentSchedule(balance, monthlyRate, payment, maxMonths, options) {
  options = options || {}
  var schedule = []
  var currentCents = toCents(balance)
  var paymentCents = toCents(payment)
  maxMonths = normalizeMonths(maxMonths || 600)
  var forceFinalBalance = options.forceFinalBalance !== false

  for (var i = 1; i <= maxMonths && currentCents > 0; i += 1) {
    var interestCents = Math.round(currentCents * monthlyRate)
    // 默认路径保留旧接口的末期结清行为；精确提前还款会显式关闭它，
    // 从而不会把不足的自定义月供伪装成最后一期一次性结清。
    var principalCents = i === maxMonths && forceFinalBalance
      ? currentCents
      : paymentCents - interestCents
    if (principalCents <= 0) break
    principalCents = Math.min(currentCents, principalCents)
    var rowPaymentCents = principalCents + interestCents
    currentCents = Math.max(0, currentCents - principalCents)
    schedule.push(scheduleRow(i, rowPaymentCents, principalCents, interestCents, currentCents))
  }

  return schedule
}

function calcFixedPrincipalSchedule(balance, monthlyRate, principalPayment, maxMonths, options) {
  options = options || {}
  var schedule = []
  var currentCents = toCents(balance)
  var principalPaymentCents = Math.max(1, toCents(principalPayment))
  maxMonths = normalizeMonths(maxMonths || 600)
  var forceFinalBalance = options.forceFinalBalance !== false

  for (var i = 1; i <= maxMonths && currentCents > 0; i += 1) {
    var principalCents = Math.min(currentCents, principalPaymentCents)
    if (i === maxMonths && forceFinalBalance) principalCents = currentCents
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

// 二期接口使用严格输入校验，避免把空值或错误文本静默当成金额 0。
function explicitNumber(value, fallback) {
  if (!hasExplicitValue(value)) return fallback
  return toNumber(value, NaN)
}

function validMonthsInput(value) {
  var months = explicitNumber(value, NaN)
  return Number.isFinite(months) && Math.round(months) === months && months >= 1 && months <= MAX_MONTHS
}

function invalidCalculation(error) {
  return { valid: false, error: error }
}

function calculateFinancingSchedule(principal, annualRate, months, method, balloonAmount) {
  if (method === 'balloon' || toCents(balloonAmount) > 0) {
    return calcBalloonLoan(principal, annualRate, months, balloonAmount)
  }
  return calculateByMethod(principal, annualRate, months, method)
}

// 综合融资成本：必须区分费用是现金另付还是从放款中代扣，避免把同一笔费用算两遍。
function calcComprehensiveFinancing(options) {
  options = options || {}
  var rawPrincipal = explicitNumber(options.principal, NaN)
  var rawAnnualRate = explicitNumber(options.annualRate, NaN)
  var method = options.method || 'equalInstallment'
  var rawUpfrontFee = explicitNumber(options.upfrontFee, 0)
  var rawPeriodicFee = explicitNumber(options.periodicFee, 0)
  var hasPurposeFunding = hasExplicitValue(options.purposeFunding)
  var rawPurposeFunding = hasPurposeFunding
    ? explicitNumber(options.purposeFunding, NaN)
    : rawPrincipal
  var rawBalloon = explicitNumber(options.balloonAmount, 0)
  var upfrontFeePayment = options.upfrontFeePayment || options.upfrontFeeMode ||
    (hasPurposeFunding && rawPurposeFunding < rawPrincipal ? 'deducted' : 'cash')

  if (!Number.isFinite(rawPrincipal) || rawPrincipal <= 0) return invalidCalculation('invalidPrincipal')
  if (!validMonthsInput(options.months)) return invalidCalculation('invalidMonths')
  if (!Number.isFinite(rawAnnualRate) || rawAnnualRate < 0) return invalidCalculation('invalidAnnualRate')
  if (!Number.isFinite(rawUpfrontFee) || rawUpfrontFee < 0) return invalidCalculation('invalidUpfrontFee')
  if (!Number.isFinite(rawPeriodicFee) || rawPeriodicFee < 0) return invalidCalculation('invalidPeriodicFee')
  if (method !== 'equalInstallment' && method !== 'equalPrincipal' &&
    method !== 'interestOnly' && method !== 'balloon') {
    return invalidCalculation('unsupportedMethod')
  }
  if (!Number.isFinite(rawPurposeFunding) || rawPurposeFunding <= 0 || rawPurposeFunding > rawPrincipal) {
    return invalidCalculation('invalidPurposeFunding')
  }
  if (upfrontFeePayment !== 'cash' && upfrontFeePayment !== 'deducted') {
    return invalidCalculation('invalidUpfrontFeePayment')
  }
  if (!Number.isFinite(rawBalloon) || rawBalloon < 0 || rawBalloon > rawPrincipal) {
    return invalidCalculation('invalidBalloonAmount')
  }

  var principalCents = toCents(rawPrincipal)
  var principal = moneyFromCents(principalCents)
  var annualRate = rawAnnualRate
  var months = Math.round(options.months)
  var upfrontFeeCents = toCents(rawUpfrontFee)
  var periodicFeeCents = toCents(rawPeriodicFee)
  var purposeFundingCents = toCents(rawPurposeFunding)
  var balloonAmount = moneyFromCents(toCents(rawBalloon))
  var nonPurposePrincipalCents = principalCents - purposeFundingCents
  var deductedUpfrontFeeCents = upfrontFeePayment === 'deducted' ? upfrontFeeCents : 0
  var cashUpfrontFeeCents = upfrontFeePayment === 'cash' ? upfrontFeeCents : 0

  if (principalCents <= 0) return invalidCalculation('invalidPrincipal')
  if (purposeFundingCents <= 0) return invalidCalculation('invalidPurposeFunding')
  if (deductedUpfrontFeeCents > nonPurposePrincipalCents) {
    return invalidCalculation('deductedFeeExceedsFundingGap')
  }

  var netFundingCents = purposeFundingCents - cashUpfrontFeeCents

  if (netFundingCents <= 0) return invalidCalculation('invalidNetFunding')

  var contract = calculateFinancingSchedule(
    principal,
    annualRate,
    months,
    method,
    balloonAmount
  )
  var schedule = []
  var cashflows = []
  var totalPeriodicFeeCents = 0
  var maxPeriodicOutflowCents = 0

  for (var i = 0; i < contract.schedule.length; i += 1) {
    var row = contract.schedule[i]
    var cashflowCents = toCents(row.payment) + periodicFeeCents
    totalPeriodicFeeCents += periodicFeeCents
    maxPeriodicOutflowCents = Math.max(maxPeriodicOutflowCents, cashflowCents)
    cashflows.push(moneyFromCents(cashflowCents))
    schedule.push({
      month: row.month,
      payment: row.payment,
      principal: row.principal,
      interest: row.interest,
      balance: row.balance,
      periodicFee: moneyFromCents(periodicFeeCents),
      cashflow: moneyFromCents(cashflowCents)
    })
  }

  var solved = solveMonthlyRateFromCashflows(moneyFromCents(netFundingCents), cashflows)
  if (!solved.valid) return invalidCalculation(solved.error)

  var totalRepaymentCents = toCents(contract.totalPayment)
  var contractInterestCents = toCents(contract.totalInterest)
  var declaredFinancingFeesCents = upfrontFeeCents + totalPeriodicFeeCents
  // 合同本金与实际用途资金的差额不一定都是服务费（还可能是加融项目）。
  // 单独暴露该部分，避免把它从“综合成本”里漏掉或误标成已披露费用。
  var unallocatedFinancedAmountCents = nonPurposePrincipalCents - deductedUpfrontFeeCents
  var nonInterestFinancingCostCents = totalRepaymentCents + totalPeriodicFeeCents +
    cashUpfrontFeeCents - purposeFundingCents - contractInterestCents
  var totalFinancingCostCents = contractInterestCents + nonInterestFinancingCostCents
  var maxCashPressureCents = Math.max(maxPeriodicOutflowCents, cashUpfrontFeeCents)

  return {
    valid: true,
    error: '',
    method: contract.method,
    principal: principal,
    purposeFunding: moneyFromCents(purposeFundingCents),
    netFunding: moneyFromCents(netFundingCents),
    upfrontFee: moneyFromCents(upfrontFeeCents),
    upfrontFeePayment: upfrontFeePayment,
    deductedUpfrontFee: moneyFromCents(deductedUpfrontFeeCents),
    cashUpfrontFee: moneyFromCents(cashUpfrontFeeCents),
    periodicFee: moneyFromCents(periodicFeeCents),
    totalPeriodicFee: moneyFromCents(totalPeriodicFeeCents),
    financingFees: moneyFromCents(declaredFinancingFeesCents),
    totalFinancingFees: moneyFromCents(declaredFinancingFeesCents),
    declaredFinancingFees: moneyFromCents(declaredFinancingFeesCents),
    nonPurposePrincipal: moneyFromCents(nonPurposePrincipalCents),
    unallocatedFinancedAmount: moneyFromCents(unallocatedFinancedAmountCents),
    nonInterestFinancingCost: moneyFromCents(nonInterestFinancingCostCents),
    contractInterest: moneyFromCents(contractInterestCents),
    totalRepayment: moneyFromCents(totalRepaymentCents),
    contractTotalRepayment: moneyFromCents(totalRepaymentCents),
    totalFinancingCost: moneyFromCents(totalFinancingCostCents),
    monthlyIrr: solved.rate,
    annualNominalIrr: solved.rate * 12,
    annualEffectiveIrr: annualEffectiveRate(solved.rate),
    monthlyRate: solved.rate,
    annualNominalRate: solved.rate * 12,
    annualEffectiveRate: annualEffectiveRate(solved.rate),
    maxPeriodicOutflow: moneyFromCents(maxPeriodicOutflowCents),
    maxPayment: moneyFromCents(maxPeriodicOutflowCents),
    maxCashPressure: moneyFromCents(maxCashPressureCents),
    maxSingleCashOutflow: moneyFromCents(maxCashPressureCents),
    cashflows: cashflows,
    schedule: schedule
  }
}

function optionNumber(options, names, fallback) {
  for (var i = 0; i < names.length; i += 1) {
    if (hasExplicitValue(options[names[i]])) return explicitNumber(options[names[i]], NaN)
  }
  return fallback
}

// 车贷落地价：落地价与融资成本分开，避免把首付或贷款本金重复计入成本。
function calcCarLandedCost(options) {
  options = options || {}
  var financing = options.financing || {}
  var vehiclePrice = optionNumber(options, ['vehiclePrice', 'carPrice'], NaN)
  var discount = optionNumber(options, ['discount'], 0)
  var purchaseTax = optionNumber(options, ['purchaseTax'], 0)
  var insurance = optionNumber(options, ['insurance'], 0)
  var registration = optionNumber(options, ['registration', 'registrationFee'], 0)
  var requiredOptions = optionNumber(options, ['requiredOptions', 'mandatoryOptions'], 0)
  var purposeFunding = optionNumber(
    options,
    ['purposeFunding', 'purchaseFunding', 'actualPurchaseFunding', 'loanAppliedToPurchase'],
    optionNumber(financing, ['purposeFunding'], 0)
  )
  var upfrontFee = optionNumber(
    options,
    ['upfrontFee', 'upfrontFinancingFee'],
    optionNumber(financing, ['upfrontFee'], 0)
  )
  var totalRepayment = optionNumber(
    options,
    ['totalRepayment', 'contractTotalRepayment'],
    optionNumber(financing, ['totalRepayment', 'contractTotalRepayment'], 0)
  )
  var totalPeriodicFee = optionNumber(
    options,
    ['totalPeriodicFee', 'periodicFinancingFee'],
    optionNumber(financing, ['totalPeriodicFee'], 0)
  )
  var upfrontFeePayment = options.upfrontFeePayment || options.upfrontFeeMode ||
    financing.upfrontFeePayment || financing.upfrontFeeMode || 'cash'

  if (!Number.isFinite(vehiclePrice) || vehiclePrice <= 0) return invalidCalculation('invalidVehiclePrice')
  if (!Number.isFinite(discount) || discount < 0 || discount > vehiclePrice) return invalidCalculation('invalidDiscount')
  if (!Number.isFinite(purchaseTax) || purchaseTax < 0) return invalidCalculation('invalidPurchaseTax')
  if (!Number.isFinite(insurance) || insurance < 0) return invalidCalculation('invalidInsurance')
  if (!Number.isFinite(registration) || registration < 0) return invalidCalculation('invalidRegistration')
  if (!Number.isFinite(requiredOptions) || requiredOptions < 0) return invalidCalculation('invalidRequiredOptions')
  if (!Number.isFinite(purposeFunding) || purposeFunding < 0) return invalidCalculation('invalidPurposeFunding')
  if (!Number.isFinite(upfrontFee) || upfrontFee < 0) return invalidCalculation('invalidUpfrontFee')
  if (!Number.isFinite(totalRepayment) || totalRepayment < 0) return invalidCalculation('invalidTotalRepayment')
  if (!Number.isFinite(totalPeriodicFee) || totalPeriodicFee < 0) return invalidCalculation('invalidPeriodicFee')
  if (upfrontFeePayment !== 'cash' && upfrontFeePayment !== 'deducted') {
    return invalidCalculation('invalidUpfrontFeePayment')
  }

  var vehiclePriceCents = toCents(vehiclePrice)
  var discountCents = toCents(discount)
  var purchaseTaxCents = toCents(purchaseTax)
  var insuranceCents = toCents(insurance)
  var registrationCents = toCents(registration)
  var requiredOptionsCents = toCents(requiredOptions)
  var purposeFundingCents = toCents(purposeFunding)
  var upfrontFeeCents = toCents(upfrontFee)
  var totalRepaymentCents = toCents(totalRepayment)
  var totalPeriodicFeeCents = toCents(totalPeriodicFee)
  var landedCostCents = vehiclePriceCents - discountCents + purchaseTaxCents + insuranceCents + registrationCents + requiredOptionsCents

  if (vehiclePriceCents <= 0) return invalidCalculation('invalidVehiclePrice')
  if (purposeFunding > 0 && purposeFundingCents <= 0) return invalidCalculation('invalidPurposeFunding')
  if (purposeFundingCents > landedCostCents) return invalidCalculation('fundingExceedsLandedCost')
  if (purposeFundingCents > 0 && totalRepaymentCents + totalPeriodicFeeCents < purposeFundingCents) {
    return invalidCalculation('invalidTotalRepayment')
  }
  if (upfrontFeePayment === 'deducted' && purposeFundingCents > 0 &&
    totalRepaymentCents < purposeFundingCents + upfrontFeeCents) {
    return invalidCalculation('deductedFeeNotInContract')
  }
  if (purposeFundingCents === 0 && (upfrontFeeCents > 0 || totalRepaymentCents > 0 || totalPeriodicFeeCents > 0)) {
    return invalidCalculation('invalidFinancingWithoutFunding')
  }

  var cashUpfrontFeeCents = upfrontFeePayment === 'cash' ? upfrontFeeCents : 0
  var cashAtPurchaseCents = landedCostCents - purposeFundingCents + cashUpfrontFeeCents
  var financingCostCents = totalRepaymentCents + totalPeriodicFeeCents + cashUpfrontFeeCents - purposeFundingCents
  var totalPaidCents = cashAtPurchaseCents + totalRepaymentCents + totalPeriodicFeeCents

  return {
    valid: true,
    error: '',
    vehiclePrice: moneyFromCents(vehiclePriceCents),
    discount: moneyFromCents(discountCents),
    purchaseTax: moneyFromCents(purchaseTaxCents),
    insurance: moneyFromCents(insuranceCents),
    registration: moneyFromCents(registrationCents),
    requiredOptions: moneyFromCents(requiredOptionsCents),
    purposeFunding: moneyFromCents(purposeFundingCents),
    upfrontFee: moneyFromCents(upfrontFeeCents),
    upfrontFeePayment: upfrontFeePayment,
    cashUpfrontFee: moneyFromCents(cashUpfrontFeeCents),
    totalRepayment: moneyFromCents(totalRepaymentCents),
    totalPeriodicFee: moneyFromCents(totalPeriodicFeeCents),
    landedCost: moneyFromCents(landedCostCents),
    cashAtPurchase: moneyFromCents(cashAtPurchaseCents),
    financingCost: moneyFromCents(financingCostCents),
    totalPaid: moneyFromCents(totalPaidCents),
    equalityDifference: moneyFromCents(totalPaidCents - landedCostCents - financingCostCents)
  }
}

function ratePathValue(row, isLpr, spreadBps) {
  var rate
  if (isLpr) {
    if (hasExplicitValue(row.lprBps)) {
      rate = explicitNumber(row.lprBps, NaN) / 100
    } else {
      rate = optionNumber(row, ['lpr', 'lprRate'], NaN)
    }
    return rate + spreadBps / 100
  }
  if (hasExplicitValue(row.annualRateBps)) return explicitNumber(row.annualRateBps, NaN) / 100
  return optionNumber(row, ['annualRate', 'rate'], NaN)
}

function ratePathMonth(row) {
  return optionNumber(row, ['effectiveMonth', 'month', 'startMonth'], NaN)
}

function normalizeRatePath(options, months) {
  var lprPath = Array.isArray(options.lprPath) ? options.lprPath : options.lprEvents
  var isLpr = Array.isArray(lprPath)
  var rawPath = isLpr
    ? lprPath
    : (Array.isArray(options.ratePath) ? options.ratePath : options.rateEvents)
  var spreadBps = explicitNumber(options.spreadBps, 0)

  if (!Number.isFinite(spreadBps)) return { valid: false, error: 'invalidSpreadBps' }
  if (!Array.isArray(rawPath) || !rawPath.length) {
    if (!isLpr && hasExplicitValue(options.annualRate)) {
      rawPath = [{ effectiveMonth: 1, annualRate: options.annualRate }]
    } else {
      return { valid: false, error: 'invalidRatePath' }
    }
  }

  var path = []
  var lastMonth = 0
  for (var i = 0; i < rawPath.length; i += 1) {
    var row = rawPath[i] || {}
    var month = ratePathMonth(row)
    var annualRate = ratePathValue(row, isLpr, spreadBps)
    if (!Number.isFinite(month) || Math.round(month) !== month || month < 1 || month > months || month <= lastMonth) {
      return { valid: false, error: 'invalidRatePath' }
    }
    if (!Number.isFinite(annualRate) || annualRate < 0) return { valid: false, error: 'invalidRatePath' }
    path.push({ effectiveMonth: month, annualRate: annualRate })
    lastMonth = month
  }

  if (path[0].effectiveMonth !== 1) return { valid: false, error: 'invalidRatePath' }
  return { valid: true, path: path, ratePathType: isLpr ? 'lpr' : 'annualRate' }
}

function ratePathAtMonth(path, month) {
  var current = path[0]
  for (var i = 1; i < path.length; i += 1) {
    if (path[i].effectiveMonth > month) break
    current = path[i]
  }
  return current
}

function isRateChange(path, month) {
  for (var i = 0; i < path.length; i += 1) {
    if (path[i].effectiveMonth === month) return true
  }
  return false
}

// 分段利率还款表。等额本息在改价期首按剩余本金和剩余期数重算月供。
function calcRatePathSchedule(options) {
  options = options || {}
  var rawPrincipal = explicitNumber(options.principal, NaN)
  var method = options.method || 'equalInstallment'

  if (!Number.isFinite(rawPrincipal) || rawPrincipal <= 0) return invalidCalculation('invalidPrincipal')
  if (!validMonthsInput(options.months)) return invalidCalculation('invalidMonths')
  if (method !== 'equalInstallment' && method !== 'equalPrincipal') {
    return invalidCalculation('unsupportedMethod')
  }

  var months = Math.round(options.months)
  var principalCents = toCents(rawPrincipal)
  if (principalCents <= 0) return invalidCalculation('invalidPrincipal')
  var pathResult = normalizeRatePath(options, months)
  if (!pathResult.valid) return invalidCalculation(pathResult.error)

  var path = pathResult.path
  var principal = moneyFromCents(principalCents)
  var balanceCents = principalCents
  var schedule = []
  var paymentChanges = []
  var paymentCents = 0
  var repaidPrincipalCents = 0

  for (var month = 1; month <= months; month += 1) {
    var rate = ratePathAtMonth(path, month)
    var monthlyRate = monthlyRateFromAnnual(rate.annualRate)
    var interestCents = Math.round(balanceCents * monthlyRate)
    var principalPartCents
    var rowPaymentCents

    if (method === 'equalPrincipal') {
      var cumulativePrincipalCents = month === months
        ? principalCents
        : Math.round(principalCents * month / months)
      principalPartCents = cumulativePrincipalCents - repaidPrincipalCents
      rowPaymentCents = principalPartCents + interestCents
      repaidPrincipalCents = cumulativePrincipalCents
    } else {
      if (month === 1 || isRateChange(path, month)) {
        var remainingMonths = months - month + 1
        var theoreticalPayment = isZeroRate(monthlyRate)
          ? moneyFromCents(balanceCents) / remainingMonths
          : moneyFromCents(balanceCents) * monthlyRate * Math.pow(1 + monthlyRate, remainingMonths) /
            (Math.pow(1 + monthlyRate, remainingMonths) - 1)
        paymentCents = toCents(theoreticalPayment)
      }

      if (month === months) {
        principalPartCents = balanceCents
        rowPaymentCents = principalPartCents + interestCents
      } else {
        principalPartCents = paymentCents - interestCents
        if (principalPartCents <= 0) principalPartCents = Math.min(balanceCents, 1)
        principalPartCents = Math.min(balanceCents, principalPartCents)
        rowPaymentCents = principalPartCents + interestCents
      }
    }

    balanceCents = Math.max(0, balanceCents - principalPartCents)
    schedule.push(scheduleRow(month, rowPaymentCents, principalPartCents, interestCents, balanceCents))
    if (isRateChange(path, month)) {
      paymentChanges.push({
        effectiveMonth: month,
        annualRate: rate.annualRate,
        monthlyPayment: moneyFromCents(rowPaymentCents)
      })
    }
  }

  var result = baseResult(principal, path[0].annualRate, months, method, schedule)
  result.valid = true
  result.error = ''
  result.ratePath = path
  // annualRate 保持首段利率，额外字段明确这是按月重定价的手工情景，不是实时 LPR 报价。
  result.initialAnnualRate = path[0].annualRate
  result.finalAnnualRate = path[path.length - 1].annualRate
  result.ratePathType = pathResult.ratePathType
  result.isRateScenario = true
  result.repricingUnit = 'month'
  result.paymentChanges = paymentChanges
  return result
}

function parseYmdDate(value) {
  if (!hasExplicitValue(value)) return null
  var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  var year = Number(match[1])
  var month = Number(match[2])
  var day = Number(match[3])
  var utc = Date.UTC(year, month - 1, day)
  var date = new Date(utc)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { year: year, month: month, day: day, utc: utc }
}

function isLastDayOfFebruary(date) {
  return date.month === 2 && date.day === new Date(Date.UTC(date.year, 2, 0)).getUTCDate()
}

function thirty360Days(start, end) {
  // 采用常见的 30/360 US（NASD）约定；合同若写明其他 30/360 变体，应以合同为准。
  var startIsFebruaryEnd = isLastDayOfFebruary(start)
  var endIsFebruaryEnd = isLastDayOfFebruary(end)
  var startDay = start.day === 31 || startIsFebruaryEnd ? 30 : start.day
  var endDay = end.day
  if (endIsFebruaryEnd && startIsFebruaryEnd) endDay = 30
  if (endDay === 31 && startDay === 30) endDay = 30
  return (end.year - start.year) * 360 + (end.month - start.month) * 30 + endDay - startDay
}

function accrualInfo(balanceCents, annualRate, options) {
  var settlementInterest = explicitNumber(options.settlementInterest, NaN)
  if (Number.isFinite(settlementInterest)) {
    if (settlementInterest < 0) return { valid: false, error: 'invalidSettlementInterest' }
    return {
      valid: true,
      precisionMode: 'statement',
      dayCount: '',
      dayCountConvention: '',
      days: 0,
      interestCents: toCents(settlementInterest)
    }
  }
  if (hasExplicitValue(options.settlementInterest)) return { valid: false, error: 'invalidSettlementInterest' }

  var start = parseYmdDate(options.lastSettledDate)
  var end = parseYmdDate(options.prepayDate)
  var dayCount = options.dayCount || 'ACT_365F'
  if (!start || !end) return { valid: false, error: 'missingAccrualDate' }
  if (end.utc < start.utc) return { valid: false, error: 'invalidAccrualDate' }
  if (dayCount !== 'ACT_365F' && dayCount !== 'ACT_360' && dayCount !== '30_360') {
    return { valid: false, error: 'invalidDayCount' }
  }

  var days = dayCount === '30_360'
    ? thirty360Days(start, end)
    : Math.round((end.utc - start.utc) / 86400000)
  var denominator = dayCount === 'ACT_360' || dayCount === '30_360' ? 360 : 365
  var interest = moneyFromCents(balanceCents) * annualRate / 100 * days / denominator
  return {
    valid: true,
    precisionMode: 'dailyEstimate',
    dayCount: dayCount,
    dayCountConvention: dayCount === '30_360' ? '30_360_US' : dayCount,
    days: days,
    interestCents: toCents(interest)
  }
}

function penaltyCentsForPrepayment(balanceCents, prepayCents, options) {
  var type = options.penaltyType || (options.penalty && options.penalty.type) || 'fixed'
  var value = hasExplicitValue(options.penaltyValue)
    ? explicitNumber(options.penaltyValue, NaN)
    : (options.penalty && hasExplicitValue(options.penalty.value)
      ? explicitNumber(options.penalty.value, NaN)
      : 0)
  if (!Number.isFinite(value) || value < 0) return { valid: false, error: 'invalidPenalty' }
  if (type === 'fixed') return { valid: true, cents: toCents(value) }
  if (type === 'percentOfPrepay') {
    return { valid: true, cents: toCents(fromCents(prepayCents) * value / 100) }
  }
  if (type === 'percentOfBalance') {
    return { valid: true, cents: toCents(fromCents(balanceCents) * value / 100) }
  }
  return { valid: false, error: 'invalidPenaltyType' }
}

function scheduleIsPaidOff(schedule) {
  return schedule.length > 0 && toCents(schedule[schedule.length - 1].balance) === 0
}

function exactBaseSchedule(balance, annualRate, months, method, options) {
  var rate = monthlyRateFromAnnual(annualRate)
  if (method === 'equalPrincipal') {
    if (hasExplicitValue(options.principalPayment)) {
      var principalPayment = explicitNumber(options.principalPayment, NaN)
      if (!Number.isFinite(principalPayment) || principalPayment <= 0) return { valid: false, error: 'invalidPrincipalPayment' }
      var fixedPrincipal = calcFixedPrincipalSchedule(balance, rate, principalPayment, months, {
        forceFinalBalance: false
      })
      if (!scheduleIsPaidOff(fixedPrincipal)) return { valid: false, error: 'paymentInsufficient' }
      if (fixedPrincipal.length !== months) return { valid: false, error: 'paymentTermMismatch' }
      return { valid: true, schedule: fixedPrincipal }
    }
    return { valid: true, schedule: calcEqualPrincipal(balance, annualRate, months).schedule }
  }

  if (hasExplicitValue(options.monthlyPayment)) {
    var payment = explicitNumber(options.monthlyPayment, NaN)
    if (!Number.isFinite(payment) || payment <= 0) return { valid: false, error: 'invalidMonthlyPayment' }
    var fixedPayment = calcFixedPaymentSchedule(balance, rate, payment, months, {
      forceFinalBalance: false
    })
    if (!scheduleIsPaidOff(fixedPayment)) return { valid: false, error: 'paymentInsufficient' }
    if (fixedPayment.length !== months) return { valid: false, error: 'paymentTermMismatch' }
    return { valid: true, schedule: fixedPayment }
  }
  return { valid: true, schedule: calcEqualInstallment(balance, annualRate, months).schedule }
}

// 账单结息 + 后续固定利率计划估算。首版只支持正常等额本息或等额本金。
function calcExactPrepayment(options) {
  options = options || {}
  var rawBalance = explicitNumber(options.remainingPrincipal, NaN)
  var rawMonths = hasExplicitValue(options.remainingMonths)
    ? explicitNumber(options.remainingMonths, NaN)
    : explicitNumber(options.months, NaN)
  var rawAnnualRate = explicitNumber(options.annualRate, NaN)
  var rawPrepay = hasExplicitValue(options.prepayPrincipal)
    ? explicitNumber(options.prepayPrincipal, NaN)
    : explicitNumber(options.prepayAmount, NaN)
  var rawBalloon = explicitNumber(options.balloonAmount, 0)
  var method = options.method || 'equalInstallment'
  var reduceMode = options.reduceMode || 'term'

  if (options.hasArrears || options.hasOverdue || options.hasSkippedPayment) {
    return invalidCalculation('unsupportedLoanState')
  }
  if (!Number.isFinite(rawBalloon) || rawBalloon < 0) return invalidCalculation('invalidBalloonAmount')
  if (options.method === 'balloon' || toCents(rawBalloon) > 0) {
    return invalidCalculation('unsupportedMethod')
  }
  if ((Array.isArray(options.ratePath) && options.ratePath.length) ||
    (Array.isArray(options.rateEvents) && options.rateEvents.length) ||
    (Array.isArray(options.lprPath) && options.lprPath.length) ||
    (Array.isArray(options.lprEvents) && options.lprEvents.length)) {
    return invalidCalculation('unsupportedRatePath')
  }
  if (method !== 'equalInstallment' && method !== 'equalPrincipal') {
    return invalidCalculation('unsupportedMethod')
  }
  if ((method === 'equalPrincipal' && hasExplicitValue(options.monthlyPayment)) ||
    (method === 'equalInstallment' && hasExplicitValue(options.principalPayment))) {
    return invalidCalculation('unsupportedCustomPayment')
  }
  if (reduceMode !== 'term' && reduceMode !== 'payment') return invalidCalculation('invalidReduceMode')
  if (!Number.isFinite(rawBalance) || rawBalance <= 0) return invalidCalculation('invalidRemainingPrincipal')
  if (!Number.isFinite(rawMonths) || Math.round(rawMonths) !== rawMonths || rawMonths < 1 || rawMonths > MAX_MONTHS) {
    return invalidCalculation('invalidRemainingMonths')
  }
  if (!Number.isFinite(rawAnnualRate) || rawAnnualRate < 0) return invalidCalculation('invalidAnnualRate')
  if (!Number.isFinite(rawPrepay) || rawPrepay <= 0) return invalidCalculation('invalidPrepayPrincipal')

  var balanceCents = toCents(rawBalance)
  var prepayCents = toCents(rawPrepay)
  if (balanceCents <= 0) return invalidCalculation('invalidRemainingPrincipal')
  if (prepayCents <= 0) return invalidCalculation('invalidPrepayPrincipal')
  if (prepayCents > balanceCents) return invalidCalculation('prepayExceedsBalance')

  var months = Math.round(rawMonths)
  var balance = moneyFromCents(balanceCents)
  var base = exactBaseSchedule(balance, rawAnnualRate, months, method, options)
  if (!base.valid) return invalidCalculation(base.error)

  var accrued = accrualInfo(balanceCents, rawAnnualRate, options)
  if (!accrued.valid) return invalidCalculation(accrued.error)
  var penalty = penaltyCentsForPrepayment(balanceCents, prepayCents, options)
  if (!penalty.valid) return invalidCalculation(penalty.error)

  var oldSchedule = base.schedule
  var oldRemainingMonths = oldSchedule.length
  var oldRemainingInterestCents = sumScheduleCents(oldSchedule, 'interest')
  var afterPrepayCents = balanceCents - prepayCents
  var afterPrepayBalance = moneyFromCents(afterPrepayCents)
  var newSchedule = []

  if (afterPrepayCents > 0) {
    if (reduceMode === 'payment') {
      newSchedule = method === 'equalPrincipal'
        ? calcEqualPrincipal(afterPrepayBalance, rawAnnualRate, oldRemainingMonths).schedule
        : calcEqualInstallment(afterPrepayBalance, rawAnnualRate, oldRemainingMonths).schedule
    } else if (method === 'equalPrincipal') {
      newSchedule = calcFixedPrincipalSchedule(
        afterPrepayBalance,
        monthlyRateFromAnnual(rawAnnualRate),
        oldSchedule[0].principal,
        oldRemainingMonths,
        { forceFinalBalance: false }
      )
    } else {
      newSchedule = calcFixedPaymentSchedule(
        afterPrepayBalance,
        monthlyRateFromAnnual(rawAnnualRate),
        oldSchedule[0].payment,
        oldRemainingMonths,
        { forceFinalBalance: false }
      )
    }
    if (!scheduleIsPaidOff(newSchedule)) return invalidCalculation('paymentInsufficient')
  }

  var newRemainingInterestCents = sumScheduleCents(newSchedule, 'interest')
  var interestSavedCents = Math.max(0, oldRemainingInterestCents - newRemainingInterestCents)
  var settlementTotalCents = prepayCents + accrued.interestCents + penalty.cents

  return {
    valid: true,
    error: '',
    precisionMode: accrued.precisionMode,
    scope: accrued.precisionMode === 'statement'
      ? 'statementAccrualAndEstimatedFixedRateSchedule'
      : 'dailyAccrualEstimateAndEstimatedFixedRateSchedule',
    dayCount: accrued.dayCount,
    dayCountConvention: accrued.dayCountConvention,
    accrualDays: accrued.days,
    method: method,
    reduceMode: reduceMode,
    remainingPrincipal: moneyFromCents(balanceCents),
    remainingBalance: moneyFromCents(balanceCents),
    prepayPrincipal: moneyFromCents(prepayCents),
    afterPrepayPrincipal: afterPrepayBalance,
    afterPrepayBalance: afterPrepayBalance,
    accruedInterest: moneyFromCents(accrued.interestCents),
    penalty: moneyFromCents(penalty.cents),
    settlementTotal: moneyFromCents(settlementTotalCents),
    oldRemainingInterest: moneyFromCents(oldRemainingInterestCents),
    newRemainingInterest: moneyFromCents(newRemainingInterestCents),
    interestSaved: moneyFromCents(interestSavedCents),
    scheduledInterestSaved: moneyFromCents(interestSavedCents),
    futureInterestSaved: moneyFromCents(interestSavedCents),
    netFutureInterestSaved: moneyFromCents(interestSavedCents - penalty.cents),
    netSaved: moneyFromCents(interestSavedCents - penalty.cents),
    oldRemainingMonths: oldRemainingMonths,
    newRemainingMonths: newSchedule.length,
    oldMonthlyPayment: oldSchedule[0] ? oldSchedule[0].payment : 0,
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
  calcComprehensiveFinancing: calcComprehensiveFinancing,
  calcCarLandedCost: calcCarLandedCost,
  calcRatePathSchedule: calcRatePathSchedule,
  calcExactPrepayment: calcExactPrepayment,
  inferMonthlyRateFromPayment: inferMonthlyRateFromPayment,
  solveMonthlyRateFromCashflows: solveMonthlyRateFromCashflows
}
