import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { ValidationIssue } from "../types";
import { toValidationIssueRows } from "./validationIssues";

type ExportOptions = {
  fileNamePrefix?: string;
};

function formatDateForFileName(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
}

export async function exportValidationIssuesToExcel(
  issues: ValidationIssue[],
  options?: ExportOptions,
): Promise<void> {
  if (!issues.length) {
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Ошибки_и_предупреждения");
  const rows = toValidationIssueRows(issues);

  worksheet.columns = [
    { header: "№", key: "index", width: 8 },
    { header: "Тип", key: "level", width: 22 },
    { header: "Позиция", key: "position", width: 34 },
    { header: "Контекст строки", key: "rowContext", width: 64 },
    { header: "Ячейка с ошибкой", key: "errorCell", width: 38 },
    { header: "Описание", key: "message", width: 96 },
  ];

  for (const row of rows) {
    worksheet.addRow({
      index: row.index,
      level: row.level,
      position: row.position,
      rowContext: row.rowContext,
      errorCell: row.errorCell,
      message: row.message,
    });
  }

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
    row.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
      const isHeader = rowNumber === 1;
      const isDescription = colNumber === 4;
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: isDescription && !isHeader ? "left" : "center",
        wrapText: true,
      };
    });
  });

  const base = options?.fileNamePrefix ?? "Результат_валидации_документа";
  const datePart = formatDateForFileName(new Date());
  const fileName = `${base}_${datePart}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob(
    [buffer],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  );
  saveAs(blob, fileName);
}
