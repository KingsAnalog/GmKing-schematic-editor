import { describe, expect, it, vi } from "vitest";
import { rasterizeSchematicSvg, schematicPngSize, writeSchematicImageClipboard } from "../../../src/schematic/imageExport";

function imageHost(failLoad = false) {
  const png = new Blob(["png"], { type: "image/png" });
  const context = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: "" };
  const canvas = {
    width: 0, height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(png))
  };
  let imageUrl = "";
  const clipboard = { write: vi.fn().mockResolvedValue(undefined) };
  const urls = { createObjectURL: vi.fn(() => "blob:owner-window"), revokeObjectURL: vi.fn() };
  const ownerDocument = {
    createElement: vi.fn(() => canvas),
    defaultView: {
      URL: urls,
      navigator: { clipboard },
      ClipboardItem: class { constructor(readonly entries: Record<string, Blob>) {} },
      Image: class {
        onload?: () => void;
        onerror?: () => void;
        set src(value: string) {
          imageUrl = value;
          queueMicrotask(() => failLoad ? this.onerror?.() : this.onload?.());
        }
      }
    }
  } as unknown as Document;
  return { ownerDocument, canvas, context, png, clipboard, urls, imageUrl: () => imageUrl };
}

describe("shared schematic image export", () => {
  it.each([[6000, 1000], [1000, 6000], [1000000, 1000000], [1e9, 500]])(
    "keeps %s × %s within canvas limits using the same scale on both axes", (width, height) => {
      const size = schematicPngSize(width, height);
      expect(size.width).toBeLessThanOrEqual(8192);
      expect(size.height).toBeLessThanOrEqual(8192);
      expect(size.width * size.height).toBeLessThanOrEqual(48_000_000);
      // Raster rounding may differ by less than one pixel per axis.
      const scale = width >= height ? size.width / width : size.height / height;
      expect(Math.abs(size.width - width * scale)).toBeLessThanOrEqual(1);
      expect(Math.abs(size.height - height * scale)).toBeLessThanOrEqual(1);
    }
  );

  it("retains the usual 2× resolution for small diagrams", () => {
    expect(schematicPngSize(800, 520)).toEqual({ width: 1600, height: 1040 });
  });

  it.each([[0, 1], [-1, 1], [Infinity, 1], [1, NaN]])("rejects invalid dimensions %s × %s", (width, height) => {
    expect(() => schematicPngSize(width, height)).toThrow("Invalid schematic image dimensions.");
  });

  it("rasterizes in the supplied window with proportional dimensions and optional white background", async () => {
    const host = imageHost();
    const result = await rasterizeSchematicSvg({ svg: "<svg/>", width: 6000, height: 1000 }, host.ownerDocument, { backgroundColor: "#ffffff" });
    expect(result).toBe(host.png);
    expect(host.canvas.width).toBe(8192);
    expect(host.canvas.height).toBe(1365);
    expect(host.context.fillStyle).toBe("#ffffff");
    expect(host.context.fillRect).toHaveBeenCalledWith(0, 0, 8192, 1365);
    expect(host.context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 8192, 1365);
    expect(host.urls.revokeObjectURL).toHaveBeenCalledWith("blob:owner-window");
  });

  it("loads HTML notes via a data URL and preserves transparency by default", async () => {
    const host = imageHost();
    await rasterizeSchematicSvg({ svg: "<svg><foreignObject/></svg>", width: 100, height: 40 }, host.ownerDocument);
    expect(host.imageUrl()).toMatch(/^data:image\/svg\+xml/);
    expect(host.context.fillRect).not.toHaveBeenCalled();
    expect(host.urls.createObjectURL).not.toHaveBeenCalled();
    expect(host.urls.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("releases the object URL when image loading fails", async () => {
    const host = imageHost(true);
    await expect(rasterizeSchematicSvg({ svg: "<svg/>", width: 100, height: 40 }, host.ownerDocument)).rejects.toThrow("SVG image could not be loaded.");
    expect(host.urls.revokeObjectURL).toHaveBeenCalledOnce();
    expect(host.canvas.toBlob).not.toHaveBeenCalled();
  });

  it("releases the object URL when PNG encoding fails", async () => {
    const host = imageHost();
    host.canvas.toBlob.mockImplementation(callback => callback(null));
    await expect(rasterizeSchematicSvg({ svg: "<svg/>", width: 100, height: 40 }, host.ownerDocument)).rejects.toThrow("PNG export failed.");
    expect(host.urls.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("writes image entries through the supplied window's clipboard", async () => {
    const host = imageHost();
    await writeSchematicImageClipboard(host.ownerDocument, { "image/png": host.png });
    expect(host.clipboard.write).toHaveBeenCalledWith([expect.objectContaining({ entries: { "image/png": host.png } })]);
    await expect(writeSchematicImageClipboard({ defaultView: null } as Document, {})).rejects.toThrow("Image clipboard is unavailable.");
  });
});
