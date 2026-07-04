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

const wxml = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
assert.ok(!wxml.includes('\u5398'))

console.log('page checks passed')
