var SCHEMA_VERSION = 1
var MAX_ITEMS = 30
var DEFAULT_STORAGE_KEY = 'yunxin-loan-history-v1'

var TOOL_LABELS = {
  payment: '算月供',
  combo: '组合贷',
  budget: '能贷多少',
  actual: '折算利率',
  flat: '平息换算',
  balloon: '尾款贷',
  prepay: '提前还款',
  carCost: '车贷落地成本',
  lpr: 'LPR 情景',
  quote: '报价体检'
}

var MONEY_FIELDS = {
  principal: true,
  carPrice: true,
  downPayment: true,
  commercialPrincipal: true,
  fundPrincipal: true,
  monthlyBudget: true,
  monthlyPayment: true,
  totalInterest: true,
  balloonAmount: true,
  upfrontFee: true,
  prepayAmount: true,
  penaltyAmount: true,
  currentBalance: true,
  vehiclePrice: true,
  purchaseTax: true,
  insurance: true,
  registrationFee: true,
  serviceFee: true,
  gpsFee: true,
  discountAmount: true,
  loanAmount: true,
  periodicFee: true,
  cashVehiclePrice: true,
  installmentVehiclePrice: true,
  discount: true,
  requiredOptions: true,
  purposeFunding: true,
  totalRepayment: true,
  remainingPrincipal: true,
  prepayPrincipal: true,
  settlementInterest: true,
  penaltyValue: true
}

var RATE_FIELDS = {
  annualRate: true,
  commercialRate: true,
  fundRate: true,
  monthlyFlatRate: true,
  claimedMonthlyRate: true,
  claimedRate: true,
  annualEffectiveRate: true,
  initialLpr: true,
  scenarioLpr: true,
  penaltyPercent: true,
  downRatio: true,
  balloonRatio: true
}

var INTEGER_FIELDS = {
  months: { min: 1, max: 600 },
  years: { min: 1, max: 50 },
  paidMonths: { min: 0, max: 600 },
  remainingMonths: { min: 1, max: 600 },
  repriceMonth: { min: 1, max: 600 }
}

var SIGNED_NUMBER_FIELDS = {
  spreadBps: { min: -10000, max: 10000 }
}

var ENUM_FIELDS = {
  unit: ['yuan', 'wan'],
  rateMode: ['annual', 'monthly'],
  method: ['equalInstallment', 'equalPrincipal', 'interestOnly'],
  inputMode: ['loan', 'price', 'payment', 'interest'],
  paymentStructure: ['equalPayment', 'balloon', 'interestOnly'],
  reduceMode: ['term', 'payment'],
  penaltyMode: ['percent', 'amount'],
  purpose: ['car', 'home'],
  structure: ['equalPayment', 'balloon', 'interestOnly'],
  feeStatus: ['unknown', 'none', 'known'],
  claimedRateMode: ['annual', 'monthly'],
  prepayKnown: ['yes', 'no'],
  upfrontFeePayment: ['cash', 'deducted'],
  mode: ['quick', 'exact'],
  settlementMode: ['statement', 'daily'],
  dayCount: ['ACT_365F', 'ACT_360', '30_360'],
  penaltyType: ['fixed', 'percentOfPrepay', 'percentOfBalance']
}

var RESULT_AMOUNT_FIELDS = {
  principal: { min: 0 },
  loanAmount: { min: 0 },
  monthlyPayment: { min: 0 },
  firstPayment: { min: 0 },
  lastPayment: { min: 0 },
  totalInterest: { min: 0 },
  totalPayment: { min: 0 },
  totalFinancingCost: { min: 0 },
  remainingBalance: { min: 0 },
  afterPrepayBalance: { min: 0 },
  interestSaved: { min: 0 },
  penalty: { min: 0 },
  netSaved: { min: -1000000000000 },
  landingCost: { min: 0 },
  downPayment: { min: 0 }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStorageKey(value) {
  var key = value === undefined || value === null ? '' : String(value)
  return /^[A-Za-z0-9_.-]{1,80}$/.test(key) ? key : DEFAULT_STORAGE_KEY
}

function resolveStorage(storage) {
  if (storage && typeof storage.getStorageSync === 'function') return storage
  if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') return wx
  return null
}

function isFiniteNumber(value) {
  return typeof value === 'number' && isFinite(value)
}

function toFiniteNumber(value) {
  if (value === null || value === undefined) return null
  var text = String(value).replace(/,/g, '').trim()
  if (text === '') return null
  var number = Number(text)
  return isFiniteNumber(number) ? number : null
}

function numberText(value, min, max, digits) {
  var number = toFiniteNumber(value)
  if (number === null || number < min || number > max) return ''
  var scale = Math.pow(10, digits)
  var rounded = Math.round((number + 1e-12) * scale) / scale
  var text = rounded.toFixed(digits).replace(/\.?0+$/, '')
  return text === '-0' ? '0' : text
}

function hasSensitiveText(value) {
  var text = String(value || '')
  return /1[3-9][0-9]{9}/.test(text) ||
    /[0-9]{17}[0-9Xx]/.test(text) ||
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text) ||
    /(姓名|身份证|手机号|联系电话|住址|地址|邮箱)\s*[:：]/.test(text)
}

