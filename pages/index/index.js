const loan = require('../../utils/loan')

function money(value) {
  return loan.formatMoney(value)
}

function percent(value, digits) {
  return loan.formatPercent(value, digits || 2)
}

function schedulePreview(schedule) {
  return schedule.filter(function (row) {
    return row.payment || row.principal || row.interest || row.balance
  }).map(function (row) {
    return {
      month: row.month,
      payment: money(row.payment),
      principal: money(row.principal),
      interest: money(row.interest),
      balance: money(row.balance)
    }
  })
}

function methodName(method) {
  if (method === 'equalPrincipal') return '等额本金'
  if (method === 'interestOnly') return '先息后本'
  return '等额本息'
}

function rateLabel(mode) {
  return mode === 'monthly' ? '月息' : '年化'
}

function rateUnit() {
  return '%'
}

function asAnnualRate(value, mode) {
  const n = loan.toNumber(value)
  return n * (mode === 'monthly' ? 12 : 1)
}

function asMonthlyFlatRate(value, mode) {
  const n = loan.toNumber(value)
  return n / (mode === 'annual' ? 12 : 1)
}

function asMonthlyRatePercent(value, mode) {
  const n = loan.toNumber(value)
  return mode === 'annual' ? n / 12 : n
}

function rateText(value, mode) {
  return `${rateLabel(mode)}：${value || 0}${rateUnit(mode)}`
}

function amount(value, unit) {
  return loan.toNumber(value) * (unit === 'wan' ? 10000 : 1)
}

const LOAN_TYPES = [
  { value: 'car', label: '车贷' },
  { value: 'home', label: '房贷' }
]

const TERM_OPTIONS = {
  car: [
    { value: '12', label: '12期' },
    { value: '24', label: '24期' },
    { value: '36', label: '36期' },
    { value: '48', label: '48期' },
    { value: '60', label: '60期' }
  ],
  home: [
    { value: '60', label: '5年' },
    { value: '120', label: '10年' },
    { value: '240', label: '20年' },
    { value: '360', label: '30年' }
  ]
}

const TOOL_OPTIONS = {
  car: [
    { value: 'payment', label: '算月供' },
    { value: 'actual', label: '查真利率' },
    { value: 'flat', label: '平息换算' }
  ],
  home: [
    { value: 'payment', label: '算月供' },
    { value: 'combo', label: '组合贷' },
    { value: 'budget', label: '能贷多少' },
    { value: 'prepay', label: '提前还款' }
  ]
}

function optionLabel(list, value) {
  const hit = list.find(function (item) {
    return item.value === value
  })
  return hit ? hit.label : ''
}

