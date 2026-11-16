import { seatLayout } from './seat-layout';
import { seatDetails, seatRows, type SeatBooking } from './seat-overview';

export async function downloadSeatOverview(bookings: Map<number, SeatBooking>) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('좌석 배치표', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  sheet.columns = [12, 22, 22, 5, 12, 22, 22, 5, 12, 22, 22].map(width => ({ width }));
  seatLayout.forEach(({ upper, lower }, blockIndex) => {
    const firstColumn = blockIndex * 4 + 1;
    for (const [pairs, firstRow] of [[upper, 1], [lower, upper.length * seatRows.length + 3]] as const) {
      pairs.forEach(([left, right], pairIndex) => {
        const leftDetails = seatDetails(left, bookings);
        const rightDetails = seatDetails(right, bookings);
        seatRows.forEach((label, fieldIndex) => {
          const row = sheet.getRow(firstRow + pairIndex * seatRows.length + fieldIndex);
          row.height = 17;
          [label, leftDetails[fieldIndex], rightDetails[fieldIndex]].forEach((value, index) => {
            const cell = row.getCell(firstColumn + index);
            const isSeatGap = (index === 1 && left === null) || (index === 2 && right === null);
            cell.value = value;
            cell.alignment = { vertical: 'middle', horizontal: index === 0 ? 'right' : 'center' };
            cell.numFmt = fieldIndex >= 2 && index > 0 ? '@' : 'General';
            cell.font = { name: '맑은 고딕', size: 10, bold: fieldIndex === 0 };
            const fill = isSeatGap ? 'FFE5E7EB' : fieldIndex === 0 ? 'FFBDD7EE' : 'FFFFFFFF';
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
            const edge = { style: 'thin', color: { argb: 'FF4B5563' } } as const;
            cell.border = { top: edge, left: edge, bottom: edge, right: edge };
          });
        });
      });
    }
  });

  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '채토피아_좌석배치표.xlsx';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
