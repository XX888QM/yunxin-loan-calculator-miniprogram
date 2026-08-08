const assert = require('assert')
const fs = require('fs')
const path = require('path')
const packageMetadata = require('../package.json')

let page
let writtenFile
let openedFile
let shareMenuOptions
let toastOptions
const localStorage = {}
global.wx = {
  env: { USER_DATA_PATH: '/tmp' },
  setClipboardData() {},
  showShareMenu(options) {
    shareMenuOptions = options
  },
  getFileSystemManager() {
    return {
      writeFile(options) {
        writtenFile = options
        options.success()
      }
    }
  },
  openDocument(options) {
    openedFile = options
  },
  getStorageSync(key) {
    return localStorage[key]
  },
  setStorageSync(key, value) {
    localStorage[key] = value
  },
  removeStorageSync(key) {
    delete localStorage[key]
  },
  showToast(options) {
    toastOptions = options
  },
  showModal(options) {
    options.success({ confirm: true, cancel: false })
  }
}
global.Page = function (config) {
  page = config
}
global.getApp = function () {
  return { globalData: { version: packageMetadata.version } }
}

require('../pages/index/index.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

page.data = clone(page.data)
page.setData = function (patch, callback) {
  Object.keys(patch).forEach((path) => {
    const parts = path.split('.')
    let target = this.data
    while (parts.length > 1) {
      target = target[parts.shift()]
    }
    target[parts[0]] = patch[path]
  })
  if (callback) callback()
}

page.onLoad()
assert.strictEqual(page.data.appVersion, packageMetadata.version)
assert.deepStrictEqual(shareMenuOptions.menus, ['shareAppMessage', 'shareTimeline'])
assert.strictEqual(page.data.loanType, 'car')
assert.deepStrictEqual(page.data.toolList.map((item) => item.label), ['算月供', '折算利率', '平息换算', '尾款贷', '落地总价'])
assert.deepStrictEqual(page.data.termOptionList.map((item) => item.label), ['12期', '24期', '36期', '48期', '60期'])
assert.ok(page.data.paymentResult.copyText.includes('贷款类型：车贷'))

page.setLoanType({ currentTarget: { dataset: { value: 'home' } } })
assert.strictEqual(page.data.loanType, 'home')
assert.deepStrictEqual(page.data.toolList.map((item) => item.label), ['算月供', '组合贷', '反推本金', '提前还款', 'LPR情景'])
assert.deepStrictEqual(page.data.termOptionList.map((item) => item.label), ['5年', '10年', '20年', '30年'])

page.switchTool({ currentTarget: { dataset: { tool: 'combo' } } })
assert.strictEqual(page.data.activeTool, 'combo')
assert.strictEqual(page.data.loanType, 'home')
assert.deepStrictEqual(page.data.termOptionList.map((item) => item.label), ['5年', '10年', '20年', '30年'])

page.data.paymentForm = {
  principal: '350000',
  months: '36',
  annualRate: '7.08',
  rateMode: 'annual',
  method: 'equalInstallment'
}
const annualPayment = page.buildPaymentResult().primaryPayment
page.data.paymentForm.annualRate = '0.59'
page.data.paymentForm.rateMode = 'monthly'
assert.strictEqual(page.buildPaymentResult().primaryPayment, annualPayment)

page.data.actualForm = {
  principal: '350000',
  months: '36',
  monthlyPayment: '11816.50',
  claimedMonthlyRate: '0.59',
  claimedRateMode: 'monthly'
}
assert.ok(page.buildActualResult().copyText.includes('对外月息：0.59%'))
page.data.actualForm.claimedMonthlyRate = '7.08'
page.data.actualForm.claimedRateMode = 'annual'
assert.ok(page.buildActualResult().copyText.includes('对外年化：7.08%'))

page.data.paymentForm = {
  principal: '35',
  months: '36',
  annualRate: '13.14',
  rateMode: 'annual',
  method: 'equalInstallment',
  unit: 'wan',
  inputMode: 'loan',
  carPrice: '',
  downRatio: '',
  downPayment: ''
}
const wanPayment = page.buildPaymentResult().primaryPayment
page.data.paymentForm.unit = 'yuan'
page.data.paymentForm.principal = '350000'
assert.strictEqual(page.buildPaymentResult().primaryPayment, wanPayment)

page.setLoanType({ currentTarget: { dataset: { value: 'home' } } })
assert.strictEqual(page.data.paymentForm.unit, 'wan')
page.setLoanType({ currentTarget: { dataset: { value: 'car' } } })
assert.strictEqual(page.data.paymentForm.unit, 'yuan')

page.data.paymentForm = {
  principal: '',
  months: '36',
  annualRate: '13.14',
  rateMode: 'annual',
  method: 'equalInstallment',
  unit: 'yuan',
  inputMode: 'price',
  carPrice: '437000',
  downRatio: '20',
  downPayment: ''
}
const priceResult = page.buildPaymentResult()
assert.strictEqual(priceResult.loanAmount, '349600.00')
assert.ok(priceResult.copyText.includes('车价'))

page.data.paymentForm.downRatio = ''
page.data.paymentForm.downPayment = '87000'
assert.strictEqual(page.buildPaymentResult().loanAmount, '350000.00')

// 联动：点比例清自定义额，输自定义额清比例
page.setFormValue({ currentTarget: { dataset: { form: 'paymentForm', field: 'downRatio', value: '30' } } })
assert.strictEqual(page.data.paymentForm.downPayment, '')
page.onInput({ currentTarget: { dataset: { form: 'paymentForm', field: 'downPayment' } }, detail: { value: '50000' } })
assert.strictEqual(page.data.paymentForm.downRatio, '')

page.data.actualForm = {
  principal: '350000',
  months: '36',
  monthlyPayment: '',
  totalInterest: '75394',
  inputMode: 'interest',
  upfrontFee: '0',
  claimedMonthlyRate: '0.59',
  claimedRateMode: 'monthly',
  unit: 'yuan'
}
const interestModeResult = page.buildActualResult()
assert.strictEqual(interestModeResult.monthlyRate, '1.0950%')

page.data.actualForm.months = '9999'
const cappedInterestMode = page.buildActualResult()
assert.strictEqual(cappedInterestMode.valid, false)
assert.ok(cappedInterestMode.error.includes('600'))

page.data.actualForm.inputMode = 'payment'
page.data.actualForm.months = '36'
page.data.actualForm.monthlyPayment = '11816.50'
page.data.actualForm.upfrontFee = '10000'
const feeResult = page.buildActualResult()
assert.ok(parseFloat(feeResult.feeAdjustedMonthlyRate) > parseFloat(feeResult.monthlyRate))
assert.ok(feeResult.copyText.includes('含已录入费用'))

page.data.prepayForm = {
  principal: '350000',
  months: '36',
  annualRate: '13.14',
  rateMode: 'annual',
  paidMonths: '12',
  prepayAmount: '50000',
  reduceMode: 'term',
  penaltyMode: 'percent',
  penaltyPercent: '3',
  penaltyAmount: '',
  unit: 'yuan'
}
const prepayRes = page.buildPrepayResult()
assert.strictEqual(prepayRes.penalty, '1500.00')
assert.strictEqual(prepayRes.netSavedNegative, false)
assert.ok(prepayRes.copyText.includes('净省'))

page.data.prepayForm.paidMonths = '34'
page.data.prepayForm.prepayAmount = '20000'
page.data.prepayForm.penaltyPercent = '10'
assert.strictEqual(page.buildPrepayResult().netSavedNegative, true)

page.data.balloonForm = {
  principal: '200000',
  months: '36',
  annualRate: '14.4',
  rateMode: 'annual',
  balloonRatio: '40',
  balloonAmount: '',
  unit: 'yuan'
}
const balloonRes = page.buildBalloonResult()
assert.ok(balloonRes.copyText.includes('尾款：80000.00 元'))
assert.ok(parseFloat(balloonRes.monthlyPayment.replace(/,/g, '')) < parseFloat(balloonRes.normalMonthly.replace(/,/g, '')))
assert.ok(balloonRes.schedulePreview.length === 36)

page.data.scheduleStartYm = '2026-11'
page.data.paymentForm = {
  principal: '120000', months: '4', annualRate: '0', rateMode: 'annual',
  method: 'equalInstallment', unit: 'yuan',
  inputMode: 'loan', carPrice: '', downRatio: '', downPayment: ''
}
const calRows = page.buildPaymentResult().schedulePreview
assert.deepStrictEqual(calRows.map((row) => row.label), ['2026-11', '2026-12', '2027-01', '2027-02'])
page.data.activeTool = 'payment'
page.data.loanType = 'car'
page.data.activeSchedulePreview = calRows
writtenFile = undefined
openedFile = undefined
page.exportSchedulePdf()
assert.ok(writtenFile.filePath.endsWith('.pdf'))
assert.ok(writtenFile.data instanceof ArrayBuffer)
assert.strictEqual(openedFile.fileType, 'pdf')

const friendShare = page.onShareAppMessage()
assert.strictEqual(friendShare.title, '云鑫真实贷款计算器')
assert.strictEqual(friendShare.path, '/pages/index/index')

const timelineShare = page.onShareTimeline()
assert.strictEqual(timelineShare.title, '云鑫真实贷款计算器')
page.data.scheduleStartYm = ''
assert.strictEqual(page.buildPaymentResult().schedulePreview[0].label, '1')

const wxml = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
assert.ok(!wxml.includes('\u5398'))
assert.ok(wxml.includes('月份'))
assert.ok(wxml.includes('bindtap="exportSchedulePdf"'))
assert.ok(wxml.includes('open-type="share"'))
assert.ok(wxml.includes('>分享</button>'))
assert.ok(wxml.includes('>导出PDF</button>'))

const wxss = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxss'), 'utf8')
assert.ok(wxss.includes('grid-template-columns: 106rpx repeat(4, minmax(0, 1fr))'))
assert.ok(!wxss.includes('width: 1208rpx'))
assert.ok(wxss.includes('.schedule-meta .field-picker'))
assert.ok(wxss.includes('flex-wrap: nowrap'))
assert.ok(wxss.includes('width: 76rpx'))
assert.ok(wxss.includes('width: 132rpx'))



// ---- 准确性加固回归测试 ----
page.data.activeTool = 'payment'
page.data.loanType = 'car'
page.data.paymentForm = {
  principal: '350000', months: '36', annualRate: '7.08', rateMode: 'annual',
  method: 'equalInstallment', unit: 'yuan', inputMode: 'loan',
  carPrice: '', downRatio: '', downPayment: ''
}
const paymentBeforeUnitSwitch = page.buildPaymentResult()
page.setFormValue({ currentTarget: { dataset: { form: 'paymentForm', field: 'unit', value: 'wan' } } })
assert.strictEqual(page.data.paymentForm.principal, '35')
assert.strictEqual(page.buildPaymentResult().primaryPayment, paymentBeforeUnitSwitch.primaryPayment)
page.setFormValue({ currentTarget: { dataset: { form: 'paymentForm', field: 'unit', value: 'yuan' } } })
assert.strictEqual(page.data.paymentForm.principal, '350000')
assert.strictEqual(page.buildPaymentResult().totalPayment, paymentBeforeUnitSwitch.totalPayment)

// 贷款类型切换也不能重新解释已有金额
page.data.paymentForm.principal = '350000'
page.data.paymentForm.unit = 'yuan'
page.setLoanType({ currentTarget: { dataset: { value: 'home' } } })
assert.strictEqual(page.data.paymentForm.unit, 'wan')
assert.strictEqual(page.data.paymentForm.principal, '35')
page.setLoanType({ currentTarget: { dataset: { value: 'car' } } })
assert.strictEqual(page.data.paymentForm.unit, 'yuan')
assert.strictEqual(page.data.paymentForm.principal, '350000')

// 必填项为空时不得暗中按1期或30年计算
page.data.paymentForm = {
  principal: '350000', months: '', annualRate: '7.08', rateMode: 'annual',
  method: 'equalInstallment', unit: 'yuan', inputMode: 'loan',
  carPrice: '', downRatio: '', downPayment: ''
}
const invalidPayment = page.buildPaymentResult()
assert.strictEqual(invalidPayment.valid, false)
assert.strictEqual(invalidPayment.primaryPayment, '—')
assert.strictEqual(invalidPayment.schedulePreview.length, 0)

page.data.comboForm = {
  commercialPrincipal: '100', commercialRate: '3.45', fundPrincipal: '50', fundRate: '2.85',
  years: '', rateMode: 'annual', method: 'equalInstallment', unit: 'wan'
}
assert.strictEqual(page.buildComboResult().valid, false)

// 尾款现金流应能在查真利率中往返回原利率
;(function () {
  const P = 200000, B = 80000, m = 36, r = 0.012
  const pay = (P - B / Math.pow(1 + r, m)) * r / (1 - Math.pow(1 + r, -m))
  page.data.actualForm = {
    principal: String(P), months: String(m), monthlyPayment: String(pay), totalInterest: '',
    inputMode: 'payment', paymentStructure: 'balloon', balloonAmount: String(B),
    upfrontFee: '', claimedMonthlyRate: '', claimedRateMode: 'monthly', unit: 'yuan'
  }
  const result = page.buildActualResult()
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.monthlyRate, '1.2000%')
})()

