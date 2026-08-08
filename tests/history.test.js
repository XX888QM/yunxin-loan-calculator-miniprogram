const assert = require('assert')
const history = require('../utils/history')

function createMemoryStorage() {
  const data = {}
  return {
    data,
    getStorageSync(key) {
      return data[key]
    },
    setStorageSync(key, value) {
      data[key] = value
    },
    removeStorageSync(key) {
      delete data[key]
    }
  }
}

function entry(id, createdAt) {
  return {
    id,
    createdAt,
    loanType: 'car',
    tool: 'payment',
    title: '车贷月供方案',
    summary: '月供 6750 元，总利息 43000 元',
    form: {
      principal: '200000',
      months: '36',
      annualRate: '13.14',
      rateMode: 'annual',
      method: 'equalInstallment',
      unit: 'yuan',
      name: '张三',
      phone: '13800138000'
    },
    amounts: {
      principal: '200000',
      monthlyPayment: '6750',
      totalInterest: '43000',
      unknown: '999'
    }
  }
}

const storage = createMemoryStorage()
const key = history.DEFAULT_STORAGE_KEY

// 0 条：空存储和无 wx 环境都应安全返回空数组。
assert.deepStrictEqual(history.load(storage), [])
assert.deepStrictEqual(history.load(null), [])
assert.deepStrictEqual(history.save(entry('none', '2026-08-07T00:00:00.000Z'), null), [])

// 1 条：金额、日期和字段被规范化；个人身份字段不会进入存储。
const one = history.save(entry('one', '2026-08-07T00:00:00.000Z'), storage)
assert.strictEqual(one.length, 1)
assert.strictEqual(one[0].schemaVersion, history.SCHEMA_VERSION)
assert.strictEqual(one[0].createdAt, Date.parse('2026-08-07T00:00:00.000Z'))
assert.strictEqual(one[0].form.principal, '200000')
assert.strictEqual(one[0].form.months, '36')
assert.strictEqual(one[0].amounts.monthlyPayment, 6750)
assert.ok(!Object.prototype.hasOwnProperty.call(one[0].form, 'name'))
assert.ok(!Object.prototype.hasOwnProperty.call(one[0].form, 'phone'))
assert.ok(!Object.prototype.hasOwnProperty.call(one[0].amounts, 'unknown'))
assert.ok(!storage.data[key].includes('张三'))
assert.ok(!storage.data[key].includes('13800138000'))

const privateSummary = history.sanitizeEntry({
  id: 'private-summary',
  createdAt: '2026-08-07T00:00:00.000Z',
  loanType: 'home',
  tool: 'prepay',
  summary: '联系电话：13800138000',
  form: { principal: '1000000', months: '360' }
})
assert.strictEqual(privateSummary.summary, '')

const identityLikeId = history.sanitizeEntry({
  id: '11010519491231002X',
  createdAt: '2026-08-07T00:00:00.000Z',
  loanType: 'car',
  tool: 'payment'
})
assert.notStrictEqual(identityLikeId.id, '11010519491231002X')

const internalKeyId = history.sanitizeEntry({
  id: '__proto__',
  createdAt: '2026-08-07T00:00:00.000Z',
  loanType: 'car',
  tool: 'payment'
})
assert.notStrictEqual(internalKeyId.id, '__proto__')

const unknownFeeEntry = history.sanitizeEntry({
  id: 'unknown-fees',
  createdAt: '2026-08-07T00:00:00.000Z',
  loanType: 'car',
  tool: 'quote',
  form: { feeStatus: 'unknown' }
})
assert.strictEqual(unknownFeeEntry.form.feeStatus, 'unknown')

const inheritedNameStorage = createMemoryStorage()
history.save(entry('toString', '2026-08-07T00:00:00.000Z'), inheritedNameStorage)
assert.strictEqual(history.load(inheritedNameStorage)[0].id, 'toString')

// 坏 JSON、错误 schema、坏日期和坏记录不抛错；同一批中的有效记录仍可读。
storage.setStorageSync(key, 'not json')
assert.deepStrictEqual(history.load(storage), [])
storage.setStorageSync(key, JSON.stringify({
  schemaVersion: history.SCHEMA_VERSION,
  items: [
    Object.assign({ schemaVersion: history.SCHEMA_VERSION }, entry('valid', '2026-08-07T00:00:00.000Z')),
    { schemaVersion: history.SCHEMA_VERSION, id: 'bad-date', createdAt: 'bad', loanType: 'car', tool: 'payment' },
    { schemaVersion: history.SCHEMA_VERSION, id: 'bad-tool', createdAt: '2026-08-07T00:00:00.000Z', loanType: 'car', tool: 'unknown' },
    { schemaVersion: 999, id: 'wrong-version', createdAt: '2026-08-07T00:00:00.000Z', loanType: 'car', tool: 'payment' }
  ]
}))
const repaired = history.load(storage)
assert.strictEqual(repaired.length, 1)
assert.strictEqual(repaired[0].id, 'valid')

// 35 条：只留最新 30 条，重复 id 覆盖旧条目。
history.clear(storage)
const start = Date.UTC(2026, 0, 1)
for (let i = 0; i < 35; i += 1) {
  history.save(entry('row-' + i, start + i * 1000), storage)
}
const capped = history.load(storage)
assert.strictEqual(capped.length, history.MAX_ITEMS)
assert.strictEqual(capped[0].id, 'row-34')
assert.strictEqual(capped[capped.length - 1].id, 'row-5')

const replacement = entry('row-20', start + 999999)
replacement.summary = '更新后的结论'
const afterReplacement = history.save(replacement, storage)
assert.strictEqual(afterReplacement.filter((item) => item.id === 'row-20').length, 1)
assert.strictEqual(afterReplacement[0].id, 'row-20')

const afterRemove = history.remove('row-20', storage)
assert.strictEqual(afterRemove.length, history.MAX_ITEMS - 1)
assert.ok(!afterRemove.some((item) => item.id === 'row-20'))
assert.deepStrictEqual(history.clear(storage), [])
assert.deepStrictEqual(history.load(storage), [])

// 写入、删除或清空失败时，API 必须返回真实仍保留的本机记录，不能假装操作成功。
const failingStorage = createMemoryStorage()
history.save(entry('durable', '2026-08-07T00:00:00.000Z'), failingStorage)
const durableItems = history.load(failingStorage)
failingStorage.setStorageSync = function () { throw new Error('storage full') }
assert.deepStrictEqual(history.save(entry('not-written', '2026-08-07T00:01:00.000Z'), failingStorage), durableItems)
assert.deepStrictEqual(history.remove('durable', failingStorage), durableItems)
failingStorage.removeStorageSync = function () { throw new Error('storage full') }
assert.deepStrictEqual(history.clear(failingStorage), durableItems)

console.log('history checks passed')
