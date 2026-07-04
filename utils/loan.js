var MAX_MONTHS = 600
var ZERO_RATE = 1e-10

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
  var scale = Math.pow(10, digits)
  return Math.round((value + Number.EPSILON) * scale) / scale
}

function formatMoney(value) {
  var fixed = round(toNumber(value), 2).toFixed(2)
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

function normalizeMonths(months) {
  return Math.min(MAX_MONTHS, Math.max(1, Math.round(toNumber(months, 1))))
}

function baseResult(principal, annualRatePercent, months, method, schedule) {
  var totalPayment = schedule.reduce(function (sum, row) {
    return sum + row.payment
  }, 0)
  var totalInterest = schedule.reduce(function (sum, row) {
    return sum + row.interest
  }, 0)
  return {
    principal: principal,
    annualRate: nonNegative(annualRatePercent),
    months: months,
    method: method,
    monthlyRate: monthlyRateFromAnnual(annualRatePercent),
    totalPayment: totalPayment,
    totalInterest: totalInterest,
    firstPayment: schedule[0] ? schedule[0].payment : 0,
    lastPayment: schedule[schedule.length - 1] ? schedule[schedule.length - 1].payment : 0,
    monthlyPayment: schedule[0] ? schedule[0].payment : 0,
    schedule: schedule
  }
}

function calcEqualInstallment(principal, annualRatePercent, months) {
  principal = nonNegative(principal)
  months = normalizeMonths(months)
  var r = monthlyRateFromAnnual(annualRatePercent)
  var payment = isZeroRate(r) ? principal / months : principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1)
  var balance = principal
  var schedule = []

  for (var i = 1; i <= months; i += 1) {
    var interest = balance * r
    var principalPart = payment - interest
    if (i === months) principalPart = balance
    var rowPayment = principalPart + interest
    balance = Math.max(0, balance - principalPart)
    schedule.push({
      month: i,
      payment: rowPayment,
      principal: principalPart,
      interest: interest,
      balance: balance
    })
  }

  return baseResult(principal, annualRatePercent, months, 'equalInstallment', schedule)
}

function calcEqualPrincipal(principal, annualRatePercent, months) {
  principal = nonNegative(principal)
  months = normalizeMonths(months)
  var r = monthlyRateFromAnnual(annualRatePercent)
  var principalPart = principal / months
  var balance = principal
  var schedule = []

  for (var i = 1; i <= months; i += 1) {
    var currentPrincipal = i === months ? balance : principalPart
    var interest = balance * r
    var payment = currentPrincipal + interest
    balance = Math.max(0, balance - currentPrincipal)
    schedule.push({
      month: i,
      payment: payment,
      principal: currentPrincipal,
      interest: interest,
      balance: balance
    })
  }

  return baseResult(principal, annualRatePercent, months, 'equalPrincipal', schedule)
}

function calcInterestOnly(principal, annualRatePercent, months) {
  principal = nonNegative(principal)
  months = normalizeMonths(months)
  var r = monthlyRateFromAnnual(annualRatePercent)
  var interest = principal * r
  var schedule = []

  for (var i = 1; i <= months; i += 1) {
    var principalPart = i === months ? principal : 0
    schedule.push({
      month: i,
      payment: interest + principalPart,
      principal: principalPart,
      interest: interest,
      balance: i === months ? 0 : principal
    })
  }

  return baseResult(principal, annualRatePercent, months, 'interestOnly', schedule)
}

function calculateByMethod(principal, annualRatePercent, months, method) {
  if (method === 'equalPrincipal') return calcEqualPrincipal(principal, annualRatePercent, months)
  if (method === 'interestOnly') return calcInterestOnly(principal, annualRatePercent, months)
  return calcEqualInstallment(principal, annualRatePercent, months)
}

function presentValueOfPayment(monthlyPayment, months, monthlyRate, balloon) {
  var pv = 0
  for (var i = 1; i <= months; i += 1) {
    pv += monthlyPayment / Math.pow(1 + monthlyRate, i)
  }
  return pv + (balloon || 0) / Math.pow(1 + monthlyRate, months)
}

function inferMonthlyRateFromPayment(principal, monthlyPayment, months, balloon) {
  principal = nonNegative(principal)
  monthlyPayment = nonNegative(monthlyPayment)
  balloon = nonNegative(balloon)
  months = normalizeMonths(months)
  if (principal <= 0 || monthlyPayment <= 0) return 0
  if (monthlyPayment * months + balloon <= principal) return 0

  var low = 0
  var high = 0.02
  while (presentValueOfPayment(monthlyPayment, months, high, balloon) > principal && high < 1) {
    high *= 2
  }

  for (var i = 0; i < 80; i += 1) {
    var mid = (low + high) / 2
    if (presentValueOfPayment(monthlyPayment, months, mid, balloon) > principal) {
      low = mid
    } else {
      high = mid
    }
  }

  return (low + high) / 2
}

