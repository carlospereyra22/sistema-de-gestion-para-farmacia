import { ForbiddenException } from "@nestjs/common";

import { BranchAccessGuard } from "./branch-access.guard";

describe("BranchAccessGuard", () => {
  it("allows an assigned active branch in the requested organization", async () => {
    const findFirst = jest.fn().mockResolvedValue({ userId: "user-1" });
    const guard = new BranchAccessGuard({ userBranch: { findFirst } } as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { sub: "user-1" },
          params: { organizationId: "org-1", branchId: "branch-1" },
        }),
      }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        branchId: "branch-1",
        branch: { organizationId: "org-1", active: true },
      },
      select: { userId: true },
    });
  });

  it("rejects a branch not assigned to the user", async () => {
    const guard = new BranchAccessGuard({
      userBranch: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { sub: "user-1" },
          params: { organizationId: "org-1", branchId: "branch-2" },
        }),
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
