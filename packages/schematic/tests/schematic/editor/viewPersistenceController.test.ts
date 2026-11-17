import { expect, it, vi } from "vitest";
import { SchematicViewPersistenceController } from "../../../src/schematic/viewPersistenceController";

it("coalesces viewport events and flushes the final view on unmount", () => {
  let frame!: () => void;
  const write = vi.fn();
  const schedule = vi.fn(callback => { frame = callback; return 1; });
  const controller = new SchematicViewPersistenceController({ schedule, cancel: vi.fn(), write, onError: vi.fn() });
  for (let zoom = 1; zoom <= 10; zoom++) controller.update("doc", { zoom });
  expect(schedule).toHaveBeenCalledTimes(1);
  frame();
  expect(write).toHaveBeenCalledExactlyOnceWith("doc", { zoom: 10 });
  controller.update("doc", { zoom: 20 });
  controller.destroy();
  expect(write).toHaveBeenLastCalledWith("doc", { zoom: 20 });
});
