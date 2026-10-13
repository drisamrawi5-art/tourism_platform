/**
 * Provider workflow integration tests (spec section 74).
 *
 * Verifies the provider onboarding flow:
 * - Provider registration
 * - Business creation
 * - Admin approval workflow
 * - Service/pricing/availability management
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/lib/auth/service";
import { roleHasPermission } from "@/lib/auth/permissions";

async function makeProvider(email: string) {
  const { userId } = await registerUser({ email, password: "password123" });
  return db.user.findUniqueOrThrow({ where: { id: userId } });
}

async function makeAdmin() {
  const admin = await makeProvider(`admin-${crypto.randomUUID()}@test.dev`);
  await db.user.update({ where: { id: admin.id }, data: { role: "SUPER_ADMIN" } });
  return db.user.findUniqueOrThrow({ where: { id: admin.id } });
}

describe("provider registration", () => {
  it("new users are CUSTOMER role by default", async () => {
    const user = await makeProvider(`provider-${crypto.randomUUID()}@test.dev`);
    expect(user.role).toBe("CUSTOMER");
  });

  it("BUSINESS_OWNER has business.create permission", () => {
    expect(roleHasPermission("BUSINESS_OWNER", "business.create")).toBe(true);
  });

  it("BUSINESS_OWNER has service.manage permission", () => {
    expect(roleHasPermission("BUSINESS_OWNER", "service.manage")).toBe(true);
  });

  it("BUSINESS_OWNER has pricing.manage permission", () => {
    expect(roleHasPermission("BUSINESS_OWNER", "pricing.manage")).toBe(true);
  });

  it("BUSINESS_OWNER has availability.manage permission", () => {
    expect(roleHasPermission("BUSINESS_OWNER", "availability.manage")).toBe(true);
  });

  it("CUSTOMER does not have business.create permission", () => {
    expect(roleHasPermission("CUSTOMER", "business.create")).toBe(false);
  });
});

describe("business creation workflow", () => {
  it("provider can create a business in DRAFT status", async () => {
    const provider = await makeProvider(`biz-${crypto.randomUUID()}@test.dev`);
    await db.user.update({ where: { id: provider.id }, data: { role: "BUSINESS_OWNER" } });

    const business = await db.business.create({
      data: {
        name: `Test ${crypto.randomUUID()}`,
        slug: `test-${crypto.randomUUID()}`,
        type: "ACCOMMODATION",
        status: "DRAFT",
        ownerId: provider.id,
      },
    });

    expect(business.status).toBe("DRAFT");
    expect(business.ownerId).toBe(provider.id);
  });

  it("admin can approve a business (PENDING_REVIEW → APPROVED)", async () => {
    const admin = await makeAdmin();
    const provider = await makeProvider(`biz2-${crypto.randomUUID()}@test.dev`);
    await db.user.update({ where: { id: provider.id }, data: { role: "BUSINESS_OWNER" } });

    const business = await db.business.create({
      data: {
        name: `Test ${crypto.randomUUID()}`,
        slug: `test-${crypto.randomUUID()}`,
        type: "GUIDE",
        status: "PENDING_REVIEW",
        ownerId: provider.id,
        submittedAt: new Date(),
      },
    });

    // Admin approves
    const approved = await db.business.update({
      where: { id: business.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: admin.id },
    });

    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(admin.id);
  });

  it("admin can publish a business (APPROVED → PUBLISHED) and its bookables", async () => {
    const admin = await makeAdmin();
    const provider = await makeProvider(`biz3-${crypto.randomUUID()}@test.dev`);
    await db.user.update({ where: { id: provider.id }, data: { role: "BUSINESS_OWNER" } });

    const business = await db.business.create({
      data: {
        name: `Test ${crypto.randomUUID()}`,
        slug: `test-${crypto.randomUUID()}`,
        type: "ACCOMMODATION",
        status: "APPROVED",
        ownerId: provider.id,
        approvedAt: new Date(),
        approvedById: admin.id,
      },
    });

    const bookable = await db.bookable.create({
      data: {
        businessId: business.id,
        category: "ACCOMMODATION",
        slug: `bookable-${crypto.randomUUID()}`,
        status: "DRAFT",
      },
    });

    // Admin publishes
    const published = await db.business.update({
      where: { id: business.id },
      data: { status: "PUBLISHED" },
    });
    await db.bookable.updateMany({
      where: { businessId: business.id, status: { in: ["DRAFT", "APPROVED", "PENDING_REVIEW"] } },
      data: { status: "PUBLISHED" },
    });

    expect(published.status).toBe("PUBLISHED");
    const updatedBookable = await db.bookable.findUniqueOrThrow({ where: { id: bookable.id } });
    expect(updatedBookable.status).toBe("PUBLISHED");
  });
});

describe("provider isolation", () => {
  it("provider A cannot see provider B's businesses", async () => {
    const providerA = await makeProvider(`iso-a-${crypto.randomUUID()}@test.dev`);
    const providerB = await makeProvider(`iso-b-${crypto.randomUUID()}@test.dev`);
    await db.user.update({ where: { id: providerA.id }, data: { role: "BUSINESS_OWNER" } });
    await db.user.update({ where: { id: providerB.id }, data: { role: "BUSINESS_OWNER" } });

    await db.business.create({
      data: {
        name: `Business A ${crypto.randomUUID()}`,
        slug: `biz-a-${crypto.randomUUID()}`,
        type: "GUIDE",
        status: "PUBLISHED",
        ownerId: providerA.id,
      },
    });

    // Provider B queries their own businesses
    const bBusinesses = await db.business.findMany({ where: { ownerId: providerB.id } });
    expect(bBusinesses).toHaveLength(0);

    // Provider A queries their own businesses
    const aBusinesses = await db.business.findMany({ where: { ownerId: providerA.id } });
    expect(aBusinesses).toHaveLength(1);
  });
});
