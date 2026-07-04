const assert = require('assert')
const fs = require('fs')
const path = require('path')

let page
global.wx = { setClipboardData() {} }
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

page.recalculate()
assert.strictEqual(page.data.loanType, 'car')
assert.deepStrictEqual(page.data.toolList.map((item) => item.label), ['算月供', '查真利率', '平息换算'])
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

page.data.actualForm.inputMode = 'payment'
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

const wxml = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
assert.ok(!wxml.includes('\u5398'))

console.log('page checks passed')