page.data.actualForm.upfrontFee = '200000'
const invalidFee = page.buildActualResult()
assert.strictEqual(invalidFee.valid, false)
assert.ok(invalidFee.error.includes('前置费用'))

// 提前还款支持等额本金与当前剩余本金
page.data.prepayForm = {
  principal: '100', months: '360', annualRate: '3.1', rateMode: 'annual',
  paidMonths: '120', prepayAmount: '10', reduceMode: 'payment',
  method: 'equalPrincipal', currentBalance: '',
  penaltyMode: 'percent', penaltyPercent: '', penaltyAmount: '', unit: 'wan'
}
const equalPrincipalPrepay = page.buildPrepayResult()
assert.strictEqual(equalPrincipalPrepay.valid, true)
assert.strictEqual(equalPrincipalPrepay.remainingBalance, '666666.67')
page.data.prepayForm.currentBalance = '70'
assert.strictEqual(page.buildPrepayResult().remainingBalance, '700000.00')


// 其他表单的万元/元切换也必须保持实际金额
page.data.comboForm = {
  commercialPrincipal: '100', commercialRate: '3.45', fundPrincipal: '50', fundRate: '2.85',
  years: '30', rateMode: 'annual', method: 'equalInstallment', unit: 'wan'
}
page.setFormValue({ currentTarget: { dataset: { form: 'comboForm', field: 'unit', value: 'yuan' } } })
assert.strictEqual(page.data.comboForm.commercialPrincipal, '1000000')
assert.strictEqual(page.data.comboForm.fundPrincipal, '500000')

