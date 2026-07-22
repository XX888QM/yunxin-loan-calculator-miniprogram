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
  return (schedule || []).filter(function (row) {
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

function actualStructureName(structure) {
  if (structure === 'balloon') return '尾款贷'
  if (structure === 'interestOnly') return '先息后本'
  return '等额月供'
}

function rateLabel(mode) {
  return mode === 'monthly' ? '月利率' : '年化'
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

function claimedRateText(value, mode) {
  return `对外${mode === 'monthly' ? '月息' : '年化'}：${value || 0}%`
}

function amount(value, unit) {
  return loan.toNumber(value) * (unit === 'wan' ? 10000 : 1)
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

function rawNumber(value) {
  if (isBlank(value)) return NaN
  return Number(String(value).replace(/,/g, '').trim())
}

function editableNumber(value) {
  if (!Number.isFinite(value)) return ''
  const rounded = loan.round(value, 8)
  return String(rounded)
}

function convertUnitValue(value, fromUnit, toUnit) {
  if (isBlank(value) || fromUnit === toUnit) return value
  const n = rawNumber(value)
  if (!Number.isFinite(n)) return value
  return editableNumber(fromUnit === 'yuan' ? n / 10000 : n * 10000)
}

const UNIT_AMOUNT_FIELDS = {
  paymentForm: ['principal', 'carPrice', 'downPayment'],
  comboForm: ['commercialPrincipal', 'fundPrincipal'],
  actualForm: ['principal', 'totalInterest', 'upfrontFee', 'balloonAmount'],
  flatForm: ['principal'],
  balloonForm: ['principal', 'balloonAmount'],
  prepayForm: ['principal', 'prepayAmount', 'penaltyAmount', 'currentBalance']
}

function unitSwitchPatch(formName, form, newUnit) {
  const oldUnit = form.unit || 'yuan'
  const patch = { [`${formName}.unit`]: newUnit }
  ;(UNIT_AMOUNT_FIELDS[formName] || []).forEach(function (field) {
    patch[`${formName}.${field}`] = convertUnitValue(form[field], oldUnit, newUnit)
  })
  return patch
}

function parseNumberField(value, label, options) {
  options = options || {}
  if (isBlank(value)) {
    return { valid: false, error: `请输入${label}` }
  }
  const n = rawNumber(value)
  if (!Number.isFinite(n)) {
    return { valid: false, error: `${label}格式不正确` }
  }
  if (options.integer && !Number.isInteger(n)) {
    return { valid: false, error: `${label}必须是整数` }
  }
  if (options.min !== undefined && n < options.min) {
    return { valid: false, error: `${label}不能小于${options.min}` }
  }
  if (options.max !== undefined && n > options.max) {
    return { valid: false, error: `${label}不能大于${options.max}` }
  }
  if (options.positive && n <= 0) {
    return { valid: false, error: `${label}必须大于0` }
  }
  return { valid: true, value: n }
}

function parseOptionalNumber(value, label, options) {
  if (isBlank(value)) return { valid: true, empty: true, value: 0 }
  return parseNumberField(value, label, options)
}

function invalidCopy(context, error) {
  return context.concat([`无法计算：${error}`]).join('\n')
}

function engineErrorText(error) {
  if (error === 'invalidNetPrincipal') return '前置费用必须小于贷款本金'
  if (error === 'insufficientCashflow') return '还款现金流不足，无法反推出非负利率'
  if (error === 'invalidPrincipal') return '贷款本金必须大于0'
  if (error === 'invalidCashflow') return '请输入完整还款现金流'
  if (error === 'rateOutOfRange') return '当前现金流的利率超出可计算范围'
  return '当前输入无法完成计算'
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
      paymentStructure: 'equalPayment',
      balloonAmount: '',
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
    prepayForm: {
      principal: '',
      months: '',
      annualRate: '',
      rateMode: 'annual',
      paidMonths: '',
      prepayAmount: '',
      method: 'equalInstallment',
      currentBalance: '',
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
      const patch = Object.assign({
        activeTool,
        loanType: 'home',
        termOptionList: TERM_OPTIONS.home,
        toolList: TOOL_OPTIONS.home
      }, unitSwitchPatch('paymentForm', this.data.paymentForm, 'wan'))
      this.setData(patch, () => this.recalculate())
      return
    }

    this.setData({ activeTool }, () => this.recalculate())
  },

  onInput(event) {
    const form = event.currentTarget.dataset.form
    const field = event.currentTarget.dataset.field
    const patch = { [`${form}.${field}`]: event.detail.value }
    if (field === 'downPayment') patch[`${form}.downRatio`] = ''
    if (field === 'balloonAmount' && form === 'balloonForm') patch[`${form}.balloonRatio`] = ''
    this.setData(patch, () => this.recalculate())
  },

  setFormValue(event) {
    const form = event.currentTarget.dataset.form
    const field = event.currentTarget.dataset.field
    const value = event.currentTarget.dataset.value
    let patch

    if (field === 'unit') {
      patch = unitSwitchPatch(form, this.data[form], value)
    } else {
      patch = { [`${form}.${field}`]: value }
    }

    if (field === 'downRatio') patch[`${form}.downPayment`] = ''
    if (field === 'balloonRatio') patch[`${form}.balloonAmount`] = ''
    if (form === 'actualForm' && field === 'paymentStructure' && value !== 'equalPayment') {
      patch['actualForm.inputMode'] = 'payment'
    }
    if (form === 'actualForm' && field === 'inputMode' && value === 'interest') {
      patch['actualForm.paymentStructure'] = 'equalPayment'
    }

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
    const desiredUnit = loanType === 'home' ? 'wan' : 'yuan'
    const patch = Object.assign({
      loanType,
      termOptionList: TERM_OPTIONS[loanType] || TERM_OPTIONS.car,
      toolList,
      activeTool
    }, unitSwitchPatch('paymentForm', this.data.paymentForm, desiredUnit))
    this.setData(patch, () => this.recalculate())
  },

  loanContextLines() {
    return [
      `贷款类型：${optionLabel(LOAN_TYPES, this.data.loanType)}`
    ]
  },

  copySummary() {
    const activeTool = this.data.activeTool
    const results = {
      payment: this.data.paymentResult,
      combo: this.data.comboResult,
      budget: this.data.budgetResult,
      actual: this.data.actualResult,
      flat: this.data.flatResult,
      balloon: this.data.balloonResult,
      prepay: this.data.prepayResult
    }
    const current = results[activeTool] || {}
    if (current.valid === false) {
      wx.showToast({ title: current.error || '请先完成输入', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: current.copyText || '' })
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
    const tools = {
      payment: { builder: 'buildPaymentResult', result: 'paymentResult' },
      combo: { builder: 'buildComboResult', result: 'comboResult' },
      budget: { builder: 'buildBudgetResult', result: 'budgetResult' },
      actual: { builder: 'buildActualResult', result: 'actualResult' },
      flat: { builder: 'buildFlatResult', result: 'flatResult' },
      balloon: { builder: 'buildBalloonResult', result: 'balloonResult' },
      prepay: { builder: 'buildPrepayResult', result: 'prepayResult' }
    }
    const activeTool = this.data.activeTool
    const config = tools[activeTool] || tools.payment
    const result = this[config.builder]()
    this.setData({
      [config.result]: result,
      activeSchedulePreview: result.schedulePreview || []
    })
  },

  buildPaymentResult() {
    const form = this.data.paymentForm
    const context = this.loanContextLines()
    const primaryLabel = form.method === 'equalPrincipal' ? '首月月供' : '每月月供'
    const invalid = (error) => ({
      valid: false,
      error,
      primaryLabel,
      primaryPayment: '—',
      loanAmount: '—',
      lastPayment: '—',
      totalInterest: '—',
      totalPayment: '—',
      monthlyRate: '—',
      schedulePreview: [],
      copyText: invalidCopy(context, error)
    })

    const maxMonths = this.data.loanType === 'car' ? 120 : 600
    const term = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: maxMonths })
    if (!term.valid) return invalid(term.error)
    const rate = parseNumberField(form.annualRate, rateLabel(form.rateMode), { min: 0 })
    if (!rate.valid) return invalid(rate.error)

    let principal
    let carPrice = 0
    let downPayment = 0
    if (form.inputMode === 'price') {
      const price = parseNumberField(form.carPrice, this.data.loanType === 'car' ? '车价' : '房价', { positive: true })
      if (!price.valid) return invalid(price.error)
      carPrice = amount(form.carPrice, form.unit)
      if (form.downRatio) {
        const ratio = parseNumberField(form.downRatio, '首付比例', { min: 0, max: 100 })
        if (!ratio.valid) return invalid(ratio.error)
        downPayment = carPrice * ratio.value / 100
      } else {
        const customDown = parseOptionalNumber(form.downPayment, '首付金额', { min: 0 })
        if (!customDown.valid) return invalid(customDown.error)
        downPayment = amount(customDown.empty ? 0 : form.downPayment, form.unit)
      }
      if (downPayment > carPrice) return invalid('首付不能超过总价')
      principal = carPrice - downPayment
      if (principal <= 0) return invalid('贷款本金必须大于0')
    } else {
      const principalField = parseNumberField(form.principal, '贷款本金', { positive: true })
      if (!principalField.valid) return invalid(principalField.error)
      principal = amount(form.principal, form.unit)
    }

    const annualRate = asAnnualRate(form.annualRate, form.rateMode)
    const result = loan.calculateByMethod(principal, annualRate, term.value, form.method)
    const primaryPayment = form.method === 'equalPrincipal' ? result.firstPayment : result.monthlyPayment
    const priceLines = form.inputMode === 'price'
      ? [`${this.data.loanType === 'car' ? '车价' : '房价'}：${money(carPrice)} 元`, `首付：${money(downPayment)} 元`]
      : []
    const copyText = context.concat(priceLines, [
      `贷款本金：${money(result.principal)} 元`,
      `还款方式：${methodName(form.method)}`,
      rateText(form.annualRate, form.rateMode),
      `${primaryLabel}：${money(primaryPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`,
      `还款总额：${money(result.totalPayment)} 元`
    ]).join('\n')

    return {
      valid: true,
      error: '',
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
    const context = this.loanContextLines()
    const invalid = (error) => ({
      valid: false,
      error,
      primaryPayment: '—',
      lastPayment: '—',
      totalInterest: '—',
      totalPayment: '—',
      schedulePreview: [],
      copyText: invalidCopy(context, error)
    })

    const years = parseNumberField(form.years, '贷款年限', { integer: true, min: 1, max: 50 })
    if (!years.valid) return invalid(years.error)
    const commercial = parseOptionalNumber(form.commercialPrincipal, '商贷本金', { min: 0 })
    const fund = parseOptionalNumber(form.fundPrincipal, '公积金本金', { min: 0 })
    if (!commercial.valid) return invalid(commercial.error)
    if (!fund.valid) return invalid(fund.error)
    const commercialPrincipal = amount(commercial.empty ? 0 : form.commercialPrincipal, form.unit)
    const fundPrincipal = amount(fund.empty ? 0 : form.fundPrincipal, form.unit)
    if (commercialPrincipal <= 0 && fundPrincipal <= 0) return invalid('请输入商贷本金或公积金本金')

    if (commercialPrincipal > 0) {
      const commercialRateField = parseNumberField(form.commercialRate, '商贷利率', { min: 0 })
      if (!commercialRateField.valid) return invalid(commercialRateField.error)
    }
    if (fundPrincipal > 0) {
      const fundRateField = parseNumberField(form.fundRate, '公积金利率', { min: 0 })
      if (!fundRateField.valid) return invalid(fundRateField.error)
    }

    const months = years.value * 12
    const commercialRate = asAnnualRate(form.commercialRate, form.rateMode)
    const fundRate = asAnnualRate(form.fundRate, form.rateMode)
    const result = loan.calcCompositeLoan(
      commercialPrincipal,
      commercialRate,
      fundPrincipal,
      fundRate,
      months,
      form.method
    )
    const primaryPayment = form.method === 'equalPrincipal' ? result.firstPayment : result.monthlyPayment
    const copyText = context.concat([
      `组合贷本金：${money(result.principal)} 元`,
      `商贷：${money(commercialPrincipal)} 元，${rateText(form.commercialRate, form.rateMode)}`,
      `公积金：${money(fundPrincipal)} 元，${rateText(form.fundRate, form.rateMode)}`,
      `首月/每月：${money(primaryPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`
    ]).join('\n')

    return {
      valid: true,
      error: '',
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
    const context = this.loanContextLines()
    const primaryLabel = form.method === 'equalPrincipal' ? '首月最高月供' : '每月月供'
    const invalid = (error) => ({
      valid: false,
      error,
      principal: '—',
      primaryLabel,
      primaryPayment: '—',
      totalInterest: '—',
      totalPayment: '—',
      schedulePreview: [],
      copyText: invalidCopy(context, error)
    })

    const budget = parseNumberField(form.monthlyBudget, '月供预算', { positive: true })
    if (!budget.valid) return invalid(budget.error)
    const term = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: 600 })
    if (!term.valid) return invalid(term.error)
    const rate = parseNumberField(form.annualRate, rateLabel(form.rateMode), { min: 0 })
    if (!rate.valid) return invalid(rate.error)

    const annualRate = asAnnualRate(form.annualRate, form.rateMode)
    const result = loan.calcAffordableLoan(budget.value, annualRate, term.value, form.method)
    const primaryPayment = form.method === 'equalPrincipal' ? result.firstPayment : result.monthlyPayment
    const copyText = context.concat([
      `${primaryLabel}预算：${money(budget.value)} 元`,
      `可贷本金：${money(result.principal)} 元`,
      `还款方式：${methodName(form.method)}`,
      rateText(form.annualRate, form.rateMode),
      `${primaryLabel}：${money(primaryPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`,
      `还款总额：${money(result.totalPayment)} 元`
    ]).join('\n')

    return {
      valid: true,
      error: '',
      principal: money(result.principal),
      primaryLabel,
      primaryPayment: money(primaryPayment),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      schedulePreview: schedulePreview(result.schedule, this.data.scheduleStartYm),
      copyText
    }
  },

  buildActualResult() {
    const form = this.data.actualForm
    const paymentStructure = form.paymentStructure || 'equalPayment'
    const context = this.loanContextLines()
    const invalid = (error) => ({
      valid: false,
      error,
      monthlyRate: '—',
      annualNominalRate: '—',
      annualEffectiveRate: '—',
      feeAdjustedMonthlyRate: '—',
      feeAdjustedAnnualNominalRate: '—',
      feeAdjustedAnnualEffectiveRate: '—',
      totalInterest: '—',
      totalPayment: '—',
      totalFinancingCost: '—',
      claimedMultiple: '—',
      claimedMonthlyGap: '—',
      comparisonLabelPrefix: '',
      copyText: invalidCopy(context, error)
    })

    const principalField = parseNumberField(form.principal, '贷款本金', { positive: true })
    if (!principalField.valid) return invalid(principalField.error)
    const term = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: 600 })
    if (!term.valid) return invalid(term.error)
    const upfront = parseOptionalNumber(form.upfrontFee, '前置费用', { min: 0 })
    if (!upfront.valid) return invalid(upfront.error)
    const claimed = parseOptionalNumber(form.claimedMonthlyRate, '对外利率', { min: 0 })
    if (!claimed.valid) return invalid(claimed.error)

    const principal = amount(form.principal, form.unit)
    const upfrontFee = amount(upfront.empty ? 0 : form.upfrontFee, form.unit)
    if (upfrontFee >= principal && upfrontFee > 0) return invalid('前置费用必须小于贷款本金')

    let monthlyPayment
    let options = {}
    if (form.inputMode === 'interest') {
      if (paymentStructure !== 'equalPayment') return invalid('只知总利息仅适用于等额月供')
      const totalInterestField = parseNumberField(form.totalInterest, '总利息', { min: 0 })
      if (!totalInterestField.valid) return invalid(totalInterestField.error)
      monthlyPayment = (principal + amount(form.totalInterest, form.unit)) / term.value
    } else {
      const paymentField = parseNumberField(
        form.monthlyPayment,
        paymentStructure === 'interestOnly' ? '每期利息' : '实际月供',
        { min: 0 }
      )
      if (!paymentField.valid) return invalid(paymentField.error)
      monthlyPayment = paymentField.value

      if (paymentStructure === 'balloon') {
        const balloon = parseNumberField(form.balloonAmount, '末期尾款', { min: 0 })
        if (!balloon.valid) return invalid(balloon.error)
        const balloonAmount = amount(form.balloonAmount, form.unit)
        if (balloonAmount > principal) return invalid('末期尾款不能超过贷款本金')
        options.balloon = balloonAmount
      } else if (paymentStructure === 'interestOnly') {
        options.cashflows = Array(term.value).fill(monthlyPayment)
        options.cashflows[term.value - 1] += principal
      }
    }

    const claimedMonthlyRate = claimed.empty
      ? 0
      : asMonthlyRatePercent(form.claimedMonthlyRate, form.claimedRateMode)
    const result = loan.calcActualRate(
      principal,
      monthlyPayment,
      term.value,
      claimedMonthlyRate,
      upfrontFee,
      options
    )
    if (!result.valid) return invalid(engineErrorText(result.error))

    const claimedFilled = !claimed.empty
    const comparisonLabelPrefix = upfrontFee > 0 ? '含费' : ''
    const paymentLine = paymentStructure === 'interestOnly'
      ? `每期利息：${money(monthlyPayment)} 元，末期另还本金 ${money(principal)} 元`
      : `${form.inputMode === 'interest' ? '折算月供' : '月供'}：${money(monthlyPayment)} 元`
    const structureLines = paymentStructure === 'balloon'
      ? [`末期尾款：${money(options.balloon)} 元`]
      : []
    const copyText = context.concat([
      `本金：${money(result.principal)} 元`,
      `还款结构：${actualStructureName(paymentStructure)}`,
      paymentLine
    ], structureLines, [
      `前置费用：${money(result.upfrontFee)} 元`,
      claimedFilled ? claimedRateText(form.claimedMonthlyRate, form.claimedRateMode) : '对外利率：未填写',
      `真实月利率：${percent(result.monthlyRate, 4)}`,
      `含费月利率：${percent(result.feeAdjustedMonthlyRate, 4)}`,
      `名义年化：${percent(result.annualNominalRate, 2)}`,
      `复利年化：${percent(result.annualEffectiveRate, 2)}`,
      `含费名义年化：${percent(result.feeAdjustedAnnualNominalRate, 2)}`,
      `含费复利年化：${percent(result.feeAdjustedAnnualEffectiveRate, 2)}`,
      `总利息：${money(result.totalInterest)} 元`,
      `总融资成本：${money(result.totalFinancingCost)} 元`
    ]).join('\n')

    return {
      valid: true,
      error: '',
      monthlyRate: percent(result.monthlyRate, 4),
      annualNominalRate: percent(result.annualNominalRate, 2),
      annualEffectiveRate: percent(result.annualEffectiveRate, 2),
      feeAdjustedMonthlyRate: percent(result.feeAdjustedMonthlyRate, 4),
      feeAdjustedAnnualNominalRate: percent(result.feeAdjustedAnnualNominalRate, 2),
      feeAdjustedAnnualEffectiveRate: percent(result.feeAdjustedAnnualEffectiveRate, 2),
      totalInterest: money(result.totalInterest),
      totalPayment: money(result.totalPayment),
      totalFinancingCost: money(result.totalFinancingCost),
      claimedMultiple: claimedFilled ? loan.round(result.claimedMultiple, 2) + ' 倍' : '未填写',
      claimedMonthlyGap: claimedFilled ? percent(result.claimedMonthlyGap, 4) : '未填写',
      comparisonLabelPrefix,
      copyText
    }
  },

  buildFlatResult() {
    const form = this.data.flatForm
    const context = this.loanContextLines()
    const invalid = (error) => ({
      valid: false,
      error,
      monthlyPayment: '—',
      totalInterest: '—',
      totalPayment: '—',
      actualMonthlyRate: '—',
      actualAnnualNominalRate: '—',
      actualAnnualEffectiveRate: '—',
      copyText: invalidCopy(context, error)
    })

    const principalField = parseNumberField(form.principal, '贷款本金', { positive: true })
    if (!principalField.valid) return invalid(principalField.error)
    const term = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: 120 })
    if (!term.valid) return invalid(term.error)
    const rate = parseNumberField(form.monthlyFlatRate, '平息费率', { min: 0 })
    if (!rate.valid) return invalid(rate.error)

    const monthlyFlatRate = asMonthlyFlatRate(form.monthlyFlatRate, form.rateMode)
    const result = loan.calcFlatMonthly(amount(form.principal, form.unit), monthlyFlatRate, term.value)
    if (!result.valid) return invalid(engineErrorText(result.error))
    const copyText = context.concat([
      `${form.rateMode === 'annual' ? '平息年化' : '平息月费率'}：${form.monthlyFlatRate || 0}%`,
      `折算平息月费率：${percent(result.flatMonthlyRate, 4)}`,
      `月供：${money(result.monthlyPayment)} 元`,
      `真实月利率：${percent(result.actualMonthlyRate, 4)}`,
      `名义年化：${percent(result.actualAnnualNominalRate, 2)}`,
      `复利年化：${percent(result.actualAnnualEffectiveRate, 2)}`,
      `总利息：${money(result.totalInterest)} 元`
    ]).join('\n')

    return {
      valid: true,
      error: '',
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
    const context = this.loanContextLines()
    const invalid = (error) => ({
      valid: false,
      error,
      monthlyPayment: '—',
      balloonAmount: '—',
      lastPayment: '—',
      totalInterest: '—',
      totalPayment: '—',
      normalMonthly: '—',
      normalInterest: '—',
      schedulePreview: [],
      copyText: invalidCopy(context, error)
    })

    const principalField = parseNumberField(form.principal, '贷款本金', { positive: true })
    if (!principalField.valid) return invalid(principalField.error)
    const term = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: 120 })
    if (!term.valid) return invalid(term.error)
    const rate = parseNumberField(form.annualRate, rateLabel(form.rateMode), { min: 0 })
    if (!rate.valid) return invalid(rate.error)

    const principal = amount(form.principal, form.unit)
    let balloonAmount
    if (form.balloonRatio) {
      const ratio = parseNumberField(form.balloonRatio, '尾款比例', { min: 0, max: 100 })
      if (!ratio.valid) return invalid(ratio.error)
      balloonAmount = principal * ratio.value / 100
    } else {
      const balloon = parseOptionalNumber(form.balloonAmount, '尾款金额', { min: 0 })
      if (!balloon.valid) return invalid(balloon.error)
      balloonAmount = amount(balloon.empty ? 0 : form.balloonAmount, form.unit)
    }
    if (balloonAmount > principal) return invalid('尾款不能超过贷款本金')

    const annualRate = asAnnualRate(form.annualRate, form.rateMode)
    const result = loan.calcBalloonLoan(principal, annualRate, term.value, balloonAmount)
    const normal = loan.calcEqualInstallment(principal, annualRate, term.value)
    const copyText = context.concat([
      `贷款本金：${money(result.principal)} 元`,
      `尾款：${money(result.balloonAmount)} 元`,
      rateText(form.annualRate, form.rateMode),
      `月供：${money(result.monthlyPayment)} 元`,
      `末期还款(含尾款)：${money(result.lastPayment)} 元`,
      `总利息：${money(result.totalInterest)} 元`,
      `对比等额本息：月供 ${money(normal.monthlyPayment)} 元 / 总利息 ${money(normal.totalInterest)} 元`
    ]).join('\n')

    return {
      valid: true,
      error: '',
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

  buildPrepayResult() {
    const form = this.data.prepayForm
    const context = this.loanContextLines()
    const invalid = (error) => ({
      valid: false,
      error,
      remainingBalance: '—',
      afterPrepayBalance: '—',
      oldRemainingInterest: '—',
      newRemainingInterest: '—',
      interestSaved: '—',
      penalty: '—',
      netSaved: '—',
      netSavedNegative: false,
      oldRemainingMonths: '—',
      newRemainingMonths: '—',
      oldMonthlyPayment: '—',
      newMonthlyPayment: '—',
      schedulePreview: [],
      copyText: invalidCopy(context, error)
    })

    const principalField = parseNumberField(form.principal, '贷款本金', { positive: true })
    if (!principalField.valid) return invalid(principalField.error)
    const term = parseNumberField(form.months, '总期数', { integer: true, min: 1, max: 600 })
    if (!term.valid) return invalid(term.error)
    const rate = parseNumberField(form.annualRate, rateLabel(form.rateMode), { min: 0 })
    if (!rate.valid) return invalid(rate.error)
    const paid = parseNumberField(form.paidMonths, '已还期数', { integer: true, min: 0, max: term.value })
    if (!paid.valid) return invalid(paid.error)
    const prepay = parseNumberField(form.prepayAmount, '提前还款金额', { positive: true })
    if (!prepay.valid) return invalid(prepay.error)
    const currentBalanceField = parseOptionalNumber(form.currentBalance, '当前剩余本金', { positive: true })
    if (!currentBalanceField.valid) return invalid(currentBalanceField.error)
    const penaltyField = form.penaltyMode === 'amount'
      ? parseOptionalNumber(form.penaltyAmount, '违约金额', { min: 0 })
      : parseOptionalNumber(form.penaltyPercent, '违约金比例', { min: 0 })
    if (!penaltyField.valid) return invalid(penaltyField.error)

    const principal = amount(form.principal, form.unit)
    const currentBalance = currentBalanceField.empty
      ? undefined
      : amount(form.currentBalance, form.unit)
    if (currentBalance !== undefined && currentBalance > principal) return invalid('当前剩余本金不能超过原贷款本金')

    const annualRate = asAnnualRate(form.annualRate, form.rateMode)
    const result = loan.calcPrepayment(
      principal,
      annualRate,
      term.value,
      paid.value,
      amount(form.prepayAmount, form.unit),
      form.reduceMode,
      form.penaltyMode === 'percent' ? loan.toNumber(form.penaltyPercent) : 0,
      form.penaltyMode === 'amount' ? amount(form.penaltyAmount, form.unit) : 0,
      form.method,
      currentBalance
    )
    const copyText = context.concat([
      `原还款方式：${methodName(form.method)}`,
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
      valid: true,
      error: '',
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
