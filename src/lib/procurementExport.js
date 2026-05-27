/**
 * CoreSite Procurement Tracker — Excel Export/Import
 *
 * Export writes FORMULAS for calculated columns (E, F, I, K)
 * so the spreadsheet stays live in Excel.
 */

import ExcelJS from 'exceljs'
import {
  computeMilestones, parseLeadTime, fmtDate, fmtDateISO, parseDate,
} from './procurementSchedule'

// ── Column mapping (1-indexed in Excel) ──
//  A=ID, B=Desc, C=Supplier, D=1stLevel, E=TechSub(f), F=Approval(f),
//  G=DateApproved, H=Status, I=OrderPlaced(f), J=LeadTime, K=Delivery(f),
//  L=ReqOnSite, M=Comments, N=(spare), O=AlgoParams, P=LeadHelper(hidden,f)

const HEADER_ROW = 8
const DATA_START = 10
const NAVY = 'FF0D1426'
const BLUE = 'FF1B6FC8'

export async function exportToExcel(header, rules, rows) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CoreSite'
  wb.created = new Date()
  const ws = wb.addWorksheet(header.trade || 'Procurement', {
    pageSetup: { paperSize: 8, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  // ── Project header (rows 1–6) ──
  const headerFields = [
    ['Project:', header.project || ''],
    ['Stage:', header.stage || ''],
    ['Project No:', header.projectNo || ''],
    ['Revision:', header.revision || ''],
    ['Date:', header.date || fmtDateISO(new Date())],
    ['Trade:', header.trade || ''],
  ]
  headerFields.forEach((pair, i) => {
    const row = i + 1
    ws.getCell(`A${row}`).value = pair[0]
    ws.getCell(`A${row}`).font = { bold: true, size: 10, name: 'Arial' }
    ws.getCell(`B${row}`).value = pair[1]
    ws.getCell(`B${row}`).font = { size: 10, name: 'Arial' }
  })

  // ── Algorithm parameters in O2:O6 ──
  const algoLabels = [
    ['Delivery weeks before', rules.deliveryWeeksBefore],
    ['Order Placed weekday', rules.orderPlacedWeekday],
    ['Approval weekday', rules.approvalWeekday],
    ['Tech Sub days before', rules.techSubDaysBefore],
    ['Tech Sub weekday', rules.techSubWeekday],
  ]
  algoLabels.forEach((pair, i) => {
    const row = i + 2
    ws.getCell(`N${row}`).value = pair[0]
    ws.getCell(`N${row}`).font = { size: 9, name: 'Arial', color: { argb: 'FF7C828F' } }
    ws.getCell(`O${row}`).value = pair[1]
    ws.getCell(`O${row}`).font = { size: 10, name: 'Arial' }
    ws.getCell(`O${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
  })

  // ── Column headers (row 8) ──
  const headers = ['ID', 'Description', 'Supplier', '1st Level', 'Tech Sub Issue', 'Approval Req\'d',
    'Date Approved', 'Status (A|B|C)', 'Order Placed', 'Lead Time', 'Delivery Req\'d',
    'Req\'d On Site', 'Comments']

  headers.forEach((h, i) => {
    const cell = ws.getCell(HEADER_ROW, i + 1)
    cell.value = h
    cell.font = { bold: true, size: 10, name: 'Arial', color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      bottom: { style: 'medium', color: { argb: BLUE } },
    }
  })

  // Hidden helper column P header
  ws.getCell(HEADER_ROW, 16).value = 'LW_Helper'
  ws.getCell(HEADER_ROW, 16).font = { size: 8, name: 'Arial', color: { argb: 'FF999999' } }

  // ── Column widths ──
  ws.getColumn(1).width = 6    // ID
  ws.getColumn(2).width = 32   // Description
  ws.getColumn(3).width = 18   // Supplier
  ws.getColumn(4).width = 10   // 1st Level
  ws.getColumn(5).width = 14   // Tech Sub
  ws.getColumn(6).width = 14   // Approval
  ws.getColumn(7).width = 14   // Date Approved
  ws.getColumn(8).width = 14   // Status
  ws.getColumn(9).width = 14   // Order Placed
  ws.getColumn(10).width = 10  // Lead Time
  ws.getColumn(11).width = 14  // Delivery
  ws.getColumn(12).width = 14  // Req On Site
  ws.getColumn(13).width = 24  // Comments
  ws.getColumn(14).width = 22  // Algo labels
  ws.getColumn(15).width = 10  // Algo values
  ws.getColumn(16).width = 4   // Helper (hidden)
  ws.getColumn(16).hidden = true

  // ── Data rows ──
  rows.forEach((row, i) => {
    const r = DATA_START + i
    const lw = parseLeadTime(row.leadTime)
    const statusStr = ['a', 'b', 'c'].map(k => {
      const v = row.status?.[k]
      return v === 'yes' ? '✓' : v === 'no' ? '✗' : ''
    }).join('|')

    // Static cells
    ws.getCell(r, 1).value = row.id
    ws.getCell(r, 2).value = row.description || ''
    ws.getCell(r, 3).value = row.supplier || ''
    ws.getCell(r, 4).value = row.firstLevel || ''
    ws.getCell(r, 7).value = row.dateApproved ? new Date(row.dateApproved) : ''
    ws.getCell(r, 7).numFmt = 'DD MMM YYYY'
    ws.getCell(r, 8).value = statusStr
    ws.getCell(r, 10).value = row.leadTime || ''
    ws.getCell(r, 12).value = row.requiredOnSite ? new Date(row.requiredOnSite) : ''
    ws.getCell(r, 12).numFmt = 'DD MMM YYYY'
    ws.getCell(r, 13).value = row.comments || ''

    // Formula cells
    // P (helper): parse lead time to integer weeks
    ws.getCell(r, 16).value = { formula: `IFERROR(VALUE(TRIM(SUBSTITUTE(UPPER(J${r}),"W",""))),"")` }

    // K (Delivery Required): =IF(L{r}="","",L{r}-$O$2*7)
    ws.getCell(r, 11).value = { formula: `IF(L${r}="","",L${r}-$O$2*7)` }
    ws.getCell(r, 11).numFmt = 'DD MMM YYYY'

    // I (Order Placed): snap backward
    ws.getCell(r, 9).value = {
      formula: `IF(OR(K${r}="",P${r}=""),"",(K${r}-P${r}*7)-IF(MOD(WEEKDAY((K${r}-P${r}*7),2)-$O$3,7)=0,7,MOD(WEEKDAY((K${r}-P${r}*7),2)-$O$3,7)))`,
    }
    ws.getCell(r, 9).numFmt = 'DD MMM YYYY'

    // F (Approval Required): snap backward from order placed
    ws.getCell(r, 6).value = {
      formula: `IF(I${r}="","",I${r}-IF(MOD(WEEKDAY(I${r},2)-$O$4,7)=0,7,MOD(WEEKDAY(I${r},2)-$O$4,7)))`,
    }
    ws.getCell(r, 6).numFmt = 'DD MMM YYYY'

    // E (Tech Sub Issue): snap backward
    ws.getCell(r, 5).value = {
      formula: `IF(F${r}="","",(F${r}-$O$5)-MOD(WEEKDAY(F${r}-$O$5,2)-$O$6+7,7))`,
    }
    ws.getCell(r, 5).numFmt = 'DD MMM YYYY'

    // Row styling
    const stripe = i % 2 === 1
    for (let c = 1; c <= 13; c++) {
      const cell = ws.getCell(r, c)
      cell.font = cell.font || { size: 10, name: 'Arial' }
      if ([5, 6, 9, 11].includes(c)) {
        cell.font = { ...cell.font, italic: true, color: { argb: 'FFA2A7B2' } }
      }
      if (stripe) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } }
      }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE8EBF1' } },
        right: { style: 'thin', color: { argb: 'FFE8EBF1' } },
      }
      cell.alignment = { vertical: 'middle' }
    }
  })

  // ── Freeze panes at A9 ──
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: HEADER_ROW, topLeftCell: `A${HEADER_ROW + 1}` }]

  // ── Print area ──
  const lastRow = DATA_START + rows.length - 1
  ws.pageSetup.printArea = `A1:O${lastRow}`

  // ── Save ──
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${header.projectNo || 'PT'}_${header.trade || ''}_Procurement-Tracker_${header.revision || ''}_${fmtDateISO(new Date())}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Import ──

export async function importFromExcel(file) {
  const wb = new ExcelJS.Workbook()
  const buf = await file.arrayBuffer()
  await wb.xlsx.load(buf)

  const ws = wb.worksheets[0]
  if (!ws) return null

  // Read project header from rows 1–6
  const header = {}
  const fieldMap = { 'Project:': 'project', 'Stage:': 'stage', 'Project No:': 'projectNo', 'Revision:': 'revision', 'Date:': 'date', 'Trade:': 'trade' }
  for (let r = 1; r <= 6; r++) {
    const label = String(ws.getCell(`A${r}`).value || '').trim()
    const key = fieldMap[label]
    if (key) {
      let val = ws.getCell(`B${r}`).value
      if (val instanceof Date) val = fmtDateISO(val)
      header[key] = String(val || '')
    }
  }

  // Read algorithm inputs from O2:O6
  const rules = {}
  const ruleKeys = ['deliveryWeeksBefore', 'orderPlacedWeekday', 'approvalWeekday', 'techSubDaysBefore', 'techSubWeekday']
  for (let i = 0; i < 5; i++) {
    const val = ws.getCell(`O${i + 2}`).value
    if (val != null) {
      const num = typeof val === 'object' && val.result != null ? val.result : val
      rules[ruleKeys[i]] = parseInt(num) || 0
    }
  }

  // Read item rows from row 10 down
  const rows = []
  let r = DATA_START
  while (r < 500) {
    const id = ws.getCell(r, 1).value
    if (id == null || id === '') break

    let onSiteVal = ws.getCell(r, 12).value
    if (onSiteVal instanceof Date) onSiteVal = fmtDateISO(onSiteVal)
    else if (typeof onSiteVal === 'object' && onSiteVal?.result instanceof Date) onSiteVal = fmtDateISO(onSiteVal.result)

    let approvedVal = ws.getCell(r, 7).value
    if (approvedVal instanceof Date) approvedVal = fmtDateISO(approvedVal)
    else if (typeof approvedVal === 'object' && approvedVal?.result instanceof Date) approvedVal = fmtDateISO(approvedVal.result)

    const statusRaw = String(ws.getCell(r, 8).value || '')
    const statusParts = statusRaw.split('|')
    const status = {
      a: statusParts[0] === '✓' ? 'yes' : statusParts[0] === '✗' ? 'no' : null,
      b: statusParts[1] === '✓' ? 'yes' : statusParts[1] === '✗' ? 'no' : null,
      c: statusParts[2] === '✓' ? 'yes' : statusParts[2] === '✗' ? 'no' : null,
    }

    rows.push({
      id: typeof id === 'number' ? id : parseInt(id) || rows.length + 1,
      description: String(ws.getCell(r, 2).value || ''),
      supplier: String(ws.getCell(r, 3).value || ''),
      firstLevel: parseInt(ws.getCell(r, 4).value) || 1,
      leadTime: String(ws.getCell(r, 10).value || ''),
      requiredOnSite: onSiteVal || '',
      dateApproved: approvedVal || '',
      status,
      comments: String(ws.getCell(r, 13).value || ''),
      category: '', // Will need manual categorisation after import
    })
    r++
  }

  return { header, rules, rows }
}
