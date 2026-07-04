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
assert.ok(text.includes(hexText('云鑫真实贷款计算器')))
assert.ok(text.includes(hexText('2026-07')))
assert.ok(text.includes(hexText('10,819.79')))
assert.ok(text.includes('xref'))
assert.ok(text.endsWith('%%EOF'))

console.log('pdf checks passed')