page.data.actualForm = {
  principal: '35', months: '36', monthlyPayment: '11816.5', totalInterest: '7.5394',
  inputMode: 'payment', paymentStructure: 'balloon', balloonAmount: '8',
  upfrontFee: '1', claimedMonthlyRate: '', claimedRateMode: 'monthly', unit: 'wan'
}
page.setFormValue({ currentTarget: { dataset: { form: 'actualForm', field: 'unit', value: 'yuan' } } })
assert.strictEqual(page.data.actualForm.principal, '350000')
assert.strictEqual(page.data.actualForm.totalInterest, '75394')
assert.strictEqual(page.data.actualForm.balloonAmount, '80000')
assert.strictEqual(page.data.actualForm.upfrontFee, '10000')
assert.strictEqual(page.data.actualForm.monthlyPayment, '11816.5')

page.data.flatForm = { principal: '35', months: '36', monthlyFlatRate: '0.59', rateMode: 'monthly', unit: 'wan' }
page.setFormValue({ currentTarget: { dataset: { form: 'flatForm', field: 'unit', value: 'yuan' } } })
assert.strictEqual(page.data.flatForm.principal, '350000')

page.data.balloonForm = {
  principal: '20', months: '36', annualRate: '14.4', rateMode: 'annual',
  balloonRatio: '', balloonAmount: '8', unit: 'wan'
}
page.setFormValue({ currentTarget: { dataset: { form: 'balloonForm', field: 'unit', value: 'yuan' } } })
assert.strictEqual(page.data.balloonForm.principal, '200000')
assert.strictEqual(page.data.balloonForm.balloonAmount, '80000')

