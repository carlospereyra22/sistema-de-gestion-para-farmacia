import {
  accountDueDate,
  accountDueStatus,
  accountToday,
} from "./account-due-date";

it("uses Argentine civil days, including timestamps just after UTC midnight", () => {
  const time = new Date("2026-10-10T01:30:00Z");
  expect(accountToday(time)).toBe("2026-10-09");
  expect(accountDueDate(time, 1)?.toISOString()).toBe(
    "2026-10-10T00:00:00.000Z",
  );
  expect(accountDueDate(time, 0)?.toISOString()).toBe(
    "2026-10-09T00:00:00.000Z",
  );
});
it("adds calendar days across leap days and year boundaries", () => {
  expect(
    accountDueDate(new Date("2024-02-28T12:00:00Z"), 2)
      ?.toISOString()
      .slice(0, 10),
  ).toBe("2024-03-01");
  expect(
    accountDueDate(new Date("2026-12-31T12:00:00Z"), 1)
      ?.toISOString()
      .slice(0, 10),
  ).toBe("2027-01-01");
});
it("preserves no term and rejects invalid terms", () => {
  expect(accountDueDate(new Date(), null)).toBeNull();
  expect(accountDueDate(new Date(), undefined)).toBeNull();
  for (const days of [-1, 1.5, 3651, NaN])
    expect(() => accountDueDate(new Date(), days)).toThrow();
});
it("does not mark a sale late on its due date", () => {
  const due = new Date("2026-10-10T00:00:00Z");
  expect(accountDueStatus(due, "2026-10-09")).toEqual({
    status: "UPCOMING",
    daysOverdue: 0,
  });
  expect(accountDueStatus(due, "2026-10-10")).toEqual({
    status: "TODAY",
    daysOverdue: 0,
  });
  expect(accountDueStatus(due, "2026-10-11")).toEqual({
    status: "OVERDUE",
    daysOverdue: 1,
  });
  expect(accountDueStatus(null, "2026-10-11")).toEqual({
    status: "UNDATED",
    daysOverdue: 0,
  });
});