function safeText(value, maxLength) {
  if (value === null || value === undefined) return ''
  var text = String(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (hasSensitiveText(text)) return ''
  return text.slice(0, maxLength)
}

function safeId(value) {
  var id = value === null || value === undefined ? '' : String(value)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || hasSensitiveText(id)) return ''
  if (id === '__proto__' || id === 'constructor' || id === 'prototype') return ''
  return id
}

function createId(createdAt) {
  return 'h' + createdAt.toString(36) + '-' + Math.floor(Math.random() * 0xFFFFFF).toString(36)
}

function normalizeCreatedAt(value, useCurrentTime) {
  var timestamp = null
  if (isFiniteNumber(value)) {
    timestamp = value
  } else if (typeof value === 'string' && value.trim() !== '') {
    var parsed = Date.parse(value)
    if (isFiniteNumber(parsed)) timestamp = parsed
  }
  if (timestamp === null && useCurrentTime) timestamp = Date.now()
  if (!isFiniteNumber(timestamp)) return 0
  timestamp = Math.round(timestamp)
  return timestamp >= 946684800000 && timestamp <= 4102444800000 ? timestamp : 0
}

function includes(list, value) {
  return list.indexOf(value) >= 0
}

function sanitizeForm(input) {
  var form = {}
  if (!isPlainObject(input)) return form
  var key

  for (key in MONEY_FIELDS) {
    if (hasOwn(MONEY_FIELDS, key) && hasOwn(input, key)) {
      var money = numberText(input[key], 0, 1000000000000, 8)
      if (money !== '') form[key] = money
    }
  }

  for (key in RATE_FIELDS) {
    if (hasOwn(RATE_FIELDS, key) && hasOwn(input, key)) {
      var rate = numberText(input[key], 0, 10000, 8)
      if (rate !== '') form[key] = rate
    }
  }

  for (key in INTEGER_FIELDS) {
    if (hasOwn(INTEGER_FIELDS, key) && hasOwn(input, key)) {
      var rule = INTEGER_FIELDS[key]
      var integer = toFiniteNumber(input[key])
      if (integer !== null && Math.floor(integer) === integer && integer >= rule.min && integer <= rule.max) {
        form[key] = String(integer)
      }
    }
  }

  for (key in SIGNED_NUMBER_FIELDS) {
    if (hasOwn(SIGNED_NUMBER_FIELDS, key) && hasOwn(input, key)) {
      var signedRule = SIGNED_NUMBER_FIELDS[key]
      var signed = numberText(input[key], signedRule.min, signedRule.max, 8)
      if (signed !== '') form[key] = signed
    }
  }

  for (key in ENUM_FIELDS) {
    if (hasOwn(ENUM_FIELDS, key) && hasOwn(input, key)) {
      var value = String(input[key])
      if (includes(ENUM_FIELDS[key], value)) form[key] = value
    }
  }

  return form
}

function sanitizeAmounts(input) {
  var amounts = {}
  if (!isPlainObject(input)) return amounts

  for (var key in RESULT_AMOUNT_FIELDS) {
    if (!hasOwn(RESULT_AMOUNT_FIELDS, key) || !hasOwn(input, key)) continue
    var rule = RESULT_AMOUNT_FIELDS[key]
    var text = numberText(input[key], rule.min, 1000000000000, 2)
    if (text !== '') amounts[key] = Number(text)
  }

  return amounts
}

function sanitizeEntry(input, forSave) {
  if (!isPlainObject(input)) return null
  if (!forSave && Number(input.schemaVersion) !== SCHEMA_VERSION) return null

  var loanType = input.loanType === 'car' || input.loanType === 'home' ? input.loanType : ''
  var tool = typeof input.tool === 'string' && hasOwn(TOOL_LABELS, input.tool) ? input.tool : ''
  if (!loanType || !tool) return null

  var createdAt = normalizeCreatedAt(input.createdAt, forSave)
  if (!createdAt) return null

  var id = safeId(input.id)
  if (!id && !forSave) return null
  if (!id) id = createId(createdAt)

  var title = safeText(input.title, 60) || TOOL_LABELS[tool]
  var summary = safeText(input.summary, 240)
  var form = sanitizeForm(input.form || input.fields)
  var amounts = sanitizeAmounts(input.amounts)

  return {
    schemaVersion: SCHEMA_VERSION,
    id: id,
    createdAt: createdAt,
    loanType: loanType,
    tool: tool,
    title: title,
    summary: summary,
    form: form,
    amounts: amounts
  }
}

