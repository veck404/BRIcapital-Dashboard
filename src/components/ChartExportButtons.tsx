import type { RefObject } from "react";
import { useState } from "react";

interface ChartExportButtonsProps {
  targetRef: RefObject<HTMLElement | null>;
  fileName: string;
  disabled?: boolean;
  className?: string;
}

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "chart-export";

const downloadDataUrl = (dataUrl: string, fileName: string) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const captureChart = async (
  target: HTMLElement,
  toJpeg: (
    node: HTMLElement,
    options: {
      quality: number;
      pixelRatio: number;
      cacheBust: boolean;
      backgroundColor: string;
    },
  ) => Promise<string>,
) =>
  toJpeg(target, {
    quality: 0.95,
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#ffffff",
  });

const ChartExportButtons = ({
  targetRef,
  fileName,
  disabled = false,
  className,
}: ChartExportButtonsProps) => {
  const [busyFormat, setBusyFormat] = useState<"jpg" | "pdf" | null>(null);

  const handleExportJpg = async () => {
    const target = targetRef.current;
    if (!target) {
      return;
    }
    setBusyFormat("jpg");
    try {
      const { toJpeg } = await import("html-to-image");
      const jpgDataUrl = await captureChart(target, toJpeg);
      downloadDataUrl(jpgDataUrl, `${sanitizeFileName(fileName)}.jpg`);
    } catch (error) {
      console.error("Unable to export chart as JPG.", error);
    } finally {
      setBusyFormat(null);
    }
  };

  const handleExportPdf = async () => {
    const target = targetRef.current;
    if (!target) {
      return;
    }
    setBusyFormat("pdf");
    try {
      const [{ toJpeg }, { jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);
      const jpgDataUrl = await captureChart(target, toJpeg);
      const width = Math.max(target.clientWidth, 1);
      const height = Math.max(target.clientHeight, 1);
      const pdf = new jsPDF({
        orientation: width >= height ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const scale = Math.min(
        (pageWidth - (margin * 2)) / width,
        (pageHeight - (margin * 2)) / height,
      );
      const renderWidth = width * scale;
      const renderHeight = height * scale;
      const x = (pageWidth - renderWidth) / 2;
      const y = (pageHeight - renderHeight) / 2;
      pdf.addImage(jpgDataUrl, "JPEG", x, y, renderWidth, renderHeight, undefined, "FAST");
      pdf.save(`${sanitizeFileName(fileName)}.pdf`);
    } catch (error) {
      console.error("Unable to export chart as PDF.", error);
    } finally {
      setBusyFormat(null);
    }
  };

  const isBusy = busyFormat !== null;
  const isDisabled = disabled || isBusy;

  return (
    <div className={className ?? "inline-flex items-center gap-2"}>
      <button
        type="button"
        onClick={() => {
          void handleExportJpg();
        }}
        disabled={isDisabled}
        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
          isDisabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        }`}
        aria-label="Export chart as JPG"
      >
        {busyFormat === "jpg" ? "Exporting..." : "JPG"}
      </button>
      <button
        type="button"
        onClick={() => {
          void handleExportPdf();
        }}
        disabled={isDisabled}
        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
          isDisabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        }`}
        aria-label="Export chart as PDF"
      >
        {busyFormat === "pdf" ? "Exporting..." : "PDF"}
      </button>
    </div>
  );
};

export default ChartExportButtons;
