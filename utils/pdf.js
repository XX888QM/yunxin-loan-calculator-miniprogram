function pad10(value) {
  var s = String(value)
  while (s.length < 10) s = '0' + s
  return s
}

function escapePdfText(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function toArrayBuffer(input) {
  var buffer = new ArrayBuffer(input.length)
  var view = new Uint8Array(buffer)
  for (var i = 0; i < input.length; i += 1) {
    view[i] = input.charCodeAt(i) & 255
  }
  return buffer
}

function line(font, size, x, y, text) {
  return 'BT /' + font + ' ' + size + ' Tf ' + x + ' ' + y + ' Td (' + escapePdfText(text) + ') Tj ET\n'
}

function row(y, values) {
  return line('F1', 9, 40, y, values[0]) +
    line('F1', 9, 122, y, values[1]) +
    line('F1', 9, 222, y, values[2]) +
    line('F1', 9, 322, y, values[3]) +
    line('F1', 9, 422, y, values[4])
}

function pageContent(options, rows, pageIndex, pageCount) {
  var content = ''
  content += line('F2', 16, 40, 800, 'Yunxin Real Loan Calculator')
  content += line('F1', 10, 40, 780, 'Repayment Schedule PDF')
  content += line('F1', 9, 40, 760, 'Loan Type: ' + (options.loanType || '-') + '    Tool: ' + (options.tool || '-') + '    Total: ' + (options.total || rows.length))
  content += line('F1', 9, 40, 744, 'First Month: ' + (options.startMonth || '-') + '    Page: ' + (pageIndex + 1) + '/' + pageCount)
  content += line('F2', 9, 40, 716, 'Month')
  content += line('F2', 9, 122, 716, 'Payment')
  content += line('F2', 9, 222, 716, 'Principal')
  content += line('F2', 9, 322, 716, 'Interest')
  content += line('F2', 9, 422, 716, 'Balance')
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

  content += line('F1', 8, 40, 36, 'Generated locally. Results are for reference only.')
  return content
}

function createSchedulePdf(options) {
  options = options || {}
  var rows = options.rows || []
  var rowsPerPage = 34
  var pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage))
  var objects = []
  var pageIds = []

  objects[1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
  objects[3] = ''

  for (var p = 0; p < pageCount; p += 1) {
    var pageRows = rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage)
    var content = pageContent(options, pageRows, p, pageCount)
    var contentId = objects.length
    objects[contentId] = '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream'

    var pageId = objects.length
    objects[pageId] = '<< /Type /Page /Parent 3 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 1 0 R /F2 2 0 R >> >> /Contents ' + contentId + ' 0 R >>'
    pageIds.push(pageId)
  }

  objects[3] = '<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R' }).join(' ') + '] /Count ' + pageIds.length + ' >>'
  var catalogId = objects.length
  objects[catalogId] = '<< /Type /Catalog /Pages 3 0 R >>'

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