page.data.prepayForm = {
  principal: '100', months: '360', annualRate: '3.1', rateMode: 'annual', paidMonths: '120',
  prepayAmount: '10', method: 'equalPrincipal', currentBalance: '70', reduceMode: 'payment',
  penaltyMode: 'amount', penaltyPercent: '', penaltyAmount: '1', unit: 'wan'
}
page.setFormValue({ currentTarget: { dataset: { form: 'prepayForm', field: 'unit', value: 'yuan' } } })
assert.strictEqual(page.data.prepayForm.principal, '1000000')
assert.strictEqual(page.data.prepayForm.prepayAmount, '100000')
assert.strictEqual(page.data.prepayForm.currentBalance, '700000')
assert.strictEqual(page.data.prepayForm.penaltyAmount, '10000')

// 先息后本现金流和无根现金流应正确区分
page.data.actualForm = {
  principal: '120000', months: '12', monthlyPayment: '1200', totalInterest: '',
  inputMode: 'payment', paymentStructure: 'interestOnly', balloonAmount: '',
  upfrontFee: '', claimedMonthlyRate: '', claimedRateMode: 'monthly', unit: 'yuan'
}
const interestOnlyRate = page.buildActualResult()
assert.strictEqual(interestOnlyRate.valid, true)
assert.strictEqual(interestOnlyRate.monthlyRate, '1.0000%')
assert.strictEqual(interestOnlyRate.claimedMonthlyGap, '未填写')

page.data.actualForm.paymentStructure = 'equalPayment'
page.data.actualForm.monthlyPayment = '1000'
const insufficientRate = page.buildActualResult()
assert.strictEqual(insufficientRate.valid, false)
assert.ok(insufficientRate.error.includes('现金流不足'))

// 零利率是合法输入；首付和尾款超限必须报错
page.data.paymentForm = {
  principal: '120000', months: '12', annualRate: '0', rateMode: 'annual',
  method: 'equalInstallment', unit: 'yuan', inputMode: 'loan',
  carPrice: '', downRatio: '', downPayment: ''
}
assert.strictEqual(page.buildPaymentResult().valid, true)
assert.strictEqual(page.buildPaymentResult().primaryPayment, '10000.00')

page.data.paymentForm = {
  principal: '', months: '36', annualRate: '7.08', rateMode: 'annual',
  method: 'equalInstallment', unit: 'yuan', inputMode: 'price',
  carPrice: '200000', downRatio: '', downPayment: '210000'
}
assert.strictEqual(page.buildPaymentResult().valid, false)
assert.ok(page.buildPaymentResult().error.includes('首付'))
assert.strictEqual(page.buildPaymentResult().errorLevel, 'error')

page.data.balloonForm = {
  principal: '200000', months: '36', annualRate: '14.4', rateMode: 'annual',
  balloonRatio: '', balloonAmount: '210000', unit: 'yuan'
}
assert.strictEqual(page.buildBalloonResult().valid, false)
assert.ok(page.buildBalloonResult().error.includes('尾款'))
assert.strictEqual(page.buildBalloonResult().errorLevel, 'error')

