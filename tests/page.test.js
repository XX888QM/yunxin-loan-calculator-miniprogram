const assert = require('assert')
const fs = require('fs')
const path = require('path')

let page
let writtenFile
let openedFile
let shareMenuOptions
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
  showToast() {}
}
global.Page = function (config) {
  page = config
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
assert.deepStrictEqual(shareMenuOptions.menus, ['shareAppMessage', 'shareTimeline'])
assert.strictEqual(page.data.loanType, 'car')
assert.deepStrictEqual(page.data.toolList.map((item) => item.label), ['算月供', '查真利率', '平息换算', '尾款贷'])
assert.deepStrictEqual(page.data.termOptionList.map((item) => item.label), ['12期', '24期', '36期', '48期', '60期'])
assert.ok(page.data.paymentResult.copyText.includes('贷款类型：车贷'))

page.setLoanType({ currentTarget: { dataset: { value: 'home' } } })
assert.strictEqual(page.data.loanType, 'home')
assert.deepStrictEqual(page.data.toolList.map((item) => item.label), ['算月供', '组合贷', '能贷多少', '提前还款'])
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
assert.strictEqual(priceResult.loanAmount, '349,600.00')
assert.ok(priceResult.copyText.includes('车价'))

page.data.paymentForm.downRatio = ''
page.data.paymentForm.downPayment = '87000'
assert.strictEqual(page.buildPaymentResult().loanAmount, '350,000.00')

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
assert.ok(feeResult.copyText.includes('含费'))

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
assert.strictEqual(prepayRes.penalty, '1,500.00')
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
assert.ok(balloonRes.copyText.includes('尾款：80,000.00 元'))
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
assert.ok(wxss.includes('grid-template-columns: 128rpx 148rpx 148rpx 148rpx 148rpx'))
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
assert.strictEqual(equalPrincipalPrepay.remainingBalance, '666,666.67')
page.data.prepayForm.currentBalance = '70'
assert.strictEqual(page.buildPrepayResult().remainingBalance, '700,000.00')


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
assert.strictEqual(page.buildPaymentResult().primaryPayment, '10,000.00')

page.data.paymentForm = {
  principal: '', months: '36', annualRate: '7.08', rateMode: 'annual',
  method: 'equalInstallment', unit: 'yuan', inputMode: 'price',
  carPrice: '200000', downRatio: '', downPayment: '210000'
}
assert.strictEqual(page.buildPaymentResult().valid, false)
assert.ok(page.buildPaymentResult().error.includes('首付'))

page.data.balloonForm = {
  principal: '200000', months: '36', annualRate: '14.4', rateMode: 'annual',
  balloonRatio: '', balloonAmount: '210000', unit: 'yuan'
}
assert.strictEqual(page.buildBalloonResult().valid, false)
assert.ok(page.buildBalloonResult().error.includes('尾款'))


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
    'buildActualResult', 'buildFlatResult', 'buildBalloonResult', 'buildPrepayResult'
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

console.log('page checks passed')
