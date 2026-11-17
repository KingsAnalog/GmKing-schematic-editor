import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentlyClosedTabController } from "../../../src/schematic/recentlyClosedTab";

describe("RecentlyClosedTabController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retains one entry until it is taken", () => {
    const controller = new RecentlyClosedTabController<string>(10_000);
    const entry = { value: "first", index: 2 };

    controller.replace(entry);

    expect(controller.peek()).toBe(entry);
    expect(controller.take()).toBe(entry);
    expect(controller.peek()).toBeNull();
    expect(controller.take()).toBeNull();
  });

  it("expires the entry after the configured window", () => {
    vi.useFakeTimers();
    const expired: string[] = [];
    const controller = new RecentlyClosedTabController<string>(10_000);

    controller.replace(
      { value: "first", index: 0 },
      (entry) => expired.push(entry.value)
    );
    vi.advanceTimersByTime(9_999);
    expect(controller.peek()?.value).toBe("first");

    vi.advanceTimersByTime(1);
    expect(controller.peek()).toBeNull();
    expect(expired).toEqual(["first"]);
  });

  it("immediately evicts the previous entry when another tab closes", () => {
    vi.useFakeTimers();
    const expired: string[] = [];
    const controller = new RecentlyClosedTabController<string>(10_000);

    controller.replace(
      { value: "first", index: 0 },
      (entry) => expired.push(entry.value)
    );
    vi.advanceTimersByTime(4_000);
    controller.replace(
      { value: "second", index: 1, replacementId: "blank" },
      (entry) => expired.push(entry.value)
    );
    vi.advanceTimersByTime(6_000);

    expect(controller.peek()?.value).toBe("second");
    expect(expired).toEqual([]);

    vi.advanceTimersByTime(4_000);
    expect(controller.peek()).toBeNull();
    expect(expired).toEqual(["second"]);
  });
});
