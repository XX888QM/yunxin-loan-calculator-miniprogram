const loan = require('../../utils/loan')
const pdf = require('../../utils/pdf')
const history = require('../../utils/history')

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
  prepayForm: [
    'principal', 'prepayAmount', 'penaltyAmount', 'currentBalance',
    'remainingPrincipal', 'prepayPrincipal', 'settlementInterest', 'penaltyValue'
  ],
  carCostForm: [
    'cashVehiclePrice', 'installmentVehiclePrice', 'discount', 'purchaseTax',
    'insurance', 'registrationFee', 'requiredOptions', 'purposeFunding',
    'totalRepayment', 'upfrontFee', 'periodicFee'
  ],
  lprForm: ['principal']
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
    // 空着还没填：提示，不是报错
    return { valid: false, error: `请输入${label}`, level: 'hint' }
  }
  const n = rawNumber(value)
  if (!Number.isFinite(n)) {
    return { valid: false, error: `${label}格式不正确`, level: 'error' }
  }
  if (options.integer && !Number.isInteger(n)) {
    return { valid: false, error: `${label}必须是整数`, level: 'error' }
  }
  if (options.min !== undefined && n < options.min) {
    return { valid: false, error: `${label}不能小于${options.min}`, level: 'error' }
  }
  if (options.max !== undefined && n > options.max) {
    return { valid: false, error: `${label}不能大于${options.max}`, level: 'error' }
  }
  if (options.positive && n <= 0) {
    return { valid: false, error: `${label}必须大于0`, level: 'error' }
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
  if (error === 'invalidMonths') return '还款期数不正确'
  if (error === 'invalidAnnualRate') return '合同利率不正确'
  if (error === 'invalidPurposeFunding') return '实际用于购车或购房的金额不正确'
  if (error === 'fundingExceedsLandedCost') return '贷款实际用途金额不能超过落地总价'
  if (error === 'invalidVehiclePrice') return '车辆价格必须大于0'
  if (error === 'invalidDiscount') return '优惠金额不能超过车辆价格'
  if (error === 'invalidTotalRepayment') return '合同总还款不能低于实际用于购车的贷款金额'
  if (error === 'invalidFinancingWithoutFunding') return '填写融资费用前，请先填写实际用于购车的贷款金额'
  if (error === 'invalidUpfrontFeePayment') return '请选择前置费用的支付方式'
  if (error === 'deductedFeeExceedsFundingGap') return '从放款中代扣的前置费用不能超过贷款金额与实际用途金额的差额'
  if (error === 'deductedFeeNotInContract') return '从放款中代扣的前置费用未计入合同总还款，请核对合同总还款金额'
  if (error === 'invalidRatePath') return 'LPR 情景参数不完整或顺序不正确'
  if (error === 'invalidSpreadBps') return 'LPR 加点数不正确'
  if (error === 'invalidRemainingPrincipal') return '当前剩余本金必须大于0'
  if (error === 'invalidRemainingMonths') return '剩余期数不正确'
  if (error === 'invalidPrepayPrincipal') return '提前归还本金必须大于0'
  if (error === 'prepayExceedsBalance') return '提前归还本金不能超过剩余本金'
  if (error === 'missingAccrualDate') return '请输入最近结息日和提前还款日，或改填账单应计利息'
  if (error === 'invalidAccrualDate') return '提前还款日不能早于最近结息日'
  if (error === 'invalidSettlementInterest') return '账单应计利息不正确'
  if (error === 'invalidPenalty' || error === 'invalidPenaltyType') return '违约金规则不正确'
  if (error === 'unsupportedLoanState') return '有逾期、欠款或跳期时，请以最新账单为准'
  if (error === 'unsupportedRatePath') return '浮动利率贷款请以最新还款计划为准，暂不能做账单/按日测算'
  if (error === 'unsupportedMethod') return '该还款结构暂不支持这项账单/按日测算'
  if (error === 'paymentInsufficient') return '当前月供不足以在剩余期数内还清，请核对账单'
  if (error === 'paymentTermMismatch') return '按当前自定义还款额会提前结清，与剩余期数不一致'
  if (error === 'unsupportedCustomPayment') return '当前还款方式不支持这类自定义还款额'
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
    { value: 'actual', label: '折算利率' },
    { value: 'flat', label: '平息换算' },
    { value: 'balloon', label: '尾款贷' },
    { value: 'carCost', label: '落地总价' }
  ],
  home: [
    { value: 'payment', label: '算月供' },
    { value: 'combo', label: '组合贷' },
    { value: 'budget', label: '反推本金' },
    { value: 'prepay', label: '提前还款' },
    { value: 'lpr', label: 'LPR情景' }
  ]
}

const SCHEDULE_PREVIEW_LIMIT = 12

const TOOL_HINTS = {
  payment: '算每月还多少、一共多少利息。',
  actual: '已有合同月供时，按还款现金流折算利率；销售报“月息”时也可用。',
  flat: '销售说“月息 0.xx%”且按原始本金全期计费时用这里。',
  balloon: '低月供加大尾款方案，可对比普通等额本息。',
  combo: '商贷+公积金一起算；两边默认同期限、同还款方式。',
  budget: '按每月最多能还多少，反推大概能贷多少；不等于审批额度。',
  prepay: '可先做快速估算；拿到剩余本金和账单应计利息后可做账单/按日估算。',
  carCost: '把全款价、分期价、税费、保险、必选装和融资费用一起摊开看。',
  lpr: '手动填合同加点和假设 LPR，查看重定价后的月供情景；不是实时利率查询。'
}

function buildSampleForms(loanType) {
  if (loanType === 'home') {
    return {
      paymentForm: {
        principal: '100', months: '360', annualRate: '3.1', rateMode: 'annual',
        method: 'equalInstallment', unit: 'wan', inputMode: 'loan',
        carPrice: '', downRatio: '', downPayment: ''
      },
      comboForm: {
        commercialPrincipal: '80', commercialRate: '3.45', fundPrincipal: '40', fundRate: '2.85',
        years: '30', rateMode: 'annual', method: 'equalInstallment', unit: 'wan'
      },
      budgetForm: {
        monthlyBudget: '8000', months: '360', annualRate: '3.1',
        rateMode: 'annual', method: 'equalInstallment'
      },
      prepayForm: {
        principal: '100', months: '360', annualRate: '3.1', rateMode: 'annual',
        paidMonths: '36', prepayAmount: '10', method: 'equalInstallment',
        currentBalance: '', reduceMode: 'term', penaltyMode: 'percent',
        penaltyPercent: '', penaltyAmount: '', unit: 'wan', mode: 'quick',
        remainingPrincipal: '', remainingMonths: '', prepayPrincipal: '',
        settlementMode: 'statement', settlementInterest: '', lastSettledDate: '',
        prepayDate: '', dayCount: 'ACT_365F', penaltyType: 'percentOfPrepay', penaltyValue: ''
      },
      lprForm: {
        principal: '100', months: '360', initialLpr: '3.6', spreadBps: '-30',
        repriceMonth: '13', scenarioLpr: '3.3', method: 'equalInstallment', unit: 'wan'
      }
    }
  }
  return {
    paymentForm: {
      principal: '200000', months: '36', annualRate: '13.14', rateMode: 'annual',
      method: 'equalInstallment', unit: 'yuan', inputMode: 'loan',
      carPrice: '', downRatio: '', downPayment: ''
    },
    actualForm: {
      principal: '200000', months: '36', monthlyPayment: '6750', totalInterest: '',
      inputMode: 'payment', paymentStructure: 'equalPayment', balloonAmount: '',
      upfrontFee: '', claimedMonthlyRate: '0.59', claimedRateMode: 'monthly', unit: 'yuan'
    },
    flatForm: {
      principal: '200000', months: '36', monthlyFlatRate: '0.59',
      rateMode: 'monthly', unit: 'yuan'
    },
    balloonForm: {
      principal: '200000', months: '36', annualRate: '13.14', rateMode: 'annual',
      balloonRatio: '40', balloonAmount: '', unit: 'yuan'
    },
    carCostForm: {
      unit: 'yuan', cashVehiclePrice: '200000', installmentVehiclePrice: '205000',
      discount: '5000', purchaseTax: '10000', insurance: '6000', registrationFee: '1000',
      requiredOptions: '3000', purposeFunding: '150000', totalRepayment: '166000',
      upfrontFee: '3000', periodicFee: '0', upfrontFeePayment: 'deducted'
    }
  }
}

