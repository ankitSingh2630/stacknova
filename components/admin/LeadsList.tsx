"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLeads } from "./LeadsProvider";
import LeadsState from "./LeadsState";
import AdminIcon from "./AdminIcon";
import StatusBadge from "./StatusBadge";
import { dateLabel, leadHref } from "@/lib/admin/format";
import { leadServices, totalPages } from "@/lib/admin/lead-queries";
import { leadStatuses } from "@/lib/admin/types";
import styles from "@/app/admin/admin.module.css";

export default function LeadsList() {
  const { leads: visible, total, loading, initialized, error, warning, refreshLeads, ensureList, hasPendingMutations, notice,
    query, appliedQuery, searchDraft, searchPending, pageSize, setSearch, setFilters, setPage, clearFilters } = useLeads();
  useEffect(() => { void ensureList(); }, [ensureList]);
  const pageCount = Math.max(1, totalPages(total));
  const activePage = appliedQuery.page;
  const busy = loading || searchPending || hasPendingMutations;
  const hasFilters = Boolean(query.search || query.status || query.service || query.date);
  const pageNumbers = Array.from(new Set([1, activePage - 1, activePage, activePage + 1, activePage + 2, pageCount])).filter(n => n > 0 && n <= pageCount).sort((a, b) => a - b);
  if (!initialized) return <main className={styles.page}><h1 className={styles.listTitle}>Incoming Pipeline</h1><LeadsState loading error="" onRetry={refreshLeads} /></main>;
  return <main className={styles.page + " " + styles.listPage}>
    <div className={styles.pageHeader}><div><h1 className={styles.listTitle}>Incoming Pipeline</h1><p className={styles.subtitle}>View incoming enquiries and client opportunities.</p></div><button className={styles.textLink} disabled={busy} onClick={() => void refreshLeads()}>Refresh leads</button></div>
    {notice && <p className={styles.feedback} role="status" aria-live="polite">{notice}</p>}
    {warning && <p className={styles.batchNotice}>{warning}</p>}
    <div className={styles.searchBox}><AdminIcon name="search" size={16} /><input type="search" maxLength={200} aria-label="Search leads by name, email, phone or company" className={styles.search} placeholder="Search name, email, phone or company…" value={searchDraft} onChange={event => setSearch(event.target.value)} /></div>
    <div className={styles.filterBar}>
      <select aria-label="Filter by status" className={styles.filter} disabled={hasPendingMutations} value={query.status} onChange={event => setFilters({ status: event.target.value as typeof query.status })}><option value="">All Status</option>{leadStatuses.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter by service" className={styles.filter} disabled={hasPendingMutations} value={query.service} onChange={event => setFilters({ service: event.target.value })}><option value="">All Services</option>{leadServices.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter by submitted date" className={styles.filter} disabled={hasPendingMutations} value={query.date} onChange={event => setFilters({ date: event.target.value as typeof query.date })}><option value="">All Time</option><option value="today">Today</option><option value="week">Last 7 Days</option></select>
      {(hasFilters || searchDraft) && <button className={styles.filterReset} onClick={clearFilters}>Clear</button>}
      <span className={styles.filterTotal} aria-live="polite">{error ? "" : `${total} leads`}</span>
    </div>
    {(loading || searchPending) && <p className={styles.queryNotice} role="status">Updating results… Previous results are shown until the query completes.</p>}
    {error ? <LeadsState loading={false} error={error} onRetry={refreshLeads} /> : visible.length ? <div aria-busy={loading || searchPending}>
      <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">Incoming leads</caption><thead><tr><th scope="col">Lead / Company</th><th scope="col">Service / Contact</th><th scope="col">Status</th><th scope="col">Submitted</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(lead => <tr key={lead.id}>
        <td><Link href={leadHref(lead.id)} className={styles.leadName}>{lead.name}</Link><p className={styles.secondary}>{lead.company}</p></td>
        <td><p>{lead.service}</p><p className={styles.secondary}>{lead.email} · {lead.phone}</p></td>
        <td><StatusBadge status={lead.status} /></td><td className={styles.secondary}>{dateLabel(lead.createdAt)}</td><td><Link href={leadHref(lead.id)} className={styles.iconButton} aria-label={"View " + lead.name}><AdminIcon name="arrow" /></Link></td>
      </tr>)}</tbody></table></div>
      <div className={styles.leadCards}>{visible.map(lead => <Link href={leadHref(lead.id)} className={styles.leadCard} key={lead.id} aria-label={"View " + lead.name + ", " + lead.status}>
        <div className={styles.cardHeading}><h2 className={styles.leadName}>{lead.name}</h2><StatusBadge status={lead.status} /></div>
        <div className={styles.cardContact}><p><AdminIcon name={lead.service === "Cloud Architecture" ? "cloud" : lead.service === "Mobile App Development" ? "phone" : "code"} size={14} />{lead.service}</p><p><AdminIcon name="user" size={13} />{lead.email}</p><p><AdminIcon name="phone" size={13} />{lead.phone}</p></div>
        <div className={styles.cardFooter}><time className={styles.date} dateTime={lead.createdAt}>{dateLabel(lead.createdAt)}</time><span className={styles.cardArrow}><AdminIcon name="arrow" size={17} /></span></div>
      </Link>)}</div>
      <nav className={styles.pagination} aria-label="Lead list pagination"><p aria-live="polite">Showing {(activePage - 1) * pageSize + 1}–{(activePage - 1) * pageSize + visible.length} of {total} leads</p><div className={styles.pageButtons}>
        <button className={styles.pageButton} aria-label="Previous page" disabled={busy || activePage === 1} onClick={() => setPage(activePage - 1)}><AdminIcon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /></button>
        {pageNumbers.map((number, index) => <span key={number} style={{ display: "contents" }}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true">…</span>}<button className={styles.pageButton} disabled={busy} aria-label={"Page " + number} aria-current={activePage === number ? "page" : undefined} onClick={() => setPage(number)}>{number}</button></span>)}
        <button className={styles.pageButton} aria-label="Next page" disabled={busy || activePage === pageCount} onClick={() => setPage(activePage + 1)}><AdminIcon name="chevron" size={16} style={{ transform: "rotate(-90deg)" }} /></button>
      </div></nav>
    </div> : <div className={styles.empty}><h2>{loading || searchPending ? "Updating results…" : hasFilters ? "No leads match your search or filters." : "No leads found."}</h2>{hasFilters && <button className={styles.secondaryButton} onClick={clearFilters}>Clear filters</button>}</div>}
    <p className={styles.demoHint}>Open a lead to manage its status, notes, or archive it.</p>
  </main>;
}
