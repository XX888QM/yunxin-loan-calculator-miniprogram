const loan = require('../../utils/loan')
const pdf = require('../../utils/pdf')

function money(value) {
  return loan.formatMoney(value)
}

function percent(value, digits) {
  return loan.formatPercent(value, digits || 2)
}

function monthLabel(startYm, monthIndex) {
  if (!startYm) return String(monthIndex)
  const parts = startYm.split('-')
  const total = Number(parts[0]) * 12 + (Number(parts[1]) - 1) + (monthIndex - 1)
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return y + '-' + (m < 10 ? '0' + m : m)
}

function schedulePreview(schedule, startYm) {
  return schedule.filter(function (row) {
    return row.payment || row.principal || row.interest || row.balance
  }).map(function (row) {
    return {
      month: row.month,
      label: monthLabel(startYm, row.month),
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

function normalizeMonths(value) {
  return loan.normalizeMonths(value)
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
    { value: 'flat', label: '平息换算' },
    { value: 'balloon', label: '尾款贷' }
  ],
  home: [
    { value: 'payment', label: '算月供' },
    { value: 'combo', label: '组合贷' },
    { value: 'budget', label: '能贷多少' },
    { value: 'prepay', label: '提前还款' }
  ]
}

const SHARE_INFO = {
  title: '云鑫真实贷款计算器',
  path: '/pages/index/index',
  imageUrl: '/assets/logo.png'
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
    balloonRatioOptions: ['30', '40', '50'],
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
    balloonForm: {
      principal: '',
      months: '',
      annualRate: '',
      rateMode: 'annual',
      balloonRatio: '',
      balloonAmount: '',
      unit: 'yuan'
    },
    rtoForm: {
      mode: 'analyze',
      carPrice: '',
      downPayment: '',
      monthlyRent: '',
      months: '',
      buyout: '',
      bankAnnualRate: '',
      targetAnnualRate: '',
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
      penaltyMode: 'percent',
      penaltyPercent: '',
      penaltyAmount: '',
      unit: 'wan'
    },
    paymentResult: {},
    comboResult: {},
    budgetResult: {},
    actualResult: {},
    flatResult: {},
    balloonResult: {},
    rtoResult: {},
    prepayResult: {},
    scheduleStartYm: '',
    activeSchedulePreview: []
  },

  onLoad() {
    this.enableShareMenus()
    this.recalculate()
  },

  enableShareMenus() {
    if (!wx.showShareMenu) return
    wx.showShareMenu({
      menus: ['shareAppMessage', 'shareTimeline']
    })
  },

  onShareAppMessage() {
    return SHARE_INFO
  },

  onShareTimeline() {
    return {
      title: SHARE_INFO.title,
      query: '',
      imageUrl: SHARE_INFO.imageUrl
    }
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

  setScheduleStart(event) {
    this.setData({ scheduleStartYm: event.detail.value }, () => this.recalculate())
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
      balloon: this.data.balloonResult.copyText,
      rto: this.data.rtoResult.copyText,
      prepay: this.data.prepayResult.copyText
    }
    wx.setClipboardData({
      data: summaries[activeTool] || ''
    })
  },

  exportSchedulePdf() {
    const rows = this.data.activeSchedulePreview || []
    if (!rows.length) {
      wx.showToast({ title: '暂无明细', icon: 'none' })
      return
    }

    const data = pdf.createSchedulePdf({
      rows,
      loanType: this.data.loanType,
      tool: this.data.activeTool,
      startMonth: this.data.scheduleStartYm || rows[0].label,
      total: rows.length
    })
    const filePath = wx.env.USER_DATA_PATH + '/loan-schedule-' + Date.now() + '.pdf'
    wx.getFileSystemManager().writeFile({
      filePath,
      data,
      success: function () {
        wx.openDocument({
          filePath,
          fileType: 'pdf',
          showMenu: true,
          fail: function () {
            wx.showToast({ title: '打开PDF失败', icon: 'none' })
          }
        })
      },
      fail: function () {
        wx.showToast({ title: '导出失败', icon: 'none' })
      }
    })
  },

  recalculate() {
    const paymentResult = this.buildPaymentResult()
    const comboResult = this.buildComboResult()
    const budgetResult = this.buildBudgetResult()
    const actualResult = this.buildActualResult()
    const flatResult = this.buildFlatResult()
    const balloonResult = this.buildBalloonResult()
    const rtoResult = this.buildRtoResult()
    const prepayResult = this.buildPrepayResult()
    const schedules = {
      payment: paymentResult.schedulePreview,
      combo: comboResult.schedulePreview,
      budget: budgetResult.schedulePreview,
      balloon: balloonResult.schedulePreview,
      prepay: prepayResult.schedulePreview
    }

    this.setData({
      paymentResult,
      comboResult,
      budgetResult,
      actualResult,
      flatResult,
      balloonResult,
      rtoResult,
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
    const copyText = this.loanContextLines().concat(priceLines, [
      `贷款本金：${money(result.principal)} 元`,
      `还款方式：${methodName(form.method)}`,
      rateText(form.annualRate, form.rateMode),
      `${primaryLabel}：${money(primaryPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`,
      `还款总额：${money(result.totalPayment)} 元`
    ]).join('\n')

    return {
      primaryLabel,
      primaryPayment: money(primaryPayment),
      loanAmount: money(result.principal),
      lastPayment: money(result.lastPayment),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      monthlyRate: percent(result.monthlyRate, 4),
      schedulePreview: schedulePreview(result.schedule, this.data.scheduleStartYm),
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
    const copyText = this.loanContextLines().concat([
      `组合贷本金：${money(result.principal)} 元`,
      `商贷：${money(amount(form.commercialPrincipal, form.unit))} 元，${rateText(form.commercialRate, form.rateMode)}`,
      `公积金：${money(amount(form.fundPrincipal, form.unit))} 元，${rateText(form.fundRate, form.rateMode)}`,
      `首月/每月：${money(primaryPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`
    ]).join('\n')

    return {
      primaryPayment: money(primaryPayment),
      lastPayment: money(result.lastPayment),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      schedulePreview: schedulePreview(result.schedule, this.data.scheduleStartYm),
      copyText
    }
  },

  buildBudgetResult() {
    const form = this.data.budgetForm
    const annualRate = asAnnualRate(form.annualRate, form.rateMode)
    const result = loan.calcAffordableLoan(form.monthlyBudget, annualRate, form.months, form.method)
    const primaryPayment = form.method === 'equalPrincipal' ? result.firstPayment : result.monthlyPayment
    const copyText = this.loanContextLines().concat([
      `月供预算：${money(loan.toNumber(form.monthlyBudget))} 元`,
      `可贷本金：${money(result.principal)} 元`,
      `还款方式：${methodName(form.method)}`,
      rateText(form.annualRate, form.rateMode),
      `首月/每月：${money(primaryPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`,
      `还款总额：${money(result.totalPayment)} 元`
    ]).join('\n')

    return {
      principal: money(result.principal),
      primaryPayment: money(primaryPayment),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      schedulePreview: schedulePreview(result.schedule, this.data.scheduleStartYm),
      copyText
    }
  },

  buildActualResult() {
    const form = this.data.actualForm
    const principal = amount(form.principal, form.unit)
    const upfrontFee = amount(form.upfrontFee, form.unit)
    const termMonths = normalizeMonths(form.months)
    const monthlyPayment = form.inputMode === 'interest'
      ? (principal + amount(form.totalInterest, form.unit)) / termMonths
      : loan.toNumber(form.monthlyPayment)
    const claimedMonthlyRate = asMonthlyRatePercent(form.claimedMonthlyRate, form.claimedRateMode)
    const result = loan.calcActualRate(principal, monthlyPayment, termMonths, claimedMonthlyRate, upfrontFee)
    const copyText = this.loanContextLines().concat([
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
    ]).join('\n')

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
    const copyText = this.loanContextLines().concat([
      `平息${rateText(form.monthlyFlatRate, form.rateMode)}`,
      `折算月费率：${percent(result.flatMonthlyRate, 4)}`,
      `月供：${money(result.monthlyPayment)} 元`,
      `真实月利率：${percent(result.actualMonthlyRate, 4)}`,
      `真实复利年化：${percent(result.actualAnnualEffectiveRate, 2)}`,
      `总利息：${money(result.totalInterest)} 元`
    ]).join('\n')

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

  buildBalloonResult() {
    const form = this.data.balloonForm
    const principal = amount(form.principal, form.unit)
    const balloonAmount = form.balloonRatio
      ? principal * loan.toNumber(form.balloonRatio) / 100
      : amount(form.balloonAmount, form.unit)
    const annualRate = asAnnualRate(form.annualRate, form.rateMode)
    const result = loan.calcBalloonLoan(principal, annualRate, form.months, balloonAmount)
    const normal = loan.calcEqualInstallment(principal, annualRate, form.months)
    const copyText = this.loanContextLines().concat([
      `贷款本金：${money(result.principal)} 元`,
      `尾款：${money(result.balloonAmount)} 元`,
      rateText(form.annualRate, form.rateMode),
      `月供：${money(result.monthlyPayment)} 元`,
      `末期还款(含尾款)：${money(result.lastPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`,
      `对比等额本息：月供 ${money(normal.monthlyPayment)} 元 / 总利息 ${money(normal.totalInterest)} 元`
    ]).join('\n')

    return {
      monthlyPayment: money(result.monthlyPayment),
      balloonAmount: money(result.balloonAmount),
      lastPayment: money(result.lastPayment),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      normalMonthly: money(normal.monthlyPayment),
      normalInterest: money(normal.totalInterest),
      schedulePreview: schedulePreview(result.schedule, this.data.scheduleStartYm),
      copyText
    }
  },

  buildRtoResult() {
    const form = this.data.rtoForm
    const carPrice = amount(form.carPrice, form.unit)
    const downPayment = amount(form.downPayment, form.unit)
    const buyout = amount(form.buyout, form.unit)
    const termMonths = normalizeMonths(form.months)

    if (form.mode === 'pricing') {
      const pricing = loan.calcRentPricing(carPrice, downPayment, termMonths, buyout, loan.toNumber(form.targetAnnualRate))
      const copyText = this.loanContextLines().concat([
        '租金方案',
        `首付/保证金：${money(downPayment)} 元`,
        `月租：${money(pricing.monthlyRent)} 元 × ${termMonths} 期`,
        `期满尾款：${money(buyout)} 元`,
        `总费用：${money(pricing.totalCost)} 元`
      ]).join('\n')
      return {
        mode: 'pricing',
        monthlyRent: money(pricing.monthlyRent),
        totalCost: money(pricing.totalCost),
        premiumOverCash: money(pricing.premiumOverCash),
        copyText
      }
    }

    const rto = loan.calcRentToOwn(carPrice, downPayment, loan.toNumber(form.monthlyRent), termMonths, buyout)
    const bankRate = loan.toNumber(form.bankAnnualRate)
    let bankCompare = ''
    if (bankRate > 0 && carPrice > downPayment) {
      const bank = loan.calcEqualInstallment(carPrice - downPayment, bankRate, termMonths)
      bankCompare = money(rto.totalCost - (bank.totalPayment + downPayment))
    }
    const copyText = this.loanContextLines().concat([
      '租金测算',
      `首付/保证金：${money(downPayment)} 元，月租 ${money(rto.monthlyRent)} 元 × ${termMonths} 期，尾款 ${money(buyout)} 元`,
      `总费用：${money(rto.totalCost)} 元`,
      carPrice > 0 ? `比一次性买车多花：${money(rto.premiumOverCash)} 元` : '',
      rto.hasImpliedRate ? `隐含月利率：${percent(rto.impliedMonthlyRate, 4)}，隐含复利年化：${percent(rto.impliedAnnualEffectiveRate, 2)}` : '',
      bankCompare ? `比普通车贷多花：${bankCompare} 元` : ''
    ]).filter(Boolean).join('\n')

    return {
      mode: 'analyze',
      totalCost: money(rto.totalCost),
      premiumOverCash: money(rto.premiumOverCash),
      impliedMonthlyRate: percent(rto.impliedMonthlyRate, 4),
      impliedAnnualNominalRate: percent(rto.impliedAnnualNominalRate, 2),
      impliedAnnualEffectiveRate: percent(rto.impliedAnnualEffectiveRate, 2),
      bankCompare,
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
      form.reduceMode,
      form.penaltyMode === 'percent' ? loan.toNumber(form.penaltyPercent) : 0,
      form.penaltyMode === 'amount' ? amount(form.penaltyAmount, form.unit) : 0
    )
    const copyText = this.loanContextLines().concat([
      `剩余本金：${money(result.remainingBalance)} 元`,
      `提前还款后本金：${money(result.afterPrepayBalance)} 元`,
      `节省利息：${money(result.interestSaved)} 元`,
      `违约金：${money(result.penalty)} 元`,
      `净省(扣违约金)：${money(result.netSaved)} 元`,
      `原剩余期数：${result.oldRemainingMonths} 期`,
      `新剩余期数：${result.newRemainingMonths} 期`,
      `新月供：${money(result.newMonthlyPayment)} 元`
    ]).join('\n')

    return {
      remainingBalance: money(result.remainingBalance),
      afterPrepayBalance: money(result.afterPrepayBalance),
      oldRemainingInterest: money(result.oldRemainingInterest),
      newRemainingInterest: money(result.newRemainingInterest),
      interestSaved: money(result.interestSaved),
      penalty: money(result.penalty),
      netSaved: money(result.netSaved),
      netSavedNegative: result.netSaved < 0,
      oldRemainingMonths: result.oldRemainingMonths,
      newRemainingMonths: result.newRemainingMonths,
      oldMonthlyPayment: money(result.oldMonthlyPayment),
      newMonthlyPayment: money(result.newMonthlyPayment),
      schedulePreview: schedulePreview(result.schedule, this.data.scheduleStartYm),
      copyText
    }
  }
})
