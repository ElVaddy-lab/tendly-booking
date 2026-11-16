import type { Metadata } from "next";
import { Calendar, ClipboardList, Clock, CreditCard, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { getDashboardData } from "@/lib/onboarding";
import { formatTimeOffPeriod } from "@/lib/timezone";

import {
  AddServiceForm,
  AddStaffForm,
  AddTimeOffForm,
  BillingPlanPanel,
  CopyBookingLinkButton,
  InlineActionButton,
  InviteMemberForm,
  ServiceStaffEditor,
  StaffIntegrationsEditor,
  StaffScheduleEditor,
} from "./dashboard-forms";
import { BookingsWorkbench } from "./bookings-workbench";
import styles from "./dashboard.module.css";

export const metadata: Metadata = {
  title: "Dashboard — Tendly",
  description: "Manage your shop's services, staff schedule, time off, and team invites.",
};

const WEEKDAY_NAMES: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

function formatPrice(priceCents: number | null, currency: string): string {
  if (priceCents === null) {
    return "Free / unpriced";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(priceCents / 100);
}

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)}–${endTime.slice(0, 5)}`;
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

async function DashboardContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ billing?: string | string[] }>;
}) {
  const [ctx, resolvedSearch] = await Promise.all([
    getDashboardData(),
    searchParamsPromise,
  ]);
  const billingParam =
    typeof resolvedSearch?.billing === "string" ? resolvedSearch.billing : null;
  const billingNotice: "success" | "cancelled" | null =
    billingParam === "success" || billingParam === "cancelled" ? billingParam : null;

  if (!ctx.business || !ctx.membership) {
    redirect("/onboarding");
  }

  if (ctx.membership.role === "owner" && !ctx.hasServiceAndSchedule) {
    redirect("/onboarding");
  }

  const {
    userId,
    business,
    membership,
    staff,
    services,
    weeklyHours,
    staffServices,
    timeOff,
    members,
    invitations,
    bookings,
    planUsage,
    nowIso,
  } = ctx;

  const isOwner = membership.role === "owner";
  const canManage = isOwner || membership.role === "manager";
  const ownStaff = staff.find((member) => member.member_user_id === userId) ?? null;
  const publicPath = `/b/${business.slug}`;

  const staffNameById = new Map(staff.map((member) => [member.id, member.display_name]));
  const assignedStaffByService = new Map<string, string[]>();
  for (const link of staffServices) {
    const existing = assignedStaffByService.get(link.service_id) ?? [];
    existing.push(link.staff_id);
    assignedStaffByService.set(link.service_id, existing);
  }

  const activeServicesCount = services.filter((service) => service.is_active).length;
  const activeStaffCount = staff.filter((member) => member.is_active).length;
  const unlinkedStaff = staff.filter((member) => member.member_user_id === null);
  const monogram = business.name.trim().slice(0, 1).toUpperCase() || "T";

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Shop navigation">
        <div className={styles.sidebarTop}>
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>

          <div className={styles.shopIdentity}>
            <span className={styles.shopMonogram} aria-hidden="true">
              {monogram}
            </span>
            <span className={styles.businessName}>{business.name}</span>
            <span className={styles.pillTag}>{membership.role}</span>
          </div>

          {business.is_demo && (
            <span className={styles.demoTag}>Demo business, fictional</span>
          )}

          <div className={styles.bookingLinkBox}>
            <span className={styles.sidebarLabel}>Booking link</span>
            <Link href={publicPath} prefetch={false} className={styles.publicLink}>
              {publicPath}
            </Link>
            <CopyBookingLinkButton publicPath={publicPath} />
          </div>

          <nav className={styles.sideNav} aria-label="Workspace sections">
            <a href="#bookings" className={`${styles.sideNavLink} ${styles.sideNavLinkActive}`}>
              <Calendar className={styles.sideNavIcon} aria-hidden="true" strokeWidth={1.75} />
              Bookings
            </a>
            <a href="#services" className={styles.sideNavLink}>
              <ClipboardList className={styles.sideNavIcon} aria-hidden="true" strokeWidth={1.75} />
              Services
            </a>
            <a href="#schedule" className={styles.sideNavLink}>
              <Clock className={styles.sideNavIcon} aria-hidden="true" strokeWidth={1.75} />
              Schedule
            </a>
            {isOwner ? (
              <a href="#team" className={styles.sideNavLink}>
                <Users className={styles.sideNavIcon} aria-hidden="true" strokeWidth={1.75} />
                Team
              </a>
            ) : null}
            <a href="#time-off" className={styles.sideNavLink}>
              <Clock className={styles.sideNavIcon} aria-hidden="true" strokeWidth={1.75} />
              Time off
            </a>
            <a href="#billing" className={styles.sideNavLink}>
              <CreditCard className={styles.sideNavIcon} aria-hidden="true" strokeWidth={1.75} />
              Plan &amp; billing
            </a>
          </nav>
        </div>

        <div className={styles.sidebarFooter}>
          <p className={styles.planQuota}>
            {planUsage.planTier === "pro"
              ? `Pro plan: ${planUsage.activeStaffCount}/${planUsage.maxStaff} staff · Unlimited services & bookings`
              : `Free plan: ${planUsage.activeStaffCount}/${planUsage.maxStaff} staff · ${planUsage.activeServicesCount}/${planUsage.maxServices ?? 5} services · ${planUsage.monthlyBookingsCount}/${planUsage.maxMonthlyBookings ?? 100} mo`}
          </p>
          {ctx.email ? <p className={styles.sidebarEmail}>{ctx.email}</p> : null}
          <form action={signOutAction}>
            <button type="submit" className={styles.signOutButton}>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.workbenchHeader}>
          <div>
            <h1 className={styles.title}>{business.name}</h1>
            <p className={styles.subtitle}>
              {ctx.email ? `Signed in as ${ctx.email}` : "Shop workspace"}
            </p>
          </div>
          <div className={styles.headerMetaRow}>
            <span className={styles.metaChip}>{business.timezone}</span>
            <span className={styles.metaChip}>
              Every {business.slot_step_minutes} min · {business.min_notice_minutes} min notice
            </span>
          </div>
        </header>

        <BookingsWorkbench
          businessId={business.id}
          timezone={business.timezone}
          canManage={canManage}
          userStaffId={ownStaff?.id ?? null}
          userStaffName={ownStaff?.display_name ?? null}
          nowIso={nowIso}
          staff={staff}
          services={services}
          weeklyHours={weeklyHours}
          timeOff={timeOff}
          bookings={bookings}
        />

        <div className={styles.workbenchColumns}>
          <div className={styles.primaryColumn}>
            <section
              id="services"
              className={styles.sectionBlock}
              aria-labelledby="services-heading"
            >
              <div className={styles.sectionHeadingRow}>
                <h2 id="services-heading" className={styles.sectionTitle}>
                  Services
                </h2>
                <span className={styles.panelMeta}>
                  {activeServicesCount} active · {services.length} configured
                </span>
              </div>

              <div className={styles.restPanel}>
                {services.length > 0 ? (
                  <ul className={styles.list}>
                    {services.map((service) => {
                      const assignedIds = assignedStaffByService.get(service.id) ?? [];
                      const assignedNames = assignedIds
                        .map((id) => staffNameById.get(id))
                        .filter((name): name is string => Boolean(name));

                      return (
                        <li key={service.id} className={styles.listItem}>
                          <div className={styles.itemColumn}>
                            <span className={styles.itemName}>
                              {service.name}
                              {!service.is_active ? " (inactive)" : ""}
                            </span>
                            <span className={styles.itemSubmeta}>
                              {service.duration_min} min
                              {service.buffer_min > 0
                                ? ` (+${service.buffer_min} min buffer)`
                                : ""}{" "}
                              · {formatPrice(service.price_cents, service.currency)}
                            </span>
                            <span className={styles.itemSubmeta}>
                              {assignedNames.length > 0
                                ? `Assigned: ${assignedNames.join(", ")}`
                                : "No staff assigned yet"}
                            </span>

                            {canManage && staff.length > 0 ? (
                              <ServiceStaffEditor
                                businessId={business.id}
                                serviceId={service.id}
                                serviceName={service.name}
                                staff={staff}
                                assignedStaffIds={assignedIds}
                              />
                            ) : null}
                          </div>

                          {canManage ? (
                            <div className={styles.itemActions}>
                              <InlineActionButton
                                actionName="toggleService"
                                fields={{
                                  businessId: business.id,
                                  serviceId: service.id,
                                  nextActive: service.is_active ? "false" : "true",
                                }}
                                label={service.is_active ? "Pause" : "Activate"}
                                pendingLabel="Saving..."
                                ariaLabel={`${service.is_active ? "Pause" : "Activate"} ${service.name}`}
                              />
                              <InlineActionButton
                                actionName="deleteService"
                                fields={{
                                  businessId: business.id,
                                  serviceId: service.id,
                                }}
                                label="Delete"
                                pendingLabel="Removing..."
                                ariaLabel={`Delete ${service.name}`}
                                variant="danger"
                              />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className={styles.emptyNote}>No services configured yet.</p>
                )}
              </div>

              {canManage ? (
                <AddServiceForm businessId={business.id} staff={staff} />
              ) : null}
            </section>

            <section
              id="schedule"
              className={styles.sectionBlock}
              aria-labelledby="schedule-heading"
            >
              <div className={styles.sectionHeadingRow}>
                <h2 id="schedule-heading" className={styles.sectionTitle}>
                  Staff &amp; weekly hours
                </h2>
                <span className={styles.panelMeta}>{activeStaffCount} active</span>
              </div>

              <div className={styles.restPanel}>
                {staff.length > 0 ? (
                  <div>
                    {staff.map((member) => {
                      const memberHours = weeklyHours.filter(
                        (row) => row.staff_id === member.id,
                      );
                      const isOwnProfile = member.member_user_id === userId;

                      return (
                        <section
                          key={member.id}
                          className={styles.staffCard}
                          aria-label={member.display_name}
                        >
                          <div className={styles.staffHead}>
                            <div className={styles.staffIdentity}>
                              <span className={styles.itemName}>{member.display_name}</span>
                              {isOwnProfile ? (
                                <span className={styles.pillTag}>You</span>
                              ) : null}
                              <span className={styles.panelMeta}>
                                {member.is_active ? "Active" : "Inactive"}
                              </span>
                              {member.telegram_linked_at ? (
                                <span className={styles.pillTag}>Telegram linked</span>
                              ) : null}
                              {member.ics_enabled_at ? (
                                <span className={styles.pillTag}>.ics feed</span>
                              ) : null}
                            </div>

                            {canManage ? (
                              <InlineActionButton
                                actionName="toggleStaff"
                                fields={{
                                  businessId: business.id,
                                  staffId: member.id,
                                  nextActive: member.is_active ? "false" : "true",
                                }}
                                label={member.is_active ? "Pause" : "Activate"}
                                pendingLabel="Saving..."
                                ariaLabel={`${member.is_active ? "Pause" : "Activate"} ${member.display_name}`}
                              />
                            ) : null}
                          </div>

                          {memberHours.length > 0 ? (
                            <ul className={styles.hoursList}>
                              {memberHours.map((slot) => (
                                <li key={slot.id} className={styles.hoursRow}>
                                  <span>
                                    {WEEKDAY_NAMES[slot.weekday] ?? `Day ${slot.weekday}`}
                                  </span>
                                  <span>{formatTimeRange(slot.start_time, slot.end_time)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className={styles.metricLabel}>No working hours set yet.</p>
                          )}

                          {canManage ? (
                            <StaffScheduleEditor
                              businessId={business.id}
                              staffId={member.id}
                              staffName={member.display_name}
                              initialHours={memberHours}
                            />
                          ) : null}

                          {canManage || isOwnProfile ? (
                            <StaffIntegrationsEditor
                              businessId={business.id}
                              staffId={member.id}
                              staffName={member.display_name}
                              telegramLinkedAt={member.telegram_linked_at}
                              icsEnabledAt={member.ics_enabled_at}
                            />
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.emptyNote}>No staff profiles added yet.</p>
                )}
              </div>

              {canManage ? (
                <AddStaffForm businessId={business.id} services={services} />
              ) : null}
            </section>
          </div>

          <div className={styles.secondaryColumn}>
            {isOwner ? (
              <section
                id="team"
                className={styles.sectionBlock}
                aria-labelledby="team-heading"
              >
                <div className={styles.sectionHeadingRow}>
                  <h2 id="team-heading" className={styles.sectionTitle}>
                    Team &amp; invitations
                  </h2>
                  <span className={styles.panelMeta}>
                    {members.length} {members.length === 1 ? "member" : "members"} ·{" "}
                    {invitations.length} pending
                  </span>
                </div>

                <div className={styles.restPanel}>
                  {invitations.length > 0 ? (
                    <ul className={styles.list}>
                      {invitations.map((invite) => {
                        const linkedName = invite.staff_id
                          ? staffNameById.get(invite.staff_id)
                          : null;

                        return (
                          <li key={invite.id} className={styles.listItem}>
                            <div className={styles.itemColumn}>
                              <span className={styles.itemName}>
                                Pending {invite.role} invite
                              </span>
                              <span className={styles.itemSubmeta}>
                                {linkedName
                                  ? `Linked to ${linkedName}`
                                  : invite.role === "staff"
                                    ? "Creates a new staff profile on accept"
                                    : "Full manager access"}
                                {" · Expires "}
                                {formatShortDate(invite.expires_at)}
                              </span>
                            </div>

                            <InlineActionButton
                              actionName="revokeInvite"
                              fields={{
                                businessId: business.id,
                                invitationId: invite.id,
                              }}
                              label="Revoke"
                              pendingLabel="Revoking..."
                              ariaLabel={`Revoke ${invite.role} invitation`}
                              variant="danger"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className={styles.emptyNote}>No pending invite links.</p>
                  )}
                </div>

                <InviteMemberForm
                  businessId={business.id}
                  unlinkedStaff={unlinkedStaff}
                />
              </section>
            ) : null}

            <section
              id="time-off"
              className={styles.sectionBlock}
              aria-labelledby="timeoff-heading"
            >
              <div className={styles.sectionHeadingRow}>
                <h2 id="timeoff-heading" className={styles.sectionTitle}>
                  Time off
                </h2>
                <span className={styles.panelMeta}>
                  {timeOff.length} scheduled · {business.timezone}
                </span>
              </div>

              <div className={styles.restPanel}>
                {timeOff.length > 0 ? (
                  <ul className={styles.list}>
                    {timeOff.map((entry) => {
                      const staffName =
                        staffNameById.get(entry.staff_id) ?? "Staff member";
                      const canRemoveEntry =
                        canManage || (ownStaff !== null && entry.staff_id === ownStaff.id);

                      return (
                        <li key={entry.id} className={styles.listItem}>
                          <div className={styles.itemColumn}>
                            <span className={styles.itemName}>{staffName}</span>
                            <span className={styles.itemSubmeta}>
                              {formatTimeOffPeriod(entry.period, business.timezone)}
                            </span>
                            {entry.reason ? (
                              <span className={styles.itemSubmeta}>{entry.reason}</span>
                            ) : null}
                          </div>

                          {canRemoveEntry ? (
                            <InlineActionButton
                              actionName="deleteTimeOff"
                              fields={{
                                businessId: business.id,
                                timeOffId: entry.id,
                              }}
                              label="Remove"
                              pendingLabel="Removing..."
                              ariaLabel={`Remove time off for ${staffName}`}
                              variant="danger"
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className={styles.emptyNote}>No upcoming time off scheduled.</p>
                )}
              </div>

              {canManage && staff.length > 0 ? (
                <AddTimeOffForm
                  businessId={business.id}
                  timezone={business.timezone}
                  staff={staff}
                />
              ) : ownStaff ? (
                <AddTimeOffForm
                  businessId={business.id}
                  timezone={business.timezone}
                  staff={staff}
                  fixedStaffId={ownStaff.id}
                  fixedStaffName={ownStaff.display_name}
                />
              ) : !canManage ? (
                <div className={styles.restPanel}>
                  <p className={styles.emptyNote}>
                    No staff profile is linked to your account yet. Ask an owner to link your
                    account before adding time off.
                  </p>
                </div>
              ) : null}
            </section>

            <section
              id="billing"
              className={styles.sectionBlock}
              aria-labelledby="billing-heading"
            >
              <div className={styles.sectionHeadingRow}>
                <h2 id="billing-heading" className={styles.sectionTitle}>
                  Plan &amp; billing
                </h2>
                <span className={styles.panelMeta}>
                  {planUsage.planTier === "pro" ? "Pro · $19/mo" : "Free · $0/mo"}
                </span>
              </div>

              <BillingPlanPanel
                businessId={business.id}
                timezone={business.timezone}
                isOwner={isOwner}
                planUsage={planUsage}
                billingNotice={billingNotice}
              />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function DashboardFallback() {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-hidden="true">
        <div className={styles.sidebarTop}>
          <span className={styles.wordmark}>Tendly</span>
        </div>
      </aside>
      <main className={styles.main}>
        <div className={styles.restPanel}>
          <div className={styles.metricBody}>
            <p className={styles.metricLabel}>Loading dashboard…</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string | string[] }>;
}) {
  return (
    <div className={styles.page}>
      <Suspense fallback={<DashboardFallback />}>
        <DashboardContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  );
}
