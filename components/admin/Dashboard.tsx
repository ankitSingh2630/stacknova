"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLeads } from "./LeadsProvider";
import LeadsState from "./LeadsState";
import AdminIcon from "./AdminIcon";
import StatusBadge from "./StatusBadge";
import { dateLabel, leadHref } from "@/lib/admin/format";
import styles from "@/app/admin/admin.module.css";

export default function Dashboard() {
  const { dashboard, ensureDashboard, refreshDashboard, hasPendingMutations } = useLeads();
  useEffect(() => { void ensureDashboard(); }, [ensureDashboard]);
  const refresh = refreshDashboard;
  const { summary, loading, error } = dashboard;
  if (!summary || error) return <main className={styles.page}><h1 className={styles.title}>Dashboard</h1><LeadsState loading={!error} error={error} onRetry={refresh} /></main>;
  const recent = summary.recent;
  const statistics = { total: summary.total, ...summary.counts };
  const metrics = [
    { label: "Total", value: statistics.total, icon: "user" as const },
    { label: "New", value: statistics.New, icon: "mail" as const },
    { label: "Contacted", value: statistics.Contacted, icon: "phone" as const },
    { label: "In Progress", value: statistics["In Progress"], icon: "clock" as const },
    { label: "Converted", value: statistics.Converted, icon: "check" as const },
    { label: "Closed", value: statistics.Closed, icon: "close" as const },
  ];
  return <main className={styles.page}>
    <div className={styles.pageHeader}><div><h1 className={styles.title}>Dashboard</h1><p className={styles.subtitle}>Overview of your active enquiries and lead activity.</p></div><button className={styles.textLink} disabled={hasPendingMutations || loading} onClick={() => void refresh()}>Refresh leads</button></div>
    {summary.warning && <p className={styles.batchNotice}>{summary.warning}</p>}
    {loading && <p className={styles.queryNotice} role="status">Updating dashboard… Previous figures are shown until the queries complete.</p>}
    <div className={styles.metrics} aria-busy={loading}>{metrics.map(metric => <div className={styles.metric} key={metric.label} data-accent={metric.label === "New"}><div className={styles.metricHeader}><span>{metric.label}</span><AdminIcon name={metric.icon} size={16} /></div><p className={styles.metricValue}>{metric.value}</p></div>)}</div>
    <section aria-labelledby="recent-heading">
      <div className={styles.sectionHeader}><h2 id="recent-heading" className={styles.sectionTitle}>Recent Leads<span className={styles.count}>{recent.length}</span></h2><Link href="/admin/leads/" className={styles.textLink}>View all<AdminIcon name="arrow" size={14} /></Link></div>
      <div className={styles.recentList}>{recent.map(lead => <Link href={leadHref(lead.id)} className={styles.recentRow} key={lead.id}>
        <span className={styles.initials}>{lead.name.split(" ").map(part => part[0]).join("")}</span>
        <div className={styles.recentInfo}><h3 className={styles.leadName}>{lead.name}</h3><p className={styles.secondary}>{lead.service}</p></div>
        <div className={styles.recentMeta}><StatusBadge status={lead.status} /><time className={styles.date} dateTime={lead.createdAt}>{dateLabel(lead.createdAt)}</time></div><AdminIcon name="chevron" style={{ transform: "rotate(-90deg)" }} size={14} />
      </Link>)}</div>
      {!recent.length && <p className={styles.empty}>No leads found.</p>}
    </section>
    <p className={styles.demoHint}>Open a lead to manage its status, notes, or permanently delete it.</p>
  </main>;
}
