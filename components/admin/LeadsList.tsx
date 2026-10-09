"use client";

import Link from "next/link";
import { useState } from "react";
import { useLeads } from "./LeadsProvider";
import LeadsState from "./LeadsState";
import AdminIcon from "./AdminIcon";
import StatusBadge from "./StatusBadge";
import { dateLabel, leadHref, matchesDate } from "@/lib/admin/format";
import { batchNotice } from "@/lib/admin/leads";
import { leadStatuses } from "@/lib/admin/types";
import styles from "@/app/admin/admin.module.css";

export default function LeadsList() {
  const { leads, total, loading, error, refreshLeads } = useLeads();
  const services = Array.from(new Set(leads.map(lead => lead.service))).sort();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const query = search.trim().toLowerCase();
  const filtered = leads.filter(lead => (!query || [lead.name, lead.email, lead.phone, lead.company].some(value => value.toLowerCase().includes(query))) && (!status || lead.status === status) && (!service || lead.service === service) && matchesDate(lead.createdAt, date));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 5));
  const activePage = Math.min(page, pageCount);
  const visible = filtered.slice((activePage - 1) * 5, activePage * 5);
  const pageNumbers = Array.from(new Set([1, activePage - 1, activePage, activePage + 1, activePage + 2, pageCount])).filter(n => n > 0 && n <= pageCount).sort((a, b) => a - b);
  const reset = () => { setSearch(""); setStatus(""); setService(""); setDate(""); setPage(1); };
  if (loading || error) return <main className={styles.page}><h1 className={styles.listTitle}>Incoming Pipeline</h1><LeadsState loading={loading} error={error} onRetry={refreshLeads} /></main>;
  return <main className={styles.page + " " + styles.listPage}>
    <div className={styles.pageHeader}><div><h1 className={styles.listTitle}>Incoming Pipeline</h1><p className={styles.subtitle}>View incoming enquiries and client opportunities.</p></div><button className={styles.textLink} onClick={() => void refreshLeads()}>Refresh leads</button></div>
    {batchNotice(leads.length, total) && <p className={styles.batchNotice}>{batchNotice(leads.length, total)}</p>}
    <div className={styles.searchBox}><AdminIcon name="search" size={16} /><input type="search" aria-label="Search leads by name, email, phone or company" className={styles.search} placeholder="Search name, email, phone or company…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div>
    <div className={styles.filterBar}>
      <select aria-label="Filter by status" className={styles.filter} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Status</option>{leadStatuses.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter by service" className={styles.filter} value={service} onChange={event => { setService(event.target.value); setPage(1); }}><option value="">Service</option>{services.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter by submitted date" className={styles.filter} value={date} onChange={event => { setDate(event.target.value); setPage(1); }}><option value="">Date</option><option value="today">Today</option><option value="week">Last 7 days</option></select>
      {(search || status || service || date) && <button className={styles.filterReset} onClick={reset}>Clear</button>}
      <span className={styles.filterTotal} aria-live="polite">{filtered.length} leads</span>
    </div>
    {filtered.length ? <>
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
      <nav className={styles.pagination} aria-label="Lead list pagination"><p aria-live="polite">Showing {visible.length} of {filtered.length} leads</p><div className={styles.pageButtons}>
        <button className={styles.pageButton} aria-label="Previous page" disabled={activePage === 1} onClick={() => setPage(activePage - 1)}><AdminIcon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /></button>
        {pageNumbers.map((number, index) => <span key={number} style={{ display: "contents" }}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true">…</span>}<button className={styles.pageButton} aria-label={"Page " + number} aria-current={activePage === number ? "page" : undefined} onClick={() => setPage(number)}>{number}</button></span>)}
        <button className={styles.pageButton} aria-label="Next page" disabled={activePage === pageCount} onClick={() => setPage(activePage + 1)}><AdminIcon name="chevron" size={16} style={{ transform: "rotate(-90deg)" }} /></button>
      </div></nav>
    </> : <div className={styles.empty}><h2>No leads found</h2><p>Try a different search or clear your filters.</p><button className={styles.secondaryButton} onClick={reset}>Clear filters</button></div>}
    <p className={styles.demoHint}>Read-only lead workspace.</p>
  </main>;
}
