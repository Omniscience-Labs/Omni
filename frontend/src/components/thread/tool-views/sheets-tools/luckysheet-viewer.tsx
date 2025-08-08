import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fetchFileContent } from '@/hooks/react-query/files/use-file-queries';

declare global {
  interface Window {
    XLSX?: any;
    luckysheet?: any;
    $?: any;
    jQuery?: any;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function loadStyle(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

function argbToHex(argb?: string): string | undefined {
  if (!argb || typeof argb !== 'string') return undefined;
  const v = argb.replace(/^#/, '');
  if (v.length === 8) return `#${v.slice(2)}`;
  if (v.length === 6) return `#${v}`;
  return undefined;
}

function mapType(t: string | undefined): string {
  switch (t) {
    case 'n':
    case 'd':
    case 'b':
    case 's':
    case 'str':
    case 'e':
      return t;
    default:
      return 'g';
  }
}

export interface LuckysheetViewerProps {
  xlsxPath: string;
  sandboxId?: string;
  className?: string;
  height?: number | string;
}

export function LuckysheetViewer({ xlsxPath, sandboxId, className, height }: LuckysheetViewerProps) {
  const { session } = useAuth();
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const containerIdRef = React.useRef<string>(`luckysheet-${Math.random().toString(36).slice(2)}`);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [measuredHeight, setMeasuredHeight] = React.useState<number>(0);

  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el || height) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setMeasuredHeight(Math.max(0, rect.height));
      try { window.luckysheet?.resize?.(); } catch {}
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setMeasuredHeight(Math.max(0, rect.height));
    return () => ro.disconnect();
  }, [height]);

  React.useEffect(() => {
    let disposed = false;
    async function init() {
      try {
        setLoading(true);
        setError(null);
        loadStyle('https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/plugins/css/pluginsCss.css');
        loadStyle('https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/plugins/plugins.css');
        loadStyle('https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/css/luckysheet.css');

        await loadScript('https://cdn.jsdelivr.net/npm/jquery@3.6.4/dist/jquery.min.js');
        if (!window.$ && (window as any).jQuery) window.$ = (window as any).jQuery;
        await loadScript('https://cdn.jsdelivr.net/npm/jquery-mousewheel@3.1.13/jquery.mousewheel.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/plugins/js/plugin.js');
        await loadScript('https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/luckysheet.umd.js');
        if (disposed) return;

        let ab: ArrayBuffer;
        if (sandboxId && session?.access_token) {
          const blob = (await fetchFileContent(
            sandboxId,
            xlsxPath,
            'blob',
            session.access_token
          )) as Blob;
          ab = await blob.arrayBuffer();
        } else {
          const resp = await fetch(xlsxPath);
          if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
          ab = await resp.arrayBuffer();
        }

        const XLSX = window.XLSX;
        const wb = XLSX.read(ab, { type: 'array', cellStyles: true });

        const sheetsForLucky: any[] = [];

        wb.SheetNames.forEach((name: string, idx: number) => {
          const ws = wb.Sheets[name];
          const ref = ws['!ref'] || 'A1:A1';
          const range = XLSX.utils.decode_range(ref);

          const celldata: any[] = [];
          for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
              const addr = XLSX.utils.encode_cell({ r, c });
              const cell = ws[addr];
              if (!cell) continue;
              const v: any = {
                v: cell.v,
                m: (cell.w ?? String(cell.v ?? '')),
                ct: { t: mapType(cell.t), fa: cell.z || 'General' },
              };
              const s = (cell as any).s || {};
              const font = s.font || {};
              const fill = s.fill || {};
              const alignment = s.alignment || {};

              if (font.bold) v.bl = 1;
              if (font.italic) v.it = 1;
              if (font.sz) v.fs = Number(font.sz);
              const fc = font.color?.rgb || font.color?.rgbColor || font.color;
              const bg = fill.fgColor?.rgb || fill.bgColor?.rgb || fill.fgColor || fill.bgColor;
              const fcHex = argbToHex(typeof fc === 'string' ? fc : undefined);
              const bgHex = argbToHex(typeof bg === 'string' ? bg : undefined);
              if (fcHex) v.fc = fcHex;
              if (bgHex) v.bg = bgHex;

              if (alignment) {
                if (alignment.horizontal) v.ht = alignment.horizontal;
                if (alignment.vertical) v.vt = alignment.vertical;
                if (alignment.wrapText) v.tb = 1;
              }

              celldata.push({ r, c, v });
            }
          }

          const mergeConfig: Record<string, any> = {};
          const merges = ws['!merges'] || [];
          merges.forEach((m: any) => {
            const rs = m.e.r - m.s.r + 1;
            const cs = m.e.c - m.s.c + 1;
            mergeConfig[`${m.s.r}_${m.s.c}`] = { r: m.s.r, c: m.s.c, rs, cs };
          });

          const columnlen: Record<number, number> = {};
          const cols = ws['!cols'] || [];
          cols.forEach((col: any, i: number) => {
            const wpx = col.wpx || (col.wch ? Math.round(col.wch * 7) : undefined);
            if (wpx) columnlen[i] = wpx;
          });

          const rowlen: Record<number, number> = {};
          const rows = ws['!rows'] || [];
          rows.forEach((row: any, i: number) => {
            const hpx = row.hpx || (row.hpt ? Math.round(row.hpt * 1.33) : undefined);
            if (hpx) rowlen[i] = hpx;
          });

          const config: any = {};
          if (Object.keys(mergeConfig).length) config.merge = mergeConfig;
          if (Object.keys(columnlen).length) config.columnlen = columnlen;
          if (Object.keys(rowlen).length) config.rowlen = rowlen;

          sheetsForLucky.push({
            name,
            index: idx,
            status: 1,
            order: idx,
            celldata,
            config,
          });
        });

        if (!containerRef.current) return;
        containerRef.current.innerHTML = '';
        window.luckysheet?.create({
          container: containerIdRef.current,
          data: sheetsForLucky,
          showtoolbar: true,
          showinfobar: false,
          showsheetbar: true,
          allowCopy: true,
        });
        if (!disposed) setLoading(false);
      } catch (e: any) {
        if (!disposed) {
          setError(e?.message || 'Failed to load sheet');
          setLoading(false);
        }
      }
    }
    init();
    return () => { disposed = true; };
  }, [xlsxPath, sandboxId, session?.access_token]);

  const resolvedHeight = height ?? measuredHeight ?? 0;

  return (
    <div ref={wrapperRef} className={className} style={{ height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined }}>
      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : (
        <div id={containerIdRef.current} ref={containerRef} style={{ height: resolvedHeight, width: '100%' }} />
      )}
      {loading && !error && (
        <div className="text-xs text-muted-foreground mt-2">Loading formatted viewer…</div>
      )}
    </div>
  );
} 