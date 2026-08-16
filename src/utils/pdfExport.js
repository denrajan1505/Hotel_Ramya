import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportCellValue } from './formatters';

const BRAND = { primary: [10, 61, 145], gold: [212, 175, 55] };

export function exportTableToPdf({ title, subtitle, columns, rows, filename = 'report.pdf', orientation = 'landscape' }) {
  const doc = new jsPDF({ orientation, unit: 'pt' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, pageWidth, 60, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Hotel Ramyas', 32, 28);
  doc.setFontSize(11);
  doc.text(title || 'Report', 32, 46);

  if (subtitle) {
    doc.setTextColor(230, 230, 230);
    doc.setFontSize(9);
    doc.text(subtitle, pageWidth - 32, 46, { align: 'right' });
  }

  autoTable(doc, {
    startY: 76,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => exportCellValue(c, row))),
    theme: 'striped',
    headStyles: { fillColor: BRAND.primary, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 253] },
    styles: { fontSize: 8.5, cellPadding: 5 },
    margin: { left: 32, right: 32 },
  });

  doc.save(filename);
}

export function exportReceiptPdf(receipt, allocations) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, pageWidth, 90, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text('Hotel Ramyas', 40, 38);
  doc.setFontSize(10);
  doc.text('Payment Receipt', 40, 58);
  doc.setFontSize(14);
  doc.text(receipt.receiptNumber, pageWidth - 40, 38, { align: 'right' });

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10);
  let y = 120;
  const line = (label, value) => {
    doc.setFont(undefined, 'bold');
    doc.text(`${label}:`, 40, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(value ?? '—'), 160, y);
    y += 18;
  };

  line('Receipt Date', receipt.receiptDate);
  line('Customer', receipt.customerName);
  line('Category', receipt.customerCategory);
  line('Payment Mode', receipt.paymentMode);
  line('Bank Name', receipt.bankName);
  line('UTR Number', receipt.utrNumber);
  line('Received Amount', receipt.receivedAmount);
  if (receipt.tds) line('TDS', receipt.tds);
  if (receipt.tcs) line('TCS', receipt.tcs);
  if (receipt.commission) line('Commission', receipt.commission);
  if (receipt.remarks) line('Remarks', receipt.remarks);

  y += 10;
  autoTable(doc, {
    startY: y,
    head: [['Invoice Number', 'Invoice Date', 'Original Bill Amount', 'Amount Adjusted']],
    body: allocations.map((a) => [a.invoiceNumber, a.invoiceDate, a.originalBillAmount, a.amountAdjusted]),
    headStyles: { fillColor: BRAND.primary, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 6 },
    margin: { left: 40, right: 40 },
  });

  const finalY = doc.lastAutoTable.finalY + 24;
  doc.setFont(undefined, 'bold');
  doc.text('Payment Received:', 320, finalY);
  doc.text(String(receipt.receivedAmount), 500, finalY, { align: 'right' });
  doc.text('Less: Amount Adjusted:', 320, finalY + 18);
  doc.text(String(receipt.totalAdjusted), 500, finalY + 18, { align: 'right' });
  doc.setDrawColor(...BRAND.gold);
  doc.line(320, finalY + 26, 500, finalY + 26);
  doc.text('Receipt Balance:', 320, finalY + 44);
  doc.text('₹0.00', 500, finalY + 44, { align: 'right' });

  doc.save(`${receipt.receiptNumber}.pdf`);
}
