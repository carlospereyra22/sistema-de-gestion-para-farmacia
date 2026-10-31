param(
  [Parameter(Mandatory=$true)]
  [string]$PrinterName,

  [Parameter(Mandatory=$true)]
  [string]$FilePath
)

$ErrorActionPreference = "Stop"

$source = @"
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOC_INFO_1
    {
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDocName;

        [MarshalAs(UnmanagedType.LPWStr)]
        public string pOutputFile;

        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint="OpenPrinterW",
        SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool OpenPrinter(
        string szPrinter,
        out IntPtr hPrinter,
        IntPtr pd
    );

    [DllImport("winspool.Drv", EntryPoint="ClosePrinter",
        SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW",
        SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern int StartDocPrinter(
        IntPtr hPrinter,
        int level,
        [In] DOC_INFO_1 di
    );

    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter",
        SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter",
        SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter",
        SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="WritePrinter",
        SetLastError=true)]
    public static extern bool WritePrinter(
        IntPtr hPrinter,
        IntPtr pBytes,
        int dwCount,
        out int dwWritten
    );

    public static void SendFile(
        string printerName,
        string filePath
    )
    {
        byte[] data = File.ReadAllBytes(filePath);

        IntPtr hPrinter = IntPtr.Zero;
        IntPtr pBytes = IntPtr.Zero;

        if (!OpenPrinter(
            printerName,
            out hPrinter,
            IntPtr.Zero
        ))
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "No se pudo abrir la impresora."
            );
        }

        try
        {
            DOC_INFO_1 di = new DOC_INFO_1();
            di.pDocName =
                "Farmacia Juncos - Ticket ESC POS";
            di.pDataType = "RAW";

            int jobId =
                StartDocPrinter(
                    hPrinter,
                    1,
                    di
                );

            if (jobId == 0)
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "No se pudo iniciar el trabajo RAW."
                );
            }

            try
            {
                if (!StartPagePrinter(hPrinter))
                {
                    throw new Win32Exception(
                        Marshal.GetLastWin32Error(),
                        "No se pudo iniciar la pagina."
                    );
                }

                try
                {
                    pBytes =
                        Marshal.AllocCoTaskMem(
                            data.Length
                        );

                    Marshal.Copy(
                        data,
                        0,
                        pBytes,
                        data.Length
                    );

                    int written;

                    if (!WritePrinter(
                        hPrinter,
                        pBytes,
                        data.Length,
                        out written
                    ))
                    {
                        throw new Win32Exception(
                            Marshal.GetLastWin32Error(),
                            "WritePrinter fallo."
                        );
                    }

                    if (written != data.Length)
                    {
                        throw new Exception(
                            "Se enviaron " +
                            written +
                            " de " +
                            data.Length +
                            " bytes."
                        );
                    }
                }
                finally
                {
                    if (pBytes != IntPtr.Zero)
                    {
                        Marshal.FreeCoTaskMem(
                            pBytes
                        );
                    }

                    EndPagePrinter(hPrinter);
                }
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            if (hPrinter != IntPtr.Zero)
            {
                ClosePrinter(hPrinter);
            }
        }
    }
}
"@

if (-not ("RawPrinterHelper" -as [type]))
{
    Add-Type `
      -TypeDefinition $source `
      -Language CSharp
}

[RawPrinterHelper]::SendFile(
    $PrinterName,
    $FilePath
)

Write-Output "OK"