function calcActualRate(principal, monthlyPayment, months, claimedMonthlyRatePercent) {
  principal = nonNegative(principal)
  monthlyPayment = nonNegative(monthlyPayment)
  months = normalizeMonths(months)
  var monthlyRate = inferMonthlyRateFromPayment(principal, monthlyPayment, months)
  var claimedMonthlyRate = nonNegative(claimedMonthlyRatePercent) / 100
  var totalPayment = monthlyPayment * months
  var totalInterest = Math.max(0, totalPayment - principal)
  return {
    principal: principal,
    months: months,
    monthlyPayment: monthlyPayment,
    monthlyRate: monthlyRate,
    annualNominalRate: monthlyRate * 12,
    annualEffectiveRate: Math.pow(1 + monthlyRate, 12) - 1,
    totalPayment: totalPayment,
    totalInterest: totalInterest,
    claimedMonthlyRate: claimedMonthlyRate,
    claimedMultiple: claimedMonthlyRate > 0 ? monthlyRate / claimedMonthlyRate : 0,
    claimedMonthlyGap: monthlyRate - claimedMonthlyRate
  }
}

function calcFlatMonthly(principal, monthlyFlatRatePercent, months) {
  principal = nonNegative(principal)
  months = normalizeMonths(months)
  var flatMonthlyRate = nonNegative(monthlyFlatRatePercent) / 100
  var totalInterest = principal * flatMonthlyRate * months
  var monthlyPayment = (principal + totalInterest) / months
  var actualMonthlyRate = inferMonthlyRateFromPayment(principal, monthlyPayment, months)

  return {
    principal: principal,
    months: months,
    flatMonthlyRate: flatMonthlyRate,
    monthlyPayment: monthlyPayment,
    totalPayment: principal + totalInterest,
    totalInterest: totalInterest,
    actualMonthlyRate: actualMonthlyRate,
    actualAnnualNominalRate: actualMonthlyRate * 12,
    actualAnnualEffectiveRate: Math.pow(1 + actualMonthlyRate, 12) - 1
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
    schedule.push({
      month: i + 1,
      payment: a.payment + b.payment,
      principal: a.principal + b.principal,
      interest: a.interest + b.interest,
      balance: a.balance + b.balance
    })
  }

  return baseResult(
    nonNegative(commercialPrincipal) + nonNegative(fundPrincipal),
    0,
    months,
    'composite',
    schedule
  )
}

function calcAffordableLoan(monthlyBudget, annualRatePercent, months, method) {
  monthlyBudget = nonNegative(monthlyBudget)
  months = normalizeMonths(months)
  var r = monthlyRateFromAnnual(annualRatePercent)
  var principal

  if (method === 'equalPrincipal') {
    principal = isZeroRate(r) ? monthlyBudget * months : monthlyBudget / (1 / months + r)
  } else {
    principal = isZeroRate(r) ? monthlyBudget * months : monthlyBudget * (Math.pow(1 + r, months) - 1) / (r * Math.pow(1 + r, months))
  }

  var result = calculateByMethod(principal, annualRatePercent, months, method === 'equalPrincipal' ? 'equalPrincipal' : 'equalInstallment')
  result.monthlyBudget = monthlyBudget
  return result
}

function calcBalloonLoan(principal, annualRatePercent, months, balloonAmount) {
  principal = nonNegative(principal)
  months = normalizeMonths(months)
  var balloon = Math.min(nonNegative(balloonAmount), principal)
  var r = monthlyRateFromAnnual(annualRatePercent)
  var payment = isZeroRate(r)
    ? (principal - balloon) / months
    : (principal - balloon / Math.pow(1 + r, months)) * r / (1 - Math.pow(1 + r, -months))
  var balance = principal
  var schedule = []

  for (var i = 1; i <= months; i += 1) {
    var interest = balance * r
    var principalPart = payment - interest
    if (i === months) principalPart = balance
    var rowPayment = principalPart + interest
    balance = Math.max(0, balance - principalPart)
    schedule.push({
      month: i,
      payment: rowPayment,
      principal: principalPart,
      interest: interest,
      balance: balance
    })
  }

  var result = baseResult(principal, annualRatePercent, months, 'balloon', schedule)
  result.balloonAmount = balloon
  result.monthlyPayment = payment
  return result
}

function calcRentToOwn(carPrice, downPayment, monthlyRent, months, buyout) {
  carPrice = nonNegative(carPrice)
  downPayment = nonNegative(downPayment)
  monthlyRent = nonNegative(monthlyRent)
  buyout = nonNegative(buyout)
  months = normalizeMonths(months)
  var financed = Math.max(0, carPrice - downPayment)
  var hasImpliedRate = financed > 0 && monthlyRent > 0
  var impliedMonthlyRate = hasImpliedRate ? inferMonthlyRateFromPayment(financed, monthlyRent, months, buyout) : 0
  var totalCost = downPayment + monthlyRent * months + buyout
  return {
    carPrice: carPrice,
    downPayment: downPayment,
    monthlyRent: monthlyRent,
    months: months,
    buyout: buyout,
    totalCost: totalCost,
    premiumOverCash: carPrice > 0 ? totalCost - carPrice : 0,
    hasImpliedRate: hasImpliedRate,
    impliedMonthlyRate: impliedMonthlyRate,
    impliedAnnualNominalRate: impliedMonthlyRate * 12,
    impliedAnnualEffectiveRate: Math.pow(1 + impliedMonthlyRate, 12) - 1
  }
}

