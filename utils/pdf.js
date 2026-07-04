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

function row(y, values) {
  return asciiLine(9, 40, y, values[0]) +
    asciiLine(9, 122, y, values[1]) +
    asciiLine(9, 222, y, values[2]) +
    asciiLine(9, 322, y, values[3]) +
    asciiLine(9, 422, y, values[4])
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

function createSchedulePdf(options) {
  options = options || {}
  var rows = options.rows || []
  var rowsPerPage = 34
  var pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage))
  var objects = []
  var pageIds = []

  objects[1] = '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [2 0 R] >>'
  objects[2] = '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> /FontDescriptor 3 0 R >>'
  objects[3] = '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 660 /StemV 80 >>'
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  objects[5] = ''

  for (var p = 0; p < pageCount; p += 1) {
    var pageRows = rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage)
    var content = pageContent(options, pageRows, p, pageCount)
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

module.exports = {
  createSchedulePdf: createSchedulePdf
}