// 空表单只做灰色提示，不当成红色报错
page.data.paymentForm = {
  principal: '', months: '', annualRate: '', rateMode: 'annual',
  method: 'equalInstallment', unit: 'yuan', inputMode: 'loan',
  carPrice: '', downRatio: '', downPayment: ''
}
const emptyPayment = page.buildPaymentResult()
assert.strictEqual(emptyPayment.valid, false)
assert.ok(emptyPayment.error.includes('请输入'))
assert.strictEqual(emptyPayment.errorLevel, 'hint')

page.data.paymentForm = {
  principal: '100000', months: 'abc', annualRate: '7', rateMode: 'annual',
  method: 'equalInstallment', unit: 'yuan', inputMode: 'loan',
  carPrice: '', downRatio: '', downPayment: ''
}
const badMonths = page.buildPaymentResult()
assert.strictEqual(badMonths.valid, false)
assert.ok(badMonths.error.includes('整数') || badMonths.error.includes('格式'))
assert.strictEqual(badMonths.errorLevel, 'error')


// 页面显示的明细合计必须与结果区汇总完全一致
page.data.activeTool = 'payment'
page.data.loanType = 'home'
page.data.paymentForm = {
  principal: '100', months: '360', annualRate: '3.1', rateMode: 'annual',
  method: 'equalInstallment', unit: 'wan', inputMode: 'loan',
  carPrice: '', downRatio: '', downPayment: ''
}
const centAccuratePayment = page.buildPaymentResult()
function displayedCents(value) {
  return Math.round(Number(String(value).replace(/,/g, '')) * 100)
}
assert.strictEqual(
  centAccuratePayment.schedulePreview.reduce((sum, row) => sum + displayedCents(row.payment), 0),
  displayedCents(centAccuratePayment.totalPayment)
)
assert.strictEqual(
  centAccuratePayment.schedulePreview.reduce((sum, row) => sum + displayedCents(row.principal), 0),
  displayedCents(centAccuratePayment.loanAmount)
)
assert.strictEqual(
  centAccuratePayment.schedulePreview.reduce((sum, row) => sum + displayedCents(row.interest), 0),
  displayedCents(centAccuratePayment.totalInterest)
)

// 实时输入只重算当前工具，避免反复构造所有长期明细
;(function () {
  const builderNames = [
    'buildPaymentResult', 'buildComboResult', 'buildBudgetResult',
    'buildActualResult', 'buildFlatResult', 'buildBalloonResult', 'buildPrepayResult',
    'buildCarCostResult', 'buildLprResult'
  ]
  const originals = {}
  const calls = []
  builderNames.forEach((name) => {
    originals[name] = page[name]
    page[name] = function () {
      calls.push(name)
      return { valid: true, error: '', schedulePreview: [], copyText: '' }
    }
  })
  page.data.activeTool = 'flat'
  page.recalculate()
  assert.deepStrictEqual(calls, ['buildFlatResult'])
  builderNames.forEach((name) => { page[name] = originals[name] })
})()

const latestWxml = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
assert.ok(latestWxml.includes('月利率%'))
assert.ok(latestWxml.includes('名义年化'))
assert.ok(latestWxml.includes('当前剩余本金'))
assert.ok(latestWxml.includes('一键示例'))
assert.ok(latestWxml.includes('一句话结论'))
assert.ok(latestWxml.includes('activeScheduleDisplay'))
assert.ok(latestWxml.includes('bindtap="fillSample"'))
assert.ok(latestWxml.includes('result-copy-btn'))
assert.ok(!latestWxml.includes('class="copy-btn"'))

// 一键示例只填当前工具表单，不改计算口径；算月供数字与引擎一致
page.setLoanType({ currentTarget: { dataset: { value: 'car' } } })
page.switchTool({ currentTarget: { dataset: { tool: 'payment' } } })
page.fillSample()
assert.strictEqual(page.data.paymentForm.principal, '200000')
assert.strictEqual(page.data.paymentForm.months, '36')
assert.strictEqual(page.data.paymentResult.valid, true)
assert.ok(page.data.paymentResult.summaryText.includes('月供'))
assert.ok(page.data.paymentResult.summaryText.includes('总利息'))
const loanEngine = require('../utils/loan')
const enginePayment = loanEngine.calculateByMethod(200000, 13.14, 36, 'equalInstallment')
assert.strictEqual(page.data.paymentResult.primaryPayment, loanEngine.formatMoney(enginePayment.monthlyPayment))
assert.strictEqual(page.data.paymentResult.totalInterest, loanEngine.formatMoney(enginePayment.totalInterest))
assert.strictEqual(page.data.scheduleTotalCount, 36)
assert.strictEqual(page.data.activeScheduleDisplay.length, 12)
assert.strictEqual(page.data.activeSchedulePreview.length, 36)
assert.strictEqual(page.data.scheduleTruncated, true)