function calcRentPricing(carPrice, downPayment, months, buyout, targetAnnualRatePercent) {
  carPrice = nonNegative(carPrice)
  downPayment = nonNegative(downPayment)
  buyout = nonNegative(buyout)
  months = normalizeMonths(months)
  var r = monthlyRateFromAnnual(targetAnnualRatePercent)
  var financed = Math.max(0, carPrice - downPayment)
  var rent = isZeroRate(r)
    ? (financed - buyout) / months
    : (financed - buyout / Math.pow(1 + r, months)) * r / (1 - Math.pow(1 + r, -months))
  rent = Math.max(0, rent)
  var totalCost = downPayment + rent * months + buyout
  return {
    carPrice: carPrice,
    downPayment: downPayment,
    months: months,
    buyout: buyout,
    targetAnnualRate: nonNegative(targetAnnualRatePercent),
    monthlyRent: rent,
    totalCost: totalCost,
    premiumOverCash: carPrice > 0 ? totalCost - carPrice : 0
  }
}

function calcFixedPaymentSchedule(balance, monthlyRate, payment, maxMonths) {
  var schedule = []
  var current = nonNegative(balance)
  payment = nonNegative(payment)
  maxMonths = normalizeMonths(maxMonths || 600)

  for (var i = 1; i <= maxMonths && current > 0.01; i += 1) {
    var interest = current * monthlyRate
    var principal = Math.min(current, payment - interest)
    if (principal <= 0) break
    current = Math.max(0, current - principal)
    schedule.push({
      month: i,
      payment: principal + interest,
      principal: principal,
      interest: interest,
      balance: current
    })
  }

  return schedule
}

function calcPrepayment(principal, annualRatePercent, months, paidMonths, prepayAmount, reduceMode) {
  var base = calcEqualInstallment(principal, annualRatePercent, months)
  months = base.months
  paidMonths = Math.min(Math.max(0, Math.round(toNumber(paidMonths))), months)
  prepayAmount = nonNegative(prepayAmount)

  if (paidMonths >= months) {
    return {
      remainingBalance: 0,
      afterPrepayBalance: 0,
      oldRemainingInterest: 0,
      newRemainingInterest: 0,
      interestSaved: 0,
      oldRemainingMonths: 0,
      newRemainingMonths: 0,
      oldMonthlyPayment: base.monthlyPayment,
      newMonthlyPayment: 0,
      schedule: []
    }
  }

  var paidRow = paidMonths > 0 ? base.schedule[paidMonths - 1] : null
  var remainingBalance = paidRow ? paidRow.balance : base.principal
  var afterPrepayBalance = Math.max(0, remainingBalance - prepayAmount)
  var oldRemainingInterest = base.schedule.slice(paidMonths).reduce(function (sum, row) {
    return sum + row.interest
  }, 0)
  var remainingMonths = months - paidMonths
  var newSchedule

  if (reduceMode === 'payment') {
    newSchedule = calcEqualInstallment(afterPrepayBalance, annualRatePercent, remainingMonths).schedule
  } else {
    newSchedule = calcFixedPaymentSchedule(afterPrepayBalance, base.monthlyRate, base.monthlyPayment, remainingMonths)
  }

  var newRemainingInterest = newSchedule.reduce(function (sum, row) {
    return sum + row.interest
  }, 0)

  return {
    remainingBalance: remainingBalance,
    afterPrepayBalance: afterPrepayBalance,
    oldRemainingInterest: oldRemainingInterest,
    newRemainingInterest: newRemainingInterest,
    interestSaved: Math.max(0, oldRemainingInterest - newRemainingInterest),
    oldRemainingMonths: remainingMonths,
    newRemainingMonths: newSchedule.length,
    oldMonthlyPayment: base.monthlyPayment,
    newMonthlyPayment: newSchedule[0] ? newSchedule[0].payment : 0,
    schedule: newSchedule
  }
}

module.exports = {
  toNumber: toNumber,
  round: round,
  formatMoney: formatMoney,
  formatPercent: formatPercent,
  calculateByMethod: calculateByMethod,
  calcEqualInstallment: calcEqualInstallment,
  calcEqualPrincipal: calcEqualPrincipal,
  calcInterestOnly: calcInterestOnly,
  calcActualRate: calcActualRate,
  calcFlatMonthly: calcFlatMonthly,
  calcCompositeLoan: calcCompositeLoan,
  calcAffordableLoan: calcAffordableLoan,
  calcBalloonLoan: calcBalloonLoan,
  calcRentToOwn: calcRentToOwn,
  calcRentPricing: calcRentPricing,
  calcPrepayment: calcPrepayment,
  inferMonthlyRateFromPayment: inferMonthlyRateFromPayment
}
