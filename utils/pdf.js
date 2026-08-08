function pad10(value) {
  var s = String(value)
  while (s.length < 10) s = '0' + s
  return s
}

function toArrayBuffer(input) {
  var buffer = new ArrayBuffer(input.length)
  var view = new Uint8Array(buffer)
  for (var i = 0; i < input.length; i += 1) {
    view[i] = input.charCodeAt(i) & 255
  }
  return buffer
}

function escapePdfText(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function hex4(value) {
  var s = value.toString(16).toUpperCase()
  while (s.length < 4) s = '0' + s
  return s
}

function pdfText(value) {
  var s = String(value === undefined || value === null ? '' : value)
  var hex = ''
  for (var i = 0; i < s.length; i += 1) {
    hex += hex4(s.charCodeAt(i))
  }
  return '<' + hex + '>'
}

function cjkLine(size, x, y, text) {
  return 'BT /F1 ' + size + ' Tf ' + x + ' ' + y + ' Td ' + pdfText(text) + ' Tj ET\n'
}

function asciiLine(size, x, y, text) {
  return 'BT /F2 ' + size + ' Tf ' + x + ' ' + y + ' Td (' + escapePdfText(text) + ') Tj ET\n'
}

function compactAmount(value) {
  return String(value === undefined || value === null ? '' : value).replace(/,/g, '')
}

function row(y, values) {
  return asciiLine(9, 40, y, values[0]) +
    asciiLine(9, 122, y, compactAmount(values[1])) +
    asciiLine(9, 222, y, compactAmount(values[2])) +
    asciiLine(9, 322, y, compactAmount(values[3])) +
    asciiLine(9, 422, y, compactAmount(values[4]))
}

function loanTypeLabel(value) {
  if (value === 'car') return '车贷'
  if (value === 'home') return '房贷'
  return value || '-'
}

function toolLabel(value) {
  var labels = {
    payment: '算月供',
    combo: '组合贷',
    budget: '能贷多少',
    balloon: '尾款贷',
    prepay: '提前还款'
  }
  return labels[value] || value || '-'
}

function pageContent(options, rows, pageIndex, pageCount) {
  var content = ''
  content += cjkLine(16, 40, 800, '云鑫真实贷款计算器')
  content += cjkLine(10, 40, 780, '还款明细')
  content += cjkLine(9, 40, 760, '贷款类型：' + loanTypeLabel(options.loanType))
  content += cjkLine(9, 140, 760, '工具：' + toolLabel(options.tool))
  content += cjkLine(9, 250, 760, '合计：')
  content += asciiLine(9, 280, 760, options.total || rows.length)
  content += cjkLine(9, 306, 760, '期')
  content += cjkLine(9, 40, 744, '首期：')
  content += asciiLine(9, 68, 744, options.startMonth || '-')
  content += cjkLine(9, 140, 744, '页码：')
  content += asciiLine(9, 168, 744, (pageIndex + 1) + '/' + pageCount)
  content += cjkLine(9, 40, 716, '月份')
  content += cjkLine(9, 122, 716, '还款')
  content += cjkLine(9, 222, 716, '本金')
  content += cjkLine(9, 322, 716, '利息')
  content += cjkLine(9, 422, 716, '余额')
  content += '0.82 w 40 706 m 540 706 l S\n'

  var y = 688
  for (var i = 0; i < rows.length; i += 1) {
    content += row(y, [
      rows[i].label,
      rows[i].payment,
      rows[i].principal,
      rows[i].interest,
      rows[i].balance
    ])
    y -= 18
  }

  content += cjkLine(8, 40, 36, '本文件由小程序本地生成，测算结果仅供参考。')
  return content
}

function createPdfDocument(pageContents) {
  pageContents = Array.isArray(pageContents) && pageContents.length ? pageContents : ['']
  var objects = []
  var pageIds = []

  objects[1] = '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [2 0 R] >>'
  objects[2] = '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> /FontDescriptor 3 0 R >>'
  objects[3] = '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 660 /StemV 80 >>'
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  objects[5] = ''

  for (var p = 0; p < pageContents.length; p += 1) {
    var content = pageContents[p]
    var contentId = objects.length
    objects[contentId] = '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream'

    var pageId = objects.length
    objects[pageId] = '<< /Type /Page /Parent 5 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 1 0 R /F2 4 0 R >> >> /Contents ' + contentId + ' 0 R >>'
    pageIds.push(pageId)
  }

  objects[5] = '<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R' }).join(' ') + '] /Count ' + pageIds.length + ' >>'
  var catalogId = objects.length
  objects[catalogId] = '<< /Type /Catalog /Pages 5 0 R >>'

  var pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  var offsets = [0]
  for (var id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length
    pdf += id + ' 0 obj\n' + objects[id] + '\nendobj\n'
  }

  var xref = pdf.length
  pdf += 'xref\n0 ' + objects.length + '\n'
  pdf += '0000000000 65535 f \n'
  for (var x = 1; x < objects.length; x += 1) {
    pdf += pad10(offsets[x]) + ' 00000 n \n'
  }
  pdf += 'trailer\n<< /Size ' + objects.length + ' /Root ' + catalogId + ' 0 R >>\n'
  pdf += 'startxref\n' + xref + '\n%%EOF'

  return toArrayBuffer(pdf)
}