// 首付比例即时显示金额（展示层，不改贷款额计算）
page.setFormValue({
  currentTarget: { dataset: { form: 'paymentForm', field: 'inputMode', value: 'price' } }
})
page.setFormValue({
  currentTarget: { dataset: { form: 'paymentForm', field: 'unit', value: 'wan' } }
})
page.onInput({
  currentTarget: { dataset: { form: 'paymentForm', field: 'carPrice' } },
  detail: { value: '20' }
})
page.setFormValue({
  currentTarget: { dataset: { form: 'paymentForm', field: 'downRatio', value: '30' } }
})
assert.ok(page.data.downRatioAmountHint.includes('6'))
assert.strictEqual(page.data.paymentResult.loanAmount, '140000.00')

// 四步报价：不能跳过用途、车贷期数上限或还款输入。
page.data.quoteForm = {
  purpose: '', principal: '', months: '', structure: 'equalPayment',
  monthlyPayment: '', balloonAmount: '', feeStatus: 'unknown', upfrontFee: '', periodicFee: '',
  claimedRate: '', claimedRateMode: 'annual', prepayKnown: ''
}
page.data.quoteSelectedPurpose = ''
page.startQuoteForPurpose({ currentTarget: { dataset: { purpose: 'home' } } })
assert.strictEqual(page.data.screenMode, 'quote')
assert.strictEqual(page.data.quoteForm.purpose, 'home')
assert.strictEqual(page.data.quoteForm.months, '360')
page.previousQuoteStep()
assert.strictEqual(page.data.screenMode, 'home')
page.startQuickCalc()
assert.strictEqual(page.data.screenMode, 'quote')
assert.strictEqual(page.data.quoteStep, 1)
page.nextQuoteStep()
assert.strictEqual(page.data.quoteStep, 1)
assert.strictEqual(toastOptions.title, '请先选择用途')
page.setQuotePurpose({ currentTarget: { dataset: { purpose: 'car' } } })
assert.strictEqual(page.data.quoteSelectedPurpose, 'car')
assert.strictEqual(page.data.quoteForm.months, '36')
page.setQuotePurpose({ currentTarget: { dataset: { purpose: 'home' } } })
assert.strictEqual(page.data.quoteForm.months, '360')
page.setQuotePurpose({ currentTarget: { dataset: { purpose: 'car' } } })
assert.strictEqual(page.data.quoteForm.months, '36')
page.nextQuoteStep()
assert.strictEqual(page.data.quoteStep, 2)
page.data.quoteForm.principal = '200000'
page.data.quoteForm.months = '121'
page.nextQuoteStep()
assert.strictEqual(page.data.quoteStep, 2)
assert.ok(toastOptions.title.includes('120'))
page.data.quoteForm.months = '36'
page.nextQuoteStep()
assert.strictEqual(page.data.quoteStep, 3)
page.nextQuoteStep()
assert.strictEqual(page.data.quoteStep, 3)
assert.strictEqual(toastOptions.title, '请输入每期还款')

// 未知费用只能给最低口径，不能进入报价对比；确认后可本机保存和导出报告。
page.data.quoteForm = {
  purpose: 'car', principal: '200000', months: '36', structure: 'equalPayment',
  monthlyPayment: '6750', balloonAmount: '', feeStatus: 'unknown', upfrontFee: '', periodicFee: '',
  claimedRate: '', claimedRateMode: 'annual', prepayKnown: ''
}
page.nextQuoteStep()
assert.strictEqual(page.data.quoteStep, 4)
const incompleteQuote = page.data.quoteResult
assert.strictEqual(incompleteQuote.valid, true)
assert.strictEqual(incompleteQuote.comparable, false)
assert.ok(incompleteQuote.annualEffectiveRate.startsWith('≥'))
assert.ok(incompleteQuote.checklist.some((item) => item.includes('费用还未核对')))

page.data.quoteForm.feeStatus = 'known'
const incompleteKnownFeeQuote = page.buildQuoteResult()
assert.strictEqual(incompleteKnownFeeQuote.valid, true)
assert.strictEqual(incompleteKnownFeeQuote.comparable, false)
assert.ok(incompleteKnownFeeQuote.annualEffectiveRate.startsWith('≥'))

page.data.quoteForm.upfrontFee = '5000'
page.data.quoteForm.periodicFee = '50'
page.data.quoteForm.claimedRate = '0.59'
page.data.quoteForm.claimedRateMode = 'monthly'
page.data.quoteForm.prepayKnown = 'no'
const completeQuote = page.buildQuoteResult()
assert.strictEqual(completeQuote.valid, true)
assert.strictEqual(completeQuote.comparable, true)
assert.ok(!completeQuote.annualEffectiveRate.startsWith('≥'))
assert.ok(completeQuote.raw.totalFinancingCost > 0)
assert.ok(completeQuote.copyText.includes('费用核对状态：已填写费用'))