Page({
  data: {
    loanTypeList: LOAN_TYPES,
    loanType: 'car',
    termOptionList: TERM_OPTIONS.car,
    toolList: TOOL_OPTIONS.car,
    activeTool: 'payment',
    downRatioOptions: ['20', '30', '40', '50'],
    paymentForm: {
      principal: '',
      months: '',
      annualRate: '',
      rateMode: 'annual',
      method: 'equalInstallment',
      unit: 'yuan',
      inputMode: 'loan',
      carPrice: '',
      downRatio: '',
      downPayment: ''
    },
    comboForm: {
      commercialPrincipal: '',
      commercialRate: '',
      fundPrincipal: '',
      fundRate: '',
      years: '',
      rateMode: 'annual',
      method: 'equalInstallment',
      unit: 'wan'
    },
    budgetForm: {
      monthlyBudget: '',
      months: '',
      annualRate: '',
      rateMode: 'annual',
      method: 'equalInstallment'
    },
    actualForm: {
      principal: '',
      months: '',
      monthlyPayment: '',
      totalInterest: '',
      inputMode: 'payment',
      upfrontFee: '',
      claimedMonthlyRate: '',
      claimedRateMode: 'monthly',
      unit: 'yuan'
    },
    flatForm: {
      principal: '',
      months: '',
      monthlyFlatRate: '',
      rateMode: 'monthly',
      unit: 'yuan'
    },
    prepayForm: {
      principal: '',
      months: '',
      annualRate: '',
      rateMode: 'annual',
      paidMonths: '',
      prepayAmount: '',
      reduceMode: 'term',
      unit: 'wan'
    },
    paymentResult: {},
    comboResult: {},
    budgetResult: {},
    actualResult: {},
    flatResult: {},
    prepayResult: {},
    activeSchedulePreview: []
  },

  onLoad() {
    this.recalculate()
  },

  switchTool(event) {
    const activeTool = event.currentTarget.dataset.tool
    if (activeTool === 'combo') {
      this.setData({
        activeTool,
        loanType: 'home',
        termOptionList: TERM_OPTIONS.home,
        toolList: TOOL_OPTIONS.home
      }, () => this.recalculate())
      return
    }

    this.setData({ activeTool }, () => this.recalculate())
  },

  onInput(event) {
    const form = event.currentTarget.dataset.form
    const field = event.currentTarget.dataset.field
    const patch = { [`${form}.${field}`]: event.detail.value }
    if (field === 'downPayment') patch[`${form}.downRatio`] = ''
    if (field === 'balloonAmount') patch[`${form}.balloonRatio`] = ''
    this.setData(patch, () => this.recalculate())
  },

  setFormValue(event) {
    const form = event.currentTarget.dataset.form
    const field = event.currentTarget.dataset.field
    const value = event.currentTarget.dataset.value
    const patch = { [`${form}.${field}`]: value }
    if (field === 'downRatio') patch[`${form}.downPayment`] = ''
    if (field === 'balloonRatio') patch[`${form}.balloonAmount`] = ''
    this.setData(patch, () => this.recalculate())
  },

  setMonths(event) {
    const form = event.currentTarget.dataset.form
    const value = event.currentTarget.dataset.value
    this.setData({
      [`${form}.months`]: String(value)
    }, () => this.recalculate())
  },

  setLoanType(event) {
    const loanType = event.currentTarget.dataset.value
    const toolList = TOOL_OPTIONS[loanType] || TOOL_OPTIONS.car
    const activeTool = toolList.some(function (item) {
      return item.value === this.data.activeTool
    }, this) ? this.data.activeTool : toolList[0].value
    this.setData({
      loanType,
      termOptionList: TERM_OPTIONS[loanType] || TERM_OPTIONS.car,
      toolList,
      activeTool,
      'paymentForm.unit': loanType === 'home' ? 'wan' : 'yuan'
    }, () => this.recalculate())
  },

  loanContextLines() {
    return [
      `贷款类型：${optionLabel(LOAN_TYPES, this.data.loanType)}`
    ]
  },

  copySummary() {
    const activeTool = this.data.activeTool
    const summaries = {
      payment: this.data.paymentResult.copyText,
      combo: this.data.comboResult.copyText,
      budget: this.data.budgetResult.copyText,
      actual: this.data.actualResult.copyText,
      flat: this.data.flatResult.copyText,
      prepay: this.data.prepayResult.copyText
    }
    wx.setClipboardData({
      data: summaries[activeTool] || ''
    })
  },

  recalculate() {
    const paymentResult = this.buildPaymentResult()
    const comboResult = this.buildComboResult()
    const budgetResult = this.buildBudgetResult()
    const actualResult = this.buildActualResult()
    const flatResult = this.buildFlatResult()
    const prepayResult = this.buildPrepayResult()
    const schedules = {
      payment: paymentResult.schedulePreview,
      combo: comboResult.schedulePreview,
      budget: budgetResult.schedulePreview,
      prepay: prepayResult.schedulePreview
    }

    this.setData({
      paymentResult,
      comboResult,
      budgetResult,
      actualResult,
      flatResult,
      prepayResult,
      activeSchedulePreview: schedules[this.data.activeTool] || []
    })
  },

  buildPaymentResult() {
    const form = this.data.paymentForm
    let principal = amount(form.principal, form.unit)
    let carPrice = 0
    let downPayment = 0
    if (form.inputMode === 'price') {
      carPrice = amount(form.carPrice, form.unit)
      downPayment = form.downRatio
        ? carPrice * loan.toNumber(form.downRatio) / 100
        : amount(form.downPayment, form.unit)
      principal = Math.max(0, carPrice - downPayment)
    }
    const annualRate = asAnnualRate(form.annualRate, form.rateMode)
    const result = loan.calculateByMethod(principal, annualRate, form.months, form.method)
    const primaryLabel = form.method === 'equalPrincipal' ? '首月月供' : '每月月供'
    const primaryPayment = form.method === 'equalPrincipal' ? result.firstPayment : result.monthlyPayment
    const priceLines = form.inputMode === 'price'
      ? [`车价：${money(carPrice)} 元`, `首付：${money(downPayment)} 元`]
      : []
    const copyText = [
      ...this.loanContextLines(),
      ...priceLines,
      `贷款本金：${money(result.principal)} 元`,
      `还款方式：${methodName(form.method)}`,
      rateText(form.annualRate, form.rateMode),
      `${primaryLabel}：${money(primaryPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`,
      `还款总额：${money(result.totalPayment)} 元`
    ].join('\n')

    return {
      primaryLabel,
      primaryPayment: money(primaryPayment),
      loanAmount: money(result.principal),
      lastPayment: money(result.lastPayment),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      monthlyRate: percent(result.monthlyRate, 4),
      schedulePreview: schedulePreview(result.schedule),
      copyText
    }
  },

  buildComboResult() {
    const form = this.data.comboForm
    const months = Math.max(1, loan.toNumber(form.years, 30) * 12)
    const commercialRate = asAnnualRate(form.commercialRate, form.rateMode)
    const fundRate = asAnnualRate(form.fundRate, form.rateMode)
    const result = loan.calcCompositeLoan(
      amount(form.commercialPrincipal, form.unit),
      commercialRate,
      amount(form.fundPrincipal, form.unit),
      fundRate,
      months,
      form.method
    )
    const primaryPayment = form.method === 'equalPrincipal' ? result.firstPayment : result.monthlyPayment
    const copyText = [
      ...this.loanContextLines(),
      `组合贷本金：${money(result.principal)} 元`,
      `商贷：${money(amount(form.commercialPrincipal, form.unit))} 元，${rateText(form.commercialRate, form.rateMode)}`,
      `公积金：${money(amount(form.fundPrincipal, form.unit))} 元，${rateText(form.fundRate, form.rateMode)}`,
      `首月/每月：${money(primaryPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`
    ].join('\n')

    return {
      primaryPayment: money(primaryPayment),
      lastPayment: money(result.lastPayment),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      schedulePreview: schedulePreview(result.schedule),
      copyText
    }
  },

  buildBudgetResult() {
    const form = this.data.budgetForm
    const annualRate = asAnnualRate(form.annualRate, form.rateMode)
    const result = loan.calcAffordableLoan(form.monthlyBudget, annualRate, form.months, form.method)
    const primaryPayment = form.method === 'equalPrincipal' ? result.firstPayment : result.monthlyPayment
    const copyText = [
      ...this.loanContextLines(),
      `月供预算：${money(loan.toNumber(form.monthlyBudget))} 元`,
      `可贷本金：${money(result.principal)} 元`,
      `还款方式：${methodName(form.method)}`,
      rateText(form.annualRate, form.rateMode),
      `首月/每月：${money(primaryPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`,
      `还款总额：${money(result.totalPayment)} 元`
    ].join('\n')

    return {
      principal: money(result.principal),
      primaryPayment: money(primaryPayment),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      schedulePreview: schedulePreview(result.schedule),
      copyText
    }
  },

  buildActualResult() {
    const form = this.data.actualForm
    const principal = amount(form.principal, form.unit)
    const upfrontFee = amount(form.upfrontFee, form.unit)
    const months = Math.max(1, Math.round(loan.toNumber(form.months)))
    const monthlyPayment = form.inputMode === 'interest'
      ? (principal + amount(form.totalInterest, form.unit)) / months
      : loan.toNumber(form.monthlyPayment)
    const claimedMonthlyRate = asMonthlyRatePercent(form.claimedMonthlyRate, form.claimedRateMode)
    const result = loan.calcActualRate(principal, monthlyPayment, months, claimedMonthlyRate, upfrontFee)
    const copyText = [
      ...this.loanContextLines(),
      `本金：${money(result.principal)} 元`,
      `${form.inputMode === 'interest' ? '折算月供' : '月供'}：${money(result.monthlyPayment)} 元`,
      `前置费用：${money(result.upfrontFee)} 元`,
      `对外${rateText(form.claimedMonthlyRate, form.claimedRateMode)}`,
      `真实月利率：${percent(result.monthlyRate, 4)}`,
      `含费月利率：${percent(result.feeAdjustedMonthlyRate, 4)}`,
      `名义年化：${percent(result.annualNominalRate, 2)}`,
      `复利年化：${percent(result.annualEffectiveRate, 2)}`,
      `含费复利年化：${percent(result.feeAdjustedAnnualEffectiveRate, 2)}`,
      `总利息：${money(result.totalInterest)} 元`
    ].join('\n')

    return {
      monthlyRate: percent(result.monthlyRate, 4),
      annualNominalRate: percent(result.annualNominalRate, 2),
      annualEffectiveRate: percent(result.annualEffectiveRate, 2),
      feeAdjustedMonthlyRate: percent(result.feeAdjustedMonthlyRate, 4),
      feeAdjustedAnnualEffectiveRate: percent(result.feeAdjustedAnnualEffectiveRate, 2),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      claimedMultiple: result.claimedMultiple ? loan.round(result.claimedMultiple, 2) + ' 倍' : '未填写',
      claimedMonthlyGap: percent(result.claimedMonthlyGap, 4),
      copyText
    }
  },

  buildFlatResult() {
    const form = this.data.flatForm
    const monthlyFlatRate = asMonthlyFlatRate(form.monthlyFlatRate, form.rateMode)
    const result = loan.calcFlatMonthly(amount(form.principal, form.unit), monthlyFlatRate, form.months)
    const copyText = [
      ...this.loanContextLines(),
      `平息${rateText(form.monthlyFlatRate, form.rateMode)}`,
      `折算月费率：${percent(result.flatMonthlyRate, 4)}`,
      `月供：${money(result.monthlyPayment)} 元`,
      `真实月利率：${percent(result.actualMonthlyRate, 4)}`,
      `真实复利年化：${percent(result.actualAnnualEffectiveRate, 2)}`,
      `总利息：${money(result.totalInterest)} 元`
    ].join('\n')

    return {
      monthlyPayment: money(result.monthlyPayment),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      actualMonthlyRate: percent(result.actualMonthlyRate, 4),
      actualAnnualNominalRate: percent(result.actualAnnualNominalRate, 2),
      actualAnnualEffectiveRate: percent(result.actualAnnualEffectiveRate, 2),
      copyText
    }
  },

  buildPrepayResult() {
    const form = this.data.prepayForm
    const annualRate = asAnnualRate(form.annualRate, form.rateMode)
    const result = loan.calcPrepayment(
      amount(form.principal, form.unit),
      annualRate,
      form.months,
      form.paidMonths,
      amount(form.prepayAmount, form.unit),
      form.reduceMode
    )
    const copyText = [
      ...this.loanContextLines(),
      `剩余本金：${money(result.remainingBalance)} 元`,
      `提前还款后本金：${money(result.afterPrepayBalance)} 元`,
      `节省利息：${money(result.interestSaved)} 元`,
      `原剩余期数：${result.oldRemainingMonths} 期`,
      `新剩余期数：${result.newRemainingMonths} 期`,
      `新月供：${money(result.newMonthlyPayment)} 元`
    ].join('\n')

    return {
      remainingBalance: money(result.remainingBalance),
      afterPrepayBalance: money(result.afterPrepayBalance),
      oldRemainingInterest: money(result.oldRemainingInterest),
      newRemainingInterest: money(result.newRemainingInterest),
      interestSaved: money(result.interestSaved),
      oldRemainingMonths: result.oldRemainingMonths,
      newRemainingMonths: result.newRemainingMonths,
      oldMonthlyPayment: money(result.oldMonthlyPayment),
      newMonthlyPayment: money(result.newMonthlyPayment),
      schedulePreview: schedulePreview(result.schedule),
      copyText
    }
  }
})
