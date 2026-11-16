"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { enterDemoAction } from "@/app/demo/[role]/actions";

import styles from "./landing.module.css";

type RoleId = "owner" | "manager" | "staff";

type RoleConfig = {
  id: RoleId;
  name: string;
  badge: string;
  description: string;
  avatar: string;
  barberName: string;
  permissionsLabel: string;
  highlights: readonly { label: string; value: string }[];
  scheduleRows: readonly { day: string; time: string; detail: string }[];
};

const ROLES: readonly RoleConfig[] = [
  {
    id: "owner",
    name: "Owner",
    badge: "Full access",
    description: "Billing, settings, the whole team",
    avatar: "/plates/avatar-andriy.png",
    barberName: "Andriy",
    permissionsLabel: "Shop owner · Stripe billing & team invites",
    highlights: [
      { label: "Booking page", value: "/b/northside-barbers" },
      { label: "Starting plan", value: "Free · 3/3 chairs" },
      { label: "Team invites", value: "Manager & staff links" },
    ],
    scheduleRows: [
      { day: "Tue 10:30", time: "Andriy", detail: "Haircut · 30 min" },
      { day: "Tue 11:00", time: "Marta", detail: "Beard trim · 20 min" },
      { day: "Tue 13:30", time: "Sam", detail: "Cut & beard · 50 min" },
    ],
  },
  {
    id: "manager",
    name: "Manager",
    badge: "Shop ops",
    description: "Schedules, services, every booking",
    avatar: "/plates/avatar-marta.png",
    barberName: "Marta",
    permissionsLabel: "Shop manager · Services & all chair hours",
    highlights: [
      { label: "Services", value: "3 active services" },
      { label: "Chairs open", value: "3 active schedules" },
      { label: "Billing settings", value: "Restricted to owner" },
    ],
    scheduleRows: [
      { day: "Mon–Fri", time: "09:00–17:00", detail: "Marta · Chair 2" },
      { day: "Tue–Sat", time: "10:00–18:00", detail: "Sam · Chair 3" },
      { day: "Thu", time: "12:00–14:00", detail: "Time off block · Marta" },
    ],
  },
  {
    id: "staff",
    name: "Staff",
    badge: "Personal chair",
    description: "Own schedule and own bookings only",
    avatar: "/plates/avatar-sam.png",
    barberName: "Sam",
    permissionsLabel: "Barber · Own bookings & own time off",
    highlights: [
      { label: "Chair view", value: "Sam's schedule only" },
      { label: "Telegram alerts", value: "Active for Sam" },
      { label: "Time off", value: "Can add & remove own" },
    ],
    scheduleRows: [
      { day: "Tue 10:30", time: "Haircut", detail: "30 min · Confirmed" },
      { day: "Tue 11:30", time: "Beard trim", detail: "20 min · Confirmed" },
      { day: "Fri", time: "09:00–12:00", detail: "Doctor visit · Time off" },
    ],
  },
] as const;

export function RoleSwitcher() {
  const [selectedRole, setSelectedRole] = useState<RoleId>("owner");
  const active = ROLES.find((role) => role.id === selectedRole) ?? ROLES[0];
  const otherRoles = ROLES.filter((role) => role.id !== active.id);

  return (
    <div className={styles.roleSwitcher}>
      <div className={styles.roleTabs} role="group" aria-label="Dashboard role preview">
        {ROLES.map((role) => {
          const isSelected = role.id === active.id;
          return (
            <button
              key={role.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedRole(role.id)}
              className={`${styles.roleTab} ${isSelected ? styles.roleTabActive : ""}`}
            >
              <span className={styles.roleTabText}>
                <span className={styles.roleTabTop}>
                  <span className={styles.roleName}>{role.name}</span>
                  <span className={styles.roleBadge}>{role.badge}</span>
                </span>
                <span className={styles.roleWhat}>{role.description}</span>
              </span>
              <span className={styles.roleAvatar}>
                <Image src={role.avatar} alt="" width={96} height={96} sizes="48px" />
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.rolePreviewCard} aria-live="polite">
        <div className={styles.rolePreviewFrame}>
          <div className={styles.miniRail}>
            <span className={styles.miniShopName}>Northside Barbers</span>
            <span className={styles.miniRolePill}>{active.name}</span>
            <ul className={styles.miniNavList} aria-hidden="true">
              <li className={styles.miniNavActive}>Appointments</li>
              <li>Services</li>
              <li>{active.id === "staff" ? "My hours" : "Team schedule"}</li>
              <li>Time off</li>
            </ul>
            <span className={styles.miniDemoNote}>Fictional demo data</span>
          </div>

          <div className={styles.miniMain}>
            <div className={styles.miniHeader}>
              <div>
                <p className={styles.miniHeading}>{active.barberName} · {active.name} workspace</p>
                <p className={styles.miniSubheading}>{active.permissionsLabel}</p>
              </div>
              <span className={styles.miniZoneTag}>Europe/Kyiv</span>
            </div>

            <div className={styles.miniHighlights}>
              {active.highlights.map((item) => (
                <div key={item.label} className={styles.miniStat}>
                  <span className={styles.miniStatLabel}>{item.label}</span>
                  <span className={styles.miniStatValue}>{item.value}</span>
                </div>
              ))}
            </div>

            <ul className={styles.miniScheduleList}>
              {active.scheduleRows.map((row) => (
                <li key={`${row.day}-${row.time}`} className={styles.miniScheduleRow}>
                  <span className={styles.miniScheduleDay}>{row.day}</span>
                  <span className={styles.miniScheduleTime}>{row.time}</span>
                  <span className={styles.miniScheduleDetail}>{row.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.rolePreviewActions}>
          <form action={enterDemoAction}>
            <input type="hidden" name="role" value={active.id} />
            <button type="submit" className={styles.rolePrimaryCta}>
              Enter demo as {active.name}
              <ArrowRight className={styles.roleArrow} aria-hidden="true" strokeWidth={1.5} />
            </button>
          </form>

          <p className={styles.roleQuickLinks}>
            Direct demo sign-in:{" "}
            {otherRoles.map((role, index) => (
              <span key={role.id}>
                {index > 0 ? " · " : ""}
                <form action={enterDemoAction} className={styles.roleInlineForm}>
                  <input type="hidden" name="role" value={role.id} />
                  <button type="submit" className={styles.roleInlineLink}>
                    {role.name}
                  </button>
                </form>
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}