page.data.quoteForm.structure = 'unsupported'
assert.strictEqual(page.buildQuoteResult().valid, false)
assert.ok(page.buildQuoteResult().error.includes('还款结构'))
page.data.quoteForm.structure = 'equalPayment'
page.data.quoteForm.claimedRateMode = 'unsupported'
assert.strictEqual(page.buildQuoteResult().valid, false)
assert.ok(page.buildQuoteResult().error.includes('利率口径'))
page.data.quoteForm.claimedRateMode = 'monthly'

page.data.quoteResult = completeQuote
page.data.quoteComparisons = []
page.addQuoteComparison()
assert.strictEqual(page.data.quoteComparisons.length, 1)
page.data.quoteResult = Object.assign({}, completeQuote, { purpose: 'home' })
page.addQuoteComparison()
assert.strictEqual(page.data.quoteComparisons.length, 1)
assert.ok(toastOptions.title.includes('不同用途'))
page.data.quoteResult = completeQuote
page.addQuoteComparison()
page.addQuoteComparison()
assert.strictEqual(page.data.quoteComparisons.length, 1)
assert.ok(toastOptions.title.includes('已在对比中'))
page.data.quoteForm.monthlyPayment = '6800'
page.data.quoteResult = page.buildQuoteResult()
page.addQuoteComparison()
page.data.quoteForm.monthlyPayment = '6900'
page.data.quoteResult = page.buildQuoteResult()
page.addQuoteComparison()
assert.strictEqual(page.data.quoteComparisons.length, 3)
page.data.quoteForm.monthlyPayment = '7000'
page.data.quoteResult = page.buildQuoteResult()
page.addQuoteComparison()
assert.strictEqual(page.data.quoteComparisons.length, 3)
assert.ok(toastOptions.title.includes('最多同时对比3份'))
page.removeQuoteComparison({ currentTarget: { dataset: { id: page.data.quoteComparisons[0].id } } })
assert.strictEqual(page.data.quoteComparisons.length, 2)
page.saveQuoteReport()
assert.strictEqual(page.data.quoteHistory.length, 1)
assert.strictEqual(page.data.quoteHistory[0].rateLabel, '折算年化')
assert.strictEqual(page.data.quoteHistory[0].costLabel, '已录入成本')
page.openHistory()
assert.strictEqual(page.data.screenMode, 'history')
assert.strictEqual(page.data.quoteHistory.length, 1)
const savedQuoteId = page.data.quoteHistory[0].id
page.restoreQuoteHistory({ currentTarget: { dataset: { id: savedQuoteId } } })
assert.strictEqual(page.data.screenMode, 'quote')
assert.strictEqual(page.data.quoteStep, 4)
page.openHistory()
page.confirmRemoveQuoteHistory({ currentTarget: { dataset: { id: savedQuoteId } } })
assert.strictEqual(page.data.quoteHistory.length, 0)
page.openTools()
assert.strictEqual(page.data.screenMode, 'tools')
writtenFile = undefined
openedFile = undefined
page.exportQuoteReport()
assert.ok(writtenFile.filePath.endsWith('.pdf'))
assert.ok(writtenFile.data instanceof ArrayBuffer)
assert.strictEqual(openedFile.fileType, 'pdf')

// 分期落地价：分期车价与全款车价、代扣费用分别计算，不能重复算首期现金。
page.data.carCostForm = {
  unit: 'yuan', cashVehiclePrice: '200000', installmentVehiclePrice: '205000',
  discount: '5000', purchaseTax: '10000', insurance: '6000', registrationFee: '1000',
  requiredOptions: '3000', purposeFunding: '150000', totalRepayment: '166000',
  upfrontFee: '3000', periodicFee: '0', upfrontFeePayment: 'deducted'
}
const carCost = page.buildCarCostResult()
assert.strictEqual(carCost.valid, true)
assert.ok(Number(carCost.installmentTotal) > Number(carCost.cashTotal))
assert.ok(carCost.copyText.includes('从放款中代扣'))

// LPR 只做手动情景，不假装实时利率或正式还款计划。
page.data.lprForm = {
  principal: '100', months: '360', initialLpr: '3.6', spreadBps: '-30',
  repriceMonth: '13', scenarioLpr: '3.3', method: 'equalInstallment', unit: 'wan'
}
const lprScenario = page.buildLprResult()
assert.strictEqual(lprScenario.valid, true)
assert.ok(lprScenario.schedulePreview.length === 360)
assert.ok(lprScenario.copyText.includes('手动 LPR 情景'))

