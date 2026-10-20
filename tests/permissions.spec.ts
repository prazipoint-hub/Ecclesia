// tests/permissions.spec.ts

import { canReceiveMoney, canConfirmIncome, canRunPOS, canHandToTreasurer } from "../src/models/church-finance-model";
import { RoleAssignment, Role, EntityScope } from "../src/models/church-finance-model";

describe("permission helpers - clarified scopes", () => {
  const churchScope: EntityScope = { type: "church", id: "main" };
  const orgScope: EntityScope = { type: "organization", id: "org-1" };
  const sectionScope: EntityScope = { type: "section", id: "sec-1" };

  const assignments: RoleAssignment[] = [
    { userId: "u1", role: Role.FinanceCommittee, scope: churchScope },
    { userId: "u2", role: Role.ChiefRecordingSecretary, scope: churchScope },
    { userId: "u3", role: Role.Treasurer, scope: orgScope },
    { userId: "u4", role: Role.FinanceCommittee, scope: orgScope },
    { userId: "u5", role: Role.POSOperator, scope: sectionScope },
  ];

  test("church finance committee can receive in church scope", () => {
    expect(canReceiveMoney(assignments.filter(a => a.userId === "u1"), churchScope)).toBe(true);
  });

  test("church chief recording secretary can confirm in church scope", () => {
    expect(canConfirmIncome(assignments.filter(a => a.userId === "u2"), churchScope)).toBe(true);
  });

  test("organization treasurer can receive in org scope", () => {
    expect(canReceiveMoney(assignments.filter(a => a.userId === "u3"), orgScope)).toBe(true);
  });

  test("organization finance committee cannot receive in org scope (only POS)", () => {
    expect(canReceiveMoney(assignments.filter(a => a.userId === "u4"), orgScope)).toBe(false);
  });

  test("organization finance committee can run POS in org scope", () => {
    expect(canRunPOS(assignments.filter(a => a.userId === "u4"), orgScope)).toBe(true);
  });

  test("section POS operator can run POS in section scope", () => {
    expect(canRunPOS(assignments.filter(a => a.userId === "u5"), sectionScope)).toBe(true);
  });

  test("treasurer can be handed to in org scope", () => {
    expect(canHandToTreasurer(assignments.filter(a => a.userId === "u3"), orgScope)).toBe(true);
  });
});
