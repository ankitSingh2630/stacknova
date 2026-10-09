"use client";

import Link from "next/link";
import { useState } from "react";
import { useLeads } from "./LeadsProvider";
import LeadsState from "./LeadsState";
import AdminIcon from "./AdminIcon";
import StatusBadge from "./StatusBadge";
import { dateLabel, leadHref } from "@/lib/admin/format";
import { batchNotice, leadStatistics } from "@/lib/admin/leads";
import styles from "@/app/admin/admin.module.css";

export default function Dashboard() {
  const { leads, total, loading, error, refreshLeads } = useLeads();
  const [review, setReview] = useState(false);
  const priority = leads.filter(lead => !["Closed", "Converted"].includes(lead.status));
  const recent = review ? priority : leads.slice(0, 3);
  const statistics = leadStatistics(leads);
  const metrics = [
    { label: "Total", value: statistics.total, icon: "user" as const },
    { label: "New", value: statistics.New, icon: "mail" as const },
    { label: "Contacted", value: statistics.Contacted, icon: "phone" as const },
    { label: "In Progress", value: statistics["In Progress"], icon: "clock" as const },
    { label: "Converted", value: statistics.Converted, icon: "check" as const },
    { label: "Closed", value: statistics.Closed, icon: "close" as const },
  ];
  if (loading || error || !leads.length) return <main className={styles.page}><h1 className={styles.title}>Dashboard</h1><LeadsState loading={loading} error={error} onRetry={refreshLeads} />{!loading && !error && <button className={styles.secondaryButton} onClick={() => void refreshLeads()}>Refresh leads</button>}</main>;
  return <main className={styles.page}>
    <div className={styles.pageHeader}><div><h1 className={styles.title}>Dashboard</h1><p className={styles.subtitle}>Overview of your latest enquiries and lead activity.</p></div><button className={styles.textLink} onClick={() => void refreshLeads()}>Refresh leads</button></div>
    {batchNotice(leads.length, total) && <p className={styles.batchNotice}>{batchNotice(leads.length, total)}</p>}
    <div className={styles.metrics}>{metrics.map(metric => <div className={styles.metric} key={metric.label} data-accent={metric.label === "New"}><div className={styles.metricHeader}><span>{metric.label}</span><AdminIcon name={metric.icon} size={16} /></div><p className={styles.metricValue}>{metric.value}</p></div>)}</div>
    <section aria-labelledby="recent-heading">
      <div className={styles.sectionHeader}><h2 id="recent-heading" className={styles.sectionTitle}>{review ? "Open Leads" : "Recent Leads"}<span className={styles.count}>{recent.length}</span></h2><Link href="/admin/leads/" className={styles.textLink}>View all<AdminIcon name="arrow" size={14} /></Link></div>
      <div className={styles.recentList}>{recent.map(lead => <Link href={leadHref(lead.id)} className={styles.recentRow} key={lead.id}>
        <span className={styles.initials}>{lead.name.split(" ").map(part => part[0]).join("")}</span>
        <div className={styles.recentInfo}><h3 className={styles.leadName}>{lead.name}</h3><p className={styles.secondary}>{lead.service}</p></div>
        <div className={styles.recentMeta}><StatusBadge status={lead.status} /><time className={styles.date} dateTime={lead.createdAt}>{dateLabel(lead.createdAt)}</time></div><AdminIcon name="chevron" style={{ transform: "rotate(-90deg)" }} size={14} />
      </Link>)}</div>
      {!recent.length && <p className={styles.empty}>No leads require follow-up.</p>}
    </section>
    <div className={styles.priority}><span className={styles.priorityIcon}><AdminIcon name="bolt" /></span><div><h3>Open Pipeline</h3><p className={styles.secondary}>{priority.length} open leads in the loaded batch</p></div><button className={styles.primaryButton} onClick={() => setReview(value => !value)} aria-pressed={review}>{review ? "Show recent" : "Review"}</button></div>
    <p className={styles.demoHint}>Read-only lead workspace.</p>
  </main>;
}