function amountHintText(yuanValue, unit) {
  if (!Number.isFinite(yuanValue) || yuanValue < 0) return ''
  if (unit === 'wan') return editableNumber(yuanValue / 10000) + ' 万'
  return money(yuanValue) + ' 元'
}

function downRatioAmountHint(form) {
  if (!form || form.inputMode !== 'price' || !form.downRatio || isBlank(form.carPrice)) return ''
  const price = amount(form.carPrice, form.unit)
  if (!(price > 0)) return ''
  const down = price * loan.toNumber(form.downRatio) / 100
  return '按比例约 ' + amountHintText(down, form.unit)
}

function balloonRatioAmountHint(form) {
  if (!form || !form.balloonRatio || isBlank(form.principal)) return ''
  const principal = amount(form.principal, form.unit)
  if (!(principal > 0)) return ''
  const balloon = principal * loan.toNumber(form.balloonRatio) / 100
  return '按比例约 ' + amountHintText(balloon, form.unit)
}

function sliceScheduleDisplay(rows) {
  const list = rows || []
  return {
    full: list,
    display: list.slice(0, SCHEDULE_PREVIEW_LIMIT),
    total: list.length,
    truncated: list.length > SCHEDULE_PREVIEW_LIMIT
  }
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

function quotePurposeLabel(value) {
  return value === 'home' ? '买房' : '买车'
}

function formatHistoryTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  const pad = function (n) { return n < 10 ? '0' + n : String(n) }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function defaultQuoteMonths(purpose) {
  if (purpose === 'home') return '360'
  if (purpose === 'car') return '36'
  return ''
}

function createQuoteForm(purpose) {
  const safePurpose = purpose === 'car' || purpose === 'home' ? purpose : ''
  return {
    purpose: safePurpose,
    principal: '',
    months: defaultQuoteMonths(safePurpose),
    structure: 'equalPayment',
    monthlyPayment: '',
    balloonAmount: '',
    feeStatus: 'unknown',
    upfrontFee: '',
    periodicFee: '',
    claimedRate: '',
    claimedRateMode: 'annual',
    prepayKnown: ''
  }
}

function signedNumberField(value, label, options) {
  options = options || {}
  if (isBlank(value)) return { valid: false, error: `请输入${label}`, level: 'hint' }
  const n = rawNumber(value)
  if (!Number.isFinite(n)) return { valid: false, error: `${label}格式不正确`, level: 'error' }
  if (options.integer && !Number.isInteger(n)) return { valid: false, error: `${label}必须是整数`, level: 'error' }
  if (options.min !== undefined && n < options.min) return { valid: false, error: `${label}不能小于${options.min}`, level: 'error' }
  if (options.max !== undefined && n > options.max) return { valid: false, error: `${label}不能大于${options.max}`, level: 'error' }
  return { valid: true, value: n }
}

Page({
  data: {
    appVersion: '',
    screenMode: 'home',
    quoteStep: 1,
    quoteSelectedPurpose: '',
    quoteForm: createQuoteForm(),
    quoteResult: {},
    quoteError: '',
    quoteErrorStep: 0,
    quoteHistory: [],
    quoteComparisons: [],
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
      mode: 'quick',
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
      remainingPrincipal: '',
      remainingMonths: '',
      prepayPrincipal: '',
      settlementMode: 'statement',
      settlementInterest: '',
      lastSettledDate: '',
      prepayDate: '',
      dayCount: 'ACT_365F',
      penaltyType: 'percentOfPrepay',
      penaltyValue: '',
      unit: 'wan'
    },
    carCostForm: {
      unit: 'yuan',
      cashVehiclePrice: '',
      installmentVehiclePrice: '',
      discount: '',
      purchaseTax: '',
      insurance: '',
      registrationFee: '',
      requiredOptions: '',
      purposeFunding: '',
      totalRepayment: '',
      upfrontFee: '',
      periodicFee: '',
      upfrontFeePayment: 'deducted'
    },
    lprForm: {
      principal: '',
      months: '',
      initialLpr: '',
      spreadBps: '',
      repriceMonth: '',
      scenarioLpr: '',
      method: 'equalInstallment',
      unit: 'wan'
    },
    paymentResult: {},
    comboResult: {},
    budgetResult: {},
    actualResult: {},
    flatResult: {},
    balloonResult: {},
    prepayResult: {},
    carCostResult: {},
    lprResult: {},
    scheduleStartYm: '',
    activeSchedulePreview: [],
    activeScheduleDisplay: [],
    scheduleTotalCount: 0,
    scheduleTruncated: false,
    toolHint: TOOL_HINTS.payment,
    downRatioAmountHint: '',
    balloonRatioAmountHint: ''
  },

  onLoad() {
    const app = typeof getApp === 'function' ? getApp() : null
    const appVersion = app && app.globalData && app.globalData.version
    if (appVersion) this.setData({ appVersion })
    this.enableShareMenus()
    this.setData({ quoteHistory: this.loadQuoteHistory() })
    this.recalculate()
  },

  enableShareMenus() {
    if (!wx.showShareMenu) return
    wx.showShareMenu({
      menus: ['shareAppMessage', 'shareTimeline']
    })
  },

  quoteHistoryRows(items) {
    return (items || []).map(function (item) {
      const rate = rawNumber(item.form && item.form.annualEffectiveRate)
      const cost = item.amounts && Number(item.amounts.totalFinancingCost)
      const feeStatus = item.form && item.form.feeStatus
      const feeInputRecorded = item.form && (
        Object.prototype.hasOwnProperty.call(item.form, 'upfrontFee') ||
        Object.prototype.hasOwnProperty.call(item.form, 'periodicFee')
      )
      const feesConfirmed = feeStatus === 'none' || (feeStatus === 'known' && feeInputRecorded)
      return {
        id: item.id,
        purpose: item.loanType,
        createdAt: formatHistoryTime(item.createdAt),
        summaryText: item.summary || '已保存的报价体检',
        rateLabel: feesConfirmed ? '折算年化' : '折算年化下限',
        costLabel: feesConfirmed ? '已录入成本' : '已录入成本下限',
        annualEffectiveRate: Number.isFinite(rate)
          ? (feesConfirmed ? '' : '≥') + percent(rate / 100, 2)
          : '未记录',
        totalFinancingCost: Number.isFinite(cost) ? money(cost) + ' 元' : '未记录'
      }
    })
  },

  loadQuoteHistory() {
    return this.quoteHistoryRows(history.load())
  },

  scrollToTop() {
    if (typeof wx === 'undefined' || !wx || typeof wx.pageScrollTo !== 'function') return
    wx.pageScrollTo({ scrollTop: 0 })
  },

  transitionQuoteStep(quoteStep, patch) {
    this.setData(Object.assign({
      quoteStep,
      quoteError: '',
      quoteErrorStep: 0
    }, patch || {}), () => this.scrollToTop())
  },

  startNewQuote() {
    this.setData({
      screenMode: 'quote',
      quoteStep: 1,
      quoteSelectedPurpose: '',
      quoteForm: createQuoteForm(),
      quoteResult: {},
      quoteError: '',
      quoteErrorStep: 0
    }, () => this.scrollToTop())
  },

  startQuickCalc() {
    this.startNewQuote()
  },

  startQuoteForPurpose(event) {
    const purpose = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.purpose
    if (purpose !== 'car' && purpose !== 'home') {
      this.startNewQuote()
      return
    }
    const comparisons = this.quoteComparisonRows().filter(function (item) {
      return item.purpose === purpose
    })
    this.setData({
      screenMode: 'quote',
      quoteStep: 1,
      quoteSelectedPurpose: purpose,
      quoteForm: createQuoteForm(purpose),
      quoteResult: {},
      quoteError: '',
      quoteErrorStep: 0,
      quoteComparisons: comparisons
    }, () => this.scrollToTop())
  },

  continueQuote() {
    this.setData({ screenMode: 'quote' }, () => this.scrollToTop())
  },

  openHome() {
    this.setData({ screenMode: 'home' }, () => this.scrollToTop())
  },

  openTools() {
    this.setData({
      screenMode: 'tools',
      activeTool: 'payment'
    }, () => {
      this.recalculate()
      this.scrollToTop()
    })
  },

  openHistory() {
    this.setData({
      screenMode: 'history',
      quoteHistory: this.loadQuoteHistory()
    }, () => this.scrollToTop())
  },

  setQuotePurpose(event) {
    const purpose = event.currentTarget.dataset.purpose
    if (purpose !== 'car' && purpose !== 'home') return
    const form = this.data.quoteForm || {}
    const previousPurpose = form.purpose
    const currentMonths = isBlank(form.months) ? '' : String(form.months).trim()
    const previousDefault = defaultQuoteMonths(previousPurpose)
    const months = !currentMonths || currentMonths === previousDefault
      ? defaultQuoteMonths(purpose)
      : form.months
    this.setData({
      quoteSelectedPurpose: purpose,
      'quoteForm.purpose': purpose,
      'quoteForm.months': months,
      quoteResult: {},
      quoteError: '',
      quoteErrorStep: 0,
      quoteComparisons: this.quoteComparisonRows().filter(function (item) {
        return item.purpose === purpose
      })
    })
  },

  setQuoteStructure(event) {
    const structure = event.currentTarget.dataset.structure
    if (['equalPayment', 'balloon', 'interestOnly'].indexOf(structure) < 0) return
    this.setData({ 'quoteForm.structure': structure }, () => this.refreshQuoteResult())
  },

  refreshQuoteResult() {
    const quoteResult = this.buildQuoteResult()
    const step = Number(this.data.quoteStep || 1)
    const patch = { quoteResult }
    if (this.data.quoteErrorStep === step) {
      const validation = this.validateQuoteStep(step, quoteResult)
      patch.quoteError = validation.valid ? '' : validation.error
      patch.quoteErrorStep = validation.valid ? 0 : step
    }
    this.setData(patch)
  },

  validateQuoteStep(step, quoteResult) {
    const form = this.data.quoteForm || {}
    if (step === 1) {
      return form.purpose === 'car' || form.purpose === 'home'
        ? { valid: true }
        : { valid: false, error: '请先选择用途' }
    }
    if (step === 2) {
      const purpose = form.purpose
      if (purpose !== 'car' && purpose !== 'home') {
        return { valid: false, error: '请先选择用途' }
      }
      const principal = parseNumberField(form.principal, '贷款本金', { positive: true })
      const monthLimit = purpose === 'car' ? 120 : 600
      const months = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: monthLimit })
      if (!principal.valid || !months.valid) {
        return { valid: false, error: !principal.valid ? principal.error : months.error }
      }
      return { valid: true }
    }
    if (step === 3) {
      const result = quoteResult || this.buildQuoteResult()
      return result.valid
        ? { valid: true, quoteResult: result }
        : { valid: false, error: result.error || '请补全报价信息', quoteResult: result }
    }
    return { valid: false, error: '报价步骤不正确' }
  },

  showQuoteStepError(step, validation) {
    const error = validation.error || '请补全报价信息'
    const patch = {
      quoteError: error,
      quoteErrorStep: step
    }
    if (validation.quoteResult) patch.quoteResult = validation.quoteResult
    this.setData(patch)
    wx.showToast({ title: error, icon: 'none' })
  },

  nextQuoteStep() {
    const step = Number(this.data.quoteStep || 1)
    const validation = this.validateQuoteStep(step)
    if (!validation.valid) {
      this.showQuoteStepError(step, validation)
      return
    }
    if (step === 1) {
      this.transitionQuoteStep(2)
      return
    }
    if (step === 2) {
      this.transitionQuoteStep(3)
      return
    }
    if (step === 3) this.transitionQuoteStep(4, { quoteResult: validation.quoteResult })
  },

  previousQuoteStep() {
    const currentStep = Number(this.data.quoteStep || 1)
    if (currentStep <= 1) {
      this.openHome()
      return
    }
    const quoteStep = currentStep - 1
    this.transitionQuoteStep(quoteStep)
  },

  quoteComparisonRows() {
    return this.data.quoteComparisons || []
  },

  quoteComparisonSignature(result) {
    const form = this.data.quoteForm || {}
    return [
      result.purpose,
      form.principal,
      form.months,
      form.structure,
      form.monthlyPayment,
      form.balloonAmount,
      form.feeStatus,
      form.upfrontFee,
      form.periodicFee,
      form.claimedRate,
      form.claimedRateMode,
      form.prepayKnown
    ].map(function (item) { return item === undefined || item === null ? '' : String(item).trim() }).join('|')
  },

  addQuoteComparison() {
    const result = this.data.quoteResult || this.buildQuoteResult()
    if (!result.valid) {
      wx.showToast({ title: result.error || '请先完成报价', icon: 'none' })
      return
    }
    if (!result.comparable) {
      wx.showToast({ title: '先确认费用后再做报价对比', icon: 'none' })
      return
    }
    const current = this.quoteComparisonRows()
    if (current.length && current.some(function (item) { return item.purpose !== result.purpose })) {
      wx.showToast({ title: '不同用途的报价不能直接对比', icon: 'none' })
      return
    }
    if (current.length >= 3) {
      wx.showToast({ title: '最多同时对比3份报价', icon: 'none' })
      return
    }
    const signature = this.quoteComparisonSignature(result)
    if (current.some(function (item) { return item.signature === signature })) {
      wx.showToast({ title: '这份报价已在对比中', icon: 'none' })
      return
    }
    const id = 'q' + Date.now() + '-' + Math.floor(Math.random() * 100000)
    const row = {
      id,
      signature,
      purpose: result.purpose,
      annualEffectiveRate: result.annualEffectiveRate,
      totalFinancingCost: result.totalFinancingCost,
      maxCashPressure: result.maxCashPressure,
      lastPayment: result.lastPayment,
      summaryText: result.summaryText
    }
    this.setData({ quoteComparisons: current.concat([row]) })
  },

  removeQuoteComparison(event) {
    const id = event.currentTarget.dataset.id
    this.setData({
      quoteComparisons: this.quoteComparisonRows().filter(function (item) { return item.id !== id })
    })
  },

  findQuoteHistory(id) {
    return history.load().find(function (item) {
      return item.id === id && item.tool === 'quote'
    }) || null
  },

  restoreQuoteHistory(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id
    const item = this.findQuoteHistory(id)
    if (!item) {
      wx.showToast({ title: '记录不存在或已损坏', icon: 'none' })
      return
    }
    const quoteForm = Object.assign(createQuoteForm(), item.form || {}, { purpose: item.loanType })
    this.setData({
      screenMode: 'quote',
      quoteStep: 3,
      quoteSelectedPurpose: item.loanType,
      quoteForm,
      quoteResult: {},
      quoteError: '',
      quoteErrorStep: 0,
      quoteComparisons: this.quoteComparisonRows().filter(function (row) {
        return row.purpose === item.loanType
      })
    }, () => {
      const quoteResult = this.buildQuoteResult()
      if (quoteResult.valid) {
        this.transitionQuoteStep(4, { quoteResult })
        return
      }
      this.setData({
        quoteResult,
        quoteError: quoteResult.error || '历史记录缺少必要信息，请补全后重新计算',
        quoteErrorStep: 3
      }, () => this.scrollToTop())
    })
  },

  removeQuoteHistory(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id
    const before = this.loadQuoteHistory()
    const items = history.remove(id)
    const rows = this.quoteHistoryRows(items)
    this.setData({ quoteHistory: rows })
    if (rows.length >= before.length) {
      wx.showToast({ title: '删除失败，请重试', icon: 'none' })
      return
    }
    wx.showToast({ title: '已删除', icon: 'success' })
  },

  confirmRemoveQuoteHistory(event) {
    const self = this
    if (!wx.showModal) {
      this.removeQuoteHistory(event)
      return
    }
    wx.showModal({
      title: '删除这份报告？',
      content: '删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#c43d2f',
      success(res) {
        if (res.confirm) self.removeQuoteHistory(event)
      }
    })
  },

  clearQuoteHistory() {
    if (!this.loadQuoteHistory().length) {
      this.setData({ quoteHistory: [] })
      wx.showToast({ title: '暂无可清空记录', icon: 'none' })
      return
    }
    history.clear()
    const rows = this.loadQuoteHistory()
    this.setData({ quoteHistory: rows })
    wx.showToast({
      title: rows.length ? '清空失败，请重试' : '已清空',
      icon: rows.length ? 'none' : 'success'
    })
  },

  confirmClearQuoteHistory() {
    const self = this
    if (!wx.showModal) {
      this.clearQuoteHistory()
      return
    }
    wx.showModal({
      title: '清空全部报告？',
      content: '本机保存的报价报告会全部删除，且无法恢复。',
      confirmText: '清空',
      confirmColor: '#c43d2f',
      success(res) {
        if (res.confirm) self.clearQuoteHistory()
      }
    })
  },

  buildQuoteReportDocument() {
    const result = this.data.quoteResult || {}
    return {
      title: quotePurposeLabel(result.purpose) + '贷款报价体检报告',
      conclusion: result.summaryText,
      costs: [
        { label: '按已录入现金流的复利年化', value: result.annualEffectiveRate },
        { label: '已录入成本合计', value: result.totalFinancingCost + ' 元' },
        { label: '最高每期还款', value: result.maxPayment + ' 元' },
        { label: '单项最高已录入支出', value: result.maxCashPressure + ' 元' },
        { label: '末期还款', value: result.lastPayment + ' 元' }
      ],
      checks: result.checklist || [],
      assumptions: [
        '费用只按已填写项目计算；未确认费用不能视为没有。',
        '本报告为本机离线估算，不构成审批、签约或结清依据。',
        '提前还款金额、违约金和最终应付金额以合同、账单和机构结清试算单为准。'
      ]
    }
  },

  copyQuoteReport() {
    const result = this.data.quoteResult || {}
    if (!result.valid) {
      wx.showToast({ title: result.error || '请先完成报价', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: result.copyText || '' })
  },

  exportQuoteReport() {
    const result = this.data.quoteResult || {}
    if (!result.valid) {
      wx.showToast({ title: result.error || '请先完成报价', icon: 'none' })
      return
    }
    const data = pdf.createQuoteReportPdf(this.buildQuoteReportDocument())
    const filePath = wx.env.USER_DATA_PATH + '/loan-quote-' + Date.now() + '.pdf'
    wx.getFileSystemManager().writeFile({
      filePath,
      data,
      success: function () {
        wx.openDocument({
          filePath,
          fileType: 'pdf',
          showMenu: true,
          fail: function () { wx.showToast({ title: '打开PDF失败', icon: 'none' }) }
        })
      },
      fail: function () { wx.showToast({ title: '导出失败', icon: 'none' }) }
    })
  },

  saveQuoteReport() {
    const result = this.data.quoteResult || {}
    if (!result.valid) {
      wx.showToast({ title: result.error || '请先完成报价', icon: 'none' })
      return
    }
    const id = 'q' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 0xFFFFFF).toString(36)
    const items = history.save({
      id,
      loanType: result.purpose,
      tool: 'quote',
      title: quotePurposeLabel(result.purpose) + '报价体检',
      summary: result.summaryText,
      form: Object.assign({}, this.data.quoteForm, {
        annualEffectiveRate: result.raw.annualEffectiveRate * 100
      }),
      amounts: {
        totalFinancingCost: result.raw.totalFinancingCost
      }
    })
    this.setData({ quoteHistory: this.quoteHistoryRows(items) })
    if (!items.some(function (item) { return item.id === id })) {
      wx.showToast({ title: '保存失败，请检查本机存储空间', icon: 'none' })
      return
    }
    wx.showToast({ title: '已保存到本机', icon: 'success' })
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
    this.setData(patch, () => {
      if (form === 'quoteForm') this.refreshQuoteResult()
      else this.recalculate()
    })
  },

  setFormValue(event) {
    const form = event.currentTarget.dataset.form
    const field = event.currentTarget.dataset.field
    const value = event.currentTarget.dataset.value
    let patch

    if (field === 'unit') {
      patch = unitSwitchPatch(form, this.data[form], value)
      if (form === 'prepayForm' && this.data.prepayForm.penaltyType !== 'fixed') {
        patch['prepayForm.penaltyValue'] = this.data.prepayForm.penaltyValue
      }
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
    if (form === 'quoteForm' && field === 'feeStatus' && (value === 'none' || value === 'unknown')) {
      patch['quoteForm.upfrontFee'] = ''
      patch['quoteForm.periodicFee'] = ''
    }

    this.setData(patch, () => {
      if (form === 'quoteForm') this.refreshQuoteResult()
      else this.recalculate()
    })
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
      prepay: this.data.prepayResult,
      carCost: this.data.carCostResult,
      lpr: this.data.lprResult
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

  fillSample() {
    const activeTool = this.data.activeTool
    const samples = buildSampleForms(this.data.loanType)
    const formMap = {
      payment: 'paymentForm',
      combo: 'comboForm',
      budget: 'budgetForm',
      actual: 'actualForm',
      flat: 'flatForm',
      balloon: 'balloonForm',
      prepay: 'prepayForm',
      carCost: 'carCostForm',
      lpr: 'lprForm'
    }
    const formName = formMap[activeTool]
    const sample = samples[formName]
    if (!formName || !sample) {
      wx.showToast({ title: '当前工具暂无示例', icon: 'none' })
      return
    }
    this.setData({ [formName]: sample }, () => this.recalculate())
  },

  recalculate() {
    const tools = {
      payment: { builder: 'buildPaymentResult', result: 'paymentResult' },
      combo: { builder: 'buildComboResult', result: 'comboResult' },
      budget: { builder: 'buildBudgetResult', result: 'budgetResult' },
      actual: { builder: 'buildActualResult', result: 'actualResult' },
      flat: { builder: 'buildFlatResult', result: 'flatResult' },
      balloon: { builder: 'buildBalloonResult', result: 'balloonResult' },
      prepay: { builder: 'buildPrepayResult', result: 'prepayResult' },
      carCost: { builder: 'buildCarCostResult', result: 'carCostResult' },
      lpr: { builder: 'buildLprResult', result: 'lprResult' }
    }
    const activeTool = this.data.activeTool
    const config = tools[activeTool] || tools.payment
    const result = this[config.builder]()
    const schedule = sliceScheduleDisplay(result.schedulePreview || [])
    this.setData({
      [config.result]: result,
      activeSchedulePreview: schedule.full,
      activeScheduleDisplay: schedule.display,
      scheduleTotalCount: schedule.total,
      scheduleTruncated: schedule.truncated,
      toolHint: TOOL_HINTS[activeTool] || '',
      downRatioAmountHint: downRatioAmountHint(this.data.paymentForm),
      balloonRatioAmountHint: balloonRatioAmountHint(this.data.balloonForm)
    })
  },

  buildQuoteResult() {
    const form = this.data.quoteForm || {}
    const purpose = form.purpose
    const invalid = (error, level) => ({
      valid: false,
      error,
      errorLevel: level || 'error',
      purpose,
      rateLabel: '按已录入现金流的复利年化',
      annualEffectiveRate: '—',
      totalFinancingCost: '—',
      maxPayment: '—',
      maxCashPressure: '—',
      lastPayment: '—',
      checklist: [],
      copyText: '无法完成报价体检：' + error,
      raw: {}
    })

    if (purpose !== 'car' && purpose !== 'home') return invalid('请选择这笔贷款的用途', 'hint')
    if (['equalPayment', 'balloon', 'interestOnly'].indexOf(form.structure) < 0) return invalid('还款结构不正确')
    const feeStatus = form.feeStatus || ''
    if (feeStatus !== 'unknown' && feeStatus !== 'none' && feeStatus !== 'known') return invalid('费用状态不正确')
    const principalField = parseNumberField(form.principal, '贷款本金', { positive: true })
    if (!principalField.valid) return invalid(principalField.error, principalField.level)
    const monthLimit = purpose === 'car' ? 120 : 600
    const term = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: monthLimit })
    if (!term.valid) return invalid(term.error, term.level)
    const paymentLabel = form.structure === 'interestOnly' ? '每期利息' : '每期还款'
    const monthly = parseNumberField(form.monthlyPayment, paymentLabel, { min: 0 })
    if (!monthly.valid) return invalid(monthly.error, monthly.level)

    let balloonAmount = 0
    if (form.structure === 'balloon') {
      const balloon = parseNumberField(form.balloonAmount, '末期尾款', { min: 0 })
      if (!balloon.valid) return invalid(balloon.error, balloon.level)
      balloonAmount = balloon.value
      if (balloonAmount > principalField.value) return invalid('末期尾款不能超过贷款本金')
    }

    const upfront = parseOptionalNumber(form.upfrontFee, '前置费用', { min: 0 })
    if (!upfront.valid) return invalid(upfront.error, upfront.level)
    const periodic = parseOptionalNumber(form.periodicFee, '每期费用', { min: 0 })
    if (!periodic.valid) return invalid(periodic.error, periodic.level)
    const claimed = parseOptionalNumber(form.claimedRate, '合同或宣传标注利率', { min: 0 })
    if (!claimed.valid) return invalid(claimed.error, claimed.level)
    if (!claimed.empty && ['annual', 'monthly'].indexOf(form.claimedRateMode) < 0) return invalid('标注利率口径不正确')

    const principal = principalField.value
    const upfrontFee = feeStatus === 'none' ? 0 : (upfront.empty ? 0 : upfront.value)
    const periodicFee = feeStatus === 'none' ? 0 : (periodic.empty ? 0 : periodic.value)
    const cashflows = Array(term.value).fill(monthly.value + periodicFee)
    if (form.structure === 'balloon') cashflows[term.value - 1] += balloonAmount
    if (form.structure === 'interestOnly') cashflows[term.value - 1] += principal

    const actual = loan.calcActualRate(principal, monthly.value, term.value, 0, upfrontFee, { cashflows })
    if (!actual.valid) return invalid(engineErrorText(actual.error))

    const contractRepayment = monthly.value * term.value +
      (form.structure === 'balloon' ? balloonAmount : (form.structure === 'interestOnly' ? principal : 0))
    const totalPeriodicFee = periodicFee * term.value
    const totalFinancingCost = contractRepayment + totalPeriodicFee + upfrontFee - principal
    const lastPayment = cashflows[cashflows.length - 1]
    const maxPayment = Math.max.apply(null, cashflows)
    const maxCashPressure = Math.max(maxPayment, upfrontFee)
    const feeInputRecorded = !upfront.empty || !periodic.empty
    const feesConfirmed = feeStatus === 'none' || (feeStatus === 'known' && feeInputRecorded)
    const checklist = []

    if (!feesConfirmed) {
      checklist.push(feeStatus === 'known'
        ? '已选择有额外费用，但金额尚未填写：当前年化和总成本只代表已录入项目的最低口径，不能据此比较报价。'
        : '费用还未核对：当前年化和总成本只代表已录入项目的最低口径，不能据此比较报价。')
      checklist.push('请问清服务费、担保费、GPS、保险、续保押金和每期附加费用，分别由谁收、何时收。')
    } else if (feeStatus === 'none') {
      checklist.push('你已标记为没有额外费用；签约前仍应确认服务费、GPS、保险是否被单列或强制购买。')
    } else if (upfrontFee === 0 && periodicFee === 0) {
      checklist.push('已选择有额外费用，但填写金额为 0；请核对是否遗漏了服务费或每期附加费用。')
    }

    checklist.push('核对前置费用是现金另付、从放款中代扣，还是已计入本金；同一笔费用不要重复计算。')
    if (form.structure === 'balloon') checklist.push('末期还款含尾款，请确认届时资金来源和尾款处置安排。')
    if (form.structure === 'interestOnly') checklist.push('先息后本末期需一次归还本金，请确认不是只看到了前期利息。')
    if (form.prepayKnown !== 'yes') checklist.push('提前还款规则未确认：请索取违约金、申请时间、是否缩期或降月供的书面说明。')
    if (!claimed.empty) checklist.push('宣传利率只能与同一计息口径比较；月息、平息和复利年化不能直接当成一回事。')

    let comparisonText = ''
    if (!claimed.empty && asMonthlyRatePercent(form.claimedRate, form.claimedRateMode) > 0) {
      const claimedMonthlyRate = asMonthlyRatePercent(form.claimedRate, form.claimedRateMode) / 100
      const actualComparableRate = actual.feeAdjustedMonthlyRate
      comparisonText = `；按同口径反推约为宣传口径的 ${loan.round(actualComparableRate / claimedMonthlyRate, 2)} 倍`
    }
    const summaryText = feesConfirmed
      ? `按已录入现金流，已录入成本合计 ${money(totalFinancingCost)} 元${comparisonText}`
      : `费用尚未核对；已录入成本合计 ${money(totalFinancingCost)} 元，仅代表当前下限，暂不适合横向比较`
    const rateLabel = feesConfirmed
      ? '按已录入现金流的复利年化'
      : '按已录入现金流的复利年化（下限）'
    const rateTextValue = (feesConfirmed ? '' : '≥') + percent(actual.feeAdjustedAnnualEffectiveRate, 2)
    const copyText = [
      quotePurposeLabel(purpose) + '贷款报价体检',
      `贷款本金：${money(principal)} 元`,
      `还款结构：${actualStructureName(form.structure === 'equalPayment' ? 'equalPayment' : form.structure)}`,
      `${paymentLabel}：${money(monthly.value)} 元`,
      form.structure === 'balloon' ? `末期尾款：${money(balloonAmount)} 元` : '',
      `前置费用：${money(upfrontFee)} 元`,
      `每期附加费用：${money(periodicFee)} 元`,
      `费用核对状态：${feesConfirmed ? (form.feeStatus === 'none' ? '已确认无额外费用' : '已填写费用') : '尚未确认'}`,
      !claimed.empty ? claimedRateText(form.claimedRate, form.claimedRateMode) : '合同或宣传标注利率：未填写',
      `${rateLabel}：${rateTextValue}`,
      `已录入成本合计：${money(totalFinancingCost)} 元`,
      `最高每期还款：${money(maxPayment)} 元`,
      `最高单次已录入支出：${money(maxCashPressure)} 元`,
      `末期还款：${money(lastPayment)} 元`,
      '签约前核对：',
      checklist.map(function (item) { return '• ' + item }).join('\n')
    ].filter(Boolean).join('\n')

    return {
      valid: true,
      error: '',
      errorLevel: '',
      purpose,
      rateLabel,
      annualEffectiveRate: rateTextValue,
      annualNominalRate: percent(actual.feeAdjustedAnnualNominalRate, 2),
      totalFinancingCost: money(totalFinancingCost),
      maxPayment: money(maxPayment),
      maxCashPressure: money(maxCashPressure),
      lastPayment: money(lastPayment),
      checklist,
      comparable: feesConfirmed,
      summaryText,
      copyText,
      raw: {
        annualEffectiveRate: actual.feeAdjustedAnnualEffectiveRate,
        totalFinancingCost,
        maxPayment,
        maxCashPressure,
        lastPayment,
        upfrontFee,
        periodicFee,
        totalPeriodicFee,
        contractRepayment
      }
    }
  },

  buildPaymentResult() {
    const form = this.data.paymentForm
    const context = this.loanContextLines()
    const primaryLabel = form.method === 'equalPrincipal' ? '首月月供' : '每月月供'
    const invalid = (error, level) => ({
      valid: false,
      error,
      errorLevel: level || 'error',
      summaryText: '',
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
    if (!term.valid) return invalid(term.error, term.level)
    const rate = parseNumberField(form.annualRate, rateLabel(form.rateMode), { min: 0 })
    if (!rate.valid) return invalid(rate.error, rate.level)

    let principal
    let carPrice = 0
    let downPayment = 0
    if (form.inputMode === 'price') {
      const price = parseNumberField(form.carPrice, this.data.loanType === 'car' ? '车价' : '房价', { positive: true })
      if (!price.valid) return invalid(price.error, price.level)
      carPrice = amount(form.carPrice, form.unit)
      if (form.downRatio) {
        const ratio = parseNumberField(form.downRatio, '首付比例', { min: 0, max: 100 })
        if (!ratio.valid) return invalid(ratio.error, ratio.level)
        downPayment = carPrice * ratio.value / 100
      } else {
        const customDown = parseOptionalNumber(form.downPayment, '首付金额', { min: 0 })
        if (!customDown.valid) return invalid(customDown.error, customDown.level)
        downPayment = amount(customDown.empty ? 0 : form.downPayment, form.unit)
      }
      if (downPayment > carPrice) return invalid('首付不能超过总价')
      principal = carPrice - downPayment
      if (principal <= 0) return invalid('贷款本金必须大于0')
    } else {
      const principalField = parseNumberField(form.principal, '贷款本金', { positive: true })
      if (!principalField.valid) return invalid(principalField.error, principalField.level)
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
      errorLevel: '',
      summaryText: primaryLabel + ' ' + money(primaryPayment) + ' 元，总利息 ' + money(result.totalInterest) + ' 元',
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
    const invalid = (error, level) => ({
      valid: false,
      error,
      errorLevel: level || 'error',
      summaryText: '',
      primaryPayment: '—',
      lastPayment: '—',
      totalInterest: '—',
      totalPayment: '—',
      schedulePreview: [],
      copyText: invalidCopy(context, error)
    })

    const years = parseNumberField(form.years, '贷款年限', { integer: true, min: 1, max: 50 })
    if (!years.valid) return invalid(years.error, years.level)
    const commercial = parseOptionalNumber(form.commercialPrincipal, '商贷本金', { min: 0 })
    const fund = parseOptionalNumber(form.fundPrincipal, '公积金本金', { min: 0 })
    if (!commercial.valid) return invalid(commercial.error, commercial.level)
    if (!fund.valid) return invalid(fund.error, fund.level)
    const commercialPrincipal = amount(commercial.empty ? 0 : form.commercialPrincipal, form.unit)
    const fundPrincipal = amount(fund.empty ? 0 : form.fundPrincipal, form.unit)
    if (commercialPrincipal <= 0 && fundPrincipal <= 0) return invalid('请输入商贷本金或公积金本金', 'hint')

    if (commercialPrincipal > 0) {
      const commercialRateField = parseNumberField(form.commercialRate, '商贷利率', { min: 0 })
      if (!commercialRateField.valid) return invalid(commercialRateField.error, commercialRateField.level)
    }
    if (fundPrincipal > 0) {
      const fundRateField = parseNumberField(form.fundRate, '公积金利率', { min: 0 })
      if (!fundRateField.valid) return invalid(fundRateField.error, fundRateField.level)
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
      errorLevel: '',
      summaryText: '合计月供 ' + money(primaryPayment) + ' 元，总利息 ' + money(result.totalInterest) + ' 元',
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
    const invalid = (error, level) => ({
      valid: false,
      error,
      errorLevel: level || 'error',
      summaryText: '',
      principal: '—',
      primaryLabel,
      primaryPayment: '—',
      totalInterest: '—',
      totalPayment: '—',
      schedulePreview: [],
      copyText: invalidCopy(context, error)
    })

    const budget = parseNumberField(form.monthlyBudget, '月供预算', { positive: true })
    if (!budget.valid) return invalid(budget.error, budget.level)
    const term = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: 600 })
    if (!term.valid) return invalid(term.error, term.level)
    const rate = parseNumberField(form.annualRate, rateLabel(form.rateMode), { min: 0 })
    if (!rate.valid) return invalid(rate.error, rate.level)

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
      errorLevel: '',
      summaryText: '大约可贷 ' + money(result.principal) + ' 元，' + primaryLabel + ' ' + money(primaryPayment) + ' 元',
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
    const invalid = (error, level) => ({
      valid: false,
      error,
      errorLevel: level || 'error',
      summaryText: '',
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
    if (!principalField.valid) return invalid(principalField.error, principalField.level)
    const term = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: 600 })
    if (!term.valid) return invalid(term.error, term.level)
    const upfront = parseOptionalNumber(form.upfrontFee, '前置费用', { min: 0 })
    if (!upfront.valid) return invalid(upfront.error, upfront.level)
    const claimed = parseOptionalNumber(form.claimedMonthlyRate, '合同或宣传标注利率', { min: 0 })
    if (!claimed.valid) return invalid(claimed.error, claimed.level)

    const principal = amount(form.principal, form.unit)
    const upfrontFee = amount(upfront.empty ? 0 : form.upfrontFee, form.unit)
    if (upfrontFee >= principal && upfrontFee > 0) return invalid('前置费用必须小于贷款本金')

    let monthlyPayment
    let options = {}
    if (form.inputMode === 'interest') {
      if (paymentStructure !== 'equalPayment') return invalid('只知总利息仅适用于等额月供')
      const totalInterestField = parseNumberField(form.totalInterest, '总利息', { min: 0 })
      if (!totalInterestField.valid) return invalid(totalInterestField.error, totalInterestField.level)
      monthlyPayment = (principal + amount(form.totalInterest, form.unit)) / term.value
    } else {
      const paymentField = parseNumberField(
        form.monthlyPayment,
        paymentStructure === 'interestOnly' ? '每期利息' : '实际月供',
        { min: 0 }
      )
      if (!paymentField.valid) return invalid(paymentField.error, paymentField.level)
      monthlyPayment = paymentField.value

      if (paymentStructure === 'balloon') {
        const balloon = parseNumberField(form.balloonAmount, '末期尾款', { min: 0 })
        if (!balloon.valid) return invalid(balloon.error, balloon.level)
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
      claimedFilled ? claimedRateText(form.claimedMonthlyRate, form.claimedRateMode) : '合同或宣传标注利率：未填写',
      upfront.empty ? '前置费用：未核对（当前只按已录入项目折算）' : `前置费用核对状态：已填写 ${money(result.upfrontFee)} 元`,
      `按还款现金流折算月利率：${percent(result.monthlyRate, 4)}`,
      `含已录入费用月利率：${percent(result.feeAdjustedMonthlyRate, 4)}`,
      `名义年化：${percent(result.annualNominalRate, 2)}`,
      `复利年化：${percent(result.annualEffectiveRate, 2)}`,
      `含已录入费用名义年化：${percent(result.feeAdjustedAnnualNominalRate, 2)}`,
      `含已录入费用复利年化：${percent(result.feeAdjustedAnnualEffectiveRate, 2)}`,
      `总利息：${money(result.totalInterest)} 元`,
      `已录入总融资成本：${money(result.totalFinancingCost)} 元`
    ]).join('\n')

    const showAnnual = upfrontFee > 0 ? result.feeAdjustedAnnualNominalRate : result.annualNominalRate
    const showAnnualLabel = upfrontFee > 0 ? '含已录入费用名义年化' : '名义年化'
    let actualSummary = '按还款现金流折算月利率 ' + percent(result.monthlyRate, 4) + '，' + showAnnualLabel + ' ' + percent(showAnnual, 2)
    if (claimedFilled) {
      actualSummary += '，约为对外口径的 ' + loan.round(result.claimedMultiple, 2) + ' 倍'
    }
    actualSummary += '；已录入总融资成本 ' + money(result.totalFinancingCost) + ' 元'

    return {
      valid: true,
      error: '',
      errorLevel: '',
      summaryText: actualSummary,
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
    const invalid = (error, level) => ({
      valid: false,
      error,
      errorLevel: level || 'error',
      summaryText: '',
      monthlyPayment: '—',
      totalInterest: '—',
      totalPayment: '—',
      actualMonthlyRate: '—',
      actualAnnualNominalRate: '—',
      actualAnnualEffectiveRate: '—',
      copyText: invalidCopy(context, error)
    })

    const principalField = parseNumberField(form.principal, '贷款本金', { positive: true })
    if (!principalField.valid) return invalid(principalField.error, principalField.level)
    const term = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: 120 })
    if (!term.valid) return invalid(term.error, term.level)
    const rate = parseNumberField(form.monthlyFlatRate, '平息费率', { min: 0 })
    if (!rate.valid) return invalid(rate.error, rate.level)

    const monthlyFlatRate = asMonthlyFlatRate(form.monthlyFlatRate, form.rateMode)
    const result = loan.calcFlatMonthly(amount(form.principal, form.unit), monthlyFlatRate, term.value)
    if (!result.valid) return invalid(engineErrorText(result.error))
    const copyText = context.concat([
      `${form.rateMode === 'annual' ? '平息年化' : '平息月费率'}：${form.monthlyFlatRate || 0}%`,
      `折算平息月费率：${percent(result.flatMonthlyRate, 4)}`,
      `月供：${money(result.monthlyPayment)} 元`,
      `折算月利率：${percent(result.actualMonthlyRate, 4)}`,
      `名义年化：${percent(result.actualAnnualNominalRate, 2)}`,
      `复利年化：${percent(result.actualAnnualEffectiveRate, 2)}`,
      `总利息：${money(result.totalInterest)} 元`
    ]).join('\n')

    return {
      valid: true,
      error: '',
      errorLevel: '',
      summaryText: '平息月供 ' + money(result.monthlyPayment) + ' 元，折算名义年化约 ' + percent(result.actualAnnualNominalRate, 2),
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
    const invalid = (error, level) => ({
      valid: false,
      error,
      errorLevel: level || 'error',
      summaryText: '',
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
    if (!principalField.valid) return invalid(principalField.error, principalField.level)
    const term = parseNumberField(form.months, '还款期数', { integer: true, min: 1, max: 120 })
    if (!term.valid) return invalid(term.error, term.level)
    const rate = parseNumberField(form.annualRate, rateLabel(form.rateMode), { min: 0 })
    if (!rate.valid) return invalid(rate.error, rate.level)

    const principal = amount(form.principal, form.unit)
    let balloonAmount
    if (form.balloonRatio) {
      const ratio = parseNumberField(form.balloonRatio, '尾款比例', { min: 0, max: 100 })
      if (!ratio.valid) return invalid(ratio.error, ratio.level)
      balloonAmount = principal * ratio.value / 100
    } else {
      const balloon = parseOptionalNumber(form.balloonAmount, '尾款金额', { min: 0 })
      if (!balloon.valid) return invalid(balloon.error, balloon.level)
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
      errorLevel: '',
      summaryText: '月供 ' + money(result.monthlyPayment) + ' 元，末期含尾款 ' + money(result.lastPayment) + ' 元',
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

  buildCarCostResult() {
    const form = this.data.carCostForm
    const invalid = (error, level) => ({
      valid: false,
      error,
      errorLevel: level || 'error',
      summaryText: '',
      cashTotal: '—',
      installmentTotal: '—',
      pricePremium: '—',
      financingCost: '—',
      differenceFromCash: '—',
      cashAtPurchase: '—',
      copyText: invalidCopy(['车贷落地总价对比'], error)
    })
    const cashPrice = parseNumberField(form.cashVehiclePrice, '全款车价', { positive: true })
    if (!cashPrice.valid) return invalid(cashPrice.error, cashPrice.level)
    const installmentPrice = parseNumberField(form.installmentVehiclePrice, '分期车价', { positive: true })
    if (!installmentPrice.valid) return invalid(installmentPrice.error, installmentPrice.level)
    const funding = parseNumberField(form.purposeFunding, '实际用于购车的贷款金额', { positive: true })
    if (!funding.valid) return invalid(funding.error, funding.level)
    const repayment = parseNumberField(form.totalRepayment, '合同总还款', { positive: true })
    if (!repayment.valid) return invalid(repayment.error, repayment.level)

    const optionalFields = [
      ['discount', '优惠金额'], ['purchaseTax', '购置相关税费'], ['insurance', '保险'],
      ['registrationFee', '上牌费用'], ['requiredOptions', '必选装'], ['upfrontFee', '前置费用'],
      ['periodicFee', '周期费用合计']
    ]
    const values = {}
    for (let i = 0; i < optionalFields.length; i += 1) {
      const item = optionalFields[i]
      const parsed = parseOptionalNumber(form[item[0]], item[1], { min: 0 })
      if (!parsed.valid) return invalid(parsed.error, parsed.level)
      values[item[0]] = parsed.empty ? 0 : amount(form[item[0]], form.unit)
    }

    const common = {
      discount: values.discount,
      purchaseTax: values.purchaseTax,
      insurance: values.insurance,
      registrationFee: values.registrationFee,
      requiredOptions: values.requiredOptions
    }
    const cash = loan.calcCarLandedCost(Object.assign({}, common, {
      vehiclePrice: amount(form.cashVehiclePrice, form.unit)
    }))
    if (!cash.valid) return invalid(engineErrorText(cash.error))
    const installment = loan.calcCarLandedCost(Object.assign({}, common, {
      vehiclePrice: amount(form.installmentVehiclePrice, form.unit),
      purposeFunding: amount(form.purposeFunding, form.unit),
      totalRepayment: amount(form.totalRepayment, form.unit),
      upfrontFee: values.upfrontFee,
      totalPeriodicFee: values.periodicFee,
      upfrontFeePayment: form.upfrontFeePayment
    }))
    if (!installment.valid) return invalid(engineErrorText(installment.error))

    const pricePremium = installment.landedCost - cash.landedCost
    const differenceFromCash = installment.totalPaid - cash.totalPaid
    const summaryText = differenceFromCash >= 0
      ? `按已录入项目，分期总支出比全款多 ${money(differenceFromCash)} 元`
      : `按已录入项目，分期总支出比全款少 ${money(Math.abs(differenceFromCash))} 元；请核对是否遗漏费用`
    const copyText = [
      '车贷落地总价对比',
      `全款总支出：${money(cash.totalPaid)} 元`,
      `分期总支出：${money(installment.totalPaid)} 元`,
      `分期车价差：${money(pricePremium)} 元`,
      `融资成本：${money(installment.financingCost)} 元`,
      `分期首期现金：${money(installment.cashAtPurchase)} 元`,
      `相对全款差额：${money(differenceFromCash)} 元`,
      `前置费用支付方式：${form.upfrontFeePayment === 'deducted' ? '从放款中代扣' : '现金另付'}`,
      '购置相关税费、保险、上牌和必选装按录入金额计算；请以合同、发票和缴费单据为准。'
    ].join('\n')

    return {
      valid: true,
      error: '',
      errorLevel: '',
      summaryText,
      cashTotal: money(cash.totalPaid),
      installmentTotal: money(installment.totalPaid),
      pricePremium: money(pricePremium),
      financingCost: money(installment.financingCost),
      differenceFromCash: money(differenceFromCash),
      cashAtPurchase: money(installment.cashAtPurchase),
      copyText
    }
  },

  buildLprResult() {
    const form = this.data.lprForm
    const context = ['房贷 LPR 情景测算']
    const invalid = (error, level) => ({
      valid: false,
      error,
      errorLevel: level || 'error',
      summaryText: '',
      initialRate: '—',
      scenarioRate: '—',
      firstPayment: '—',
      repricePayment: '—',
      totalInterest: '—',
      paymentChange: '—',
      schedulePreview: [],
      copyText: invalidCopy(context, error)
    })
    const principal = parseNumberField(form.principal, '贷款本金', { positive: true })
    if (!principal.valid) return invalid(principal.error, principal.level)
    const months = parseNumberField(form.months, '还款期数', { integer: true, min: 2, max: 600 })
    if (!months.valid) return invalid(months.error, months.level)
    const initialLpr = parseNumberField(form.initialLpr, '当前 LPR', { min: 0, max: 100 })
    if (!initialLpr.valid) return invalid(initialLpr.error, initialLpr.level)
    const scenarioLpr = parseNumberField(form.scenarioLpr, '情景 LPR', { min: 0, max: 100 })
    if (!scenarioLpr.valid) return invalid(scenarioLpr.error, scenarioLpr.level)
    const spread = signedNumberField(form.spreadBps, '合同加点', { min: -10000, max: 10000 })
    if (!spread.valid) return invalid(spread.error, spread.level)
    const reprice = parseNumberField(form.repriceMonth, '重定价起始期数', { integer: true, min: 2, max: months.value })
    if (!reprice.valid) return invalid(reprice.error, reprice.level)

    const result = loan.calcRatePathSchedule({
      principal: amount(form.principal, form.unit),
      months: months.value,
      method: form.method,
      lprPath: [
        { effectiveMonth: 1, lpr: initialLpr.value },
        { effectiveMonth: reprice.value, lpr: scenarioLpr.value }
      ],
      spreadBps: spread.value
    })
    if (!result.valid) return invalid(engineErrorText(result.error))

    const firstPayment = result.schedule[0].payment
    const repricePayment = result.schedule[reprice.value - 1].payment
    const paymentChange = repricePayment - result.schedule[reprice.value - 2].payment
    const initialRate = result.ratePath[0].annualRate
    const nextRate = result.ratePath[1].annualRate
    const summaryText = `假设第 ${reprice.value} 期起 LPR 变为 ${scenarioLpr.value}% ，月供将按剩余本金重新测算`
    const copyText = context.concat([
      `本金：${money(result.principal)} 元`,
      `合同加点：${spread.value >= 0 ? '+' : ''}${spread.value} bp`,
      `当前情景利率：${percent(initialRate / 100, 2)}`,
      `第 ${reprice.value} 期起情景利率：${percent(nextRate / 100, 2)}`,
      `首期还款：${money(firstPayment)} 元`,
      `重定价后当期还款：${money(repricePayment)} 元`,
      `重定价当期变化：${money(paymentChange)} 元`,
      `总利息：${money(result.totalInterest)} 元`,
      '这是手动 LPR 情景测算；实际重定价日、计息天数和执行规则以合同及最新还款计划为准。'
    ]).join('\n')

    return {
      valid: true,
      error: '',
      errorLevel: '',
      summaryText,
      initialRate: percent(initialRate / 100, 2),
      scenarioRate: percent(nextRate / 100, 2),
      firstPayment: money(firstPayment),
      repricePayment: money(repricePayment),
      totalInterest: money(result.totalInterest),
      paymentChange: money(paymentChange),
      schedulePreview: schedulePreview(result.schedule, this.data.scheduleStartYm),
      copyText
    }
  },

  buildExactPrepayResult() {
    const form = this.data.prepayForm
    const context = this.loanContextLines()
    const invalid = (error, level) => ({
      valid: false,
      exactMode: true,
      error,
      errorLevel: level || 'error',
      summaryText: '',
      remainingBalance: '—',
      afterPrepayBalance: '—',
      accruedInterest: '—',
      settlementTotal: '—',
      futureInterestSaved: '—',
      netFutureInterestSaved: '—',
      penalty: '—',
      oldRemainingMonths: '—',
      newRemainingMonths: '—',
      oldMonthlyPayment: '—',
      newMonthlyPayment: '—',
      scopeText: '',
      schedulePreview: [],
      copyText: invalidCopy(context, error)
    })

    const balance = parseNumberField(form.remainingPrincipal, '当前剩余本金', { positive: true })
    if (!balance.valid) return invalid(balance.error, balance.level)
    const term = parseNumberField(form.remainingMonths, '剩余期数', { integer: true, min: 1, max: 600 })
    if (!term.valid) return invalid(term.error, term.level)
    const rate = parseNumberField(form.annualRate, rateLabel(form.rateMode), { min: 0 })
    if (!rate.valid) return invalid(rate.error, rate.level)
    const prepay = parseNumberField(form.prepayPrincipal, '提前归还本金', { positive: true })
    if (!prepay.valid) return invalid(prepay.error, prepay.level)
    const penalty = parseOptionalNumber(form.penaltyValue, '违约金', { min: 0 })
    if (!penalty.valid) return invalid(penalty.error, penalty.level)

    const options = {
      remainingPrincipal: amount(form.remainingPrincipal, form.unit),
      remainingMonths: term.value,
      annualRate: asAnnualRate(form.annualRate, form.rateMode),
      method: form.method,
      prepayPrincipal: amount(form.prepayPrincipal, form.unit),
      reduceMode: form.reduceMode,
      penaltyType: form.penaltyType,
      penaltyValue: form.penaltyType === 'fixed'
        ? amount(penalty.empty ? 0 : form.penaltyValue, form.unit)
        : (penalty.empty ? 0 : penalty.value)
    }

    if (form.settlementMode === 'statement') {
      const settlementInterest = parseNumberField(form.settlementInterest, '账单应计利息', { min: 0 })
      if (!settlementInterest.valid) return invalid(settlementInterest.error, settlementInterest.level)
      options.settlementInterest = amount(form.settlementInterest, form.unit)
    } else {
      options.lastSettledDate = form.lastSettledDate
      options.prepayDate = form.prepayDate
      options.dayCount = form.dayCount
    }

    const result = loan.calcExactPrepayment(options)
    if (!result.valid) return invalid(engineErrorText(result.error))

    const penaltyKnown = !penalty.empty
    let scopeText = result.precisionMode === 'statement'
      ? '账单应计利息已录入；后续还款计划仍按固定利率和剩余期数估算，以结清试算单为准。'
      : `按 ${result.dayCount} 估算 ${result.accrualDays} 天应计利息；后续还款计划仍为估算。`
    if (!penaltyKnown) scopeText += ' 违约金尚未核对，当前按 0 暂估。'
    const futureNet = result.netFutureInterestSaved
    const summaryText = !penaltyKnown
      ? '预计节省后续计划利息约 ' + money(result.futureInterestSaved) + ' 元；违约金未核对'
      : (futureNet < 0
          ? '扣违约金后，预计后续计划利息反而多支出约 ' + money(Math.abs(futureNet)) + ' 元'
          : '扣违约金后，预计节省后续计划利息约 ' + money(futureNet) + ' 元')
    const copyText = context.concat([
      '提前还款口径：' + scopeText,
      `剩余本金：${money(result.remainingBalance)} 元`,
      `提前归还本金：${money(result.prepayPrincipal)} 元`,
      `本次结算预计支付：${money(result.settlementTotal)} 元（含应计利息 ${money(result.accruedInterest)} 元、${penaltyKnown ? '违约金 ' + money(result.penalty) + ' 元' : '违约金未核对，当前按 0 暂估'}）`,
      `预计节省后续计划利息：${money(result.futureInterestSaved)} 元`,
      penaltyKnown
        ? `扣违约金后预计节省后续计划利息：${money(result.netFutureInterestSaved)} 元`
        : `预计节省后续计划利息：${money(result.futureInterestSaved)} 元（未含未核对违约金）`,
      `原剩余期数：${result.oldRemainingMonths} 期`,
      `新剩余期数：${result.newRemainingMonths} 期`,
      `原月供：${money(result.oldMonthlyPayment)} 元`,
      `新月供：${money(result.newMonthlyPayment)} 元`
    ]).join('\n')

    return {
      valid: true,
      exactMode: true,
      error: '',
      errorLevel: '',
      summaryText,
      scopeText,
      penaltyKnown,
      netSavedLabel: penaltyKnown ? '扣违约金后省后续利息' : '预计省后续利息（未含违约金）',
      remainingBalance: money(result.remainingBalance),
      afterPrepayBalance: money(result.afterPrepayBalance),
      accruedInterest: money(result.accruedInterest),
      settlementTotal: money(result.settlementTotal),
      futureInterestSaved: money(result.futureInterestSaved),
      netFutureInterestSaved: money(result.netFutureInterestSaved),
      penalty: money(result.penalty),
      netSavedNegative: result.netFutureInterestSaved < 0,
      oldRemainingMonths: result.oldRemainingMonths,
      newRemainingMonths: result.newRemainingMonths,
      oldMonthlyPayment: money(result.oldMonthlyPayment),
      newMonthlyPayment: money(result.newMonthlyPayment),
      schedulePreview: schedulePreview(result.schedule, this.data.scheduleStartYm),
      copyText
    }
  },

  buildPrepayResult() {
    const form = this.data.prepayForm
    if (form.mode === 'exact') return this.buildExactPrepayResult()
    const context = this.loanContextLines()
    const invalid = (error, level) => ({
      valid: false,
      error,
      errorLevel: level || 'error',
      summaryText: '',
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
    if (!principalField.valid) return invalid(principalField.error, principalField.level)
    const term = parseNumberField(form.months, '总期数', { integer: true, min: 1, max: 600 })
    if (!term.valid) return invalid(term.error, term.level)
    const rate = parseNumberField(form.annualRate, rateLabel(form.rateMode), { min: 0 })
    if (!rate.valid) return invalid(rate.error, rate.level)
    const paid = parseNumberField(form.paidMonths, '已还期数', { integer: true, min: 0, max: term.value })
    if (!paid.valid) return invalid(paid.error, paid.level)
    const prepay = parseNumberField(form.prepayAmount, '提前还款金额', { positive: true })
    if (!prepay.valid) return invalid(prepay.error, prepay.level)
    const currentBalanceField = parseOptionalNumber(form.currentBalance, '当前剩余本金', { positive: true })
    if (!currentBalanceField.valid) return invalid(currentBalanceField.error, currentBalanceField.level)
    const penaltyField = form.penaltyMode === 'amount'
      ? parseOptionalNumber(form.penaltyAmount, '违约金额', { min: 0 })
      : parseOptionalNumber(form.penaltyPercent, '违约金比例', { min: 0 })
    if (!penaltyField.valid) return invalid(penaltyField.error, penaltyField.level)

    const penaltyKnown = !penaltyField.empty
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
      penaltyKnown ? `违约金：${money(result.penalty)} 元` : '违约金：未核对（当前按 0 暂估）',
      penaltyKnown
        ? `净省（扣违约金）：${money(result.netSaved)} 元`
        : `预计节省利息：${money(result.interestSaved)} 元（未含未核对违约金）`,
      `原剩余期数：${result.oldRemainingMonths} 期`,
      `新剩余期数：${result.newRemainingMonths} 期`,
      `新月供：${money(result.newMonthlyPayment)} 元`
    ]).join('\n')

    const prepaySummary = !penaltyKnown
      ? '预计节省利息约 ' + money(result.interestSaved) + ' 元；违约金未核对'
      : (result.netSaved < 0
          ? '扣违约金后不划算，净亏约 ' + money(Math.abs(result.netSaved)) + ' 元'
          : '扣违约金后净省约 ' + money(result.netSaved) + ' 元')
    return {
      valid: true,
      error: '',
      errorLevel: '',
      summaryText: prepaySummary,
      remainingBalance: money(result.remainingBalance),
      afterPrepayBalance: money(result.afterPrepayBalance),
      oldRemainingInterest: money(result.oldRemainingInterest),
      newRemainingInterest: money(result.newRemainingInterest),
      interestSaved: money(result.interestSaved),
      penalty: money(result.penalty),
      penaltyKnown,
      netSaved: money(result.netSaved),
      netSavedLabel: penaltyKnown ? '净省（扣违约金）' : '预计省利息（未含违约金）',
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
