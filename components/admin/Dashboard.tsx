"use client";

import Link from "next/link";
import { useState } from "react";
import { useMockLeads } from "./MockLeadsProvider";
import AdminIcon from "./AdminIcon";
import StatusBadge from "./StatusBadge";
import { dateLabel, demoToday, leadHref } from "@/lib/admin/mock-data";
import styles from "@/app/admin/admin.module.css";

export default function Dashboard() {
  const { leads } = useMockLeads();
  const [review, setReview] = useState(false);
  const priority = leads.filter(lead => lead.priority && !["Closed", "Converted"].includes(lead.status));
  const recent = review ? priority : leads.slice(0, 3);
  const metrics = [
    { label: "Total", value: leads.length, icon: "user" as const },
    { label: "New", value: leads.filter(l => l.status === "New").length, icon: "mail" as const },
    { label: "Contacted", value: leads.filter(l => l.status === "Contacted").length, icon: "phone" as const },
    { label: "In Progress", value: leads.filter(l => l.status === "In Progress").length, icon: "clock" as const },
    { label: "Converted", value: leads.filter(l => l.status === "Converted").length, icon: "check" as const },
  ];
  return <main className={styles.page}>
    <div className={styles.pageHeader}><div><h1 className={styles.title}>Dashboard</h1><p className={styles.subtitle}>Overview of your latest enquiries and lead activity.</p></div><span className={styles.live}><span className={styles.dot} />Demo sync</span></div>
    <div className={styles.metrics}>{metrics.map(metric => <div className={styles.metric} key={metric.label} data-accent={metric.label === "New"}><div className={styles.metricHeader}><span>{metric.label}</span><AdminIcon name={metric.icon} size={16} /></div><p className={styles.metricValue}>{metric.value}</p></div>)}</div>
    <section aria-labelledby="recent-heading">
      <div className={styles.sectionHeader}><h2 id="recent-heading" className={styles.sectionTitle}>{review ? "Priority Leads" : "Recent Leads"}<span className={styles.count}>{recent.length}</span></h2><Link href="/admin/leads/" className={styles.textLink}>View all<AdminIcon name="arrow" size={14} /></Link></div>
      <div className={styles.recentList}>{recent.map(lead => <Link href={leadHref(lead.id)} className={styles.recentRow} key={lead.id}>
        <span className={styles.initials}>{lead.name.split(" ").map(part => part[0]).join("")}</span>
        <div className={styles.recentInfo}><h3 className={styles.leadName}>{lead.name}</h3><p className={styles.secondary}>{lead.service}</p></div>
        <div className={styles.recentMeta}><StatusBadge status={lead.status} /><p className={styles.date}>{lead.submittedAt.startsWith(demoToday) ? "Today" : lead.submittedAt.startsWith("2026-10-06") ? "Yesterday" : dateLabel(lead.submittedAt)}</p></div><AdminIcon name="chevron" style={{ transform: "rotate(-90deg)" }} size={14} />
      </Link>)}</div>
      {!recent.length && <p className={styles.empty}>No leads require follow-up.</p>}
    </section>
    <div className={styles.priority}><span className={styles.priorityIcon}><AdminIcon name="bolt" /></span><div><h3>Priority Pipeline</h3><p className={styles.secondary}>{priority.length} leads require immediate follow-up</p></div><button className={styles.primaryButton} onClick={() => setReview(value => !value)} aria-pressed={review}>{review ? "Show recent" : "Review"}</button></div>
    <p className={styles.demoHint}>UI demo · Mock snapshot: Oct 07, 2026 · Changes reset on reload.</p>
  </main>;
}
