/** Shared A4 presentation; no remote fonts or assets needed to print. */
export const accountStatementStyle = `
@page{size:A4 portrait;margin:14mm}
*{box-sizing:border-box}
body{font:12px Arial,Helvetica,sans-serif;color:#243449;background:white;margin:0;line-height:1.5}
header{background:#1e293b;color:white;border-bottom:4px solid #0088c2;padding:22px 24px;break-inside:avoid}
header strong{font-size:13px;letter-spacing:.5px}header p{margin:5px 0}header .muted{color:#d1e0ef}
h1{font-size:27px;line-height:1.2;margin:12px 0 8px;text-transform:uppercase;letter-spacing:.4px}
h2{font-size:18px;margin:24px 0 3px;break-after:avoid;color:#1e293b}
p{margin:8px 0;line-height:1.6}.muted{font-size:10px;color:#61748b}.meta{display:flex;justify-content:space-between;gap:16px}
.compact-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 18px}
.compact-header>div{min-width:0;overflow-wrap:anywhere}
.compact-header .report-heading{text-align:right}
.compact-header h1{font-size:21px;margin:0 0 4px}
.compact-header p{margin:2px 0;font-size:10px}
.compact-header .muted{font-size:9px}
table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:12px}
thead{display:table-header-group}th{background:#edf2f7;color:#475569;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.2px;border-bottom:2px solid #cbd5e1}
th,td{padding:10px 7px;vertical-align:top;overflow-wrap:anywhere}td{border-bottom:1px solid #dfe7ef}tbody tr:nth-child(even){background:#f7f9fc}tr{break-inside:avoid}
.amount{text-align:right;font-variant-numeric:tabular-nums;font-size:11px}.credit{color:#087548;font-weight:bold}.movement{font-weight:bold;color:#1e293b}.reference{display:block;margin-top:3px;font-size:9px;color:#64748b}
.balance{display:flex;justify-content:space-between;gap:16px;align-items:center;background:#f1f6fa;padding:12px 16px;border-left:3px solid #0088c2;break-inside:avoid}.balance strong{font-size:16px;white-space:nowrap}.closing{margin-top:16px;background:#1e293b;color:white;border-left:4px solid #0088c2}.closing strong{font-size:20px}
.warning{padding:12px;background:#fff8e8;border:1px solid #ecd8aa;margin:16px 0}.subtotal{text-align:right;padding:10px;font-weight:bold;break-before:avoid}.total{display:flex;justify-content:space-between;gap:16px;padding:16px;background:#1e293b;color:white;border-top:3px solid #0088c2;font-weight:bold;font-size:18px;margin-top:20px;break-inside:avoid}
footer{margin-top:24px;padding-top:10px;border-top:1px solid #cbd5e1}
@media screen{body{max-width:210mm;margin:auto;padding:14mm}}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2{break-after:avoid}}
`;