function createSchedulePdf(options) {
  options = options || {}
  var rows = options.rows || []
  var rowsPerPage = 34
  var pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage))
  var pages = []

  for (var p = 0; p < pageCount; p += 1) {
    var pageRows = rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage)
    pages.push(pageContent(options, pageRows, p, pageCount))
  }

  return createPdfDocument(pages)
}

function safeReportText(value, maxLength) {
  if (value === undefined || value === null) return ''
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function wrapReportText(value, maxChars) {
  var text = safeReportText(value, 480)
  if (!text) return []
  var sourceLines = text.split('\n')
  var lines = []

  for (var i = 0; i < sourceLines.length; i += 1) {
    var source = sourceLines[i].trim()
    if (!source) continue
    while (source.length > maxChars) {
      lines.push(source.slice(0, maxChars))
      source = source.slice(maxChars)
    }
    if (source) lines.push(source)
  }
  return lines
}

function reportTextList(value, maxItems) {
  var source = Array.isArray(value) ? value : [value]
  var result = []
  for (var i = 0; i < source.length && result.length < maxItems; i += 1) {
    var text = safeReportText(source[i], 240)
    if (text) result.push(text)
  }
  return result
}

function reportCostList(value) {
  var result = []
  var i
  if (Array.isArray(value)) {
    for (i = 0; i < value.length && result.length < 60; i += 1) {
      var item = value[i]
      if (item && typeof item === 'object') {
        var label = safeReportText(item.label, 60)
        var amount = safeReportText(item.value, 80)
        if (label || amount) result.push((label || '成本') + '：' + (amount || '—'))
      } else {
        var text = safeReportText(item, 160)
        if (text) result.push(text)
      }
    }
    return result
  }

  if (value && typeof value === 'object') {
    var keys = Object.keys(value)
    for (i = 0; i < keys.length && result.length < 60; i += 1) {
      var key = safeReportText(keys[i], 60)
      var itemValue = safeReportText(value[keys[i]], 80)
      if (key || itemValue) result.push((key || '成本') + '：' + (itemValue || '—'))
    }
  }
  return result
}

function addReportSection(lines, title, values) {
  lines.push({ type: 'section', text: title })
  if (!values.length) {
    lines.push({ type: 'body', text: '未填写' })
    return
  }
  for (var i = 0; i < values.length; i += 1) {
    var wrapped = wrapReportText(values[i], 42)
    for (var j = 0; j < wrapped.length; j += 1) {
      lines.push({ type: 'body', text: (j === 0 ? '• ' : '  ') + wrapped[j] })
    }
  }
}

function buildReportLines(report) {
  report = report || {}
  var lines = []
  addReportSection(lines, '关键结论', reportTextList(report.conclusion || report.summary, 4))
  addReportSection(lines, '成本', reportCostList(report.costs || report.amounts))
  addReportSection(lines, '核对项', reportTextList(report.checks, 60))
  addReportSection(lines, '假设说明', reportTextList(report.assumptions || report.assumption, 20))
  return lines
}

function quoteReportPageContent(title, lines, pageIndex, pageCount) {
  var content = ''
  var pageTitle = title + (pageIndex > 0 ? '（续）' : '')
  content += cjkLine(16, 40, 800, pageTitle)
  content += cjkLine(8, 40, 782, '本地测算报告')
  content += cjkLine(8, 450, 782, '页码：' + (pageIndex + 1) + '/' + pageCount)

  var y = 758
  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i]
    var isSection = line.type === 'section'
    content += cjkLine(isSection ? 10 : 9, isSection ? 40 : 54, y, line.text)
    y -= isSection ? 22 : 18
  }

  content += cjkLine(8, 40, 36, '本报告由小程序本地生成，测算结果仅供参考。')
  return content
}

function createQuoteReportPdf(report) {
  report = report || {}
  var title = safeReportText(report.title, 80) || '贷款测算报告'
  var lines = buildReportLines(report)
  var linesPerPage = 30
  var pageCount = Math.max(1, Math.ceil(lines.length / linesPerPage))
  var pages = []

  for (var i = 0; i < pageCount; i += 1) {
    pages.push(quoteReportPageContent(
      title,
      lines.slice(i * linesPerPage, (i + 1) * linesPerPage),
      i,
      pageCount
    ))
  }

  return createPdfDocument(pages)
}

module.exports = {
  createSchedulePdf: createSchedulePdf,
  createQuoteReportPdf: createQuoteReportPdf
}
