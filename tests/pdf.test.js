const assert = require('assert')
const pdf = require('../utils/pdf')

function hexText(value) {
  return String(value).split('').map((char) => {
    return char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
  }).join('')
}

const buffer = pdf.createSchedulePdf({
  loanType: 'car',
  tool: 'payment',
  startMonth: '2026-07',
  rows: [
    { label: '2026-07', payment: '10,819.79', principal: '8,754.79', interest: '2,065.00', balance: '341,245.21' }
  ]
})

const text = Buffer.from(new Uint8Array(buffer)).toString('latin1')
assert.ok(text.startsWith('%PDF-1.4'))
assert.ok(text.includes('/STSong-Light'))
assert.ok(text.includes('/Helvetica'))
assert.ok(text.includes(hexText('云鑫真实贷款计算器')))
assert.ok(text.includes('(2026-07)'))
assert.ok(text.includes('(10819.79)'))
assert.ok(!text.includes('(10,819.79)'))
assert.ok(text.includes('xref'))
assert.ok(text.endsWith('%%EOF'))

const quoteBuffer = pdf.createQuoteReportPdf({
  title: '车贷测算报告（本地）()\\&',
  conclusion: '月供 6750.00 元；先核对合同中的月供、期数和费用。',
  costs: [
    { label: '贷款本金', value: '200,000.00 元' },
    { label: '总融资成本', value: '43,000.00 元' }
  ],
  checks: ['已核对还款期数', '特殊字符：()\\&<> 不应破坏 PDF'],
  assumptions: '按固定利率、等间隔月度还款测算；实际以合同为准。'
})
const quoteText = Buffer.from(new Uint8Array(quoteBuffer)).toString('latin1')
assert.ok(quoteText.startsWith('%PDF-1.4'))
assert.ok(quoteText.includes(hexText('车贷测算报告（本地）()\\&')))
assert.ok(quoteText.includes(hexText('关键结论')))
assert.ok(quoteText.includes(hexText('成本')))
assert.ok(quoteText.includes(hexText('核对项')))
assert.ok(quoteText.includes(hexText('假设说明')))
assert.ok(quoteText.includes(hexText('特殊字符：()\\&<> 不应破坏 PDF')))
assert.ok(quoteText.includes('/Count 1'))
assert.ok(quoteText.endsWith('%%EOF'))

const longCosts = []
for (let i = 0; i < 35; i += 1) {
  longCosts.push({ label: '成本项' + i, value: String(i * 100) + '.00 元' })
}
const multiPageBuffer = pdf.createQuoteReportPdf({
  title: '多页本地报告',
  conclusion: '用于核对长成本清单。',
  costs: longCosts,
  checks: ['核对长列表'],
  assumptions: ['固定利率假设']
})
const multiPageText = Buffer.from(new Uint8Array(multiPageBuffer)).toString('latin1')
assert.ok(multiPageText.includes('/Count 2'))
assert.strictEqual((multiPageText.match(/\/Type \/Page \/Parent/g) || []).length, 2)
assert.ok(multiPageText.includes(hexText('成本项34')))

const emptyReportText = Buffer.from(new Uint8Array(pdf.createQuoteReportPdf({}))).toString('latin1')
assert.ok(emptyReportText.includes(hexText('贷款测算报告')))
assert.ok(emptyReportText.includes(hexText('未填写')))

console.log('pdf checks passed')
