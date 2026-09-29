import QRCode from "qrcode";
export interface QrMatrix { size: number; cells: boolean[]; }
export function createQrMatrix(value: string): QrMatrix { const qr = QRCode.create(value, { errorCorrectionLevel: "M" }); return { size: qr.modules.size, cells: Array.from(qr.modules.data, Boolean) }; }
export function qrRuns(matrix: QrMatrix) { const runs: Array<{ row: number; start: number; length: number }> = []; for (let row = 0; row < matrix.size; row += 1) { let start = -1; for (let col = 0; col <= matrix.size; col += 1) { const dark = col < matrix.size && matrix.cells[row * matrix.size + col]; if (dark && start < 0) start = col; if (!dark && start >= 0) { runs.push({ row, start, length: col - start }); start = -1; } } } return runs; }