// 账单结息模式只承诺本期结息已录入，后续计划必须标注为估算。
page.data.prepayForm = {
  mode: 'exact', unit: 'yuan', method: 'equalInstallment', remainingPrincipal: '100000',
  remainingMonths: '24', annualRate: '12', rateMode: 'annual', prepayPrincipal: '20000',
  settlementMode: 'statement', settlementInterest: '321.23', lastSettledDate: '', prepayDate: '',
  dayCount: 'ACT_365F', penaltyType: 'percentOfPrepay', penaltyValue: '3', reduceMode: 'payment'
}
const exactPrepay = page.buildPrepayResult()
assert.strictEqual(exactPrepay.valid, true)
assert.ok(exactPrepay.scopeText.includes('后续还款计划仍按固定利率'))
assert.ok(exactPrepay.copyText.includes('本次结算预计支付'))
assert.strictEqual(exactPrepay.penaltyKnown, true)
page.setFormValue({ currentTarget: { dataset: { form: 'prepayForm', field: 'unit', value: 'wan' } } })
assert.strictEqual(page.data.prepayForm.penaltyValue, '3')

// 违约金留空时不得把 0 当成已确认，也不得显示确定的“扣违约金后净省”。
page.data.prepayForm = {
  mode: 'quick', unit: 'yuan', method: 'equalInstallment', principal: '100000',
  months: '24', annualRate: '12', rateMode: 'annual', paidMonths: '6',
  prepayAmount: '20000', currentBalance: '', penaltyMode: 'percent',
  penaltyPercent: '', penaltyAmount: '', reduceMode: 'payment'
}
const unknownPenaltyQuick = page.buildPrepayResult()
assert.strictEqual(unknownPenaltyQuick.valid, true)
assert.strictEqual(unknownPenaltyQuick.penaltyKnown, false)
assert.ok(unknownPenaltyQuick.summaryText.includes('违约金未核对'))
assert.ok(unknownPenaltyQuick.netSavedLabel.includes('未含违约金'))

page.data.prepayForm = {
  mode: 'exact', unit: 'yuan', method: 'equalInstallment', remainingPrincipal: '100000',
  remainingMonths: '24', annualRate: '12', rateMode: 'annual', prepayPrincipal: '20000',
  settlementMode: 'statement', settlementInterest: '321.23', lastSettledDate: '', prepayDate: '',
  dayCount: 'ACT_365F', penaltyType: 'percentOfPrepay', penaltyValue: '', reduceMode: 'payment'
}
const unknownPenaltyExact = page.buildPrepayResult()
assert.strictEqual(unknownPenaltyExact.valid, true)
assert.strictEqual(unknownPenaltyExact.penaltyKnown, false)
assert.ok(unknownPenaltyExact.scopeText.includes('违约金尚未核对'))

const upgradedWxml = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
assert.ok(upgradedWxml.includes('quote-compare-add'))
assert.ok(upgradedWxml.includes('purpose-card-car'))
assert.ok(upgradedWxml.includes('purpose-card-home'))
assert.ok(!upgradedWxml.includes('purpose-image-wrap'))
assert.ok(!upgradedWxml.includes('quote-next-arrow'))
assert.ok(upgradedWxml.includes('quote-prepay-label'))
assert.ok(upgradedWxml.includes('quote-action-back'))
assert.ok(upgradedWxml.includes('quote-action-next'))
assert.ok(upgradedWxml.includes('quote-back-home'))
assert.ok(upgradedWxml.includes("quoteForm.purpose == 'home' ? '例如 360' : '例如 36'"))
assert.ok(upgradedWxml.includes('quote-result-navigation'))
assert.ok(upgradedWxml.includes('restoreQuoteHistory'))
assert.ok(upgradedWxml.includes('confirmClearQuoteHistory'))
assert.ok(upgradedWxml.includes("disabled=\"{{!quoteResult.comparable}}\""))
assert.ok(upgradedWxml.includes('费用确认后才能对比'))
assert.ok(upgradedWxml.includes("activeTool == 'carCost'"))
assert.ok(upgradedWxml.includes("activeTool == 'lpr'"))
assert.ok(upgradedWxml.includes('账单结息测算'))
assert.ok(upgradedWxml.includes('从放款中代扣'))
assert.ok(upgradedWxml.includes('class="home-version"'))

const indexScript = fs.readFileSync(path.join(__dirname, '../pages/index/index.js'), 'utf8')
const appScript = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8')
assert.ok(appScript.includes("version: '" + packageMetadata.version + "'"))
;[
  ['deductedFeeExceedsFundingGap', '从放款中代扣的前置费用不能超过贷款金额与实际用途金额的差额'],
  ['deductedFeeNotInContract', '从放款中代扣的前置费用未计入合同总还款，请核对合同总还款金额'],
  ['paymentTermMismatch', '按当前自定义还款额会提前结清，与剩余期数不一致'],
  ['unsupportedCustomPayment', '当前还款方式不支持这类自定义还款额']
].forEach(function (mapping) {
  assert.ok(indexScript.includes("if (error === '" + mapping[0] + "') return '" + mapping[1] + "'"))
})

console.log('page checks passed')