function readStoredItems(storage, key) {
  if (!storage) return { items: [], error: 'storageUnavailable' }
  var raw
  try {
    raw = storage.getStorageSync(key)
  } catch (error) {
    return { items: [], error: 'readFailed' }
  }
  if (raw === undefined || raw === null || raw === '') return { items: [], error: '' }

  var value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch (error) {
      return { items: [], error: 'invalidData' }
    }
  }
  if (!isPlainObject(value) || Number(value.schemaVersion) !== SCHEMA_VERSION || !Array.isArray(value.items)) {
    return { items: [], error: 'incompatibleData' }
  }
  return { items: value.items, error: '' }
}

function sanitizeStoredItems(items) {
  var result = []
  var seen = {}

  for (var i = 0; i < items.length && result.length < MAX_ITEMS; i += 1) {
    var item = sanitizeEntry(items[i], false)
    if (item && !hasOwn(seen, item.id)) {
      seen[item.id] = true
      result.push(item)
    }
  }
  return result
}

function hasIncompatibleItem(items) {
  for (var i = 0; i < items.length; i += 1) {
    if (!sanitizeEntry(items[i], false)) return true
  }
  return false
}

function load(storage, key) {
  return inspect(storage, key).items
}

function inspect(storage, key) {
  var api = resolveStorage(storage)
  var stored = readStoredItems(api, normalizeStorageKey(key))
  if (stored.error) return { ok: false, items: [], error: stored.error }
  var items = sanitizeStoredItems(stored.items)
  if (hasIncompatibleItem(stored.items)) return { ok: false, items: items, error: 'incompatibleItem' }
  return { ok: true, items: items, error: '' }
}

function write(storage, key, items) {
  if (!storage || typeof storage.setStorageSync !== 'function') return false
  try {
    storage.setStorageSync(key, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      items: items
    }))
    return true
  } catch (error) {
    return false
  }
}

function saveResult(entry, storage, key) {
  var api = resolveStorage(storage)
  var item = sanitizeEntry(entry, true)
  if (!api) return { ok: false, items: [], error: 'storageUnavailable' }
  var storageKey = normalizeStorageKey(key)
  var stored = readStoredItems(api, storageKey)
  if (stored.error) return { ok: false, items: [], error: stored.error }
  var items = sanitizeStoredItems(stored.items)
  if (hasIncompatibleItem(stored.items)) return { ok: false, items: items, error: 'incompatibleItem' }
  if (!item) return { ok: false, items: items, error: 'invalidEntry' }

  var next = [item]
  for (var i = 0; i < items.length && next.length < MAX_ITEMS; i += 1) {
    if (items[i].id !== item.id) next.push(items[i])
  }
  if (!write(api, storageKey, next)) return { ok: false, items: items, error: 'writeFailed' }
  return { ok: true, items: next, error: '' }
}

function save(entry, storage, key) {
  return saveResult(entry, storage, key).items
}

function removeResult(id, storage, key) {
  var api = resolveStorage(storage)
  var safe = safeId(id)
  if (!api) return { ok: false, items: [], error: 'storageUnavailable' }
  var storageKey = normalizeStorageKey(key)
  var stored = readStoredItems(api, storageKey)
  if (stored.error) return { ok: false, items: [], error: stored.error }
  var items = sanitizeStoredItems(stored.items)
  if (hasIncompatibleItem(stored.items)) return { ok: false, items: items, error: 'incompatibleItem' }
  if (!safe) return { ok: false, items: items, error: 'invalidId' }
  var next = items.filter(function (item) { return item.id !== safe })
  if (next.length === items.length) return { ok: false, items: items, error: 'notFound' }
  if (!write(api, storageKey, next)) return { ok: false, items: items, error: 'writeFailed' }
  return { ok: true, items: next, error: '' }
}

function remove(id, storage, key) {
  return removeResult(id, storage, key).items
}

function clear(storage, key) {
  return clearResult(storage, key).items
}

function clearResult(storage, key) {
  var api = resolveStorage(storage)
  var storageKey = normalizeStorageKey(key)
  var before = inspect(api, storageKey)
  if (!api || before.error === 'storageUnavailable' || before.error === 'readFailed') {
    return { ok: false, items: before.items, error: before.error || 'storageUnavailable' }
  }
  try {
    if (typeof api.removeStorageSync === 'function') {
      api.removeStorageSync(storageKey)
    } else if (!write(api, storageKey, [])) {
      return { ok: false, items: load(api, storageKey), error: 'writeFailed' }
    }
  } catch (error) {
    return { ok: false, items: load(api, storageKey), error: 'writeFailed' }
  }
  var after = readStoredItems(api, storageKey)
  if (after.error || after.items.length) {
    return { ok: false, items: after.error ? [] : sanitizeStoredItems(after.items), error: after.error || 'writeFailed' }
  }
  return { ok: true, items: [], error: '' }
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  MAX_ITEMS: MAX_ITEMS,
  DEFAULT_STORAGE_KEY: DEFAULT_STORAGE_KEY,
  load: load,
  inspect: inspect,
  save: save,
  saveResult: saveResult,
  remove: remove,
  removeResult: removeResult,
  clear: clear,
  clearResult: clearResult,
  sanitizeEntry: function (entry) { return sanitizeEntry(entry, true) }
}
