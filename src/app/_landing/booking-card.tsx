"use client";

import Image from "next/image";
import { useId, useState } from "react";

import type { Day } from "@/lib/demo-days";

import styles from "./landing.module.css";

// Demo data for the fictional Northside Barbers. The live booking flow (real
// available_slots + create_booking) replaces these lists in the public booking stage.
const services = [
  { id: "haircut", name: "Haircut", minutes: 30, price: 35 },
  { id: "beard-trim", name: "Beard trim", minutes: 20, price: 20 },
  { id: "cut-beard", name: "Cut & beard", minutes: 50, price: 50 },
] as const;

const barbers = [
  { id: "andriy", name: "Andriy", photo: "/plates/avatar-andriy.png" },
  { id: "marta", name: "Marta", photo: "/plates/avatar-marta.png" },
  { id: "sam", name: "Sam", photo: "/plates/avatar-sam.png" },
  { id: "anyone", name: "Anyone", photo: "/plates/avatar-anyone.png" },
] as const;

const times = ["10:00", "10:30", "11:30", "13:00", "14:30"] as const;


export function BookingCard({ days }: { days: Day[] }) {
  const uid = useId();
  const [service, setService] = useState<string | null>(null);
  const [barber, setBarber] = useState<string | null>(null);
  const [pickedDay, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string>("10:30");
  const [status, setStatus] = useState("");
  const day = pickedDay ?? days[0]?.key ?? null;

  function book(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service) {
      setStatus("Choose a service first.");
      return;
    }
    setStatus(`Live booking opens with the public booking page. You picked ${time}.`);
  }

  return (
    <form className={styles.card} onSubmit={book} aria-labelledby={`${uid}-title`}>
      <div className={styles.cardHead}>
        <h2 id={`${uid}-title`} className={styles.cardTitle}>
          Northside Barbers
        </h2>
        <span className={styles.demoTag}>Demo business, fictional</span>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.column} role="radiogroup" aria-labelledby={`${uid}-services`}>
          <span id={`${uid}-services`} className={styles.columnLabel}>
            Services
          </span>
          {services.map((s) => (
            <label key={s.id} className={`${styles.option} ${styles.service}`}>
              <input
                type="radio"
                name="service"
                value={s.id}
                checked={service === s.id}
                onChange={() => setService(s.id)}
              />
              <span className={styles.serviceName}>{s.name}</span>
              <span className={styles.serviceMeta}>
                {s.minutes} min • ${s.price}
              </span>
            </label>
          ))}
        </div>

        <div className={styles.column} role="radiogroup" aria-labelledby={`${uid}-barber`}>
          <span id={`${uid}-barber`} className={styles.columnLabel}>
            Barber
          </span>
          <div className={styles.barbers}>
          {barbers.map((b) => (
            <label key={b.id} className={`${styles.option} ${styles.barber}`}>
              <input
                type="radio"
                name="barber"
                value={b.id}
                checked={barber === b.id}
                onChange={() => setBarber(b.id)}
              />
              <span className={styles.avatar} data-barber={b.id}>
                <Image src={b.photo} alt="" width={128} height={128} sizes="64px" />
              </span>
              {b.name}
            </label>
          ))}
          </div>
        </div>

        <div className={styles.column} role="radiogroup" aria-labelledby={`${uid}-date`}>
          <span id={`${uid}-date`} className={styles.columnLabel}>
            Date
          </span>
          <div className={styles.days}>
            {days.map((d) => (
              <label key={d.key} className={`${styles.option} ${styles.day}`}>
                <input
                  type="radio"
                  name="day"
                  value={d.key}
                  checked={day === d.key}
                  onChange={() => setDay(d.key)}
                />
                <span className={styles.dayName}>{d.weekday}</span>
                <span className={styles.dayNumber}>{d.date}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.column} role="radiogroup" aria-labelledby={`${uid}-time`}>
          <span id={`${uid}-time`} className={styles.columnLabel}>
            Time
          </span>
          <div className={styles.slots}>
            {times.map((t) => (
              <label key={t} className={`${styles.option} ${styles.slot}`}>
                <input type="radio" name="time" value={t} checked={time === t} onChange={() => setTime(t)} />
                {t}
              </label>
            ))}
          </div>
          <button type="submit" className={styles.book}>
            Book {time}
          </button>
          <p className={styles.status} role="status" aria-live="polite">
            {status}
          </p>
        </div>
      </div>
    </form>
  );
}
